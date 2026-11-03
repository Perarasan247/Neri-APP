/**
 * Server sync for the widget: replay queued taps, then pull a fresh snapshot.
 *
 * Runs both inside the app and in the widget's headless JS task (when the app
 * is closed), so it only uses plain API calls, never React Query.
 */
import { ApiError } from '@/api/client';
import * as api from '@/api/endpoints';
import type { Todo, TodayData } from '@/api/types';
import { loadApiUrlOverride } from '@/lib/config';
import { loadProfile } from '@/lib/onboarded';
import { formatTime, setAppTimeZone, today } from '@/lib/format';

import {
  applyAction,
  applyQueue,
  readQueue,
  readSnapshot,
  renameHabit,
  serial,
  writeQueue,
  writeSnapshot,
  type WidgetAction,
  type WidgetActionInput,
  type WidgetSnapshot,
  type WidgetTask,
} from './store';

/** The widget only draws the first rows of a list (see MAX_ROWS); keep a little headroom for ticks. */
const INBOX_LIMIT = 60;

let configLoaded: Promise<void> | null = null;
/** The headless task starts without the app's startup work, so load the saved server URL once. */
const ensureConfig = () => (configLoaded ??= loadApiUrlOverride());

const isAuthError = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

/** A 4xx the server will never accept (deleted habit, bad id): drop the action instead of retrying forever. */
const isPermanent = (e: unknown) =>
  e instanceof ApiError && !e.isNetwork && e.status >= 400 && e.status < 500 && ![401, 403, 408, 429].includes(e.status);

/* ---------- Snapshot from the server ---------- */

function toTask(t: Todo): WidgetTask {
  const time = formatTime(t.start_time ?? t.due_time);
  return {
    id: t.id,
    title: t.title,
    date: t.due_date ?? null,
    time: t.is_all_day || !time ? null : time,
    priority: t.priority,
    done: t.status === 'completed',
  };
}

/** By planned day, then time ("HH:MM" sorts as text); unscheduled tasks last. */
const byDate = (a: Todo, b: Todo) =>
  (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
  (a.start_time ?? a.due_time ?? '99').localeCompare(b.start_time ?? b.due_time ?? '99');

function habitsFrom(data: TodayData) {
  return data.items
    .filter((i) => i.is_applicable !== false && !i.is_skipped)
    .map((i) => ({
      id: i.habit.id,
      name: i.habit.name,
      color: i.habit.color,
      type: i.habit.type,
      done: i.status === 'done',
      count: i.count,
      target: i.habit.type === 'build_count' ? i.daily_target || 1 : null,
      streak: i.current_streak,
      streakUnit: i.streak_unit ?? 'day',
      opensApp: i.habit.type === 'avoid_count' || Boolean(i.habit.metric_label),
    }));
}

const signedOutSnapshot = (prev: WidgetSnapshot | null): WidgetSnapshot => ({
  date: prev?.date ?? today(),
  timezone: prev?.timezone ?? 'Asia/Kolkata',
  signedOut: true,
  isRestDay: false,
  overallStreak: 0,
  habits: [],
  today: [],
  inbox: [],
  syncedAt: Date.now(),
});

async function fetchSnapshot(prev: WidgetSnapshot | null): Promise<WidgetSnapshot> {
  await ensureConfig();

  let timezone = prev && !prev.signedOut ? prev.timezone : null;
  if (!timezone) {
    const profile = await loadProfile();
    if (!profile) return signedOutSnapshot(prev); // not onboarded yet
    timezone = profile.timezone;
  }
  setAppTimeZone(timezone);
  const date = today(timezone);

  const [todayData, planned, overdue, pending] = await Promise.all([
    api.getTodayData(date),
    api.getTodos({ start_date: date, end_date: date, sort_by: 'smart' }),
    api.getTodos({ view: 'overdue', sort_by: 'smart' }),
    api.getTodos({ view: 'pending' }),
  ]);

  const open = (t: Todo) => t.status !== 'cancelled';
  const seen = new Set<string>();
  const todayTasks = [...overdue.filter((t) => t.status === 'pending'), ...planned.filter(open)]
    .filter((t) => !seen.has(t.id) && Boolean(seen.add(t.id)))
    .map(toTask);

  return {
    date: todayData.date,
    timezone,
    signedOut: false,
    isRestDay: todayData.is_whole_day_skip,
    overallStreak: todayData.overall_streak,
    habits: habitsFrom(todayData),
    today: todayTasks,
    inbox: pending
      .filter((t) => t.status === 'pending')
      .sort(byDate)
      .slice(0, INBOX_LIMIT)
      .map(toTask),
    syncedAt: Date.now(),
  };
}

/* ---------- Pending taps ---------- */

/** Sends one queued action. Resolves to the new habit's id for `habit_create`. */
async function send(a: WidgetAction): Promise<string | void> {
  switch (a.kind) {
    case 'habit_set':
      await api.upsertLog({ habit_id: a.habitId, log_date: a.date, count: a.done ? 1 : 0, status: 'done' });
      return;
    case 'habit_inc':
      await api.incrementLog(a.habitId, a.date, a.delta);
      return;
    case 'todo_toggle':
      await api.toggleTodo(a.todoId);
      return;
    case 'todo_create':
      await api.createTodo({ client_id: a.clientId, title: a.title, ...(a.date ? { due_date: a.date } : {}) });
      return;
    case 'habit_create': {
      // Same defaults as the app's "New habit" form, every day
      const habit = await api.createHabit({
        name: a.name,
        type: a.target ? 'build_count' : 'build_yesno',
        start_date: a.date,
        color: a.color,
        icon: 'Target',
        category: 'Personal',
        schedule: { frequency_type: 'daily', weekdays: [1, 2, 3, 4, 5], target_count: 3, daily_target: a.target ?? 1, effective_from: a.date },
      });
      return habit.id;
    }
  }
}

/** Record a tap: queued for the server and visible immediately through `loadView()`. */
export function enqueue(action: WidgetActionInput): Promise<void> {
  const full: WidgetAction = { ...action, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
  return serial(async () => writeQueue([...(await readQueue()), full]));
}

let flushing: Promise<number> | null = null;

/** Send queued taps in order. Stops at the first network failure; returns how many were sent. */
export function flushQueue(): Promise<number> {
  return (flushing ??= (async () => {
    await ensureConfig();
    let sent = 0;
    for (;;) {
      const [next] = await serial(readQueue);
      if (!next) break;
      let accepted = true;
      let createdId: string | void = undefined;
      try {
        createdId = await send(next);
        sent++;
      } catch (e) {
        if (!isPermanent(e)) break; // offline or signed out: keep it for later
        accepted = false;
      }
      // Bake the confirmed tap into the snapshot so the widget doesn't flicker back before the next fetch
      await serial(async () => {
        let rest = (await readQueue()).filter((a) => a.id !== next.id);
        let done = next;
        if (next.kind === 'habit_create' && createdId) {
          rest = renameHabit(rest, next.tempId, createdId);
          done = { ...next, tempId: createdId };
        }
        await writeQueue(rest);
        const snap = await readSnapshot();
        if (snap && accepted) await writeSnapshot(applyAction(snap, done));
      });
    }
    return sent;
  })().finally(() => {
    flushing = null;
  }));
}

/* ---------- Public API ---------- */

/** What the widget should show: the last snapshot plus any taps not yet confirmed. */
export async function loadView(): Promise<WidgetSnapshot | null> {
  return serial(async () => {
    const snap = await readSnapshot();
    if (snap?.timezone) setAppTimeZone(snap.timezone);
    return snap ? applyQueue(snap, await readQueue()) : null;
  });
}

let syncing: Promise<number> | null = null;
let again = false;

/**
 * Replay pending taps, then refresh the snapshot from the server. Offline,
 * this is a no-op and the widget keeps showing local data. Concurrent calls
 * collapse into one run (plus one follow-up if something changed meanwhile).
 * Resolves to the number of widget taps sent to the server.
 */
export function syncWidgetData(): Promise<number> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    let sent = 0;
    do {
      again = false;
      sent += await flushQueue();
      const prev = await serial(readSnapshot);
      try {
        const fresh = await fetchSnapshot(prev);
        await serial(() => writeSnapshot(fresh));
      } catch (e) {
        if (isAuthError(e)) await serial(() => writeSnapshot(signedOutSnapshot(prev)));
        // Network errors: keep the cached snapshot
      }
    } while (again);
    return sent;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Called on sign-out so the widget stops showing the previous account's data. */
export function markSignedOut(): Promise<void> {
  return serial(async () => {
    await writeQueue([]);
    await writeSnapshot(signedOutSnapshot(await readSnapshot()));
  });
}

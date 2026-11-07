/**
 * Local storage behind the home-screen widget.
 *
 * The widget never waits on the network: it renders from a snapshot kept in
 * AsyncStorage, and taps are written to a queue that is replayed against the
 * server whenever a connection is available (offline-first).
 *
 * All reads and writes go through `serial()` so a burst of taps cannot
 * interleave read-modify-write cycles and lose an update.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HabitType, StreakUnit, TodoPriority } from '@/api/types';

const SNAPSHOT_KEY = 'neri.widget.snapshot.v1';
const QUEUE_KEY = 'neri.widget.queue.v1';
const ACCENT_KEY = 'neri.widget.accent.v1';
const STATE_KEY = (widgetId: number) => `neri.widget.state.${widgetId}`;

/* ---------- Types ---------- */

export interface WidgetHabit {
  id: string;
  name: string;
  color: string;
  type: HabitType;
  done: boolean;
  count: number;
  /** Daily target for count habits, null for yes/no. */
  target: number | null;
  streak: number;
  streakUnit: StreakUnit;
  /**
   * Habits a single tap can't complete (value logging, "avoid" habits): their circle opens the
   * widget's editor sheet instead of ticking (it never opens the app).
   */
  opensApp: boolean;
  /** Value-logging habits: what is measured ("Pages") and today's total so far. */
  metricLabel?: string | null;
  metricUnit?: string | null;
  metricTotal?: number | null;
}

export interface WidgetTask {
  id: string;
  title: string;
  /** The day the task is planned for (YYYY-MM-DD), null when unscheduled. */
  date: string | null;
  time: string | null;
  priority: TodoPriority;
  done: boolean;
}

export interface WidgetSnapshot {
  /** Whose data this is (see lib/owner.ts); taps are queued for, and only shown on, the same owner. */
  owner?: string | null;
  /** The day the habit data belongs to, in the user's timezone. */
  date: string;
  timezone: string;
  signedOut: boolean;
  isRestDay: boolean;
  overallStreak: number;
  habits: WidgetHabit[];
  /** Overdue + planned for today. */
  today: WidgetTask[];
  /** Every open task, with its date. */
  inbox: WidgetTask[];
  syncedAt: number;
}

/** A tap made on the widget, before it is queued. */
export type WidgetActionInput =
  | { kind: 'habit_set'; habitId: string; date: string; done: boolean }
  /** `count` is the day's new total: replays send that absolute value, so a resend never adds twice. */
  | { kind: 'habit_inc'; habitId: string; date: string; delta: number; count?: number }
  /** `done` is the status the tap chose (absolute); missing only in taps queued by older versions (a flip). */
  | { kind: 'todo_toggle'; todoId: string; done?: boolean }
  /** From the widget's quick-add popup. `clientId` becomes the server's row id. */
  | { kind: 'todo_create'; clientId: string; title: string; date: string | null }
  /** `tempId` is swapped for the server's id once the habit is created. */
  | { kind: 'habit_create'; tempId: string; name: string; date: string; target: number | null; color: string; /** A create was already sent once (outcome unknown): look for the habit before creating it again. */ attempted?: boolean }
  /** A measurement added from the editor sheet. `clientId` makes a resend a no-op on the server. */
  | { kind: 'habit_value'; habitId: string; date: string; value: number; clientId: string }
  /** `keepData` archives (history kept); false erases the habit and its logs. */
  | { kind: 'habit_delete'; habitId: string; keepData: boolean }
  /** Rename and/or move a task. `date` is only sent when present (null clears it). */
  | { kind: 'todo_update'; todoId: string; title?: string; date?: string | null }
  | { kind: 'todo_delete'; todoId: string };

/** `owner` is who made the tap; actions of another account are kept but never sent or shown. */
export type WidgetAction = { id: string; at: number; owner?: string | null } & WidgetActionInput;

export type WidgetPage = 'habits' | 'tasks';
export type TaskView = 'today' | 'inbox';

export interface WidgetViewState {
  page: WidgetPage;
  taskView: TaskView;
}

export const DEFAULT_VIEW_STATE: WidgetViewState = { page: 'habits', taskView: 'today' };

/* ---------- Serialised access ---------- */

let chain: Promise<unknown> = Promise.resolve();

/** Run storage work one job at a time (taps can arrive faster than AsyncStorage settles). */
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

/**
 * In-memory copy of what this JS context has read or written. The app and the widget's headless
 * task share one JS context per process, and every write goes through writeJSON(), so the copy can't
 * go stale; it saves several disk round trips on every tap before the widget can redraw.
 * Values are kept as JSON text so callers can never mutate the cached object.
 */
const memory = new Map<string, string | null>();

async function readJSON<T>(key: string): Promise<T | null> {
  try {
    let raw = memory.get(key);
    if (raw === undefined) {
      raw = await AsyncStorage.getItem(key);
      memory.set(key, raw);
    }
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    await AsyncStorage.setItem(key, raw);
  } catch {}
}

/** Forget the in-memory copy (tests, or after storage was changed outside this module). */
export const resetStoreCache = () => memory.clear();

/* ---------- Snapshot ---------- */

export const readSnapshot = () => readJSON<WidgetSnapshot>(SNAPSHOT_KEY);
export const writeSnapshot = (s: WidgetSnapshot) => writeJSON(SNAPSHOT_KEY, s);

/* ---------- Pending actions ---------- */

export const readQueue = async () => (await readJSON<WidgetAction[]>(QUEUE_KEY)) ?? [];
export const writeQueue = (q: WidgetAction[]) => writeJSON(QUEUE_KEY, q);

/* ---------- Accent colour ---------- */

/** The app's custom accent (#rrggbb) so the widget matches it; null = the Neri default. */
export async function readWidgetAccent(): Promise<string | null> {
  const v = await readJSON<string | null>(ACCENT_KEY);
  return typeof v === 'string' ? v : null;
}
export const writeWidgetAccent = (hex: string | null) => writeJSON(ACCENT_KEY, hex);

/* ---------- Per-widget view state ---------- */

export async function readViewState(widgetId: number): Promise<WidgetViewState> {
  return { ...DEFAULT_VIEW_STATE, ...(await readJSON<Partial<WidgetViewState>>(STATE_KEY(widgetId))) };
}

export const writeViewState = (widgetId: number, s: WidgetViewState) => writeJSON(STATE_KEY(widgetId), s);

export async function clearViewState(widgetId: number): Promise<void> {
  memory.delete(STATE_KEY(widgetId));
  try {
    await AsyncStorage.removeItem(STATE_KEY(widgetId));
  } catch {}
}

/* ---------- Optimistic updates ---------- */

/** Apply one pending action to a snapshot, so the widget reflects a tap before the server confirms it. */
export function applyAction(s: WidgetSnapshot, a: WidgetAction): WidgetSnapshot {
  switch (a.kind) {
    case 'habit_set':
      if (a.date !== s.date) return s;
      return {
        ...s,
        habits: s.habits.map((h) =>
          h.id !== a.habitId || h.done === a.done
            ? h
            : { ...h, done: a.done, count: a.done ? 1 : 0, streak: Math.max(0, h.streak + (a.done ? 1 : -1)) },
        ),
      };
    case 'habit_inc':
      if (a.date !== s.date) return s;
      return {
        ...s,
        habits: s.habits.map((h) => {
          if (h.id !== a.habitId) return h;
          const count = Math.max(0, a.count ?? h.count + a.delta);
          // Avoid habits count slips: the day is clean (done) only at zero
          const done = h.type === 'avoid_count' ? count === 0 : h.target ? count >= h.target : h.done;
          const streak = done === h.done ? h.streak : Math.max(0, h.streak + (done ? 1 : -1));
          return { ...h, count, done, streak };
        }),
      };
    case 'todo_toggle': {
      const flip = (list: WidgetTask[]) =>
        list.map((t) => (t.id === a.todoId ? { ...t, done: a.done ?? !t.done } : t));
      return { ...s, today: flip(s.today), inbox: flip(s.inbox) };
    }
    case 'todo_create': {
      if (s.inbox.some((t) => t.id === a.clientId)) return s;
      const task: WidgetTask = { id: a.clientId, title: a.title, date: a.date, time: null, priority: 'medium', done: false };
      // Inbox is ordered by day, undated last: insert before the first task planned later
      const at = s.inbox.findIndex((t) => (task.date === null ? false : t.date === null || t.date > task.date));
      const inbox = at < 0 ? [...s.inbox, task] : [...s.inbox.slice(0, at), task, ...s.inbox.slice(at)];
      const today = task.date !== null && task.date <= s.date ? [...s.today, task] : s.today;
      return { ...s, inbox, today };
    }
    case 'habit_create': {
      if (a.date !== s.date || s.habits.some((h) => h.id === a.tempId)) return s;
      const habit: WidgetHabit = {
        id: a.tempId,
        name: a.name,
        color: a.color,
        type: a.target ? 'build_count' : 'build_yesno',
        done: false,
        count: 0,
        target: a.target,
        streak: 0,
        streakUnit: 'day',
        opensApp: false,
      };
      return { ...s, habits: [...s.habits, habit] };
    }
    case 'habit_value':
      if (a.date !== s.date) return s;
      return {
        ...s,
        habits: s.habits.map((h) =>
          h.id !== a.habitId
            ? h
            : {
                ...h,
                done: true,
                count: Math.max(1, h.count),
                metricTotal: (h.metricTotal ?? 0) + a.value,
                streak: h.done ? h.streak : h.streak + 1,
              },
        ),
      };
    case 'habit_delete':
      return { ...s, habits: s.habits.filter((h) => h.id !== a.habitId) };
    case 'todo_delete':
      return { ...s, today: s.today.filter((t) => t.id !== a.todoId), inbox: s.inbox.filter((t) => t.id !== a.todoId) };
    case 'todo_update':
      return updateTask(s, a);
  }
}

/** Rename / re-date a task on both lists, moving it onto or off Today and re-sorting the inbox by day. */
function updateTask(s: WidgetSnapshot, a: Extract<WidgetActionInput, { kind: 'todo_update' }>): WidgetSnapshot {
  const existing = s.inbox.find((t) => t.id === a.todoId) ?? s.today.find((t) => t.id === a.todoId);
  if (!existing) return s;
  const task: WidgetTask = {
    ...existing,
    ...(a.title !== undefined ? { title: a.title } : {}),
    ...(a.date !== undefined ? { date: a.date } : {}),
  };
  if (a.date === undefined) {
    const swap = (list: WidgetTask[]) => list.map((t) => (t.id === task.id ? task : t));
    return { ...s, today: swap(s.today), inbox: swap(s.inbox) };
  }
  const onToday = task.date !== null && task.date <= s.date;
  const wasToday = s.today.some((t) => t.id === task.id);
  const today = onToday
    ? wasToday
      ? s.today.map((t) => (t.id === task.id ? task : t))
      : [...s.today, task]
    : s.today.filter((t) => t.id !== task.id);
  let inbox = s.inbox.filter((t) => t.id !== task.id);
  if (!task.done) {
    const at = inbox.findIndex((t) => (task.date === null ? false : t.date === null || t.date > task.date));
    inbox = at < 0 ? [...inbox, task] : [...inbox.slice(0, at), task, ...inbox.slice(at)];
  }
  return { ...s, today, inbox };
}

/** Point queued taps on a just-created habit at its real id. */
export function renameHabit(q: WidgetAction[], from: string, to: string): WidgetAction[] {
  return q.map((a) => {
    if (
      (a.kind === 'habit_set' || a.kind === 'habit_inc' || a.kind === 'habit_value' || a.kind === 'habit_delete') &&
      a.habitId === from
    )
      return { ...a, habitId: to };
    if (a.kind === 'habit_create' && a.tempId === from) return { ...a, tempId: to };
    return a;
  });
}

/** Whether a queued tap belongs to `owner` (taps queued before owners were recorded belong to whoever is signed in). */
export const isOwnedBy = (a: WidgetAction, owner: string | null | undefined) => a.owner === undefined || a.owner === owner;

/** The snapshot with the taps of its own account that the server hasn't confirmed yet. */
export const applyQueue = (s: WidgetSnapshot, q: WidgetAction[]) =>
  q.filter((a) => isOwnedBy(a, s.owner)).reduce(applyAction, s);

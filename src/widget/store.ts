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
  /** Habits the widget can't complete in one tap (value logging, "avoid" habits) open the app instead. */
  opensApp: boolean;
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
  | { kind: 'habit_inc'; habitId: string; date: string; delta: number }
  | { kind: 'todo_toggle'; todoId: string };

export type WidgetAction = { id: string; at: number } & WidgetActionInput;

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

async function readJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

/* ---------- Snapshot ---------- */

export const readSnapshot = () => readJSON<WidgetSnapshot>(SNAPSHOT_KEY);
export const writeSnapshot = (s: WidgetSnapshot) => writeJSON(SNAPSHOT_KEY, s);

/* ---------- Pending actions ---------- */

export const readQueue = async () => (await readJSON<WidgetAction[]>(QUEUE_KEY)) ?? [];
export const writeQueue = (q: WidgetAction[]) => writeJSON(QUEUE_KEY, q);

/* ---------- Per-widget view state ---------- */

export async function readViewState(widgetId: number): Promise<WidgetViewState> {
  return { ...DEFAULT_VIEW_STATE, ...(await readJSON<Partial<WidgetViewState>>(STATE_KEY(widgetId))) };
}

export const writeViewState = (widgetId: number, s: WidgetViewState) => writeJSON(STATE_KEY(widgetId), s);

export async function clearViewState(widgetId: number): Promise<void> {
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
          const count = Math.max(0, h.count + a.delta);
          const done = h.target ? count >= h.target : h.done;
          const streak = done === h.done ? h.streak : Math.max(0, h.streak + (done ? 1 : -1));
          return { ...h, count, done, streak };
        }),
      };
    case 'todo_toggle': {
      const flip = (list: WidgetTask[]) => list.map((t) => (t.id === a.todoId ? { ...t, done: !t.done } : t));
      return { ...s, today: flip(s.today), inbox: flip(s.inbox) };
    }
  }
}

export const applyQueue = (s: WidgetSnapshot, q: WidgetAction[]) => q.reduce(applyAction, s);

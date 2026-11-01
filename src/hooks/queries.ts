/**
 * Server-state layer. Every screen reads and writes through these hooks so that
 * caching, retries, optimistic updates and cache invalidation behave the same
 * everywhere. Add new endpoints here, never call `api.*` from a screen.
 */
import { useSyncExternalStore } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import * as api from '@/api/endpoints';
import type { Habit, MonthlyData, RepeatScope, Subtask, Todo, TodayData } from '@/api/types';

/* ---------- Keys ---------- */

export const qk = {
  profile: ['profile'] as const,
  today: (date?: string) => ['today', date ?? 'current'] as const,
  habits: (status?: string) => ['habits', status ?? 'all'] as const,
  month: (year?: number, month?: number) => ['month', year ?? 0, month ?? 0] as const,
  dashboard: (r: api.InsightsRange) => ['insights', 'dashboard', r] as const,
  habitInsights: (id: string, r: api.InsightsRange) => ['insights', 'habit', id, r] as const,
  todos: (q: api.TodoQuery = {}) => ['todos', q] as const,
  todoInsights: (r: api.InsightsRange) => ['todos-insights', r] as const,
};

/** Anything derived from habit logs, skips or schedules. */
function invalidateHabitData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['today'] });
  qc.invalidateQueries({ queryKey: ['month'] });
  qc.invalidateQueries({ queryKey: ['habits'] });
  qc.invalidateQueries({ queryKey: ['insights'] });
}

function invalidateTodoData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['todos'] });
  qc.invalidateQueries({ queryKey: ['todos-insights'] });
}

/* ---------- Profile ---------- */

export const useProfile = (enabled = true) =>
  useQuery({ queryKey: qk.profile, queryFn: api.getProfile, enabled, staleTime: Infinity });

export function useSubmitOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { startDate: string; timezone: string }) => api.submitOnboarding(v.startDate, v.timezone),
    onSuccess: (profile) => qc.setQueryData(qk.profile, profile),
  });
}

/* ---------- Today & habit logging ---------- */

// Keep the previous day on screen while the next one loads (no skeleton flash when stepping days)
export const useToday = (date?: string) =>
  useQuery({ queryKey: qk.today(date), queryFn: () => api.getTodayData(date), placeholderData: keepPreviousData });

/**
 * Apply an optimistic change to every cached Today payload for `date`,
 * returning a rollback function.
 */
function patchToday(qc: QueryClient, date: string, fn: (d: TodayData) => TodayData) {
  const snapshots = qc.getQueriesData<TodayData>({ queryKey: ['today'] });
  for (const [key, data] of snapshots) {
    if (data && data.date === date) qc.setQueryData(key, fn(data));
  }
  return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

function recount(d: TodayData): TodayData {
  const due = d.items.filter((i) => i.is_scheduled_today && i.is_applicable && !i.is_skipped);
  const done = due.filter((i) => i.status === 'done').length;
  return {
    ...d,
    total_done_today: done,
    completion_rate: d.total_due_today ? Math.round((done / d.total_due_today) * 100) : 0,
  };
}

/** Yes/No habit: toggle done for a date. */
export function useToggleHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { habitId: string; date: string; done: boolean }) =>
      api.upsertLog({ habit_id: v.habitId, log_date: v.date, count: v.done ? 1 : 0, status: 'done' }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['today'] });
      const rollback = patchToday(qc, v.date, (d) =>
        recount({
          ...d,
          items: d.items.map((i) =>
            i.habit.id === v.habitId
              ? {
                  ...i,
                  status: v.done ? 'done' : 'not_done',
                  count: v.done ? 1 : 0,
                  current_streak: Math.max(0, i.current_streak + (v.done ? 1 : -1)),
                }
              : i,
          ),
        }),
      );
      return { rollback };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateHabitData(qc),
  });
}

/** Count / avoid habits: +1 / -1 for a date. */
export function useIncrementHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { habitId: string; date: string; delta: number }) => api.incrementLog(v.habitId, v.date, v.delta),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['today'] });
      const rollback = patchToday(qc, v.date, (d) =>
        recount({
          ...d,
          items: d.items.map((i) => {
            if (i.habit.id !== v.habitId) return i;
            const count = Math.max(0, i.count + v.delta);
            // Cut-back habits are "done" (clean) only while there are no slips
            return i.habit.type === 'avoid_count' ? { ...i, count, status: count > 0 ? 'not_done' : 'done' } : { ...i, count };
          }),
        }),
      );
      return { rollback };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateHabitData(qc),
  });
}

/** Cut-back habit: set the day's slip count to an exact number (0 = a clean day again). */
export function useSetSlips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { habitId: string; date: string; count: number }) =>
      api.upsertLog({ habit_id: v.habitId, log_date: v.date, count: v.count, status: 'done' }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['today'] });
      const rollback = patchToday(qc, v.date, (d) =>
        recount({
          ...d,
          items: d.items.map((i) =>
            i.habit.id === v.habitId ? { ...i, count: v.count, status: v.count > 0 ? 'not_done' : 'done' } : i,
          ),
        }),
      );
      return { rollback };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateHabitData(qc),
  });
}

/** Generic log write: notes, per-habit skips, monthly grid edits (optimistic on the grid). */
export function useUpsertLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.upsertLog,
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['month'] });
      const snapshots = qc.getQueriesData<MonthlyData>({ queryKey: ['month'] });
      for (const [key, data] of snapshots) {
        if (!data) continue;
        qc.setQueryData<MonthlyData>(key, {
          ...data,
          habits: data.habits.map((row) =>
            row.habit.id !== v.habit_id
              ? row
              : {
                  ...row,
                  cells: row.cells.map((cell) => {
                    if (cell.date !== v.log_date) return cell;
                    const state =
                      v.status === 'skipped'
                        ? 'skipped'
                        : row.habit.type === 'build_yesno'
                          ? v.count > 0
                            ? 'done'
                            : 'missed'
                          : cell.state;
                    return { ...cell, state, count: v.count, note: v.note ?? cell.note };
                  }),
                },
          ),
        });
      }
      return { rollback: () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data)) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateHabitData(qc),
  });
}

/** Yes/No habit with a tracked value: add an entry (counts the day as done). */
export function useAddValue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { habitId: string; date: string; value: number }) => api.addValueEntry(v.habitId, v.date, v.value),
    onSettled: () => invalidateHabitData(qc),
  });
}

export function useRestDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { date: string; on: boolean; reason?: string }) =>
      v.on ? api.createDaySkip(v.date, v.reason) : api.deleteDaySkip(v.date),
    onSettled: () => invalidateHabitData(qc),
  });
}

/* ---------- Habits ---------- */

export const useHabits = (status?: 'active' | 'archived') =>
  useQuery({ queryKey: qk.habits(status), queryFn: () => api.getHabits(status) });

/** Look a habit up from any cached habit list, falling back to a fetch of all. */
export function useHabit(id?: string) {
  const q = useHabits();
  return { ...q, data: q.data?.find((h: Habit) => h.id === id) };
}

export function useCreateHabit() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createHabit, onSuccess: () => invalidateHabitData(qc) });
}

export function useUpdateHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; cosmetics?: api.HabitCosmeticsInput; schedule?: Parameters<typeof api.updateHabitSchedule>[1] }) => {
      if (v.cosmetics) await api.updateHabitCosmetics(v.id, v.cosmetics);
      if (v.schedule) await api.updateHabitSchedule(v.id, v.schedule);
    },
    onSettled: () => invalidateHabitData(qc),
  });
}

export function useDeleteHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; keepData: boolean }) => api.deleteHabit(v.id, v.keepData),
    onSettled: () => invalidateHabitData(qc),
  });
}

export function useReopenHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; date: string }) => api.reopenHabit(v.id, v.date),
    onSettled: () => invalidateHabitData(qc),
  });
}

/* ---------- Monthly tracker & insights ---------- */

export const useMonth = (year?: number, month?: number) =>
  useQuery({
    queryKey: qk.month(year, month),
    queryFn: () => api.getMonthlyData(year, month),
    placeholderData: keepPreviousData,
  });

export const useDashboardInsights = (r: api.InsightsRange) =>
  useQuery({ queryKey: qk.dashboard(r), queryFn: () => api.getDashboardInsights(r), placeholderData: keepPreviousData });

export const useHabitInsights = (id: string | undefined, r: api.InsightsRange) =>
  useQuery({
    queryKey: qk.habitInsights(id ?? '', r),
    queryFn: () => api.getHabitInsights(id!, r),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });

/* ---------- Tasks ---------- */

/** `keepPrevious` keeps the old list visible while a new range/filter loads. */
export const useTodos = (q: api.TodoQuery = {}, enabled = true, keepPrevious = false) =>
  useQuery({
    queryKey: qk.todos(q),
    queryFn: () => api.getTodos(q),
    enabled,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });

function findCachedTodo(qc: QueryClient, id?: string): Todo | undefined {
  for (const [, list] of qc.getQueriesData<Todo[]>({ queryKey: ['todos'] })) {
    const hit = list?.find((t) => t.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * A task from any cached list, kept live: re-renders whenever the cache changes
 * (optimistic edits, refetches), so detail screens open instantly and stay in sync.
 */
export function useCachedTodo(id?: string): Todo | undefined {
  const qc = useQueryClient();
  return useSyncExternalStore(
    (onChange) => qc.getQueryCache().subscribe(onChange),
    () => findCachedTodo(qc, id),
  );
}

/** Optimistically patch a task in every cached list; returns rollback. */
function patchTodos(qc: QueryClient, fn: (list: Todo[]) => Todo[]) {
  const snapshots = qc.getQueriesData<Todo[]>({ queryKey: ['todos'] });
  for (const [key, data] of snapshots) if (data) qc.setQueryData(key, fn(data));
  return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

export function useCreateTodo() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createTodo, onSettled: () => invalidateTodoData(qc) });
}

export function useUpdateTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: api.TodoPatch; scope?: Exclude<RepeatScope, 'all'> }) =>
      api.updateTodo(v.id, v.patch, v.scope),
    // A series-wide or repeat-rule change touches many rows: skip the optimistic patch and refetch
    onMutate: async (v) => {
      if ((v.scope ?? 'this') !== 'this' || 'repeat' in v.patch) return undefined;
      await qc.cancelQueries({ queryKey: ['todos'] });
      const patch = v.patch as Partial<Todo>;
      return { rollback: patchTodos(qc, (l) => l.map((t) => (t.id === v.id ? { ...t, ...patch } : t))) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateTodoData(qc),
  });
}

export function useToggleTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.toggleTodo(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['todos'] });
      const rollback = patchTodos(qc, (l) =>
        l.map((t) => {
          if (t.id !== id) return t;
          const completed = t.status !== 'completed';
          return { ...t, status: completed ? 'completed' : 'pending', completed_at: completed ? new Date().toISOString() : null };
        }),
      );
      return { rollback };
    },
    onError: (_e, _id, ctx) => ctx?.rollback(),
    onSettled: () => invalidateTodoData(qc),
  });
}

export function useUpdateSubtasks() {
  const update = useUpdateTodo();
  return {
    ...update,
    mutate: (id: string, subtasks: Subtask[], scope?: 'this' | 'future') => update.mutate({ id, patch: { subtasks }, scope }),
  };
}

export function useDeleteTodo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; scope?: RepeatScope }) => api.deleteTodo(v.id, v.scope),
    onMutate: async (v) => {
      if ((v.scope ?? 'this') !== 'this') return undefined;
      await qc.cancelQueries({ queryKey: ['todos'] });
      return { rollback: patchTodos(qc, (l) => l.filter((t) => t.id !== v.id)) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    onSettled: () => invalidateTodoData(qc),
  });
}

export const useTodoInsights = (r: api.InsightsRange) =>
  useQuery({ queryKey: qk.todoInsights(r), queryFn: () => api.getTodoInsights(r), placeholderData: keepPreviousData });

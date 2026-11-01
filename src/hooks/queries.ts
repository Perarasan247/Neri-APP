/**
 * Server-state layer. Every screen reads and writes through these hooks so that
 * caching, retries, optimistic updates and cache invalidation behave the same
 * everywhere. Add new endpoints here, never call `api.*` from a screen.
 */
import { useSyncExternalStore } from 'react';
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import * as api from '@/api/endpoints';
import type { Goal, GoalCurrent, GoalDetail, GoalLevel, Habit, MonthlyData, RepeatScope, Subtask, Todo, TodayData } from '@/api/types';
import { pushGoalPrompt } from '@/lib/goalPrompts';
import { applyGoalPatch, isValidParent, parentCandidatePeriods } from '@/lib/goals';

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
  // Everything goal-related lives under 'goals' so one invalidation refreshes it all
  goals: (q: api.GoalQuery = {}) => ['goals', 'list', q] as const,
  goalsCurrent: ['goals', 'current'] as const,
  goal: (id: string) => ['goals', 'detail', id] as const,
  goalInsights: (r: api.InsightsRange) => ['goals', 'insights', r] as const,
};

/** Goal progress is derived from tasks and habit logs, so it refreshes whenever they change. */
function invalidateGoalData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['goals'] });
}

/** Anything derived from habit logs, skips or schedules. */
function invalidateHabitData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['today'] });
  qc.invalidateQueries({ queryKey: ['month'] });
  qc.invalidateQueries({ queryKey: ['habits'] });
  qc.invalidateQueries({ queryKey: ['insights'] });
  invalidateGoalData(qc);
}

function invalidateTodoData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['todos'] });
  qc.invalidateQueries({ queryKey: ['todos-insights'] });
  invalidateGoalData(qc);
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
    // Completing a linked task (status: 'completed') may ask whether its goal is done too
    onSuccess: (res) => pushGoalPrompt(res?.goal_prompt),
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
      // Goal detail screens list their tasks too: flip the checkbox there straight away
      const goalRollback = patchGoalDetails(qc, (g) =>
        g.tasks.some((t) => t.id === id)
          ? {
              ...g,
              tasks: g.tasks.map((t) =>
                t.id === id ? { ...t, status: t.status === 'completed' ? 'pending' : 'completed' } : t,
              ),
            }
          : g,
      );
      return {
        rollback: () => {
          rollback();
          goalRollback();
        },
      };
    },
    onError: (_e, _id, ctx) => ctx?.rollback(),
    onSuccess: (res) => pushGoalPrompt(res?.goal_prompt),
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

/* ---------- Goals ---------- */

/** Goals for one level and period (or any filter); keeps the old list while the next period loads. */
export const useGoals = (q: api.GoalQuery = {}, enabled = true) =>
  useQuery({ queryKey: qk.goals(q), queryFn: () => api.getGoals(q), enabled, placeholderData: keepPreviousData });

/** This week's, month's and year's goals, plus finished periods waiting for a review. */
export const useCurrentGoals = (enabled = true) =>
  useQuery({ queryKey: qk.goalsCurrent, queryFn: api.getCurrentGoals, enabled });

export const useGoal = (id?: string) =>
  useQuery({ queryKey: qk.goal(id ?? ''), queryFn: () => api.getGoal(id!), enabled: Boolean(id) });

/** A goal's id → title lookup from the full goal list (task rows, pickers). Fetches only when needed. */
export function useGoalLookup(enabled = true) {
  const q = useQuery({ queryKey: qk.goals({}), queryFn: () => api.getGoals({}), enabled, staleTime: 60_000 });
  return q.data;
}

/**
 * Goals that can hold a goal of `level` in the period starting at `start`: bigger levels whose
 * period overlaps it (a week spanning two months offers both months). Fetched per period.
 */
export function useParentCandidates(level: GoalLevel, start: string, excludeId?: string) {
  const periods = parentCandidatePeriods(level, start);
  const results = useQueries({
    queries: periods.map((p) => {
      const q: api.GoalQuery = { level: p.level, period: p.period };
      return { queryKey: qk.goals(q), queryFn: () => api.getGoals(q) };
    }),
  });
  const goals = results
    .flatMap((r) => r.data ?? [])
    .filter((g) => g.id !== excludeId && isValidParent(g, level, start));
  return { goals, loading: results.some((r) => r.isPending) };
}

export const useGoalInsights = (r: api.InsightsRange) =>
  useQuery({ queryKey: qk.goalInsights(r), queryFn: () => api.getGoalInsights(r), placeholderData: keepPreviousData });

function patchGoalDetails(qc: QueryClient, fn: (g: GoalDetail) => GoalDetail) {
  const snapshots = qc.getQueriesData<GoalDetail>({ queryKey: ['goals', 'detail'] });
  for (const [key, data] of snapshots) if (data) qc.setQueryData(key, fn(data));
  return () => snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
}

/** Optimistically apply `fn` to goal `id` wherever it is cached (lists, current, details); returns rollback. */
function patchGoal(qc: QueryClient, id: string, fn: <T extends Goal>(g: T) => T) {
  const one = <T extends Goal>(g: T): T => (g.id === id ? fn(g) : g);
  const many = <T extends Goal>(l: T[]) => l.map(one);
  const lists = qc.getQueriesData<Goal[]>({ queryKey: ['goals', 'list'] });
  const current = qc.getQueriesData<GoalCurrent>({ queryKey: qk.goalsCurrent });
  for (const [key, data] of lists) if (data) qc.setQueryData(key, many(data));
  for (const [key, data] of current) {
    if (data)
      qc.setQueryData<GoalCurrent>(key, {
        ...data,
        weekly: many(data.weekly),
        monthly: many(data.monthly),
        yearly: many(data.yearly),
        needs_review: data.needs_review.filter((g) => !(g.id === id && fn(g).status !== 'active')),
      });
  }
  const detailRollback = patchGoalDetails(qc, (g) => ({ ...one(g), children: many(g.children), ancestors: many(g.ancestors) }));
  return () => {
    lists.forEach(([key, data]) => qc.setQueryData(key, data));
    current.forEach(([key, data]) => qc.setQueryData(key, data));
    detailRollback();
  };
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: api.createGoal, onSettled: () => invalidateGoalData(qc) });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; patch: api.GoalPatch }) => api.updateGoal(v.id, v.patch),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['goals'] });
      return { rollback: patchGoal(qc, v.id, (g) => applyGoalPatch(g, v.patch)) };
    },
    onError: (_e, _v, ctx) => ctx?.rollback(),
    // Completing the last open sub-goal asks about the parent
    onSuccess: (res) => pushGoalPrompt(res?.parent_prompt),
    onSettled: () => invalidateGoalData(qc),
  });
}

/** Deleting unlinks sub-goals, tasks and habits, so all of them refresh. */
export function useDeleteGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSettled: () => {
      invalidateTodoData(qc);
      qc.invalidateQueries({ queryKey: ['habits'] });
    },
  });
}

/** Carry what's left into a later period; open tasks follow the new goal. */
export function useCarryGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; periodStart?: string }) => api.carryGoal(v.id, v.periodStart),
    onSettled: () => invalidateTodoData(qc),
  });
}

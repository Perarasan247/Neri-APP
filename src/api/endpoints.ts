/**
 * Every backend endpoint the app uses, mirroring frontend/src/lib/api.ts.
 * Screens never call these directly: they go through the hooks in
 * src/hooks/queries.ts so caching and invalidation stay consistent.
 */
import { ApiError, request } from './client';
import type {
  ChecklistItem,
  DashboardInsights,
  FrequencyType,
  Goal,
  GoalCurrent,
  GoalDetail,
  GoalInsights,
  GoalLevel,
  GoalMeasure,
  GoalStatus,
  Habit,
  HabitInsights,
  HabitType,
  MonthlyData,
  Profile,
  Repeat,
  RepeatScope,
  Subtask,
  Todo,
  TodoInsightsData,
  TodoPriority,
  TodayData,
} from './types';

/* ---------- Profile & onboarding ---------- */

/** Returns null when the user has not finished onboarding (404). */
export async function getProfile(): Promise<Profile | null> {
  try {
    return await request<Profile>('GET', '/profile');
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export const submitOnboarding = (tracking_start_date: string, timezone: string) =>
  request<Profile>('POST', '/onboarding', { body: { tracking_start_date, timezone } });

/* ---------- Habits ---------- */

export interface ScheduleInput {
  frequency_type: FrequencyType;
  weekdays?: number[];
  target_count?: number;
  daily_target?: number;
  effective_from?: string;
}

export interface CreateHabitInput {
  name: string;
  type: HabitType;
  start_date?: string;
  color?: string;
  icon?: string;
  category?: string;
  description?: string;
  sort_order?: number;
  metric_label?: string;
  metric_unit?: string;
  goal_id?: string;
  schedule: ScheduleInput;
}

export interface HabitCosmeticsInput {
  color?: string;
  icon?: string;
  category?: string;
  description?: string;
  sort_order?: number;
  /** Empty string turns value tracking off. */
  metric_label?: string;
  metric_unit?: string;
  /** Empty string unlinks the goal. */
  goal_id?: string;
}

export const getHabits = (status?: 'active' | 'archived') =>
  request<Habit[]>('GET', '/habits', { query: { status_filter: status } });

export const createHabit = (body: CreateHabitInput) => request<Habit>('POST', '/habits', { body });

export const updateHabitCosmetics = (habitId: string, body: HabitCosmeticsInput) =>
  request<Habit>('PATCH', `/habits/${habitId}`, { body });

export const updateHabitSchedule = (habitId: string, body: ScheduleInput & { effective_from: string }) =>
  request<Habit>('PUT', `/habits/${habitId}/schedule`, { body });

/** keepData=true archives (history kept); false deletes permanently. */
export const deleteHabit = (habitId: string, keepData: boolean) =>
  request<{ message: string }>('DELETE', `/habits/${habitId}`, { query: { keep_data: keepData } });

export const reopenHabit = (habitId: string, reopen_date: string) =>
  request<Habit>('POST', `/habits/${habitId}/reopen`, { body: { reopen_date } });

/* ---------- Today & logs ---------- */

export const getTodayData = (date?: string) => request<TodayData>('GET', '/today', { query: { date } });

export interface UpsertLogInput {
  habit_id: string;
  log_date: string;
  count: number;
  status: 'done' | 'skipped';
  note?: string | null;
}

export const upsertLog = (body: UpsertLogInput) => request<unknown>('PUT', '/logs', { body });

export const incrementLog = (habit_id: string, log_date: string, delta: number) =>
  request<unknown>('POST', '/logs/increment', { body: { habit_id, log_date, delta } });

/* ---------- Rest days ---------- */

/** Log a measurement (e.g. pages read). Several per day add up, and the day counts as done. */
export const addValueEntry = (habit_id: string, entry_date: string, value: number) =>
  request<unknown>('POST', '/values', { body: { habit_id, entry_date, value } });

export const createDaySkip = (skip_date: string, reason?: string) =>
  request<unknown>('POST', '/skips', { body: { skip_date, reason } });

export const deleteDaySkip = (skip_date: string) => request<unknown>('DELETE', `/skips/${skip_date}`);

/* ---------- Monthly tracker ---------- */

export const getMonthlyData = (year?: number, month?: number) =>
  request<MonthlyData>('GET', '/month', { query: { year, month } });

/* ---------- Insights ---------- */

/** range: today | week | month | year | all | custom (custom needs start/end). */
export interface InsightsRange {
  range: string;
  year?: number;
  startDate?: string;
  endDate?: string;
}

export const getDashboardInsights = ({ range, year, startDate, endDate }: InsightsRange) =>
  request<DashboardInsights>('GET', '/insights/dashboard', {
    query: { range, year, start_date: startDate, end_date: endDate },
  });

export const getHabitInsights = (habitId: string, { range, year, startDate, endDate }: InsightsRange) =>
  request<HabitInsights>('GET', `/insights/habit/${habitId}`, {
    query: { range, year, start_date: startDate, end_date: endDate },
  });

/* ---------- Tasks ---------- */

export interface TodoQuery {
  view?: string;
  category?: string;
  priority?: string;
  search?: string;
  sort_by?: string;
  start_date?: string;
  end_date?: string;
  /** 'calendar' also returns calendar-only events; the default hides them (task lists). */
  surface?: 'tasks' | 'calendar';
}

export interface TodoInput {
  title: string;
  description?: string;
  due_date?: string;
  due_time?: string;
  start_time?: string;
  end_time?: string;
  is_all_day?: boolean;
  location?: string;
  color?: string;
  priority?: TodoPriority;
  category?: string;
  subtasks?: Subtask[];
  repeat?: Repeat;
  goal_id?: string;
}

export const getTodos = (params: TodoQuery = {}) =>
  request<Todo[]>('GET', '/todos', { query: { ...params } });

export const createTodo = (body: TodoInput) => request<Todo>('POST', '/todos', { body });

/** `repeat: null` is serialised on purpose: it stops the series. `goal_id: null` unlinks the goal. */
export type TodoPatch = Partial<Omit<Todo, 'repeat' | 'goal_prompt'>> & { repeat?: Repeat | null };

export const updateTodo = (todoId: string, body: TodoPatch, scope: Exclude<RepeatScope, 'all'> = 'this') =>
  request<Todo>('PATCH', `/todos/${todoId}`, { query: { scope }, body });

export const toggleTodo = (todoId: string) => request<Todo>('POST', `/todos/${todoId}/toggle`);

export const deleteTodo = (todoId: string, scope: RepeatScope = 'this') =>
  request<{ message: string }>('DELETE', `/todos/${todoId}`, { query: { scope } });

export const getTodoInsights = ({ range, year, startDate, endDate }: InsightsRange) =>
  request<TodoInsightsData>('GET', '/todos/insights/summary', {
    query: { time_filter: range, year, start_date: startDate, end_date: endDate },
  });

/* ---------- Goals ---------- */

export interface GoalQuery {
  level?: GoalLevel;
  /** Any date inside the period (needs level). */
  period?: string;
  status?: GoalStatus | 'open' | 'all';
}

export interface GoalInput {
  title: string;
  level: GoalLevel;
  /** Any date inside the period; the server snaps it to the period's first day. */
  period_start: string;
  description?: string;
  color?: string;
  parent_id?: string;
  measure?: GoalMeasure;
  target?: number;
  checklist?: ChecklistItem[];
}

export interface GoalPatch {
  title?: string;
  description?: string | null;
  color?: string;
  period_start?: string;
  /** null or "" unlinks. */
  parent_id?: string | null;
  measure?: GoalMeasure;
  target?: number;
  manual_progress?: number;
  checklist?: ChecklistItem[];
  status?: GoalStatus;
  ask_on_task_complete?: boolean;
  sort_order?: number;
}

export const getGoals = (q: GoalQuery = {}) => request<Goal[]>('GET', '/goals', { query: { ...q } });

export const getCurrentGoals = () => request<GoalCurrent>('GET', '/goals/current');

export const getGoal = (goalId: string) => request<GoalDetail>('GET', `/goals/${goalId}`);

export const createGoal = (body: GoalInput) => request<Goal>('POST', '/goals', { body });

export const updateGoal = (goalId: string, body: GoalPatch) => request<Goal>('PATCH', `/goals/${goalId}`, { body });

export const deleteGoal = (goalId: string) => request<{ message: string }>('DELETE', `/goals/${goalId}`);

/** Move what's left of a goal into a later period (default: the next one). The old goal becomes missed. */
export const carryGoal = (goalId: string, period_start?: string) =>
  request<Goal>('POST', `/goals/${goalId}/carry`, { body: period_start ? { period_start } : {} });

export const getGoalInsights = ({ range, year, startDate, endDate }: InsightsRange) =>
  request<GoalInsights>('GET', '/goals/insights', {
    query: { time_filter: range, year, start_date: startDate, end_date: endDate },
  });

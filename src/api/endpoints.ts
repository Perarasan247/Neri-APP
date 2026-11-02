/**
 * Every backend endpoint the app uses, mirroring frontend/src/lib/api.ts.
 * Screens never call these directly: they go through the hooks in
 * src/hooks/queries.ts so caching and invalidation stay consistent.
 */
import { ApiError, request, requestText } from './client';
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
  /** Optional last day (inclusive). Omit to run until deleted. */
  end_date?: string;
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
  /** New last day (today or later). */
  end_date?: string;
  /** Remove the end date. */
  clear_end_date?: boolean;
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
export const addValueEntry = (habit_id: string, entry_date: string, value: number, client_id?: string) =>
  request<unknown>('POST', '/values', { body: { habit_id, entry_date, value, client_id } });

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
  /** Id chosen by the app (offline creates); the server uses it as the row id, so retries never duplicate. */
  client_id?: string;
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

/* ---------- Export & import ---------- */

export type ExportKind = 'json' | 'logs' | 'tasks';

/** Full backup (JSON) or a CSV of habit logs / tasks, as text ready to be saved to a file. */
export const exportData = (kind: ExportKind) =>
  requestText('/export', kind === 'json' ? { format: 'json' } : { format: 'csv', dataset: kind });

export type ImportFormat = 'auto' | 'neri_json' | 'long_csv' | 'wide_csv';

export interface ImportReport {
  format: string;
  dry_run: boolean;
  habits_created: number;
  habits_matched: number;
  logs_created: number;
  logs_skipped: number;
  value_entries_created: number;
  rest_days_created: number;
  goals_created: number;
  tasks_created: number;
  tasks_skipped: number;
  tracking_start_date_lowered_to: string | null;
  warnings: string[];
  errors: string[];
}

/** `dryRun: true` reports what would happen without changing anything. */
export const importData = (content: string, opts: { filename?: string; format?: ImportFormat; dryRun?: boolean } = {}) =>
  request<ImportReport>('POST', '/import', {
    body: { content, filename: opts.filename, format: opts.format ?? 'auto', dry_run: opts.dryRun ?? false },
  });

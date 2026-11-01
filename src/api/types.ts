export type HabitType = 'build_yesno' | 'build_count' | 'avoid_count';
export type FrequencyType = 'daily' | 'weekdays' | 'times_per_week' | 'times_per_month';
export type HabitStatus = 'active' | 'archived';

export interface HabitPeriod {
  id: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
}

export interface HabitSchedule {
  id: string;
  effective_from: string;
  frequency_type: FrequencyType;
  weekdays: number[];
  target_count?: number;
  daily_target?: number;
  created_at: string;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  type: HabitType;
  color: string;
  icon: string;
  category: string;
  description?: string;
  sort_order: number;
  status: HabitStatus;
  /** Optional tracked value with no goal, e.g. "Pages read" / "pages". Yes/No habits only. */
  metric_label?: string | null;
  metric_unit?: string | null;
  /** The goal this habit serves, if any. */
  goal_id?: string | null;
  created_at: string;
  periods: HabitPeriod[];
  schedules: HabitSchedule[];
  current_schedule?: HabitSchedule;
}

export interface WeeklyProgress {
  /** Days done so far in the current week or month (see `period`). */
  done_this_week: number;
  target: number;
  target_met: boolean;
  period?: 'week' | 'month';
}

/** What a streak counts: days, or weeks / months for "N times a week / month" habits. */
export type StreakUnit = 'day' | 'week' | 'month';

export interface TodayItem {
  habit: Habit;
  is_scheduled_today: boolean;
  is_applicable: boolean;
  is_skipped: boolean;
  skip_scope?: 'habit' | 'day' | null;
  skip_reason?: string | null;
  status: 'not_done' | 'done' | 'skipped';
  count: number;
  daily_target?: number | null;
  weekly_progress?: WeeklyProgress | null;
  current_streak: number;
  streak_unit?: StreakUnit;
  note?: string | null;
  /** Sum of values logged for the day; null when the habit doesn't track one. */
  metric_total?: number | null;
}

export interface TodayData {
  date: string;
  is_today: boolean;
  is_whole_day_skip: boolean;
  whole_day_skip_reason?: string | null;
  tracking_start_date: string;
  total_due_today: number;
  total_done_today: number;
  completion_rate: number;
  overall_streak: number;
  /** Best overall streak up to the viewed day. */
  longest_overall_streak: number;
  items: TodayItem[];
}

export interface MonthlyCell {
  date: string;
  state: 'done' | 'missed' | 'skipped' | 'not_scheduled' | 'not_applicable' | 'future';
  count: number;
  status: string;
  note?: string | null;
  /** For skipped cells: a whole-day rest (applies to every habit) or just this habit. */
  skip_scope?: 'day' | 'habit' | null;
}

export interface MonthlyHabitRow {
  habit: Habit;
  monthly_done: number;
  monthly_eligible: number;
  monthly_completion_rate: number;
  cells: MonthlyCell[];
}

export interface DaySummaryStat {
  date: string;
  is_rest_day: boolean;
  total_scheduled: number;
  total_done: number;
  completion_rate: number;
}

export interface MonthlyData {
  year: number;
  month: number;
  days_in_month: number;
  today_ist: string;
  tracking_start_date: string;
  summary: {
    completion_rate: number;
    total_done: number;
    total_eligible: number;
    perfect_days: number;
    best_day?: string | null;
    rest_days: number;
  };
  habits: MonthlyHabitRow[];
  day_stats: DaySummaryStat[];
}

export interface Profile {
  id: string;
  email?: string;
  tracking_start_date: string;
  timezone: string;
  created_at: string;
}

export type TrendGranularity = 'day' | 'week' | 'month';

export interface TrendPoint {
  label: string;
  /** First day the point covers. */
  date: string;
  rate: number;
  done: number;
  scheduled: number;
}

export interface WeekdayRhythm {
  day: string;
  short: string;
  scheduled: number;
  done: number;
  rate: number;
}

export interface RankedHabit {
  id: string;
  name: string;
  type: HabitType;
  color: string;
  icon: string;
  category: string;
  status: HabitStatus;
  eligible_days: number;
  completed_count: number;
  missed_count: number;
  /** Cut-back habits: slips logged in the range (a day can have several). */
  total_slips?: number;
  /** Cut-back habits: days in the range with at least one slip. */
  slip_days?: number;
  completion_rate: number;
  current_streak: number;
  longest_streak: number;
  streak_unit: StreakUnit;
}

export interface DashboardInsights {
  time_filter: string;
  date_range: { start: string; end: string };
  text_summary: string;
  overall_completion_rate: number;
  total_eligible_days: number;
  total_completed_events: number;
  perfect_days_count: number;
  active_days: number;
  rest_days: number;
  tracked_days: number;
  current_overall_streak: number;
  longest_overall_streak: number;
  best_weekday?: string | null;
  worst_weekday?: string | null;
  best_habit?: any | null;
  worst_habit?: any | null;
  per_habit_ranking: RankedHabit[];
  /** Mon..Sun completion of scheduled habit-days in the range. */
  weekday_rhythm: WeekdayRhythm[];
  /** Spacing of consistency_trend points. */
  trend_granularity: TrendGranularity;
  consistency_trend: TrendPoint[];
  calendar_heatmap: any[];
  habit_timeline: any[];
  active_vs_archived: { active: number; archived: number };
  rest_days_details: {
    date: string;
    scope: 'whole_day' | 'habit';
    habit_name?: string;
    habit_color?: string;
    reason: string;
  }[];
}

export interface HabitInsightWidget {
  widget_type: string;
  title: string;
  data: any;
}

export interface HabitInsights {
  habit: Habit;
  time_filter: string;
  date_range: { start: string; end: string };
  denominator_explanation: string;
  eligible_units: number;
  completed_units: number;
  completion_rate: number;
  current_streak: number;
  longest_streak: number;
  streak_unit?: StreakUnit;
  rest_days_count: number;
  rest_days_list: any[];
  lifespan_periods: any[];
  notes: any[];
  widgets: HabitInsightWidget[];
}

// To-Do Types
export type TodoPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TodoStatus = 'pending' | 'completed' | 'cancelled';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export type RepeatFrequency = 'daily' | 'weekly' | 'monthly';

/** Recurrence rule of a repeating task (a "series"). weekdays: 1=Mon..7=Sun, weekly only. */
export interface Repeat {
  frequency: RepeatFrequency;
  /** 1..52 */
  interval: number;
  weekdays: number[];
  /** YYYY-MM-DD, or null to repeat forever. */
  end_date: string | null;
}

export type RepeatScope = 'this' | 'future' | 'all';

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  due_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_all_day?: boolean;
  location?: string | null;
  color?: string | null;
  priority: TodoPriority;
  category: string;
  status: TodoStatus;
  completed_at?: string | null;
  subtasks: Subtask[];
  series_id?: string | null;
  repeat?: Repeat | null;
  /** The goal this task serves, if any. */
  goal_id?: string | null;
  /** Set on a toggle / PATCH response when completing the task should ask whether its goal is done too. */
  goal_prompt?: GoalPrompt | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface TodoInsightsSummary {
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
  on_time_rate: number;
  completed_today: number;
  created_in_period: number;
  productive_streak: number;
  avg_completion_hours: number;
}

export interface TodoDailyTrendItem {
  /** First day the point covers. */
  date: string;
  label: string;
  completed: number;
  created: number;
}

export interface TodoPriorityItem {
  priority: string;
  total: number;
  completed: number;
  pending: number;
  rate: number;
}

export interface TodoCategoryItem {
  category: string;
  total: number;
  completed: number;
  pending: number;
  rate: number;
}

export interface TodoWeekdayItem {
  day: string;
  completed_count: number;
}

export interface TodoRecentCompletedItem {
  id: string;
  title: string;
  category: string;
  priority: string;
  completed_at: string | null;
}

export interface TodoInsightsData {
  time_filter: string;
  date_range: { start: string; end: string };
  trend_granularity: TrendGranularity;
  total_completed_in_range: number;
  summary: TodoInsightsSummary;
  completion_trend: TodoDailyTrendItem[];
  priority_breakdown: TodoPriorityItem[];
  category_breakdown: TodoCategoryItem[];
  weekday_productivity: TodoWeekdayItem[];
  recent_completed: TodoRecentCompletedItem[];
}

/* ---------- Goals ---------- */

/** A goal belongs to one year, month or Monday-to-Sunday week. */
export type GoalLevel = 'yearly' | 'monthly' | 'weekly';
/** simple: progress from sub-goals / tasks / done; target: a number to reach; checklist: ticked items. */
export type GoalMeasure = 'simple' | 'target' | 'checklist';
export type GoalStatus = 'active' | 'completed' | 'missed' | 'dropped';

export interface ChecklistItem {
  id?: string | null;
  title: string;
  completed: boolean;
}

/** "Is this goal done too?" after a linked task or the last sub-goal finished. */
export interface GoalPrompt {
  goal_id: string;
  title: string;
  level: GoalLevel;
  period_label: string;
  reason: 'task_completed' | 'target_reached' | 'children_completed';
  /** e.g. "5 / 5" */
  progress_label?: string | null;
}

export interface GoalLinkedTask {
  id: string;
  title: string;
  status: TodoStatus;
  due_date?: string | null;
  priority: TodoPriority;
  completed_at?: string | null;
}

export interface GoalLinkedHabit {
  id: string;
  name: string;
  color: string;
  type: HabitType;
  status: HabitStatus;
  /** Days ticked in the goal's period (clean days for cut-back habits). */
  days_done: number;
  /** Cut-back habits only. */
  slips: number;
}

export interface Goal {
  id: string;
  title: string;
  description?: string | null;
  color: string;
  level: GoalLevel;
  period_start: string;
  period_end: string;
  period_label: string;
  parent_id?: string | null;
  parent_title?: string | null;
  parent_level?: GoalLevel | null;
  measure: GoalMeasure;
  target?: number | null;
  manual_progress: number;
  checklist: ChecklistItem[];
  status: GoalStatus;
  completed_at?: string | null;
  ask_on_task_complete: boolean;
  carried_from_id?: string | null;
  carried_to_id?: string | null;
  sort_order: number;
  created_at: string;
  progress_value: number;
  progress_total: number;
  /** 0–100 */
  progress_pct: number;
  progress_label: string;
  tasks_total: number;
  tasks_completed: number;
  children_total: number;
  children_completed: number;
  habits_count: number;
  /** The period is over and the goal is still active. */
  needs_review: boolean;
  /** The period contains today. */
  is_current: boolean;
  /** On a PATCH that completed the goal: every sub-goal of its parent is now done. */
  parent_prompt?: GoalPrompt | null;
}

export interface GoalDetail extends Goal {
  children: Goal[];
  tasks: GoalLinkedTask[];
  habits: GoalLinkedHabit[];
  /** Outermost first. */
  ancestors: Goal[];
}

export interface GoalCurrent {
  today: string;
  week_start: string;
  month_start: string;
  year_start: string;
  weekly: Goal[];
  monthly: Goal[];
  yearly: Goal[];
  needs_review: Goal[];
}

export interface GoalLevelStat {
  level: GoalLevel;
  total: number;
  completed: number;
  missed: number;
  dropped: number;
  active: number;
  /** Goals with an outcome: completed, missed, or their period is over. */
  finished: number;
  /** completed / finished, 0–100; null until a goal of this level has finished. */
  rate: number | null;
}

export interface GoalTrendItem {
  period_start: string;
  label: string;
  total: number;
  completed: number;
}

export interface GoalTreeNode {
  id: string;
  title: string;
  level: GoalLevel;
  status: GoalStatus;
  color: string;
  period_label: string;
  progress_pct: number;
  tasks_completed: number;
  children: GoalTreeNode[];
}

export interface GoalTaskStat {
  goal_id: string;
  title: string;
  level: GoalLevel;
  color: string;
  tasks_completed: number;
  tasks_total: number;
}

export interface GoalInsightsSummary {
  total_goals: number;
  completed_goals: number;
  missed_goals: number;
  active_goals: number;
  completion_rate: number;
  perfect_week_streak: number;
  best_perfect_week_streak: number;
  tasks_completed_for_goals: number;
  tasks_completed_unlinked: number;
  /** Share of completed tasks that served a goal. */
  focus_pct: number;
}

export interface GoalInsights {
  time_filter: string;
  date_range: { start: string; end: string };
  summary: GoalInsightsSummary;
  by_level: GoalLevelStat[];
  weekly_trend: GoalTrendItem[];
  monthly_trend: GoalTrendItem[];
  trees: GoalTreeNode[];
  top_goals: GoalTaskStat[];
  missed: Goal[];
}

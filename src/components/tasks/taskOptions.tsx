import React from 'react';
import { Platform } from 'react-native';
import { Flag } from 'lucide-react-native';

import type { Todo, TodoPriority } from '@/api/types';
import { useToast, type MenuOption } from '@/components/ui';
import { useUpdateTodo } from '@/hooks/queries';
import { addDays, parseISODate, pluralize, PRIORITIES, PRIORITY_META, priorityColor, today } from '@/lib/format';
import type { Colors } from '@/theme/tokens';

/** Same suggestions as the web composer. */
export const DEFAULT_CATEGORIES = ['Personal', 'Work', 'Health', 'Learning', 'Finance', 'Errands'];
export const DEFAULT_CATEGORY = 'Personal';
export const DEFAULT_PRIORITY: TodoPriority = 'medium';

export type TodoView = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
export type TodoSort = 'smart' | 'due_date' | 'priority' | 'created';

export const VIEW_LABELS: Record<TodoView, string> = {
  all: 'All',
  today: 'Today',
  upcoming: 'Upcoming',
  overdue: 'Overdue',
  completed: 'Completed',
};

export const SORT_LABELS: Record<TodoSort, string> = {
  smart: 'Smart',
  due_date: 'Due date',
  priority: 'Priority',
  created: 'Date created',
};

/** Unique categories from tasks, optionally merged with the defaults. */
export function collectCategories(todos: Todo[] | undefined, withDefaults = false): string[] {
  const set = new Set<string>(withDefaults ? DEFAULT_CATEGORIES : []);
  for (const t of todos ?? []) if (t.category) set.add(t.category);
  return [...set].sort((a, b) => a.localeCompare(b));
}

const PRIORITY_RANK: Record<TodoPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Pending first, then P1 → P4 (the API's "priority" sort does not rank priorities). */
export function sortByPriority(todos: Todo[]): Todo[] {
  return [...todos].sort(
    (a, b) =>
      Number(a.status === 'completed') - Number(b.status === 'completed') ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
}

/** Flag icon in the priority's color. */
export function PriorityFlag({ priority, colors, size = 16 }: { priority: TodoPriority; colors: Colors; size?: number }) {
  const c = priorityColor(priority, colors);
  return <Flag size={size} color={c} fill={priority === 'low' ? 'transparent' : c} />;
}

/** ActionSheet options for P1–P4 with a checkmark on the current value. */
export function priorityMenu(
  value: TodoPriority | undefined,
  onSelect: (p: TodoPriority) => void,
  colors: Colors,
): MenuOption[] {
  return PRIORITIES.map((p) => ({
    label: PRIORITY_META[p].label,
    hint: PRIORITY_META[p].short,
    icon: <PriorityFlag priority={p} colors={colors} />,
    selected: value === p,
    onPress: () => onSelect(p),
  }));
}

/** Monday after this week (Todoist's "Next week"). */
export function nextWeek(ref = today()): string {
  const dow = (parseISODate(ref).getDay() + 6) % 7; // Mon=0
  return addDays(ref, 7 - dow);
}

/** Today / Tomorrow / Next week quick dates. */
export function quickDates(ref = today()) {
  return [
    { label: 'Today', value: ref },
    { label: 'Tomorrow', value: addDays(ref, 1) },
    { label: 'Next week', value: nextWeek(ref) },
  ];
}

export interface TaskSection {
  key: 'overdue' | 'today' | 'upcoming' | 'nodate' | 'completed' | 'list';
  title: string;
  items: Todo[];
}

/** Todoist-style smart grouping (web parity): Overdue, Today, Upcoming, No date, Completed. */
export function groupSmart(todos: Todo[], ref = today()): TaskSection[] {
  const groups: TaskSection[] = [
    { key: 'overdue', title: 'Overdue', items: [] },
    { key: 'today', title: 'Today', items: [] },
    { key: 'upcoming', title: 'Upcoming', items: [] },
    { key: 'nodate', title: 'No date', items: [] },
    { key: 'completed', title: 'Completed', items: [] },
  ];
  const by = Object.fromEntries(groups.map((g) => [g.key, g])) as Record<TaskSection['key'], TaskSection>;
  for (const t of todos) {
    if (t.status === 'completed') by.completed.items.push(t);
    else if (!t.due_date) by.nodate.items.push(t);
    else if (t.due_date < ref) by.overdue.items.push(t);
    else if (t.due_date === ref) by.today.items.push(t);
    else by.upcoming.items.push(t);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** Move a batch of tasks (overdue ones) to a new date with one toast. */
export function useReschedule() {
  const update = useUpdateTodo();
  const toast = useToast();
  return async (todos: Todo[], date: string) => {
    const results = await Promise.allSettled(
      todos.map((t) => update.mutateAsync({ id: t.id, patch: { due_date: date } })),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length) {
      const reason = (failed[0] as PromiseRejectedResult).reason;
      toast(reason instanceof Error ? reason.message : 'Could not reschedule', { tone: 'danger' });
    } else {
      toast(`Rescheduled ${pluralize(todos.length, 'task')}`, { tone: 'success' });
    }
  };
}

/** Random id for new subtasks. */
export function subtaskId(): string {
  return `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Run after an ActionSheet has finished sliding away. iOS cannot present a
 * second modal (picker sheet, input sheet) while the first is dismissing.
 */
export function afterSheet(fn: () => void) {
  setTimeout(fn, Platform.OS === 'ios' ? 380 : 0);
}

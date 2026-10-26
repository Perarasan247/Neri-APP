import type { Colors } from '@/theme/tokens';
import type { Todo } from '@/api/types';
import { priorityColor } from '@/lib/format';

export type CalendarView = 'schedule' | 'day' | '3days' | 'week' | 'month';

export const VIEW_LABELS: Record<CalendarView, string> = {
  schedule: 'Schedule',
  day: 'Day',
  '3days': '3 days',
  week: 'Week',
  month: 'Month',
};

export const VIEW_KEY = 'neri.calendarView';
export const LEGACY_VIEW_KEY = 'aura.calendarView';
export const DEFAULT_VIEW: CalendarView = '3days';

export const isCalendarView = (v: unknown): v is CalendarView => typeof v === 'string' && v in VIEW_LABELS;

/** Task's own colour, falling back to its priority colour. */
export const eventColor = (t: Todo, colors: Colors) =>
  t.color && /^#[0-9a-f]{6}$/i.test(t.color.trim()) ? t.color.trim() : priorityColor(t.priority, colors);

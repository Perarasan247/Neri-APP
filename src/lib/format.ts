/**
 * Date helpers. Dates travel as "YYYY-MM-DD" strings in the user's timezone
 * (from their profile, IST by default), exactly like the web app.
 */
import type { Colors } from '@/theme/tokens';
import type { HabitSchedule, HabitType, TodoPriority } from '@/api/types';

export const DEFAULT_TIME_ZONE = 'Asia/Kolkata';

let appTimeZone = DEFAULT_TIME_ZONE;

/** Set from the profile once it loads; every "today" in the app follows it. */
export function setAppTimeZone(tz?: string | null) {
  appTimeZone = tz || DEFAULT_TIME_ZONE;
}

export function getAppTimeZone(): string {
  return appTimeZone;
}

/** Parse "YYYY-MM-DD" as a local calendar date (avoids UTC shifts). */
export function parseISODate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Today as "YYYY-MM-DD" in the user's timezone. */
export function today(tz = appTimeZone): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

export function addDays(dateStr: string, delta: number): string {
  const d = parseISODate(dateStr);
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}

/** Monday of the week containing dateStr. */
export function startOfWeek(dateStr: string): string {
  const d = parseISODate(dateStr);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return addDays(dateStr, -dow);
}

/** Today · Tomorrow · Yesterday · Wednesday · 24 Oct · 24 Oct 2025 */
export function friendlyDate(dateStr: string, ref = today()): string {
  const diff = diffDays(dateStr, ref);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseISODate(dateStr);
  if (diff > 1 && diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  const sameYear = d.getFullYear() === parseISODate(ref).getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "Thursday, 22 Oct" */
export function longDate(dateStr: string): string {
  return parseISODate(dateStr).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

/** "Thu 22 Oct" */
export function shortDate(dateStr: string): string {
  return parseISODate(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "October 2026" */
export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** "18:30" / "18:30:00" → "6:30 pm" */
export function formatTime(t?: string | null): string {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** Display time range for a task, e.g. "6 – 7 pm" style "18:00–19:00". */
export function taskTimeLabel(t: { due_time?: string | null; start_time?: string | null; end_time?: string | null; is_all_day?: boolean }): string {
  if (t.is_all_day) return '';
  if (t.start_time && t.end_time) return `${formatTime(t.start_time)} – ${formatTime(t.end_time)}`;
  return formatTime(t.start_time || t.due_time);
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ---------- Priority ---------- */

export const PRIORITIES: TodoPriority[] = ['urgent', 'high', 'medium', 'low'];

export const PRIORITY_META: Record<TodoPriority, { label: string; short: string; token: 'p1' | 'p2' | 'p3' | 'p4' }> = {
  urgent: { label: 'Priority 1', short: 'P1', token: 'p1' },
  high: { label: 'Priority 2', short: 'P2', token: 'p2' },
  medium: { label: 'Priority 3', short: 'P3', token: 'p3' },
  low: { label: 'Priority 4', short: 'P4', token: 'p4' },
};

export const priorityColor = (p: TodoPriority | undefined, c: Colors) => c[PRIORITY_META[p ?? 'low']?.token ?? 'p4'];

/* ---------- Habits ---------- */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** "Every day", "Weekdays", "Mon, Wed, Fri", "3× a week" */
export function describeSchedule(s?: HabitSchedule | null): string {
  if (!s) return '';
  switch (s.frequency_type) {
    case 'daily':
      return 'Every day';
    case 'weekdays': {
      const days = [...(s.weekdays || [])].sort((a, b) => a - b);
      if (days.length === 7) return 'Every day';
      if (days.join() === '1,2,3,4,5') return 'Weekdays';
      if (days.join() === '6,7') return 'Weekends';
      return days.map((d) => DAY_NAMES[d - 1]).filter(Boolean).join(', ');
    }
    case 'times_per_week':
      return `${s.target_count ?? 1}× a week`;
    case 'times_per_month':
      return `${s.target_count ?? 1}× a month`;
    default:
      return '';
  }
}

export const HABIT_TYPE_META: Record<HabitType, { label: string; description: string }> = {
  build_yesno: { label: 'Yes / No', description: 'Did it or didn’t — e.g. meditate' },
  build_count: { label: 'Count', description: 'Reach a daily number — e.g. 8 glasses' },
  avoid_count: { label: 'Avoid', description: 'Stay clean, log slips — e.g. no junk food' },
};

/** "1 day", "3 weeks", "2 months": streaks count weeks or months for "N times a week / month" habits. */
export const streakText = (n: number, unit: 'day' | 'week' | 'month' = 'day') => `${n} ${unit}${n === 1 ? '' : 's'}`;

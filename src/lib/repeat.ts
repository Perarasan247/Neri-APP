/**
 * Pure helpers for repeating tasks: labels, presets and "first matching day".
 * No React or native imports so they can be unit-checked with plain node.
 */
import type { Repeat } from '@/api/types';
import { addDays, parseISODate } from '@/lib/format';

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

export const MAX_INTERVAL = 52;

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** ISO weekday of "YYYY-MM-DD": 1 = Mon … 7 = Sun. */
export function isoWeekday(date: string): number {
  return ((parseISODate(date).getDay() + 6) % 7) + 1;
}

const sorted = (days: number[]) => [...new Set(days)].sort((a, b) => a - b);
const dayList = (days: number[]) => sorted(days).map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
const same = (a: number[], b: number[]) => a.join() === sorted(b).join();

function endLabel(end: string): string {
  const d = parseISODate(end);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/**
 * "Every day", "Every weekday", "Every Mon, Wed, Fri", "Every 2 weeks on Mon",
 * "Every month on the 15th" (pass the task's `date` for the month day),
 * plus " until 20 Dec" when the series ends.
 */
export function describeRepeat(repeat?: Repeat | null, date?: string | null): string {
  if (!repeat) return "Doesn't repeat";
  const n = repeat.interval || 1;
  const days = sorted(repeat.weekdays ?? []);
  let label: string;

  switch (repeat.frequency) {
    case 'daily':
      label = n === 1 ? 'Every day' : `Every ${n} days`;
      break;
    case 'weekly':
      if (n === 1) {
        if (!days.length) label = 'Every week';
        else if (same(WEEKDAYS_MON_FRI, days)) label = 'Every weekday';
        else if (same(ALL_DAYS, days)) label = 'Every day';
        else label = `Every ${dayList(days)}`;
      } else {
        label = days.length ? `Every ${n} weeks on ${dayList(days)}` : `Every ${n} weeks`;
      }
      break;
    default: {
      const base = n === 1 ? 'Every month' : `Every ${n} months`;
      label = date ? `${base} on the ${ordinal(parseISODate(date).getDate())}` : base;
    }
  }

  return repeat.end_date ? `${label} until ${endLabel(repeat.end_date)}` : label;
}

/** The first day on or after `date` that fits the rule (only weekly rules with weekdays can move it). */
export function nextMatchingDate(date: string, repeat?: Repeat | null): string {
  if (!repeat || repeat.frequency !== 'weekly' || !repeat.weekdays?.length) return date;
  for (let i = 0; i < 7; i++) {
    const d = addDays(date, i);
    if (repeat.weekdays.includes(isoWeekday(d))) return d;
  }
  return date;
}

/** Same frequency, interval and weekdays (the end date is ignored). */
export function sameShape(a?: Repeat | null, b?: Repeat | null): boolean {
  if (!a || !b) return !a && !b;
  return a.frequency === b.frequency && a.interval === b.interval && same(sorted(a.weekdays ?? []), b.weekdays ?? []);
}

export interface RepeatPreset {
  key: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly';
  label: string;
  repeat: Repeat | null;
}

/** Quick choices for a task on `date`. "Custom…" is added by the sheet. */
export function repeatPresets(date: string): RepeatPreset[] {
  const d = parseISODate(date);
  const rule = (frequency: Repeat['frequency'], weekdays: number[] = []): Repeat => ({
    frequency,
    interval: 1,
    weekdays,
    end_date: null,
  });
  return [
    { key: 'none', label: "Doesn't repeat", repeat: null },
    { key: 'daily', label: 'Every day', repeat: rule('daily') },
    { key: 'weekdays', label: 'Every weekday', repeat: rule('weekly', WEEKDAYS_MON_FRI) },
    {
      key: 'weekly',
      label: `Every week on ${WEEKDAY_LONG[isoWeekday(date) - 1]}`,
      repeat: rule('weekly', [isoWeekday(date)]),
    },
    { key: 'monthly', label: `Every month on the ${ordinal(d.getDate())}`, repeat: rule('monthly') },
  ];
}

/** Which preset (if any) matches the current rule; null means "Custom". */
export function matchPreset(repeat: Repeat | null | undefined, date: string): RepeatPreset | null {
  return repeatPresets(date).find((p) => sameShape(p.repeat, repeat ?? null) && !repeat?.end_date) ?? null;
}

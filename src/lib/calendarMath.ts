/**
 * Pure calendar and clock helpers behind the themed date / time picker sheets.
 * Dates are "YYYY-MM-DD" strings, times are "HH:MM" 24h strings; no Date objects
 * cross the API, so nothing here depends on the device timezone.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const isLeapYear = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** `month` is 1–12. */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Weekday of the 1st, Monday = 0 … Sunday = 6. */
export function firstWeekdayIndex(year: number, month: number): number {
  // Sakamoto's algorithm gives Sunday = 0; shift so Monday = 0
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = month < 3 ? year - 1 : year;
  const sun0 = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + 1) % 7;
  return (sun0 + 6) % 7;
}

export const makeISO = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

export function splitISO(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month: month || 1, day: day || 1 };
}

/** Weekday of a date, Monday = 0. */
export const weekdayIndex = (iso: string) => {
  const { year, month, day } = splitISO(iso);
  return (firstWeekdayIndex(year, month) + day - 1) % 7;
};

/**
 * Month grid, Monday first: ISO strings for the days of the month with `null`
 * padding so the length is a whole number of weeks (28–42 cells).
 */
export function monthGrid(year: number, month: number): (string | null)[] {
  const cells: (string | null)[] = Array(firstWeekdayIndex(year, month)).fill(null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(makeISO(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** True when `iso` falls outside the inclusive `min` / `max` bounds. */
export const isOutOfRange = (iso: string, min?: string, max?: string) =>
  (!!min && iso < min) || (!!max && iso > max);

/** Pull a date inside the bounds. */
export const clampDate = (iso: string, min?: string, max?: string) =>
  min && iso < min ? min : max && iso > max ? max : iso;

/** Whether the month has at least one selectable day. */
export function monthHasSelectable(year: number, month: number, min?: string, max?: string): boolean {
  const first = makeISO(year, month, 1);
  const last = makeISO(year, month, daysInMonth(year, month));
  return !((min && last < min) || (max && first > max));
}

/** "Thursday 22 October" for screen readers. */
export function spokenDate(iso: string): string {
  const { month, day } = splitISO(iso);
  return `${WEEKDAY_NAMES[weekdayIndex(iso)]} ${day} ${MONTH_NAMES[month - 1]}`;
}

/* ---------- Time ---------- */

/** "HH:MM" or "HH:MM:SS" → parts, or null when malformed. */
export function parseTime(t?: string | null): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour > 23 || minute > 59 ? null : { hour, minute };
}

export const formatHHMM = (hour: number, minute: number) => `${pad(hour)}:${pad(minute)}`;

/** 24h hour → 12h clock hour (1–12) and meridiem. 0 → 12 am, 12 → 12 pm. */
export function to12h(hour24: number): { hour12: number; pm: boolean } {
  return { hour12: hour24 % 12 || 12, pm: hour24 >= 12 };
}

/** 12h clock hour (1–12) and meridiem → 24h hour. 12 am → 0, 12 pm → 12. */
export function to24h(hour12: number, pm: boolean): number {
  return (hour12 % 12) + (pm ? 12 : 0);
}

/** Minutes offered by a picker: every `step`, plus the current value when it is off-step. */
export function minuteOptions(step: number, current?: number): number[] {
  const s = Math.max(1, Math.min(60, Math.floor(step)));
  const list: number[] = [];
  for (let m = 0; m < 60; m += s) list.push(m);
  if (current !== undefined && !list.includes(current)) list.push(current);
  return list.sort((a, b) => a - b);
}

/**
 * Pure helpers for the virtualised, continuously scrolling time grid (no React / RN imports so they
 * can be unit-checked with plain node). Dates are "YYYY-MM-DD" strings; column index 0 is always a Monday.
 */

/** Days on each side of the initial week. A multiple of 7 so week snapping lines up with Mondays. */
export const HALF_RANGE = 1001;
/** Total scrollable day columns (about ±1000 days). */
export const TOTAL_DAYS = HALF_RANGE * 2;
/** Extra columns rendered on each side of the viewport. */
export const BUFFER = 4;
/** Days fetched on each side of the viewport centre. */
export const WINDOW_RADIUS = 21;
/** The fetched window only moves once the centre has drifted this many days. */
export const WINDOW_DRIFT = 7;

const MS_DAY = 86400000;

/** Whole days since the epoch for an ISO date (timezone independent). */
export function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / MS_DAY);
}

export function isoFromDayNumber(n: number): string {
  const d = new Date(n * MS_DAY);
  const y = d.getUTCFullYear();
  return `${String(y).padStart(4, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export const shiftDate = (iso: string, delta: number) => isoFromDayNumber(dayNumber(iso) + delta);

/** Monday of the week containing `iso`. */
export function snapToWeek(iso: string): string {
  const n = dayNumber(iso);
  // 1970-01-01 was a Thursday, so (n + 3) % 7 is 0 on Mondays.
  return isoFromDayNumber(n - ((((n + 3) % 7) + 7) % 7));
}

/** The date of column 0 for a grid that starts around `initial`. Always a Monday. */
export const gridOrigin = (initial: string) => shiftDate(snapToWeek(initial), -HALF_RANGE);

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Largest index a view of `span` columns can start at. */
export const maxFirstIndex = (span: number) => Math.max(0, TOTAL_DAYS - span);

export const indexToDate = (origin: string, index: number) => shiftDate(origin, index);
/** Unclamped column index of `date`; check `inRange` before scrolling to it. */
export const dateToIndex = (origin: string, date: string) => dayNumber(date) - dayNumber(origin);
export const inRange = (index: number, span: number) => index >= 0 && index <= maxFirstIndex(span);

/** Index of the leftmost (possibly partially visible) column for a scroll offset. */
export function firstVisibleIndex(offset: number, colW: number, span: number): number {
  if (colW <= 0) return 0;
  return clamp(Math.floor(offset / colW + 1e-6), 0, maxFirstIndex(span));
}

/** Inclusive [from, to] column indices to render. */
export function renderRange(first: number, span: number): [number, number] {
  return [Math.max(0, first - BUFFER), Math.min(TOTAL_DAYS - 1, first + span + BUFFER)];
}

/** Date at the centre of a viewport whose first column is `firstDate`. */
export const centerDate = (firstDate: string, span: number) => shiftDate(firstDate, Math.floor(span / 2));

/** Whether the fetch window should re-centre on `next` (drift of `threshold` days or more). */
export const shouldMoveWindow = (current: string, next: string, threshold = WINDOW_DRIFT) =>
  Math.abs(dayNumber(next) - dayNumber(current)) >= threshold;

/** [start, end] dates fetched around `center`. */
export const windowRange = (center: string, radius = WINDOW_RADIUS): [string, string] => [
  shiftDate(center, -radius),
  shiftDate(center, radius),
];

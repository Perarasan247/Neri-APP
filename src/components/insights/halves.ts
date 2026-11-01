/** Pooled completion rate of trend points (weighted by scheduled habits). */
export function pooledRate(points: { done: number; scheduled: number }[]): number | null {
  const scheduled = points.reduce((s, p) => s + (p.scheduled || 0), 0);
  const done = points.reduce((s, p) => s + (p.done || 0), 0);
  return scheduled > 0 ? (done / scheduled) * 100 : null;
}

/** Second half of the period vs. the first half, in rate points (as on web). */
export function halfRateChange(trend: { done: number; scheduled: number }[]): number | null {
  if (trend.length < 2) return null;
  const half = Math.floor(trend.length / 2);
  const a = pooledRate(trend.slice(0, half));
  const b = pooledRate(trend.slice(half));
  return a != null && b != null ? Math.round(b - a) : null;
}

/** Sum of a value over the 2nd half minus the 1st half. */
export function halfSumChange<T>(items: T[], value: (t: T) => number): number | null {
  if (items.length < 2) return null;
  const half = Math.floor(items.length / 2);
  const sum = (xs: T[]) => xs.reduce((s, x) => s + value(x), 0);
  return sum(items.slice(half)) - sum(items.slice(0, half));
}

/**
 * Pure helpers for the calendar time grid (no React / RN imports so they can be
 * unit-checked with plain node).
 */
import type { Todo } from '../../api/types';

export const MINUTES_PER_DAY = 1440;
/** Events shorter than this are drawn (and lane-packed) at this length. */
export const MIN_VISUAL_MINUTES = 30;

export interface LaneInput {
  id: string;
  /** minutes from midnight */
  start: number;
  end: number;
}

export interface LanePlacement {
  id: string;
  /** 0-based column within its overlap cluster */
  lane: number;
  /** total columns in its overlap cluster */
  lanes: number;
}

/**
 * Side-by-side layout for overlapping events. Events are grouped into clusters
 * of transitively overlapping items; inside a cluster each event takes the first
 * free lane, and every event in the cluster shares the cluster's lane count.
 */
export function assignLanes(items: LaneInput[]): LanePlacement[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const out: LanePlacement[] = [];
  let cluster: LanePlacement[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };

  for (const it of sorted) {
    if (cluster.length && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    clusterEnd = Math.max(clusterEnd, it.end);
    cluster.push({ id: it.id, lane, lanes: 1 });
  }
  flush();
  return out;
}

/** "HH:MM" / "HH:MM:SS" → minutes from midnight (NaN when invalid). */
export function toMinutes(t?: string | null): number {
  if (!t) return NaN;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h)) return NaN;
  return h * 60 + (m || 0);
}

/** Minutes → "HH:MM". */
export function fromMinutes(min: number): string {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

type TimedFields = Pick<Todo, 'is_all_day' | 'start_time' | 'due_time' | 'end_time'>;

/** All-day tasks, and dated tasks with no time at all, go in the all-day row. */
export function isAllDayTask(t: TimedFields): boolean {
  if (t.is_all_day) return true;
  return Number.isNaN(toMinutes(t.start_time || t.due_time));
}

/** Start/end in minutes for a timed task (end falls back to start + 1h, capped at midnight). */
export function taskSpan(t: TimedFields): { start: number; end: number } {
  const start = Math.min(toMinutes(t.start_time || t.due_time), MINUTES_PER_DAY - 1);
  let end = toMinutes(t.end_time);
  if (Number.isNaN(end) || end <= start) end = start + 60;
  return { start, end: Math.min(end, MINUTES_PER_DAY) };
}

export interface PlacedEvent {
  todo: Todo;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/** Timed tasks of one day with their lane placement. */
export function placeDayEvents(tasks: Todo[]): PlacedEvent[] {
  const timed = tasks.filter((t) => !isAllDayTask(t));
  const spans = new Map<string, { start: number; end: number }>();
  const inputs: LaneInput[] = timed.map((t) => {
    const s = taskSpan(t);
    spans.set(t.id, s);
    return { id: t.id, start: s.start, end: Math.max(s.end, s.start + MIN_VISUAL_MINUTES) };
  });
  const byId = new Map(timed.map((t) => [t.id, t]));
  return assignLanes(inputs).map((p) => ({
    todo: byId.get(p.id)!,
    ...spans.get(p.id)!,
    lane: p.lane,
    lanes: p.lanes,
  }));
}

/** Group tasks by due_date. */
export function groupByDate(tasks: Todo[]): Map<string, Todo[]> {
  const map = new Map<string, Todo[]>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    const list = map.get(t.due_date);
    if (list) list.push(t);
    else map.set(t.due_date, [t]);
  }
  return map;
}

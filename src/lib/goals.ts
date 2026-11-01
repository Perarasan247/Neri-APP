/**
 * Goal periods, mirroring backend/app/goals.py: a goal belongs to one year, month or
 * Monday-to-Sunday week, and may only point at a bigger goal whose period overlaps its own.
 * Dates are "YYYY-MM-DD" strings, like everywhere else in the app.
 */
import type { GoalPatch } from '@/api/endpoints';
import type { Goal, GoalLevel, GoalMeasure, GoalPrompt, GoalStatus } from '@/api/types';
import { addDays, startOfWeek } from './format';

export const GOAL_LEVELS: GoalLevel[] = ['yearly', 'monthly', 'weekly'];
const RANK: Record<GoalLevel, number> = { yearly: 0, monthly: 1, weekly: 2 };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
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

export const LEVEL_META: Record<GoalLevel, { label: string; unit: string; adjective: string; tab: string }> = {
  yearly: { label: 'Yearly', unit: 'year', adjective: 'Yearly', tab: 'Year' },
  monthly: { label: 'Monthly', unit: 'month', adjective: 'Monthly', tab: 'Month' },
  weekly: { label: 'Weekly', unit: 'week', adjective: 'Weekly', tab: 'Week' },
};

export const MEASURE_META: Record<GoalMeasure, { label: string; hint: string }> = {
  simple: { label: 'Simple', hint: 'Progress comes from sub-goals or linked tasks, or you just tick it off.' },
  target: { label: 'Number', hint: 'Reach a number, e.g. solve 5 problems. Completed linked tasks count too.' },
  checklist: { label: 'Checklist', hint: 'A short list of things to get done.' },
};

export const STATUS_META: Record<GoalStatus, { label: string; tone: 'accent' | 'success' | 'danger' | 'neutral' }> = {
  active: { label: 'Active', tone: 'accent' },
  completed: { label: 'Completed', tone: 'success' },
  missed: { label: 'Missed', tone: 'danger' },
  dropped: { label: 'Dropped', tone: 'neutral' },
};

const parts = (d: string) => d.split('-').map(Number) as [number, number, number];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** First day of the period containing `d`. */
export function snapPeriod(level: GoalLevel, d: string): string {
  const [y, m] = parts(d);
  if (level === 'yearly') return iso(y, 1, 1);
  if (level === 'monthly') return iso(y, m, 1);
  return startOfWeek(d);
}

/** First day of the period after the one starting at `start` (any date inside works too). */
export function nextPeriod(level: GoalLevel, start: string): string {
  const s = snapPeriod(level, start);
  const [y, m] = parts(s);
  if (level === 'yearly') return iso(y + 1, 1, 1);
  if (level === 'monthly') return m === 12 ? iso(y + 1, 1, 1) : iso(y, m + 1, 1);
  return addDays(s, 7);
}

export function prevPeriod(level: GoalLevel, start: string): string {
  const s = snapPeriod(level, start);
  const [y, m] = parts(s);
  if (level === 'yearly') return iso(y - 1, 1, 1);
  if (level === 'monthly') return m === 1 ? iso(y - 1, 12, 1) : iso(y, m - 1, 1);
  return addDays(s, -7);
}

/** Step `n` periods forward (or back, for negative n). */
export function shiftPeriod(level: GoalLevel, start: string, n: number): string {
  let s = snapPeriod(level, start);
  for (let i = 0; i < Math.abs(n); i++) s = n > 0 ? nextPeriod(level, s) : prevPeriod(level, s);
  return s;
}

export function periodEnd(level: GoalLevel, start: string): string {
  return addDays(nextPeriod(level, start), -1);
}

/** Same text as the server: "2026", "November 2026", "2–8 Nov 2026", "27 Oct – 2 Nov 2026". */
export function periodLabel(level: GoalLevel, start: string): string {
  const s = snapPeriod(level, start);
  const [y, m, d] = parts(s);
  if (level === 'yearly') return String(y);
  if (level === 'monthly') return `${MONTHS_LONG[m - 1]} ${y}`;
  const [ey, em, ed] = parts(addDays(s, 6));
  if (y !== ey) return `${d} ${MONTHS[m - 1]} ${y} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  if (m !== em) return `${d} ${MONTHS[m - 1]} – ${ed} ${MONTHS[em - 1]} ${ey}`;
  return `${d}–${ed} ${MONTHS[m - 1]} ${y}`;
}

/** "This week" / "Last month" / "Next year", or null for any other period. */
export function relativePeriod(level: GoalLevel, start: string, today: string): string | null {
  const cur = snapPeriod(level, today);
  const s = snapPeriod(level, start);
  const unit = LEVEL_META[level].unit;
  if (s === cur) return `This ${unit}`;
  if (s === prevPeriod(level, cur)) return `Last ${unit}`;
  if (s === nextPeriod(level, cur)) return `Next ${unit}`;
  return null;
}

/** Short label for chips and pickers: "This week", "Nov 2026", "2026". */
export function shortPeriod(level: GoalLevel, start: string, today: string): string {
  const rel = relativePeriod(level, start, today);
  if (rel) return rel;
  if (level === 'monthly') {
    const [y, m] = parts(start);
    return `${MONTHS[m - 1]} ${y}`;
  }
  return periodLabel(level, start);
}

export function overlaps(aLevel: GoalLevel, aStart: string, bLevel: GoalLevel, bStart: string): boolean {
  const a = snapPeriod(aLevel, aStart);
  const b = snapPeriod(bLevel, bStart);
  return a <= periodEnd(bLevel, b) && b <= periodEnd(aLevel, a);
}

export const isBigger = (parent: GoalLevel, child: GoalLevel) => RANK[parent] < RANK[child];

/** The next level down: yearly → monthly → weekly → null. */
export function smallerLevel(level: GoalLevel): GoalLevel | null {
  return level === 'yearly' ? 'monthly' : level === 'monthly' ? 'weekly' : null;
}

/**
 * Periods that can hold a parent for a goal of `level` starting at `start`: every bigger
 * level's period overlapping it. A week spanning two months (or years) yields both.
 */
export function parentCandidatePeriods(level: GoalLevel, start: string): { level: GoalLevel; period: string }[] {
  const s = snapPeriod(level, start);
  const e = periodEnd(level, s);
  const out: { level: GoalLevel; period: string }[] = [];
  for (const parent of GOAL_LEVELS) {
    if (!isBigger(parent, level)) continue;
    const seen = new Set<string>();
    for (const d of [s, e]) {
      const p = snapPeriod(parent, d);
      if (!seen.has(p)) {
        seen.add(p);
        out.push({ level: parent, period: p });
      }
    }
  }
  return out;
}

/** Can `parent` hold a goal of `level` in the period starting at `start`? */
export function isValidParent(parent: Pick<Goal, 'level' | 'period_start' | 'status'>, level: GoalLevel, start: string) {
  return parent.status !== 'dropped' && isBigger(parent.level, level) && overlaps(level, start, parent.level, parent.period_start);
}

/** "Weekly goal: Solve 5 problems" */
export function promptTitle(p: GoalPrompt): string {
  return `${LEVEL_META[p.level].adjective} goal: ${p.title}`;
}

export function promptMessage(p: GoalPrompt): string {
  if (p.reason === 'target_reached')
    return `Target reached${p.progress_label ? ` (${p.progress_label})` : ''}. Mark the goal complete?`;
  if (p.reason === 'children_completed')
    return `Every sub-goal is done${p.progress_label ? ` (${p.progress_label})` : ''}. Is this goal complete too?`;
  return 'Is this goal complete too?';
}

/**
 * Optimistic view of a goal after a PATCH: recomputes what the client can
 * (manual counter, checklist, status). Everything else waits for the server.
 */
export function applyGoalPatch<T extends Goal>(g: T, patch: GoalPatch): T {
  const next: T = { ...g };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.color) next.color = patch.color;
  if (patch.ask_on_task_complete !== undefined) next.ask_on_task_complete = patch.ask_on_task_complete;
  if (patch.status) {
    next.status = patch.status;
    next.needs_review = false;
  }
  if (patch.manual_progress !== undefined && g.measure === 'target') {
    const value = Math.max(0, patch.manual_progress) + g.tasks_completed;
    next.manual_progress = Math.max(0, patch.manual_progress);
    next.progress_value = value;
    next.progress_label = `${value} / ${g.progress_total}`;
    next.progress_pct = g.progress_total ? Math.min(100, (value / g.progress_total) * 100) : 0;
  }
  if (patch.checklist && g.measure === 'checklist') {
    const done = patch.checklist.filter((i) => i.completed).length;
    next.checklist = patch.checklist;
    next.progress_value = done;
    next.progress_total = patch.checklist.length;
    next.progress_label = `${done} / ${patch.checklist.length} items`;
    next.progress_pct = patch.checklist.length ? (done / patch.checklist.length) * 100 : 0;
  }
  if (next.status === 'completed') next.progress_pct = 100;
  return next;
}

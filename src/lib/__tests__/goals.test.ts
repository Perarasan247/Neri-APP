import type { Goal } from '@/api/types';
import {
  applyGoalPatch,
  isValidParent,
  nextPeriod,
  overlaps,
  parentCandidatePeriods,
  periodEnd,
  periodLabel,
  prevPeriod,
  promptMessage,
  promptTitle,
  relativePeriod,
  shiftPeriod,
  snapPeriod,
} from '@/lib/goals';

describe('goal periods', () => {
  it('snaps any date to the start of its week (Monday), month and year', () => {
    expect(snapPeriod('weekly', '2026-11-01')).toBe('2026-10-26'); // Sunday → Monday before
    expect(snapPeriod('weekly', '2026-11-02')).toBe('2026-11-02');
    expect(snapPeriod('monthly', '2026-11-19')).toBe('2026-11-01');
    expect(snapPeriod('yearly', '2026-11-19')).toBe('2026-01-01');
  });

  it('steps periods across month and year boundaries', () => {
    expect(nextPeriod('monthly', '2026-12-01')).toBe('2027-01-01');
    expect(prevPeriod('monthly', '2026-01-15')).toBe('2025-12-01');
    expect(nextPeriod('weekly', '2026-12-28')).toBe('2027-01-04');
    expect(prevPeriod('yearly', '2026-06-01')).toBe('2025-01-01');
    expect(shiftPeriod('monthly', '2026-11-01', -13)).toBe('2025-10-01');
  });

  it('knows where periods end', () => {
    expect(periodEnd('weekly', '2026-10-26')).toBe('2026-11-01');
    expect(periodEnd('monthly', '2028-02-01')).toBe('2028-02-29');
    expect(periodEnd('yearly', '2026-01-01')).toBe('2026-12-31');
  });

  it('labels periods like the server', () => {
    expect(periodLabel('yearly', '2026-01-01')).toBe('2026');
    expect(periodLabel('monthly', '2026-11-01')).toBe('November 2026');
    expect(periodLabel('weekly', '2026-11-02')).toBe('2–8 Nov 2026');
    expect(periodLabel('weekly', '2026-10-26')).toBe('26 Oct – 1 Nov 2026');
    expect(periodLabel('weekly', '2026-12-28')).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('names the current, previous and next period', () => {
    expect(relativePeriod('weekly', '2026-10-26', '2026-11-01')).toBe('This week');
    expect(relativePeriod('monthly', '2026-10-01', '2026-11-01')).toBe('Last month');
    expect(relativePeriod('yearly', '2027-01-01', '2026-11-01')).toBe('Next year');
    expect(relativePeriod('monthly', '2026-01-01', '2026-11-01')).toBeNull();
  });
});

describe('goal parents', () => {
  it('offers both months (and years) for a week that spans them', () => {
    expect(parentCandidatePeriods('weekly', '2026-10-28')).toEqual([
      { level: 'yearly', period: '2026-01-01' },
      { level: 'monthly', period: '2026-10-01' },
      { level: 'monthly', period: '2026-11-01' },
    ]);
    expect(parentCandidatePeriods('weekly', '2026-12-30')).toEqual([
      { level: 'yearly', period: '2026-01-01' },
      { level: 'yearly', period: '2027-01-01' },
      { level: 'monthly', period: '2026-12-01' },
      { level: 'monthly', period: '2027-01-01' },
    ]);
    expect(parentCandidatePeriods('monthly', '2026-11-01')).toEqual([{ level: 'yearly', period: '2026-01-01' }]);
    expect(parentCandidatePeriods('yearly', '2026-01-01')).toEqual([]);
  });

  it('only accepts a bigger, overlapping, non-dropped parent', () => {
    const month = { level: 'monthly' as const, period_start: '2026-11-01', status: 'active' as const };
    expect(isValidParent(month, 'weekly', '2026-10-26')).toBe(true); // week ends 1 Nov
    expect(isValidParent(month, 'weekly', '2026-10-19')).toBe(false);
    expect(isValidParent(month, 'monthly', '2026-11-01')).toBe(false);
    expect(isValidParent({ ...month, status: 'dropped' }, 'weekly', '2026-11-02')).toBe(false);
    expect(overlaps('weekly', '2026-12-28', 'yearly', '2027-01-01')).toBe(true);
  });
});

describe('goal prompts and patches', () => {
  const goal: Goal = {
    id: 'g1',
    title: 'Solve 5 problems',
    color: '#635bff',
    level: 'weekly',
    period_start: '2026-10-26',
    period_end: '2026-11-01',
    period_label: '26 Oct – 1 Nov 2026',
    measure: 'target',
    target: 5,
    manual_progress: 1,
    checklist: [],
    status: 'active',
    ask_on_task_complete: true,
    sort_order: 0,
    created_at: '2026-10-26T00:00:00',
    progress_value: 3,
    progress_total: 5,
    progress_pct: 60,
    progress_label: '3 / 5',
    tasks_total: 3,
    tasks_completed: 2,
    children_total: 0,
    children_completed: 0,
    habits_count: 0,
    needs_review: false,
    is_current: true,
  };

  it('words the prompt for each reason', () => {
    const p = { goal_id: 'g1', title: 'Solve 5 problems', level: 'weekly' as const, period_label: '', progress_label: '5 / 5' };
    expect(promptTitle({ ...p, reason: 'task_completed' })).toBe('Weekly goal: Solve 5 problems');
    expect(promptMessage({ ...p, reason: 'task_completed' })).toBe('Is this goal complete too?');
    expect(promptMessage({ ...p, reason: 'target_reached' })).toBe('Target reached (5 / 5). Mark the goal complete?');
  });

  it('recomputes target progress from the manual counter plus completed tasks', () => {
    const next = applyGoalPatch(goal, { manual_progress: 3 });
    expect(next.progress_value).toBe(5);
    expect(next.progress_label).toBe('5 / 5');
    expect(next.progress_pct).toBe(100);
  });

  it('recomputes checklist progress and pins completed goals at 100%', () => {
    const list = applyGoalPatch(
      { ...goal, measure: 'checklist' },
      { checklist: [{ id: 'a', title: 'A', completed: true }, { id: 'b', title: 'B', completed: false }] },
    );
    expect(list.progress_label).toBe('1 / 2 items');
    expect(list.progress_pct).toBe(50);
    expect(applyGoalPatch(goal, { status: 'completed' }).progress_pct).toBe(100);
  });
});

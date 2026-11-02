import type { Todo } from '@/api/types';
import { sortTodos, todoMatchesQuery } from '../todoFilters';

const TODAY = '2026-11-02';
const t = (o: Partial<Todo> & { show_in_tasks?: boolean } = {}): Todo & { show_in_tasks?: boolean } => ({
  id: o.id ?? 'x',
  user_id: 'u',
  title: 'Buy milk',
  priority: 'medium',
  category: 'Personal',
  status: 'pending',
  subtasks: [],
  sort_order: 0,
  created_at: '2026-11-02T10:00:00',
  updated_at: '2026-11-02T10:00:00',
  due_date: TODAY,
  ...o,
});

describe('todoMatchesQuery', () => {
  it('applies the date views the way the server does', () => {
    expect(todoMatchesQuery(t(), { view: 'today' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t({ status: 'completed' }), { view: 'today' }, TODAY)).toBe(false);
    expect(todoMatchesQuery(t({ due_date: '2026-11-05' }), { view: 'upcoming' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t({ due_date: TODAY }), { view: 'upcoming' }, TODAY)).toBe(false);
    expect(todoMatchesQuery(t({ due_date: '2026-10-30' }), { view: 'overdue' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t({ due_date: null }), { view: 'overdue' }, TODAY)).toBe(false);
    expect(todoMatchesQuery(t({ status: 'completed' }), { view: 'completed' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t(), { view: 'pending' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t(), {}, TODAY)).toBe(true);
  });

  it('applies a date range, which excludes tasks without a date', () => {
    const q = { start_date: '2026-11-01', end_date: '2026-11-07' };
    expect(todoMatchesQuery(t(), q, TODAY)).toBe(true);
    expect(todoMatchesQuery(t({ due_date: '2026-11-08' }), q, TODAY)).toBe(false);
    expect(todoMatchesQuery(t({ due_date: null }), q, TODAY)).toBe(false);
  });

  it('filters by category, priority and search, ignoring "all"', () => {
    expect(todoMatchesQuery(t(), { category: 'Work' }, TODAY)).toBe(false);
    expect(todoMatchesQuery(t(), { category: 'All' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t({ priority: 'high' }), { priority: 'high' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t(), { priority: 'urgent' }, TODAY)).toBe(false);
    expect(todoMatchesQuery(t(), { search: ' MILK ' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t({ description: 'at the shop' }), { search: 'shop' }, TODAY)).toBe(true);
    expect(todoMatchesQuery(t(), { search: 'bread' }, TODAY)).toBe(false);
  });

  it('hides calendar-only events from task lists but not from the calendar', () => {
    const event = t({ show_in_tasks: false });
    expect(todoMatchesQuery(event, {}, TODAY)).toBe(false);
    expect(todoMatchesQuery(event, { surface: 'calendar' }, TODAY)).toBe(true);
  });
});

describe('sortTodos', () => {
  const a = t({ id: 'a', due_date: '2026-11-04', priority: 'low' });
  const b = t({ id: 'b', due_date: '2026-10-30', priority: 'low' }); // overdue
  const c = t({ id: 'c', due_date: '2026-11-04', priority: 'urgent' });
  const d = t({ id: 'd', due_date: '2026-11-01', status: 'completed' });
  const e = t({ id: 'e', due_date: null, priority: 'high' });
  const ids = (l: Todo[]) => l.map((x) => x.id).join('');

  it('smart: overdue first, then date, priority; done and undated last-ish like the server', () => {
    expect(ids(sortTodos([a, b, c, d, e], 'smart', TODAY))).toBe('bcaed');
  });
  it('due_date: undated last', () => {
    expect(ids(sortTodos([e, a, b], 'due_date', TODAY))).toBe('bae');
  });
  it('priority: open tasks first, urgent to low', () => {
    expect(ids(sortTodos([a, d, c, e], 'priority', TODAY))).toBe('cead');
  });
  it('created: newest first, input untouched', () => {
    const old = t({ id: 'o', created_at: '2026-01-01T00:00:00' });
    const input = [old, a];
    expect(ids(sortTodos(input, 'created', TODAY))).toBe('ao');
    expect(ids(input)).toBe('oa');
  });
});

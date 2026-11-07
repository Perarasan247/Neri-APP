import { splitForOutbox, widgetActionToOp } from '../convert';
import { applyQueue, isOwnedBy, type WidgetAction, type WidgetSnapshot } from '../store';

const act = (a: Record<string, unknown>) => ({ id: 'x', at: 100, ...a }) as WidgetAction;

describe('widget taps as outbox operations', () => {
  it('turns taps into absolute, replay-safe operations', () => {
    expect(widgetActionToOp(act({ kind: 'habit_set', habitId: 'h', date: '2026-11-01', done: true }))).toEqual({
      type: 'upsertLog',
      body: { habit_id: 'h', log_date: '2026-11-01', count: 1, status: 'done' },
    });
    expect(widgetActionToOp(act({ kind: 'habit_inc', habitId: 'h', date: 'd', delta: 1, count: 3 }))).toMatchObject({
      type: 'upsertLog',
      body: { count: 3 },
    });
    expect(widgetActionToOp(act({ kind: 'todo_toggle', todoId: 't', done: false }))).toEqual({
      type: 'updateTodo',
      id: 't',
      patch: { status: 'pending' },
      scope: 'this',
    });
    expect(widgetActionToOp(act({ kind: 'todo_create', clientId: 'abcdefgh', title: 'Milk', date: null }))).toEqual({
      type: 'createTodo',
      body: { client_id: 'abcdefgh', title: 'Milk' },
    });
  });

  it('leaves what cannot be absolute in the widget queue (flips, new habits, taps on them)', () => {
    const queue = [
      act({ kind: 'todo_toggle', todoId: 't' }),
      act({ kind: 'habit_create', tempId: 'tmp-1', name: 'Run', date: 'd', target: null, color: '#fff' }),
      act({ kind: 'habit_set', habitId: 'tmp-1', date: 'd', done: true }),
      act({ kind: 'habit_set', habitId: 'real', date: 'd', done: true, at: 7 }),
    ];
    const { take, keep } = splitForOutbox(queue);
    expect(take).toHaveLength(1);
    expect(take[0].createdAt).toBe(7);
    expect(keep).toHaveLength(3);
  });
});

describe('widget owners', () => {
  const snap = { owner: 'u:alice', date: '2026-11-01', habits: [{ id: 'h', done: false, count: 0, streak: 0, target: null }], today: [], inbox: [] } as unknown as WidgetSnapshot;
  it('only applies a tap to its own account’s snapshot', () => {
    const mine = act({ kind: 'habit_set', habitId: 'h', date: '2026-11-01', done: true, owner: 'u:alice' });
    const theirs = act({ kind: 'habit_set', habitId: 'h', date: '2026-11-01', done: true, owner: 'u:bob' });
    expect(applyQueue(snap, [theirs]).habits[0].done).toBe(false);
    expect(applyQueue(snap, [mine]).habits[0].done).toBe(true);
  });
  it('treats untagged (older) taps as the signed-in account’s', () => {
    expect(isOwnedBy(act({ kind: 'todo_toggle', todoId: 't' }), 'u:alice')).toBe(true);
    expect(isOwnedBy(act({ kind: 'todo_toggle', todoId: 't', owner: 'u:bob' }), 'u:alice')).toBe(false);
  });
  it('a recorded status is applied as given, not flipped', () => {
    const s = { ...snap, today: [{ id: 't', done: true }], inbox: [{ id: 't', done: true }] } as unknown as WidgetSnapshot;
    const once = applyQueue(s, [act({ kind: 'todo_toggle', todoId: 't', done: true })]);
    expect(once.today[0].done).toBe(true);
  });
});

describe('editor actions', () => {
  it('hands task edits, deletes and values to the outbox; habit deletes stay', () => {
    expect(widgetActionToOp(act({ kind: 'todo_update', todoId: 't', title: 'New', date: null }))).toEqual({
      type: 'updateTodo',
      id: 't',
      patch: { title: 'New', due_date: null },
      scope: 'this',
    });
    expect(widgetActionToOp(act({ kind: 'todo_delete', todoId: 't' }))).toEqual({ type: 'deleteTodo', id: 't', scope: 'this' });
    expect(widgetActionToOp(act({ kind: 'habit_value', habitId: 'h', date: '2026-11-01', value: 3, clientId: 'c' }))).toEqual({
      type: 'addValue',
      body: { habit_id: 'h', entry_date: '2026-11-01', value: 3, client_id: 'c' },
    });
    expect(widgetActionToOp(act({ kind: 'habit_value', habitId: 'tmp-1', date: '2026-11-01', value: 3, clientId: 'c' }))).toBeNull();
    expect(widgetActionToOp(act({ kind: 'habit_delete', habitId: 'h', keepData: true }))).toBeNull();
  });
});

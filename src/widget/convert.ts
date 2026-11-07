/**
 * Widget taps that can be handed to the app's outbox, so the app replays everything in one time order.
 * Pure. A tap on a habit that doesn't exist on the server yet (temporary id) stays in the widget queue.
 */
import type { OutboxOp } from '@/offline/outbox';

import type { WidgetAction } from './store';

const TEMP = /^tmp-/;

export function widgetActionToOp(a: WidgetAction): OutboxOp | null {
  switch (a.kind) {
    case 'habit_set':
      if (TEMP.test(a.habitId)) return null;
      return { type: 'upsertLog', body: { habit_id: a.habitId, log_date: a.date, count: a.done ? 1 : 0, status: 'done' } };
    case 'habit_inc':
      if (TEMP.test(a.habitId)) return null;
      return a.count !== undefined
        ? { type: 'upsertLog', body: { habit_id: a.habitId, log_date: a.date, count: a.count, status: 'done' } }
        : { type: 'incrementLog', body: { habit_id: a.habitId, log_date: a.date, delta: a.delta } };
    case 'todo_toggle':
      // A legacy "flip" can't be expressed as an absolute change
      return a.done === undefined
        ? null
        : { type: 'updateTodo', id: a.todoId, patch: { status: a.done ? 'completed' : 'pending' }, scope: 'this' };
    case 'todo_create':
      return { type: 'createTodo', body: { client_id: a.clientId, title: a.title, ...(a.date ? { due_date: a.date } : {}) } };
    case 'habit_value':
      if (TEMP.test(a.habitId)) return null;
      return { type: 'addValue', body: { habit_id: a.habitId, entry_date: a.date, value: a.value, client_id: a.clientId } };
    case 'todo_update':
      return {
        type: 'updateTodo',
        id: a.todoId,
        patch: { ...(a.title !== undefined ? { title: a.title } : {}), ...(a.date !== undefined ? { due_date: a.date } : {}) },
        scope: 'this',
      };
    case 'todo_delete':
      return { type: 'deleteTodo', id: a.todoId, scope: 'this' };
    case 'habit_create':
    case 'habit_delete':
      // The outbox has no habit create/delete: these stay in the widget's own queue
      return null;
  }
}

/** Split a queue into what the outbox can take (with the tap's own time) and what must stay. */
export function splitForOutbox(queue: WidgetAction[]): { take: { op: OutboxOp; createdAt: number }[]; keep: WidgetAction[] } {
  const take: { op: OutboxOp; createdAt: number }[] = [];
  const keep: WidgetAction[] = [];
  for (const a of queue) {
    const op = widgetActionToOp(a);
    if (op) take.push({ op, createdAt: a.at });
    else keep.push(a);
  }
  return { take, keep };
}

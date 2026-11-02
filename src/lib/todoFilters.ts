/**
 * Client-side copy of the server's task list rules (backend routers/todos.py `list_todos`), used to
 * place a task created offline into the lists that are already cached. The server stays the source
 * of truth: everything is refetched after sync.
 */
import type { TodoQuery } from '@/api/endpoints';
import type { Todo } from '@/api/types';

/** Whether `todo` belongs in the list the server would return for `q` (`today` is YYYY-MM-DD). */
export function todoMatchesQuery(todo: Todo & { show_in_tasks?: boolean }, q: TodoQuery, today: string): boolean {
  if ((q.surface ?? 'tasks') !== 'calendar' && todo.show_in_tasks === false) return false;

  const due = todo.due_date ?? null;
  if (q.start_date && !(due && due >= q.start_date)) return false;
  if (q.end_date && !(due && due <= q.end_date)) return false;

  switch (q.view) {
    case 'today':
      if (!(due === today && todo.status !== 'completed')) return false;
      break;
    case 'upcoming':
      if (!(due && due > today && todo.status !== 'completed')) return false;
      break;
    case 'overdue':
      if (!(due && due < today && todo.status !== 'completed')) return false;
      break;
    case 'completed':
      if (todo.status !== 'completed') return false;
      break;
    case 'pending':
      if (todo.status !== 'pending') return false;
      break;
  }

  if (q.category && q.category.toLowerCase() !== 'all' && todo.category !== q.category) return false;
  if (q.priority && q.priority.toLowerCase() !== 'all' && todo.priority !== q.priority) return false;

  if (q.search) {
    const needle = q.search.trim().toLowerCase();
    const hay = [todo.title, todo.description ?? '', todo.category].join('\n').toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_WEIGHT: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

/** Sort like the server (`sort_by`: smart | due_date | priority | created). Stable; returns a new array. */
export function sortTodos(list: Todo[], sortBy: string | undefined, today: string): Todo[] {
  const due = (t: Todo) => t.due_date ?? '9999-12-31';
  const newest = (a: Todo, b: Todo) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);
  const out = list.slice();
  if (sortBy === 'due_date') {
    out.sort((a, b) => (due(a) < due(b) ? -1 : due(a) > due(b) ? 1 : newest(a, b)));
  } else if (sortBy === 'priority') {
    out.sort((a, b) => {
      const done = Number(a.status === 'completed') - Number(b.status === 'completed');
      if (done) return done;
      const rank = (PRIORITY_RANK[a.priority] ?? 4) - (PRIORITY_RANK[b.priority] ?? 4);
      if (rank) return rank;
      return due(a) < due(b) ? -1 : due(a) > due(b) ? 1 : newest(a, b);
    });
  } else if (sortBy === 'created') {
    out.sort(newest);
  } else {
    // smart: open first, overdue first, then by date, then priority
    out.sort((a, b) => {
      const key = (t: Todo) => [
        t.status === 'completed' ? 1 : 0,
        t.due_date && t.due_date < today && t.status !== 'completed' ? 0 : 1,
        due(t),
        -(PRIORITY_WEIGHT[t.priority] ?? 1),
      ];
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] < kb[i]) return -1;
        if (ka[i] > kb[i]) return 1;
      }
      return 0;
    });
  }
  return out;
}

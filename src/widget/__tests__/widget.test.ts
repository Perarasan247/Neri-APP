/**
 * Widget logic without a device: optimistic updates, and rendering every
 * page/state through the library's own tree builder (the same validation that
 * runs before Android draws the widget).
 */
import { editUri, MAX_ROWS, quickAddUri, renderNeriWidget, rowLimit } from '../NeriWidget';
import { applyAction, applyQueue, DEFAULT_VIEW_STATE, renameHabit, type WidgetAction, type WidgetSnapshot } from '../store';

// Hoisted above the imports by Jest: the widget library only needs a few React Native stubs
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {},
  AppRegistry: { registerHeadlessTask: () => {} },
  Image: { resolveAssetSource: () => ({ uri: '' }) },
  StyleSheet: { create: (s: unknown) => s },
}));

// Internal module (not part of the package's public types)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { buildWidgetTree } = require('react-native-android-widget/lib/commonjs/api/build-widget-tree') as {
  buildWidgetTree: (element: unknown) => any;
};

const NOW = '2026-11-01';

const snapshot = (over: Partial<WidgetSnapshot> = {}): WidgetSnapshot => ({
  date: NOW,
  timezone: 'Asia/Kolkata',
  signedOut: false,
  isRestDay: false,
  overallStreak: 4,
  habits: [
    { id: 'h1', name: 'Read', color: '#ff0000', type: 'build_yesno', done: false, count: 0, target: null, streak: 2, streakUnit: 'day', opensApp: false },
    { id: 'h2', name: 'Water', color: 'teal', type: 'build_count', done: false, count: 7, target: 8, streak: 0, streakUnit: 'day', opensApp: false },
    { id: 'h3', name: 'No sugar', color: '#00aa00', type: 'avoid_count', done: true, count: 0, target: null, streak: 9, streakUnit: 'day', opensApp: true },
  ],
  today: [
    { id: 't0', title: 'Old thing', date: '2026-10-28', time: null, priority: 'high', done: false },
    { id: 't1', title: 'Call bank', date: NOW, time: '10:00 am', priority: 'urgent', done: false },
  ],
  inbox: [
    { id: 't0', title: 'Old thing', date: '2026-10-28', time: null, priority: 'high', done: false },
    { id: 't1', title: 'Call bank', date: NOW, time: '10:00 am', priority: 'urgent', done: false },
    { id: 't2', title: 'Trip', date: '2026-11-05', time: null, priority: 'low', done: false },
    { id: 't3', title: 'Someday', date: null, time: null, priority: 'medium', done: false },
  ],
  syncedAt: 0,
  ...over,
});

const act = (a: Omit<WidgetAction, 'id' | 'at'> & Record<string, unknown>) => ({ id: 'x', at: 0, ...a }) as WidgetAction;

describe('optimistic updates', () => {
  it('ticks a yes/no habit and bumps its streak', () => {
    const s = applyAction(snapshot(), act({ kind: 'habit_set', habitId: 'h1', date: NOW, done: true }));
    expect(s.habits[0]).toMatchObject({ done: true, count: 1, streak: 3 });
  });

  it('ignores a tap made for a different day (snapshot rolled over)', () => {
    const before = snapshot();
    expect(applyAction(before, act({ kind: 'habit_set', habitId: 'h1', date: '2026-10-31', done: true }))).toBe(before);
  });

  it('completes a count habit when the target is reached', () => {
    const s = applyAction(snapshot(), act({ kind: 'habit_inc', habitId: 'h2', date: NOW, delta: 1 }));
    expect(s.habits[1]).toMatchObject({ count: 8, done: true, streak: 1 });
  });

  it('toggling a task twice restores it, in both lists', () => {
    const tap = act({ kind: 'todo_toggle', todoId: 't1' });
    const once = applyQueue(snapshot(), [tap]);
    expect(once.today[1].done).toBe(true);
    expect(once.inbox[1].done).toBe(true);
    expect(applyQueue(snapshot(), [tap, tap]).today[1].done).toBe(false);
  });

  it('adds a quick-added task to today and the inbox, in date order', () => {
    const s = applyAction(snapshot(), act({ kind: 'todo_create', clientId: 'n1', title: 'New', date: NOW }));
    expect(s.today.map((t) => t.id)).toEqual(['t0', 't1', 'n1']);
    expect(s.inbox.map((t) => t.id)).toEqual(['t0', 't1', 'n1', 't2', 't3']);
    // Idempotent: replaying it (queue + confirmed snapshot) doesn't duplicate it
    expect(applyAction(s, act({ kind: 'todo_create', clientId: 'n1', title: 'New', date: NOW }))).toBe(s);
  });

  it('puts an undated quick-added task at the end of the inbox only', () => {
    const s = applyAction(snapshot(), act({ kind: 'todo_create', clientId: 'n2', title: 'Later', date: null }));
    expect(s.today).toHaveLength(2);
    expect(s.inbox.at(-1)?.id).toBe('n2');
  });

  it('adds a quick-added habit, then follows it to its real id', () => {
    const create = act({ kind: 'habit_create', tempId: 'tmp-1', name: 'Stretch', date: NOW, target: 3, color: '#635bff' });
    const tick = { ...act({ kind: 'habit_inc', habitId: 'tmp-1', date: NOW, delta: 1 }), id: 'y' } as WidgetAction;
    const s = applyQueue(snapshot(), [create, tick]);
    expect(s.habits.at(-1)).toMatchObject({ id: 'tmp-1', name: 'Stretch', type: 'build_count', count: 1, target: 3, done: false });

    const renamed = renameHabit([tick], 'tmp-1', 'real-1');
    expect(renamed[0]).toMatchObject({ kind: 'habit_inc', habitId: 'real-1' });
  });
});

describe('editing from the widget', () => {
  it('renames and moves a task off Today into the inbox, in date order', () => {
    const s = applyAction(snapshot(), act({ kind: 'todo_update', todoId: 't1', title: 'Call the bank', date: '2026-11-06' }));
    expect(s.today.map((t) => t.id)).toEqual(['t0']);
    expect(s.inbox.map((t) => t.id)).toEqual(['t0', 't2', 't1', 't3']);
    expect(s.inbox[2]).toMatchObject({ title: 'Call the bank', date: '2026-11-06' });
  });

  it('moves an undated task onto Today', () => {
    const s = applyAction(snapshot(), act({ kind: 'todo_update', todoId: 't3', date: NOW }));
    expect(s.today.map((t) => t.id)).toEqual(['t0', 't1', 't3']);
    expect(s.inbox.at(-1)?.id).toBe('t2');
  });

  it('renames in place when the date is untouched', () => {
    const s = applyAction(snapshot(), act({ kind: 'todo_update', todoId: 't0', title: 'Older thing' }));
    expect(s.today[0].title).toBe('Older thing');
    expect(s.inbox[0].title).toBe('Older thing');
  });

  it('deletes a task from both lists and a habit from the page', () => {
    const s = applyQueue(snapshot(), [
      act({ kind: 'todo_delete', todoId: 't1' }),
      { ...act({ kind: 'habit_delete', habitId: 'h2', keepData: true }), id: 'y' } as WidgetAction,
    ]);
    expect(s.today.map((t) => t.id)).toEqual(['t0']);
    expect(s.inbox.map((t) => t.id)).toEqual(['t0', 't2', 't3']);
    expect(s.habits.map((h) => h.id)).toEqual(['h1', 'h3']);
  });

  it('sets an exact count, including undoing a finished count habit', () => {
    const done = applyAction(snapshot(), act({ kind: 'habit_inc', habitId: 'h2', date: NOW, delta: 1, count: 8 }));
    const undone = applyAction(done, { ...act({ kind: 'habit_inc', habitId: 'h2', date: NOW, delta: -2, count: 6 }), id: 'y' } as WidgetAction);
    expect(undone.habits[1]).toMatchObject({ count: 6, done: false, streak: 0 });
  });

  it('treats slips on an avoid habit as breaking the clean day', () => {
    const slip = applyAction(snapshot(), act({ kind: 'habit_inc', habitId: 'h3', date: NOW, delta: 1, count: 1 }));
    expect(slip.habits[2]).toMatchObject({ count: 1, done: false, streak: 8 });
    const back = applyAction(slip, { ...act({ kind: 'habit_inc', habitId: 'h3', date: NOW, delta: -1, count: 0 }), id: 'y' } as WidgetAction);
    expect(back.habits[2]).toMatchObject({ count: 0, done: true, streak: 9 });
  });

  it('logs a value and marks the habit done', () => {
    const base = snapshot({ habits: [{ ...snapshot().habits[0], metricLabel: 'Pages', metricUnit: 'pages', metricTotal: 5, opensApp: true }] });
    const s = applyAction(base, act({ kind: 'habit_value', habitId: 'h1', date: NOW, value: 10, clientId: 'c1' }));
    expect(s.habits[0]).toMatchObject({ done: true, metricTotal: 15, streak: 3 });
  });

  it('follows edits on a just-created habit to its real id', () => {
    const q = renameHabit(
      [act({ kind: 'habit_value', habitId: 'tmp-1', date: NOW, value: 2, clientId: 'c' }), act({ kind: 'habit_delete', habitId: 'tmp-1', keepData: false })],
      'tmp-1',
      'real-1',
    );
    expect(q.every((a) => 'habitId' in a && a.habitId === 'real-1')).toBe(true);
  });

  it('opens the editor with what it needs to show', () => {
    const quick = { widgetId: 3, accentLight: '#635bff', accentDark: '#7c74ff' };
    const h = new URLSearchParams(editUri(quick, { habit: snapshot().habits[1] }, NOW).split('?')[1]);
    expect(Object.fromEntries(h)).toMatchObject({ kind: 'habit', id: 'h2', title: 'Water', htype: 'count', count: '7', target: '8', done: '0', widget: '3' });
    const t = new URLSearchParams(editUri(quick, { task: snapshot().inbox[3] }, NOW).split('?')[1]);
    expect(Object.fromEntries(t)).toMatchObject({ kind: 'task', id: 't3', title: 'Someday', date: '', today: NOW, tomorrow: '2026-11-02' });
  });
});

describe('quick add', () => {
  it('links the + button to the popup, not the app', () => {
    const uri = quickAddUri({ widgetId: 7, accentLight: '#635bff', accentDark: '#7c74ff' }, 'task', NOW, 'today');
    expect(uri.startsWith('neri-widget://add?')).toBe(true);
    const q = new URLSearchParams(uri.split('?')[1]);
    expect(Object.fromEntries(q)).toEqual({
      kind: 'task',
      widget: '7',
      today: NOW,
      tomorrow: '2026-11-02',
      date: 'today',
      accent: '#635bff',
      accentDark: '#7c74ff',
    });
  });
});

describe('rendering', () => {
  const sizes = [
    { width: 320, height: 300 },
    { width: 200, height: 120 },
    { width: 180, height: 100 },
    { width: 520, height: 600 },
  ];
  const cases: [string, WidgetSnapshot | null, typeof DEFAULT_VIEW_STATE][] = [
    ['habits', snapshot(), DEFAULT_VIEW_STATE],
    ['habits all done', snapshot({ habits: snapshot().habits.map((h) => ({ ...h, done: true })) }), DEFAULT_VIEW_STATE],
    ['habits empty', snapshot({ habits: [] }), DEFAULT_VIEW_STATE],
    ['rest day', snapshot({ isRestDay: true }), DEFAULT_VIEW_STATE],
    ['tasks today', snapshot(), { page: 'tasks', taskView: 'today' }],
    ['tasks today done', snapshot({ today: [{ ...snapshot().today[1], done: true }] }), { page: 'tasks', taskView: 'today' }],
    ['tasks today empty', snapshot({ today: [] }), { page: 'tasks', taskView: 'today' }],
    ['inbox', snapshot(), { page: 'tasks', taskView: 'inbox' }],
    ['inbox empty', snapshot({ inbox: [] }), { page: 'tasks', taskView: 'inbox' }],
    ['stale day', snapshot({ date: '2026-10-31' }), DEFAULT_VIEW_STATE],
    ['signed out', snapshot({ signedOut: true }), DEFAULT_VIEW_STATE],
    ['first run', null, DEFAULT_VIEW_STATE],
  ];

  it.each(cases)('%s builds a valid widget tree', (_name, s, state) => {
    for (const size of sizes) {
      const out = renderNeriWidget(s, state, NOW, size) as { light: any; dark: any };
      expect(() => buildWidgetTree(out.light)).not.toThrow();
      expect(() => buildWidgetTree(out.dark)).not.toThrow();
    }
  });

  const texts = (tree: any): string[] => [
    ...(tree.props?.text ? [tree.props.text] : []),
    ...(tree.children ?? []).flatMap(texts),
  ];
  const render = (s: WidgetSnapshot | null, state = DEFAULT_VIEW_STATE) =>
    texts(buildWidgetTree((renderNeriWidget(s, state, NOW, { width: 320, height: 300 }) as any).light));

  it('shows progress and celebrates when everything is done', () => {
    expect(render(snapshot())).toContain('1 of 3 done');
    expect(render(snapshot({ habits: snapshot().habits.map((h) => ({ ...h, done: true })) }))).toContain('All done today 🎉');
  });

  it('groups the inbox by day with overdue first and undated last', () => {
    const t = render(snapshot(), { page: 'tasks', taskView: 'inbox' });
    const headers = t.filter((x) => x === x.toUpperCase() && /[A-Z]/.test(x));
    expect(headers).toEqual(['OVERDUE', 'TODAY', 'THURSDAY', 'NO DATE']);
  });

  it('draws only the rows a widget of its height needs and says how many more there are', () => {
    const limit = rowLimit(300);
    expect(limit).toBeLessThanOrEqual(MAX_ROWS);
    const many = Array.from({ length: MAX_ROWS + 10 }, (_, i) => ({ ...snapshot().inbox[3], id: `m${i}`, title: `Task ${i}` }));
    const t = render(snapshot({ inbox: many }), { page: 'tasks', taskView: 'inbox' });
    // One row is the "NO DATE" header
    expect(t).toContain(`Task ${limit - 2}`);
    expect(t).not.toContain(`Task ${limit}`);
    expect(t).toContain(`${MAX_ROWS + 10 - (limit - 1)} more · open Neri`);
  });

  it('scales the row cap with height, within bounds', () => {
    expect(rowLimit(110)).toBe(8);
    expect(rowLimit(2000)).toBe(MAX_ROWS);
    expect(rowLimit(400)).toBeGreaterThan(rowLimit(250));
  });

  it('links rows to the editor sheet, never the app', () => {
    const out = buildWidgetTree((renderNeriWidget(snapshot(), DEFAULT_VIEW_STATE, NOW, { width: 320, height: 300 }) as any).light);
    const uris: string[] = [];
    const walk = (n: any) => {
      const u = n.props?.clickActionData?.uri;
      if (typeof u === 'string') uris.push(u);
      (n.children ?? []).forEach(walk);
    };
    walk(out);
    expect(uris.some((u) => u.startsWith('neri://habit/'))).toBe(false);
    expect(uris.filter((u) => u.startsWith('neri-widget://edit?')).length).toBeGreaterThanOrEqual(3);
  });

  it('splits Today into overdue and today', () => {
    const t = render(snapshot(), { page: 'tasks', taskView: 'today' });
    expect(t.indexOf('OVERDUE')).toBeLessThan(t.indexOf('Old thing'));
    expect(t.indexOf('TODAY')).toBeLessThan(t.indexOf('Call bank'));
  });
});

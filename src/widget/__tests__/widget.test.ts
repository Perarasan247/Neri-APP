/**
 * Widget logic without a device: optimistic updates, and rendering every
 * page/state through the library's own tree builder (the same validation that
 * runs before Android draws the widget).
 */
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  NativeModules: {},
  AppRegistry: { registerHeadlessTask: () => {} },
  Image: { resolveAssetSource: () => ({ uri: '' }) },
  StyleSheet: { create: (s: unknown) => s },
}));

import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';

import { renderNeriWidget } from '../NeriWidget';
import { applyAction, applyQueue, DEFAULT_VIEW_STATE, type WidgetAction, type WidgetSnapshot } from '../store';

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
});

describe('rendering', () => {
  const sizes = [
    { width: 320, height: 300 },
    { width: 200, height: 120 },
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

  it('splits Today into overdue and today', () => {
    const t = render(snapshot(), { page: 'tasks', taskView: 'today' });
    expect(t.indexOf('OVERDUE')).toBeLessThan(t.indexOf('Old thing'));
    expect(t.indexOf('TODAY')).toBeLessThan(t.indexOf('Call bank'));
  });
});

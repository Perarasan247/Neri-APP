'use no memo';
/**
 * The Neri home-screen widget (Android). Rendered to native RemoteViews by
 * react-native-android-widget: only its Flex/Text/Svg/List primitives are
 * available, no hooks and no React Native views. The React Compiler is turned
 * off for this file ("use no memo") because the library calls these components
 * as plain functions.
 *
 * Two pages, switched from the header tabs: today's habits (default) and
 * tasks (Today / Inbox).
 */
import React from 'react';
import { FlexWidget, ListWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetInfo, WidgetRepresentation } from 'react-native-android-widget';

import type { TodoPriority } from '@/api/types';
import { addDays, friendlyDate } from '@/lib/format';
import { deriveAccent } from '@/theme/accent';

import type { WidgetHabit, WidgetSnapshot, WidgetTask, WidgetViewState } from './store';

export const WIDGET_NAME = 'Neri';

/** Click actions handled in taskHandler.ts. */
export const ACTIONS = {
  setPage: 'SET_PAGE',
  setTaskView: 'SET_TASK_VIEW',
  habit: 'HABIT_TAP',
  task: 'TASK_TAP',
  refresh: 'REFRESH',
  /** Sent by the native quick-add popup (plugins/widget-quick-add), not by a widget tap. */
  quickAdd: 'QUICK_ADD',
  /** Sent by the native editor sheet (same activity, neri-widget://edit): save, complete, delete. */
  edit: 'ITEM_EDIT',
} as const;

/**
 * Most rows drawn per list. The library paints every row to a PNG (twice, light
 * and dark) on every redraw, so rows cost tap latency; see rowLimit().
 */
export const MAX_ROWS = 25;

/** Approximate height of one row in dp (38dp tap target + padding + divider). */
const ROW_DP = 51;

/**
 * How many rows to draw for a widget this tall: what fits plus a screenful to
 * scroll into, never more than MAX_ROWS. A short widget redraws much faster.
 */
export function rowLimit(height: number): number {
  const visible = Math.max(1, Math.floor((height - 90) / ROW_DP));
  return Math.min(MAX_ROWS, Math.max(8, visible * 2 + 2));
}

/** Where the quick-add popup sends what the user typed; opened without starting the app. */
export interface QuickAdd {
  widgetId: number;
  accentLight: string;
  accentDark: string;
}

/** Deep link handled by QuickAddActivity (a small dialog over the home screen). */
export function quickAddUri(q: QuickAdd, kind: 'habit' | 'task', now: string, date: 'today' | 'none' = 'none') {
  const params: Record<string, string> = {
    kind,
    widget: String(q.widgetId),
    today: now,
    tomorrow: addDays(now, 1),
    date,
    accent: q.accentLight,
    accentDark: q.accentDark,
  };
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `neri-widget://add?${query}`;
}

const toQuery = (params: Record<string, string | number | boolean | null | undefined>) =>
  Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');

/** How the editor sheet should treat a habit. */
export const habitKind = (h: WidgetHabit) =>
  h.type === 'avoid_count' ? 'avoid' : h.metricLabel ? 'metric' : h.target ? 'count' : 'yesno';

/** Deep link to the editor sheet for a row (handled by QuickAddActivity, never the app). */
export function editUri(q: QuickAdd, item: { habit: WidgetHabit } | { task: WidgetTask }, now: string): string {
  const common = { widget: q.widgetId, accent: q.accentLight, accentDark: q.accentDark, today: now, tomorrow: addDays(now, 1) };
  if ('habit' in item) {
    const h = item.habit;
    return `neri-widget://edit?${toQuery({
      ...common,
      kind: 'habit',
      id: h.id,
      title: h.name,
      htype: habitKind(h),
      done: h.done ? 1 : 0,
      count: h.count,
      target: h.target,
      label: h.metricLabel,
      unit: h.metricUnit,
      total: h.metricTotal,
      streak: h.streak > 0 ? `${h.streak} ${h.streakUnit}${h.streak === 1 ? '' : 's'}` : null,
    })}`;
  }
  const t = item.task;
  return `neri-widget://edit?${toQuery({ ...common, kind: 'task', id: t.id, title: t.title, date: t.date ?? '', done: t.done ? 1 : 0 })}`;
}

/* ---------- Theme ---------- */

type Hex = `#${string}`;

interface WidgetTheme {
  bg: Hex;
  fg: Hex;
  muted: Hex;
  subtle: Hex;
  line: Hex;
  chip: Hex;
  accent: Hex;
  accentSoft: Hex;
  onAccent: Hex;
  success: Hex;
  danger: Hex;
  priority: Record<TodoPriority, Hex>;
}

const BRAND: Hex = '#635bff';

const LIGHT: WidgetTheme = {
  bg: '#ffffff',
  fg: '#121218',
  muted: '#6a6a7a',
  subtle: '#93939f',
  line: '#ececf1',
  chip: '#f1f1f4',
  accent: BRAND,
  accentSoft: '#efeeff',
  onAccent: '#ffffff',
  success: '#0a7d57',
  danger: '#d02848',
  priority: { urgent: '#e5294b', high: '#ea7a0c', medium: '#2f74e6', low: '#93939f' },
};

const DARK: WidgetTheme = {
  bg: '#17171d',
  fg: '#ededf2',
  muted: '#9696a6',
  subtle: '#6b6b7b',
  line: '#26262f',
  chip: '#23232b',
  accent: '#7c74ff',
  accentSoft: '#25214a',
  onAccent: '#ffffff',
  success: '#3dd598',
  danger: '#ff6b81',
  priority: { urgent: '#ff5f79', high: '#ff9b40', medium: '#62a4ff', low: '#74748a' },
};

const asHex = (c: string | undefined, fallback: Hex): Hex => (c && /^#[0-9a-f]{6}$/i.test(c) ? (c as Hex) : fallback);

/* ---------- SVG icons ---------- */


/** Count habit: progress arc around a "+". */
function svgCounter(color: string, track: string, ratio: number) {
  const c = 2 * Math.PI * 9.5;
  const dash = Math.max(0, Math.min(1, ratio)) * c;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="${track}" stroke-width="2"/><circle cx="12" cy="12" r="9.5" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 12 12)"/><path d="M12 8.5v7M8.5 12h7" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`;
}

function svgRing(color: string, track: string, ratio: number) {
  const c = 2 * Math.PI * 19;
  const dash = Math.max(0, Math.min(1, ratio)) * c;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="none" stroke="${track}" stroke-width="5"/><circle cx="24" cy="24" r="19" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 24 24)"/></svg>`;
}

const svgPlus = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="${color}" stroke-width="2.6" stroke-linecap="round"/></svg>`;

const svgRefresh = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`;

/* ---------- Building blocks ---------- */

/**
 * Round checkbox drawn from plain views (a bordered circle, filled with a tick when done).
 * Much cheaper to paint than an SVG, and it is drawn once per row per theme on every redraw.
 */
function Check({ done, color, size = 22 }: { done: boolean; color: Hex; size?: number }) {
  return (
    <FlexWidget
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        ...(done ? { backgroundColor: color } : { borderWidth: 2, borderColor: color }),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {done ? <TextWidget text="✓" style={{ fontSize: size * 0.6, fontWeight: '700', color: '#ffffff' }} /> : null}
    </FlexWidget>
  );
}

function Tab({ label, active, onPressData, t, narrow }: { label: string; active: boolean; onPressData: object; t: WidgetTheme; narrow?: boolean }) {
  return (
    <FlexWidget
      clickAction={ACTIONS.setPage}
      clickActionData={onPressData as Record<string, unknown>}
      accessibilityLabel={`Show ${label}`}
      style={{
        paddingHorizontal: narrow ? 10 : 14,
        paddingVertical: 6,
        borderRadius: 14,
        backgroundColor: active ? t.accent : t.chip,
      }}
    >
      <TextWidget text={label} style={{ fontSize: 13, fontWeight: '600', color: active ? t.onAccent : t.muted }} />
    </FlexWidget>
  );
}

function Chip({ label, active, view, t }: { label: string; active: boolean; view: string; t: WidgetTheme }) {
  return (
    <FlexWidget
      clickAction={ACTIONS.setTaskView}
      clickActionData={{ view }}
      accessibilityLabel={`Show ${label} tasks`}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginRight: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? t.accent : t.line,
        backgroundColor: active ? t.accentSoft : t.bg,
      }}
    >
      <TextWidget text={label} style={{ fontSize: 12, fontWeight: '600', color: active ? t.accent : t.muted }} />
    </FlexWidget>
  );
}

function Empty({ title, subtitle, t, uri }: { title: string; subtitle?: string; t: WidgetTheme; uri?: string }) {
  return (
    <FlexWidget
      clickAction={uri ? 'OPEN_URI' : 'OPEN_APP'}
      clickActionData={uri ? { uri } : undefined}
      style={{ flex: 1, width: 'match_parent', alignItems: 'center', justifyContent: 'center', padding: 12 }}
    >
      <TextWidget text={title} style={{ fontSize: 15, fontWeight: '600', color: t.fg, textAlign: 'center' }} />
      {subtitle ? (
        <TextWidget text={subtitle} style={{ fontSize: 12, color: t.muted, marginTop: 4, textAlign: 'center' }} />
      ) : null}
    </FlexWidget>
  );
}

/** Stable sort key: unfinished items first, finished ones sink to the bottom. */
const unfinishedFirst = (a: { done: boolean }, b: { done: boolean }) => Number(a.done) - Number(b.done);

function SectionHeader({ label, color, t }: { label: string; color?: Hex; t: WidgetTheme }) {
  return (
    <FlexWidget style={{ width: 'match_parent', paddingTop: 8, paddingBottom: 2, paddingHorizontal: 4 }}>
      <TextWidget text={label.toUpperCase()} style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.06, color: color ?? t.subtle }} />
    </FlexWidget>
  );
}

/** Keep a list to `limit` rows; the last row says how many more there are and opens the app. */
function capped(rows: React.JSX.Element[], t: WidgetTheme, uri: string, limit: number): React.JSX.Element[] {
  if (rows.length <= limit) return rows;
  const more = rows.slice(limit).filter((r) => !String(r.key).startsWith('h-')).length;
  return [
    ...rows.slice(0, limit),
    <FlexWidget
      key="more"
      clickAction="OPEN_URI"
      clickActionData={{ uri }}
      style={{ width: 'match_parent', alignItems: 'center', paddingVertical: 10 }}
    >
      <TextWidget text={`${more} more · open Neri`} style={{ fontSize: 12, fontWeight: '600', color: t.accent }} />
    </FlexWidget>,
  ];
}

/* ---------- Habits page ---------- */

const streakLabel = (h: WidgetHabit) =>
  h.streak > 0 ? `🔥 ${h.streak} ${h.streakUnit}${h.streak === 1 ? '' : 's'}` : '';

function HabitRow({ h, t, quick, now, wide }: { h: WidgetHabit; t: WidgetTheme; quick: QuickAdd; now: string; wide: boolean }) {
  const color = asHex(h.color, t.accent);
  const kind = habitKind(h);
  const detail =
    kind === 'count'
      ? `${h.count} / ${h.target}`
      : kind === 'avoid'
        ? h.count > 0
          ? `${h.count} slip${h.count === 1 ? '' : 's'} today`
          : 'Clean today'
        : kind === 'metric' && h.metricTotal
          ? `${h.metricTotal}${h.metricUnit ? ` ${h.metricUnit}` : ''} today`
          : '';
  const streak = wide ? streakLabel(h) : '';
  const edit = editUri(quick, { habit: h }, now);
  // One tap completes a yes/no habit or adds one to a count; anything needing more opens the editor sheet
  const quickTap = !h.opensApp && !(h.target !== null && h.done);
  const circleAction = quickTap
    ? { clickAction: ACTIONS.habit, clickActionData: { id: h.id } }
    : { clickAction: 'OPEN_URI', clickActionData: { uri: edit } };

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: edit }}
      accessibilityLabel={`Edit ${h.name}`}
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 2,
        borderBottomWidth: 1,
        borderBottomColor: t.line,
      }}
    >
      <FlexWidget
        {...circleAction}
        accessibilityLabel={!quickTap ? `Update ${h.name}` : h.done ? `Mark ${h.name} not done` : `Complete ${h.name}`}
        style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
      >
        {kind === 'count' && !h.done ? (
          <SvgWidget svg={svgCounter(color, t.line, h.count / (h.target ?? 1))} style={{ width: 24, height: 24 }} />
        ) : (
          <Check done={h.done} color={color} size={22} />
        )}
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 6 }}>
        <TextWidget
          text={h.name}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 14, fontWeight: '500', color: h.done ? t.muted : t.fg }}
        />
        {detail ? <TextWidget text={detail} style={{ fontSize: 11, color: t.subtle, marginTop: 1 }} /> : null}
      </FlexWidget>
      {streak ? <TextWidget text={streak} style={{ fontSize: 11, color: t.muted, marginLeft: 6 }} /> : null}
    </FlexWidget>
  );
}

interface Layout {
  /** No summary row at all: every dp goes to the list. */
  tiny: boolean;
  /** One-line summary instead of the ring. */
  compact: boolean;
  /** Room for streaks and the sync button. */
  wide: boolean;
  limit: number;
}

function HabitsPage({ s, t, layout, addUri, quick, now }: { s: WidgetSnapshot; t: WidgetTheme; layout: Layout; addUri: string; quick: QuickAdd; now: string }) {
  const { compact } = layout;
  if (s.isRestDay) return <Empty t={t} title="Rest day 🌿" subtitle="No habits today. Enjoy the break." />;
  if (s.habits.length === 0) return <Empty t={t} title="No habits due today" subtitle="Tap + to add a habit" uri={addUri} />;

  const done = s.habits.filter((h) => h.done).length;
  const total = s.habits.length;
  const allDone = done === total;
  const ratio = done / total;
  const title = allDone ? 'All done today 🎉' : `${done} of ${total} done`;
  const subtitle = s.overallStreak > 0 ? `🔥 ${s.overallStreak}-day streak` : `${Math.round(ratio * 100)}% of today`;
  const color = allDone ? t.success : t.accent;

  const progress = layout.tiny ? null : compact ? (
    // Short widget: one-line summary with a slim bar
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', paddingVertical: 6, paddingHorizontal: 2 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
        <TextWidget text={title} style={{ fontSize: 13, fontWeight: '600', color: t.fg }} />
        <TextWidget text={subtitle} style={{ fontSize: 12, color: t.muted }} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', height: 4, marginTop: 6, borderRadius: 2, backgroundColor: t.line, flexDirection: 'row' }}>
        {done > 0 ? <FlexWidget style={{ flex: done, height: 4, borderRadius: 2, backgroundColor: color }} /> : null}
        {total - done > 0 ? <FlexWidget style={{ flex: total - done, height: 4 }} /> : null}
      </FlexWidget>
    </FlexWidget>
  ) : (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2 }}>
      <OverlapWidget style={{ width: 48, height: 48 }}>
        <SvgWidget svg={svgRing(color, t.line, ratio)} style={{ width: 48, height: 48 }} />
        <FlexWidget style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text={`${done}/${total}`} style={{ fontSize: 12, fontWeight: '700', color: t.fg }} />
        </FlexWidget>
      </OverlapWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 12 }}>
        <TextWidget text={title} style={{ fontSize: 15, fontWeight: '700', color: t.fg }} />
        <TextWidget text={subtitle} style={{ fontSize: 12, color: t.muted, marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );

  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
      {progress}
      <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
        {capped(
          [...s.habits].sort(unfinishedFirst).map((h) => <HabitRow key={h.id} h={h} t={t} quick={quick} now={now} wide={layout.wide} />),
          t,
          'neri://',
          layout.limit,
        )}
      </ListWidget>
    </FlexWidget>
  );
}

/* ---------- Tasks page ---------- */

interface RowCtx {
  t: WidgetTheme;
  now: string;
  quick: QuickAdd;
}

function TaskRow({ task, t, now, quick, showDate }: RowCtx & { task: WidgetTask; showDate: boolean }) {
  const overdue = !task.done && task.date !== null && task.date < now;
  const checkColor = task.done ? t.accent : (t.priority[task.priority] ?? t.subtle);
  const dateText = task.date ? friendlyDate(task.date, now) : 'No date';
  const meta = [showDate || overdue ? dateText : '', task.time ?? ''].filter(Boolean).join(' · ');
  const metaColor = overdue ? t.danger : task.date === now ? t.accent : t.muted;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: editUri(quick, { task }, now) }}
      accessibilityLabel={`Edit ${task.title}`}
      style={{
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 2,
        borderBottomWidth: 1,
        borderBottomColor: t.line,
      }}
    >
      <FlexWidget
        clickAction={ACTIONS.task}
        clickActionData={{ id: task.id }}
        accessibilityLabel={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
      >
        <Check done={task.done} color={checkColor} size={21} />
      </FlexWidget>
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginLeft: 6 }}>
        <TextWidget
          text={task.title}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 14, fontWeight: '500', color: task.done ? t.subtle : t.fg }}
        />
        {meta ? <TextWidget text={meta} style={{ fontSize: 11, color: task.done ? t.subtle : metaColor, marginTop: 1 }} /> : null}
      </FlexWidget>
    </FlexWidget>
  );
}

/** Inbox: group open tasks under their day, Todoist style. */
function inboxRows(tasks: WidgetTask[], ctx: RowCtx) {
  const { t, now } = ctx;
  const rows: React.JSX.Element[] = [];
  let current: string | undefined;
  for (const task of tasks) {
    const overdue = task.date !== null && task.date < now;
    const group = task.date === null ? 'No date' : overdue ? 'Overdue' : friendlyDate(task.date, now);
    if (group !== current) {
      current = group;
      rows.push(<SectionHeader key={`h-${group}`} label={group} color={overdue ? t.danger : undefined} t={t} />);
    }
    rows.push(<TaskRow key={task.id} task={task} {...ctx} showDate={overdue} />);
  }
  return rows;
}

function TasksPage({
  s,
  t,
  view,
  now,
  addUri,
  quick,
  limit,
}: {
  s: WidgetSnapshot;
  t: WidgetTheme;
  view: 'today' | 'inbox';
  now: string;
  addUri: string;
  quick: QuickAdd;
  limit: number;
}) {
  const ctx: RowCtx = { t, now, quick };
  const overdue = s.today.filter((x) => x.date !== null && x.date < now);
  const planned = s.today.filter((x) => x.date === null || x.date >= now).sort(unfinishedFirst);
  const todayOpen = s.today.filter((x) => !x.done).length;
  const inboxOpen = s.inbox.filter((x) => !x.done).length;

  const chips = (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', paddingVertical: 8, alignItems: 'center' }}>
      <Chip label={todayOpen ? `Today · ${todayOpen}` : 'Today'} view="today" active={view === 'today'} t={t} />
      <Chip label={inboxOpen ? `Inbox · ${inboxOpen}` : 'Inbox'} view="inbox" active={view === 'inbox'} t={t} />
    </FlexWidget>
  );

  let body: React.JSX.Element;
  if (view === 'inbox') {
    body =
      s.inbox.length === 0 ? (
        <Empty t={t} title="Inbox zero 🎉" subtitle="Tap + to add a task" uri={addUri} />
      ) : (
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {capped(inboxRows(s.inbox, ctx), t, 'neri://inbox', limit)}
        </ListWidget>
      );
  } else if (s.today.length === 0) {
    body = <Empty t={t} title="Nothing planned today" subtitle="Tap + to add a task" uri={addUri} />;
  } else if (todayOpen === 0 && overdue.length === 0) {
    body = (
      <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
        <TextWidget text="All done today 🎉" style={{ fontSize: 14, fontWeight: '700', color: t.success, marginBottom: 4, marginLeft: 4 }} />
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {capped(
            planned.map((task) => <TaskRow key={task.id} task={task} {...ctx} showDate={false} />),
            t,
            'neri://',
            limit,
          )}
        </ListWidget>
      </FlexWidget>
    );
  } else {
    const rows: React.JSX.Element[] = [];
    if (overdue.length) {
      rows.push(<SectionHeader key="h-overdue" label="Overdue" color={t.danger} t={t} />);
      overdue.forEach((task) => rows.push(<TaskRow key={task.id} task={task} {...ctx} showDate />));
      rows.push(<SectionHeader key="h-today" label="Today" t={t} />);
    }
    planned.forEach((task) => rows.push(<TaskRow key={task.id} task={task} {...ctx} showDate={false} />));
    body = <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>{capped(rows, t, 'neri://', limit)}</ListWidget>;
  }

  return (
    <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
      {chips}
      {body}
    </FlexWidget>
  );
}

/* ---------- Root ---------- */

interface Props {
  snapshot: WidgetSnapshot | null;
  state: WidgetViewState;
  /** Today in the user's timezone, computed at render time. */
  now: string;
  width: number;
  height: number;
  t: WidgetTheme;
  quick: QuickAdd;
}

function NeriWidgetView({ snapshot, state, now, width, height, t, quick }: Props) {
  const root = {
    width: 'match_parent',
    height: 'match_parent',
    flexDirection: 'column',
    backgroundColor: t.bg,
    borderRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 12,
    paddingBottom: 6,
  } as const;

  if (!snapshot || snapshot.signedOut) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={root}>
        <Empty
          t={t}
          title={snapshot ? 'Sign in to Neri' : 'Open Neri to set up'}
          subtitle="Your habits and tasks will show up here"
        />
      </FlexWidget>
    );
  }

  const onHabits = state.page === 'habits';
  // Opens the quick-add popup over the home screen, not the app
  const addUri = onHabits
    ? quickAddUri(quick, 'habit', now)
    : quickAddUri(quick, 'task', now, state.taskView === 'today' ? 'today' : 'none');
  const stale = snapshot.date !== now;
  const narrow = width < 230;
  const layout: Layout = {
    tiny: height < 150,
    compact: height < 220,
    wide: width >= 280,
    limit: rowLimit(height),
  };

  return (
    <FlexWidget style={root}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flexDirection: 'row', padding: 3, borderRadius: 17, backgroundColor: t.chip }}>
          <Tab label="Habits" active={onHabits} onPressData={{ page: 'habits' }} t={t} narrow={narrow} />
          <Tab label="Tasks" active={!onHabits} onPressData={{ page: 'tasks' }} t={t} narrow={narrow} />
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }} />
        {narrow ? null : (
          <FlexWidget
            clickAction={ACTIONS.refresh}
            accessibilityLabel="Sync now"
            style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}
          >
            <SvgWidget svg={svgRefresh(stale ? t.accent : t.subtle)} style={{ width: 18, height: 18 }} />
          </FlexWidget>
        )}
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: addUri }}
          accessibilityLabel={onHabits ? 'Add habit' : 'Add task'}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <SvgWidget svg={svgPlus(t.onAccent)} style={{ width: 18, height: 18 }} />
        </FlexWidget>
      </FlexWidget>

      {stale ? (
        <FlexWidget clickAction={ACTIONS.refresh} style={{ width: 'match_parent', paddingTop: 6, paddingHorizontal: 2 }}>
          <TextWidget
            text={`Showing ${friendlyDate(snapshot.date, now).toLowerCase()} · tap to sync`}
            style={{ fontSize: 11, color: t.accent }}
          />
        </FlexWidget>
      ) : null}

      {onHabits ? (
        <HabitsPage s={snapshot} t={t} layout={layout} addUri={addUri} quick={quick} now={now} />
      ) : (
        <TasksPage s={snapshot} t={t} view={state.taskView} now={now} addUri={addUri} quick={quick} limit={layout.limit} />
      )}
    </FlexWidget>
  );
}

/** A widget theme recoloured with the user's accent (the base theme when there is none). */
export function withAccent(base: WidgetTheme, accent: string | null | undefined, scheme: 'light' | 'dark'): WidgetTheme {
  if (!accent) return base;
  const a = deriveAccent(accent, scheme);
  return { ...base, accent: asHex(a.accent, base.accent), accentSoft: asHex(a.accentSoft, base.accentSoft), onAccent: asHex(a.accentFg, base.onAccent) };
}

/** Light and dark variants; Android picks one from the system theme. */
export function renderNeriWidget(
  snapshot: WidgetSnapshot | null,
  state: WidgetViewState,
  now: string,
  info: Pick<WidgetInfo, 'width' | 'height'> & { widgetId?: number },
  accent?: string | null,
): WidgetRepresentation {
  const light = withAccent(LIGHT, accent, 'light');
  const dark = withAccent(DARK, accent, 'dark');
  // Both variants get the same links: Android only takes tap targets from the light one
  const quick: QuickAdd = { widgetId: info.widgetId ?? 0, accentLight: light.accent, accentDark: dark.accent };
  const common = { snapshot, state, now, width: info.width, height: info.height, quick };
  return {
    light: <NeriWidgetView {...common} t={light} />,
    dark: <NeriWidgetView {...common} t={dark} />,
  };
}

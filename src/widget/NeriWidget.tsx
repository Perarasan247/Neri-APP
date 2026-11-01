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
import { friendlyDate } from '@/lib/format';

import type { WidgetHabit, WidgetSnapshot, WidgetTask, WidgetViewState } from './store';

export const WIDGET_NAME = 'Neri';

/** Click actions handled in taskHandler.ts. */
export const ACTIONS = {
  setPage: 'SET_PAGE',
  setTaskView: 'SET_TASK_VIEW',
  habit: 'HABIT_TAP',
  task: 'TASK_TAP',
  refresh: 'REFRESH',
} as const;

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

const CHECK_PATH = 'M7.5 12.5l3 3 6-6.5';

const svgCircle = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="${color}" stroke-width="2"/></svg>`;

const svgChecked = (color: string, tick: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="${color}"/><path d="${CHECK_PATH}" fill="none" stroke="${tick}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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

function Tab({ label, active, onPressData, t }: { label: string; active: boolean; onPressData: object; t: WidgetTheme }) {
  return (
    <FlexWidget
      clickAction={ACTIONS.setPage}
      clickActionData={onPressData as Record<string, unknown>}
      accessibilityLabel={`Show ${label}`}
      style={{
        paddingHorizontal: 14,
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

function SectionHeader({ label, color, t }: { label: string; color?: Hex; t: WidgetTheme }) {
  return (
    <FlexWidget style={{ width: 'match_parent', paddingTop: 8, paddingBottom: 2, paddingHorizontal: 4 }}>
      <TextWidget text={label.toUpperCase()} style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.06, color: color ?? t.subtle }} />
    </FlexWidget>
  );
}

/* ---------- Habits page ---------- */

const streakLabel = (h: WidgetHabit) =>
  h.streak > 0 ? `🔥 ${h.streak} ${h.streakUnit}${h.streak === 1 ? '' : 's'}` : '';

function HabitRow({ h, t }: { h: WidgetHabit; t: WidgetTheme }) {
  const color = asHex(h.color, t.accent);
  const icon = h.done
    ? svgChecked(color, '#ffffff')
    : h.target
      ? svgCounter(color, t.line, h.count / h.target)
      : svgCircle(color);
  const detail = h.target ? `${h.count} / ${h.target}` : h.opensApp && !h.done ? 'Tap to log in app' : '';
  const streak = streakLabel(h);
  // Habits that need the full UI (value logging, "avoid" habits, undoing a count) open Today instead
  const inApp = h.opensApp || (h.target !== null && h.done);
  const circleAction = inApp
    ? { clickAction: 'OPEN_URI', clickActionData: { uri: 'neri://' } }
    : { clickAction: ACTIONS.habit, clickActionData: { id: h.id } };

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `neri://habit/${h.id}` }}
      accessibilityLabel={`Open ${h.name}`}
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
        accessibilityLabel={inApp ? `Log ${h.name} in Neri` : h.done ? `Mark ${h.name} not done` : `Complete ${h.name}`}
        style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}
      >
        <SvgWidget svg={icon} style={{ width: 24, height: 24 }} />
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

function HabitsPage({ s, t, compact }: { s: WidgetSnapshot; t: WidgetTheme; compact: boolean }) {
  if (s.isRestDay) return <Empty t={t} title="Rest day 🌿" subtitle="No habits today. Enjoy the break." />;
  if (s.habits.length === 0)
    return <Empty t={t} title="No habits due today" subtitle="Tap + to add a habit" uri="neri://habit/new" />;

  const done = s.habits.filter((h) => h.done).length;
  const total = s.habits.length;
  const allDone = done === total;
  const ratio = done / total;
  const title = allDone ? 'All done today 🎉' : `${done} of ${total} done`;
  const subtitle = s.overallStreak > 0 ? `🔥 ${s.overallStreak}-day streak` : `${Math.round(ratio * 100)}% of today`;
  const color = allDone ? t.success : t.accent;

  const progress = compact ? (
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
        {s.habits.map((h) => (
          <HabitRow key={h.id} h={h} t={t} />
        ))}
      </ListWidget>
    </FlexWidget>
  );
}

/* ---------- Tasks page ---------- */

function TaskRow({ task, t, now, showDate }: { task: WidgetTask; t: WidgetTheme; now: string; showDate: boolean }) {
  const overdue = !task.done && task.date !== null && task.date < now;
  const icon = task.done ? svgChecked(t.accent, '#ffffff') : svgCircle(t.priority[task.priority] ?? t.subtle);
  const dateText = task.date ? friendlyDate(task.date, now) : 'No date';
  const meta = [showDate || overdue ? dateText : '', task.time ?? ''].filter(Boolean).join(' · ');
  const metaColor = overdue ? t.danger : task.date === now ? t.accent : t.muted;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: `neri://task/${task.id}` }}
      accessibilityLabel={`Open ${task.title}`}
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
        <SvgWidget svg={icon} style={{ width: 22, height: 22 }} />
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
function inboxRows(tasks: WidgetTask[], t: WidgetTheme, now: string) {
  const rows: React.JSX.Element[] = [];
  let current: string | undefined;
  for (const task of tasks) {
    const overdue = task.date !== null && task.date < now;
    const group = task.date === null ? 'No date' : overdue ? 'Overdue' : friendlyDate(task.date, now);
    if (group !== current) {
      current = group;
      rows.push(<SectionHeader key={`h-${group}`} label={group} color={overdue ? t.danger : undefined} t={t} />);
    }
    rows.push(<TaskRow key={task.id} task={task} t={t} now={now} showDate={overdue} />);
  }
  return rows;
}

function TasksPage({ s, t, view, now }: { s: WidgetSnapshot; t: WidgetTheme; view: 'today' | 'inbox'; now: string }) {
  const overdue = s.today.filter((x) => x.date !== null && x.date < now);
  const planned = s.today.filter((x) => x.date === null || x.date >= now);
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
        <Empty t={t} title="Inbox zero 🎉" subtitle="Tap + to add a task" uri="neri://task/new" />
      ) : (
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>{inboxRows(s.inbox, t, now)}</ListWidget>
      );
  } else if (s.today.length === 0) {
    body = <Empty t={t} title="Nothing planned today" subtitle="Tap + to add a task" uri={`neri://task/new?date=${now}`} />;
  } else if (todayOpen === 0 && overdue.length === 0) {
    body = (
      <FlexWidget style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column' }}>
        <TextWidget text="All done today 🎉" style={{ fontSize: 14, fontWeight: '700', color: t.success, marginBottom: 4, marginLeft: 4 }} />
        <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>
          {planned.map((task) => (
            <TaskRow key={task.id} task={task} t={t} now={now} showDate={false} />
          ))}
        </ListWidget>
      </FlexWidget>
    );
  } else {
    const rows: React.JSX.Element[] = [];
    if (overdue.length) {
      rows.push(<SectionHeader key="h-overdue" label="Overdue" color={t.danger} t={t} />);
      overdue.forEach((task) => rows.push(<TaskRow key={task.id} task={task} t={t} now={now} showDate />));
      rows.push(<SectionHeader key="h-today" label="Today" t={t} />);
    }
    planned.forEach((task) => rows.push(<TaskRow key={task.id} task={task} t={t} now={now} showDate={false} />));
    body = <ListWidget style={{ width: 'match_parent', height: 'match_parent' }}>{rows}</ListWidget>;
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
}

function NeriWidgetView({ snapshot, state, now, width, height, t }: Props) {
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
  const addUri = onHabits
    ? 'neri://habit/new'
    : state.taskView === 'today'
      ? `neri://task/new?date=${now}`
      : 'neri://task/new';
  const stale = snapshot.date !== now;
  const narrow = width < 230;

  return (
    <FlexWidget style={root}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <FlexWidget style={{ flexDirection: 'row', padding: 3, borderRadius: 17, backgroundColor: t.chip }}>
          <Tab label="Habits" active={onHabits} onPressData={{ page: 'habits' }} t={t} />
          <Tab label="Tasks" active={!onHabits} onPressData={{ page: 'tasks' }} t={t} />
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
        <HabitsPage s={snapshot} t={t} compact={height < 200} />
      ) : (
        <TasksPage s={snapshot} t={t} view={state.taskView} now={now} />
      )}
    </FlexWidget>
  );
}

/** Light and dark variants; Android picks one from the system theme. */
export function renderNeriWidget(
  snapshot: WidgetSnapshot | null,
  state: WidgetViewState,
  now: string,
  info: Pick<WidgetInfo, 'width' | 'height'>,
): WidgetRepresentation {
  const common = { snapshot, state, now, width: info.width, height: info.height };
  return {
    light: <NeriWidgetView {...common} t={LIGHT} />,
    dark: <NeriWidgetView {...common} t={DARK} />,
  };
}

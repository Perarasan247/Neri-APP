import React, { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, PixelRatio, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import type { Todo } from '@/api/types';
import { Text } from '@/components/ui';
import { withAlpha } from '@/components/ui/HabitIcon';
import { parseISODate, taskTimeLabel } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { Colors } from '@/theme/tokens';

import { isAllDayTask, placeDayEvents, toMinutes, type PlacedEvent } from './layout';
import {
  TOTAL_DAYS,
  clamp,
  dateToIndex,
  firstVisibleIndex,
  gridOrigin,
  inRange,
  indexToDate,
  maxFirstIndex,
  renderRange,
} from './scroll';
import { eventColor } from './shared';

export const HOUR_H = 56;
const GUTTER = 46;
const GRID_H = HOUR_H * 24;
const HEAD_H = 60;
const MAX_ALL_DAY = 2;
const PILL_H = 20;
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? 'pm' : 'am'}`;
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/** Imperative scrolling used by the screen's today / chevron / jump controls. */
export interface TimeGridHandle {
  /** Animate so `date` is the first column. Returns false when it is outside the scrollable range. */
  scrollToDate: (date: string, animated?: boolean) => boolean;
  /** Move one view-span (1 / 3 / 7 days) earlier or later. */
  scrollBy: (dir: 1 | -1) => void;
}

interface Props {
  ref?: React.Ref<TimeGridHandle>;
  /** Columns in view: 1, 3 or 7. */
  span: number;
  /** First date shown on mount; remount (change the key) to jump outside the ±1000 day range. */
  initialDate: string;
  byDate: Map<string, Todo[]>;
  today: string;
  selected: string;
  onSelectDay: (date: string) => void;
  /** Long-press on an empty slot. */
  onCreate: (date: string, time: string) => void;
  onOpenTask: (id: string) => void;
  /** "+N" in the all-day row. */
  onOpenDay: (date: string) => void;
  /** First visible date, debounced while scrolling. */
  onVisibleDateChange: (first: string) => void;
  /** First visible date once scrolling has come to rest. */
  onSettle: (first: string) => void;
}

/* ---------- Event block ---------- */

const EventBlock = memo(function EventBlock({
  ev,
  color,
  dark,
  colors,
  onOpen,
}: {
  ev: PlacedEvent;
  color: string;
  dark: boolean;
  colors: Colors;
  onOpen: (id: string) => void;
}) {
  const t = ev.todo;
  const done = t.status === 'completed';
  const top = (ev.start / 60) * HOUR_H;
  const height = Math.max(((ev.end - ev.start) / 60) * HOUR_H - 2, 22);
  const showTime = height >= 44 && ev.lanes <= 2;
  const widthPct = 100 / ev.lanes;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.title}, ${taskTimeLabel(t)}`}
      onPress={() => onOpen(t.id)}
      style={[
        styles.event,
        {
          top,
          height,
          left: `${ev.lane * widthPct}%`,
          width: `${widthPct}%`,
          backgroundColor: withAlpha(color, dark ? 0.32 : 0.18),
          borderLeftColor: color,
          opacity: done ? 0.55 : 1,
        },
      ]}
    >
      <Text
        variant="caption"
        weight="semibold"
        color={colors.fg}
        numberOfLines={showTime ? 2 : 1}
        style={done ? styles.struck : undefined}
      >
        {t.title}
      </Text>
      {showTime ? (
        <Text variant="caption" color={colors.fgMuted} numberOfLines={1} style={styles.eventTime}>
          {taskTimeLabel(t)}
        </Text>
      ) : null}
    </Pressable>
  );
});

/* ---------- Now line ---------- */

function NowLine() {
  const { colors } = useTheme();
  const [min, setMin] = useState(nowMinutes);
  useEffect(() => {
    const id = setInterval(() => setMin(nowMinutes()), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <View pointerEvents="none" style={[styles.nowLine, { top: (min / 60) * HOUR_H - 1, backgroundColor: colors.danger }]}>
      <View style={[styles.nowDot, { backgroundColor: colors.danger }]} />
    </View>
  );
}

/* ---------- One day column ---------- */

const DayColumn = memo(function DayColumn({
  date,
  tasks,
  isToday,
  left,
  width,
  onCreate,
  onOpenTask,
}: {
  date: string;
  tasks: Todo[];
  isToday: boolean;
  left: number;
  width: number;
  onCreate: (date: string, time: string) => void;
  onOpenTask: (id: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === 'dark';
  const events = useMemo(() => placeDayEvents(tasks), [tasks]);
  return (
    <View
      style={[
        styles.column,
        { left, width, borderLeftColor: colors.line },
        isToday && { backgroundColor: withAlpha(colors.accent, dark ? 0.06 : 0.035) },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        accessibilityLabel={`Add task on ${date}. Long press`}
        onLongPress={(e) => {
          haptic.light();
          const mins = Math.floor((e.nativeEvent.locationY / HOUR_H) * 2) * 30;
          const hh = Math.min(23, Math.floor(mins / 60));
          onCreate(date, `${String(hh).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
        }}
        delayLongPress={350}
      />
      {events.map((ev) => (
        <EventBlock key={ev.todo.id} ev={ev} color={eventColor(ev.todo, colors)} dark={dark} colors={colors} onOpen={onOpenTask} />
      ))}
      {isToday ? <NowLine /> : null}
    </View>
  );
});

/* ---------- Header + all-day row ---------- */

const DayHeader = memo(function DayHeader({
  date,
  today,
  selected,
  compact,
  left,
  width,
  onSelect,
}: {
  date: string;
  today: string;
  selected: boolean;
  compact: boolean;
  left: number;
  width: number;
  onSelect: (d: string) => void;
}) {
  const { colors } = useTheme();
  const isToday = date === today;
  const d = parseISODate(date);
  const wd = WEEKDAY_SHORT[d.getDay()];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      onPress={() => onSelect(date)}
      style={[styles.headCell, { left, width }]}
    >
      <Text variant="caption" weight="semibold" color={isToday ? colors.accentText : colors.fgMuted}>
        {compact ? wd[0] : wd.toUpperCase()}
      </Text>
      <View
        style={[
          styles.headNum,
          isToday && { backgroundColor: colors.accent },
          selected && !isToday && { borderWidth: 1.5, borderColor: colors.accent },
        ]}
      >
        <Text variant="body" weight={isToday ? 'bold' : 'medium'} color={isToday ? colors.accentFg : colors.fg} tabular>
          {d.getDate()}
        </Text>
      </View>
    </Pressable>
  );
});

const AllDayCell = memo(function AllDayCell({
  date,
  tasks: all,
  left,
  width,
  onOpenTask,
  onOpenDay,
}: {
  date: string;
  tasks: Todo[];
  left: number;
  width: number;
  onOpenTask: (id: string) => void;
  onOpenDay: (d: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const tasks = useMemo(() => all.filter(isAllDayTask), [all]);
  const shown = tasks.length > MAX_ALL_DAY + 1 ? tasks.slice(0, MAX_ALL_DAY) : tasks;
  const more = tasks.length - shown.length;
  return (
    <View style={[styles.allDayCell, { left, width, borderLeftColor: colors.line }]}>
      {shown.map((t) => {
        const c = eventColor(t, colors);
        const done = t.status === 'completed';
        return (
          <Pressable
            key={t.id}
            onPress={() => onOpenTask(t.id)}
            accessibilityRole="button"
            accessibilityLabel={`${t.title}, all day`}
            style={[styles.pill, { backgroundColor: withAlpha(c, scheme === 'dark' ? 0.4 : 0.22), opacity: done ? 0.55 : 1 }]}
          >
            <Text variant="caption" weight="medium" color={colors.fg} numberOfLines={1} style={[styles.pillText, done && styles.struck]}>
              {t.title}
            </Text>
          </Pressable>
        );
      })}
      {more > 0 ? (
        <Pressable onPress={() => onOpenDay(date)} accessibilityRole="button" accessibilityLabel={`${more} more, open day`} style={styles.more}>
          <Text variant="caption" weight="semibold" color={colors.accentText}>
            +{more}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

/* ---------- Grid ---------- */

const EMPTY: Todo[] = [];
const TITLE_DEBOUNCE_MS = 100;
const IDLE_MS = 180;

/** Height of an all-day cell holding `n` tasks (pills plus the "+N" line). */
function allDayHeight(n: number) {
  const shown = n > MAX_ALL_DAY + 1 ? MAX_ALL_DAY : n;
  const rows = shown + (n > shown ? 1 : 0);
  return rows === 0 ? 0 : shown * PILL_H + (n > shown ? 16 : 0) + (rows - 1) * 2;
}

/**
 * Day columns that scroll horizontally with the finger and snap on day boundaries. The header and all-day
 * rows follow the native scroll offset through an Animated.Value; only ~span + 8 columns are mounted.
 */
function TimeGridImpl({
  ref,
  span,
  initialDate,
  byDate,
  today,
  selected,
  onSelectDay,
  onCreate,
  onOpenTask,
  onOpenDay,
  onVisibleDateChange,
  onSettle,
}: Props) {
  const { colors } = useTheme();
  const vRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const hRef = useRef<React.ComponentRef<typeof Animated.ScrollView>>(null);
  const [width, setWidth] = useState(0);
  const colW = width > 0 ? PixelRatio.roundToNearestPixel((width - GUTTER) / span) : 0;
  /** Columns per snap step: whole weeks in week view, single days otherwise. */
  const step = span === 7 ? 7 : 1;
  const compact = span > 3;

  const origin = useMemo(() => gridOrigin(initialDate), [initialDate]);
  const [initialIndex] = useState(() => clamp(dateToIndex(origin, initialDate), 0, maxFirstIndex(span)));
  const [first, setFirst] = useState(initialIndex);
  const firstRef = useRef(initialIndex);
  const offsetRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrollX] = useState(() => new Animated.Value(0));
  const headX = useMemo(() => Animated.multiply(scrollX, -1), [scrollX]);

  const dateAt = useCallback(
    (offset: number) => indexToDate(origin, clamp(Math.round(offset / colW), 0, maxFirstIndex(span))),
    [origin, colW, span],
  );

  const settle = useCallback(() => {
    if (colW <= 0) return;
    pendingRef.current = null;
    const d = dateAt(offsetRef.current);
    onVisibleDateChange(d);
    onSettle(d);
  }, [colW, dateAt, onVisibleDateChange, onSettle]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (colW <= 0) return;
      const x = e.nativeEvent.contentOffset.x;
      offsetRef.current = x;
      const idx = firstVisibleIndex(x, colW, span);
      if (idx !== firstRef.current) {
        firstRef.current = idx;
        setFirst(idx);
        if (titleTimer.current) clearTimeout(titleTimer.current);
        titleTimer.current = setTimeout(() => onVisibleDateChange(dateAt(offsetRef.current)), TITLE_DEBOUNCE_MS);
      }
      // Fallback "scroll ended" for programmatic scrolls and releases that never start momentum.
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(settle, IDLE_MS);
    },
    [colW, span, dateAt, onVisibleDateChange, settle],
  );

  // Offset goes to the native thread; the listener only runs the cheap index check above.
  const onScroll = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- handleScroll touches refs only in the scroll listener
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: handleScroll,
      }),
    [scrollX, handleScroll],
  );

  useEffect(
    () => () => {
      if (titleTimer.current) clearTimeout(titleTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  // Place the grid on the starting column once the width is known (and keep it on resize).
  useLayoutEffect(() => {
    if (colW <= 0) return;
    const x = firstRef.current * colW;
    offsetRef.current = x;
    scrollX.setValue(x);
    hRef.current?.scrollTo({ x, animated: false });
  }, [colW, scrollX]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToDate: (date, animated = true) => {
        const target = dateToIndex(origin, date);
        if (!inRange(target, span)) return false;
        pendingRef.current = null;
        hRef.current?.scrollTo({ x: target * colW, animated });
        return true;
      },
      scrollBy: (dir) => {
        const base = pendingRef.current ?? Math.round(offsetRef.current / (step * colW)) * step;
        const target = clamp(base + dir * span, 0, maxFirstIndex(span));
        pendingRef.current = target;
        hRef.current?.scrollTo({ x: target * colW, animated: true });
      },
    }),
    [origin, span, step, colW],
  );

  // Columns near the viewport
  const [from, to] = renderRange(first, span);
  const items = useMemo(() => {
    const out: { date: string; index: number }[] = [];
    for (let i = from; i <= to; i++) out.push({ date: indexToDate(origin, i), index: i });
    return out;
  }, [origin, from, to]);

  // All-day row height follows the busiest rendered day
  let allDayMax = 0;
  for (const it of items) {
    const n = (byDate.get(it.date) ?? EMPTY).filter(isAllDayTask).length;
    allDayMax = Math.max(allDayMax, allDayHeight(n));
  }

  // Scroll to the current time (or first event) once per mount
  const didScroll = useRef(false);
  const scrollToInitial = useCallback(() => {
    const dates = Array.from({ length: span }, (_, i) => indexToDate(origin, initialIndex + i));
    let target = 8 * 60;
    if (dates.includes(today)) target = nowMinutes() - 60;
    else {
      const starts = dates.flatMap((d) =>
        (byDate.get(d) ?? EMPTY).filter((t) => !isAllDayTask(t)).map((t) => toMinutes(t.start_time || t.due_time)),
      );
      if (starts.length) target = Math.min(...starts) - 30;
    }
    vRef.current?.scrollTo({ y: Math.max(0, (target / 60) * HOUR_H), animated: false });
  }, [span, origin, initialIndex, today, byDate]);
  useEffect(() => {
    if (didScroll.current) return;
    didScroll.current = true;
    const id = setTimeout(scrollToInitial, 0);
    return () => clearTimeout(id);
  }, [scrollToInitial]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => h), []);
  const totalW = colW * TOTAL_DAYS;

  return (
    <View style={styles.flex} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {colW > 0 ? (
        <>
          <View style={[styles.head, { borderBottomColor: colors.line }]}>
            <View style={{ width: GUTTER }} />
            <View style={styles.clip}>
              <Animated.View style={[styles.strip, { width: totalW, height: HEAD_H, transform: [{ translateX: headX }] }]}>
                {items.map((it) => (
                  <DayHeader
                    key={it.date}
                    date={it.date}
                    today={today}
                    selected={it.date === selected}
                    compact={compact}
                    left={it.index * colW}
                    width={colW}
                    onSelect={onSelectDay}
                  />
                ))}
              </Animated.View>
            </View>
          </View>
          {allDayMax > 0 ? (
            <View style={[styles.allDay, { borderBottomColor: colors.line }]}>
              <View style={[styles.allDayLabel, { width: GUTTER }]}>
                <Text variant="caption" color={colors.fgSubtle} style={styles.allDayText}>
                  All day
                </Text>
              </View>
              <View style={[styles.clip, { height: allDayMax }]}>
                <Animated.View style={[styles.strip, { width: totalW, height: allDayMax, transform: [{ translateX: headX }] }]}>
                  {items.map((it) => (
                    <AllDayCell
                      key={it.date}
                      date={it.date}
                      tasks={byDate.get(it.date) ?? EMPTY}
                      left={it.index * colW}
                      width={colW}
                      onOpenTask={onOpenTask}
                      onOpenDay={onOpenDay}
                    />
                  ))}
                </Animated.View>
              </View>
            </View>
          ) : null}
          <ScrollView
            ref={vRef}
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            nestedScrollEnabled
          >
            <View style={styles.gridRow}>
              <View style={[styles.gutter, { width: GUTTER }]}>
                {hours.map((h) => (
                  <View key={h} style={[styles.hourLabel, { top: h * HOUR_H - 7 }]}>
                    {h > 0 ? (
                      <Text variant="caption" color={colors.fgSubtle} style={styles.hourText}>
                        {hourLabel(h)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
              <View style={styles.pager}>
                {hours.map((h) => (
                  <View key={h} pointerEvents="none" style={[styles.hourLine, { top: h * HOUR_H, backgroundColor: colors.line }]} />
                ))}
                <Animated.ScrollView
                  ref={hRef}
                  horizontal
                  style={styles.pager}
                  contentContainerStyle={{ width: totalW, height: GRID_H }}
                  contentOffset={{ x: initialIndex * colW, y: 0 }}
                  onScroll={onScroll}
                  scrollEventThrottle={16}
                  onMomentumScrollEnd={settle}
                  snapToInterval={step * colW}
                  snapToAlignment="start"
                  decelerationRate="fast"
                  disableIntervalMomentum={span === 7}
                  showsHorizontalScrollIndicator={false}
                  directionalLockEnabled
                  nestedScrollEnabled
                  overScrollMode="never"
                  bounces={false}
                >
                  {items.map((it) => (
                    <DayColumn
                      key={it.date}
                      date={it.date}
                      tasks={byDate.get(it.date) ?? EMPTY}
                      isToday={it.date === today}
                      left={it.index * colW}
                      width={colW}
                      onCreate={onCreate}
                      onOpenTask={onOpenTask}
                    />
                  ))}
                </Animated.ScrollView>
              </View>
            </View>
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

export const TimeGrid = memo(TimeGridImpl);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', height: HEAD_H, borderBottomWidth: StyleSheet.hairlineWidth },
  clip: { flex: 1, overflow: 'hidden' },
  strip: { position: 'absolute', left: 0, top: 0 },
  headCell: { position: 'absolute', top: 0, alignItems: 'center', gap: 2, paddingTop: space.xs },
  headNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  allDay: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs },
  allDayLabel: { justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: space.xs, paddingTop: 3 },
  allDayText: { fontSize: 10 },
  allDayCell: { position: 'absolute', top: 0, paddingHorizontal: 2, gap: 2, borderLeftWidth: StyleSheet.hairlineWidth },
  pill: { height: PILL_H, borderRadius: radius.sm, paddingHorizontal: 5, justifyContent: 'center' },
  pillText: { fontSize: 11, lineHeight: 14 },
  more: { height: 16, justifyContent: 'center', paddingHorizontal: 5 },
  scrollContent: { height: GRID_H + space.xxl },
  gridRow: { flexDirection: 'row', height: GRID_H },
  gutter: { height: GRID_H },
  pager: { flex: 1, height: GRID_H },
  hourLabel: { position: 'absolute', right: space.xs, left: 0, alignItems: 'flex-end' },
  hourText: { fontSize: 10, lineHeight: 14 },
  hourLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  column: { position: 'absolute', top: 0, height: GRID_H, borderLeftWidth: StyleSheet.hairlineWidth },
  event: {
    position: 'absolute',
    borderRadius: radius.md,
    borderLeftWidth: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  eventTime: { fontSize: 10, lineHeight: 13 },
  struck: { textDecorationLine: 'line-through' },
  nowLine: { position: 'absolute', left: 0, right: 0, height: 2 },
  nowDot: { position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: 4 },
});

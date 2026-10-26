import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  LayoutGrid,
  List,
  Search,
  Square,
} from 'lucide-react-native';

import { ActionSheet, ErrorState, Fab, IconButton, Text, useDisclosure, type MenuOption } from '@/components/ui';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { MonthView } from '@/components/calendar/MonthView';
import { ScheduleView } from '@/components/calendar/ScheduleView';
import { TimeGrid, type TimeGridHandle } from '@/components/calendar/TimeGrid';
import { groupByDate } from '@/components/calendar/layout';
import { centerDate, shiftDate, shouldMoveWindow, snapToWeek, windowRange } from '@/components/calendar/scroll';
import {
  DEFAULT_VIEW,
  VIEW_KEY,
  VIEW_LABELS,
  isCalendarView,
  type CalendarView,
} from '@/components/calendar/shared';
import { useTodos } from '@/hooks/queries';
import { addDays, parseISODate, startOfWeek, toISODate, today as getToday } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const SPAN: Record<'day' | '3days' | 'week', number> = { day: 1, '3days': 3, week: 7 };
const VIEW_ICONS: Record<CalendarView, React.ComponentType<{ size?: number; color?: string }>> = {
  schedule: List,
  day: Square,
  '3days': Columns3,
  week: CalendarRange,
  month: LayoutGrid,
};

const addMonths = (date: string, delta: number) => {
  const d = parseISODate(date);
  const target = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return toISODate(target);
};

/** [first day, last day] of the six-week grid shown for the month containing `anchor`. */
function monthRange(anchor: string): [string, string] {
  const d = parseISODate(anchor);
  const start = startOfWeek(toISODate(new Date(d.getFullYear(), d.getMonth(), 1)));
  return [start, addDays(start, 41)];
}

function titleFor(view: CalendarView, anchor: string): string {
  const d = parseISODate(anchor);
  const sameYear = d.getFullYear() === parseISODate(getToday()).getFullYear();
  if (view === 'week') {
    const start = parseISODate(startOfWeek(anchor));
    const end = parseISODate(addDays(startOfWeek(anchor), 6));
    const s = start.toLocaleDateString('en-GB', { day: 'numeric', ...(start.getMonth() !== end.getMonth() ? { month: 'short' } : {}) });
    return `${s} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  }
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return view === 'month' || !sameYear ? `${month} ${d.getFullYear()}` : month;
}

/** Calendar: schedule / day / 3 days / week / month over the user's tasks. */
export default function CalendarScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pickers = usePickers();
  const viewSheet = useDisclosure();

  const ref = getToday();
  const [view, setViewState] = useState<CalendarView>(DEFAULT_VIEW);
  const [ready, setReady] = useState(false);
  /** First visible day (window start); `selected` is the highlighted/"add here" day. */
  const [anchor, setAnchor] = useState(ref);
  const [selected, setSelected] = useState(ref);

  /** Where the time grid (re)starts; a new key remounts it, e.g. on view change or a far jump. */
  const [gridInit, setGridInit] = useState({ date: ref, key: 0 });
  /** Centre of the fetched ±21 day window; only moves after drifting 7+ days. */
  const [center, setCenter] = useState(() => centerDate(ref, SPAN[DEFAULT_VIEW as keyof typeof SPAN] ?? 3));
  const gridRef = useRef<TimeGridHandle>(null);

  const animX = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  useEffect(() => {
    (async () => {
      const v = (await AsyncStorage.getItem(VIEW_KEY)) || (await AsyncStorage.getItem('aura.calendarView'));
      if (isCalendarView(v)) setViewState(v);
    })()
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  /** Restart the time grid with `date` as first column (snapped to the week in week view). */
  const restartGrid = useCallback((date: string, v: 'day' | '3days' | 'week') => {
    const first = v === 'week' ? snapToWeek(date) : date;
    setGridInit((g) => ({ date: first, key: g.key + 1 }));
    setAnchor(first);
    setCenter(centerDate(first, SPAN[v]));
  }, []);

  const setView = useCallback(
    (v: CalendarView) => {
      if (v === 'day' || v === '3days' || v === 'week') {
        // Grid to grid keeps the first visible date; coming from month / schedule uses the selected day.
        restartGrid(view === 'day' || view === '3days' || view === 'week' ? anchor : selected, v);
      } else {
        setAnchor(selected);
      }
      setViewState(v);
      AsyncStorage.setItem(VIEW_KEY, v).catch(() => {});
    },
    [view, anchor, selected, restartGrid],
  );

  // ----- Data: visible range plus prefetched neighbours
  const isGrid = view !== 'schedule';
  const isTimeGrid = view === 'day' || view === '3days' || view === 'week';
  const span = isTimeGrid ? SPAN[view] : 1;
  const [start, end] = view === 'month' ? monthRange(anchor) : windowRange(center);
  const [prevStart, prevEnd] = monthRange(addMonths(anchor, -1));
  const [nextStart, nextEnd] = monthRange(addMonths(anchor, 1));
  const query = useTodos({ start_date: start, end_date: end, surface: 'calendar' }, isGrid, true);
  useTodos({ start_date: prevStart, end_date: prevEnd, surface: 'calendar' }, view === 'month' && query.isSuccess);
  useTodos({ start_date: nextStart, end_date: nextEnd, surface: 'calendar' }, view === 'month' && query.isSuccess);

  const byDate = useMemo(() => groupByDate(query.data ?? []), [query.data]);
  // ----- Month paging (the time grid scrolls natively)
  const page = useCallback(
    (dir: 1 | -1) => {
      if (isAnimating.current) return;
      haptic.tap();

      if (view === 'schedule') {
        const next = addDays(selected, dir * 7);
        setSelected(next < ref ? ref : next);
        return;
      }

      if (view === 'month') {
        const nextMonth = (a: string) => addMonths(a, dir);
        isAnimating.current = true;
        Animated.timing(animX, {
          toValue: dir === 1 ? -60 : 60,
          duration: 100,
          useNativeDriver: true,
        }).start(() => {
          setAnchor(nextMonth);
          setSelected(nextMonth);
          animX.setValue(dir === 1 ? 60 : -60);
          Animated.spring(animX, {
            toValue: 0,
            friction: 8,
            tension: 70,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        });
        return;
      }
    },
    [view, selected, ref, animX],
  );

  const goToday = () => {
    haptic.tap();
    setSelected(ref);
    if (isTimeGrid) {
      if (!gridRef.current?.scrollToDate(view === 'week' ? snapToWeek(ref) : ref, true)) restartGrid(ref, view);
      return;
    }
    setAnchor(ref);
  };

  const jumpTo = (date: string) => {
    setSelected(date);
    if (isTimeGrid) {
      if (!gridRef.current?.scrollToDate(view === 'week' ? snapToWeek(date) : date, true)) restartGrid(date, view);
      return;
    }
    setAnchor(date);
  };

  const stepGrid = (dir: 1 | -1) => {
    haptic.tap();
    gridRef.current?.scrollBy(dir);
  };

  const onVisibleDateChange = useCallback((first: string) => setAnchor(first), []);
  const onSettle = useCallback(
    (first: string) => {
      const next = centerDate(first, span);
      setCenter((cur) => (shouldMoveWindow(cur, next) ? next : cur));
    },
    [span],
  );

  // Month view: horizontal swipe with drag feedback
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_e, g) => {
          animX.setValue(g.dx * 0.7);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -35 || (g.dx < -15 && g.vx < -0.3)) {
            pageRef.current(1);
          } else if (g.dx > 35 || (g.dx > 15 && g.vx > 0.3)) {
            pageRef.current(-1);
          } else {
            Animated.spring(animX, {
              toValue: 0,
              friction: 8,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(animX, {
            toValue: 0,
            friction: 8,
            useNativeDriver: true,
          }).start();
        },
      }),
    [animX],
  );

  const addOn = useCallback((date: string, time?: string) => {
    router.push({ pathname: '/task/new', params: time ? { date, time } : { date } });
  }, []);
  const openTask = useCallback((id: string) => router.push({ pathname: '/task/[id]', params: { id } }), []);
  const openDay = useCallback((date: string) => {
    setSelected(date);
    restartGrid(date, 'day');
    setViewState('day');
    AsyncStorage.setItem(VIEW_KEY, 'day').catch(() => {});
  }, [restartGrid]);
  const selectDay = useCallback((date: string) => setSelected(date), []);

  const onMonthDay = (date: string) => {
    if (date === selected) {
      openDay(date);
    } else {
      haptic.tap();
      setSelected(date);
      const a = parseISODate(anchor);
      const d = parseISODate(date);
      if (a.getMonth() !== d.getMonth() || a.getFullYear() !== d.getFullYear()) setAnchor(date);
    }
  };

  // ----- Header
  const viewOptions: MenuOption[] = [
    ...(Object.keys(VIEW_LABELS) as CalendarView[]).map((v) => {
      const Icon = VIEW_ICONS[v];
      return {
        label: VIEW_LABELS[v],
        icon: <Icon size={18} color={colors.fgMuted} />,
        selected: v === view,
        onPress: () => setView(v),
      };
    }),
    {
      label: 'Jump to date…',
      icon: <CalendarCheck size={18} color={colors.fgMuted} />,
      onPress: () => pickers.pickDate(selected, jumpTo, { title: 'Jump to date' }),
    },
  ];

  const titleDate = view === 'schedule' ? selected : anchor;
  const title = titleFor(view, titleDate);
  const isAwayFromToday = isTimeGrid ? ref < anchor || ref > shiftDate(anchor, span - 1) : anchor !== ref;

  const body = (() => {
    if (view === 'schedule') return <ScheduleView today={ref} selected={selected} onSelect={setSelected} onAdd={addOn} />;
    if (query.error && !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
    if (view === 'month') {
      const d = parseISODate(anchor);
      return (
        <View style={styles.flex} {...pan.panHandlers}>
          <Animated.View style={[styles.flex, { transform: [{ translateX: animX }] }]}>
            <MonthView
              year={d.getFullYear()}
              month={d.getMonth() + 1}
              byDate={byDate}
              today={ref}
              selected={selected}
              refreshing={query.isRefetching}
              onRefresh={() => query.refetch()}
              onDayPress={onMonthDay}
              onAdd={addOn}
            />
          </Animated.View>
        </View>
      );
    }
    return (
      <TimeGrid
        key={`${view}-${gridInit.key}`}
        ref={gridRef}
        span={span}
        initialDate={gridInit.date}
        byDate={byDate}
        today={ref}
        selected={selected}
        onSelectDay={selectDay}
        onCreate={addOn}
        onOpenTask={openTask}
        onOpenDay={openDay}
        onVisibleDateChange={onVisibleDateChange}
        onSettle={onSettle}
      />
    );
  })();

  return (
    <View style={[styles.root, { backgroundColor: colors.canvas }]}>
      <View style={[styles.top, { paddingTop: insets.top + space.xs }]}>
        <Pressable
          onPress={viewSheet.show}
          accessibilityRole="button"
          accessibilityLabel={`${title}, ${VIEW_LABELS[view]} view. Change view`}
          hitSlop={8}
          style={styles.titleButton}
        >
          <Text variant="heading" weight="semibold" numberOfLines={1} style={styles.titleText}>
            {title}
          </Text>
          <ChevronDown size={18} color={colors.fgMuted} />
        </Pressable>

        <View style={styles.actions}>
          {view !== 'schedule' ? (
            <>
              <IconButton label="Previous" size={36} onPress={() => (isTimeGrid ? stepGrid(-1) : page(-1))}>
                <ChevronLeft size={20} color={colors.fgMuted} />
              </IconButton>
              <IconButton label="Next" size={36} onPress={() => (isTimeGrid ? stepGrid(1) : page(1))}>
                <ChevronRight size={20} color={colors.fgMuted} />
              </IconButton>
            </>
          ) : null}

          {isAwayFromToday && (
            <Pressable
              onPress={goToday}
              hitSlop={6}
              style={[styles.todayChip, { backgroundColor: colors.accentSoft }]}
              accessibilityRole="button"
              accessibilityLabel="Go to today"
            >
              <Text variant="caption" weight="semibold" color={colors.accentText}>
                Today
              </Text>
            </Pressable>
          )}

          <IconButton
            label="Search tasks"
            size={36}
            onPress={() => router.navigate({ pathname: '/(tabs)/inbox', params: { focusSearch: String(Date.now()) } })}
          >
            <Search size={20} color={colors.fgMuted} />
          </IconButton>

          <IconButton
            label="Select date"
            size={36}
            onPress={() => {
              haptic.tap();
              pickers.pickDate(selected, jumpTo, { title: 'Select date' });
            }}
          >
            <CalendarDays size={20} color={colors.fgMuted} />
          </IconButton>
        </View>
      </View>

      <View style={styles.flex}>{ready ? body : null}</View>
      <Fab label="Add task" onPress={() => addOn(selected)} />
      <ActionSheet visible={viewSheet.open} onClose={viewSheet.hide} title="Calendar view" options={viewOptions} />
      {pickers.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  titleButton: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, paddingLeft: space.xs },
  titleText: { flexShrink: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', gap: 2 },
  todayChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginRight: 4,
  },
});

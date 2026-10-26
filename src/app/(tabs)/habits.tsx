import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Archive, BarChart3, ChevronLeft, ChevronRight, MoreHorizontal, Plus, Repeat } from 'lucide-react-native';

import type { Habit, MonthlyCell, MonthlyData, MonthlyHabitRow } from '@/api/types';
import { CellSheet, type CellSelection } from '@/components/habits/CellSheet';
import { HabitMonthStrip, MonthLegend, MonthRuler, MonthSummary } from '@/components/habits/MonthGrid';
import { HabitWeekCard, WeekHeader, WeekLegend, cellEditable } from '@/components/habits/WeekView';
import {
  ActionSheet,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LargeTitle,
  Screen,
  Segmented,
  Skeleton,
  Text,
  useDisclosure,
  useToast,
} from '@/components/ui';
import { useMonth, useUpsertLog } from '@/hooks/queries';
import { addDays, monthLabel, parseISODate, startOfWeek, today } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

type Mode = 'week' | 'month';
type YM = { y: number; m: number };

const ymOf = (iso: string): YM => {
  const d = parseISODate(iso);
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
};
const shiftMonth = ({ y, m }: YM, delta: number): YM => {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
};
const ymKey = ({ y, m }: YM) => y * 12 + m;

/** "20 – 26 Oct" or "27 Oct – 2 Nov" */
function weekLabel(start: string): string {
  const a = parseISODate(start);
  const b = parseISODate(addDays(start, 6));
  const mon = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${mon(b)}`
    : `${a.getDate()} ${mon(a)} – ${b.getDate()} ${mon(b)}`;
}

/** Merge habit rows from the (up to two) months a week touches. */
function mergeRows(a?: MonthlyData, b?: MonthlyData): MonthlyHabitRow[] {
  if (!a) return b?.habits ?? [];
  if (!b || b === a) return a.habits;
  const map = new Map<string, MonthlyHabitRow>();
  for (const row of [...a.habits, ...b.habits]) {
    const prev = map.get(row.habit.id);
    map.set(row.habit.id, prev ? { ...prev, cells: [...prev.cells, ...row.cells] } : row);
  }
  return [...map.values()];
}

/**
 * Habits tab. Week mode (default) is the working view: seven tappable day
 * circles per habit. Month mode is a compact overview with one heat strip
 * per habit and the month's KPIs.
 */
export default function HabitsScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const menu = useDisclosure();
  const upsert = useUpsertLog();
  const todayStr = today();

  const [mode, setMode] = useState<Mode>('week');
  const thisWeek = startOfWeek(todayStr);
  const [weekStart, setWeekStart] = useState(thisWeek);
  const currentYm = ymOf(todayStr);
  const [ym, setYm] = useState<YM>(currentYm);
  const [selection, setSelection] = useState<CellSelection | null>(null);

  // Week mode needs the month(s) the week spans; month mode needs the chosen month
  const weekEnd = addDays(weekStart, 6);
  const first = mode === 'week' ? ymOf(weekStart) : ym;
  const second = mode === 'week' ? ymOf(weekEnd) : ym;
  const monthA = useMonth(first.y, first.m);
  const monthB = useMonth(second.y, second.m);
  const sameMonth = ymKey(first) === ymKey(second);

  const isPending = monthA.isPending || (!sameMonth && monthB.isPending);
  const error = monthA.error ?? (sameMonth ? null : monthB.error);
  const refetch = useCallback(() => {
    void monthA.refetch();
    if (!sameMonth) void monthB.refetch();
  }, [monthA, monthB, sameMonth]);

  const trackingStart = monthA.data?.tracking_start_date;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const rows = useMemo(
    () => (mode === 'week' ? mergeRows(monthA.data, sameMonth ? undefined : monthB.data) : (monthA.data?.habits ?? [])),
    [mode, monthA.data, monthB.data, sameMonth],
  );

  /* ----- navigation bounds ----- */
  const atCurrent = mode === 'week' ? weekStart >= thisWeek : ymKey(ym) >= ymKey(currentYm);
  const atStart = trackingStart
    ? mode === 'week'
      ? weekStart <= startOfWeek(trackingStart)
      : ymKey(ym) <= ymKey(ymOf(trackingStart))
    : false;
  const step = (dir: -1 | 1) => {
    haptic.tap();
    if (mode === 'week') setWeekStart(addDays(weekStart, dir * 7));
    else setYm(shiftMonth(ym, dir));
  };
  const backToNow = () => (mode === 'week' ? setWeekStart(thisWeek) : setYm(currentYm));
  const label = mode === 'week' ? weekLabel(weekStart) : monthLabel(ym.y, ym.m);

  /* ----- day actions ----- */
  const openHabit = useCallback((h: Habit) => router.push({ pathname: '/habit/[id]', params: { id: h.id } }), []);

  const openEditor = useCallback(
    (habit: Habit, cell: MonthlyCell) => {
      if (!cellEditable(cell)) return;
      haptic.tap();
      setSelection({ habit, cell });
    },
    [],
  );

  const onDayPress = useCallback(
    (habit: Habit, cell: MonthlyCell) => {
      if (!cellEditable(cell)) return;
      // One-tap logging for yes/no habits; counts and slips need the editor
      if (habit.type !== 'build_yesno' || cell.state === 'skipped') {
        openEditor(habit, cell);
        return;
      }
      const done = cell.state !== 'done';
      if (done) haptic.success();
      else haptic.tap();
      upsert.mutate(
        { habit_id: habit.id, log_date: cell.date, count: done ? 1 : 0, status: 'done', note: cell.note },
        { onError: (e) => toast(e.message, { tone: 'danger' }) },
      );
    },
    [openEditor, upsert, toast],
  );

  /* ----- header ----- */
  const header = (
    <View style={{ gap: space.md, marginBottom: space.md }}>
      <LargeTitle
        title="Habits"
        actions={
          <>
            <IconButton label="New habit" onPress={() => router.push('/habit/new')}>
              <Plus size={22} color={colors.fg} />
            </IconButton>
            <IconButton label="More options" onPress={menu.show}>
              <MoreHorizontal size={22} color={colors.fg} />
            </IconButton>
          </>
        }
      />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
      />
      <View style={styles.nav}>
        <IconButton
          label={mode === 'week' ? 'Previous week' : 'Previous month'}
          onPress={() => step(-1)}
          disabled={atStart}
          style={{ opacity: atStart ? 0.3 : 1 }}
        >
          <ChevronLeft size={22} color={colors.fgSoft} />
        </IconButton>
        <Pressable
          onPress={backToNow}
          disabled={atCurrent}
          accessibilityRole="button"
          accessibilityLabel={atCurrent ? label : `${label}. Go to ${mode === 'week' ? 'this week' : 'this month'}`}
          style={styles.navLabel}
        >
          <Text variant="title" tabular>
            {label}
          </Text>
          <Text variant="caption" tone={atCurrent ? 'subtle' : 'accent'} weight="semibold">
            {atCurrent ? (mode === 'week' ? 'This week' : 'This month') : mode === 'week' ? 'Back to this week' : 'Back to this month'}
          </Text>
        </Pressable>
        <IconButton
          label={mode === 'week' ? 'Next week' : 'Next month'}
          onPress={() => step(1)}
          disabled={atCurrent}
          style={{ opacity: atCurrent ? 0.3 : 1 }}
        >
          <ChevronRight size={22} color={colors.fgSoft} />
        </IconButton>
      </View>
      {mode === 'month' ? (
        monthA.data ? (
          <MonthSummary summary={monthA.data.summary} />
        ) : (
          <Skeleton height={64} style={{ borderRadius: 12 }} />
        )
      ) : null}
    </View>
  );

  let status: React.ReactNode = null;
  if (isPending && rows.length === 0) {
    status = (
      <View style={{ gap: space.sm }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={mode === 'week' ? 104 : 64} style={{ borderRadius: 12 }} />
        ))}
      </View>
    );
  } else if (error && rows.length === 0) {
    status = <ErrorState error={error} onRetry={refetch} />;
  }

  const empty = !status && rows.length === 0;
  const refreshControl = (
    <RefreshControl
      refreshing={monthA.isRefetching || monthB.isRefetching}
      onRefresh={refetch}
      tintColor={colors.fgSubtle}
      colors={[colors.accent]}
    />
  );
  const emptyState = (
    <EmptyState
      icon={<Repeat size={24} color={colors.fgSubtle} />}
      title="No habits yet"
      description="Create a habit, then check it off here day by day."
      action={
        <Button
          title="New habit"
          variant="primary"
          icon={<Plus size={18} color={colors.accentFg} />}
          onPress={() => router.push('/habit/new')}
        />
      }
    />
  );

  return (
    <Screen scroll={false} padded={false}>
      {mode === 'week' ? (
        <FlatList
          data={status ? [] : rows}
          keyExtractor={(r) => r.habit.id}
          contentContainerStyle={styles.list}
          refreshControl={refreshControl}
          ListHeaderComponent={
            <>
              {header}
              {!status && !empty ? (
                <View style={[styles.weekHeader, { backgroundColor: colors.canvas }]}>
                  <WeekHeader days={days} todayStr={todayStr} />
                </View>
              ) : null}
              {status}
            </>
          }
          ListEmptyComponent={empty ? emptyState : undefined}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          renderItem={({ item }) => (
            <HabitWeekCard
              row={item}
              days={days}
              todayStr={todayStr}
              onOpenHabit={openHabit}
              onDayPress={onDayPress}
              onDayLongPress={openEditor}
            />
          )}
          ListFooterComponent={
            rows.length > 0 && !status ? (
              <View>
                <WeekLegend />
                <Text variant="caption" tone="subtle">
                  Tap a day to check it off · hold for notes, skips and counts
                </Text>
              </View>
            ) : undefined
          }
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
          {header}
          {status}
          {empty ? emptyState : null}
          {!status && rows.length > 0 ? (
            <>
              <Card>
                <MonthRuler days={rows[0].cells.length} />
                {rows.map((row, i) => (
                  <React.Fragment key={row.habit.id}>
                    {i > 0 ? <Divider /> : null}
                    <HabitMonthStrip row={row} todayStr={todayStr} onOpenHabit={openHabit} />
                  </React.Fragment>
                ))}
              </Card>
              <MonthLegend />
              <Text variant="caption" tone="subtle">
                Tap a habit for its full calendar and insights. Edit days in Week view.
              </Text>
            </>
          ) : null}
        </ScrollView>
      )}

      <ActionSheet
        visible={menu.open}
        onClose={menu.hide}
        options={[
          {
            label: 'Archived habits',
            icon: <Archive size={18} color={colors.fgSoft} />,
            onPress: () => router.push('/archived'),
          },
          {
            label: 'Habit insights',
            icon: <BarChart3 size={18} color={colors.fgSoft} />,
            onPress: () => router.push('/insights'),
          },
        ]}
      />
      <CellSheet selection={selection} onClose={() => setSelection(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxxl, flexGrow: 1 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navLabel: { flex: 1, alignItems: 'center' },
  weekHeader: { marginBottom: space.xs },
});

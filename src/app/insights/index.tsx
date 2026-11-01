import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { BarChart3, CalendarRange, Flame } from 'lucide-react-native';

import type { RankedHabit, TrendPoint } from '@/api/types';
import { AreaChart, BarChart, BarList } from '@/components/charts';
import { ChartCard } from '@/components/insights/ChartCard';
import { halfRateChange } from '@/components/insights/halves';
import { InsightsSkeleton } from '@/components/insights/InsightsSkeleton';
import { RangeControl, useInsightsRange } from '@/components/insights/RangeControl';
import { RestDaysSheet } from '@/components/insights/RestDaysSheet';
import { BAR_MAX_POINTS, pointTitle } from '@/components/insights/trend';
import {
  Button,
  Delta,
  EmptyState,
  ErrorState,
  HabitTile,
  Kpi,
  KpiGrid,
  ProgressBar,
  Screen,
  Segmented,
  Text,
  useDisclosure,
} from '@/components/ui';
import { useDashboardInsights } from '@/hooks/queries';
import { friendlyDate, pluralize } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** All-habits insights dashboard (web: InsightsPage → DashboardInsights). */
export default function HabitInsightsScreen() {
  const { colors } = useTheme();
  const rangeState = useInsightsRange('month');
  const q = useDashboardInsights(rangeState.range);
  const rest = useDisclosure();
  const data = q.data;

  const trend: TrendPoint[] = data?.consistency_trend ?? [];
  const g = data?.trend_granularity;
  const rateChange = halfRateChange(trend);
  const ranked: RankedHabit[] = (data?.per_habit_ranking ?? []).filter((h) => h.eligible_days > 0);
  const rhythm = data?.weekday_rhythm ?? [];
  const bestRhythm = Math.max(0, ...rhythm.filter((w) => w.scheduled > 0).map((w) => w.rate));
  const noHabits = data && data.per_habit_ranking.length === 0 && data.habit_timeline.length === 0;
  const openHabit = (id: string) => router.push({ pathname: '/habit/[id]', params: { id } });

  return (
    <Screen safeTop={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: 'Habit insights' }} />

      <View style={{ gap: space.lg }}>
        <Segmented<'habits' | 'tasks'>
          value="habits"
          onChange={(v) => v === 'tasks' && router.replace('/insights/tasks')}
          options={[
            { value: 'habits', label: 'Habits' },
            { value: 'tasks', label: 'Tasks' },
          ]}
        />
        <RangeControl state={rangeState} />

        {q.isPending ? (
          <InsightsSkeleton />
        ) : q.error && !data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !data ? null : noHabits ? (
          <EmptyState
            icon={<BarChart3 size={24} color={colors.fgSubtle} />}
            title="No habits to analyse yet"
            description="Create a habit and check it off for a few days. Your insights will show up here."
            action={<Button title="New habit" variant="primary" onPress={() => router.push('/habit/new')} />}
          />
        ) : data.tracked_days === 0 ? (
          <EmptyState
            icon={<CalendarRange size={24} color={colors.fgSubtle} />}
            title="Nothing tracked in this range"
            description="This range is before you started tracking. Pick a later range or All."
          />
        ) : (
          <View style={{ gap: space.lg, opacity: q.isPlaceholderData ? 0.6 : 1 }}>
            <Text variant="caption" tone="subtle" tabular style={{ marginTop: -space.sm }}>
              {data.date_range.start === data.date_range.end
                ? friendlyDate(data.date_range.start)
                : `${friendlyDate(data.date_range.start)} – ${friendlyDate(data.date_range.end)}`}
            </Text>

            <KpiGrid>
              <Kpi
                label="Completion rate"
                value={`${data.overall_completion_rate}%`}
                delta={rateChange != null ? <Delta value={rateChange} unit=" pts" /> : undefined}
                footnote={`${data.total_completed_events} of ${data.total_eligible_days} goals met`}
              />
              <Kpi
                label="Perfect days"
                value={String(data.perfect_days_count)}
                footnote={`Every do-it habit done · of ${pluralize(data.active_days, 'day')}`}
              />
              <Kpi
                label="Current streak"
                value={pluralize(data.current_overall_streak, 'day')}
                footnote={`Best in range: ${pluralize(data.longest_overall_streak, 'day')}`}
              />
              <Kpi label="Rest days" value={String(data.rest_days)} footnote="View history ›" onPress={rest.show} />
            </KpiGrid>
            <Text variant="caption" tone="subtle" style={{ marginTop: -space.sm }}>
              A streak day has at least 70% of its habits done. Perfect days leave out cut-down habits.
            </Text>

            <ChartCard
              title="Consistency over time"
              description={`Share of scheduled habits completed, per ${g ?? 'day'}`}
            >
              {trend.length === 0 ? (
                <Text variant="small" tone="subtle">
                  No data in this period.
                </Text>
              ) : trend.length <= BAR_MAX_POINTS ? (
                <BarChart
                  data={trend}
                  height={200}
                  xLabel={(d) => d.label}
                  tooltipTitle={(d) => pointTitle(d.label, g)}
                  formatY={(v) => `${v}%`}
                  formatValue={(v, d) => `${v}% · ${d.done}/${d.scheduled}`}
                  series={[
                    {
                      key: 'rate',
                      label: 'Completion',
                      color: colors.accent,
                      value: (d) => d.rate,
                    },
                  ]}
                  maxBarWidth={32}
                />
              ) : (
                <AreaChart
                  data={trend}
                  height={200}
                  xLabel={(d) => d.label}
                  tooltipTitle={(d) => pointTitle(d.label, g)}
                  yDomain={[0, 100]}
                  formatY={(v) => `${v}%`}
                  formatValue={(v, d) => `${v}% · ${d.done}/${d.scheduled}`}
                  series={[
                    {
                      key: 'rate',
                      label: 'Completion',
                      color: colors.accent,
                      value: (d) => d.rate,
                    },
                  ]}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Rhythm by weekday"
              description={
                data.best_weekday
                  ? `Strongest on ${data.best_weekday}s, hardest on ${data.worst_weekday}s`
                  : 'Completion rate for each day of the week'
              }
            >
              <BarChart
                data={rhythm}
                xLabel={(d) => d.short}
                tooltipTitle={(d) => d.day}
                formatY={(v) => `${v}%`}
                formatValue={(v, d) => (d.scheduled ? `${v}% · ${d.done}/${d.scheduled}` : 'Nothing due')}
                series={[
                  {
                    key: 'rate',
                    label: 'Completion',
                    color: colors.lineStrong,
                    value: (d) => d.rate,
                  },
                ]}
                colorFor={(d) => (d.scheduled > 0 && d.rate === bestRhythm ? colors.accent : undefined)}
                maxBarWidth={28}
              />
            </ChartCard>

            <ChartCard title="Habit progress" description="Goals met out of the goals each habit had (a day, or a week or month)">
              {ranked.length === 0 ? (
                <Text variant="small" tone="subtle">
                  No habits were due in this range.
                </Text>
              ) : (
                <View style={styles.tiles}>
                  {ranked.map((h) => (
                    <ProgressTile key={h.id} habit={h} onPress={() => openHabit(h.id)} />
                  ))}
                </View>
              )}
            </ChartCard>

            <ChartCard
              title="Habits ranked"
              description="By completion rate, then days done"
              right={
                ranked.length > 0 ? (
                  <Text variant="caption" tone="subtle" tabular>
                    {pluralize(ranked.length, 'habit')}
                  </Text>
                ) : undefined
              }
            >
              {ranked.length === 0 ? (
                <Text variant="small" tone="subtle">
                  No habits in this period.
                </Text>
              ) : (
                <BarList
                  items={ranked.map((h, i) => ({
                    key: h.id,
                    label: h.name,
                    value: h.completion_rate,
                    color: h.color,
                    caption: `🔥 ${h.current_streak}${h.streak_unit === 'week' ? 'w' : h.streak_unit === 'month' ? 'mo' : ''} · best ${h.longest_streak}${h.status === 'archived' ? ' · archived' : ''}`,
                    leading: (
                      <Text variant="small" tone="subtle" tabular style={{ width: 18 }}>
                        {i + 1}
                      </Text>
                    ),
                    onPress: () => openHabit(h.id),
                  }))}
                />
              )}
            </ChartCard>
          </View>
        )}
      </View>

      {data ? (
        <RestDaysSheet
          visible={rest.open}
          onClose={rest.hide}
          restDays={data.rest_days_details}
          total={data.rest_days}
        />
      ) : null}
    </Screen>
  );
}

/** One habit's done/due count for the range, in a half-width tile. */
function ProgressTile({ habit: h, onPress }: { habit: RankedHabit; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${h.name}: ${h.completed_count} of ${h.eligible_days} ${h.streak_unit === 'day' ? 'days' : `${h.streak_unit}s`}, ${h.completion_rate}%`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          borderColor: colors.line,
          backgroundColor: pressed ? colors.subtle : colors.surface,
        },
      ]}
    >
      <View style={styles.tileHead}>
        <HabitTile icon={h.icon} color={h.color} size={26} />
        <Text variant="small" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
          {h.name}
        </Text>
      </View>
      <Text variant="title" tabular>
        {`${h.completed_count}`}
        <Text variant="small" tone="subtle">{` / ${h.eligible_days}${h.streak_unit === 'day' ? '' : ` ${h.streak_unit}s`}`}</Text>
      </Text>
      <ProgressBar value={h.completion_rate} color={h.color} />
      {h.type === 'avoid_count' && h.total_slips !== undefined ? (
        <Text variant="caption" weight="medium" tone={h.total_slips ? 'warning' : 'success'} tabular numberOfLines={1}>
          {h.total_slips
            ? `${h.total_slips} slip${h.total_slips === 1 ? '' : 's'} · ${h.slip_days} day${h.slip_days === 1 ? '' : 's'}`
            : 'No slips'}
        </Text>
      ) : null}
      <View style={styles.tileFoot}>
        <View style={styles.streak}>
          <Flame size={12} color={colors.p2} />
          <Text variant="caption" tone="muted" tabular>
            {h.current_streak}
            {h.streak_unit === 'week' ? 'w' : h.streak_unit === 'month' ? 'mo' : ''}
          </Text>
        </View>
        <Text variant="caption" tone="muted" tabular>
          {`${h.completion_rate}%`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: {
    flexBasis: '48%',
    flexGrow: 1,
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  tileFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 3 },
});

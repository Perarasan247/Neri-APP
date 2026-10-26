import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { CheckCircle2 } from 'lucide-react-native';

import type { TodoPriority, TodoRecentCompletedItem } from '@/api/types';
import { AreaChart, BarChart, BarList, Legend } from '@/components/charts';
import { ChartCard } from '@/components/insights/ChartCard';
import { halfSumChange } from '@/components/insights/halves';
import { InsightsSkeleton } from '@/components/insights/InsightsSkeleton';
import { RangeControl, useInsightsRange } from '@/components/insights/RangeControl';
import { BAR_MAX_POINTS, pointTitle } from '@/components/insights/trend';
import { Button, Delta, EmptyState, ErrorState, Kpi, KpiGrid, Screen, Segmented, Text } from '@/components/ui';
import { useTodoInsights } from '@/hooks/queries';
import { friendlyDate, getAppTimeZone, pluralize, PRIORITY_META, priorityColor } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const priorityMeta = (p: string) => PRIORITY_META[p as TodoPriority] ?? PRIORITY_META.low;

/** "Yesterday, 4:30 pm" in the user's timezone. */
function formatCompletedAt(iso: string | null) {
  if (!iso) return 'Completed';
  const tz = getAppTimeZone();
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
  const time = new Date(iso).toLocaleTimeString('en-IN', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return `${friendlyDate(day)}, ${time}`;
}

const turnaround = (h: number) => (h > 24 ? `${(h / 24).toFixed(1)}d` : `${h}h`);

/** Task analytics (web: TodoInsightsPage). */
export default function TaskInsightsScreen() {
  const { colors } = useTheme();
  const rangeState = useInsightsRange('month');
  const q = useTodoInsights(rangeState.range);
  const data = q.data;

  const trend = data?.completion_trend ?? [];
  const g = data?.trend_granularity;
  const createdInRange = trend.reduce((s, d) => s + d.created, 0);
  const completedChange = halfSumChange(trend, (d) => d.completed);
  const weekdays = data?.weekday_productivity ?? [];
  const maxWeekday = Math.max(0, ...weekdays.map((d) => d.completed_count));
  const empty = data && data.summary.total_tasks === 0 && data.recent_completed.length === 0;

  return (
    <Screen safeTop={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: 'Task insights' }} />

      <View style={{ gap: space.lg }}>
        <Segmented<'habits' | 'tasks'>
          value="tasks"
          onChange={(v) => v === 'habits' && router.replace('/insights')}
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
        ) : !data ? null : empty ? (
          <EmptyState
            icon={<CheckCircle2 size={24} color={colors.fgSubtle} />}
            title="No tasks in this period"
            description="Add and complete a few tasks to see how you're getting through them."
            action={<Button title="Add a task" variant="primary" onPress={() => router.push('/task/new')} />}
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
                value={`${data.summary.completion_rate}%`}
                footnote={`${data.summary.completed_tasks} of ${data.summary.total_tasks} finished`}
              />
              <Kpi
                label="Completed"
                value={String(data.total_completed_in_range)}
                delta={completedChange != null ? <Delta value={completedChange} /> : undefined}
                footnote={`${createdInRange} created in this range`}
              />
              <Kpi
                label="On-time rate"
                value={`${data.summary.on_time_rate}%`}
                footnote={`Avg turnaround ${turnaround(data.summary.avg_completion_hours)}`}
              />
              <Kpi
                label="Overdue"
                value={String(data.summary.overdue_tasks)}
                valueTone={data.summary.overdue_tasks > 0 ? 'danger' : 'fg'}
                footnote={`Productive streak: ${pluralize(data.summary.productive_streak, 'day')}`}
                onPress={data.summary.overdue_tasks > 0 ? () => router.navigate('/(tabs)/calendar') : undefined}
              />
            </KpiGrid>
            {completedChange != null ? (
              <Text variant="caption" tone="subtle" style={{ marginTop: -space.sm }}>
                Change compares the second half of the range with the first.
              </Text>
            ) : null}

            <ChartCard
              title="Completed vs. created"
              description={`Tasks you finished compared to tasks you added, per ${g ?? 'day'}.`}
            >
              {trend.length <= BAR_MAX_POINTS ? (
                <BarChart
                  data={trend}
                  xLabel={(d) => d.label}
                  tooltipTitle={(d) => pointTitle(d.label, g)}
                  series={[
                    { key: 'completed', label: 'Completed', color: colors.accent, value: (d) => d.completed },
                    { key: 'created', label: 'Created', color: colors.fgSubtle, value: (d) => d.created },
                  ]}
                  maxBarWidth={18}
                />
              ) : (
                <AreaChart
                  data={trend}
                  xLabel={(d) => d.label}
                  tooltipTitle={(d) => pointTitle(d.label, g)}
                  series={[
                    { key: 'completed', label: 'Completed', color: colors.accent, value: (d) => d.completed },
                    { key: 'created', label: 'Created', color: colors.fgSubtle, dashed: true, value: (d) => d.created },
                  ]}
                />
              )}
              <View style={{ marginTop: space.sm }}>
                <Legend
                  items={[
                    { color: colors.accent, label: 'Completed', box: trend.length <= BAR_MAX_POINTS },
                    {
                      color: colors.fgSubtle,
                      label: 'Created',
                      dashed: trend.length > BAR_MAX_POINTS,
                      box: trend.length <= BAR_MAX_POINTS,
                    },
                  ]}
                />
              </View>
            </ChartCard>

            <ChartCard title="By weekday" description="When you check off the most tasks.">
              <BarChart
                data={weekdays}
                xLabel={(d) => d.day}
                series={[{ key: 'count', label: 'Completed', color: colors.lineStrong, value: (d) => d.completed_count }]}
                colorFor={(d) => (d.completed_count > 0 && d.completed_count === maxWeekday ? colors.accent : undefined)}
                maxBarWidth={28}
              />
            </ChartCard>

            <ChartCard title="By priority" description="How well you close urgent vs. low-priority items.">
              <BarList
                items={data.priority_breakdown.map((p) => {
                  const meta = priorityMeta(p.priority);
                  const color = priorityColor(p.priority as TodoPriority, colors);
                  return {
                    key: p.priority,
                    label: meta.label,
                    value: p.rate,
                    color,
                    caption: `${p.completed}/${p.total}`,
                    leading: <View style={[styles.swatch, { backgroundColor: color }]} />,
                  };
                })}
              />
            </ChartCard>

            <ChartCard title="By category" description="Completion rate for each category.">
              {data.category_breakdown.length === 0 ? (
                <Text variant="small" tone="subtle">
                  No categories in this period.
                </Text>
              ) : (
                <BarList
                  items={data.category_breakdown.map((c) => ({
                    key: c.category,
                    label: c.category,
                    value: c.rate,
                    caption: `${c.completed}/${c.total}`,
                  }))}
                />
              )}
            </ChartCard>

            <ChartCard
              title="Recently completed"
              right={
                data.recent_completed.length > 0 ? (
                  <Text variant="caption" tone="subtle" tabular>
                    {pluralize(data.recent_completed.length, 'task')}
                  </Text>
                ) : undefined
              }
            >
              {data.recent_completed.length === 0 ? (
                <Text variant="small" tone="subtle">
                  Tasks you check off will show up here.
                </Text>
              ) : (
                data.recent_completed.map((t, i) => <RecentRow key={t.id} task={t} first={i === 0} />)
              )}
            </ChartCard>
          </View>
        )}
      </View>
    </Screen>
  );
}

function RecentRow({ task, first }: { task: TodoRecentCompletedItem; first: boolean }) {
  const { colors } = useTheme();
  const meta = priorityMeta(task.priority);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      style={({ pressed }) => [
        styles.recent,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
        pressed && { backgroundColor: colors.subtle },
      ]}
    >
      <CheckCircle2 size={18} color={colors.success} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" tone="muted" strike numberOfLines={1}>
          {task.title}
        </Text>
        <Text variant="caption" tone="subtle" numberOfLines={1}>
          {`${formatCompletedAt(task.completed_at)} · #${task.category}`}
        </Text>
      </View>
      <Text variant="caption" weight="semibold" color={priorityColor(task.priority as TodoPriority, colors)}>
        {meta.short}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  swatch: { width: 10, height: 10, borderRadius: 3 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2 },
});

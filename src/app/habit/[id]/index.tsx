import React from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Archive, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react-native';

import type { Habit } from '@/api/types';
import { ChartCard } from '@/components/insights/ChartCard';
import { HabitWidgets } from '@/components/insights/HabitWidgets';
import { InsightsSkeleton } from '@/components/insights/InsightsSkeleton';
import { RangeControl, useInsightsRange } from '@/components/insights/RangeControl';
import { RestDaysSheet } from '@/components/insights/RestDaysSheet';
import {
  ActionSheet,
  Badge,
  Card,
  Delta,
  ErrorState,
  HabitTile,
  IconButton,
  Kpi,
  KpiGrid,
  Screen,
  Text,
  useDisclosure,
  useDialog,
  useToast,
  type MenuOption,
} from '@/components/ui';
import { useDeleteHabit, useHabit, useHabitInsights, useReopenHabit } from '@/hooks/queries';
import { describeSchedule, friendlyDate, HABIT_TYPE_META, streakText, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Single habit: identity, KPIs and every insight widget for the chosen range. */
export default function HabitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const toast = useToast();
  const dialog = useDialog();
  const rangeState = useInsightsRange('month');
  const q = useHabitInsights(id, rangeState.range);
  const cached = useHabit(id);
  const del = useDeleteHabit();
  const reopen = useReopenHabit();
  const menu = useDisclosure();
  const rest = useDisclosure();

  const data = q.data;
  const habit: Habit | undefined = cached.data ?? data?.habit;
  const isArchived = habit?.status === 'archived';

  const confirmDelete = (keepData: boolean) => {
    if (!habit) return;
    dialog.alert(
      keepData ? `Archive “${habit.name}”?` : `Delete “${habit.name}”?`,
      keepData
        ? 'It stops appearing on Today. Its history is kept and you can reopen it later.'
        : 'This permanently removes the habit and all of its history. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: keepData ? 'Archive' : 'Delete',
          style: 'destructive',
          onPress: () =>
            del.mutate(
              { id: habit.id, keepData },
              {
                onSuccess: () => {
                  toast(keepData ? 'Habit archived' : 'Habit deleted', { tone: 'success' });
                  router.back();
                },
                onError: (e) => toast(e.message, { tone: 'danger' }),
              },
            ),
        },
      ],
    );
  };

  const options: MenuOption[] = habit
    ? [
        {
          label: 'Edit habit',
          icon: <Pencil size={18} color={colors.fgSoft} />,
          onPress: () => router.push({ pathname: '/habit/[id]/edit', params: { id: habit.id } }),
        },
        isArchived
          ? {
              label: 'Reopen from today',
              icon: <RotateCcw size={18} color={colors.fgSoft} />,
              onPress: () =>
                reopen.mutate(
                  { id: habit.id, date: today() },
                  {
                    onSuccess: () => toast('Habit reopened', { tone: 'success' }),
                    onError: (e) => toast(e.message, { tone: 'danger' }),
                  },
                ),
            }
          : {
              label: 'Archive (keep history)',
              icon: <Archive size={18} color={colors.fgSoft} />,
              onPress: () => confirmDelete(true),
            },
        {
          label: 'Delete permanently',
          icon: <Trash2 size={18} color={colors.danger} />,
          destructive: true,
          onPress: () => confirmDelete(false),
        },
      ]
    : [];

  const isAvoid = habit?.type === 'avoid_count';
  const widget = (t: string) => data?.widgets.find((w) => w.widget_type === t)?.data;
  const avoidMetrics = widget('avoid_metrics');
  const countMetrics = widget('count_metrics');
  const periodUnit: string | undefined = widget('period_progress')?.unit;
  const schedule = habit?.current_schedule ?? habit?.schedules?.[habit.schedules.length - 1];

  return (
    <Screen safeTop={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen
        options={{
          title: habit?.name ?? '',
          headerRight: habit
            ? () => (
                <IconButton label="Habit actions" size={36} onPress={menu.show}>
                  <MoreHorizontal size={22} color={colors.fg} />
                </IconButton>
              )
            : undefined,
        }}
      />

      <View style={{ gap: space.lg }}>
        {habit ? (
          <Card padded style={styles.identity}>
            <HabitTile icon={habit.icon} color={habit.color} size={44} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text variant="title" numberOfLines={2}>
                {habit.name}
              </Text>
              <View style={styles.badges}>
                <Badge label={HABIT_TYPE_META[habit.type]?.label ?? habit.type} tone="accent" />
                {schedule ? (
                  <Badge
                    label={`${describeSchedule(schedule)}${
                      habit.type !== 'build_yesno' && schedule.daily_target ? ` · ${schedule.daily_target}/day` : ''
                    }`}
                  />
                ) : null}
                {isArchived ? <Badge label="Archived" tone="warning" dot /> : null}
              </View>
              {habit.description ? (
                <Text variant="small" tone="soft">
                  {habit.description}
                </Text>
              ) : null}
              {data?.denominator_explanation ? (
                <Text variant="caption" tone="muted">
                  {data.denominator_explanation}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}

        <RangeControl state={rangeState} />

        {q.isPending ? (
          <InsightsSkeleton />
        ) : q.error && !data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : data && habit ? (
          <>
            <KpiGrid>
              <Kpi
                label={isAvoid ? 'Clean rate' : 'Completion rate'}
                value={`${data.completion_rate}%`}
                footnote={`${data.completed_units} of ${data.eligible_units} ${
                  isAvoid ? 'clean days' : periodUnit ? `${periodUnit}s hit` : 'days'
                }`}
              />
              {isAvoid ? (
                <Kpi
                  label="Total slips"
                  value={String(avoidMetrics?.total_occurrences ?? 0)}
                  delta={<Delta value={Number(avoidMetrics?.trend_vs_prev ?? 0)} invert />}
                  footnote="vs. prior period · fewer is better"
                />
              ) : habit.type === 'build_count' ? (
                <Kpi
                  label="Total volume"
                  value={String(countMetrics?.total_volume ?? 0)}
                  footnote={`Avg ${countMetrics?.daily_average ?? 0} · best ${countMetrics?.best_day ?? 0}`}
                />
              ) : (
                <Kpi
                  label={periodUnit ? `${periodUnit === 'week' ? 'Weeks' : 'Months'} goal hit` : 'Days completed'}
                  value={String(data.completed_units)}
                  footnote={`${Math.max(0, data.eligible_units - data.completed_units)} missed of ${data.eligible_units}`}
                />
              )}
              <Kpi
                label={isAvoid ? 'Clean streak' : 'Current streak'}
                value={streakText(data.current_streak, data.streak_unit)}
                footnote={`Longest: ${streakText(data.longest_streak, data.streak_unit)}`}
              />
              <Kpi label="Rest days excluded" value={String(data.rest_days_count)} footnote="View log ›" onPress={rest.show} />
            </KpiGrid>

            {data.eligible_units === 0 ? (
              <Text variant="small" tone="subtle" center>
                Nothing was scheduled for this habit in this period yet.
              </Text>
            ) : null}

            <HabitWidgets habit={habit} widgets={data.widgets} />

            <ChartCard title="Active periods" description="Time during inactive gaps never counts as a failure.">
              {data.lifespan_periods.length === 0 ? (
                <Text variant="small" tone="subtle">
                  No active periods.
                </Text>
              ) : (
                data.lifespan_periods.map((p: { start: string; end: string; is_active: boolean }, i: number) => (
                  <View
                    key={i}
                    style={[styles.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
                  >
                    <Text variant="small" tabular style={{ flex: 1 }}>
                      {`${friendlyDate(p.start)} → ${p.is_active ? 'ongoing' : friendlyDate(p.end)}`}
                    </Text>
                    <Badge label={p.is_active ? 'Active' : 'Ended'} tone={p.is_active ? 'success' : 'neutral'} />
                  </View>
                ))
              )}
            </ChartCard>

            <ChartCard
              title="Notes"
              description="Reflections you logged along the way."
              right={
                data.notes.length > 0 ? (
                  <Text variant="caption" tone="subtle" tabular>
                    {data.notes.length}
                  </Text>
                ) : undefined
              }
            >
              {data.notes.length === 0 ? (
                <Text variant="small" tone="subtle">
                  No notes in this period. Add one from a habit on the Today screen.
                </Text>
              ) : (
                data.notes.map((n: { date: string; note: string; count: number }, i: number) => (
                  <View
                    key={`${n.date}-${i}`}
                    style={[styles.note, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
                  >
                    <View style={styles.noteMeta}>
                      <Text variant="caption" tone="subtle">
                        {friendlyDate(n.date)}
                      </Text>
                      {n.count > 0 && habit.type !== 'build_yesno' ? (
                        <Text variant="caption" tone="subtle" tabular>
                          {`Count: ${n.count}`}
                        </Text>
                      ) : null}
                    </View>
                    <Text variant="small">{n.note}</Text>
                  </View>
                ))
              )}
            </ChartCard>
          </>
        ) : null}
      </View>

      <ActionSheet visible={menu.open} onClose={menu.hide} title={habit?.name} options={options} />
      {data && habit ? (
        <RestDaysSheet
          visible={rest.open}
          onClose={rest.hide}
          total={data.rest_days_count}
          restDays={data.rest_days_list.map((r: { date: string; type: string; reason?: string | null }) => ({
            date: r.date,
            scope: r.type === 'Whole-day rest' ? 'whole_day' : 'habit',
            habit_name: habit.name,
            habit_color: habit.color,
            reason: r.reason || 'Rest day',
          }))}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2 },
  note: { paddingVertical: space.sm + 2, gap: 2 },
  noteMeta: { flexDirection: 'row', justifyContent: 'space-between' },
});

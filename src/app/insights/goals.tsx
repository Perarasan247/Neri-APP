import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { ChevronRight, Target } from 'lucide-react-native';

import type { Goal, GoalTreeNode, GoalTrendItem } from '@/api/types';
import { BarChart, BarList, Legend } from '@/components/charts';
import { openGoal } from '@/components/goals/GoalCard';
import { ChartCard, INSIGHTS_ROUTES } from '@/components/insights/ChartCard';
import { InsightsSkeleton } from '@/components/insights/InsightsSkeleton';
import { RangeControl, useInsightsRange } from '@/components/insights/RangeControl';
import { Badge, Button, EmptyState, ErrorState, Kpi, KpiGrid, ProgressBar, Screen, Segmented, Text } from '@/components/ui';
import { useGoalInsights } from '@/hooks/queries';
import { friendlyDate, pluralize } from '@/lib/format';
import { LEVEL_META, STATUS_META } from '@/lib/goals';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Goal analytics (web: GoalInsightsPage). */
export default function GoalInsightsScreen() {
  const { colors } = useTheme();
  const rangeState = useInsightsRange('year');
  const q = useGoalInsights(rangeState.range);
  const data = q.data;
  const s = data?.summary;
  const empty = data && s?.total_goals === 0 && data.trees.length === 0;
  const topMax = Math.max(1, ...(data?.top_goals ?? []).map((g) => g.tasks_completed));
  const focusTotal = s ? s.tasks_completed_for_goals + s.tasks_completed_unlinked : 0;

  return (
    <Screen safeTop={false} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Stack.Screen options={{ title: 'Goal insights' }} />

      <View style={{ gap: space.lg }}>
        <Segmented<'habits' | 'tasks' | 'goals'>
          value="goals"
          onChange={(v) => v !== 'goals' && router.replace(INSIGHTS_ROUTES[v])}
          options={[
            { value: 'habits', label: 'Habits' },
            { value: 'tasks', label: 'Tasks' },
            { value: 'goals', label: 'Goals' },
          ]}
        />
        <RangeControl state={rangeState} ranges={['week', 'month', 'year', 'all']} />

        {q.isPending ? (
          <InsightsSkeleton />
        ) : q.error && !data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !data || !s ? null : empty ? (
          <EmptyState
            icon={<Target size={24} color={colors.fgSubtle} />}
            title="No goals in this period"
            description="Set a goal for the week, month or year and link tasks to it. Your progress shows up here."
            action={<Button title="Go to goals" variant="primary" onPress={() => router.push('/goals')} />}
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
                value={s.completed_goals + s.missed_goals ? `${s.completion_rate}%` : '–'}
                footnote={
                  s.completed_goals + s.missed_goals
                    ? `${s.completed_goals} of ${s.completed_goals + s.missed_goals} finished`
                    : 'Nothing finished yet'
                }
              />
              <Kpi
                label="Completed"
                value={String(s.completed_goals)}
                valueTone={s.completed_goals > 0 ? 'success' : 'fg'}
                footnote={`${s.missed_goals} missed · ${s.active_goals} active`}
                footnoteTone={s.missed_goals > 0 ? 'danger' : 'subtle'}
              />
              <Kpi
                label="Perfect weeks"
                value={String(s.perfect_week_streak)}
                footnote={`Best streak: ${pluralize(s.best_perfect_week_streak, 'week')}`}
              />
              <Kpi
                label="Focus"
                value={`${s.focus_pct}%`}
                footnote={focusTotal ? `${s.tasks_completed_for_goals} of ${focusTotal} tasks served a goal` : 'No tasks done yet'}
              />
            </KpiGrid>
            <Text variant="caption" tone="subtle" style={{ marginTop: -space.sm }}>
              A perfect week is one where every weekly goal was completed. Focus is the share of completed tasks linked to a goal.
            </Text>

            <ChartCard title="By level" description="Completion rate of finished goals at each level.">
              <BarList
                items={data.by_level.map((l) => ({
                  key: l.level,
                  label: LEVEL_META[l.level].label,
                  value: l.rate ?? 0,
                  color: colors.accent,
                  // Done out of finished; goals still running are listed apart, not counted as misses
                  caption: l.total
                    ? `${l.finished ? `${l.completed}/${l.finished}` : ''}${l.finished && l.active ? ' · ' : ''}${l.active ? `+${l.active} in progress` : ''}`
                    : undefined,
                  valueLabel: l.rate == null ? (l.total ? 'Not finished yet' : 'No goals') : `${l.rate}%`,
                }))}
              />
            </ChartCard>

            <TrendCard title="Weekly goals" description="Goals set vs. completed each week." data={data.weekly_trend} />
            <TrendCard title="Monthly goals" description="Goals set vs. completed each month." data={data.monthly_trend} />

            {data.trees.length ? (
              <ChartCard title="Goal trees" description="Yearly goals with the months and weeks that served them.">
                <View>
                  {data.trees.map((t, i) => (
                    <TreeNode key={t.id} node={t} depth={0} first={i === 0} />
                  ))}
                </View>
              </ChartCard>
            ) : null}

            <ChartCard title="Most worked on" description="Goals by tasks completed in this range.">
              {data.top_goals.length === 0 ? (
                <Text variant="small" tone="subtle">
                  Complete tasks linked to a goal to see where your effort goes.
                </Text>
              ) : (
                <BarList
                  items={data.top_goals.map((g) => ({
                    key: g.goal_id,
                    label: g.title,
                    value: (g.tasks_completed / topMax) * 100,
                    color: g.color,
                    caption: LEVEL_META[g.level].label,
                    valueLabel: String(g.tasks_completed),
                    onPress: () => openGoal(g.goal_id),
                  }))}
                />
              )}
            </ChartCard>

            {data.missed.length ? (
              <ChartCard title="Recently missed">
                {data.missed.map((g, i) => (
                  <MissedRow key={g.id} goal={g} first={i === 0} />
                ))}
              </ChartCard>
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}

function TrendCard({ title, description, data }: { title: string; description: string; data: GoalTrendItem[] }) {
  const { colors } = useTheme();
  if (data.length === 0 || data.every((d) => d.total === 0)) return null;
  return (
    <ChartCard title={title} description={description}>
      <BarChart
        data={data}
        xLabel={(d) => d.label}
        series={[
          { key: 'total', label: 'Set', color: colors.lineStrong, value: (d) => d.total },
          { key: 'completed', label: 'Completed', color: colors.accent, value: (d) => d.completed },
        ]}
        maxBarWidth={16}
      />
      <View style={{ marginTop: space.sm }}>
        <Legend
          items={[
            { color: colors.lineStrong, label: 'Set', box: true },
            { color: colors.accent, label: 'Completed', box: true },
          ]}
        />
      </View>
    </ChartCard>
  );
}

/** Expandable year → months → weeks row. */
function TreeNode({ node, depth, first }: { node: GoalTreeNode; depth: number; first?: boolean }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(depth === 0 && !!first);
  const hasKids = node.children.length > 0;
  const done = node.status === 'completed';
  return (
    <View>
      <View
        style={[
          styles.treeRow,
          { paddingLeft: depth * space.lg },
          (depth > 0 || !first) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
        ]}
      >
        <Pressable
          disabled={!hasKids}
          onPress={() => {
            haptic.tap();
            setOpen((o) => !o);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Collapse' : 'Expand'}
          accessibilityState={{ expanded: open }}
          style={styles.chevron}
        >
          {hasKids ? (
            <ChevronRight
              size={16}
              color={colors.fgMuted}
              style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
            />
          ) : (
            <View style={[styles.treeDot, { backgroundColor: node.color }]} />
          )}
        </Pressable>
        <Pressable onPress={() => openGoal(node.id)} accessibilityRole="button" style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <View style={styles.treeTop}>
            <Text variant="small" weight={depth === 0 ? 'semibold' : 'medium'} numberOfLines={1} style={{ flex: 1 }}>
              {node.title}
            </Text>
            {node.status !== 'active' ? <Badge label={STATUS_META[node.status].label} tone={STATUS_META[node.status].tone} /> : null}
            <Text variant="caption" weight="semibold" tabular tone={done ? 'success' : 'muted'}>
              {`${Math.round(node.progress_pct)}%`}
            </Text>
          </View>
          <ProgressBar value={node.progress_pct} color={done ? colors.success : node.color} height={4} />
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {`${LEVEL_META[node.level].label} · ${node.period_label}${node.tasks_completed ? ` · ${pluralize(node.tasks_completed, 'task')} done` : ''}`}
          </Text>
        </Pressable>
      </View>
      {open ? node.children.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} />) : null}
    </View>
  );
}

function MissedRow({ goal, first }: { goal: Goal; first: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => openGoal(goal.id)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.missed,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
        pressed && { backgroundColor: colors.subtle },
      ]}
    >
      <View style={[styles.treeDot, { backgroundColor: goal.color }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" weight="medium" numberOfLines={1}>
          {goal.title}
        </Text>
        <Text variant="caption" tone="subtle" numberOfLines={1}>
          {`${LEVEL_META[goal.level].label} · ${goal.period_label}${goal.carried_to_id ? ' · carried over' : ''}`}
        </Text>
      </View>
      <Text variant="caption" weight="semibold" tone="danger" tabular>
        {goal.progress_label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  treeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingVertical: space.md },
  chevron: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  treeDot: { width: 8, height: 8, borderRadius: 4 },
  treeTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  missed: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm + 2 },
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { BarChart3, Plus, Target } from 'lucide-react-native';

import type { GoalLevel } from '@/api/types';
import { GoalRow, PeriodNav } from '@/components/goals/GoalCard';
import { ReviewCard } from '@/components/goals/ReviewCard';
import {
  AddCta,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  Screen,
  Segmented,
} from '@/components/ui';
import { useCurrentGoals, useGoals, useUpdateGoal } from '@/hooks/queries';
import { today } from '@/lib/format';
import { LEVEL_META, snapPeriod } from '@/lib/goals';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Filter = 'open' | 'completed' | 'all';

const LEVEL_OPTIONS: { value: GoalLevel; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
];

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
];

const isLevel = (v?: string): v is GoalLevel => v === 'weekly' || v === 'monthly' || v === 'yearly';

/** Goals for a week, month or year, with a review card for finished periods. */
export default function GoalsScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ level?: string }>();
  const ref = today();
  const [level, setLevel] = useState<GoalLevel>(isLevel(params.level) ? params.level : 'weekly');
  // Any date inside the viewed period; kept across level switches so Week → Month stays in the same place
  const [anchor, setAnchor] = useState(ref);
  const [filter, setFilter] = useState<Filter>('open');

  const start = snapPeriod(level, anchor);
  const q = useGoals({ level, period: start, status: filter });
  const current = useCurrentGoals();
  const review = current.data?.needs_review ?? [];
  const update = useUpdateGoal();
  // Open goals first, finished ones below
  const goals = [...(q.data ?? [])].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  const toggle = (g: { id: string; status: string }) =>
    update.mutate({ id: g.id, patch: { status: g.status === 'completed' ? 'active' : 'completed' } });

  const unit = LEVEL_META[level].unit;
  const newGoal = () => router.push({ pathname: '/goal/new', params: { level, period: start } });

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Stack.Screen
        options={{
          title: 'Goals',
          headerRight: () => (
            <View style={styles.headerActions}>
              <IconButton label="Goal insights" onPress={() => router.push('/insights/goals')}>
                <BarChart3 size={21} color={colors.fgSoft} />
              </IconButton>
              <IconButton label="New goal" onPress={newGoal}>
                <Plus size={22} color={colors.accent} />
              </IconButton>
            </View>
          ),
        }}
      />
      <Screen
        safeTop={false}
        onRefresh={() => {
          q.refetch();
          current.refetch();
        }}
        refreshing={q.isRefetching || current.isRefetching}
      >
        <View style={{ gap: space.lg }}>
          <Segmented<GoalLevel> value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
          <PeriodNav level={level} start={start} today={ref} onChange={setAnchor} />

          <ReviewCard goals={review} today={ref} />

          <View style={styles.filters}>
            {FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
            ))}
          </View>

          {q.isPending ? (
            <ListSkeleton rows={3} />
          ) : q.error && !q.data ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : goals.length === 0 ? (
            <EmptyState
              icon={<Target size={24} color={colors.fgSubtle} />}
              title={
                filter === 'completed'
                  ? `Nothing completed this ${unit} yet`
                  : filter === 'open'
                    ? `No active goals this ${unit}`
                    : `No goals for this ${unit}`
              }
              description={`Pick one or two things that would make this ${unit} a win. Link tasks and habits to them and Neri tracks the progress.`}
              action={
                <Button
                  title={`Set a ${LEVEL_META[level].label.toLowerCase()} goal`}
                  variant="primary"
                  icon={<Plus size={16} color={colors.accentFg} />}
                  onPress={newGoal}
                />
              }
            />
          ) : (
            <View style={{ gap: space.sm, opacity: q.isPlaceholderData ? 0.6 : 1 }}>
              <View style={[styles.list, { backgroundColor: colors.surface, borderColor: colors.line }]}>
                {goals.map((g, i) => (
                  <GoalRow key={g.id} goal={g} onToggle={toggle} last={i === goals.length - 1} />
                ))}
              </View>
              <AddCta label={`Add a ${LEVEL_META[level].label.toLowerCase()} goal`} onPress={newGoal} style={{ marginTop: space.xs }} />
            </View>
          )}
        </View>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: space.sm },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
});

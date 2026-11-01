import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarClock } from 'lucide-react-native';

import type { Goal } from '@/api/types';
import { Button, Card, Divider, Text, useToast } from '@/components/ui';
import { useCarryGoal, useUpdateGoal } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { LEVEL_META, nextPeriod, periodLabel, snapPeriod } from '@/lib/goals';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { openGoal } from './GoalCard';

/** Where "Carry over" lands: the next period, or the current one if that is later (same as the server). */
export function carryTarget(goal: Pick<Goal, 'level' | 'period_start'>, today: string) {
  const next = nextPeriod(goal.level, goal.period_start);
  const cur = snapPeriod(goal.level, today);
  return next > cur ? next : cur;
}

/** Goal actions for a finished period: carry over, mark missed, mark done anyway. */
export function useReviewActions() {
  const toast = useToast();
  const update = useUpdateGoal();
  const carry = useCarryGoal();
  const onError = (e: Error) => toast(e.message, { tone: 'danger' });
  return {
    busy: update.isPending || carry.isPending,
    carry: (g: Goal, today: string) =>
      carry.mutate(
        { id: g.id },
        {
          onSuccess: (n) => {
            haptic.success();
            toast(`Carried over to ${periodLabel(g.level, carryTarget(g, today))}`, {
              tone: 'success',
              action: { label: 'Open', onPress: () => openGoal(n.id) },
            });
          },
          onError,
        },
      ),
    missed: (g: Goal) =>
      update.mutate({ id: g.id, patch: { status: 'missed' } }, { onSuccess: () => toast('Marked as missed'), onError }),
    done: (g: Goal) => {
      haptic.success();
      update.mutate(
        { id: g.id, patch: { status: 'completed' } },
        { onSuccess: () => toast('Goal completed', { tone: 'success' }), onError },
      );
    },
  };
}

/** "Needs review": goals whose period is over but are still active. */
export function ReviewCard({ goals, today }: { goals: Goal[]; today: string }) {
  const { colors } = useTheme();
  const actions = useReviewActions();
  if (!goals.length) return null;
  return (
    <Card style={{ borderColor: colors.warningSoft }}>
      <View style={[styles.header, { backgroundColor: colors.warningSoft }]}>
        <CalendarClock size={16} color={colors.warning} />
        <Text variant="small" weight="semibold" color={colors.warning} style={{ flex: 1 }}>
          {goals.length === 1 ? '1 goal needs review' : `${goals.length} goals need review`}
        </Text>
      </View>
      {goals.map((g, i) => (
        <View key={g.id}>
          {i > 0 ? <Divider /> : null}
          <View style={styles.item}>
            <Pressable onPress={() => openGoal(g.id)} accessibilityRole="button" style={styles.itemTop}>
              <View style={[styles.dot, { backgroundColor: g.color }]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text weight="semibold" numberOfLines={2}>
                  {g.title}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {`${LEVEL_META[g.level].label} · ${g.period_label} · ${g.progress_label}`}
                </Text>
              </View>
            </Pressable>
            <View style={styles.buttons}>
              <Button
                title="Carry over"
                size="sm"
                variant="primary"
                disabled={actions.busy}
                onPress={() => actions.carry(g, today)}
              />
              <Button title="Mark missed" size="sm" disabled={actions.busy} onPress={() => actions.missed(g)} />
              <Button title="Mark done anyway" size="sm" variant="ghost" disabled={actions.busy} onPress={() => actions.done(g)} />
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm + 2 },
  item: { padding: space.lg, gap: space.md },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginLeft: 22 },
});

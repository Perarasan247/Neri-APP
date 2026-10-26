import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Flame, ListChecks } from 'lucide-react-native';

import { Card, ProgressRing, Text } from '@/components/ui';
import { pluralize } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface SummaryCardProps {
  isToday: boolean;
  isRestDay: boolean;
  completionRate: number;
  done: number;
  due: number;
  overallStreak: number;
  tasksDone: number;
  tasksTotal: number;
  tasksOverdue: number;
}

/** Compact day summary: completion ring, habits done, overall streak and tasks. */
export function SummaryCard({
  isToday,
  isRestDay,
  completionRate,
  done,
  due,
  overallStreak,
  tasksDone,
  tasksTotal,
  tasksOverdue,
}: SummaryCardProps) {
  const { colors } = useTheme();
  const rate = Math.round(completionRate);
  const complete = due > 0 && done >= due;
  const ringColor = isRestDay ? colors.warning : complete ? colors.success : colors.accent;

  return (
    <Card padded style={styles.card}>
      <ProgressRing value={due ? rate / 100 : 0} size={64} stroke={6} color={ringColor}>
        <Text variant="small" weight="bold" tabular>
          {isRestDay ? 'Rest' : `${rate}%`}
        </Text>
      </ProgressRing>

      <View style={styles.body}>
        <Text variant="bodyLarge" weight="semibold" numberOfLines={1}>
          {isRestDay
            ? 'Rest day'
            : due > 0
              ? `${done} of ${pluralize(due, 'habit')} done`
              : `Nothing due ${isToday ? 'today' : 'this day'}`}
        </Text>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Flame size={14} color={overallStreak > 0 ? colors.p2 : colors.fgSubtle} />
            <Text variant="small" tone="muted" tabular>
              {`${pluralize(overallStreak, 'day')} streak`}
            </Text>
          </View>
          <View style={styles.metaItem}>
            <ListChecks size={14} color={colors.fgSubtle} />
            <Text variant="small" tone="muted" tabular>
              {`${tasksDone}/${tasksTotal} tasks`}
            </Text>
            {tasksOverdue > 0 ? (
              <Text variant="small" tone="danger" weight="medium">
                {` · ${tasksOverdue} overdue`}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  body: { flex: 1, minWidth: 0, gap: space.xs },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.md, rowGap: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

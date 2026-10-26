import React from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Coffee } from 'lucide-react-native';

import { Badge, EmptyState, Sheet, Text } from '@/components/ui';
import { parseISODate, pluralize } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export interface RestDayDetail {
  date: string;
  scope: 'whole_day' | 'habit';
  habit_name?: string;
  habit_color?: string;
  reason: string;
}

/** Bottom sheet listing rest days / skips in the selected period. */
export function RestDaysSheet({
  visible,
  onClose,
  restDays,
  total,
}: {
  visible: boolean;
  onClose: () => void;
  restDays: RestDayDetail[];
  total: number;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title="Rest days">
      <Text variant="small" tone="muted" style={styles.intro}>
        {`${pluralize(total, 'rest day')} in this period. None of them counted against your rate or broke a streak.`}
      </Text>
      {restDays.length === 0 ? (
        <EmptyState
          icon={<Coffee size={24} color={colors.fgSubtle} />}
          title="No rest days"
          description="You haven't taken any rest days in this period."
          style={{ paddingVertical: space.xxl }}
        />
      ) : (
        <FlatList
          data={restDays}
          keyExtractor={(r, i) => `${r.date}-${i}`}
          style={{ flexGrow: 0 }}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: space.lg }} />}
          renderItem={({ item: r }) => (
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body" weight="medium" tabular>
                  {parseISODate(r.date).toLocaleDateString('en-GB', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
                <Text variant="small" tone="muted" numberOfLines={2}>
                  {r.reason || 'Rest day'}
                </Text>
              </View>
              {r.scope === 'whole_day' ? (
                <Badge label="Whole day" tone="warning" />
              ) : (
                <View style={styles.habit}>
                  <View style={[styles.dot, { backgroundColor: r.habit_color || colors.accent }]} />
                  <Text variant="caption" tone="soft" numberOfLines={1}>
                    {r.habit_name || 'Habit'}
                  </Text>
                </View>
              )}
            </View>
          )}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.lg, marginBottom: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  habit: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 140 },
  dot: { width: 8, height: 8, borderRadius: 2 },
});

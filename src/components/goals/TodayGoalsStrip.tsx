import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { CalendarClock, ChevronRight } from 'lucide-react-native';

import { SectionHeader, Text } from '@/components/ui';
import { useCurrentGoals } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { GoalTile } from './GoalCard';

/**
 * Today: this week's goals as a horizontal strip with mini progress, plus a pill when finished
 * periods still have goals to review. Renders nothing when there is neither.
 */
export function TodayGoalsStrip() {
  const { colors } = useTheme();
  const q = useCurrentGoals();
  const weekly = (q.data?.weekly ?? []).filter((g) => g.status !== 'dropped');
  const review = q.data?.needs_review.length ?? 0;
  if (!weekly.length && !review) return null;

  const done = weekly.filter((g) => g.status === 'completed').length;
  const openGoals = () => router.push('/goals');

  return (
    <View style={{ gap: space.sm }}>
      {weekly.length ? (
        <>
          <SectionHeader
            title="This week’s goals"
            count={`${done}/${weekly.length}`}
            action={{ label: 'All goals', onPress: openGoals }}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.scroll}
            contentContainerStyle={styles.strip}
          >
            {weekly.map((g) => (
              <GoalTile key={g.id} goal={g} />
            ))}
          </ScrollView>
        </>
      ) : null}
      {review ? (
        <Pressable
          onPress={() => {
            haptic.tap();
            openGoals();
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.pill, { backgroundColor: pressed ? colors.warningSoft : colors.surface, borderColor: colors.line }]}
        >
          <CalendarClock size={14} color={colors.warning} />
          <Text variant="caption" weight="semibold" color={colors.warning}>
            {review === 1 ? '1 goal needs review' : `${review} goals need review`}
          </Text>
          <ChevronRight size={14} color={colors.fgSubtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { marginHorizontal: -space.lg },
  strip: { paddingHorizontal: space.lg, gap: space.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    alignSelf: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

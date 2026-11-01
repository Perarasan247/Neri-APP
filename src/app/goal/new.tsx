import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { GoalForm } from '@/components/goals/GoalForm';
import { ListSkeleton } from '@/components/ui';
import type { GoalLevel } from '@/api/types';
import { useGoal } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isLevel = (v?: string): v is GoalLevel => v === 'weekly' || v === 'monthly' || v === 'yearly';

/** New goal (modal). Params: level, period (any date in it), parent (goal id, e.g. "Add sub-goal"). */
export default function NewGoalScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ level?: string; period?: string; parent?: string }>();
  const parent = useGoal(params.parent);

  // Wait for the parent so the form starts with it selected
  if (params.parent && parent.isPending) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg }}>
        <ListSkeleton rows={4} />
      </View>
    );
  }

  return (
    <GoalForm
      defaults={{
        level: isLevel(params.level) ? params.level : undefined,
        period: params.period && ISO_DATE.test(params.period) ? params.period : undefined,
        parent: parent.data ?? null,
      }}
    />
  );
}

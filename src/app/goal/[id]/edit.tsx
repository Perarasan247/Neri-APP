import React from 'react';
import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { FormHeader } from '@/components/habits/FormHeader';
import { GoalForm } from '@/components/goals/GoalForm';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui';
import { useGoal } from '@/hooks/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Edit a goal (modal). */
export default function EditGoalScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGoal(id);

  if (q.data) return <GoalForm key={q.data.id} goal={q.data} />;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FormHeader title="Edit goal" cancelLabel="Close" onCancel={() => router.back()} />
      <View style={{ flex: 1, backgroundColor: colors.canvas, padding: space.lg }}>
        {q.isPending ? (
          <ListSkeleton rows={4} />
        ) : q.error ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : (
          <EmptyState title="Goal not found" description="It may have been deleted." />
        )}
      </View>
    </>
  );
}

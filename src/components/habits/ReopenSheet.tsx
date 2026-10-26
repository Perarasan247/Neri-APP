import React, { useState } from 'react';
import { View } from 'react-native';
import { Info } from 'lucide-react-native';

import type { Habit } from '@/api/types';
import { Button, Field, Notice, Sheet, useToast } from '@/components/ui';
import { useReopenHabit } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { longDate, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { DateField } from './DateField';

/** "Reopen habit" sheet with a restart date (web ReopenHabitModal). */
export function ReopenSheet({ habit, onClose }: { habit: Habit | null; onClose: () => void }) {
  return (
    <Sheet visible={Boolean(habit)} onClose={onClose} title={habit ? `Reopen “${habit.name}”` : undefined}>
      {habit ? <ReopenForm key={habit.id} habit={habit} onClose={onClose} /> : null}
    </Sheet>
  );
}

function ReopenForm({ habit, onClose }: { habit: Habit; onClose: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const reopen = useReopenHabit();
  const todayStr = today();
  const lastEnd = habit.periods
    .map((p) => p.end_date)
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  const min = lastEnd && lastEnd <= todayStr ? lastEnd : undefined;
  const [date, setDate] = useState(todayStr);

  const submit = () =>
    reopen.mutate(
      { id: habit.id, date },
      {
        onSuccess: () => {
          haptic.success();
          toast(`“${habit.name}” is back from ${longDate(date)}`, { tone: 'success' });
          onClose();
        },
        onError: (e) => toast(e.message, { tone: 'danger' }),
      },
    );

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
      <Notice icon={<Info size={16} color={colors.info} />}>
        The time it was archived won’t count against you. Tracking restarts from the date below.
      </Notice>
      <Field label="Restart on" hint="Can’t be in the future.">
        <DateField value={date} onChange={setDate} min={min} max={todayStr} title="Restart on" />
      </Field>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Cancel" onPress={onClose} style={{ flex: 1 }} disabled={reopen.isPending} />
        <Button title="Reopen habit" variant="primary" onPress={submit} loading={reopen.isPending} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

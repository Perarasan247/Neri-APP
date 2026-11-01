import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import type { Habit, MonthlyCell } from '@/api/types';
import { Button, Field, HabitTile, Notice, Segmented, Sheet, Text, TextField, useToast } from '@/components/ui';
import { useUpsertLog } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { longDate } from '@/lib/format';
import { space } from '@/theme/tokens';
import { Stepper } from './Stepper';

export interface CellSelection {
  habit: Habit;
  cell: MonthlyCell;
}

type Mode = 'done' | 'not_done' | 'log' | 'skipped';

/**
 * Edit one day of one habit from the monthly grid (web CellModal):
 * done / not done or a count, skip with a reason, and a note.
 */
export function CellSheet({ selection, onClose }: { selection: CellSelection | null; onClose: () => void }) {
  return (
    <Sheet visible={Boolean(selection)} onClose={onClose} keyboard scroll={false}>
      {selection ? (
        <CellForm key={`${selection.habit.id}-${selection.cell.date}`} {...selection} onClose={onClose} />
      ) : null}
    </Sheet>
  );
}

function CellForm({ habit, cell, onClose }: CellSelection & { onClose: () => void }) {
  const toast = useToast();
  const upsert = useUpsertLog();
  const isYesNo = habit.type === 'build_yesno';
  const isAvoid = habit.type === 'avoid_count';
  const target = habit.current_schedule?.daily_target || 1;

  const initialMode: Mode =
    cell.state === 'skipped' ? 'skipped' : isYesNo ? (cell.state === 'done' ? 'done' : 'not_done') : 'log';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [count, setCount] = useState<number>(cell.count || (isAvoid ? 0 : habit.type === 'build_count' ? target : 1));
  const [note, setNote] = useState(cell.note ?? '');

  const skipped = mode === 'skipped';

  const save = () => {
    const status = skipped ? 'skipped' : 'done';
    const value = skipped ? cell.count || 0 : isYesNo ? (mode === 'done' ? 1 : 0) : count;
    upsert.mutate(
      { habit_id: habit.id, log_date: cell.date, count: value, status, note: note.trim() },
      {
        onSuccess: () => {
          if (status === 'done' && value > 0 && !isAvoid) haptic.success();
          onClose();
        },
        onError: (e) => toast(e.message, { tone: 'danger' }),
      },
    );
  };

  const modeOptions: { value: Mode; label: string }[] = isYesNo
    ? [
        { value: 'done', label: 'Done' },
        { value: 'not_done', label: 'Not done' },
        { value: 'skipped', label: 'Skip' },
      ]
    : [
        { value: 'log', label: isAvoid ? 'Log slips' : 'Log count' },
        { value: 'skipped', label: 'Skip' },
      ];

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <HabitTile icon={habit.icon} color={habit.color} size={36} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title" numberOfLines={1}>
            {habit.name}
          </Text>
          <Text variant="small" tone="muted">
            {longDate(cell.date)}
          </Text>
        </View>
      </View>

      {cell.state === 'not_scheduled' ? (
        <Notice>Not scheduled on this day. You can log it anyway, but it won’t count toward your totals.</Notice>
      ) : null}

      <Segmented value={mode} onChange={setMode} options={modeOptions} />

      {mode === 'log' ? (
        <Field
          label={isAvoid ? 'Slips' : 'Count'}
          hint={isAvoid ? '0 means a clean day.' : `Daily goal: ${target}`}
        >
          <Stepper
            label={isAvoid ? 'Slips' : 'Count'}
            value={count}
            onChange={setCount}
            min={0}
            decimal
            suffix={isAvoid ? undefined : `of ${target}`}
          />
        </Field>
      ) : null}

      {mode === 'not_done' && cell.note ? (
        <Text variant="caption" tone="subtle">
          Clearing a day also removes its note.
        </Text>
      ) : null}

      <Field
        label={skipped ? 'Reason' : 'Note'}
        hint={skipped ? 'Skipped days don’t count against you.' : 'Optional'}
      >
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={skipped ? 'Sick, travelling, rest…' : 'Add some context…'}
          accessibilityLabel={skipped ? 'Skip reason' : 'Note'}
          returnKeyType="done"
          onSubmitEditing={save}
        />
      </Field>

      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button title="Cancel" onPress={onClose} style={{ flex: 1 }} disabled={upsert.isPending} />
        <Button title="Save" variant="primary" onPress={save} loading={upsert.isPending} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

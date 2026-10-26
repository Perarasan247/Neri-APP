import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Info } from 'lucide-react-native';

import { Button, Chip, Field, Notice, Sheet, TextField } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const PRESET_REASONS = ['Rest day', 'Travel', 'Sick', 'Holiday', 'Family'];

interface SkipSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Whole-day rest day or a single habit skip. */
  scope: 'day' | 'habit';
  habitName?: string;
  date: string;
  /** Pre-fill when changing an existing skip reason. */
  initialReason?: string | null;
  loading?: boolean;
  onConfirm: (reason: string) => void;
}

/**
 * Optional-reason prompt for a rest day or a per-habit skip (mirrors the web
 * SkipModal). An empty reason is recorded as "Rest Day", like the web app.
 */
export function SkipSheet({ visible, onClose, scope, habitName, date, initialReason, loading, onConfirm }: SkipSheetProps) {
  const { colors } = useTheme();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason(initialReason ?? '');
  }, [visible, initialReason]);

  const title = scope === 'day' ? 'Take a rest day' : `Skip ${habitName ?? 'habit'}`;

  return (
    <Sheet visible={visible} onClose={onClose} title={title} keyboard scroll={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Notice tone="info" icon={<Info size={16} color={colors.info} />}>
          {`${shortDate(date)} · ${
            scope === 'day'
              ? 'All habits are excused for this day. It won’t lower your completion rate or break any streak.'
              : 'This habit is excused for this day. It won’t lower your completion rate or break its streak.'
          }`}
        </Notice>

        <Field label="Reason" hint="Optional — helps you spot patterns later.">
          <TextField
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Flight, mild fever, festival"
            returnKeyType="done"
            onSubmitEditing={() => onConfirm(reason.trim() || 'Rest Day')}
          />
        </Field>

        <View style={styles.chips}>
          {PRESET_REASONS.map((p) => (
            <Chip key={p} label={p} selected={reason === p} onPress={() => setReason(p)} />
          ))}
        </View>

        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={loading} style={{ flex: 1 }} />
          <Button
            title={scope === 'day' ? 'Take rest day' : 'Skip'}
            variant="primary"
            loading={loading}
            onPress={() => onConfirm(reason.trim() || 'Rest Day')}
            style={{ flex: 1 }}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
});

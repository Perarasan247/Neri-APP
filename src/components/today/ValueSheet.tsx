import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field, Sheet, TextField } from '@/components/ui';
import { space } from '@/theme/tokens';

interface ValueSheetProps {
  visible: boolean;
  onClose: () => void;
  habitName?: string;
  label?: string | null;
  unit?: string | null;
  /** Already logged for the viewed day. */
  total?: number | null;
  loading?: boolean;
  onSave: (value: number) => void;
}

/** Add an amount (e.g. pages read) to a habit's log for the viewed day. Entries add up. */
export function ValueSheet({ visible, onClose, habitName, label, unit, total, loading, onSave }: ValueSheetProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setText('');
      setError(null);
    }
  }, [visible]);

  const submit = () => {
    const n = Number(text.replace(',', '.'));
    if (!(n > 0)) {
      setError('Enter a number above 0.');
      return;
    }
    onSave(n);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={habitName ? `${label ?? 'Log'} · ${habitName}` : (label ?? 'Log')} keyboard>
      <View style={styles.body}>
        <Field
          error={error}
          hint={total ? `Already logged ${total}${unit ? ` ${unit}` : ''} — this adds to it.` : undefined}
        >
          <TextField
            value={text}
            onChangeText={setText}
            placeholder={unit ? `Amount (${unit})` : 'Amount'}
            keyboardType="decimal-pad"
            autoFocus
            invalid={Boolean(error)}
            accessibilityLabel={label ?? 'Amount'}
            onSubmitEditing={submit}
          />
        </Field>
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={loading} style={{ flex: 1 }} />
          <Button title="Add" variant="primary" loading={loading} onPress={submit} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.lg },
  actions: { flexDirection: 'row', gap: space.sm },
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field, Sheet, TextField } from '@/components/ui';
import { space } from '@/theme/tokens';

interface SlipSheetProps {
  visible: boolean;
  onClose: () => void;
  habitName?: string;
  /** Slips already logged for the viewed day. */
  count?: number;
  loading?: boolean;
  onSave: (count: number) => void;
}

const MAX_SLIPS = 999;

/** Set how many times a cut-back habit slipped on the viewed day (0 = a clean day). */
export function SlipSheet({ visible, onClose, habitName, count = 0, loading, onSave }: SlipSheetProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Start from the day's current count each time the sheet opens
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setText(String(count));
      setError(null);
    }
  }

  const submit = () => {
    const n = text.trim() === '' ? 0 : Number(text);
    if (!Number.isInteger(n) || n < 0 || n > MAX_SLIPS) {
      setError(`Enter a whole number from 0 to ${MAX_SLIPS}.`);
      return;
    }
    onSave(n);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={habitName ? `Slips · ${habitName}` : 'Slips'} keyboard>
      <View style={styles.body}>
        <Field error={error} hint="How many times did you slip? 0 means a clean day.">
          <TextField
            value={text}
            onChangeText={(t) => {
              setText(t.replace(/\D/g, '').slice(0, 3));
              setError(null);
            }}
            placeholder="Number of slips"
            keyboardType="number-pad"
            selectTextOnFocus
            autoFocus
            invalid={Boolean(error)}
            accessibilityLabel="Number of slips"
            onSubmitEditing={submit}
          />
        </Field>
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={loading} style={{ flex: 1 }} />
          <Button title="Save" variant="primary" loading={loading} onPress={submit} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.lg },
  actions: { flexDirection: 'row', gap: space.sm },
});

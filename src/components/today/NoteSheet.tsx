import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Sheet, TextField } from '@/components/ui';
import { space } from '@/theme/tokens';

interface NoteSheetProps {
  visible: boolean;
  onClose: () => void;
  habitName?: string;
  initialNote?: string | null;
  loading?: boolean;
  onSave: (note: string) => void;
}

/** Add / edit the note on a habit's log for the viewed day. */
export function NoteSheet({ visible, onClose, habitName, initialNote, loading, onSave }: NoteSheetProps) {
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) setNote(initialNote ?? '');
  }, [visible, initialNote]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={habitName ? `Note · ${habitName}` : initialNote ? 'Edit note' : 'Add note'}
      keyboard
    >
      <View style={styles.body}>
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder="How did it go?"
          multiline
          autoFocus
          maxLength={500}
        />
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={loading} style={{ flex: 1 }} />
          <Button title="Save" variant="primary" loading={loading} onPress={() => onSave(note.trim())} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.lg },
  actions: { flexDirection: 'row', gap: space.sm },
});

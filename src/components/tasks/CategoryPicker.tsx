import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Hash, Plus } from 'lucide-react-native';

import { ActionSheet, Button, Sheet, TextField, type MenuOption } from '@/components/ui';
import { afterSheet } from './taskOptions';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

interface CategoryPickerProps {
  visible: boolean;
  onClose: () => void;
  categories: string[];
  value?: string;
  onSelect: (category: string) => void;
}

/** Category ActionSheet with existing categories plus "New…" (free text). */
export function CategoryPicker({ visible, onClose, categories, value, onSelect }: CategoryPickerProps) {
  const { colors } = useTheme();
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  const options: MenuOption[] = [
    ...categories.map((c) => ({
      label: c,
      icon: <Hash size={16} color={colors.fgMuted} />,
      selected: c === value,
      onPress: () => onSelect(c),
    })),
    {
      label: 'New category…',
      icon: <Plus size={16} color={colors.accent} />,
      onPress: () => {
        setDraft('');
        afterSheet(() => setCreating(true));
      },
    },
  ];

  const name = draft.trim();
  const submit = () => {
    if (!name) return;
    setCreating(false);
    onSelect(name.charAt(0).toUpperCase() + name.slice(1));
  };

  return (
    <>
      <ActionSheet visible={visible} onClose={onClose} title="Category" options={options} />
      <Sheet visible={creating} onClose={() => setCreating(false)} title="New category" keyboard>
        <View style={styles.form}>
          <TextField
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. Side project"
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={submit}
            maxLength={40}
          />
          <Button title="Add category" variant="primary" disabled={!name} onPress={submit} block />
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  form: { paddingHorizontal: space.lg, gap: space.md },
});

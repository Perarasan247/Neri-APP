import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { CalendarDays, ChevronRight } from 'lucide-react-native';

import { DatePickerSheet, Text, TextField } from '@/components/ui';
import { friendlyDate, longDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface DateFieldProps {
  /** "YYYY-MM-DD" */
  value: string;
  onChange: (date: string) => void;
  /** Inclusive bounds, "YYYY-MM-DD". */
  min?: string;
  max?: string;
  /** Title of the picker sheet. */
  title?: string;
  accessibilityLabel?: string;
  invalid?: boolean;
}

const clamp = (d: string, min?: string, max?: string) => (min && d < min ? min : max && d > max ? max : d);

/**
 * Tappable date row that opens the app-themed calendar sheet; web falls back
 * to a plain YYYY-MM-DD input.
 */
export function DateField({ value, onChange, min, max, title = 'Pick a date', accessibilityLabel, invalid }: DateFieldProps) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  if (Platform.OS === 'web') {
    return (
      <TextField
        value={draft}
        onChangeText={(t) => {
          setDraft(t);
          if (/^\d{4}-\d{2}-\d{2}$/.test(t)) onChange(clamp(t, min, max));
        }}
        placeholder="YYYY-MM-DD"
        accessibilityLabel={accessibilityLabel}
        invalid={invalid}
      />
    );
  }

  const openPicker = () => {
    haptic.tap();
    setOpen(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel ?? title}: ${longDate(value)}`}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          {
            backgroundColor: pressed ? colors.muted : colors.surface,
            borderColor: invalid ? colors.danger : colors.lineStrong,
          },
        ]}
      >
        <CalendarDays size={18} color={colors.fgMuted} />
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {longDate(value)}
        </Text>
        <Text variant="small" tone="subtle">
          {friendlyDate(value)}
        </Text>
        <ChevronRight size={16} color={colors.fgSubtle} />
      </Pressable>

      <DatePickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        value={value}
        minDate={min}
        maxDate={max}
        title={title}
        onSelect={(d) => onChange(clamp(d, min, max))}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
  },
});

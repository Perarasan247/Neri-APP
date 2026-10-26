import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { CalendarDays, ChevronDown } from 'lucide-react-native';

import { DatePickerSheet, Text } from '@/components/ui';
import { parseISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** "Thursday, 22 October 2026" */
const fullDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Field-style date picker for "YYYY-MM-DD" values.
 * Opens the app-themed calendar sheet.
 */
export function DateField({
  value,
  onChange,
  max,
  min,
  label = 'Date',
}: {
  value: string;
  onChange: (iso: string) => void;
  max?: string;
  min?: string;
  label?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const clamp = (iso: string) => (max && iso > max ? max : min && iso < min ? min : iso);

  const openPicker = () => {
    haptic.tap();
    setOpen(true);
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${fullDate(value)}`}
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.muted : colors.surface },
        ]}
      >
        <CalendarDays size={18} color={colors.fgMuted} />
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {fullDate(value)}
        </Text>
        <ChevronDown size={18} color={colors.fgSubtle} />
      </Pressable>

      <DatePickerSheet
        visible={open}
        onClose={() => setOpen(false)}
        value={value}
        minDate={min}
        maxDate={max}
        title={label}
        onSelect={(d) => onChange(clamp(d))}
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
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
});

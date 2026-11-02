import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CalendarX2, Plus } from 'lucide-react-native';

import { DateField } from '@/components/habits/DateField';
import { DatePickerSheet, Text, useDisclosure } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/**
 * Optional last day of a habit. Empty means it keeps going until it's deleted.
 * `min` is the earliest allowed day (today, or the start date if later).
 */
export function EndDateField({
  value,
  onChange,
  min,
  invalid,
}: {
  /** "YYYY-MM-DD", or empty for no end date. */
  value: string;
  onChange: (date: string) => void;
  min: string;
  invalid?: boolean;
}) {
  const { colors } = useTheme();
  const picker = useDisclosure();

  if (value) {
    return (
      <View style={{ gap: space.sm }}>
        <DateField value={value} onChange={onChange} min={min} title="End date" accessibilityLabel="End date" invalid={invalid} />
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            haptic.tap();
            onChange('');
          }}
          style={styles.remove}
        >
          <CalendarX2 size={15} color={colors.accentText} />
          <Text variant="small" weight="semibold" tone="accent">
            Remove end date
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="No end date. Add an end date"
        onPress={() => {
          haptic.tap();
          picker.show();
        }}
        style={({ pressed }) => [
          styles.empty,
          { backgroundColor: pressed ? colors.muted : colors.surface, borderColor: colors.lineStrong },
        ]}
      >
        <Plus size={18} color={colors.fgMuted} />
        <Text style={{ flex: 1 }} tone="muted">
          No end date
        </Text>
        <Text variant="small" tone="subtle">
          Runs until deleted
        </Text>
      </Pressable>
      <DatePickerSheet
        visible={picker.open}
        onClose={picker.hide}
        value={min}
        minDate={min}
        title="End date"
        onSelect={onChange}
      />
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    borderStyle: 'dashed',
  },
  remove: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start' },
});

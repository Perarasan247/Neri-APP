import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';

import { requestReveal, Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Allow typing fractional values (e.g. 0.5 glasses). */
  decimal?: boolean;
  /** Accessible name, e.g. "Daily goal". */
  label: string;
  /** Small unit text after the number, e.g. "× a week". */
  suffix?: string;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** − [ value ] + number input; the value can also be typed. */
export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, decimal, label, suffix }: StepperProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(String(value));

  const clamp = (n: number) => Math.min(max, Math.max(min, round(n)));
  const bump = (d: number) => {
    const next = clamp(value + d);
    if (next !== value) {
      haptic.tap();
      onChange(next);
    }
  };
  const commit = () => {
    const parsed = decimal ? parseFloat(text.replace(',', '.')) : parseInt(text, 10);
    onChange(Number.isFinite(parsed) ? clamp(parsed) : value);
    setFocused(false);
  };

  const btn = (dir: -1 | 1) => {
    const disabled = dir < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${dir < 0 ? 'Decrease' : 'Increase'} ${label}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={4}
        onPress={() => bump(dir * step)}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: pressed ? colors.mutedStrong : colors.muted, opacity: disabled ? 0.4 : 1 },
        ]}
      >
        {dir < 0 ? <Minus size={18} color={colors.fgSoft} /> : <Plus size={18} color={colors.fgSoft} />}
      </Pressable>
    );
  };

  return (
    <View style={styles.row} accessibilityLabel={label}>
      {btn(-1)}
      <TextInput
        value={focused ? text : String(value)}
        onFocus={() => {
          setText(String(value));
          setFocused(true);
          requestReveal();
        }}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        selectTextOnFocus
        accessibilityLabel={label}
        selectionColor={colors.accent}
        style={[
          font.bodyLarge,
          styles.input,
          { color: colors.fg, borderColor: colors.lineStrong, backgroundColor: colors.surface },
        ]}
      />
      {btn(1)}
      {suffix ? (
        <Text variant="small" tone="muted" style={{ marginLeft: space.xs }}>
          {suffix}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btn: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  input: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: 'center',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});

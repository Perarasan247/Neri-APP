import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Plus } from 'lucide-react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { withAlpha } from './HabitIcon';
import { Text } from './Text';

/** Full-width dashed "add" call-to-action in the accent colour (mirrors the web Inbox CTA). */
export function AddCta({
  label,
  hint,
  onPress,
  style,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.root,
        {
          borderColor: withAlpha(colors.accent, pressed ? 0.8 : 0.5),
          backgroundColor: pressed ? withAlpha(colors.accent, 0.16) : colors.accentSoft,
        },
        style,
      ]}
    >
      <View style={[styles.badge, { backgroundColor: colors.accent }]}>
        <Plus size={14} color={colors.accentFg} strokeWidth={3} />
      </View>
      <Text variant="body" weight="bold" tone="accent">
        {label}
      </Text>
      {hint ? (
        <Text variant="small" tone="muted" numberOfLines={1} style={styles.hint}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 52,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hint: { flex: 1, textAlign: 'right' },
});

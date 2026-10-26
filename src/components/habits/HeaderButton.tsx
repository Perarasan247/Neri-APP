import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/**
 * Text button for form headers ("Cancel", "Save"). 44dp tall, centred, with the same horizontal
 * padding on both sides; the primary one is accent and semibold, dimmed when disabled.
 */
export function HeaderButton({
  title,
  onPress,
  primary,
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      hitSlop={{ left: 4, right: 4 }}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.button, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Text weight={primary ? 'semibold' : 'regular'} color={primary ? colors.accentText : colors.fgSoft}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
});

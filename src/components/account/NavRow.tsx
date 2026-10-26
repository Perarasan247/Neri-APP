import React from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { Card, Divider, SectionHeader, Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface NavRowProps {
  /** A lucide icon element; rendered inside a tinted tile. */
  icon?: React.ReactNode;
  label: string;
  /** Optional trailing count (e.g. open tasks). Hidden while undefined. */
  count?: number;
  /** Secondary text on the right instead of / before the chevron. */
  value?: string;
  onPress?: () => void;
  /** Hide the chevron (e.g. for action rows). */
  chevron?: boolean;
  tone?: 'fg' | 'danger' | 'accent';
}

const ICON_TILE = 30;

/** Settings-style navigation row: icon, label, count/value, chevron. */
export function NavRow({ icon, label, count, value, onPress, chevron = true, tone = 'fg' }: NavRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count !== undefined ? `${label}, ${count}` : label}
      disabled={!onPress}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
    >
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: tone === 'danger' ? colors.dangerSoft : colors.accentSoft }]}>
          {icon}
        </View>
      ) : null}
      <Text style={{ flex: 1 }} numberOfLines={1} tone={tone}>
        {label}
      </Text>
      {value ? (
        <Text variant="small" tone="muted" numberOfLines={1} style={{ maxWidth: '50%' }}>
          {value}
        </Text>
      ) : null}
      {count !== undefined && count > 0 ? (
        <Text variant="small" tone="subtle" tabular>
          {count}
        </Text>
      ) : null}
      {chevron && onPress ? <ChevronRight size={18} color={colors.fgSubtle} /> : null}
    </Pressable>
  );
}

/** Titled card holding NavRows separated by inset hairlines. */
export function NavGroup({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginBottom: space.xl }, style]}>
      {title ? <SectionHeader title={title} tone="muted" /> : null}
      <Card>
        {rows.map((row, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <Divider inset={space.lg + ICON_TILE + space.md} /> : null}
            {row}
          </React.Fragment>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 52,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  iconTile: {
    width: ICON_TILE,
    height: ICON_TILE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { ProgressBar, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export interface BarListItem {
  key: string;
  label: string;
  /** 0–100 */
  value: number;
  color?: string;
  /** Left of the label: rank number, swatch, tile… */
  leading?: React.ReactNode;
  /** Secondary text under the label, e.g. "12/20 days". */
  caption?: string;
  /** Right-aligned value text (defaults to "value%"). */
  valueLabel?: string;
  onPress?: () => void;
}

/** Horizontal ranking / breakdown rows: label, value and a progress bar. */
export function BarList({ items }: { items: BarListItem[] }) {
  const { colors } = useTheme();
  return (
    <View>
      {items.map((it, i) => {
        const body = (
          <>
            {it.leading}
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={styles.top}>
                <Text variant="small" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                  {it.label}
                </Text>
                {it.caption ? (
                  <Text variant="caption" tone="subtle" tabular>
                    {it.caption}
                  </Text>
                ) : null}
                <Text variant="small" weight="semibold" tabular style={{ minWidth: 44, textAlign: 'right' }}>
                  {it.valueLabel ?? `${it.value}%`}
                </Text>
              </View>
              <ProgressBar value={it.value} color={it.color} />
            </View>
            {it.onPress ? <ChevronRight size={16} color={colors.fgSubtle} /> : null}
          </>
        );
        const style = [styles.row, i < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }];
        return it.onPress ? (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={`${it.label}, ${it.valueLabel ?? `${it.value}%`}`}
            onPress={it.onPress}
            style={({ pressed }) => [...style, pressed && { backgroundColor: colors.subtle }]}
          >
            {body}
          </Pressable>
        ) : (
          <View key={it.key} style={style}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

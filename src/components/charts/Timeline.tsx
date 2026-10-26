import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { parseISODate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export interface TimelinePeriod {
  start: string;
  end: string;
  is_active: boolean;
}

export interface TimelineRow {
  id: string;
  name: string;
  color: string;
  status?: string;
  periods: TimelinePeriod[];
}

const fmt = (s: string, withYear = false) =>
  parseISODate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/**
 * Gantt-like lifespan bars: one row per habit, each active period drawn inside
 * the filter range. Ended periods are faded. Tap a row to list its periods.
 */
export function Timeline({
  rows,
  range,
  onPressRow,
}: {
  rows: TimelineRow[];
  range: { start: string; end: string };
  onPressRow?: (row: TimelineRow) => void;
}) {
  const { colors } = useTheme();
  const [openId, setOpenId] = useState<string | null>(null);
  const startMs = parseISODate(range.start).getTime();
  const endMs = parseISODate(range.end).getTime();
  const total = Math.max(1, endMs - startMs);

  const position = (p: TimelinePeriod) => {
    const s = Math.max(startMs, parseISODate(p.start).getTime());
    const e = Math.min(endMs, parseISODate(p.end).getTime());
    if (e < startMs || s > endMs) return null;
    return { left: ((s - startMs) / total) * 100, width: Math.max(2, ((e - s) / total) * 100) };
  };

  return (
    <View>
      {rows.map((row) => {
        const open = openId === row.id;
        return (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={`${row.name} timeline`}
            onPress={() => setOpenId(open ? null : row.id)}
            onLongPress={onPressRow ? () => onPressRow(row) : undefined}
            style={({ pressed }) => [styles.row, { borderBottomColor: colors.line }, pressed && { backgroundColor: colors.subtle }]}
          >
            <View style={styles.line}>
              <View style={styles.name}>
                <View style={[styles.dot, { backgroundColor: row.color }]} />
                <Text variant="small" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {row.name}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.mutedStrong }]}>
                {row.periods.map((p, i) => {
                  const pos = position(p);
                  if (!pos) return null;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.bar,
                        { left: `${pos.left}%`, width: `${pos.width}%`, backgroundColor: row.color, opacity: p.is_active ? 1 : 0.5 },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
            {open ? (
              <View style={styles.details}>
                {row.status === 'archived' ? (
                  <Text variant="caption" tone="subtle">
                    Archived
                  </Text>
                ) : null}
                {row.periods.length === 0 ? (
                  <Text variant="caption" tone="subtle">
                    No active periods
                  </Text>
                ) : (
                  row.periods.map((p, i) => (
                    <Text key={i} variant="caption" tone="muted" tabular>
                      {`${fmt(p.start, true)} → ${p.is_active ? 'ongoing' : fmt(p.end, true)}`}
                    </Text>
                  ))
                )}
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <View style={styles.axis}>
        <View style={styles.name} />
        <View style={styles.axisLabels}>
          <Text variant="caption" tone="subtle" tabular style={{ fontSize: 11 }}>
            {fmt(range.start, true)}
          </Text>
          <Text variant="caption" tone="subtle" tabular style={{ fontSize: 11 }}>
            {fmt(range.end, true)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  name: { width: '36%', flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 2 },
  track: { flex: 1, height: 16, borderRadius: radius.xs, overflow: 'hidden' },
  bar: { position: 'absolute', top: 2, bottom: 2, borderRadius: 3 },
  details: { marginTop: space.xs, marginLeft: 16, gap: 2 },
  axis: { flexDirection: 'row', gap: space.md, paddingTop: space.sm },
  axisLabels: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
});

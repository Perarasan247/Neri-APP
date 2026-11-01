import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

import { Text } from '@/components/ui';
import { parseISODate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { AXIS_FONT_SIZE, useChartWidth } from './shared';

export interface HeatmapDay {
  date: string;
  /** ISO weekday, 1 = Mon … 7 = Sun. */
  weekday: number;
}

interface HeatmapProps<T extends HeatmapDay> {
  days: T[];
  /** Fill for a day cell. */
  colorFor: (d: T) => string;
  /** One-line description shown after tapping a day. */
  describe: (d: T) => string;
  /** Legend swatches (low → high) and extra keys (e.g. Rest). */
  legend?: { low: string; high: string; steps: string[]; extra?: { label: string; color: string }[] };
}

const GAP = 3;
const DAY_LABEL_W = 26;
const MONTH_LABEL_H = 14;
const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];

/**
 * GitHub-style calendar: one column per week (Mon–Sun rows). Cells grow to fill
 * the width for short ranges; long ranges scroll horizontally and open on the
 * most recent week. Tap a cell for its details.
 */
export function Heatmap<T extends HeatmapDay>({ days, colorFor, describe, legend }: HeatmapProps<T>) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const [sel, setSel] = useState<T | null>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);

  // Group into week columns exactly like the web heatmap.
  const columns: (T | null)[][] = [];
  let week: (T | null)[] = Array(7).fill(null);
  days.forEach((day, idx) => {
    const row = Math.max(0, Math.min(6, day.weekday - 1));
    week[row] = day;
    if (row === 6 || idx === days.length - 1) {
      columns.push(week);
      week = Array(7).fill(null);
    }
  });

  const cols = columns.length;
  const avail = Math.max(0, width - DAY_LABEL_W);
  const cell = cols > 0 ? Math.max(11, Math.min(22, Math.floor((avail - GAP * (cols - 1)) / cols))) : 12;
  const gridW = DAY_LABEL_W + cols * cell + Math.max(0, cols - 1) * GAP;
  const gridH = MONTH_LABEL_H + 7 * cell + 6 * GAP;

  // Month label above the first column of each month.
  const monthLabels: { col: number; label: string }[] = [];
  let lastMonth = -1;
  columns.forEach((c, ci) => {
    const first = c.find(Boolean);
    if (!first) return;
    const m = parseISODate(first.date).getMonth();
    if (m !== lastMonth) {
      const prev = monthLabels[monthLabels.length - 1];
      if (!prev || ci - prev.col >= 3) {
        monthLabels.push({ col: ci, label: parseISODate(first.date).toLocaleDateString('en-GB', { month: 'short' }) });
      }
      lastMonth = m;
    }
  });

  const colX = (ci: number) => DAY_LABEL_W + ci * (cell + GAP);
  const rowY = (ri: number) => MONTH_LABEL_H + ri * (cell + GAP);

  const onPress = (x: number, y: number) => {
    const ci = Math.floor((x - DAY_LABEL_W) / (cell + GAP));
    const ri = Math.floor((y - MONTH_LABEL_H) / (cell + GAP));
    const day = columns[ci]?.[ri] ?? null;
    setSel((prev) => (day && prev?.date === day.date ? null : day));
  };

  return (
    <View onLayout={onLayout}>
      {width > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          <Pressable onPress={(e) => onPress(e.nativeEvent.locationX, e.nativeEvent.locationY)} accessibilityRole="adjustable" accessibilityLabel="Calendar heatmap. Tap a day to see details.">
            <Svg width={gridW} height={gridH}>
              {monthLabels.map((m) => (
                <SvgText key={m.col} x={colX(m.col)} y={10} fontSize={AXIS_FONT_SIZE} fill={colors.fgSubtle}>
                  {m.label}
                </SvgText>
              ))}
              {DAY_LABELS.map((l, ri) =>
                l ? (
                  <SvgText key={ri} x={0} y={rowY(ri) + cell / 2 + 3.5} fontSize={10} fill={colors.fgSubtle}>
                    {l}
                  </SvgText>
                ) : null,
              )}
              {columns.map((c, ci) =>
                c.map((day, ri) =>
                  day ? (
                    <Rect
                      key={day.date}
                      x={colX(ci)}
                      y={rowY(ri)}
                      width={cell}
                      height={cell}
                      rx={2.5}
                      fill={colorFor(day)}
                      stroke={sel?.date === day.date ? colors.fg : undefined}
                      strokeWidth={sel?.date === day.date ? 1.5 : 0}
                    />
                  ) : null,
                ),
              )}
            </Svg>
          </Pressable>
        </ScrollView>
      ) : null}

      <View style={[styles.footer, { borderTopColor: colors.line }]}>
        {sel ? (
          <Text variant="caption" tone="soft" numberOfLines={2}>
            <Text variant="caption" weight="semibold">
              {parseISODate(sel.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
            {`  ·  ${describe(sel)}`}
          </Text>
        ) : legend ? (
          <View style={styles.legendRow}>
            <View style={styles.legendScale}>
              <Text variant="caption" tone="subtle">
                {legend.low}
              </Text>
              {legend.steps.map((c, i) => (
                <View key={i} style={[styles.swatch, { backgroundColor: c }]} />
              ))}
              <Text variant="caption" tone="subtle">
                {legend.high}
              </Text>
            </View>
            {legend.extra?.map((e) => (
              <View key={e.label} style={styles.legendScale}>
                <View style={[styles.swatch, { backgroundColor: e.color }]} />
                <Text variant="caption" tone="subtle">
                  {e.label}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="caption" tone="subtle">
            Tap a day to see details
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    marginTop: space.md,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: 30,
    justifyContent: 'center',
  },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  legendScale: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
});

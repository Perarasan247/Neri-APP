import React, { useCallback, useId, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Chart label size (11pt, muted) shared by every chart. */
export const AXIS_FONT_SIZE = 11;

/** Measure the width a chart can draw into. 0 until the first layout pass. */
export function useChartWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    setWidth((prev) => (prev === w ? prev : w));
  }, []);
  return { width, onLayout };
}

/** A unique id safe to use inside SVG `url(#id)` references. */
export function useSvgId(prefix: string) {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/**
 * "Nice" linear scale from 0 to max: ticks on round steps (1, 2, 2.5, 5 × 10ⁿ).
 * Integer steps only unless allowDecimals.
 */
export function niceScale(rawMax: number, count = 4, allowDecimals = false): { max: number; ticks: number[] } {
  const max = rawMax > 0 ? rawMax : allowDecimals ? 1 : count;
  const raw = max / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow;
  if (!allowDecimals) step = Math.max(1, Math.ceil(step));
  const top = step * Math.ceil(max / step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toFixed(4)));
  return { max: top, ticks };
}

/** Indices of the x labels to print so they don't collide (always first & last). */
export function labelIndices(n: number, plotWidth: number, minGap = 56): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const slots = Math.max(2, Math.min(n, Math.floor(plotWidth / minGap) + 1));
  const out = new Set<number>();
  for (let i = 0; i < slots; i++) out.add(Math.round((i * (n - 1)) / (slots - 1)));
  return [...out];
}

/** Compact number for axis labels: 1200 → 1.2k. */
export function compactNumber(v: number): string {
  if (Math.abs(v) >= 1000) return `${Number((v / 1000).toFixed(1))}k`;
  return `${Number(v.toFixed(1))}`;
}

/** Mix two hex colors: pct of `a` over `b` (like CSS color-mix). */
export function mixHex(a: string, b: string, pct: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const t = Math.max(0, Math.min(1, pct / 100));
  const ch = (i: number) => Math.round(pa[i] * t + pb[i] * (1 - t)).toString(16).padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** SVG path for a bar with rounded top corners anchored to the baseline. */
export function roundedTopBar(x: number, y: number, w: number, h: number, r = 3): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

export interface TooltipLine {
  color?: string;
  label: string;
  value: string;
}

/**
 * Small value label shown after tapping a point or bar. Positioned beside the
 * tapped x so it never needs measuring: right of it on the left half, left of
 * it on the right half.
 */
export function ChartTooltip({
  x,
  width,
  title,
  lines,
}: {
  x: number;
  width: number;
  title?: string;
  lines: TooltipLine[];
}) {
  const { colors } = useTheme();
  const side = x < width / 2 ? { left: Math.max(0, x + 8) } : { right: Math.max(0, width - x + 8) };
  return (
    <View
      pointerEvents="none"
      style={[styles.tooltip, side, { backgroundColor: colors.surface, borderColor: colors.lineStrong, shadowColor: colors.shadow }]}
    >
      {title ? (
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      {lines.map((l) => (
        <View key={l.label} style={styles.tooltipLine}>
          {l.color ? <View style={[styles.swatch, { backgroundColor: l.color }]} /> : null}
          <Text variant="caption" tone="soft" numberOfLines={1}>
            {l.label}
          </Text>
          <Text variant="caption" weight="semibold" tabular numberOfLines={1}>
            {l.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Legend row: colored swatch (box or line) + label in text ink. */
export function Legend({ items }: { items: { color: string; label: string; dashed?: boolean; box?: boolean }[] }) {
  return (
    <View style={styles.legend}>
      {items.map((it) => (
        <View key={it.label} style={styles.legendItem}>
          {it.box ? (
            <View style={[styles.swatch, { backgroundColor: it.color }]} />
          ) : (
            <View
              style={{
                width: 12,
                borderTopWidth: 2,
                borderColor: it.color,
                borderStyle: it.dashed ? 'dashed' : 'solid',
              }}
            />
          )}
          <Text variant="caption" tone="muted">
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tooltip: {
    position: 'absolute',
    top: 0,
    maxWidth: 200,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs + 1,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 1,
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tooltipLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

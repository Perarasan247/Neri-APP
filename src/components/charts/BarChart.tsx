import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import {
  AXIS_FONT_SIZE,
  ChartTooltip,
  compactNumber,
  labelIndices,
  niceScale,
  roundedTopBar,
  useChartWidth,
} from './shared';

export interface BarSeries<T> {
  key: string;
  label: string;
  color: string;
  value: (d: T) => number;
}

interface BarChartProps<T> {
  data: T[];
  series: BarSeries<T>[];
  xLabel: (d: T, i: number) => string;
  tooltipTitle?: (d: T, i: number) => string;
  formatValue?: (v: number, d: T, s: BarSeries<T>) => string;
  /** grouped: side by side; stacked: one column per x. */
  mode?: 'grouped' | 'stacked';
  /** Per-bar color override (e.g. highlight the best weekday). */
  colorFor?: (d: T, i: number, s: BarSeries<T>) => string | undefined;
  formatY?: (v: number) => string;
  allowDecimals?: boolean;
  maxBarWidth?: number;
  height?: number;
}

const PAD_TOP = 8;
const PAD_BOTTOM = 22;
const Y_AXIS_W = 30;
const GAP = 2; // surface gap between adjacent / stacked fills

/** Theme-aware vertical bar chart. Tap a bar to show its values. */
export function BarChart<T>({
  data,
  series,
  xLabel,
  tooltipTitle,
  formatValue,
  mode = 'grouped',
  colorFor,
  formatY = compactNumber,
  allowDecimals,
  maxBarWidth = 24,
  height = 180,
}: BarChartProps<T>) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const [sel, setSel] = useState<number | null>(null);

  const plotW = Math.max(0, width - Y_AXIS_W - 2);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const n = data.length;
  const band = n > 0 ? plotW / n : 0;

  const rawMax = Math.max(
    0,
    ...data.map((d) =>
      mode === 'stacked'
        ? series.reduce((sum, s) => sum + Math.max(0, s.value(d) || 0), 0)
        : Math.max(0, ...series.map((s) => s.value(d) || 0)),
    ),
  );
  const { max: yMax, ticks } = niceScale(rawMax, 4, allowDecimals);
  const yAt = (v: number) => PAD_TOP + plotH - (Math.max(0, v) / yMax) * plotH;
  const bandX = (i: number) => Y_AXIS_W + i * band;

  // Bar geometry inside a band
  const groupCount = mode === 'grouped' ? series.length : 1;
  const usable = band * (n > 40 ? 0.8 : 0.66);
  const barW = Math.max(1, Math.min(maxBarWidth, (usable - GAP * (groupCount - 1)) / groupCount));
  const groupW = barW * groupCount + GAP * (groupCount - 1);
  const radius = barW >= 6 ? 3 : 0;

  const onPress = (x: number) => {
    if (n === 0 || band <= 0) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor((x - Y_AXIS_W) / band)));
    setSel((prev) => (prev === i ? null : i));
  };
  const selIdx = sel != null && sel < n ? sel : null;

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <React.Fragment key={t}>
                <Line x1={Y_AXIS_W} x2={width} y1={yAt(t)} y2={yAt(t)} stroke={colors.line} strokeWidth={0.75} />
                <SvgText x={Y_AXIS_W - 6} y={yAt(t) + 3.5} fontSize={AXIS_FONT_SIZE} fill={colors.fgSubtle} textAnchor="end">
                  {formatY(t)}
                </SvgText>
              </React.Fragment>
            ))}

            {selIdx != null ? (
              <Rect x={bandX(selIdx)} y={PAD_TOP} width={band} height={plotH} fill={colors.muted} rx={3} />
            ) : null}

            {data.map((d, i) => {
              const x0 = bandX(i) + (band - groupW) / 2;
              if (mode === 'stacked') {
                let acc = 0;
                const visible = series.filter((s) => (s.value(d) || 0) > 0);
                return visible.map((s, si) => {
                  const v = s.value(d) || 0;
                  const top = yAt(acc + v);
                  const bottom = yAt(acc);
                  acc += v;
                  const isTop = si === visible.length - 1;
                  const h = Math.max(0, bottom - top - (si > 0 ? GAP : 0));
                  const fill = colorFor?.(d, i, s) ?? s.color;
                  return isTop ? (
                    <Path key={`${i}-${s.key}`} d={roundedTopBar(x0, top, barW, h, radius)} fill={fill} />
                  ) : (
                    <Rect key={`${i}-${s.key}`} x={x0} y={top} width={barW} height={h} fill={fill} />
                  );
                });
              }
              return series.map((s, si) => {
                const v = s.value(d) || 0;
                if (v <= 0) return null;
                const top = yAt(v);
                return (
                  <Path
                    key={`${i}-${s.key}`}
                    d={roundedTopBar(x0 + si * (barW + GAP), top, barW, PAD_TOP + plotH - top, radius)}
                    fill={colorFor?.(d, i, s) ?? s.color}
                  />
                );
              });
            })}

            {labelIndices(n, plotW, n <= 12 ? 0 : 56).map((i) => (
              <SvgText
                key={i}
                x={bandX(i) + band / 2}
                y={height - 6}
                fontSize={AXIS_FONT_SIZE}
                fill={colors.fgSubtle}
                textAnchor={n > 12 && i === 0 ? 'start' : n > 12 && i === n - 1 ? 'end' : 'middle'}
              >
                {xLabel(data[i], i)}
              </SvgText>
            ))}
          </Svg>

          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Bar chart. Tap a bar to see its value."
            onPress={(e) => onPress(e.nativeEvent.locationX)}
            style={{ position: 'absolute', left: 0, top: 0, width, height }}
          />

          {selIdx != null ? (
            <ChartTooltip
              x={bandX(selIdx) + band / 2}
              width={width}
              title={(tooltipTitle ?? xLabel)(data[selIdx], selIdx)}
              lines={series.map((s) => {
                const v = s.value(data[selIdx]) || 0;
                return {
                  color: colorFor?.(data[selIdx], selIdx, s) ?? s.color,
                  label: s.label,
                  value: formatValue ? formatValue(v, data[selIdx], s) : formatY(v),
                };
              })}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

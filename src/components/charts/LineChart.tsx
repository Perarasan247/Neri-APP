import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import {
  AXIS_FONT_SIZE,
  ChartTooltip,
  compactNumber,
  labelIndices,
  niceScale,
  useChartWidth,
  useSvgId,
} from './shared';

export interface LineSeries<T> {
  key: string;
  label: string;
  color: string;
  value: (d: T) => number;
  /** Dashed reference line (targets, "created"). */
  dashed?: boolean;
  /** Soft gradient fill under the line. */
  area?: boolean;
  /** Small dots on every point (sparse data). */
  dots?: boolean;
}

interface LineChartProps<T> {
  data: T[];
  series: LineSeries<T>[];
  /** Short x-axis label for a point. */
  xLabel: (d: T, i: number) => string;
  /** Tooltip heading for a point (defaults to xLabel). */
  tooltipTitle?: (d: T, i: number) => string;
  /** Format a value in the tooltip (defaults to the axis format). */
  formatValue?: (v: number, d: T, s: LineSeries<T>) => string;
  /** Fixed y-domain, e.g. [0, 100] for percentages. Otherwise a nice 0..max scale. */
  yDomain?: [number, number];
  yTicks?: number[];
  formatY?: (v: number) => string;
  allowDecimals?: boolean;
  height?: number;
}

const PAD_TOP = 8;
const PAD_BOTTOM = 22;
const Y_AXIS_W = 34;

/**
 * Theme-aware SVG line chart (one y-axis). Tap anywhere on the plot to show
 * the nearest point's values; tap again to dismiss.
 */
export function LineChart<T>({
  data,
  series,
  xLabel,
  tooltipTitle,
  formatValue,
  yDomain,
  yTicks,
  formatY = compactNumber,
  allowDecimals,
  height = 180,
}: LineChartProps<T>) {
  const { colors } = useTheme();
  const { width, onLayout } = useChartWidth();
  const gradId = useSvgId('lg');
  const [sel, setSel] = useState<number | null>(null);

  const plotW = Math.max(0, width - Y_AXIS_W - 4);
  const plotH = height - PAD_TOP - PAD_BOTTOM;
  const n = data.length;

  let yMin = 0;
  let yMax: number;
  let ticks: number[];
  if (yDomain) {
    [yMin, yMax] = yDomain;
    ticks = yTicks ?? [yMin, yMin + (yMax - yMin) / 4, yMin + (yMax - yMin) / 2, yMin + ((yMax - yMin) * 3) / 4, yMax];
  } else {
    const rawMax = Math.max(0, ...data.flatMap((d) => series.map((s) => s.value(d) || 0)));
    const scale = niceScale(rawMax, 4, allowDecimals);
    yMax = scale.max;
    ticks = yTicks ?? scale.ticks;
  }
  const span = yMax - yMin || 1;

  const xAt = (i: number) => Y_AXIS_W + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD_TOP + plotH - ((Math.max(yMin, Math.min(yMax, v)) - yMin) / span) * plotH;

  const linePath = (s: LineSeries<T>) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(s.value(d) || 0).toFixed(1)}`).join(' ');

  const onPress = (x: number) => {
    if (n === 0 || plotW <= 0) return;
    const i = n <= 1 ? 0 : Math.round(((x - Y_AXIS_W) / plotW) * (n - 1));
    const idx = Math.max(0, Math.min(n - 1, i));
    setSel((prev) => (prev === idx ? null : idx));
  };

  const selIdx = sel != null && sel < n ? sel : null;
  const fmt = (v: number, d: T, s: LineSeries<T>) => (formatValue ? formatValue(v, d, s) : formatY(v));

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            <Defs>
              {series.map((s, si) =>
                s.area ? (
                  <LinearGradient key={s.key} id={`${gradId}${si}`} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={s.color} stopOpacity={0.18} />
                    <Stop offset="1" stopColor={s.color} stopOpacity={0} />
                  </LinearGradient>
                ) : null,
              )}
            </Defs>

            {/* Hairline gridlines + y labels */}
            {ticks.map((t) => (
              <React.Fragment key={t}>
                <Line x1={Y_AXIS_W} x2={width} y1={yAt(t)} y2={yAt(t)} stroke={colors.line} strokeWidth={0.75} />
                <SvgText
                  x={Y_AXIS_W - 6}
                  y={yAt(t) + 3.5}
                  fontSize={AXIS_FONT_SIZE}
                  fill={colors.fgSubtle}
                  textAnchor="end"
                >
                  {formatY(t)}
                </SvgText>
              </React.Fragment>
            ))}

            {/* X labels */}
            {labelIndices(n, plotW).map((i) => (
              <SvgText
                key={i}
                x={xAt(i)}
                y={height - 6}
                fontSize={AXIS_FONT_SIZE}
                fill={colors.fgSubtle}
                textAnchor={n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle'}
              >
                {xLabel(data[i], i)}
              </SvgText>
            ))}

            {selIdx != null ? (
              <Line x1={xAt(selIdx)} x2={xAt(selIdx)} y1={PAD_TOP} y2={PAD_TOP + plotH} stroke={colors.lineStrong} strokeWidth={1} />
            ) : null}

            {n > 0
              ? series.map((s, si) => {
                  const d = linePath(s);
                  return (
                    <React.Fragment key={s.key}>
                      {s.area && n > 1 ? (
                        <Path
                          d={`${d} L${xAt(n - 1)},${PAD_TOP + plotH} L${xAt(0)},${PAD_TOP + plotH} Z`}
                          fill={`url(#${gradId}${si})`}
                        />
                      ) : null}
                      <Path
                        d={d}
                        stroke={s.color}
                        strokeWidth={s.dashed ? 1.5 : 2}
                        strokeDasharray={s.dashed ? '4 4' : undefined}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        fill="none"
                      />
                      {s.dots || n === 1
                        ? data.map((p, i) => (
                            <Circle key={i} cx={xAt(i)} cy={yAt(s.value(p) || 0)} r={2.5} fill={s.color} />
                          ))
                        : null}
                    </React.Fragment>
                  );
                })
              : null}

            {selIdx != null
              ? series.map((s) => (
                  <Circle
                    key={s.key}
                    cx={xAt(selIdx)}
                    cy={yAt(s.value(data[selIdx]) || 0)}
                    r={4.5}
                    fill={colors.surface}
                    stroke={s.color}
                    strokeWidth={2.5}
                  />
                ))
              : null}
          </Svg>

          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Chart. Tap a point to see its value."
            onPress={(e) => onPress(e.nativeEvent.locationX)}
            style={{ position: 'absolute', left: 0, top: 0, width, height }}
          />

          {selIdx != null ? (
            <ChartTooltip
              x={xAt(selIdx)}
              width={width}
              title={(tooltipTitle ?? xLabel)(data[selIdx], selIdx)}
              lines={series.map((s) => ({
                color: s.color,
                label: s.label,
                value: fmt(s.value(data[selIdx]) || 0, data[selIdx], s),
              }))}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** LineChart with a gradient fill under every series that doesn't opt out. */
export function AreaChart<T>(props: LineChartProps<T>) {
  return <LineChart {...props} series={props.series.map((s) => ({ ...s, area: s.area ?? !s.dashed }))} />;
}

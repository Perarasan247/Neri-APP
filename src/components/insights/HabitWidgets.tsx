import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { Habit, HabitInsightWidget } from '@/api/types';
import { BarChart, Legend, LineChart } from '@/components/charts';
import { Text } from '@/components/ui';
import { parseISODate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { ChartCard } from './ChartCard';
import { AvoidHeatmap, HabitActivityHeatmap } from './heatmaps';

/** Render order on mobile (summary metrics first, heatmaps last). */
const ORDER = [
  'value_log',
  'period_progress',
  'avoid_metrics',
  'count_metrics',
  'weekday_breakdown',
  'daily_trend',
  'count_trend',
  'occurrences_bar',
  'heatmap',
  'avoid_heatmap',
];

const dayLabel = (d: { date?: string; label?: string }) =>
  d.date ? parseISODate(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : (d.label ?? '');
const fullDay = (d: { date?: string; label?: string }) =>
  d.date
    ? parseISODate(d.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : (d.label ?? '');

/** Every widget from a habit's insights payload, each with a fitting chart. */
export function HabitWidgets({ habit, widgets }: { habit: Habit; widgets: HabitInsightWidget[] }) {
  const sorted = [...widgets].sort((a, b) => rank(a.widget_type) - rank(b.widget_type));
  return (
    <View style={{ gap: space.lg }}>
      {sorted.map((w, i) => (
        <Widget key={`${w.widget_type}-${i}`} habit={habit} widget={w} />
      ))}
    </View>
  );
}

const rank = (t: string) => {
  const i = ORDER.indexOf(t);
  return i === -1 ? ORDER.length : i;
};

function Widget({ habit, widget }: { habit: Habit; widget: HabitInsightWidget }) {
  const { colors } = useTheme();
  const data = widget.data;

  switch (widget.widget_type) {
    case 'weekday_breakdown': {
      const rows = (data ?? []) as { day: string; done: number; eligible: number }[];
      return (
        <ChartCard title="Weekday breakdown" description="Which days of the week you consistently follow through.">
          <BarChart
            data={rows}
            xLabel={(d) => d.day.slice(0, 3)}
            tooltipTitle={(d) => d.day}
            series={[
              { key: 'eligible', label: 'Scheduled', color: colors.lineStrong, value: (d) => d.eligible },
              { key: 'done', label: 'Completed', color: habit.color, value: (d) => d.done },
            ]}
            maxBarWidth={16}
          />
          <View style={styles.legend}>
            <Legend
              items={[
                { box: true, color: habit.color, label: 'Completed' },
                { box: true, color: colors.lineStrong, label: 'Scheduled' },
              ]}
            />
          </View>
        </ChartCard>
      );
    }

    case 'value_log': {
      const v = data ?? {};
      const rows = (v.daily ?? []) as { date: string; label: string; value: number }[];
      const unit = v.unit ? String(v.unit) : '';
      return (
        <ChartCard title={String(v.label ?? 'Logged')} description="Logged by you, no goal attached.">
          <StatRow
            stats={[
              { label: 'Today', value: fmtNum(v.periods?.today) },
              { label: 'Week', value: fmtNum(v.periods?.week) },
              { label: 'Month', value: fmtNum(v.periods?.month) },
              { label: 'Year', value: fmtNum(v.periods?.year) },
            ]}
          />
          <View style={styles.valueRange}>
            <StatRow
              stats={[
                { label: 'Selected range', value: fmtNum(v.range_total) },
                { label: 'Avg / logged day', value: fmtNum(v.daily_average) },
                { label: 'Best day', value: fmtNum(v.best_day) },
              ]}
            />
          </View>
          <BarChart
            data={rows}
            xLabel={dayLabel}
            tooltipTitle={fullDay}
            series={[{ key: 'value', label: unit || 'Logged', color: habit.color, value: (d) => d.value }]}
          />
        </ChartCard>
      );
    }

    case 'period_progress': {
      const rows = (data?.periods ?? []) as {
        label: string;
        date: string;
        done: number;
        target: number;
        is_met: boolean;
        is_current: boolean;
      }[];
      const unit = String(data?.unit ?? 'week');
      return (
        <ChartCard
          title={`Days done per ${unit}`}
          description={`Goal: ${data?.target ?? 1}× a ${unit}. A ${unit} counts as hit when you reach it.`}
        >
          {rows.length === 0 ? (
            <Text variant="small" tone="subtle">
              {`No full ${unit} in this range yet.`}
            </Text>
          ) : (
            <>
              <BarChart
                data={rows}
                xLabel={(d) => d.label}
                tooltipTitle={(d) => (unit === 'week' ? `Week of ${d.label}` : d.label)}
                formatValue={(v, d) => `${v} of ${d.target}${d.is_current && !d.is_met ? ' · in progress' : ''}`}
                series={[{ key: 'done', label: 'Days done', color: colors.lineStrong, value: (d) => d.done }]}
                colorFor={(d) => (d.is_met ? habit.color : undefined)}
                maxBarWidth={26}
              />
              <View style={styles.legend}>
                <Legend
                  items={[
                    { box: true, color: habit.color, label: 'Goal hit' },
                    { box: true, color: colors.lineStrong, label: 'Not yet / missed' },
                  ]}
                />
              </View>
            </>
          )}
        </ChartCard>
      );
    }

    case 'daily_trend': {
      // Running completion rate: done so far / eligible so far.
      const rows = (data ?? []) as { date: string; label: string; is_eligible: boolean; is_done: boolean }[];
      const points = rows.reduce<((typeof rows)[number] & { done: number; elig: number; rate: number })[]>(
        (acc, r) => {
          const prev = acc[acc.length - 1];
          const elig = (prev?.elig ?? 0) + (r.is_eligible ? 1 : 0);
          const done = (prev?.done ?? 0) + (r.is_done ? 1 : 0);
          acc.push({ ...r, done, elig, rate: elig > 0 ? Math.round((done / elig) * 1000) / 10 : 0 });
          return acc;
        },
        [],
      );
      if (points[points.length - 1]?.elig === 0 || points.length === 0) return null;
      return (
        <ChartCard title="Completion over time" description="Running completion rate across the period.">
          <LineChart
            data={points}
            xLabel={dayLabel}
            tooltipTitle={fullDay}
            yDomain={[0, 100]}
            formatY={(v) => `${v}%`}
            formatValue={(v, d) => `${v}% · ${d.done}/${d.elig}`}
            series={[{ key: 'rate', label: 'Completion', color: habit.color, area: true, value: (d) => d.rate }]}
          />
        </ChartCard>
      );
    }

    case 'heatmap':
      return (
        <ChartCard title="Activity heatmap" description="Each day you completed it.">
          <HabitActivityHeatmap days={data ?? []} />
        </ChartCard>
      );

    case 'count_trend': {
      const rows = (data ?? []) as { date: string; label: string; value: number; target: number }[];
      return (
        <ChartCard title="Daily volume vs. target" description="Recorded daily quantities against your target.">
          <LineChart
            data={rows}
            xLabel={dayLabel}
            tooltipTitle={fullDay}
            allowDecimals
            series={[
              { key: 'value', label: 'Recorded', color: habit.color, dots: rows.length <= 45, value: (d) => d.value },
              { key: 'target', label: 'Target', color: colors.fgSubtle, dashed: true, value: (d) => d.target },
            ]}
          />
          <View style={styles.legend}>
            <Legend
              items={[
                { color: habit.color, label: 'Recorded' },
                { color: colors.fgSubtle, label: 'Target', dashed: true },
              ]}
            />
          </View>
        </ChartCard>
      );
    }

    case 'count_metrics': {
      const m = data ?? {};
      return (
        <ChartCard title="Volume">
          <StatRow
            stats={[
              { label: 'Total', value: fmtNum(m.total_volume) },
              { label: 'Daily avg', value: fmtNum(m.daily_average) },
              { label: 'Best day', value: fmtNum(m.best_day) },
              { label: 'Target met', value: `${m.days_target_met ?? 0}/${m.eligible_days ?? 0}` },
            ]}
          />
        </ChartCard>
      );
    }

    case 'avoid_metrics': {
      const m = data ?? {};
      const trend = Number(m.trend_vs_prev ?? 0);
      return (
        <ChartCard title="Clean days & slips">
          <StatRow
            stats={[
              { label: 'Clean days', value: `${m.clean_days ?? 0}/${m.eligible_days ?? 0}` },
              { label: 'Total slips', value: fmtNum(m.total_occurrences) },
              {
                label: 'vs. prior',
                value: `${trend > 0 ? '+' : ''}${trend}`,
                tone: trend > 0 ? 'danger' : trend < 0 ? 'success' : undefined,
              },
              { label: 'Worst day', value: m.worst_weekday && m.worst_weekday !== 'None' ? String(m.worst_weekday).slice(0, 3) : '—' },
            ]}
          />
          <StatRow
            stats={[
              { label: 'Most in a day', value: fmtNum(m.most_in_a_day) },
              { label: 'Avg / day', value: fmtNum(m.avg_per_day) },
              { label: 'Days slipped', value: fmtNum(m.slip_days) },
            ]}
          />
        </ChartCard>
      );
    }

    case 'occurrences_bar': {
      const rows = (data ?? []) as { date: string; label: string; occurrences: number }[];
      return (
        <ChartCard title="Occurrences over time" description="Aim for zero. Clean days have no bar.">
          <BarChart
            data={rows}
            xLabel={dayLabel}
            tooltipTitle={fullDay}
            series={[{ key: 'occ', label: 'Slips', color: colors.danger, value: (d) => d.occurrences }]}
          />
        </ChartCard>
      );
    }

    case 'avoid_heatmap':
      return (
        <ChartCard title="Slip heatmap" description="Darker red means more slips that day.">
          <AvoidHeatmap days={data ?? []} />
        </ChartCard>
      );

    default:
      return null;
  }
}

const fmtNum = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? `${Number(n.toFixed(1))}` : '0';
};

/** Compact row of 2–4 label/value stats. */
function StatRow({ stats }: { stats: { label: string; value: string; tone?: 'danger' | 'success' }[] }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stats}>
      {stats.map((s, i) => (
        <View key={s.label} style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line }]}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {s.label}
          </Text>
          <Text variant="title" tabular tone={s.tone ?? 'fg'} numberOfLines={1}>
            {s.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { marginTop: space.sm },
  valueRange: { marginVertical: space.md },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, gap: 2, paddingHorizontal: space.sm },
});

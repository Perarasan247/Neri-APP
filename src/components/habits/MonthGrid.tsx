/**
 * Month overview for the Habits tab: the KPI strip plus one compact heat
 * strip per habit (one square per day). Detailed editing happens in the week
 * view; tapping a strip opens the habit's detail screen.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import type { Habit, MonthlyCell, MonthlyData, MonthlyHabitRow } from '@/api/types';
import { HabitTile, Text, withAlpha } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/* ---------- Summary ---------- */

export function MonthSummary({ summary }: { summary: MonthlyData['summary'] }) {
  const { colors } = useTheme();
  const items: Array<[string, string]> = [
    [`${summary.completion_rate}%`, 'Completion'],
    [`${summary.total_done}/${summary.total_eligible}`, 'Done'],
    [String(summary.perfect_days), 'Perfect days'],
    [String(summary.rest_days), 'Rest days'],
  ];
  return (
    <View style={[styles.kpis, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      {items.map(([value, label], i) => (
        <View
          key={label}
          style={[styles.kpi, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line }]}
          accessible
          accessibilityLabel={`${label}: ${value}`}
        >
          <Text variant="title" tabular numberOfLines={1} adjustsFontSizeToFit color={i === 0 ? colors.accentText : undefined}>
            {value}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- Heat strip ---------- */

function useCellColor(habit: Habit) {
  const { colors: c } = useTheme();
  const target = habit.current_schedule?.daily_target || 1;
  return (cell: MonthlyCell): { bg: string; border?: string } => {
    switch (cell.state) {
      case 'done':
        return { bg: habit.color };
      case 'missed':
        if (habit.type === 'build_count' && cell.count > 0)
          return { bg: withAlpha(habit.color, 0.2 + 0.4 * Math.min(1, cell.count / target)) };
        if (habit.type === 'avoid_count' && cell.count > 0) return { bg: c.danger };
        return { bg: c.mutedStrong };
      case 'skipped':
        return { bg: c.warningSoft };
      case 'not_scheduled':
        // Logged anyway on an off day: a faint fill, not counted in the totals
        return cell.count > 0 ? { bg: withAlpha(habit.color, 0.25) } : { bg: 'transparent' };
      case 'future':
        return { bg: 'transparent', border: c.line };
      default:
        return { bg: 'transparent' };
    }
  };
}

export const HabitMonthStrip = memo(function HabitMonthStrip({
  row,
  todayStr,
  onOpenHabit,
}: {
  row: MonthlyHabitRow;
  todayStr: string;
  onOpenHabit: (habit: Habit) => void;
}) {
  const { colors } = useTheme();
  const { habit } = row;
  const colorOf = useCellColor(habit);

  return (
    <Pressable
      onPress={() => onOpenHabit(habit)}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}: ${row.monthly_completion_rate}% this month, ${row.monthly_done} of ${row.monthly_eligible}. Open details.`}
      style={({ pressed }) => [styles.stripRow, pressed && { backgroundColor: colors.subtle }]}
    >
      <View style={styles.stripHeader}>
        <HabitTile icon={habit.icon} color={habit.color} size={26} />
        <Text weight="medium" numberOfLines={1} style={{ flex: 1 }}>
          {habit.name}
        </Text>
        <Text variant="small" weight="semibold" tabular>
          {row.monthly_completion_rate}%
        </Text>
        <Text variant="caption" tone="subtle" tabular style={{ minWidth: 38, textAlign: 'right' }}>
          {row.monthly_done}/{row.monthly_eligible}
        </Text>
        <ChevronRight size={15} color={colors.fgSubtle} />
      </View>
      <View style={styles.strip}>
        {row.cells.map((cell) => {
          const { bg, border } = colorOf(cell);
          const isToday = cell.date === todayStr;
          return (
            <View key={cell.date} style={styles.stripCol}>
              <View
                style={[
                  styles.square,
                  { backgroundColor: bg },
                  border ? { borderWidth: StyleSheet.hairlineWidth, borderColor: border } : null,
                  cell.state === 'not_applicable' && { opacity: 0.3 },
                ]}
              />
              {isToday ? <View style={[styles.todayMark, { backgroundColor: colors.accent }]} /> : null}
            </View>
          );
        })}
      </View>
    </Pressable>
  );
});

/** Day-number ruler above the strips (1, 8, 15, 22, 29). */
export function MonthRuler({ days }: { days: number }) {
  return (
    <View style={[styles.strip, styles.ruler]}>
      {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
        <View key={d} style={styles.stripCol}>
          {(d - 1) % 7 === 0 ? (
            <Text variant="caption" tone="subtle" tabular style={styles.rulerText}>
              {d}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function MonthLegend() {
  const { colors: c } = useTheme();
  const items: Array<[object, string]> = [
    [{ backgroundColor: c.accent }, 'Done'],
    [{ backgroundColor: withAlpha(c.accent, 0.4) }, 'Partial'],
    [{ backgroundColor: c.mutedStrong }, 'Missed'],
    [{ backgroundColor: c.danger }, 'Slip'],
    [{ backgroundColor: c.warningSoft }, 'Skipped'],
  ];
  return (
    <View style={styles.legend}>
      {items.map(([style, label]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendSwatch, style]} />
          <Text variant="caption" tone="muted">
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  kpis: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: space.md,
  },
  kpi: { flex: 1, alignItems: 'center', paddingHorizontal: space.xs, gap: 2 },
  stripRow: { paddingHorizontal: space.md, paddingVertical: space.md, gap: space.sm },
  stripHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  strip: { flexDirection: 'row', gap: 2 },
  stripCol: { flex: 1, alignItems: 'center' },
  square: { width: '100%', aspectRatio: 0.7, borderRadius: 2 },
  todayMark: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  ruler: { paddingHorizontal: space.md, paddingTop: space.sm, height: 22 },
  rulerText: { fontSize: 10, lineHeight: 12, position: 'absolute', left: 0, width: 24 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm, paddingVertical: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  legendSwatch: { width: 12, height: 12, borderRadius: 2 },
});

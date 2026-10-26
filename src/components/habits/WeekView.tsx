/**
 * Week view for the Habits tab: a shared weekday header and one compact card
 * per habit with seven day circles aligned underneath it. Tapping a circle
 * logs a yes/no habit instantly; count / avoid habits (and long-press on any
 * day) open the day editor sheet.
 */
import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, Coffee, Minus } from 'lucide-react-native';

import type { Habit, MonthlyCell, MonthlyHabitRow } from '@/api/types';
import { HabitTile, ProgressRing, Text, withAlpha } from '@/components/ui';
import { WEEKDAY_LETTERS, describeSchedule, parseISODate, shortDate } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const DOT = 34;

export function cellEditable(cell: MonthlyCell) {
  // A whole-day rest skips every habit, so one habit's cell can't override it
  const dayRest = cell.state === 'skipped' && cell.skip_scope === 'day';
  return cell.state !== 'future' && cell.state !== 'not_applicable' && !dayRest;
}

const STATE_LABEL: Record<MonthlyCell['state'], string> = {
  done: 'Done',
  missed: 'Not done',
  skipped: 'Skipped',
  not_scheduled: 'Not scheduled',
  not_applicable: 'Not active',
  future: 'Upcoming',
};

/* ---------- Header ---------- */

/** Weekday letters + dates; columns line up with the circles in each card. */
export function WeekHeader({ days, todayStr }: { days: string[]; todayStr: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.dotsRow, styles.headerRow]}>
      {days.map((d, i) => {
        const isToday = d === todayStr;
        return (
          <View key={d} style={styles.col}>
            <Text variant="caption" tone={isToday ? 'accent' : 'subtle'} weight="semibold">
              {WEEKDAY_LETTERS[i]}
            </Text>
            <View style={[styles.dateBadge, isToday && { backgroundColor: colors.accent }]}>
              <Text variant="caption" tabular weight={isToday ? 'bold' : 'medium'} color={isToday ? colors.accentFg : colors.fgSoft}>
                {parseISODate(d).getDate()}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ---------- Day circle ---------- */

const DayDot = memo(function DayDot({
  cell,
  habit,
  target,
  isToday,
  onPress,
  onLongPress,
}: {
  cell: MonthlyCell | undefined;
  habit: Habit;
  target: number;
  isToday: boolean;
  onPress: (cell: MonthlyCell) => void;
  onLongPress: (cell: MonthlyCell) => void;
}) {
  const { colors: c } = useTheme();
  if (!cell) return <View style={styles.col} />;

  const color = habit.color;
  const isCount = habit.type === 'build_count';
  const isAvoid = habit.type === 'avoid_count';
  const editable = cellEditable(cell);

  let content: React.ReactNode = null;
  let bg = 'transparent';
  let border = c.lineStrong;
  let borderStyle: 'solid' | 'dashed' = 'solid';
  let opacity = 1;

  switch (cell.state) {
    case 'done':
      bg = color;
      border = color;
      content = isCount && cell.count > 1 ? (
        <Text variant="caption" weight="bold" color="#ffffff" tabular>
          {cell.count}
        </Text>
      ) : (
        <Check size={16} color="#ffffff" strokeWidth={3} />
      );
      break;
    case 'missed':
      if (isCount && cell.count > 0) {
        // Partial progress toward the daily goal
        border = 'transparent';
        content = (
          <ProgressRing value={cell.count / target} size={DOT} stroke={3} color={color} track={withAlpha(color, 0.18)}>
            <Text variant="caption" weight="semibold" tabular>
              {cell.count}
            </Text>
          </ProgressRing>
        );
      } else if (isAvoid && cell.count > 0) {
        bg = c.dangerSoft;
        border = c.dangerSoft;
        content = (
          <Text variant="caption" weight="bold" tone="danger" tabular>
            {cell.count}
          </Text>
        );
      } else {
        border = withAlpha(color, 0.45);
      }
      break;
    case 'skipped':
      bg = c.mutedStrong;
      border = c.mutedStrong;
      content = <Coffee size={14} color={c.fgMuted} />;
      break;
    case 'not_scheduled':
      if (cell.count > 0) {
        // Logged anyway on a day it isn't scheduled: shown, but not counted in the totals
        border = color;
        borderStyle = 'dashed';
        content = <Check size={15} color={color} strokeWidth={3} />;
      } else {
        border = 'transparent';
        content = <Minus size={14} color={c.lineStrong} />;
      }
      break;
    case 'not_applicable':
      border = 'transparent';
      opacity = 0.35;
      content = <View style={[styles.tinyDot, { backgroundColor: c.lineStrong }]} />;
      break;
    case 'future':
      borderStyle = 'dashed';
      border = c.line;
      break;
  }

  const extra =
    isCount && cell.count ? `, ${cell.count} of ${target}` : isAvoid && cell.count ? `, ${cell.count} slips` : '';

  return (
    <View style={styles.col}>
      <Pressable
        disabled={!editable}
        onPress={() => onPress(cell)}
        onLongPress={() => onLongPress(cell)}
        delayLongPress={350}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, ${shortDate(cell.date)}: ${STATE_LABEL[cell.state]}${extra}${
          cell.note ? ', has note' : ''
        }${isToday ? ', today' : ''}`}
        accessibilityHint={editable ? (habit.type === 'build_yesno' ? 'Tap to toggle, hold for more' : 'Opens day editor') : undefined}
        style={({ pressed }) => [
          styles.dot,
          {
            backgroundColor: bg,
            borderColor: border,
            borderStyle,
            opacity,
            transform: [{ scale: pressed ? 0.88 : 1 }],
          },
          isToday && { shadowColor: c.accent, ...styles.todayGlow },
        ]}
      >
        {content}
      </Pressable>
      {cell.note ? <View style={[styles.noteDot, { backgroundColor: c.fgMuted }]} /> : <View style={styles.noteSpace} />}
    </View>
  );
});

/* ---------- Habit card ---------- */

export const HabitWeekCard = memo(function HabitWeekCard({
  row,
  days,
  todayStr,
  onOpenHabit,
  onDayPress,
  onDayLongPress,
}: {
  row: MonthlyHabitRow;
  days: string[];
  todayStr: string;
  onOpenHabit: (habit: Habit) => void;
  onDayPress: (habit: Habit, cell: MonthlyCell) => void;
  onDayLongPress: (habit: Habit, cell: MonthlyCell) => void;
}) {
  const { colors } = useTheme();
  const { habit } = row;
  const target = habit.current_schedule?.daily_target || 1;
  const byDate = new Map(row.cells.map((c) => [c.date, c]));
  const weekCells = days.map((d) => byDate.get(d));

  const eligible = weekCells.filter((c) => c && (c.state === 'done' || c.state === 'missed')).length;
  const done = weekCells.filter((c) => c?.state === 'done').length;
  const meta =
    habit.type === 'avoid_count'
      ? 'Avoid · every day'
      : describeSchedule(habit.current_schedule) || habit.category || '';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Pressable
        onPress={() => onOpenHabit(habit)}
        accessibilityRole="button"
        accessibilityLabel={`${habit.name}, ${done} of ${eligible} this week. Open details.`}
        style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.6 }]}
      >
        <HabitTile icon={habit.icon} color={habit.color} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text weight="semibold" numberOfLines={1}>
            {habit.name}
          </Text>
          {meta ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        <Text variant="small" weight="semibold" tabular tone={eligible > 0 && done === eligible ? 'success' : 'soft'}>
          {done}/{eligible}
        </Text>
        <ChevronRight size={16} color={colors.fgSubtle} />
      </Pressable>

      <View style={styles.dotsRow}>
        {weekCells.map((cell, i) => (
          <DayDot
            key={days[i]}
            cell={cell}
            habit={habit}
            target={target}
            isToday={days[i] === todayStr}
            onPress={(c) => onDayPress(habit, c)}
            onLongPress={(c) => onDayLongPress(habit, c)}
          />
        ))}
      </View>
    </View>
  );
});

/* ---------- Legend ---------- */

export function WeekLegend() {
  const { colors: c } = useTheme();
  const item = (node: React.ReactNode, label: string) => (
    <View key={label} style={styles.legendItem}>
      {node}
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
  const sw = (style: object, child?: React.ReactNode) => <View style={[styles.swatch, style]}>{child}</View>;
  return (
    <View style={styles.legend}>
      {item(sw({ backgroundColor: c.accent }, <Check size={9} color="#fff" strokeWidth={3} />), 'Done')}
      {item(sw({ borderWidth: 1.5, borderColor: withAlpha(c.accent, 0.45) }), 'Not done')}
      {item(sw({ backgroundColor: c.mutedStrong }, <Coffee size={8} color={c.fgMuted} />), 'Skipped')}
      {item(sw({}, <Minus size={10} color={c.lineStrong} />), 'Not scheduled')}
      {item(sw({ borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' }), 'Upcoming')}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: space.md,
    paddingBottom: space.xs,
    paddingHorizontal: space.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.xs,
    marginBottom: space.md,
  },
  dotsRow: { flexDirection: 'row' },
  headerRow: { paddingHorizontal: space.sm, paddingBottom: space.sm },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  dateBadge: { minWidth: 26, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayGlow: { shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 }, elevation: 2 },
  tinyDot: { width: 4, height: 4, borderRadius: 2 },
  noteDot: { width: 4, height: 4, borderRadius: 2, marginBottom: 2 },
  noteSpace: { height: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.lg, rowGap: space.sm, paddingVertical: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  swatch: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
});

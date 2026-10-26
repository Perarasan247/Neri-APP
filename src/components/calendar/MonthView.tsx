import React, { memo, useMemo } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Plus } from 'lucide-react-native';

import type { Todo } from '@/api/types';
import { IconButton, Text } from '@/components/ui';
import { withAlpha } from '@/components/ui/HabitIcon';
import { TaskRow } from '@/components/tasks/TaskRow';
import { addDays, longDate, parseISODate, pluralize, startOfWeek, toISODate, WEEKDAY_LETTERS } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

import { eventColor } from './shared';

const MAX_PILLS = 2;
const ROW_H = 84;
const EMPTY: Todo[] = [];

const byTime = (a: Todo, b: Todo) =>
  (a.start_time || a.due_time || '').localeCompare(b.start_time || b.due_time || '') ||
  (a.is_all_day ? 0 : 1) - (b.is_all_day ? 0 : 1);

const Cell = memo(function Cell({
  date,
  tasks,
  today,
  selected,
  outside,
  onPress,
}: {
  date: string;
  tasks: Todo[];
  today: string;
  selected: boolean;
  outside: boolean;
  onPress: (d: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const isToday = date === today;
  const shown = tasks.length > MAX_PILLS + 1 ? tasks.slice(0, MAX_PILLS) : tasks;
  const more = tasks.length - shown.length;
  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${longDate(date)}, ${pluralize(tasks.length, 'task')}`}
      style={[
        styles.cell,
        { borderColor: colors.line },
        selected && { backgroundColor: colors.accentSoft },
      ]}
    >
      <View style={[styles.num, isToday && { backgroundColor: colors.accent }]}>
        <Text
          variant="caption"
          weight={isToday ? 'bold' : 'medium'}
          color={isToday ? colors.accentFg : outside ? colors.fgSubtle : colors.fg}
          tabular
        >
          {parseISODate(date).getDate()}
        </Text>
      </View>
      {shown.map((t) => {
        const c = eventColor(t, colors);
        return (
          <View
            key={t.id}
            style={[
              styles.pill,
              { backgroundColor: withAlpha(c, scheme === 'dark' ? 0.4 : 0.22), opacity: t.status === 'completed' || outside ? 0.55 : 1 },
            ]}
          >
            <Text
              color={colors.fg}
              numberOfLines={1}
              style={[styles.pillText, t.status === 'completed' && { textDecorationLine: 'line-through' }]}
            >
              {t.title}
            </Text>
          </View>
        );
      })}
      {more > 0 ? (
        <Text color={colors.fgMuted} style={styles.moreText}>
          +{more} more
        </Text>
      ) : null}
    </Pressable>
  );
});

interface Props {
  year: number;
  /** 1-12 */
  month: number;
  byDate: Map<string, Todo[]>;
  today: string;
  selected: string;
  refreshing: boolean;
  onRefresh: () => void;
  /** First tap selects, tapping the selected day again opens it. */
  onDayPress: (date: string) => void;
  onAdd: (date: string) => void;
}

export function MonthView({ year, month, byDate, today, selected, refreshing, onRefresh, onDayPress, onAdd }: Props) {
  const { colors } = useTheme();
  const weeks = useMemo(() => {
    const start = startOfWeek(toISODate(new Date(year, month - 1, 1)));
    return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  }, [year, month]);
  const sorted = useMemo(() => {
    const m = new Map<string, Todo[]>();
    for (const [k, v] of byDate) m.set(k, [...v].sort(byTime));
    return m;
  }, [byDate]);
  const dayTasks = sorted.get(selected) ?? EMPTY;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.fgSubtle} colors={[colors.accent]} />
      }
    >
      <View style={styles.weekdays}>
        {WEEKDAY_LETTERS.map((l, i) => (
          <Text key={i} variant="caption" weight="semibold" color={colors.fgSubtle} style={styles.weekday}>
            {l}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.week}>
          {week.map((d) => (
            <Cell
              key={d}
              date={d}
              tasks={sorted.get(d) ?? EMPTY}
              today={today}
              selected={d === selected}
              outside={parseISODate(d).getMonth() !== month - 1}
              onPress={onDayPress}
            />
          ))}
        </View>
      ))}
      <View style={styles.dayHeader}>
        <Text variant="small" weight="semibold" tone={selected === today ? 'accent' : 'fg'} style={styles.flex}>
          {longDate(selected)}
          {selected === today ? ' · Today' : ''}
          {dayTasks.length ? <Text variant="small" tone="subtle">{`  ${dayTasks.length}`}</Text> : null}
        </Text>
        <IconButton label={`Add task on ${longDate(selected)}`} size={30} onPress={() => onAdd(selected)}>
          <Plus size={16} color={colors.fgSubtle} />
        </IconButton>
      </View>
      {dayTasks.length === 0 ? (
        <Text variant="small" tone="subtle" style={styles.empty}>
          Nothing planned. Tap the day again to open it.
        </Text>
      ) : (
        dayTasks.map((t) => (
          <View key={t.id} style={styles.item}>
            <TaskRow todo={t} hideDate />
          </View>
        ))
      )}
      <Pressable
        onPress={() => {
          haptic.tap();
          onDayPress(selected);
        }}
        accessibilityRole="button"
        style={styles.openDay}
      >
        <Text variant="small" weight="semibold" tone="accent">
          Open day view
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: 110 },
  weekdays: { flexDirection: 'row', paddingVertical: space.xs },
  weekday: { flex: 1, textAlign: 'center' },
  week: { flexDirection: 'row' },
  cell: {
    flex: 1,
    height: ROW_H,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 2,
    paddingTop: 2,
    gap: 2,
    overflow: 'hidden',
  },
  num: { alignSelf: 'center', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: radius.xs, paddingHorizontal: 3, height: 15, justifyContent: 'center' },
  pillText: { fontSize: 10, lineHeight: 13 },
  moreText: { fontSize: 10, lineHeight: 13, paddingHorizontal: 3 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.lg,
    marginHorizontal: space.lg,
    marginBottom: space.sm,
  },
  item: { marginHorizontal: space.lg, marginBottom: space.sm },
  empty: { marginHorizontal: space.lg },
  openDay: { alignSelf: 'center', paddingVertical: space.md },
});

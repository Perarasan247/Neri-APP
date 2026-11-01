import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Flame, MessageSquare, Minus, MoreHorizontal, NotebookPen, Plus } from 'lucide-react-native';

import type { TodayItem } from '@/api/types';
import { Badge, Checkbox, HabitTile, IconButton, ProgressRing, Text } from '@/components/ui';
import { describeSchedule } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface HabitRowProps {
  item: TodayItem;
  /** Yes/No: toggle done. */
  onToggle: () => void;
  /** Count / avoid: change today's count by delta. */
  onIncrement: (delta: number) => void;
  /** Open the row's action menu. */
  onMenu: () => void;
  /** Yes/No habit that tracks a value: open the log sheet. */
  onLog?: () => void;
  /** Cut-back habit: open the "how many slips?" sheet. */
  onSetSlips?: () => void;
}

/**
 * One habit on the Today list: tile, name, meta line (streak, weekly progress
 * or schedule, category, note) and a type-specific control on the right.
 * Tap toggles yes/no habits; long-press or "…" opens the action menu.
 */
export const HabitRow = memo(function HabitRow({ item, onToggle, onIncrement, onMenu, onLog, onSetSlips }: HabitRowProps) {
  const { colors } = useTheme();
  const { habit, status, count, current_streak, is_skipped, skip_reason, weekly_progress, note } = item;
  const target = item.daily_target || 0;
  const isDone = status === 'done';
  const isAvoid = habit.type === 'avoid_count';
  const isCount = habit.type === 'build_count';
  const dimmed = is_skipped || (isDone && !isAvoid);

  /* ----- Meta line ----- */
  const meta: React.ReactNode[] = [];
  if (is_skipped) {
    meta.push(
      <Text key="skip" variant="caption" tone="subtle" numberOfLines={1}>
        {`Skipped · ${skip_reason || 'Rest'}`}
      </Text>,
    );
  } else {
    if (isCount) {
      meta.push(
        <Text key="count" variant="caption" tone={isDone ? 'success' : 'muted'} weight="medium" tabular>
          {target ? `${count}/${target}` : String(count)}
        </Text>,
      );
    }
    if (isAvoid) {
      meta.push(
        <Text key="avoid" variant="caption" tone={count > 0 ? 'warning' : 'success'} weight="medium">
          {count > 0 ? `${count} slip${count === 1 ? '' : 's'}` : 'Clean'}
        </Text>,
      );
    }
    if (habit.metric_label && (item.metric_total ?? 0) > 0) {
      meta.push(
        <Text key="metric" variant="caption" tone="accent" weight="medium" tabular numberOfLines={1}>
          {`${item.metric_total}${habit.metric_unit ? ` ${habit.metric_unit}` : ''}`}
        </Text>,
      );
    }
    if (current_streak > 0) {
      meta.push(
        <View key="streak" style={styles.metaItem}>
          <Flame size={12} color={colors.p2} />
          <Text variant="caption" tone="muted" tabular>
            {current_streak}
            {item.streak_unit === 'week' ? 'w' : item.streak_unit === 'month' ? 'mo' : ''}
          </Text>
        </View>,
      );
    }
    const schedule = weekly_progress
      ? `${weekly_progress.done_this_week}/${weekly_progress.target} this ${weekly_progress.period ?? 'week'}`
      : describeSchedule(habit.current_schedule);
    if (schedule) {
      meta.push(
        <Text
          key="sched"
          variant="caption"
          tone={weekly_progress?.target_met ? 'success' : 'muted'}
          numberOfLines={1}
        >
          {schedule}
        </Text>,
      );
    }
  }
  if (habit.category) {
    meta.push(
      <Text key="cat" variant="caption" tone="subtle" numberOfLines={1}>
        {habit.category}
      </Text>,
    );
  }

  /* ----- Right-side control ----- */
  let control: React.ReactNode;
  if (is_skipped) {
    control = <Badge label="Skipped" />;
  } else if (habit.type === 'build_yesno') {
    control = (
      <Checkbox
        checked={isDone}
        onChange={onToggle}
        color={habit.color}
        size={28}
        label={isDone ? `Mark ${habit.name} as not done` : `Mark ${habit.name} as done`}
      />
    );
  } else if (isCount) {
    const pct = target ? count / target : count > 0 ? 1 : 0;
    control = (
      <View style={[styles.stepper, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}>
        <IconButton label="Decrease" size={30} disabled={count <= 0} onPress={() => onIncrement(-1)}>
          <Minus size={16} color={count <= 0 ? colors.fgSubtle : colors.fgSoft} />
        </IconButton>
        <ProgressRing value={pct} size={30} stroke={3} color={isDone ? colors.success : habit.color}>
          <Text variant="caption" weight="semibold" tabular style={styles.ringText}>
            {count}
          </Text>
        </ProgressRing>
        <IconButton label="Increase" size={30} onPress={() => onIncrement(1)}>
          <Plus size={16} color={colors.fgSoft} />
        </IconButton>
      </View>
    );
  } else {
    // Cut-back habit: a day can hold several slips, so +/- with a tap-to-type total
    control = (
      <View style={[styles.stepper, { borderColor: colors.lineStrong, backgroundColor: colors.surface }]}>
        <IconButton label="Remove a slip" size={30} disabled={count <= 0} onPress={() => onIncrement(-1)}>
          <Minus size={16} color={count <= 0 ? colors.fgSubtle : colors.fgSoft} />
        </IconButton>
        <Pressable
          onPress={onSetSlips}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={`${count} slip${count === 1 ? '' : 's'}. Set an exact number`}
          style={styles.slipCount}
        >
          <Text weight="semibold" tabular tone={count > 0 ? 'warning' : 'muted'}>
            {count}
          </Text>
        </Pressable>
        <IconButton label="Log a slip" size={30} onPress={() => onIncrement(1)}>
          <Plus size={16} color={colors.fgSoft} />
        </IconButton>
      </View>
    );
  }

  return (
    <Pressable
      onPress={habit.type === 'build_yesno' && !is_skipped ? onToggle : onMenu}
      onLongPress={onMenu}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}${is_skipped ? ', skipped' : isDone ? ', done' : ''}`}
      accessibilityHint="Long press for more actions"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.subtle : colors.surface, borderColor: colors.line },
      ]}
    >
      <View style={{ opacity: dimmed ? 0.6 : 1 }}>
        <HabitTile icon={habit.icon} color={habit.color} size={36} />
      </View>

      <View style={styles.body}>
        <Text numberOfLines={1} weight="medium" tone={dimmed ? 'muted' : 'fg'}>
          {habit.name}
        </Text>
        {meta.length > 0 ? (
          <View style={styles.meta}>
            {meta.map((m, i) => (
              <React.Fragment key={i}>
                {i > 0 ? (
                  <Text variant="caption" tone="subtle">
                    ·
                  </Text>
                ) : null}
                {m}
              </React.Fragment>
            ))}
          </View>
        ) : null}
        {note ? (
          <View style={styles.metaItem}>
            <MessageSquare size={12} color={colors.fgSubtle} />
            <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
              {note}
            </Text>
          </View>
        ) : null}
      </View>

      {habit.metric_label && onLog && !is_skipped ? (
        <IconButton label={`Log ${habit.metric_label}`} size={30} onPress={onLog}>
          <NotebookPen size={17} color={colors.fgMuted} />
        </IconButton>
      ) : null}

      {control}

      <IconButton label={`More actions for ${habit.name}`} size={28} onPress={onMenu}>
        <MoreHorizontal size={18} color={colors.fgMuted} />
      </IconButton>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingLeft: space.md,
    paddingRight: space.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, minWidth: 0, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 5, rowGap: 1 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    padding: 2,
  },
  ringText: { fontSize: 11, lineHeight: 13 },
  slipCount: { minWidth: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});

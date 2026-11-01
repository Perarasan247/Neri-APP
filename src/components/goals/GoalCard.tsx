import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { ArrowUp, Check, CheckSquare, ChevronLeft, ChevronRight, Repeat, Target } from 'lucide-react-native';

import type { Goal, GoalLevel } from '@/api/types';
import { Badge, IconButton, ProgressBar, Text, withAlpha } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { LEVEL_META, periodLabel, relativePeriod, shiftPeriod, snapPeriod, STATUS_META } from '@/lib/goals';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

export const openGoal = (id: string) => router.push({ pathname: '/goal/[id]', params: { id } });

/** Status pill; nothing for active goals unless `showActive`. */
export function GoalStatusBadge({ goal, showActive }: { goal: Pick<Goal, 'status' | 'needs_review'>; showActive?: boolean }) {
  if (goal.status === 'active' && goal.needs_review) return <Badge label="Needs review" tone="warning" dot />;
  if (goal.status === 'active' && !showActive) return null;
  const meta = STATUS_META[goal.status];
  return <Badge label={meta.label} tone={meta.tone} />;
}

/** "↑ Two pointers": the bigger goal this one serves. Tappable when `onPress` is given. */
export function ParentChip({ title, color, onPress }: { title: string; color?: string; onPress?: () => void }) {
  const { colors } = useTheme();
  const tint = color ?? colors.fgMuted;
  const body = (
    <>
      <ArrowUp size={11} color={tint} strokeWidth={2.5} />
      <Text variant="caption" weight="medium" color={colors.fgSoft} numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Text>
    </>
  );
  const style = [styles.parent, { backgroundColor: withAlpha(tint, 0.1) }];
  return onPress ? (
    <Pressable onPress={onPress} hitSlop={4} accessibilityRole="link" accessibilityLabel={`Part of ${title}`} style={style}>
      {body}
    </Pressable>
  ) : (
    <View style={style} accessibilityLabel={`Part of ${title}`}>
      {body}
    </View>
  );
}

/** Goal list card: colour accent, title, parent chip, progress bar + label, status. */
export function GoalCard({ goal, showPeriod, onPress }: { goal: Goal; showPeriod?: boolean; onPress?: () => void }) {
  const { colors } = useTheme();
  const done = goal.status === 'completed';
  const faded = goal.status === 'dropped' || goal.status === 'missed';
  const barColor = done ? colors.success : goal.color;
  const meta: string[] = [];
  if (goal.tasks_total) meta.push(`${goal.tasks_completed}/${goal.tasks_total} tasks`);
  if (goal.habits_count) meta.push(`${goal.habits_count} habit${goal.habits_count === 1 ? '' : 's'}`);
  if (showPeriod) meta.unshift(goal.period_label);

  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        (onPress ?? (() => openGoal(goal.id)))();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}, ${goal.progress_label}, ${STATUS_META[goal.status].label}`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.subtle : colors.surface, borderColor: colors.line, opacity: faded ? 0.72 : 1 },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: goal.color }]} />
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text weight="semibold" numberOfLines={2} style={{ flex: 1 }} strike={goal.status === 'dropped'}>
            {goal.title}
          </Text>
          <GoalStatusBadge goal={goal} />
        </View>
        {goal.parent_title ? <ParentChip title={goal.parent_title} color={goal.color} /> : null}
        <View style={styles.progress}>
          <View style={{ flex: 1 }}>
            <ProgressBar value={goal.progress_pct} color={barColor} />
          </View>
          <Text variant="caption" weight="semibold" tabular tone={done ? 'success' : 'muted'}>
            {goal.progress_label}
          </Text>
        </View>
        {meta.length ? (
          <View style={styles.meta}>
            {goal.tasks_total ? <CheckSquare size={12} color={colors.fgSubtle} /> : goal.habits_count ? <Repeat size={12} color={colors.fgSubtle} /> : null}
            <Text variant="caption" tone="subtle" numberOfLines={1}>
              {meta.join(' · ')}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Goal as a checklist row: tick the squared box to complete (or reopen) it, tap the rest to open it.
 * Rounded-square box in the goal's colour with progress under the title, so it doesn't read as a task.
 */
export function GoalRow({ goal, onToggle, last }: { goal: Goal; onToggle: (goal: Goal) => void; last?: boolean }) {
  const { colors } = useTheme();
  const done = goal.status === 'completed';
  const closed = goal.status === 'dropped' || goal.status === 'missed';
  const tickable = goal.status === 'active' || done;
  const meta: string[] = [];
  if (goal.tasks_total) meta.push(`${goal.tasks_completed}/${goal.tasks_total} tasks`);
  if (goal.habits_count) meta.push(`${goal.habits_count} habit${goal.habits_count === 1 ? '' : 's'}`);

  return (
    <View
      style={[
        styles.row,
        { borderBottomColor: colors.line, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, opacity: closed ? 0.65 : 1 },
      ]}
    >
      <Pressable
        onPress={() => {
          if (done) haptic.tap();
          else haptic.success();
          onToggle(goal);
        }}
        disabled={!tickable}
        hitSlop={10}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled: !tickable }}
        accessibilityLabel={done ? `Reopen ${goal.title}` : `Complete ${goal.title}`}
        style={[
          styles.box,
          {
            borderColor: goal.color,
            backgroundColor: done ? goal.color : withAlpha(goal.color, 0.1),
            opacity: tickable ? 1 : 0.4,
          },
        ]}
      >
        {done ? <Check size={15} color="#fff" strokeWidth={3.5} /> : null}
      </Pressable>
      <Pressable
        onPress={() => {
          haptic.tap();
          openGoal(goal.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${goal.title}, ${goal.progress_label}`}
        style={styles.rowBody}
      >
        <View style={styles.titleRow}>
          <Text weight="semibold" numberOfLines={2} style={{ flex: 1 }} tone={done ? 'muted' : 'fg'} strike={done || goal.status === 'dropped'}>
            {goal.title}
          </Text>
          <GoalStatusBadge goal={goal} />
        </View>
        {goal.parent_title ? <ParentChip title={goal.parent_title} color={goal.color} /> : null}
        {!done ? (
          <View style={styles.progress}>
            <View style={{ width: 84 }}>
              <ProgressBar value={goal.progress_pct} color={goal.color} height={4} />
            </View>
            <Text variant="caption" weight="medium" tabular tone="muted">
              {goal.progress_label}
            </Text>
          </View>
        ) : null}
        {meta.length ? (
          <View style={styles.meta}>
            {goal.tasks_total ? <CheckSquare size={12} color={colors.fgSubtle} /> : <Repeat size={12} color={colors.fgSubtle} />}
            <Text variant="caption" tone="subtle" numberOfLines={1}>
              {meta.join(' · ')}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** Compact tile for horizontal strips (Today): title, mini progress. */
export function GoalTile({ goal, width = 168 }: { goal: Goal; width?: number }) {
  const { colors } = useTheme();
  const done = goal.status === 'completed';
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        openGoal(goal.id);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}, ${goal.progress_label}`}
      style={({ pressed }) => [
        styles.tile,
        { width, backgroundColor: pressed ? colors.subtle : colors.surface, borderColor: colors.line },
      ]}
    >
      <View style={styles.tileTop}>
        <View style={[styles.dot, { backgroundColor: goal.color }]} />
        <Text variant="small" weight="semibold" numberOfLines={2} style={{ flex: 1 }} tone={done ? 'muted' : 'fg'}>
          {goal.title}
        </Text>
      </View>
      <View style={{ gap: 5 }}>
        <ProgressBar value={goal.progress_pct} color={done ? colors.success : goal.color} height={4} />
        <Text variant="caption" tone={done ? 'success' : 'subtle'} tabular numberOfLines={1}>
          {done ? 'Done' : goal.progress_label}
        </Text>
      </View>
    </Pressable>
  );
}

/** ‹ 2–8 Nov 2026 › with a "This week" reset when away from the current period. */
export function PeriodNav({
  level,
  start,
  today,
  onChange,
}: {
  level: GoalLevel;
  start: string;
  today: string;
  /** Called with the new period's first day. */
  onChange: (start: string) => void;
}) {
  const { colors } = useTheme();
  const rel = relativePeriod(level, start, today);
  const isCurrent = rel === `This ${LEVEL_META[level].unit}`;
  return (
    <View style={styles.nav}>
      <IconButton label={`Previous ${LEVEL_META[level].unit}`} size={34} onPress={() => onChange(shiftPeriod(level, start, -1))}>
        <ChevronLeft size={20} color={colors.fgSoft} />
      </IconButton>
      <View style={styles.navLabel}>
        <Text weight="semibold" tabular numberOfLines={1}>
          {periodLabel(level, start)}
        </Text>
        <Text variant="caption" tone={isCurrent ? 'accent' : 'subtle'} numberOfLines={1}>
          {rel ?? ' '}
        </Text>
      </View>
      <IconButton label={`Next ${LEVEL_META[level].unit}`} size={34} onPress={() => onChange(shiftPeriod(level, start, 1))}>
        <ChevronRight size={20} color={colors.fgSoft} />
      </IconButton>
      {!isCurrent ? (
        <Pressable
          onPress={() => {
            haptic.tap();
            onChange(snapPeriod(level, today));
          }}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.reset, { backgroundColor: pressed ? colors.accentSoft : colors.muted }]}
        >
          <Text variant="caption" weight="semibold" tone="accent">
            {`This ${LEVEL_META[level].unit}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small round target glyph in the goal's colour (rows, pickers). */
export function GoalGlyph({ color, size = 28 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: withAlpha(color, 0.14),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Target size={size * 0.56} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  rowBody: { flex: 1, minWidth: 0, gap: 6 },
  box: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  accent: { width: 4 },
  body: { flex: 1, minWidth: 0, padding: space.md, paddingLeft: space.md + 2, gap: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  parent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  progress: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -2 },
  tile: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    gap: space.sm,
    justifyContent: 'space-between',
    minHeight: 92,
  },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  navLabel: { flex: 1, minWidth: 0, alignItems: 'center' },
  reset: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: radius.pill },
});

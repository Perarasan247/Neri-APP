import React from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  ArrowRight,
  Ban,
  Bell,
  CheckCircle2,
  ChevronRight,
  CornerUpRight,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  XCircle,
} from 'lucide-react-native';

import type { GoalDetail, GoalLinkedHabit, GoalLinkedTask } from '@/api/types';
import { GoalCard, GoalStatusBadge, openGoal } from '@/components/goals/GoalCard';
import { carryTarget, useReviewActions } from '@/components/goals/ReviewCard';
import {
  AddCta,
  Button,
  Card,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  Notice,
  ProgressRing,
  Screen,
  SectionHeader,
  Text,
  useToast,
  withAlpha,
} from '@/components/ui';
import { useGoal, useToggleTodo, useUpdateGoal } from '@/hooks/queries';
import { friendlyDate, pluralize, priorityColor, today } from '@/lib/format';
import { LEVEL_META, MEASURE_META, periodLabel, smallerLevel } from '@/lib/goals';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** One goal: progress, checklist, sub-goals, linked tasks and habits, status actions. */
export default function GoalDetailRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useGoal(id);

  if (q.data) return <GoalDetailView goal={q.data} refreshing={q.isRefetching} onRefresh={() => q.refetch()} />;

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: '' }} />
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <EmptyState
          icon={<Target size={24} color={colors.fgSubtle} />}
          title="Goal not found"
          description="It may have been deleted on another device."
          action={<Button title="Go back" onPress={() => router.back()} />}
        />
      )}
    </Screen>
  );
}

function GoalDetailView({ goal, refreshing, onRefresh }: { goal: GoalDetail; refreshing: boolean; onRefresh: () => void }) {
  const { colors } = useTheme();
  const toast = useToast();
  const update = useUpdateGoal();
  const review = useReviewActions();
  const ref = today();

  const onError = (e: Error) => toast(e.message, { tone: 'danger' });
  const patch = (p: Parameters<typeof update.mutate>[0]['patch'], success?: string) =>
    update.mutate({ id: goal.id, patch: p }, { onSuccess: success ? () => toast(success) : undefined, onError });

  const active = goal.status === 'active';
  const done = goal.status === 'completed';
  const unit = LEVEL_META[goal.level].unit;
  const child = smallerLevel(goal.level);
  const canCarry = goal.status !== 'completed' && !goal.carried_to_id && (goal.needs_review || goal.status === 'missed');
  const ringColor = done ? colors.success : goal.color;

  const addSubGoal = () =>
    child &&
    router.push({
      pathname: '/goal/new',
      params: {
        level: child,
        parent: goal.id,
        // Inside the current period start from today, otherwise from the period's first day
        period: goal.is_current ? ref : goal.period_start,
      },
    });

  return (
    <Screen safeTop={false} onRefresh={onRefresh} refreshing={refreshing}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton label="Edit goal" onPress={() => router.push({ pathname: '/goal/[id]/edit', params: { id: goal.id } })}>
              <Pencil size={19} color={colors.fgSoft} />
            </IconButton>
          ),
        }}
      />

      {/* Breadcrumb: the bigger goals this one serves */}
      {goal.ancestors.length ? (
        <View style={styles.crumbs}>
          {goal.ancestors.map((a) => (
            <React.Fragment key={a.id}>
              <Pressable onPress={() => openGoal(a.id)} hitSlop={6} accessibilityRole="link" style={styles.crumb}>
                <View style={[styles.crumbDot, { backgroundColor: a.color }]} />
                <Text variant="caption" weight="medium" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {a.title}
                </Text>
              </Pressable>
              <ChevronRight size={12} color={colors.fgSubtle} />
            </React.Fragment>
          ))}
        </View>
      ) : null}

      {/* Title */}
      <View style={styles.head}>
        <View style={styles.headMeta}>
          <View style={[styles.levelPill, { backgroundColor: withAlpha(goal.color, 0.14) }]}>
            <Target size={12} color={goal.color} />
            <Text variant="caption" weight="semibold" color={goal.color}>
              {LEVEL_META[goal.level].label}
            </Text>
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
            {goal.period_label}
          </Text>
          <GoalStatusBadge goal={goal} showActive={false} />
        </View>
        <Text variant="heading" strike={goal.status === 'dropped'}>
          {goal.title}
        </Text>
        {goal.description ? (
          <Text tone="soft" style={{ marginTop: space.xs }}>
            {goal.description}
          </Text>
        ) : null}
      </View>

      {/* Progress */}
      <Card padded style={styles.card}>
        <View style={styles.progressRow}>
          <ProgressRing value={goal.progress_pct / 100} size={64} stroke={6} color={ringColor}>
            <Text variant="small" weight="bold" tabular>
              {`${Math.round(goal.progress_pct)}%`}
            </Text>
          </ProgressRing>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="title" tabular>
              {goal.progress_label}
            </Text>
            <Text variant="caption" tone="muted">
              {goal.measure === 'target'
                ? `Counted by hand${goal.tasks_completed ? ` plus ${pluralize(goal.tasks_completed, 'completed task')}` : ''}`
                : goal.measure === 'checklist'
                  ? MEASURE_META.checklist.label
                  : goal.children_total
                    ? 'From sub-goals'
                    : goal.tasks_total
                      ? 'From linked tasks'
                      : 'Tick it off when it’s done'}
            </Text>
          </View>
          {goal.measure === 'target' ? (
            <View style={styles.counter}>
              <IconButton
                label="Decrease progress"
                size={36}
                disabled={goal.manual_progress <= 0}
                onPress={() => patch({ manual_progress: Math.max(0, goal.manual_progress - 1) })}
                style={{ backgroundColor: colors.muted }}
              >
                <Minus size={18} color={goal.manual_progress <= 0 ? colors.fgSubtle : colors.fgSoft} />
              </IconButton>
              <IconButton
                label="Increase progress"
                size={36}
                onPress={() => {
                  if (goal.progress_value + 1 === goal.progress_total) haptic.success();
                  patch({ manual_progress: goal.manual_progress + 1 });
                }}
                style={{ backgroundColor: withAlpha(goal.color, 0.16) }}
              >
                <Plus size={18} color={goal.color} />
              </IconButton>
            </View>
          ) : null}
        </View>
      </Card>

      {/* Period over */}
      {canCarry || goal.carried_to_id || goal.carried_from_id ? (
        <View style={[styles.card, { gap: space.sm }]}>
          {canCarry ? (
            <Notice
              tone="warning"
              action={
                <Button
                  title="Carry over"
                  size="sm"
                  variant="primary"
                  disabled={review.busy}
                  onPress={() => review.carry(goal, ref)}
                />
              }
            >
              {`This ${unit} is over. Carry what's left into ${periodLabel(goal.level, carryTarget(goal, ref))}; open tasks move with it.`}
            </Notice>
          ) : null}
          {goal.carried_to_id ? (
            <LinkRow icon={<ArrowRight size={16} color={colors.fgMuted} />} label="Carried over to a later period" id={goal.carried_to_id} />
          ) : null}
          {goal.carried_from_id ? (
            <LinkRow
              icon={<CornerUpRight size={16} color={colors.fgMuted} />}
              label={`Carried over from an earlier ${unit}`}
              id={goal.carried_from_id}
            />
          ) : null}
        </View>
      ) : null}

      {/* Checklist */}
      {goal.measure === 'checklist' ? (
        <Section title="Checklist" count={goal.progress_label}>
          {goal.checklist.length ? (
            <Card>
              {goal.checklist.map((item, i) => (
                <View key={item.id ?? i}>
                  {i > 0 ? <Divider inset={48} /> : null}
                  <Pressable
                    onPress={() =>
                      patch({ checklist: goal.checklist.map((x, j) => (j === i ? { ...x, completed: !x.completed } : x)) })
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.completed }}
                    style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.subtle }]}
                  >
                    <Checkbox
                      checked={item.completed}
                      color={goal.color}
                      label={item.title}
                      onChange={() =>
                        patch({ checklist: goal.checklist.map((x, j) => (j === i ? { ...x, completed: !x.completed } : x)) })
                      }
                    />
                    <Text style={{ flex: 1 }} tone={item.completed ? 'subtle' : 'fg'} strike={item.completed}>
                      {item.title}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <AddCta label="Add checklist items" onPress={() => router.push({ pathname: '/goal/[id]/edit', params: { id: goal.id } })} />
          )}
        </Section>
      ) : null}

      {/* Sub-goals */}
      {child ? (
        <Section title="Sub-goals" count={goal.children.length ? `${goal.children_completed}/${goal.children_total}` : undefined}>
          <View style={{ gap: space.sm }}>
            {goal.children.map((c) => (
              <GoalCard key={c.id} goal={c} showPeriod />
            ))}
            <AddCta
              label={`Add a ${LEVEL_META[child].label.toLowerCase()} goal`}
              hint={goal.children.length ? undefined : `Break this ${unit} into ${LEVEL_META[child].unit}ly steps`}
              onPress={addSubGoal}
            />
          </View>
        </Section>
      ) : null}

      {/* Tasks */}
      <Section title="Tasks" count={goal.tasks.length ? `${goal.tasks_completed}/${goal.tasks_total}` : undefined}>
        <View style={{ gap: space.sm }}>
          {goal.tasks.length ? (
            <Card>
              {goal.tasks.map((t, i) => (
                <View key={t.id}>
                  {i > 0 ? <Divider inset={48} /> : null}
                  <LinkedTaskRow task={t} />
                </View>
              ))}
            </Card>
          ) : null}
          <AddCta
            label="Add a task"
            hint={goal.tasks.length ? undefined : 'Tasks you link here count towards this goal'}
            onPress={() => router.push({ pathname: '/task/new', params: { goal: goal.id } })}
          />
        </View>
      </Section>

      {/* Habits */}
      {goal.habits.length ? (
        <Section title="Habits">
          <Card>
            {goal.habits.map((h, i) => (
              <View key={h.id}>
                {i > 0 ? <Divider inset={48} /> : null}
                <LinkedHabitRow habit={h} unit={unit} />
              </View>
            ))}
          </Card>
        </Section>
      ) : null}

      {/* Settings */}
      <Card style={styles.card}>
        <View style={styles.listRow}>
          <Bell size={18} color={colors.fgMuted} style={{ width: 24 }} />
          <View style={{ flex: 1 }}>
            <Text>Ask me when tasks finish</Text>
            <Text variant="caption" tone="muted">
              {goal.level === 'weekly' ? 'After each linked task' : 'When the last open task is done or the target is hit'}
            </Text>
          </View>
          <Switch
            value={goal.ask_on_task_complete}
            onValueChange={(v) => patch({ ask_on_task_complete: v })}
            trackColor={{ true: colors.accent, false: colors.mutedStrong }}
            thumbColor="#ffffff"
            accessibilityLabel="Ask me when tasks finish"
          />
        </View>
      </Card>

      {/* Status */}
      <View style={styles.actions}>
        {active ? (
          <>
            <Button
              title="Complete goal"
              variant="primary"
              size="lg"
              block
              icon={<CheckCircle2 size={18} color={colors.accentFg} />}
              onPress={() => {
                haptic.success();
                patch({ status: 'completed' }, 'Goal completed');
              }}
            />
            <View style={styles.actionRow}>
              <Button
                title="Mark missed"
                style={{ flex: 1 }}
                icon={<XCircle size={16} color={colors.fgSoft} />}
                onPress={() => patch({ status: 'missed' }, 'Marked as missed')}
              />
              <Button
                title="Drop"
                style={{ flex: 1 }}
                icon={<Ban size={16} color={colors.fgSoft} />}
                onPress={() => patch({ status: 'dropped' }, 'Goal dropped')}
              />
            </View>
          </>
        ) : (
          <Button
            title="Reopen goal"
            size="lg"
            block
            icon={<RotateCcw size={18} color={colors.fgSoft} />}
            onPress={() => patch({ status: 'active' }, 'Goal reopened')}
          />
        )}
      </View>
    </Screen>
  );
}

function Section({ title, count, children }: { title: string; count?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} count={count} />
      {children}
    </View>
  );
}

function LinkRow({ icon, label, id }: { icon: React.ReactNode; label: string; id: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => openGoal(id)}
      accessibilityRole="link"
      style={({ pressed }) => [styles.linkRow, { backgroundColor: pressed ? colors.muted : colors.surface, borderColor: colors.line }]}
    >
      {icon}
      <Text variant="small" tone="soft" style={{ flex: 1 }}>
        {label}
      </Text>
      <ChevronRight size={16} color={colors.fgSubtle} />
    </Pressable>
  );
}

function LinkedTaskRow({ task }: { task: GoalLinkedTask }) {
  const { colors } = useTheme();
  const toast = useToast();
  const toggle = useToggleTodo();
  const done = task.status === 'completed';
  const ref = today();
  const overdue = !done && !!task.due_date && task.due_date < ref;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${task.title}${done ? ', completed' : ''}`}
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.subtle }]}
    >
      <Checkbox
        checked={done}
        color={priorityColor(task.priority, colors)}
        label={done ? 'Mark task as not done' : 'Complete task'}
        onChange={() => toggle.mutate(task.id, { onError: (e) => toast(e.message, { tone: 'danger' }) })}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} tone={done ? 'subtle' : 'fg'} strike={done}>
          {task.title}
        </Text>
        {task.due_date ? (
          <Text variant="caption" color={overdue ? colors.danger : colors.fgMuted}>
            {friendlyDate(task.due_date, ref)}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.fgSubtle} />
    </Pressable>
  );
}

function LinkedHabitRow({ habit, unit }: { habit: GoalLinkedHabit; unit: string }) {
  const { colors } = useTheme();
  const avoid = habit.type === 'avoid_count';
  const detail = avoid
    ? `${pluralize(habit.days_done, 'clean day')} · ${pluralize(habit.slips, 'slip')}`
    : `${pluralize(habit.days_done, 'day')} this ${unit}`;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/habit/[id]', params: { id: habit.id } })}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: colors.subtle }]}
    >
      <View style={[styles.habitDot, { backgroundColor: withAlpha(habit.color, 0.16) }]}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: habit.color }} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} tone={habit.status === 'archived' ? 'muted' : 'fg'}>
          {habit.name}
        </Text>
        <Text variant="caption" tone={avoid && habit.slips > 0 ? 'warning' : 'muted'}>
          {habit.status === 'archived' ? `${detail} · archived` : detail}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.fgSubtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.xs, marginBottom: space.sm },
  crumb: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 200 },
  crumbDot: { width: 7, height: 7, borderRadius: 4 },
  head: { gap: space.xs },
  headMeta: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginBottom: 2 },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  card: { marginTop: space.lg },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  counter: { flexDirection: 'row', gap: space.sm },
  section: { marginTop: space.xl, gap: space.xs },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 52, paddingHorizontal: space.md, paddingVertical: space.sm },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  habitDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  actions: { marginTop: space.xxl, gap: space.sm },
  actionRow: { flexDirection: 'row', gap: space.sm },
});

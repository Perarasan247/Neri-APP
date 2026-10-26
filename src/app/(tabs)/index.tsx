import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Archive,
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Coffee,
  MessageSquare,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Repeat,
  Sprout,
  Trash2,
  Undo2,
} from 'lucide-react-native';

import type { TodayItem } from '@/api/types';
import { TaskRow } from '@/components/tasks/TaskRow';
import { useDayPicker } from '@/components/today/DayPicker';
import { HabitRow } from '@/components/today/HabitRow';
import { NoteSheet } from '@/components/today/NoteSheet';
import { SkipSheet } from '@/components/today/SkipSheet';
import { SummaryCard } from '@/components/today/SummaryCard';
import { ValueSheet } from '@/components/today/ValueSheet';
import {
  ActionSheet,
  AddCta,
  Button,
  EmptyState,
  ErrorState,
  Fab,
  IconButton,
  ListSkeleton,
  Notice,
  Screen,
  SectionHeader,
  Skeleton,
  Text,
  useDisclosure,
  useDialog,
  useToast,
  type MenuOption,
} from '@/components/ui';
import {
  useAddValue,
  useDeleteHabit,
  useIncrementHabit,
  useRestDay,
  useToday,
  useTodos,
  useToggleHabit,
  useUpdateTodo,
  useUpsertLog,
} from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { addDays, friendlyDate, longDate, pluralize, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type SkipState = { scope: 'day' } | { scope: 'habit'; item: TodayItem };

/** Today tab: day summary, habits to log and tasks due on the viewed day. */
export default function TodayScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const dialog = useDialog();

  // undefined = follow "today" (in the user's timezone)
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const todayQ = useToday(selected);
  const data = todayQ.data;
  const realToday = today();
  const viewDate = data?.date ?? selected ?? realToday;
  const isToday = data ? data.is_today : !selected || selected === realToday;

  const dueQ = useTodos({ start_date: viewDate, end_date: viewDate, sort_by: 'smart' });
  const overdueQ = useTodos({ view: 'overdue', sort_by: 'smart' }, isToday);

  const toggleHabit = useToggleHabit();
  const incrementHabit = useIncrementHabit();
  const upsertLog = useUpsertLog();
  const addValue = useAddValue();
  const restDay = useRestDay();
  const deleteHabit = useDeleteHabit();
  const updateTodo = useUpdateTodo();

  const addMenu = useDisclosure();
  const [refreshing, setRefreshing] = useState(false);
  const [menu, setMenu] = useState<'day' | TodayItem | null>(null);
  const [skip, setSkip] = useState<SkipState | null>(null);
  const [noteItem, setNoteItem] = useState<TodayItem | null>(null);
  const [valueItem, setValueItem] = useState<TodayItem | null>(null);

  const onError = (e: Error) => toast(e.message, { tone: 'danger' });

  /* ----- Day navigation ----- */
  const goTo = (date: string) => {
    haptic.tap();
    setSelected(date >= realToday ? undefined : date);
  };
  const picker = useDayPicker({
    value: viewDate,
    max: realToday,
    min: data?.tracking_start_date,
    onPick: goTo,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([todayQ.refetch(), dueQ.refetch(), isToday ? overdueQ.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  };

  /* ----- Habit actions ----- */
  const handleToggle = (item: TodayItem) => {
    const done = item.status !== 'done';
    if (done) haptic.success();
    toggleHabit.mutate({ habitId: item.habit.id, date: viewDate, done }, { onError });
  };

  const handleIncrement = (item: TodayItem, delta: number) => {
    const target = item.daily_target || 0;
    if (item.habit.type === 'build_count' && delta > 0 && target && item.count + delta === target) haptic.success();
    else haptic.tap();
    incrementHabit.mutate({ habitId: item.habit.id, date: viewDate, delta }, { onError });
  };

  const handleSaveValue = (value: number) => {
    if (!valueItem) return;
    if (valueItem.status !== 'done') haptic.success();
    addValue.mutate(
      { habitId: valueItem.habit.id, date: viewDate, value },
      {
        onSuccess: () => {
          setValueItem(null);
          toast('Logged', { tone: 'success' });
        },
        onError,
      },
    );
  };

  const handleSaveNote = (note: string) => {
    if (!noteItem) return;
    const skipped = noteItem.skip_scope === 'habit';
    // Keep the log's count and status (web parity). A yes/no note implies a log row, so count ≥ 1.
    const count = skipped || noteItem.habit.type !== 'build_yesno' ? noteItem.count : noteItem.count || 1;
    upsertLog.mutate(
      { habit_id: noteItem.habit.id, log_date: viewDate, count, status: skipped ? 'skipped' : 'done', note },
      {
        onSuccess: () => {
          setNoteItem(null);
          toast('Note saved', { tone: 'success' });
        },
        onError,
      },
    );
  };

  const handleConfirmSkip = (reason: string) => {
    if (!skip) return;
    const done = { onSuccess: () => setSkip(null), onError };
    if (skip.scope === 'day') {
      restDay.mutate({ date: viewDate, on: true, reason }, done);
    } else {
      upsertLog.mutate(
        { habit_id: skip.item.habit.id, log_date: viewDate, count: 0, status: 'skipped', note: reason },
        done,
      );
    }
  };

  const removeRestDay = () => restDay.mutate({ date: viewDate, on: false }, { onError });

  const confirmDelete = (item: TodayItem) => {
    const { habit } = item;
    dialog.alert(`Remove “${habit.name}”?`, 'Archive stops tracking from today and keeps its history. Deleting erases every past log.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive (keep data)',
        onPress: () =>
          deleteHabit.mutate(
            { id: habit.id, keepData: true },
            { onSuccess: () => toast(`${habit.name} archived`), onError },
          ),
      },
      {
        text: 'Delete permanently',
        style: 'destructive',
        onPress: () =>
          dialog.alert('Delete permanently?', `“${habit.name}” and all of its history will be erased. This can’t be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete forever',
              style: 'destructive',
              onPress: () =>
                deleteHabit.mutate(
                  { id: habit.id, keepData: false },
                  { onSuccess: () => toast(`${habit.name} deleted`), onError },
                ),
            },
          ]),
      },
    ]);
  };

  const habitMenu = (item: TodayItem): MenuOption[] => {
    const icon = (I: typeof Pencil, color = colors.fgMuted) => <I size={18} color={color} />;
    const opts: MenuOption[] = [];
    if (item.habit.metric_label && !item.is_skipped) {
      opts.push({ label: `Log ${item.habit.metric_label.toLowerCase()}`, icon: icon(NotebookPen), onPress: () => setValueItem(item) });
    }
    if (item.habit.type === 'avoid_count' && item.count > 0 && !item.is_skipped) {
      opts.push({ label: 'Log another slip', icon: icon(Plus), onPress: () => handleIncrement(item, 1) });
    }
    // A note on a clean avoid day keeps it clean: the log stays at 0 slips
    opts.push({ label: item.note ? 'Edit note' : 'Add note', icon: icon(MessageSquare), onPress: () => setNoteItem(item) });
    if (item.skip_scope !== 'day') {
      opts.push({
        label: item.is_skipped ? 'Change skip reason' : 'Skip today',
        icon: icon(Coffee),
        onPress: () => setSkip({ scope: 'habit', item }),
      });
    }
    opts.push(
      {
        label: 'View insights',
        icon: icon(BarChart3),
        onPress: () => router.push({ pathname: '/habit/[id]', params: { id: item.habit.id } }),
      },
      {
        label: 'Edit habit',
        icon: icon(Pencil),
        onPress: () => router.push({ pathname: '/habit/[id]/edit', params: { id: item.habit.id } }),
      },
      { label: 'Delete habit', icon: icon(Trash2, colors.danger), destructive: true, onPress: () => confirmDelete(item) },
    );
    return opts;
  };

  const dayMenu: MenuOption[] = [
    data?.is_whole_day_skip
      ? { label: 'Remove rest day', icon: <Undo2 size={18} color={colors.fgMuted} />, onPress: removeRestDay }
      : { label: 'Take rest day', icon: <Coffee size={18} color={colors.fgMuted} />, onPress: () => setSkip({ scope: 'day' }) },
    ...(!isToday
      ? [{ label: 'Back to today', icon: <CalendarDays size={18} color={colors.fgMuted} />, onPress: () => goTo(realToday) }]
      : []),
  ];

  /* ----- Tasks ----- */
  const todos = dueQ.data ?? [];
  const pendingTodos = todos.filter((t) => t.status !== 'completed');
  const doneTodos = todos.filter((t) => t.status === 'completed');
  const openOverdue = isToday ? (overdueQ.data ?? []).filter((t) => t.status !== 'completed') : [];

  const reschedule = () => {
    dialog.alert(
      'Reschedule overdue tasks?',
      `Move ${pluralize(openOverdue.length, 'task')} to ${friendlyDate(viewDate, realToday).toLowerCase()}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reschedule',
          onPress: () => {
            haptic.success();
            for (const t of openOverdue) updateTodo.mutate({ id: t.id, patch: { due_date: viewDate } }, { onError });
            toast(`${pluralize(openOverdue.length, 'task')} rescheduled`);
          },
        },
      ],
    );
  };

  /* ----- Header ----- */
  const title = isToday ? 'Today' : friendlyDate(viewDate, realToday);
  const subtitle = (
    <View style={styles.dayNav}>
      <IconButton label="Previous day" size={28} onPress={() => goTo(addDays(viewDate, -1))}>
        <ChevronLeft size={18} color={colors.fgMuted} />
      </IconButton>
      <Text variant="small" tone="muted" tabular numberOfLines={1} style={{ flexShrink: 1 }}>
        {longDate(viewDate)}
      </Text>
      <IconButton
        label={isToday ? 'Future days are locked' : 'Next day'}
        size={28}
        disabled={isToday}
        onPress={() => goTo(addDays(viewDate, 1))}
      >
        <ChevronRight size={18} color={isToday ? colors.line : colors.fgMuted} />
      </IconButton>
      {!isToday ? (
        <Pressable
          onPress={() => goTo(realToday)}
          accessibilityRole="button"
          hitSlop={6}
          style={({ pressed }) => [styles.todayPill, { backgroundColor: pressed ? colors.accentSoft : colors.muted }]}
        >
          <Text variant="caption" weight="semibold" tone="accent">
            Back to today
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
  const actions = (
    <>
      <IconButton label="Go to date" onPress={picker.open}>
        <CalendarDays size={21} color={colors.fgSoft} />
      </IconButton>
      <IconButton label="Day options" onPress={() => setMenu('day')}>
        <MoreHorizontal size={22} color={colors.fgSoft} />
      </IconButton>
    </>
  );

  /* ----- Body ----- */
  let body: React.ReactNode;
  if (todayQ.isPending) {
    body = (
      <View style={{ gap: space.lg }}>
        <Skeleton height={92} style={{ borderRadius: radius.lg }} />
        <ListSkeleton rows={5} />
      </View>
    );
  } else if (todayQ.error || !data) {
    body = <ErrorState error={todayQ.error} onRetry={() => todayQ.refetch()} />;
  } else {
    // To do first, then finished, then "cut back" habits that are just on track, then skipped
    const rank = (i: TodayItem) =>
      i.is_skipped ? 3 : i.status !== 'done' ? 0 : i.habit.type === 'avoid_count' ? 2 : 1;
    // The server only returns habits due on this day
    const habitItems = [...data.items].sort((a, b) => rank(a) - rank(b));
    const nothingAtAll = data.items.length === 0 && todos.length === 0 && openOverdue.length === 0 && !dueQ.isPending;

    body = (
      <View style={{ gap: space.lg }}>
        <SummaryCard
          isToday={data.is_today}
          isRestDay={data.is_whole_day_skip}
          completionRate={data.completion_rate}
          done={data.total_done_today}
          due={data.total_due_today}
          overallStreak={data.overall_streak}
          tasksDone={doneTodos.length}
          tasksTotal={todos.length}
          tasksOverdue={openOverdue.length}
        />

        {data.is_whole_day_skip ? (
          <Notice
            tone="warning"
            icon={<Coffee size={16} color={colors.warning} />}
            action={
              <Pressable onPress={removeRestDay} hitSlop={8} accessibilityRole="button">
                <Text variant="small" weight="bold" tone="warning">
                  Undo
                </Text>
              </Pressable>
            }
          >
            <Text variant="small" color={colors.warning}>
              <Text variant="small" weight="semibold" color={colors.warning}>
                Rest day
              </Text>
              {`${data.whole_day_skip_reason ? ` · ${data.whole_day_skip_reason}` : ''} — nothing ${
                data.is_today ? 'today' : 'this day'
              } counts against you or breaks a streak.`}
            </Text>
          </Notice>
        ) : null}

        {nothingAtAll ? (
          <EmptyState
            icon={<Sprout size={24} color={colors.fgSubtle} />}
            title={data.is_today ? 'A fresh start' : 'Nothing scheduled'}
            description="Habits you schedule for this day and tasks due on it will show up here."
            action={
              <View style={styles.emptyActions}>
                <Button
                  title="New habit"
                  variant="primary"
                  icon={<Plus size={16} color={colors.accentFg} />}
                  onPress={() => router.push('/habit/new')}
                />
                <Button
                  title="New task"
                  variant="primary"
                  icon={<Plus size={16} color={colors.accentFg} />}
                  onPress={openNewTask}
                />
              </View>
            }
          />
        ) : (
          <>
            {/* Habits */}
            <View style={styles.section}>
              <SectionHeader
                title="Habits"
                count={data.total_due_today > 0 ? `${data.total_done_today}/${data.total_due_today}` : undefined}
              />
              {habitItems.map((item) => (
                <HabitRow
                  key={item.habit.id}
                  item={item}
                  onToggle={() => handleToggle(item)}
                  onIncrement={(d) => handleIncrement(item, d)}
                  onLog={item.habit.metric_label ? () => setValueItem(item) : undefined}
                  onMenu={() => {
                    haptic.light();
                    setMenu(item);
                  }}
                />
              ))}
              <AddCta label="Add a habit" onPress={() => router.push('/habit/new')} style={styles.cta} />
            </View>

            {/* Overdue tasks (only when viewing today) */}
            {openOverdue.length > 0 ? (
              <View style={styles.section}>
                <SectionHeader
                  title="Overdue"
                  count={openOverdue.length}
                  tone="danger"
                  action={{ label: 'Reschedule', onPress: reschedule }}
                />
                {openOverdue.map((t) => (
                  <TaskRow key={t.id} todo={t} />
                ))}
              </View>
            ) : null}

            {/* Tasks due on the viewed day */}
            <View style={styles.section}>
              <SectionHeader
                title={`${longDate(viewDate)}${data.is_today ? ' · Today' : ''}`}
                tone="muted"
                count={todos.length ? `${doneTodos.length}/${todos.length}` : undefined}
              />
              {dueQ.isPending ? (
                <ListSkeleton rows={2} />
              ) : dueQ.error ? (
                <ErrorState error={dueQ.error} onRetry={() => dueQ.refetch()} style={{ paddingVertical: space.xl }} />
              ) : todos.length === 0 ? (
                <AddCta
                  label="Add a task"
                  hint={`No tasks due ${data.is_today ? 'today' : 'this day'}`}
                  onPress={openNewTask}
                />
              ) : (
                <>
                  {pendingTodos.map((t) => (
                    <TaskRow key={t.id} todo={t} hideDate />
                  ))}
                  {doneTodos.map((t) => (
                    <View key={t.id} style={{ opacity: 0.6 }}>
                      <TaskRow todo={t} hideDate />
                    </View>
                  ))}
                  <AddCta label="Add a task" onPress={openNewTask} style={styles.cta} />
                </>
              )}
            </View>
          </>
        )}
      </View>
    );
  }

  function openNewTask() {
    if (isToday) router.push('/task/new');
    else router.push({ pathname: '/task/new', params: { date: viewDate } });
  }

  const addOptions: MenuOption[] = [
    { label: 'New task', icon: <CheckSquare size={18} color={colors.accent} />, onPress: openNewTask },
    { label: 'New habit', icon: <Repeat size={18} color={colors.accent} />, onPress: () => router.push('/habit/new') },
  ];

  const menuItem = menu && menu !== 'day' ? menu : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      <Screen title={title} subtitle={subtitle} actions={actions} onRefresh={onRefresh} refreshing={refreshing} fabSpace>
        {body}
      </Screen>

      <Fab label="Add" onPress={addMenu.show} />

      <ActionSheet visible={addMenu.open} onClose={addMenu.hide} title="Add" options={addOptions} />

      <ActionSheet
        visible={menu !== null}
        onClose={() => setMenu(null)}
        title={menuItem ? menuItem.habit.name : longDate(viewDate)}
        options={menuItem ? habitMenu(menuItem) : dayMenu}
      />

      <SkipSheet
        visible={skip !== null}
        onClose={() => setSkip(null)}
        scope={skip?.scope ?? 'day'}
        habitName={skip?.scope === 'habit' ? skip.item.habit.name : undefined}
        initialReason={skip?.scope === 'habit' && skip.item.skip_scope === 'habit' ? skip.item.skip_reason : undefined}
        date={viewDate}
        loading={restDay.isPending || upsertLog.isPending}
        onConfirm={handleConfirmSkip}
      />

      <ValueSheet
        visible={valueItem !== null}
        onClose={() => setValueItem(null)}
        habitName={valueItem?.habit.name}
        label={valueItem?.habit.metric_label}
        unit={valueItem?.habit.metric_unit}
        total={valueItem?.metric_total}
        loading={addValue.isPending}
        onSave={handleSaveValue}
      />

      <NoteSheet
        visible={noteItem !== null}
        onClose={() => setNoteItem(null)}
        habitName={noteItem?.habit.name}
        initialNote={noteItem?.note}
        loading={upsertLog.isPending}
        onSave={handleSaveNote}
      />

      {picker.element}
    </View>
  );
}

const styles = StyleSheet.create({
  dayNav: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2, marginLeft: -6 },
  todayPill: { marginLeft: space.xs, paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  section: { gap: space.sm },
  cta: { marginTop: space.xs },
  emptyActions: { flexDirection: 'row', gap: space.sm },
});

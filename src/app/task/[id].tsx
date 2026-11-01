import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Calendar,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Hash,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Palette,
  Repeat as RepeatIcon,
  RotateCcw,
  Sun,
  Target,
  Timer,
  Trash2,
} from 'lucide-react-native';

import type { Repeat, RepeatScope, Todo } from '@/api/types';
import {
  ActionSheet,
  Button,
  Card,
  Checkbox,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  ListSkeleton,
  requestReveal,
  Screen,
  Text,
  useDisclosure,
  useDialog,
  useToast,
  type MenuOption,
} from '@/components/ui';
import { GoalPickerSheet, useLinkableGoals } from '@/components/goals/GoalPickerSheet';
import { CategoryPicker } from '@/components/tasks/CategoryPicker';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { RepeatSheet } from '@/components/tasks/RepeatSheet';
import { SubtaskList, SubtaskProgress } from '@/components/tasks/SubtaskList';
import { afterSheet, collectCategories, PriorityFlag, priorityMenu, quickDates } from '@/components/tasks/taskOptions';
import { useCachedTodo, useDeleteTodo, useTodos, useToggleTodo, useUpdateSubtasks, useUpdateTodo } from '@/hooks/queries';
import { formatTime, friendlyDate, getAppTimeZone, longDate, PRIORITY_META, priorityColor, today } from '@/lib/format';
import { describeRepeat } from '@/lib/repeat';
import { useTheme } from '@/theme/ThemeProvider';
import { font, PRESET_COLORS, radius, space } from '@/theme/tokens';

/** Task detail: loads from any cached list first, then the full task list. */
export default function TaskDetailRoute() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const cached = useCachedTodo(id);
  // Subscribing to the full list keeps this screen live with optimistic updates
  const all = useTodos({});
  const todo = all.data?.find((t) => t.id === id) ?? cached;

  if (todo) return <TaskDetail key={todo.id} todo={todo} />;

  return (
    <Screen safeTop={false}>
      <Stack.Screen options={{ title: '' }} />
      {all.isPending ? (
        <ListSkeleton rows={4} />
      ) : all.error ? (
        <ErrorState error={all.error} onRetry={() => all.refetch()} />
      ) : (
        <EmptyState
          icon={<ListChecks size={24} color={colors.fgSubtle} />}
          title="Task not found"
          description="It may have been deleted on another device."
          action={<Button title="Go back" onPress={() => router.back()} />}
        />
      )}
    </Screen>
  );
}

function stamp(iso?: string | null): string {
  if (!iso) return '';
  // Offset-aware timestamps are shown in the app timezone; naive ones (server wall time) as-is
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: /(?:[zZ]|[+-]\d\d:?\d\d)$/.test(iso) ? getAppTimeZone() : undefined,
  });
}

function TaskDetail({ todo }: { todo: Todo }) {
  const { colors } = useTheme();
  const toast = useToast();
  const dialog = useDialog();
  const pickers = usePickers();
  const update = useUpdateTodo();
  const updateSubtasks = useUpdateSubtasks();
  const toggle = useToggleTodo();
  const remove = useDeleteTodo();
  const all = useTodos({});

  const [title, setTitle] = useState(todo.title);
  const [description, setDescription] = useState(todo.description ?? '');
  const [location, setLocation] = useState(todo.location ?? '');

  const menu = useDisclosure();
  const dateSheet = useDisclosure();
  const prioritySheet = useDisclosure();
  const categorySheet = useDisclosure();
  const repeatSheet = useDisclosure();
  const deleteSheet = useDisclosure();
  const goalSheet = useDisclosure();
  const goals = useLinkableGoals(todo.goal_id);

  const ref = today();
  const done = todo.status === 'completed';
  const pColor = priorityColor(todo.priority, colors);
  const start = todo.start_time || todo.due_time || '';
  const end = todo.end_time || '';
  const categories = collectCategories(all.data, true);

  const onError = (e: Error) => toast(e.message, { tone: 'danger' });

  // Series tasks: ask "this task / this and following" once per screen session, then reuse the answer
  const editScope = useRef<'this' | 'future' | null>(null);
  const asking = useRef(false);
  const inSeries = !!todo.series_id;

  const askScope = (onScope: (scope: 'this' | 'future') => void, onCancel?: () => void) => {
    if (!inSeries) return onScope('this');
    if (editScope.current) return onScope(editScope.current);
    if (asking.current) return;
    asking.current = true;
    const answer = (scope: 'this' | 'future' | null) => () => {
      if (!asking.current) return; // a dismiss callback firing after a button press
      asking.current = false;
      if (!scope) return onCancel?.();
      editScope.current = scope;
      onScope(scope);
    };
    dialog.alert(
      'Edit repeating task',
      undefined,
      [
        { text: 'This task only', onPress: answer('this') },
        { text: 'This and following tasks', onPress: answer('future') },
        { text: 'Cancel', style: 'cancel', onPress: answer(null) },
      ],
      { cancelable: true, onDismiss: answer(null) },
    );
  };

  /** Field edits (title, time, priority…): scoped for series tasks. `revert` undoes the local text on Cancel. */
  const save = (patch: Partial<Todo>, revert?: () => void) =>
    askScope((scope) => update.mutate({ id: todo.id, patch, scope }, { onError }), revert);
  /** Moving the date only ever moves this occurrence; the server's 409 message is shown as a toast. */
  const saveDate = (due_date: string) => update.mutate({ id: todo.id, patch: { due_date }, scope: 'this' }, { onError });

  const changeRepeat = (next: Repeat | null) => {
    if (!next) {
      if (!inSeries) return;
      dialog.alert('Stop repeating?', 'Later occurrences of this task will be deleted. This task is kept.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop repeating',
          style: 'destructive',
          onPress: () => update.mutate({ id: todo.id, patch: { repeat: null } }, { onError }),
        },
      ]);
      return;
    }
    update.mutate(
      { id: todo.id, patch: { repeat: next } },
      { onSuccess: () => toast(inSeries ? 'Repeat updated' : 'Task now repeats'), onError },
    );
  };

  // Debounced autosave for the free-text fields (blur saves immediately)
  const commitTitle = () => {
    const next = title.trim();
    if (!next) setTitle(todo.title);
    else if (next !== todo.title) save({ title: next }, () => setTitle(todo.title));
  };
  const commitDescription = () => {
    if (description.trim() !== (todo.description ?? ''))
      save({ description: description.trim() }, () => setDescription(todo.description ?? ''));
  };
  const commitLocation = () => {
    if (location.trim() !== (todo.location ?? '')) save({ location: location.trim() }, () => setLocation(todo.location ?? ''));
  };

  // Flush unsaved text when leaving the screen (back gesture may skip onBlur)
  const latest = useRef({ title, description, todo });
  useEffect(() => {
    latest.current = { title, description, todo };
  });
  useEffect(
    () => () => {
      const l = latest.current;
      const patch: Partial<Todo> = {};
      if (l.title.trim() && l.title.trim() !== l.todo.title) patch.title = l.title.trim();
      if (l.description.trim() !== (l.todo.description ?? '')) patch.description = l.description.trim();
      if (Object.keys(patch).length) update.mutate({ id: l.todo.id, patch, scope: editScope.current ?? 'this' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      const next = title.trim();
      if (next && next !== todo.title) save({ title: next }, () => setTitle(todo.title));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (description.trim() !== (todo.description ?? ''))
        save({ description: description.trim() }, () => setDescription(todo.description ?? ''));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description]);

  const setStart = (hhmm: string) => {
    const patch: Partial<Todo> = { start_time: hhmm, due_time: hhmm, is_all_day: false };
    // Same as web: a new start time gets a default one-hour slot
    if (!end || end <= hhmm) {
      const [h, m] = hhmm.split(':').map(Number);
      patch.end_time = `${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    save(patch);
  };

  const setEnd = (hhmm: string) => {
    if (start && hhmm <= start) {
      toast('End time must be after the start time', { tone: 'danger' });
      return;
    }
    save({ end_time: hhmm });
  };

  const onToggle = () =>
    toggle.mutate(todo.id, {
      onSuccess: () => {
        if (!done) toast('Task completed', { tone: 'success', action: { label: 'Undo', onPress: () => toggle.mutate(todo.id) } });
      },
      onError,
    });

  const confirmDelete = () =>
    dialog.alert('Delete task?', `“${todo.title}” will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          router.back();
          remove.mutate({ id: todo.id }, { onSuccess: () => toast('Task deleted'), onError });
        },
      },
    ]);

  const deleteSeries = (scope: RepeatScope) => {
    router.back();
    remove.mutate(
      { id: todo.id, scope },
      { onSuccess: () => toast(scope === 'all' ? 'Series deleted' : 'Task deleted'), onError },
    );
  };

  const dateOptions: MenuOption[] = [
    ...quickDates(ref).map((q) => ({
      label: q.label,
      hint: friendlyDate(q.value, ref) === q.label ? undefined : friendlyDate(q.value, ref),
      icon: <Calendar size={18} color={colors.fgMuted} />,
      selected: todo.due_date === q.value,
      onPress: () => saveDate(q.value),
    })),
    {
      label: 'Pick date…',
      icon: <CalendarDays size={18} color={colors.fgMuted} />,
      onPress: () => afterSheet(() => pickers.pickDate(todo.due_date, saveDate)),
    },
  ];

  const overdue = !done && !!todo.due_date && todo.due_date < ref;
  const dateValue = todo.due_date ? `${friendlyDate(todo.due_date, ref)} · ${longDate(todo.due_date)}` : 'No date';
  const swatch = todo.color || PRESET_COLORS[0];

  return (
    <Screen safeTop={false}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () => (
            <IconButton label="Task options" onPress={menu.show}>
              <MoreHorizontal size={22} color={colors.fgSoft} />
            </IconButton>
          ),
        }}
      />

      {/* Title + description */}
      <View style={styles.titleRow}>
        <View style={styles.titleCheck}>
          <Checkbox checked={done} onChange={onToggle} color={pColor} size={24} label={done ? 'Mark as not done' : 'Complete task'} />
        </View>
        <TextInput
          onFocus={requestReveal}
          value={title}
          onChangeText={setTitle}
          onBlur={commitTitle}
          multiline
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          placeholder="Task name"
          placeholderTextColor={colors.fgSubtle}
          selectionColor={colors.accent}
          accessibilityLabel="Task name"
          style={[
            styles.title,
            { color: done ? colors.fgMuted : colors.fg },
            done && { textDecorationLine: 'line-through' },
          ]}
        />
      </View>
      <TextInput
        onFocus={requestReveal}
        value={description}
        onChangeText={setDescription}
        onBlur={commitDescription}
        multiline
        placeholder="Add a description"
        placeholderTextColor={colors.fgSubtle}
        selectionColor={colors.accent}
        accessibilityLabel="Description"
        style={[styles.description, { color: colors.fgSoft }]}
      />

      {/* Schedule */}
      <Card style={styles.card}>
        <DetailRow
          icon={<Calendar size={18} color={overdue ? colors.danger : colors.fgMuted} />}
          label="Date"
          value={dateValue}
          valueColor={overdue ? colors.danger : undefined}
          onPress={dateSheet.show}
        />
        <Divider inset={48} />
        <DetailRow
          icon={<RepeatIcon size={18} color={inSeries ? colors.accent : colors.fgMuted} />}
          label="Repeat"
          value={todo.repeat ? describeRepeat(todo.repeat, todo.due_date) : inSeries ? 'Repeats' : "Doesn't repeat"}
          valueColor={inSeries ? colors.accentText : undefined}
          onPress={repeatSheet.show}
        />
        <Divider inset={48} />
        <DetailRow
          icon={<Sun size={18} color={colors.fgMuted} />}
          label="All day"
          right={
            <Switch
              value={!!todo.is_all_day}
              onValueChange={(v) => save({ is_all_day: v })}
              trackColor={{ true: colors.accent, false: colors.mutedStrong }}
              thumbColor="#ffffff"
              accessibilityLabel="All day"
            />
          }
        />
        {!todo.is_all_day ? (
          <>
            <Divider inset={48} />
            <DetailRow
              icon={<Clock size={18} color={colors.fgMuted} />}
              label="Start"
              value={start ? formatTime(start) : 'None'}
              onPress={() =>
                pickers.pickTime(start, setStart, {
                  title: 'Start time',
                  onClear: start ? () => save({ start_time: '', due_time: '', end_time: '' }) : undefined,
                })
              }
            />
            {start ? (
              <>
                <Divider inset={48} />
                <DetailRow
                  icon={<Timer size={18} color={colors.fgMuted} />}
                  label="End"
                  value={end ? formatTime(end) : 'None'}
                  onPress={() =>
                    pickers.pickTime(end || start, setEnd, {
                      title: 'End time',
                      onClear: end ? () => save({ end_time: '' }) : undefined,
                    })
                  }
                />
              </>
            ) : null}
          </>
        ) : null}
      </Card>

      {/* Attributes */}
      <Card style={styles.card}>
        <DetailRow
          icon={<PriorityFlag priority={todo.priority} colors={colors} size={18} />}
          label="Priority"
          value={`${PRIORITY_META[todo.priority].short} · ${PRIORITY_META[todo.priority].label}`}
          valueColor={todo.priority === 'low' ? undefined : pColor}
          onPress={prioritySheet.show}
        />
        <Divider inset={48} />
        <DetailRow
          icon={<Hash size={18} color={colors.fgMuted} />}
          label="Category"
          value={todo.category || 'None'}
          onPress={categorySheet.show}
        />
        <Divider inset={48} />
        <DetailRow
          icon={<Target size={18} color={goals.linked ? goals.linked.color : colors.fgMuted} />}
          label="Goal"
          value={todo.goal_id ? (goals.linked?.title ?? 'Linked') : 'None'}
          valueColor={goals.linked ? colors.fgSoft : undefined}
          onPress={goalSheet.show}
        />
        <Divider inset={48} />
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <MapPin size={18} color={colors.fgMuted} />
          </View>
          <TextInput
            onFocus={requestReveal}
            value={location}
            onChangeText={setLocation}
            onBlur={commitLocation}
            onSubmitEditing={commitLocation}
            returnKeyType="done"
            placeholder="Add location"
            placeholderTextColor={colors.fgSubtle}
            selectionColor={colors.accent}
            accessibilityLabel="Location"
            style={[styles.inlineInput, { color: colors.fg }]}
          />
        </View>
        <Divider inset={48} />
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Palette size={18} color={colors.fgMuted} />
          </View>
          <View style={styles.swatches}>
            {PRESET_COLORS.map((c) => {
              const active = c.toLowerCase() === swatch.toLowerCase();
              return (
                <Pressable
                  key={c}
                  onPress={() => save({ color: c })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Color ${c}`}
                  hitSlop={4}
                  style={[styles.swatch, { backgroundColor: c }, active && { borderColor: colors.fg }]}
                >
                  {active ? <Check size={12} color="#ffffff" strokeWidth={3} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      {/* Subtasks */}
      <View style={styles.subHeader}>
        <Text variant="small" weight="semibold">
          Subtasks
        </Text>
        <SubtaskProgress subtasks={todo.subtasks ?? []} />
      </View>
      <Card style={[styles.card, styles.subCard]}>
        <SubtaskList
          subtasks={todo.subtasks ?? []}
          color={pColor}
          onChange={(next) => updateSubtasks.mutate(todo.id, next)}
        />
      </Card>

      <Button
        title={done ? 'Mark as not done' : 'Complete task'}
        variant={done ? 'secondary' : 'primary'}
        size="lg"
        block
        icon={done ? <RotateCcw size={18} color={colors.fgSoft} /> : <CheckCircle2 size={18} color={colors.accentFg} />}
        onPress={onToggle}
        style={styles.complete}
      />

      <View style={styles.meta}>
        <Text variant="caption" tone="subtle" center>
          Created {stamp(todo.created_at)}
        </Text>
        {done && todo.completed_at ? (
          <Text variant="caption" tone="subtle" center>
            Completed {stamp(todo.completed_at)}
          </Text>
        ) : null}
      </View>

      <ActionSheet
        visible={menu.open}
        onClose={menu.hide}
        options={[
          {
            label: 'Delete task',
            icon: <Trash2 size={18} color={colors.danger} />,
            destructive: true,
            onPress: () => afterSheet(inSeries ? deleteSheet.show : confirmDelete),
          },
        ]}
      />
      {/* Android alerts hold three buttons at most, so the four-way series delete is a sheet */}
      <ActionSheet
        visible={deleteSheet.open}
        onClose={deleteSheet.hide}
        title="Delete repeating task"
        options={[
          { label: 'This task only', onPress: () => deleteSeries('this') },
          { label: 'This and following', destructive: true, onPress: () => deleteSeries('future') },
          { label: 'All tasks in the series', destructive: true, onPress: () => deleteSeries('all') },
        ]}
      />
      <RepeatSheet
        visible={repeatSheet.open}
        onClose={repeatSheet.hide}
        value={todo.repeat ?? null}
        date={todo.due_date ?? ref}
        onSelect={changeRepeat}
        footnote={inSeries ? 'Applies to this and following tasks' : undefined}
      />
      <ActionSheet visible={dateSheet.open} onClose={dateSheet.hide} title="Due date" options={dateOptions} />
      <ActionSheet
        visible={prioritySheet.open}
        onClose={prioritySheet.hide}
        title="Priority"
        // eslint-disable-next-line react-hooks/refs -- save() reads editScope only when a menu item is picked
        options={priorityMenu(todo.priority, (p) => save({ priority: p }), colors)}
      />
      <CategoryPicker
        visible={categorySheet.open}
        onClose={categorySheet.hide}
        categories={categories}
        value={todo.category}
        onSelect={(c) => save({ category: c })}
      />
      <GoalPickerSheet
        visible={goalSheet.open}
        onClose={goalSheet.hide}
        sections={goals.sections}
        value={todo.goal_id}
        loading={goals.loading}
        emptyHint="No active goals this week, month or year. Set one from Browse → Goals."
        onSelect={(g) => save({ goal_id: g?.id ?? null })}
      />
      {pickers.sheet}
    </Screen>
  );
}

/** Settings-style row: icon, label, value (or custom right element), chevron when tappable. */
function DetailRow({
  icon,
  label,
  value,
  valueColor,
  right,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  valueColor?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <View style={styles.detailIcon}>{icon}</View>
      <Text style={{ flexShrink: 0 }}>{label}</Text>
      <View style={styles.detailValue}>
        {right ?? (
          <Text variant="small" color={valueColor ?? colors.fgMuted} numberOfLines={1}>
            {value}
          </Text>
        )}
      </View>
      {onPress ? <ChevronRight size={16} color={colors.fgSubtle} /> : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? ''}`}
      style={({ pressed }) => [styles.detailRow, pressed && { backgroundColor: colors.subtle }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.detailRow}>{body}</View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  titleCheck: { paddingTop: 6 },
  title: { ...font.heading, fontWeight: '700', flex: 1, paddingVertical: 2 },
  description: { ...font.body, marginLeft: 36, marginTop: space.xs, paddingVertical: space.xs, minHeight: 32 },
  card: { marginTop: space.lg },
  subCard: { marginTop: 0, paddingHorizontal: space.md },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.sm,
    paddingHorizontal: space.xs,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', minHeight: 50, paddingRight: space.md, gap: space.sm },
  detailIcon: { width: 48, alignItems: 'center' },
  detailValue: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
  inlineInput: { ...font.body, flex: 1, paddingVertical: space.md },
  swatches: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingVertical: space.md },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  complete: { marginTop: space.xl },
  meta: { marginTop: space.lg, gap: 2 },
});

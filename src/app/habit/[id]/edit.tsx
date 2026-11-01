import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, Info, Lock, Trash2 } from 'lucide-react-native';

import type { Habit } from '@/api/types';
import { DateField } from '@/components/habits/DateField';
import {
  CategorySuggestions,
  ColorPicker,
  FormSection,
  HabitPreview,
  IconPicker,
  NumberLogPicker,
  ScheduleEditor,
  categorySuggestions,
  scheduleChanged,
  scheduleFromHabit,
  schedulePayload,
  scheduleSummary,
  validateSchedule,
  type ScheduleDraft,
} from '@/components/habits/HabitFormParts';
import { FormHeader } from '@/components/habits/FormHeader';
import { GoalLinkField } from '@/components/goals/GoalPickerSheet';
import { Stepper } from '@/components/habits/Stepper';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  KeyboardAvoider,
  KeyboardScrollView,
  ListSkeleton,
  Notice,
  Text,
  TextField,
  useDialog,
  useToast,
} from '@/components/ui';
import { useDeleteHabit, useHabit, useHabits, useUpdateHabit } from '@/hooks/queries';
import { HABIT_TYPE_META, describeSchedule, longDate, today } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

/** Edit a habit (modal): cosmetics, versioned schedule, archive/delete. */
export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const habit = useHabit(id);
  const { colors } = useTheme();

  let body: React.ReactNode;
  if (habit.isPending) body = <View style={{ padding: space.lg }}><ListSkeleton rows={4} /></View>;
  else if (habit.error) body = <ErrorState error={habit.error} onRetry={() => habit.refetch()} />;
  else if (!habit.data) body = <EmptyState title="Habit not found" description="It may have been deleted." />;
  else return <EditForm key={habit.data.id} habit={habit.data} />;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FormHeader title="Edit habit" cancelLabel="Close" onCancel={() => router.back()} />
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>{body}</View>
    </>
  );
}

function EditForm({ habit }: { habit: Habit }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const dialog = useDialog();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();
  const allHabits = useHabits();

  const original = scheduleFromHabit(habit.current_schedule);
  const [icon, setIcon] = useState(habit.icon || 'Target');
  const [color, setColor] = useState(habit.color);
  const [category, setCategory] = useState(habit.category ?? '');
  const [description, setDescription] = useState(habit.description ?? '');
  const [sortOrder, setSortOrder] = useState(habit.sort_order ?? 0);
  const [goalId, setGoalId] = useState<string | null>(habit.goal_id ?? null);
  const [logNumber, setLogNumber] = useState(!!habit.metric_label);
  const [schedule, setSchedule] = useState<ScheduleDraft>(original);
  const [effectiveFrom, setEffectiveFrom] = useState(today());
  const [error, setError] = useState<string | null>(null);

  const archived = habit.status === 'archived';
  const firstStart = habit.periods.map((p) => p.start_date).sort()[0];

  const cosmeticsDirty =
    icon !== habit.icon ||
    color !== habit.color ||
    category.trim() !== (habit.category ?? '') ||
    description.trim() !== (habit.description ?? '') ||
    sortOrder !== habit.sort_order ||
    goalId !== (habit.goal_id ?? null) ||
    (habit.type === 'build_yesno' && logNumber !== !!habit.metric_label);
  const scheduleDirty = habit.type !== 'avoid_count' && scheduleChanged(schedule, original, habit.type);
  const scheduleError = scheduleDirty ? validateSchedule(schedule, habit.type) : null;
  const dirty = cosmeticsDirty || scheduleDirty;
  const busy = update.isPending || remove.isPending;

  const save = () => {
    if (!dirty) {
      router.back();
      return;
    }
    if (scheduleError) {
      haptic.warning();
      setError(scheduleError);
      return;
    }
    setError(null);
    update.mutate(
      {
        id: habit.id,
        cosmetics: cosmeticsDirty
          ? {
              icon,
              color,
              category: category.trim() || 'Personal',
              description: description.trim(),
              sort_order: sortOrder,
              // Empty string unlinks the goal
              ...(goalId !== (habit.goal_id ?? null) ? { goal_id: goalId ?? '' } : {}),
              ...(habit.type === 'build_yesno' ? { metric_label: logNumber ? (habit.metric_label ?? habit.name) : '' } : {}),
            }
          : undefined,
        schedule: scheduleDirty
          ? { ...schedulePayload(schedule, habit.type), effective_from: effectiveFrom }
          : undefined,
      },
      {
        onSuccess: () => {
          haptic.success();
          toast(scheduleDirty ? `New schedule from ${longDate(effectiveFrom)}` : 'Habit updated', { tone: 'success' });
          router.back();
        },
        onError: (e) => {
          setError(e.message);
          toast(e.message, { tone: 'danger' });
        },
      },
    );
  };

  const archive = () =>
    dialog.alert(
      `Archive “${habit.name}”?`,
      'Stops tracking from today. Past results stay in Insights and you can reopen it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () =>
            remove.mutate(
              { id: habit.id, keepData: true },
              {
                onSuccess: () => {
                  toast(`“${habit.name}” archived`, {
                    action: { label: 'View', onPress: () => router.push('/archived') },
                  });
                  router.dismissAll();
                },
                onError: (e) => toast(e.message, { tone: 'danger' }),
              },
            ),
        },
      ],
    );

  const destroy = () =>
    dialog.alert(
      'Delete permanently?',
      `“${habit.name}” and every past log will be erased. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete forever',
          style: 'destructive',
          onPress: () =>
            remove.mutate(
              { id: habit.id, keepData: false },
              {
                onSuccess: () => {
                  haptic.warning();
                  toast('Habit deleted');
                  router.dismissAll();
                },
                onError: (e) => toast(e.message, { tone: 'danger' }),
              },
            ),
        },
      ],
    );

  const suggestions = categorySuggestions((allHabits.data ?? []).map((h) => h.category));

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FormHeader
        title="Edit habit"
        onCancel={() => router.back()}
        onSave={save}
        saveDisabled={!dirty || busy}
        saving={update.isPending}
      />
      <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
        <KeyboardScrollView
          style={{ flex: 1, backgroundColor: colors.canvas }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        >
          <HabitPreview
            name={habit.name}
            icon={icon}
            color={color}
            meta={`${category.trim() ? `${category.trim()} · ` : ''}${scheduleSummary(schedule, habit.type)}`}
          />

          {error ? <Notice tone="danger">{error}</Notice> : null}

          {/* Locked identity */}
          <Card>
            <View style={styles.lockedRow}>
              <Text variant="small" tone="muted" style={styles.lockedLabel}>
                Name
              </Text>
              <Text weight="medium" numberOfLines={1} style={{ flex: 1 }}>
                {habit.name}
              </Text>
              <Lock size={14} color={colors.fgSubtle} />
            </View>
            <View style={[styles.lockedRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}>
              <Text variant="small" tone="muted" style={styles.lockedLabel}>
                Type
              </Text>
              <Text weight="medium" style={{ flex: 1 }}>
                {HABIT_TYPE_META[habit.type].label}
              </Text>
              <Lock size={14} color={colors.fgSubtle} />
            </View>
          </Card>
          <Text variant="caption" tone="subtle" style={{ marginTop: -space.lg }}>
            Name and type are permanent so your history stays accurate.
          </Text>

          {habit.type === 'build_yesno' ? (
            <FormSection
              title="Also log a number?"
              hint="When you mark it done you can type an amount, like pages read. It's optional and shows up in Insights."
            >
              <NumberLogPicker value={logNumber} onChange={setLogNumber} />
            </FormSection>
          ) : null}

          <FormSection title="Icon">
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </FormSection>

          <FormSection title="Color">
            <ColorPicker value={color} onChange={setColor} />
          </FormSection>

          <FormSection title="Category">
            <View style={{ gap: space.sm }}>
              <TextField
                value={category}
                onChangeText={setCategory}
                placeholder="Health, Learning, Career…"
                accessibilityLabel="Category"
                maxLength={40}
              />
              <CategorySuggestions value={category} suggestions={suggestions} onPick={setCategory} />
            </View>
          </FormSection>

          <FormSection title="Goal" hint="Optional. The goal this habit helps with.">
            <GoalLinkField value={goalId} onChange={setGoalId} />
          </FormSection>

          <FormSection title="Description">
            <TextField
              value={description}
              onChangeText={setDescription}
              placeholder="Why does this habit matter to you?"
              multiline
              accessibilityLabel="Description"
            />
          </FormSection>

          <FormSection title="Sort order">
            <Field hint="Lower numbers show first.">
              <Stepper label="Sort order" value={sortOrder} onChange={setSortOrder} min={-999} max={999} />
            </Field>
          </FormSection>

          {habit.type !== 'avoid_count' ? (
            <FormSection
              title="Schedule"
              hint={`Currently: ${describeSchedule(habit.current_schedule) || scheduleSummary(original, habit.type)}`}
            >
              <ScheduleEditor value={schedule} onChange={setSchedule} type={habit.type} />
              {scheduleDirty ? (
                <View style={{ gap: space.md }}>
                  <Notice tone="info" icon={<Info size={16} color={colors.info} />}>
                    Changes start from the date you pick. Earlier days keep the schedule they had.
                  </Notice>
                  <Field label="Effective from" error={scheduleError}>
                    <DateField
                      value={effectiveFrom}
                      onChange={setEffectiveFrom}
                      min={firstStart}
                      title="Effective from"
                    />
                  </Field>
                  <Button
                    title="Keep current schedule"
                    variant="ghost"
                    size="sm"
                    onPress={() => setSchedule(original)}
                    style={{ alignSelf: 'flex-start' }}
                  />
                </View>
              ) : null}
            </FormSection>
          ) : null}

          <FormSection title="Danger zone">
            <Card>
              {!archived ? (
                <DangerRow
                  icon={<Archive size={18} color={colors.fgSoft} />}
                  title="Archive habit"
                  description="Stop tracking and keep its history. You can reopen it anytime."
                  action={<Button title="Archive" size="sm" onPress={archive} disabled={busy} />}
                />
              ) : null}
              <DangerRow
                border={!archived}
                icon={<Trash2 size={18} color={colors.danger} />}
                title="Delete permanently"
                description="Erases the habit and every past log. This can’t be undone."
                action={<Button title="Delete" size="sm" variant="dangerGhost" onPress={destroy} disabled={busy} />}
              />
            </Card>
          </FormSection>
        </KeyboardScrollView>
      </KeyboardAvoider>
    </>
  );
}

function DangerRow({
  icon,
  title,
  description,
  action,
  border,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: React.ReactNode;
  border?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.dangerRow, border && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text weight="medium">{title}</Text>
        <Text variant="small" tone="muted">
          {description}
        </Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: 48 },
  lockedLabel: { width: 48 },
  dangerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
});

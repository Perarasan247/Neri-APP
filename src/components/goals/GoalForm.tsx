import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Link2, Plus, Trash2, X } from 'lucide-react-native';

import type { ChecklistItem, Goal, GoalDetail, GoalLevel, GoalMeasure } from '@/api/types';
import { FormHeader } from '@/components/habits/FormHeader';
import { ColorPicker, FormSection } from '@/components/habits/HabitFormParts';
import { Stepper } from '@/components/habits/Stepper';
import {
  Button,
  Card,
  Field,
  KeyboardAvoider,
  KeyboardScrollView,
  Notice,
  requestReveal,
  Segmented,
  Text,
  TextField,
  useDialog,
  useDisclosure,
  useToast,
} from '@/components/ui';
import { useCreateGoal, useDeleteGoal, useParentCandidates, useUpdateGoal } from '@/hooks/queries';
import { today } from '@/lib/format';
import { LEVEL_META, MEASURE_META, periodLabel, snapPeriod } from '@/lib/goals';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { font, PRESET_COLORS, radius, space } from '@/theme/tokens';
import { GoalGlyph, PeriodNav } from './GoalCard';
import { GoalPickerSheet } from './GoalPickerSheet';

const LEVEL_OPTIONS: { value: GoalLevel; label: string }[] = [
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
];

const MEASURE_OPTIONS: { value: GoalMeasure; label: string }[] = [
  { value: 'simple', label: MEASURE_META.simple.label },
  { value: 'target', label: MEASURE_META.target.label },
  { value: 'checklist', label: MEASURE_META.checklist.label },
];

const PLACEHOLDER: Record<GoalLevel, string> = {
  weekly: 'Solve 5 problems',
  monthly: 'Finish the two-pointers chapter',
  yearly: 'Get good at algorithms',
};

const itemId = () => `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export interface GoalFormDefaults {
  level?: GoalLevel;
  /** Any date inside the period. */
  period?: string;
  parent?: Pick<Goal, 'id' | 'title' | 'color' | 'level' | 'period_start'> | null;
}

/**
 * Create or edit a goal (modal). Edit mode keeps the level fixed (the server can't change it)
 * and offers delete.
 */
export function GoalForm({ goal, defaults = {} }: { goal?: GoalDetail; defaults?: GoalFormDefaults }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const dialog = useDialog();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const parentSheet = useDisclosure();
  const ref = today();
  const editing = !!goal;

  const initialParent = goal ? (goal.ancestors[goal.ancestors.length - 1] ?? null) : (defaults.parent ?? null);

  const [title, setTitle] = useState(goal?.title ?? '');
  const [level, setLevel] = useState<GoalLevel>(goal?.level ?? defaults.level ?? 'weekly');
  const [anchor, setAnchor] = useState(goal?.period_start ?? defaults.period ?? ref);
  const [parent, setParent] = useState(initialParent);
  const [measure, setMeasure] = useState<GoalMeasure>(goal?.measure ?? 'simple');
  const [target, setTarget] = useState(goal?.target ?? 5);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(goal?.checklist ?? []);
  const [draftItem, setDraftItem] = useState('');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [color, setColor] = useState(goal?.color ?? initialParent?.color ?? PRESET_COLORS[0]);
  const [colorTouched, setColorTouched] = useState(editing);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = snapPeriod(level, anchor);
  const candidates = useParentCandidates(level, start, goal?.id);
  // A parent that no longer overlaps the chosen period (or level) is dropped on save
  const parentValid = !parent || candidates.loading || candidates.goals.some((g) => g.id === parent.id);
  const effectiveParent = parentValid ? parent : null;

  const titleError = submitted && !title.trim() ? 'Give your goal a name.' : null;
  const busy = create.isPending || update.isPending || remove.isPending;

  const addItem = () => {
    const t = draftItem.trim();
    if (!t) return;
    haptic.tap();
    setChecklist((l) => [...l, { id: itemId(), title: t, completed: false }]);
    setDraftItem('');
  };

  const onError = (e: Error) => {
    setError(e.message);
    toast(e.message, { tone: 'danger' });
  };

  const save = () => {
    setSubmitted(true);
    setError(null);
    if (!title.trim()) {
      haptic.warning();
      return;
    }
    const items = checklist.map((i) => ({ ...i, id: i.id?.startsWith('item-') ? undefined : i.id }));
    if (!goal) {
      create.mutate(
        {
          title: title.trim(),
          level,
          period_start: start,
          description: description.trim() || undefined,
          color,
          parent_id: effectiveParent?.id,
          measure,
          target: measure === 'target' ? target : undefined,
          checklist: measure === 'checklist' ? items : [],
        },
        {
          onSuccess: (g) => {
            haptic.success();
            toast(`Goal set for ${g.period_label}`, { tone: 'success' });
            router.back();
          },
          onError,
        },
      );
      return;
    }
    const patch: Parameters<typeof update.mutate>[0]['patch'] = {};
    if (title.trim() !== goal.title) patch.title = title.trim();
    if (description.trim() !== (goal.description ?? '')) patch.description = description.trim();
    if (color !== goal.color) patch.color = color;
    if (start !== goal.period_start) patch.period_start = start;
    if ((effectiveParent?.id ?? null) !== (goal.parent_id ?? null)) patch.parent_id = effectiveParent?.id ?? '';
    if (measure !== goal.measure) patch.measure = measure;
    if (measure === 'target' && target !== goal.target) patch.target = target;
    if (measure === 'checklist' && JSON.stringify(checklist) !== JSON.stringify(goal.checklist)) patch.checklist = items;
    if (!Object.keys(patch).length) {
      router.back();
      return;
    }
    update.mutate(
      { id: goal.id, patch },
      {
        onSuccess: () => {
          haptic.success();
          toast('Goal updated', { tone: 'success' });
          router.back();
        },
        onError,
      },
    );
  };

  const confirmDelete = () => {
    if (!goal) return;
    const linked = [
      goal.children.length ? `${goal.children.length} sub-goal${goal.children.length === 1 ? '' : 's'}` : null,
      goal.tasks.length ? `${goal.tasks.length} task${goal.tasks.length === 1 ? '' : 's'}` : null,
      goal.habits.length ? `${goal.habits.length} habit${goal.habits.length === 1 ? '' : 's'}` : null,
    ].filter(Boolean);
    dialog.alert(
      'Delete goal?',
      `“${goal.title}” will be deleted.${linked.length ? ` Its ${linked.join(', ')} stay; they just lose the link.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(goal.id, {
              onSuccess: () => {
                haptic.warning();
                toast('Goal deleted');
                // Close the form and the detail screen behind it
                router.dismiss(2);
              },
              onError,
            }),
        },
      ],
    );
  };

  const unit = LEVEL_META[level].unit;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FormHeader
        title={editing ? 'Edit goal' : 'New goal'}
        onCancel={() => router.back()}
        onSave={save}
        saveDisabled={!title.trim() || busy}
        saving={create.isPending || update.isPending}
      />
      <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
        <KeyboardScrollView
          style={{ flex: 1, backgroundColor: colors.canvas }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        >
          {error ? <Notice tone="danger">{error}</Notice> : null}

          <FormSection title="Goal">
            <Field error={titleError}>
              <TextField
                value={title}
                onChangeText={setTitle}
                placeholder={PLACEHOLDER[level]}
                autoFocus={!editing}
                returnKeyType="done"
                invalid={Boolean(titleError)}
                accessibilityLabel="Goal title"
                maxLength={255}
              />
            </Field>
          </FormSection>

          <FormSection title="For">
            {editing ? (
              <Text variant="small" tone="muted" style={{ marginTop: -space.xs }}>
                {`${LEVEL_META[level].label} goal. Create a new goal to change its level.`}
              </Text>
            ) : (
              <Segmented<GoalLevel> value={level} onChange={setLevel} options={LEVEL_OPTIONS} />
            )}
            <Card style={styles.periodCard}>
              <PeriodNav level={level} start={start} today={ref} onChange={setAnchor} />
            </Card>
          </FormSection>

          {level !== 'yearly' ? (
            <FormSection title="Part of" hint={`Optional. A bigger goal this ${unit} moves forward.`}>
              <Pressable
                onPress={() => {
                  haptic.tap();
                  parentSheet.show();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Part of: ${effectiveParent?.title ?? 'none'}`}
                style={({ pressed }) => [
                  styles.picker,
                  { backgroundColor: pressed ? colors.muted : colors.surface, borderColor: colors.lineStrong },
                ]}
              >
                {effectiveParent ? (
                  <GoalGlyph color={effectiveParent.color} size={28} />
                ) : (
                  <Link2 size={18} color={colors.fgMuted} style={{ marginHorizontal: 5 }} />
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} tone={effectiveParent ? 'fg' : 'subtle'}>
                    {effectiveParent?.title ?? 'No bigger goal'}
                  </Text>
                  {effectiveParent ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {`${LEVEL_META[effectiveParent.level].label} · ${periodLabel(effectiveParent.level, effectiveParent.period_start)}`}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight size={16} color={colors.fgSubtle} />
              </Pressable>
              {!parentValid ? (
                <Notice tone="warning">{`“${parent?.title}” doesn't cover this ${unit}, so it won't be linked.`}</Notice>
              ) : null}
            </FormSection>
          ) : null}

          <FormSection title="Measure" hint={MEASURE_META[measure].hint}>
            <Segmented<GoalMeasure> value={measure} onChange={setMeasure} options={MEASURE_OPTIONS} />
            {measure === 'target' ? (
              <Field label="Target">
                <Stepper label="Target" value={target} onChange={setTarget} min={1} max={100000} />
              </Field>
            ) : null}
            {measure === 'checklist' ? (
              <Card>
                {checklist.map((item, i) => (
                  <View
                    key={item.id ?? i}
                    style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
                  >
                    <View style={[styles.bullet, { borderColor: item.completed ? colors.success : colors.lineStrong }]} />
                    <Text style={{ flex: 1 }} numberOfLines={2} tone={item.completed ? 'muted' : 'fg'} strike={item.completed}>
                      {item.title}
                    </Text>
                    <Pressable
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${item.title}`}
                      onPress={() => {
                        haptic.tap();
                        setChecklist((l) => l.filter((x) => x !== item));
                      }}
                    >
                      <X size={16} color={colors.fgSubtle} />
                    </Pressable>
                  </View>
                ))}
                <View
                  style={[
                    styles.item,
                    checklist.length > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
                  ]}
                >
                  <Plus size={16} color={colors.accent} />
                  <TextInput
                    value={draftItem}
                    onChangeText={setDraftItem}
                    onFocus={requestReveal}
                    onSubmitEditing={addItem}
                    submitBehavior="submit"
                    returnKeyType="done"
                    placeholder="Add an item"
                    placeholderTextColor={colors.fgSubtle}
                    selectionColor={colors.accent}
                    accessibilityLabel="New checklist item"
                    style={[styles.itemInput, { color: colors.fg }]}
                  />
                  {draftItem.trim() ? (
                    <Pressable onPress={addItem} hitSlop={8} accessibilityRole="button">
                      <Text variant="small" weight="semibold" tone="accent">
                        Add
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            ) : null}
          </FormSection>

          <FormSection title="Why it matters">
            <TextField
              value={description}
              onChangeText={setDescription}
              placeholder="What will this change for you?"
              multiline
              accessibilityLabel="Why it matters"
            />
          </FormSection>

          <FormSection title="Color">
            <ColorPicker
              value={color}
              onChange={(c) => {
                setColor(c);
                setColorTouched(true);
              }}
            />
          </FormSection>

          {goal ? (
            <Button
              title="Delete goal"
              variant="dangerGhost"
              icon={<Trash2 size={18} color={colors.danger} />}
              onPress={confirmDelete}
              disabled={busy}
            />
          ) : null}
        </KeyboardScrollView>
      </KeyboardAvoider>

      <GoalPickerSheet
        visible={parentSheet.open}
        onClose={parentSheet.hide}
        title="Part of"
        noneLabel="No bigger goal"
        value={effectiveParent?.id}
        loading={candidates.loading}
        emptyHint={`No ${level === 'weekly' ? 'monthly or yearly' : 'yearly'} goals cover this ${unit} yet.`}
        sections={[
          { title: 'Yearly', goals: candidates.goals.filter((g) => g.level === 'yearly') },
          { title: 'Monthly', goals: candidates.goals.filter((g) => g.level === 'monthly') },
        ]}
        onSelect={(g) => {
          setParent(g);
          if (g && !colorTouched) setColor(g.color);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl },
  periodCard: { paddingHorizontal: space.sm, paddingVertical: space.sm },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.md + 2,
    borderWidth: 1,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.md },
  bullet: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.75 },
  itemInput: { ...font.body, flex: 1, paddingVertical: space.md },
});

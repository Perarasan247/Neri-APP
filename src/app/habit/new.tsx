import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HabitType } from '@/api/types';
import { DateField } from '@/components/habits/DateField';
import {
  CategorySuggestions,
  ColorPicker,
  FormSection,
  HabitPreview,
  IconPicker,
  NumberLogPicker,
  ScheduleEditor,
  TypePicker,
  categorySuggestions,
  schedulePayload,
  scheduleSummary,
  validateSchedule,
  type ScheduleDraft,
} from '@/components/habits/HabitFormParts';
import { FormHeader } from '@/components/habits/FormHeader';
import { GoalLinkField } from '@/components/goals/GoalPickerSheet';
import { Field, KeyboardAvoider, KeyboardScrollView, Notice, TextField, useToast } from '@/components/ui';
import { useCreateHabit, useHabits, useProfile } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESET_COLORS, space } from '@/theme/tokens';

const NAME_PLACEHOLDER: Record<HabitType, string> = {
  build_yesno: 'Go to the gym',
  build_count: 'Read 20 pages',
  avoid_count: 'No junk food',
};

/** New habit form (modal). Mirrors web AddHabitModal, including its validation. */
export default function NewHabitScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const create = useCreateHabit();
  const profile = useProfile();
  const habits = useHabits();

  const todayStr = today();
  const trackingStart = profile.data?.tracking_start_date;

  const [name, setName] = useState('');
  const [type, setType] = useState<HabitType>('build_yesno');
  const [schedule, setSchedule] = useState<ScheduleDraft>({
    frequency_type: 'daily',
    weekdays: [1, 2, 3, 4, 5],
    target_count: 3,
    daily_target: 1,
  });
  const [logNumber, setLogNumber] = useState(false);
  const [startDate, setStartDate] = useState(todayStr);
  const [icon, setIcon] = useState('Target');
  const [color, setColor] = useState<string>(PRESET_COLORS[0]);
  const [category, setCategory] = useState('Health');
  const [description, setDescription] = useState('');
  const [goalId, setGoalId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const nameError = submitted && !name.trim() ? 'Give your habit a name.' : null;
  const scheduleError = submitted ? validateSchedule(schedule, type) : null;
  const dateError =
    startDate > todayStr
      ? 'Start date can’t be in the future.'
      : trackingStart && startDate < trackingStart
        ? 'Start date can’t be before your tracking start date.'
        : null;

  const suggestions = categorySuggestions((habits.data ?? []).map((h) => h.category));

  const save = () => {
    setSubmitted(true);
    setServerError(null);
    if (!name.trim() || validateSchedule(schedule, type) || dateError) {
      haptic.warning();
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        type,
        start_date: startDate,
        color,
        icon,
        category: category.trim() || 'Personal',
        description: description.trim() || undefined,
        goal_id: goalId ?? undefined,
        // The amount is named after the habit; there is no unit to configure
        ...(type === 'build_yesno' && logNumber ? { metric_label: name.trim().slice(0, 64) } : {}),
        schedule: { ...schedulePayload(schedule, type), effective_from: startDate },
      },
      {
        onSuccess: (h) => {
          haptic.success();
          toast(`“${h.name}” created`, { tone: 'success' });
          router.back();
        },
        onError: (e) => {
          setServerError(e.message);
          toast(e.message, { tone: 'danger' });
        },
      },
    );
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FormHeader
        title="New habit"
        onCancel={() => router.back()}
        onSave={save}
        saveDisabled={!name.trim()}
        saving={create.isPending}
      />
      <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
        <KeyboardScrollView
          style={{ flex: 1, backgroundColor: colors.canvas }}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + space.xxxl }]}
        >
          <HabitPreview
            name={name}
            icon={icon}
            color={color}
            meta={`${category.trim() ? `${category.trim()} · ` : ''}${scheduleSummary(schedule, type)}`}
          />

          {serverError ? <Notice tone="danger">{serverError}</Notice> : null}

          <FormSection title="Name">
            <Field error={nameError} hint="Name and type can’t be changed later, so your history stays honest.">
              <TextField
                value={name}
                onChangeText={setName}
                placeholder={NAME_PLACEHOLDER[type]}
                autoFocus
                returnKeyType="done"
                invalid={Boolean(nameError)}
                accessibilityLabel="Habit name"
                maxLength={80}
              />
            </Field>
          </FormSection>

          <FormSection title="Type">
            <TypePicker value={type} onChange={setType} />
          </FormSection>

          <FormSection title={type === 'avoid_count' ? 'Schedule' : 'How often?'}>
            <ScheduleEditor value={schedule} onChange={setSchedule} type={type} />
            {scheduleError ? <Notice tone="danger">{scheduleError}</Notice> : null}
          </FormSection>

          {type === 'build_yesno' ? (
            <FormSection
              title="Also log a number?"
              hint="When you mark it done you can type an amount, like pages read. It's optional and shows up in Insights."
            >
              <NumberLogPicker value={logNumber} onChange={setLogNumber} />
            </FormSection>
          ) : null}

          <FormSection title="Start date">
            <Field
              error={dateError}
              hint={trackingStart ? 'Can be backdated to your tracking start.' : undefined}
            >
              <DateField
                value={startDate}
                onChange={setStartDate}
                min={trackingStart}
                max={todayStr}
                title="Start date"
                invalid={Boolean(dateError)}
              />
            </Field>
          </FormSection>

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

          <FormSection title="Goal" hint="Optional. The goal this habit helps with; its days show up on the goal.">
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
        </KeyboardScrollView>
      </KeyboardAvoider>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.xxl },
});

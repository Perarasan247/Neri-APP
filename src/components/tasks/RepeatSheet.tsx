import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, Repeat as RepeatIcon } from 'lucide-react-native';

import type { Repeat, RepeatFrequency } from '@/api/types';
import { Button, Field, Segmented, Sheet, Text } from '@/components/ui';
import { WeekdayPicker } from '@/components/habits/HabitFormParts';
import { Stepper } from '@/components/habits/Stepper';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { haptic } from '@/lib/haptics';
import { addDays, shortDate } from '@/lib/format';
import { isoWeekday, matchPreset, MAX_INTERVAL, repeatPresets } from '@/lib/repeat';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface RepeatSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Current rule, or null for a one-off task. */
  value: Repeat | null;
  /** The task's due date: presets are worded around it ("Every week on Monday"). */
  date: string;
  /** Called once the sheet is fully gone (safe to open an Alert or another modal). */
  onSelect: (repeat: Repeat | null) => void;
  /** Small print under the choices, e.g. "Applies to this and following tasks". */
  footnote?: string;
}

const FREQUENCIES: { value: RepeatFrequency; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const UNIT: Record<RepeatFrequency, [string, string]> = {
  daily: ['day', 'days'],
  weekly: ['week', 'weeks'],
  monthly: ['month', 'months'],
};

/** Repeat picker: presets first, "Custom…" opens the frequency / interval / weekdays / end editor. */
export function RepeatSheet({ visible, onClose, value, date, onSelect, footnote }: RepeatSheetProps) {
  const { colors } = useTheme();
  const pickers = usePickers();
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<Repeat>(() => value ?? defaultDraft(date));
  const pending = useRef<(() => void) | null>(null);

  // Every opening starts from the presets with the current rule as the custom draft
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setCustom(false);
      setDraft(value ?? defaultDraft(date));
    }
  }

  const choose = (repeat: Repeat | null) => {
    haptic.tap();
    pending.current = () => onSelect(repeat);
    onClose();
  };

  const presets = repeatPresets(date);
  const matched = matchPreset(value, date);
  const set = (patch: Partial<Repeat>) => setDraft((d) => ({ ...d, ...patch }));
  const invalid = draft.frequency === 'weekly' && draft.weekdays.length === 0;

  const setFrequency = (frequency: RepeatFrequency) =>
    set({
      frequency,
      weekdays: frequency === 'weekly' ? (draft.weekdays.length ? draft.weekdays : [isoWeekday(date)]) : [],
    });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={() => {
        const run = pending.current;
        pending.current = null;
        run?.();
      }}
      title={custom ? 'Custom repeat' : 'Repeat'}
    >
      {custom ? (
        <View style={styles.form}>
          <Segmented value={draft.frequency} onChange={setFrequency} options={FREQUENCIES} />

          <Field label="Every">
            <Stepper
              label="Repeat interval"
              value={draft.interval}
              min={1}
              max={MAX_INTERVAL}
              onChange={(interval) => set({ interval })}
              suffix={UNIT[draft.frequency][draft.interval === 1 ? 0 : 1]}
            />
          </Field>

          {draft.frequency === 'weekly' ? (
            <Field label="On" error={invalid ? 'Pick at least one day.' : null}>
              <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => set({ weekdays })} />
            </Field>
          ) : null}

          <Field label="Ends">
            <Segmented
              value={draft.end_date ? 'on' : 'never'}
              onChange={(v) => set({ end_date: v === 'never' ? null : (draft.end_date ?? addDays(date, 30)) })}
              options={[
                { value: 'never', label: 'Never' },
                { value: 'on', label: 'On date' },
              ]}
            />
            {draft.end_date ? (
              <Pressable
                onPress={() =>
                  pickers.pickDate(draft.end_date, (end_date) => set({ end_date }), { title: 'Ends on', minDate: date })
                }
                accessibilityRole="button"
                accessibilityLabel={`Ends on ${shortDate(draft.end_date)}`}
                style={({ pressed }) => [
                  styles.endDate,
                  { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.muted : colors.surface },
                ]}
              >
                <Text weight="medium">{shortDate(draft.end_date)}</Text>
                <ChevronRight size={16} color={colors.fgSubtle} />
              </Pressable>
            ) : null}
          </Field>

          {footnote ? (
            <Text variant="caption" tone="subtle">
              {footnote}
            </Text>
          ) : null}

          <View style={styles.actions}>
            <Button title="Back" variant="ghost" onPress={() => setCustom(false)} />
            <View style={{ flex: 1 }} />
            <Button title="Done" variant="primary" disabled={invalid} onPress={() => choose(draft)} />
          </View>
        </View>
      ) : (
        <View>
          {presets.map((p) => {
            const selected = matched?.key === p.key && (p.key !== 'none' || !value);
            return (
              <Pressable
                key={p.key}
                accessibilityRole="menuitem"
                accessibilityState={{ selected }}
                onPress={() => choose(p.repeat)}
                style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.muted }]}
              >
                <View style={styles.icon}>
                  <RepeatIcon size={18} color={colors.fgMuted} />
                </View>
                <Text style={{ flex: 1 }}>{p.label}</Text>
                {selected ? <Check size={18} color={colors.accent} /> : null}
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="menuitem"
            accessibilityState={{ selected: !!value && !matched }}
            onPress={() => {
              haptic.tap();
              setCustom(true);
            }}
            style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.muted }]}
          >
            <View style={styles.icon}>
              <RepeatIcon size={18} color={colors.fgMuted} />
            </View>
            <Text style={{ flex: 1 }}>Custom…</Text>
            {value && !matched ? <Check size={18} color={colors.accent} /> : <ChevronRight size={16} color={colors.fgSubtle} />}
          </Pressable>
          {footnote ? (
            <Text variant="caption" tone="subtle" style={styles.footnote}>
              {footnote}
            </Text>
          ) : null}
        </View>
      )}
      {pickers.sheet}
    </Sheet>
  );
}

function defaultDraft(date: string): Repeat {
  return { frequency: 'weekly', interval: 1, weekdays: [isoWeekday(date)], end_date: null };
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50, paddingHorizontal: space.lg },
  icon: { width: 22, alignItems: 'center' },
  footnote: { paddingHorizontal: space.lg, paddingTop: space.sm },
  form: { paddingHorizontal: space.lg, gap: space.lg },
  endDate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderRadius: radius.md,
    marginTop: space.xs,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

/**
 * Building blocks shared by the new-habit and edit-habit screens
 * (mirrors frontend/src/components/Habits/HabitFormParts.tsx + habitOptions.ts).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CheckCircle2, Flame, Hash, ShieldAlert, type LucideIcon } from 'lucide-react-native';

import type { FrequencyType, HabitSchedule, HabitType } from '@/api/types';
import { Chip, Field, HABIT_ICONS, HabitTile, Segmented, Text, withAlpha } from '@/components/ui';
import { HABIT_TYPE_META, WEEKDAY_LETTERS } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { PRESET_COLORS, radius, space } from '@/theme/tokens';
import { Stepper } from './Stepper';

/* ---------- Options ---------- */

export const HABIT_TYPES: { value: HabitType; Icon: LucideIcon }[] = [
  { value: 'build_yesno', Icon: CheckCircle2 },
  { value: 'build_count', Icon: Hash },
  { value: 'avoid_count', Icon: ShieldAlert },
];

export const FREQUENCY_OPTIONS: { value: FrequencyType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Days' },
  { value: 'times_per_week', label: 'Per week' },
  { value: 'times_per_month', label: 'Per month' },
];

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DEFAULT_CATEGORIES = ['Health', 'Fitness', 'Learning', 'Mindfulness', 'Career', 'Personal'];

/* ---------- Schedule model ---------- */

export interface ScheduleDraft {
  frequency_type: FrequencyType;
  weekdays: number[];
  target_count: number;
  daily_target: number;
  /** Optional days for "N per week". Picking exactly N schedules the habit on those weekdays. */
  preferred_days?: number[];
}

/**
 * "3 times a week" can be pinned to days (Mon, Thu, Fri): picking exactly N days saves the habit
 * as a fixed weekdays schedule so it only appears (and counts) on them. No days keeps the flexible
 * weekly target. Mirrors resolveSchedule in the web app's habitOptions.ts.
 */
export function resolveSchedule(s: ScheduleDraft): { frequency_type: FrequencyType; weekdays: number[] } {
  const days = s.preferred_days ?? [];
  if (s.frequency_type === 'times_per_week' && days.length > 0 && days.length === s.target_count) {
    return { frequency_type: 'weekdays', weekdays: [...days].sort((a, b) => a - b) };
  }
  return { frequency_type: s.frequency_type, weekdays: s.weekdays };
}

/** Toggle a preferred day; once N are picked no more can be added (deselect one first). */
export function togglePreferredDay(current: number[], day: number, target: number): number[] {
  if (current.includes(day)) return current.filter((d) => d !== day);
  if (current.length >= target) return current;
  return [...current, day].sort((a, b) => a - b);
}

export function scheduleFromHabit(s?: HabitSchedule | null): ScheduleDraft {
  return {
    frequency_type: s?.frequency_type ?? 'daily',
    weekdays: s?.weekdays?.length ? [...s.weekdays].sort((a, b) => a - b) : [1, 2, 3, 4, 5],
    target_count: s?.target_count || 3,
    daily_target: s?.daily_target || 1,
    preferred_days: [],
  };
}

/** True when two drafts would produce a different schedule for this habit type. */
export function scheduleChanged(a: ScheduleDraft, b: ScheduleDraft, type: HabitType): boolean {
  if (a.frequency_type !== b.frequency_type) return true;
  if (a.frequency_type === 'weekdays' && a.weekdays.join() !== b.weekdays.join()) return true;
  if (a.frequency_type === 'times_per_week' && (a.preferred_days ?? []).join() !== (b.preferred_days ?? []).join())
    return true;
  if ((a.frequency_type === 'times_per_week' || a.frequency_type === 'times_per_month') && a.target_count !== b.target_count)
    return true;
  return type === 'build_count' && a.daily_target !== b.daily_target;
}

/** Returns an error message, or null when the schedule is valid. */
export function validateSchedule(s: ScheduleDraft, type: HabitType): string | null {
  if (type === 'avoid_count') return null;
  if (s.frequency_type === 'weekdays' && s.weekdays.length === 0) return 'Pick at least one day.';
  if (s.frequency_type === 'times_per_week' && (s.target_count < 1 || s.target_count > 7))
    return 'Times a week must be between 1 and 7.';
  const picked = s.preferred_days?.length ?? 0;
  if (s.frequency_type === 'times_per_week' && picked > 0 && picked !== s.target_count)
    return `Pick ${s.target_count} ${s.target_count === 1 ? 'day' : 'days'} (you have ${picked}), or clear the selection.`;
  if (s.frequency_type === 'times_per_month' && (s.target_count < 1 || s.target_count > 31))
    return 'Times a month must be between 1 and 31.';
  if (type === 'build_count' && !(s.daily_target > 0)) return 'Daily goal must be more than 0.';
  return null;
}

/** API payload for a schedule (avoid habits are always daily). */
export function schedulePayload(s: ScheduleDraft, type: HabitType) {
  const resolved = type === 'avoid_count' ? { frequency_type: 'daily' as const, weekdays: s.weekdays } : resolveSchedule(s);
  return {
    ...resolved,
    target_count: s.target_count,
    daily_target: type === 'build_count' ? s.daily_target : 1,
  };
}

/** Plain-language schedule summary for previews ("Mon, Wed · 8 per day"). */
export function scheduleSummary(s: ScheduleDraft, type: HabitType): string {
  if (type === 'avoid_count') return 'Every day · zero is a clean day';
  const target = type === 'build_count' ? ` · ${s.daily_target} per day` : '';
  switch (s.frequency_type) {
    case 'weekdays': {
      const days = [...s.weekdays].sort((a, b) => a - b);
      const label =
        days.length === 7
          ? 'Every day'
          : days.join() === '1,2,3,4,5'
            ? 'Weekdays'
            : days.join() === '6,7'
              ? 'Weekends'
              : days.map((d) => DAY_NAMES[d - 1]?.slice(0, 3)).join(', ') || 'No days';
      return label + target;
    }
    case 'times_per_week': {
      const picked = [...(s.preferred_days ?? [])].sort((a, b) => a - b).map((d) => DAY_NAMES[d - 1]?.slice(0, 3));
      return `${s.target_count}× a week${picked.length ? ` · ${picked.join(', ')}` : ''}${target}`;
    }
    case 'times_per_month':
      return `${s.target_count}× a month${target}`;
    default:
      return `Every day${target}`;
  }
}

/* ---------- Layout ---------- */

/** Uppercase group label + content block used to section the forms. */
export function FormSection({
  title,
  hint,
  children,
  right,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="caption" weight="semibold" tone="muted" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </Text>
        {right}
      </View>
      {hint ? (
        <Text variant="small" tone="muted" style={{ marginTop: -space.xs }}>
          {hint}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/* ---------- Pickers ---------- */

/** Optional "log a number when marking done" setting for Yes/No habits; no goal attached. */
export function NumberLogPicker({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Segmented<'off' | 'on'>
      value={value ? 'on' : 'off'}
      onChange={(v) => onChange(v === 'on')}
      options={[
        { value: 'off', label: 'Just mark done' },
        { value: 'on', label: 'Done + log a number' },
      ]}
    />
  );
}

/** Three option cards for the habit type. */
export function TypePicker({ value, onChange }: { value: HabitType; onChange: (t: HabitType) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
      {HABIT_TYPES.map(({ value: v, Icon }) => {
        const active = v === value;
        const meta = HABIT_TYPE_META[v];
        return (
          <Pressable
            key={v}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${meta.label}. ${meta.description}`}
            onPress={() => {
              if (!active) haptic.tap();
              onChange(v);
            }}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: active ? colors.accent : colors.lineStrong,
                backgroundColor: active ? colors.accentSoft : pressed ? colors.muted : colors.surface,
              },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: active ? colors.surface : colors.muted }]}>
              <Icon size={18} color={active ? colors.accentText : colors.fgMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text weight="semibold" color={active ? colors.accentText : colors.fg}>
                {meta.label}
              </Text>
              <Text variant="small" tone="muted">
                {meta.description}
              </Text>
            </View>
            <View style={[styles.radio, { borderColor: active ? colors.accent : colors.lineStrong }]}>
              {active ? <View style={[styles.radioDot, { backgroundColor: colors.accent }]} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** M T W T F S S toggles; 1=Mon … 7=Sun. */
export function WeekdayPicker({
  value,
  onChange,
  max,
}: {
  value: number[];
  onChange: (days: number[]) => void;
  /** Once this many days are picked, the rest are locked. */
  max?: number;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.weekdays}>
      {WEEKDAY_LETTERS.map((letter, i) => {
        const day = i + 1;
        const active = value.includes(day);
        const locked = !active && max !== undefined && value.length >= max;
        return (
          <Pressable
            key={day}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active, disabled: locked }}
            accessibilityLabel={DAY_NAMES[i]}
            disabled={locked}
            onPress={() => {
              haptic.tap();
              onChange(active ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b));
            }}
            style={[
              styles.weekday,
              {
                borderColor: active ? colors.accent : colors.lineStrong,
                backgroundColor: active ? colors.accent : colors.surface,
                opacity: locked ? 0.4 : 1,
              },
            ]}
          >
            <Text variant="small" weight="semibold" color={active ? colors.accentFg : colors.fgMuted}>
              {letter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Frequency segmented control + the controls each frequency needs. */
export function ScheduleEditor({
  value,
  onChange,
  type,
}: {
  value: ScheduleDraft;
  onChange: (s: ScheduleDraft) => void;
  type: HabitType;
}) {
  const set = (patch: Partial<ScheduleDraft>) => onChange({ ...value, ...patch });
  const perWeek = value.frequency_type === 'times_per_week';
  const perMonth = value.frequency_type === 'times_per_month';
  return (
    <View style={{ gap: space.lg }}>
      {type !== 'avoid_count' ? (
        <>
          <Segmented
            value={value.frequency_type}
            onChange={(f) =>
              set({
                frequency_type: f,
                target_count: f === 'times_per_week' ? Math.min(value.target_count, 7) : value.target_count,
                preferred_days: f === 'times_per_week' ? value.preferred_days : [],
              })
            }
            options={FREQUENCY_OPTIONS}
          />
          {value.frequency_type === 'weekdays' ? (
            <WeekdayPicker value={value.weekdays} onChange={(weekdays) => set({ weekdays })} />
          ) : null}
          {perWeek || perMonth ? (
            <Field label={perWeek ? 'Times a week' : 'Times a month'}>
              <Stepper
                label={perWeek ? 'Times a week' : 'Times a month'}
                value={value.target_count}
                onChange={(target_count) =>
                  set({ target_count, preferred_days: (value.preferred_days ?? []).slice(0, target_count) })
                }
                min={1}
                max={perWeek ? 7 : 31}
                suffix={perWeek ? 'days a week' : 'days a month'}
              />
            </Field>
          ) : null}
          {perWeek ? (
            <View style={{ gap: space.sm }}>
              <View style={styles.rowBetween}>
                <Text variant="small" weight="medium" tone="soft">
                  Choose days <Text variant="small" tone="subtle">(optional)</Text>
                </Text>
                {(value.preferred_days?.length ?? 0) > 0 ? (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => set({ preferred_days: [] })}>
                    <Text variant="small" tone="muted" style={{ textDecorationLine: 'underline' }}>
                      Clear
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <WeekdayPicker
                value={value.preferred_days ?? []}
                onChange={(days) => set({ preferred_days: days })}
                max={value.target_count}
              />
              <Text variant="caption" tone="subtle">
                {(() => {
                  const picked = value.preferred_days ?? [];
                  if (picked.length === 0) return `Leave empty to do it ${value.target_count}× a week on any days.`;
                  if (picked.length === value.target_count)
                    return `Scheduled every ${picked.map((d) => DAY_NAMES[d - 1]?.slice(0, 3)).join(', ')}.`;
                  const more = value.target_count - picked.length;
                  return `${picked.length} of ${value.target_count} picked. Choose ${more} more, or clear to log any days.`;
                })()}
              </Text>
            </View>
          ) : null}
        </>
      ) : (
        <Text variant="small" tone="muted">
          Avoid habits are checked every day. Log slips when they happen; zero is a clean day.
        </Text>
      )}
      {type === 'build_count' ? (
        <Field label="Daily goal" hint="Pages, glasses, minutes…">
          <Stepper
            label="Daily goal"
            value={value.daily_target}
            onChange={(daily_target) => set({ daily_target })}
            min={0.5}
            max={10000}
            decimal
            suffix="per day"
          />
        </Field>
      ) : null}
    </View>
  );
}

/** Icon grid. */
export function IconPicker({ value, color, onChange }: { value: string; color: string; onChange: (i: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.iconGrid}>
      {HABIT_ICONS.map(({ name, Icon }) => {
        const active = name.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={name}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`Icon ${name}`}
            onPress={() => {
              haptic.tap();
              onChange(name);
            }}
            style={({ pressed }) => [
              styles.iconCell,
              {
                borderColor: active ? color : colors.line,
                backgroundColor: active ? withAlpha(color, 0.14) : pressed ? colors.muted : colors.surface,
              },
            ]}
          >
            <Icon size={20} color={active ? color : colors.fgMuted} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Color swatches (stored on the server, so raw hex is fine here). */
export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.swatches}>
      {PRESET_COLORS.map((c) => {
        const active = c.toLowerCase() === value.toLowerCase();
        return (
          <Pressable
            key={c}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`Color ${c}`}
            hitSlop={4}
            onPress={() => {
              haptic.tap();
              onChange(c);
            }}
            style={[styles.swatchRing, { borderColor: active ? c : 'transparent' }]}
          >
            <View style={[styles.swatch, { backgroundColor: c, borderColor: colors.surface }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontal suggestion chips under the category input. */
export function CategorySuggestions({
  value,
  suggestions,
  onPick,
}: {
  value: string;
  suggestions: string[];
  onPick: (c: string) => void;
}) {
  if (!suggestions.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: space.sm }}
    >
      {suggestions.map((s) => (
        <Chip key={s} label={s} selected={s.toLowerCase() === value.trim().toLowerCase()} onPress={() => onPick(s)} />
      ))}
    </ScrollView>
  );
}

/** Merge existing habit categories with defaults, de-duplicated, existing first. */
export function categorySuggestions(existing: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...existing, ...DEFAULT_CATEGORIES]) {
    const t = c?.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

/** Live preview row of what the habit will look like in lists. */
export function HabitPreview({ name, icon, color, meta }: { name: string; icon: string; color: string; meta: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <HabitTile icon={icon} color={color} size={40} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text weight="semibold" numberOfLines={1} tone={name.trim() ? 'fg' : 'subtle'}>
          {name.trim() || 'Your habit'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Flame size={12} color={colors.fgSubtle} />
          <Text variant="caption" tone="subtle">
            0
          </Text>
          <Text variant="caption" tone="subtle" numberOfLines={1} style={{ flex: 1, marginLeft: space.xs }}>
            {meta}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { letterSpacing: 0.5 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  optionIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.75, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  weekdays: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  weekday: {
    flex: 1,
    maxWidth: 44,
    aspectRatio: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  iconCell: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatchRing: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

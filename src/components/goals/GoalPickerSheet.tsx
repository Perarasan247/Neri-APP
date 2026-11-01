import React, { useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ChevronRight, CircleOff, Link2, Plus } from 'lucide-react-native';

import type { Goal } from '@/api/types';
import { Sheet, Text, useDisclosure } from '@/components/ui';
import { useCurrentGoals, useGoalLookup } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { LEVEL_META } from '@/lib/goals';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { GoalGlyph } from './GoalCard';

export interface GoalSection {
  title: string;
  goals: Goal[];
}

/**
 * Bottom sheet listing goals in sections, plus "No goal". `onSelect` runs once the sheet has
 * slid away, so it can open another modal or navigate.
 */
export function GoalPickerSheet({
  visible,
  onClose,
  title = 'Goal',
  sections,
  value,
  onSelect,
  noneLabel = 'No goal',
  loading,
  emptyHint,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  sections: GoalSection[];
  value?: string | null;
  onSelect: (goal: Goal | null) => void;
  noneLabel?: string;
  loading?: boolean;
  emptyHint?: string;
  /** Shows a "New goal" row. */
  onCreate?: () => void;
}) {
  const { colors } = useTheme();
  const pending = useRef<(() => void) | null>(null);
  const pick = (fn: () => void) => {
    haptic.tap();
    pending.current = fn;
    onClose();
  };
  const filled = sections.filter((s) => s.goals.length > 0);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      onDismissed={() => {
        const run = pending.current;
        pending.current = null;
        run?.();
      }}
    >
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: space.sm }} showsVerticalScrollIndicator={false}>
        <Row
          icon={<CircleOff size={18} color={colors.fgMuted} />}
          label={noneLabel}
          selected={!value}
          onPress={() => pick(() => onSelect(null))}
        />
        {filled.map((s) => (
          <View key={s.title}>
            <Text variant="caption" weight="semibold" tone="muted" style={styles.section}>
              {s.title.toUpperCase()}
            </Text>
            {s.goals.map((g) => (
              <Row
                key={g.id}
                icon={<GoalGlyph color={g.color} size={26} />}
                label={g.title}
                hint={g.progress_label}
                selected={g.id === value}
                onPress={() => pick(() => onSelect(g))}
              />
            ))}
          </View>
        ))}
        {!filled.length && !loading && emptyHint ? (
          <Text variant="small" tone="muted" style={styles.empty}>
            {emptyHint}
          </Text>
        ) : null}
        {onCreate ? (
          <Row icon={<Plus size={18} color={colors.accent} />} label="New goal…" accent onPress={() => pick(onCreate)} />
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

function Row({
  icon,
  label,
  hint,
  selected,
  accent,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  selected?: boolean;
  accent?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="menuitem"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
    >
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <Text style={{ flex: 1 }} numberOfLines={2} tone={accent ? 'accent' : 'fg'} weight={accent ? 'semibold' : 'regular'}>
        {label}
      </Text>
      {hint ? (
        <Text variant="small" tone="subtle" tabular>
          {hint}
        </Text>
      ) : null}
      {selected ? <Check size={18} color={colors.accent} /> : null}
    </Pressable>
  );
}

/**
 * Goals a task or habit can serve: this week's, month's and year's active goals, plus the
 * goal it is linked to now (even when that one is from another period).
 */
export function useLinkableGoals(value?: string | null, enabled = true) {
  const current = useCurrentGoals(enabled);
  const all = useGoalLookup(enabled && !!value);
  const active = (l: Goal[] | undefined) => (l ?? []).filter((g) => g.status === 'active' || g.id === value);
  const sections: GoalSection[] = [
    { title: 'This week', goals: active(current.data?.weekly) },
    { title: 'This month', goals: active(current.data?.monthly) },
    { title: 'This year', goals: active(current.data?.yearly) },
  ];
  const linked = value ? all?.find((g) => g.id === value) : undefined;
  if (linked && !sections.some((s) => s.goals.some((g) => g.id === linked.id))) {
    sections.unshift({ title: `Linked · ${LEVEL_META[linked.level].label} · ${linked.period_label}`, goals: [linked] });
  }
  return { sections, linked: linked ?? sections.flatMap((s) => s.goals).find((g) => g.id === value), loading: current.isPending };
}

/** Form row + picker for linking a habit (or anything) to one of the current goals. */
export function GoalLinkField({ value, onChange }: { value: string | null; onChange: (goalId: string | null) => void }) {
  const { colors } = useTheme();
  const sheet = useDisclosure();
  const goals = useLinkableGoals(value);
  const goal = goals.linked;
  return (
    <>
      <Pressable
        onPress={() => {
          haptic.tap();
          sheet.show();
        }}
        accessibilityRole="button"
        accessibilityLabel={`Goal: ${goal?.title ?? 'none'}`}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: pressed ? colors.muted : colors.surface, borderColor: colors.lineStrong },
        ]}
      >
        {goal ? <GoalGlyph color={goal.color} size={28} /> : <Link2 size={18} color={colors.fgMuted} style={{ marginHorizontal: 5 }} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} tone={value ? 'fg' : 'subtle'}>
            {goal?.title ?? (value ? 'Linked goal' : 'No goal')}
          </Text>
          {goal ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {`${LEVEL_META[goal.level].label} · ${goal.period_label}`}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={16} color={colors.fgSubtle} />
      </Pressable>
      <GoalPickerSheet
        visible={sheet.open}
        onClose={sheet.hide}
        sections={goals.sections}
        value={value}
        loading={goals.loading}
        emptyHint="No active goals this week, month or year. Set one from Browse → Goals."
        onSelect={(g) => onChange(g?.id ?? null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    paddingHorizontal: space.md,
    borderRadius: radius.md + 2,
    borderWidth: 1,
  },
  section: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xs, letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 50, paddingHorizontal: space.lg },
  empty: { paddingHorizontal: space.lg, paddingVertical: space.md },
});

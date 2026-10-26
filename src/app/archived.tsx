import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Archive, BarChart3, MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react-native';

import type { Habit } from '@/api/types';
import { ReopenSheet } from '@/components/habits/ReopenSheet';
import {
  ActionSheet,
  Badge,
  EmptyState,
  ErrorState,
  HabitTile,
  IconButton,
  ListSkeleton,
  Text,
  useDialog,
  useToast,
} from '@/components/ui';
import { useDeleteHabit, useHabits } from '@/hooks/queries';
import { HABIT_TYPE_META, friendlyDate, parseISODate, pluralize } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** "12 Jan 2026" */
const fullDate = (d: string) =>
  parseISODate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** Archived habits: reopen, view insights or delete permanently. */
export default function ArchivedScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const dialog = useDialog();
  const habits = useHabits('archived');
  const remove = useDeleteHabit();
  const [menuFor, setMenuFor] = useState<Habit | null>(null);
  const [reopenFor, setReopenFor] = useState<Habit | null>(null);

  const openInsights = (h: Habit) => router.push({ pathname: '/habit/[id]', params: { id: h.id } });

  const confirmDelete = (h: Habit) =>
    dialog.alert('Delete permanently?', `“${h.name}” and all of its history will be erased. This can’t be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete forever',
        style: 'destructive',
        onPress: () =>
          remove.mutate(
            { id: h.id, keepData: false },
            {
              onSuccess: () => {
                haptic.warning();
                toast('Habit deleted');
              },
              onError: (e) => toast(e.message, { tone: 'danger' }),
            },
          ),
      },
    ]);

  const list = habits.data ?? [];

  let content: React.ReactNode;
  if (habits.isPending) {
    content = (
      <View style={{ padding: space.lg }}>
        <ListSkeleton rows={4} />
      </View>
    );
  } else if (habits.error && !habits.data) {
    content = <ErrorState error={habits.error} onRetry={() => habits.refetch()} />;
  } else {
    content = (
      <FlatList
        data={list}
        keyExtractor={(h) => h.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xxl }]}
        refreshControl={
          <RefreshControl
            refreshing={habits.isRefetching}
            onRefresh={() => void habits.refetch()}
            tintColor={colors.fgSubtle}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          list.length ? (
            <Text variant="small" tone="muted" style={{ marginBottom: space.md }}>
              History is kept. Reopen any habit and the paused time won’t count against you.
            </Text>
          ) : undefined
        }
        ListEmptyComponent={
          <EmptyState
            icon={<Archive size={24} color={colors.fgSubtle} />}
            title="Nothing archived"
            description="When you stop a habit and keep its history, it shows up here."
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        renderItem={({ item }) => (
          <ArchivedRow habit={item} onPress={() => openInsights(item)} onMore={() => setMenuFor(item)} />
        )}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Archived habits' }} />
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>{content}</View>

      <ActionSheet
        visible={Boolean(menuFor)}
        onClose={() => setMenuFor(null)}
        title={menuFor?.name}
        options={
          menuFor
            ? [
                {
                  label: 'Reopen habit',
                  icon: <RotateCcw size={18} color={colors.fgSoft} />,
                  onPress: () => setReopenFor(menuFor),
                },
                {
                  label: 'View insights',
                  icon: <BarChart3 size={18} color={colors.fgSoft} />,
                  onPress: () => openInsights(menuFor),
                },
                {
                  label: 'Delete permanently',
                  icon: <Trash2 size={18} color={colors.danger} />,
                  destructive: true,
                  onPress: () => confirmDelete(menuFor),
                },
              ]
            : []
        }
      />
      <ReopenSheet habit={reopenFor} onClose={() => setReopenFor(null)} />
    </>
  );
}

function ArchivedRow({ habit, onPress, onMore }: { habit: Habit; onPress: () => void; onMore: () => void }) {
  const { colors } = useTheme();
  const periods = [...habit.periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const archivedOn = periods
    .map((p) => p.end_date)
    .filter((d): d is string => Boolean(d))
    .pop();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => {
        haptic.light();
        onMore();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${habit.name}, archived${archivedOn ? ` ${fullDate(archivedOn)}` : ''}. Opens insights.`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.subtle : colors.surface, borderColor: colors.line },
      ]}
    >
      <HabitTile icon={habit.icon} color={habit.color} size={40} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {habit.name}
          </Text>
          <Badge label="Archived" tone="warning" dot />
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {HABIT_TYPE_META[habit.type].label}
          {habit.category ? ` · ${habit.category}` : ''}
          {periods.length > 1 ? ` · ${pluralize(periods.length, 'stretch', 'stretches')}` : ''}
        </Text>
        <View style={{ marginTop: space.xs, gap: 2 }}>
          {periods.map((p) => (
            <Text key={p.id} variant="caption" tone="subtle" tabular numberOfLines={1}>
              {fullDate(p.start_date)} – {p.end_date ? fullDate(p.end_date) : 'ongoing'}
            </Text>
          ))}
        </View>
        {archivedOn ? (
          <Text variant="caption" tone="soft" style={{ marginTop: space.xs }}>
            Archived {friendlyDate(archivedOn)}
          </Text>
        ) : null}
      </View>
      <IconButton label={`More actions for ${habit.name}`} onPress={onMore} size={36}>
        <MoreHorizontal size={20} color={colors.fgMuted} />
      </IconButton>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

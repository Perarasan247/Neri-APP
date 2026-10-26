import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Calendar, Clock, ListChecks, MapPin, Repeat } from 'lucide-react-native';

import type { Todo } from '@/api/types';
import { Checkbox, Text, useToast } from '@/components/ui';
import { useToggleTodo } from '@/hooks/queries';
import { diffDays, friendlyDate, priorityColor, taskTimeLabel, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

interface TaskRowProps {
  todo: Todo;
  /** Hide the date chip (e.g. inside a section already grouped by that day). */
  hideDate?: boolean;
  /** Hide the "#Category" label on the right. */
  hideCategory?: boolean;
  /** Render as a standalone rounded card (default) or a flat list row. */
  variant?: 'card' | 'flat';
}

/**
 * One task: priority-colored round checkbox, title, description preview and a
 * meta line (date, time, subtasks, location, category). Tapping opens the task.
 */
export const TaskRow = memo(function TaskRow({ todo, hideDate, hideCategory, variant = 'card' }: TaskRowProps) {
  const { colors } = useTheme();
  const toggle = useToggleTodo();
  const toast = useToast();

  const done = todo.status === 'completed';
  const ref = today();
  const overdue = !done && !!todo.due_date && diffDays(todo.due_date, ref) < 0;
  const dueToday = !done && todo.due_date === ref;
  const time = taskTimeLabel(todo);
  const subtasks = todo.subtasks ?? [];
  const subDone = subtasks.filter((s) => s.completed).length;

  const dateColor = overdue ? colors.danger : dueToday ? colors.success : colors.fgMuted;

  const onToggle = () =>
    toggle.mutate(todo.id, {
      onSuccess: () => {
        if (!done) toast('Task completed', { action: { label: 'Undo', onPress: () => toggle.mutate(todo.id) } });
      },
      onError: (e) => toast(e.message, { tone: 'danger' }),
    });

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/task/[id]', params: { id: todo.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${todo.title}${done ? ', completed' : ''}`}
      style={({ pressed }) => [
        styles.row,
        variant === 'card' && [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }],
        pressed && { backgroundColor: colors.subtle },
      ]}
    >
      <View style={styles.check}>
        <Checkbox
          checked={done}
          onChange={onToggle}
          color={priorityColor(todo.priority, colors)}
          label={done ? 'Mark task as not done' : 'Complete task'}
        />
      </View>

      <View style={styles.body}>
        <Text numberOfLines={2} tone={done ? 'subtle' : 'fg'} strike={done}>
          {todo.title}
        </Text>
        {todo.description ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {todo.description}
          </Text>
        ) : null}

        <View style={styles.meta}>
          {!hideDate && todo.due_date ? (
            <View style={styles.metaItem}>
              <Calendar size={13} color={dateColor} />
              <Text variant="caption" color={dateColor} weight={overdue || dueToday ? 'medium' : 'regular'}>
                {friendlyDate(todo.due_date, ref)}
              </Text>
            </View>
          ) : null}
          {time ? (
            <View style={styles.metaItem}>
              <Clock size={13} color={colors.fgMuted} />
              <Text variant="caption" tone="muted" tabular>
                {time}
              </Text>
            </View>
          ) : null}
          {todo.series_id ? (
            <View style={styles.metaItem} accessibilityLabel="Repeating task">
              <Repeat size={13} color={colors.fgMuted} />
            </View>
          ) : null}
          {subtasks.length > 0 ? (
            <View style={styles.metaItem}>
              <ListChecks size={13} color={colors.fgMuted} />
              <Text variant="caption" tone="muted" tabular>
                {subDone}/{subtasks.length}
              </Text>
            </View>
          ) : null}
          {todo.location ? (
            <View style={[styles.metaItem, { flexShrink: 1 }]}>
              <MapPin size={13} color={colors.fgMuted} />
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {todo.location}
              </Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {!hideCategory && todo.category ? (
            <Text variant="caption" tone="subtle" numberOfLines={1}>
              #{todo.category}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.md },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  check: { paddingTop: 1 },
  body: { flex: 1, minWidth: 0, gap: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

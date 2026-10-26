import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';

import type { Subtask } from '@/api/types';
import { Checkbox, IconButton, requestReveal, Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { font, space } from '@/theme/tokens';
import { subtaskId } from './taskOptions';

interface SubtaskListProps {
  subtasks: Subtask[];
  /** Called with the full new list (saved via useUpdateSubtasks). */
  onChange: (next: Subtask[]) => void;
  color?: string;
}

/** Checklist with inline rename, delete and an "Add subtask" input. */
export function SubtaskList({ subtasks, onChange, color }: SubtaskListProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');

  const add = () => {
    const title = draft.trim();
    if (!title) return;
    onChange([...subtasks, { id: subtaskId(), title, completed: false }]);
    setDraft('');
  };

  return (
    <View>
      {subtasks.map((s) => (
        <SubtaskRow
          key={s.id}
          subtask={s}
          color={color}
          onToggle={() => onChange(subtasks.map((x) => (x.id === s.id ? { ...x, completed: !x.completed } : x)))}
          onRename={(title) => onChange(subtasks.map((x) => (x.id === s.id ? { ...x, title } : x)))}
          onDelete={() => onChange(subtasks.filter((x) => x.id !== s.id))}
        />
      ))}
      <View style={styles.row}>
        <View style={styles.lead}>
          <Plus size={18} color={colors.accent} />
        </View>
        <TextInput
          onFocus={requestReveal}
          value={draft}
          onChangeText={setDraft}
          placeholder="Add subtask"
          placeholderTextColor={colors.fgSubtle}
          selectionColor={colors.accent}
          returnKeyType="done"
          submitBehavior="submit"
          onSubmitEditing={add}
          onBlur={add}
          accessibilityLabel="Add subtask"
          style={[styles.input, { color: colors.fg }]}
        />
      </View>
    </View>
  );
}

function SubtaskRow({
  subtask,
  color,
  onToggle,
  onRename,
  onDelete,
}: {
  subtask: Subtask;
  color?: string;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(subtask.title);

  const commit = () => {
    const next = title.trim();
    if (!next) setTitle(subtask.title);
    else if (next !== subtask.title) onRename(next);
  };

  return (
    <View style={styles.row}>
      <View style={styles.lead}>
        <Checkbox
          checked={subtask.completed}
          onChange={onToggle}
          size={20}
          color={color}
          label={subtask.completed ? `Mark ${subtask.title} as not done` : `Complete ${subtask.title}`}
        />
      </View>
      <TextInput
        onFocus={requestReveal}
        value={title}
        onChangeText={setTitle}
        onEndEditing={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        selectionColor={colors.accent}
        accessibilityLabel="Subtask title"
        style={[
          styles.input,
          { color: subtask.completed ? colors.fgSubtle : colors.fg },
          subtask.completed && { textDecorationLine: 'line-through' },
        ]}
      />
      <IconButton label={`Delete ${subtask.title}`} size={32} onPress={onDelete}>
        <X size={16} color={colors.fgSubtle} />
      </IconButton>
    </View>
  );
}

/** "2/5" progress label for the subtasks header. */
export function SubtaskProgress({ subtasks }: { subtasks: Subtask[] }) {
  if (!subtasks.length) return null;
  const done = subtasks.filter((s) => s.completed).length;
  return (
    <Text variant="small" tone="subtle" tabular>
      {done}/{subtasks.length}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space.sm },
  lead: { width: 28, alignItems: 'center' },
  input: { ...font.body, flex: 1, paddingVertical: space.sm },
});

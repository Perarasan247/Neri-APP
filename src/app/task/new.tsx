import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowUp, Calendar, CalendarX, CalendarDays, ChevronDown, Clock, Flag, Hash, Repeat as RepeatIcon, X } from 'lucide-react-native';

import type { Repeat, TodoPriority } from '@/api/types';
import {
  ActionSheet,
  Chip,
  KeyboardAvoider,
  KeyboardScrollView,
  requestReveal,
  Text,
  useDisclosure,
  useToast,
  type MenuOption,
} from '@/components/ui';
import { CategoryPicker } from '@/components/tasks/CategoryPicker';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { RepeatSheet } from '@/components/tasks/RepeatSheet';
import { chipText, parseQuickAdd, stripToken, type ChipType } from '@/components/tasks/quickAdd';
import {
  afterSheet,
  collectCategories,
  DEFAULT_CATEGORY,
  DEFAULT_PRIORITY,
  PriorityFlag,
  priorityMenu,
  quickDates,
} from '@/components/tasks/taskOptions';
import { useCreateTodo, useTodos } from '@/hooks/queries';
import { haptic } from '@/lib/haptics';
import { formatTime, friendlyDate, PRIORITY_META, priorityColor, today } from '@/lib/format';
import { describeRepeat, nextMatchingDate } from '@/lib/repeat';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CHIP_ICONS: Record<ChipType, typeof Calendar> = {
  date: Calendar,
  time: Clock,
  priority: Flag,
  category: Hash,
  repeat: RepeatIcon,
};

/**
 * Quick add: a bottom popup (transparentModal) that is as tall as its content, rises above the keyboard,
 * and closes on backdrop tap or back. Natural language in the title
 * ("Pay rent tomorrow 9am p1 #Finance") becomes removable chips; the toolbar
 * sets anything the text doesn't.
 */
export default function NewTaskScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const pickers = usePickers();
  const create = useCreateTodo();
  const all = useTodos({});
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string; time?: string }>();
  const ref = today();

  const [text, setText] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState<string | null>(params.date && ISO_DATE.test(params.date) ? params.date : ref);
  const [time, setTime] = useState<{ start: string; end?: string } | null>(() =>
    params.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(params.time) ? { start: params.time } : null,
  );
  const [priority, setPriority] = useState<TodoPriority>(DEFAULT_PRIORITY);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [ignored, setIgnored] = useState<ReadonlySet<ChipType>>(new Set());

  const dateSheet = useDisclosure();
  const prioritySheet = useDisclosure();
  const categorySheet = useDisclosure();
  const repeatSheet = useDisclosure();

  const parsed = parseQuickAdd(text, ignored);
  const has = (type: ChipType) => parsed.chips.some((c) => c.type === type);

  // Parsed values win over toolbar values
  const effRepeat = has('repeat') ? (parsed.repeat ?? null) : repeat;
  // A repeating task needs a date: default to today, then the first day that fits the rule
  const dueDate = effRepeat
    ? nextMatchingDate(has('date') ? (parsed.dueDate ?? ref) : (date ?? ref), effRepeat)
    : (parsed.dueDate ?? date ?? undefined);
  const start = has('time') ? parsed.startTime : time?.start;
  const end = has('time') ? parsed.endTime : time?.end;
  const effPriority = parsed.priority ?? priority;
  const effCategory = parsed.category ?? category;

  const categories = collectCategories(all.data, true);
  if (!categories.includes(effCategory)) categories.unshift(effCategory);

  const canSend = parsed.title.trim().length > 0 && !create.isPending;

  /** Toolbar override: drop the matching token from the text so it doesn't fight the picker. */
  const override = (type: ChipType) => {
    if (has(type)) setText((t) => stripToken(t, type));
  };

  const ignore = (type: ChipType) => {
    haptic.tap();
    setIgnored((s) => new Set([...s, type]));
  };

  const onChangeText = (t: string) => {
    setText(t);
    if (!t.trim() && ignored.size) setIgnored(new Set());
  };

  // The route fades in over the previous screen; the backdrop and card animate themselves
  const [anim] = useState(() => new Animated.Value(0));
  const closing = useRef(false);
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  const close = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(anim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(
      () => router.back(),
    );
  };

  const submit = () => {
    if (!canSend) return;
    create.mutate(
      {
        title: parsed.title.trim(),
        description: description.trim() || undefined,
        due_date: dueDate,
        due_time: start,
        start_time: start,
        end_time: end,
        priority: effPriority,
        category: effCategory,
        repeat: effRepeat ?? undefined,
      },
      {
        onSuccess: () => {
          haptic.success();
          toast('Task added', { tone: 'success' });
          router.back();
        },
        onError: (e) => toast(e.message, { tone: 'danger' }),
      },
    );
  };

  const dateOptions: MenuOption[] = [
    ...quickDates(ref).map((q) => ({
      label: q.label,
      hint: friendlyDate(q.value, ref) === q.label ? undefined : friendlyDate(q.value, ref),
      icon: <Calendar size={18} color={colors.fgMuted} />,
      selected: dueDate === q.value,
      onPress: () => {
        override('date');
        setDate(q.value);
      },
    })),
    {
      label: 'Pick date…',
      icon: <CalendarDays size={18} color={colors.fgMuted} />,
      onPress: () =>
        afterSheet(() =>
          pickers.pickDate(dueDate, (d) => {
            override('date');
            setDate(d);
          }),
        ),
    },
    {
      label: 'No date',
      icon: <CalendarX size={18} color={colors.fgMuted} />,
      selected: !dueDate,
      onPress: () => {
        override('date');
        setDate(null);
      },
    },
  ];

  const pickTime = () =>
    pickers.pickTime(
      start,
      (hhmm) => {
        override('time');
        setTime({ start: hhmm });
      },
      start
        ? {
            onClear: () => {
              override('time');
              setTime(null);
            },
          }
        : {},
    );

  const timeLabel = start ? (end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start)) : 'Time';
  const pColor = priorityColor(effPriority, colors);
  const dateTint = !dueDate ? undefined : dueDate < ref ? colors.danger : dueDate === ref ? colors.success : undefined;

  return (
    <View style={styles.host}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <KeyboardAvoider style={styles.avoider} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] }) }],
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
          <KeyboardScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.root, { paddingBottom: Math.max(insets.bottom, space.md) }]}
            showsVerticalScrollIndicator={false}
          >
        <TextInput
          value={text}
          onChangeText={onChangeText}
          placeholder="e.g. Pay rent tomorrow 9am p1 #Finance"
          placeholderTextColor={colors.fgSubtle}
          selectionColor={colors.accent}
          autoFocus
          onFocus={requestReveal}
          returnKeyType="send"
          onSubmitEditing={submit}
          submitBehavior="submit"
          accessibilityLabel="Task name"
          style={[styles.title, { color: colors.fg }]}
        />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Description"
          placeholderTextColor={colors.fgSubtle}
          selectionColor={colors.accent}
          multiline
          onFocus={requestReveal}
          accessibilityLabel="Description"
          style={[styles.description, { color: colors.fgSoft }]}
        />

        {parsed.chips.length ? (
          <View style={styles.parsed}>
            {parsed.chips.map((c) => {
              const Icon = CHIP_ICONS[c.type];
              const tint = c.type === 'priority' ? priorityColor(c.value as TodoPriority, colors) : colors.accent;
              const label = c.type === 'date' ? friendlyDate(c.value, ref) : chipText(c.label);
              return (
                <Pressable
                  key={c.type}
                  onPress={() => ignore(c.type)}
                  accessibilityRole="button"
                  accessibilityLabel={`${label}, detected. Tap to keep as text`}
                  style={[styles.parsedChip, { backgroundColor: colors.accentSoft }]}
                >
                  <Icon size={13} color={tint} />
                  <Text variant="caption" weight="semibold" color={c.type === 'priority' ? tint : colors.accentText}>
                    {label}
                  </Text>
                  <X size={12} color={colors.accentText} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          style={styles.toolbarScroll}
          contentContainerStyle={styles.toolbar}
        >
          <Chip
            label={dueDate ? friendlyDate(dueDate, ref) : 'Date'}
            selected={!!dueDate}
            color={dateTint}
            icon={<Calendar size={14} color={dueDate ? (dateTint ?? colors.accentText) : colors.fgMuted} />}
            onPress={dateSheet.show}
          />
          <Chip
            label={timeLabel}
            selected={!!start}
            icon={<Clock size={14} color={start ? colors.accentText : colors.fgMuted} />}
            onPress={pickTime}
          />
          <Chip
            label={PRIORITY_META[effPriority].short}
            selected={effPriority !== 'low'}
            color={pColor}
            icon={<PriorityFlag priority={effPriority} colors={colors} size={14} />}
            onPress={prioritySheet.show}
          />
          <Chip
            label={effRepeat ? describeRepeat(effRepeat, dueDate) : 'Repeat'}
            selected={!!effRepeat}
            icon={<RepeatIcon size={14} color={effRepeat ? colors.accentText : colors.fgMuted} />}
            onPress={repeatSheet.show}
          />
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: colors.line }]}>
          <Pressable
            onPress={() => {
              haptic.tap();
              categorySheet.show();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Category ${effCategory}`}
            hitSlop={8}
            style={({ pressed }) => [styles.category, pressed && { backgroundColor: colors.muted }]}
          >
            <Hash size={15} color={colors.fgMuted} />
            <Text variant="small" weight="medium" tone="soft" numberOfLines={1}>
              {effCategory}
            </Text>
            <ChevronDown size={15} color={colors.fgMuted} />
          </Pressable>

          <Pressable
            onPress={submit}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Add task"
            accessibilityState={{ disabled: !canSend, busy: create.isPending }}
            style={({ pressed }) => [
              styles.send,
              { backgroundColor: pressed ? colors.accentPressed : colors.accent, opacity: canSend || create.isPending ? 1 : 0.4 },
            ]}
          >
            {create.isPending ? (
              <ActivityIndicator size="small" color={colors.accentFg} />
            ) : (
              <ArrowUp size={20} color={colors.accentFg} strokeWidth={2.5} />
            )}
          </Pressable>
        </View>
          </KeyboardScrollView>
        </Animated.View>
      </KeyboardAvoider>

      <ActionSheet visible={dateSheet.open} onClose={dateSheet.hide} title="Due date" options={dateOptions} />
      <ActionSheet
        visible={prioritySheet.open}
        onClose={prioritySheet.hide}
        title="Priority"
        options={priorityMenu(effPriority, (p) => {
          override('priority');
          setPriority(p);
        }, colors)}
      />
      <CategoryPicker
        visible={categorySheet.open}
        onClose={categorySheet.hide}
        categories={categories}
        value={effCategory}
        onSelect={(c) => {
          override('category');
          setCategory(c);
        }}
      />
      <RepeatSheet
        visible={repeatSheet.open}
        onClose={repeatSheet.hide}
        value={effRepeat}
        date={dueDate ?? ref}
        onSelect={(r) => {
          override('repeat');
          setRepeat(r);
          if (r && !dueDate) setDate(ref);
        }}
      />
      {pickers.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  avoider: { justifyContent: 'flex-end' },
  card: { maxHeight: '85%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: space.sm },
  scroll: { flexGrow: 0 },
  root: { paddingTop: space.lg, paddingHorizontal: space.lg },
  title: { ...font.title, fontWeight: '600', paddingVertical: space.xs },
  description: { ...font.small, paddingVertical: space.xs, maxHeight: 120 },
  parsed: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs + 2, marginTop: space.sm },
  parsedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 24,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
  },
  toolbarScroll: { marginHorizontal: -space.lg, marginTop: space.md },
  toolbar: { paddingHorizontal: space.lg, gap: space.sm, paddingBottom: space.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexShrink: 1,
    paddingHorizontal: space.sm,
    height: 32,
    borderRadius: radius.md,
    marginLeft: -space.sm,
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

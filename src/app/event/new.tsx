import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlignLeft, CalendarDays, Check, Clock, Hash, ListTodo, MapPin, Palette, Repeat as RepeatIcon, X } from 'lucide-react-native';

import type { Repeat } from '@/api/types';
import {
  KeyboardAvoider,
  KeyboardScrollView,
  requestReveal,
  Text,
  useDisclosure,
  useToast,
  withAlpha,
} from '@/components/ui';
import { CategoryPicker } from '@/components/tasks/CategoryPicker';
import { usePickers } from '@/components/tasks/DatePickerSheet';
import { RepeatSheet } from '@/components/tasks/RepeatSheet';
import { collectCategories } from '@/components/tasks/taskOptions';
import { useCreateTodo, useTodos } from '@/hooks/queries';
import { formatTime, longDate, today } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { describeRepeat, nextMatchingDate } from '@/lib/repeat';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Same palette as the web event dialog. */
const COLORS = [
  { name: 'Indigo', hex: '#635bff' },
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Purple', hex: '#a855f7' },
  { name: 'Sky', hex: '#0284c7' },
];

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const duration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
};
/** The next full hour, capped so the default hour still fits in the day. */
const nextHour = () => fromMin(Math.min(22, new Date().getHours() + 1) * 60);

/** A calendar event composer: title on a colour band, date and time range, then detail rows (as on web). */
export default function NewEventScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const pickers = usePickers();
  const create = useCreateTodo();
  const all = useTodos({});
  const { height: windowHeight } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string; time?: string; end?: string }>();
  const ref = today();

  const initStart = params.time && HHMM.test(params.time) ? params.time : nextHour();
  const initEnd =
    params.end && HHMM.test(params.end) && toMin(params.end) > toMin(initStart)
      ? params.end
      : fromMin(Math.min(1439, toMin(initStart) + 60));

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(params.date && ISO_DATE.test(params.date) ? params.date : ref);
  const [start, setStart] = useState(initStart);
  const [end, setEnd] = useState(initEnd);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [color, setColor] = useState(COLORS[0].hex);
  const [category, setCategory] = useState('Personal');
  const [repeat, setRepeat] = useState<Repeat | null>(null);
  const [showInTasks, setShowInTasks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repeatSheet = useDisclosure();
  const categorySheet = useDisclosure();
  const categories = collectCategories(all.data, true);
  if (!categories.includes(category)) categories.unshift(category);

  const dateText = longDate(date);
  const summary = useMemo(() => {
    if (allDay) return `${dateText} · All day`;
    return `${dateText} · ${formatTime(start)} – ${formatTime(end)} (${duration(Math.max(0, toMin(end) - toMin(start)))})`;
  }, [allDay, dateText, start, end]);

  // Moving the start keeps the event's length, like the web dialog
  const pickStart = (t: string) => {
    const length = Math.max(15, toMin(end) - toMin(start));
    setStart(t);
    setEnd(fromMin(Math.min(1439, toMin(t) + length)));
  };
  const pickEnd = (t: string) => {
    if (toMin(t) <= toMin(start)) {
      setError('The event has to end after it starts');
      return;
    }
    setError(null);
    setEnd(t);
  };

  const canSave = title.trim().length > 0 && !create.isPending;

  const submit = () => {
    if (!title.trim()) {
      setError('Add a title for the event');
      return;
    }
    if (!allDay && toMin(end) <= toMin(start)) {
      setError('The event has to end after it starts');
      return;
    }
    if (create.isPending) return;
    create.mutate(
      {
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: repeat ? nextMatchingDate(date, repeat) : date,
        is_all_day: allDay,
        due_time: allDay ? undefined : start,
        start_time: allDay ? undefined : start,
        end_time: allDay ? undefined : end,
        location: location.trim() || undefined,
        color,
        category: category.trim() || 'Personal',
        show_in_tasks: showInTasks,
        repeat: repeat ?? undefined,
      },
      {
        onSuccess: () => {
          haptic.success();
          toast('Event added', { tone: 'success' });
          router.back();
        },
        onError: (e) => setError(e.message || 'Could not save the event'),
      },
    );
  };

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

  const band = withAlpha(color, 0.14);
  const chip = (label: string, onPress: () => void, a11y: string, muted = false) => (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [styles.field, pressed && { backgroundColor: colors.muted }]}
    >
      <Text variant="small" tone={muted ? 'subtle' : 'soft'} tabular>
        {label}
      </Text>
    </Pressable>
  );

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
          <KeyboardScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {/* Colour band with the title, so the event's colour is the first thing you see */}
            <View style={[styles.band, { backgroundColor: band }]}>
              <View style={[styles.stripe, { backgroundColor: color }]} />
              <View style={styles.bandTop}>
                <View style={styles.kicker}>
                  <CalendarDays size={13} color={colors.fgMuted} />
                  <Text variant="caption" weight="semibold" tone="muted" style={styles.kickerText}>
                    NEW EVENT
                  </Text>
                </View>
                <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={styles.closeBtn}>
                  <X size={18} color={colors.fgMuted} />
                </Pressable>
              </View>
              <TextInput
                value={title}
                onChangeText={(t) => {
                  setTitle(t);
                  if (error) setError(null);
                }}
                placeholder="Add title"
                placeholderTextColor={colors.fgSubtle}
                selectionColor={color}
                autoFocus
                onFocus={requestReveal}
                returnKeyType="done"
                accessibilityLabel="Event title"
                style={[styles.title, { color: colors.fg, borderBottomColor: color }]}
              />
              <Text variant="caption" tone="muted" tabular style={styles.summary}>
                {summary}
              </Text>
            </View>

            <View style={styles.body}>
              {error ? (
                <View style={[styles.error, { backgroundColor: withAlpha(colors.danger, 0.12) }]}>
                  <Text variant="small" color={colors.danger}>
                    {error}
                  </Text>
                </View>
              ) : null}

              <View style={styles.row}>
                <Clock size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <View style={styles.rowBody}>
                  <View style={styles.rangeLine}>
                    {chip(dateText, () => pickers.pickDate(date, setDate, { title: 'Date' }), `Date: ${dateText}`)}
                    {!allDay ? (
                      <>
                        {chip(formatTime(start), () => pickers.pickTime(start, pickStart, { title: 'Start time' }), `Start time ${formatTime(start)}`)}
                        <Text tone="subtle">–</Text>
                        {chip(formatTime(end), () => pickers.pickTime(end, pickEnd, { title: 'End time' }), `End time ${formatTime(end)}`)}
                      </>
                    ) : null}
                  </View>
                  <View style={styles.allDay}>
                    <Text variant="small" tone="soft">
                      All day
                    </Text>
                    <Switch
                      value={allDay}
                      onValueChange={(v) => {
                        haptic.tap();
                        setAllDay(v);
                        setError(null);
                      }}
                      accessibilityLabel="All day"
                      trackColor={{ true: colors.accent, false: colors.lineStrong }}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.row}>
                <RepeatIcon size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <View style={styles.rowBody}>
                  {chip(repeat ? describeRepeat(repeat, date) : 'Does not repeat', repeatSheet.show, 'Repeat', !repeat)}
                </View>
              </View>

              <View style={styles.row}>
                <MapPin size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <TextInput
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Add location"
                  placeholderTextColor={colors.fgSubtle}
                  selectionColor={colors.accent}
                  onFocus={requestReveal}
                  accessibilityLabel="Location"
                  style={[styles.input, { color: colors.fg }]}
                />
              </View>

              <View style={styles.row}>
                <AlignLeft size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add description"
                  placeholderTextColor={colors.fgSubtle}
                  selectionColor={colors.accent}
                  multiline
                  onFocus={requestReveal}
                  accessibilityLabel="Description"
                  style={[styles.input, styles.multiline, { color: colors.fg }]}
                />
              </View>

              <View style={styles.row}>
                <Palette size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <View style={[styles.rowBody, styles.swatches]} accessibilityRole="radiogroup">
                  {COLORS.map((c) => (
                    <Pressable
                      key={c.hex}
                      onPress={() => {
                        haptic.tap();
                        setColor(c.hex);
                      }}
                      accessibilityRole="radio"
                      accessibilityLabel={c.name}
                      accessibilityState={{ selected: color === c.hex }}
                      hitSlop={6}
                      style={[styles.swatch, { backgroundColor: c.hex }]}
                    >
                      {color === c.hex ? <Check size={14} color="#fff" strokeWidth={3.5} /> : null}
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.row}>
                <Hash size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <View style={styles.rowBody}>{chip(category, categorySheet.show, `Category ${category}`)}</View>
              </View>

              <View style={styles.row}>
                <ListTodo size={18} color={colors.fgSubtle} style={styles.rowIcon} />
                <View style={[styles.rowBody, styles.tasksRow]}>
                  <View style={styles.flex}>
                    <Text variant="small" tone="soft">
                      Also show in my task list
                    </Text>
                    <Text variant="caption" tone="subtle">
                      {showInTasks ? 'It will appear in your Inbox and on Today, and you can tick it off.' : 'Only on the calendar.'}
                    </Text>
                  </View>
                  <Switch
                    value={showInTasks}
                    onValueChange={(v) => {
                      haptic.tap();
                      setShowInTasks(v);
                    }}
                    accessibilityLabel="Also show in my task list"
                    trackColor={{ true: colors.accent, false: colors.lineStrong }}
                  />
                </View>
              </View>
            </View>

            <View
              style={[
                styles.footer,
                { borderTopColor: colors.line, backgroundColor: colors.subtle, paddingBottom: Math.max(insets.bottom, space.md) },
              ]}
            >
              <Pressable onPress={close} accessibilityRole="button" style={styles.cancel}>
                <Text weight="medium" tone="soft">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submit}
                disabled={!canSave}
                accessibilityRole="button"
                accessibilityLabel="Create event"
                accessibilityState={{ disabled: !canSave, busy: create.isPending }}
                style={[styles.create, { backgroundColor: color, opacity: canSave || create.isPending ? 1 : 0.4 }]}
              >
                {create.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text weight="semibold" color="#fff">
                    Create event
                  </Text>
                )}
              </Pressable>
            </View>
          </KeyboardScrollView>
        </Animated.View>
      </KeyboardAvoider>

      <CategoryPicker
        visible={categorySheet.open}
        onClose={categorySheet.hide}
        categories={categories}
        value={category}
        onSelect={setCategory}
      />
      <RepeatSheet
        visible={repeatSheet.open}
        onClose={repeatSheet.hide}
        value={repeat}
        date={date}
        onSelect={(r) => {
          setRepeat(r);
          if (r) setDate(nextMatchingDate(date, r));
        }}
      />
      {pickers.sheet}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1 },
  flex: { flex: 1 },
  avoider: { justifyContent: 'flex-end' },
  card: { maxHeight: '92%', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
  scroll: { flexGrow: 0 },
  band: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg },
  stripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  bandTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm, marginTop: space.xs },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kickerText: { letterSpacing: 1 },
  closeBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  title: { ...font.title, fontWeight: '600', paddingVertical: space.xs, borderBottomWidth: 2 },
  summary: { marginTop: space.sm },
  body: { paddingHorizontal: space.lg, paddingVertical: space.lg, gap: space.md },
  error: { borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  rowIcon: { marginTop: 7 },
  rowBody: { flex: 1, minWidth: 0 },
  field: { minHeight: 34, paddingHorizontal: space.sm, borderRadius: radius.md, justifyContent: 'center', alignSelf: 'flex-start', marginLeft: -space.sm },
  rangeLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  allDay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  input: { flex: 1, ...font.small, minHeight: 34, paddingVertical: 6 },
  multiline: { minHeight: 56, maxHeight: 120, textAlignVertical: 'top' },
  swatches: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 34 },
  swatch: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tasksRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cancel: { paddingHorizontal: space.md, height: 40, justifyContent: 'center' },
  create: { paddingHorizontal: space.lg, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', minWidth: 120 },
});

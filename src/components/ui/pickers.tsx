import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';

import {
  MONTH_NAMES,
  WEEKDAY_NAMES,
  clampDate,
  formatHHMM,
  isOutOfRange,
  minuteOptions,
  monthGrid,
  monthHasSelectable,
  parseTime,
  shiftMonth,
  spokenDate,
  splitISO,
  to12h,
  to24h,
} from '@/lib/calendarMath';
import { addDays, formatTime, monthLabel, today } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Button, Chip, IconButton, Segmented } from './controls';
import { Sheet } from './overlays';
import { Text } from './Text';

/* ---------- Date ---------- */

interface DatePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "YYYY-MM-DD", or empty for none. */
  value: string;
  /** Called with the tapped day; the sheet closes itself. */
  onSelect: (date: string) => void;
  /** Inclusive bounds, "YYYY-MM-DD". */
  minDate?: string;
  maxDate?: string;
  title?: string;
  /** Shows a Clear action. */
  onClear?: () => void;
  /** Shows Today / Tomorrow / Next week shortcuts (those inside the bounds). */
  quickPicks?: boolean;
}

/** App-themed month calendar in a bottom sheet. Tapping a day selects it and closes. */
export function DatePickerSheet({ visible, onClose, title = 'Pick a date', ...props }: DatePickerSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <DateBody onClose={onClose} {...props} />
    </Sheet>
  );
}

function DateBody({
  value,
  onSelect,
  onClose,
  minDate,
  maxDate,
  onClear,
  quickPicks,
}: Omit<DatePickerSheetProps, 'visible' | 'title'>) {
  const { colors } = useTheme();
  const now = today();
  // Open on the selected month, or today's, pulled inside the bounds
  const start = splitISO(clampDate(value || now, minDate, maxDate));
  const [view, setView] = useState({ year: start.year, month: start.month });
  const [jumping, setJumping] = useState(false);
  const [jumpYear, setJumpYear] = useState(start.year);

  const prev = shiftMonth(view.year, view.month, -1);
  const next = shiftMonth(view.year, view.month, 1);
  const canPrev = monthHasSelectable(prev.year, prev.month, minDate, maxDate);
  const canNext = monthHasSelectable(next.year, next.month, minDate, maxDate);
  const minYear = minDate ? splitISO(minDate).year : undefined;
  const maxYear = maxDate ? splitISO(maxDate).year : undefined;

  const pick = (iso: string) => {
    haptic.tap();
    onClose();
    onSelect(iso);
  };

  const quick = quickPicks
    ? [
        { label: 'Today', iso: now },
        { label: 'Tomorrow', iso: addDays(now, 1) },
        { label: 'Next week', iso: addDays(now, 7) },
      ].filter((q) => !isOutOfRange(q.iso, minDate, maxDate))
    : [];

  const cells = monthGrid(view.year, view.month);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <ScrollView bounces={false} showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
      {jumping ? (
        <>
          <View style={styles.header}>
            <IconButton
              label="Previous year"
              disabled={minYear !== undefined && jumpYear <= minYear}
              style={minYear !== undefined && jumpYear <= minYear ? styles.dim : undefined}
              onPress={() => setJumpYear((y) => y - 1)}
            >
              <ChevronLeft size={20} color={colors.fgMuted} />
            </IconButton>
            <Text variant="title" style={styles.headerTitle} center accessibilityRole="header">
              {jumpYear}
            </Text>
            <IconButton
              label="Next year"
              disabled={maxYear !== undefined && jumpYear >= maxYear}
              style={maxYear !== undefined && jumpYear >= maxYear ? styles.dim : undefined}
              onPress={() => setJumpYear((y) => y + 1)}
            >
              <ChevronRight size={20} color={colors.fgMuted} />
            </IconButton>
          </View>
          <View style={styles.monthGrid}>
            {MONTH_NAMES.map((name, i) => {
              const enabled = monthHasSelectable(jumpYear, i + 1, minDate, maxDate);
              const active = jumpYear === view.year && i + 1 === view.month;
              return (
                <Pressable
                  key={name}
                  disabled={!enabled}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} ${jumpYear}`}
                  accessibilityState={{ selected: active, disabled: !enabled }}
                  onPress={() => {
                    haptic.tap();
                    setView({ year: jumpYear, month: i + 1 });
                    setJumping(false);
                  }}
                  style={({ pressed }) => [
                    styles.monthCell,
                    { backgroundColor: active ? colors.accent : pressed ? colors.muted : 'transparent' },
                    !enabled && styles.dim,
                  ]}
                >
                  <Text weight="medium" color={active ? colors.accentFg : colors.fg}>
                    {name.slice(0, 3)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <View style={styles.header}>
            <IconButton
              label="Previous month"
              disabled={!canPrev}
              style={canPrev ? undefined : styles.dim}
              onPress={() => setView(prev)}
            >
              <ChevronLeft size={20} color={colors.fgMuted} />
            </IconButton>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${monthLabel(view.year, view.month)}, choose month and year`}
              onPress={() => {
                haptic.tap();
                setJumpYear(view.year);
                setJumping(true);
              }}
              style={({ pressed }) => [styles.headerTitle, styles.titleButton, pressed && { backgroundColor: colors.muted }]}
            >
              <Text variant="title" accessibilityRole="header">
                {monthLabel(view.year, view.month)}
              </Text>
              <ChevronDown size={16} color={colors.fgMuted} />
            </Pressable>
            <IconButton
              label="Next month"
              disabled={!canNext}
              style={canNext ? undefined : styles.dim}
              onPress={() => setView(next)}
            >
              <ChevronRight size={20} color={colors.fgMuted} />
            </IconButton>
          </View>

          <View style={styles.week} importantForAccessibility="no-hide-descendants">
            {WEEKDAY_NAMES.map((n) => (
              <View key={n} style={styles.cell}>
                <Text variant="caption" weight="semibold" tone="subtle">
                  {n.slice(0, 3)}
                </Text>
              </View>
            ))}
          </View>
          {weeks.map((week, w) => (
            <View key={w} style={styles.week}>
              {week.map((iso, i) => {
                if (!iso) return <View key={i} style={styles.cell} />;
                const selected = iso === value;
                const isToday = iso === now;
                const disabled = isOutOfRange(iso, minDate, maxDate);
                return (
                  <Pressable
                    key={iso}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel={`${spokenDate(iso)}${isToday ? ', today' : ''}${selected ? ', selected' : ''}`}
                    accessibilityState={{ selected, disabled }}
                    onPress={() => pick(iso)}
                    style={styles.cell}
                  >
                    <View
                      style={[
                        styles.day,
                        selected && { backgroundColor: colors.accent },
                        !selected && isToday && { borderWidth: 1.5, borderColor: colors.accent },
                      ]}
                    >
                      <Text
                        weight={selected || isToday ? 'semibold' : 'regular'}
                        color={selected ? colors.accentFg : isToday ? colors.accentText : colors.fg}
                        style={disabled ? styles.dim : undefined}
                        tabular
                      >
                        {splitISO(iso).day}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </>
      )}

      {quick.length > 0 && !jumping ? (
        <View style={styles.quick}>
          {quick.map((q) => (
            <Chip key={q.label} label={q.label} selected={q.iso === value} onPress={() => pick(q.iso)} />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {onClear ? (
          <Button
            title="Clear"
            variant="dangerGhost"
            onPress={() => {
              onClose();
              onClear();
            }}
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </View>
    </ScrollView>
  );
}

/* ---------- Time ---------- */

interface TimePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "HH:MM" 24h, or empty (opens at 9:00 am). */
  value: string;
  /** Called with "HH:MM" when Done is pressed. */
  onSelect: (time: string) => void;
  onClear?: () => void;
  title?: string;
  /** Minute column granularity. */
  minuteStep?: number;
}

/** App-themed time picker: hour and minute wheels plus am / pm. */
export function TimePickerSheet({ visible, onClose, title = 'Time', ...props }: TimePickerSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <TimeBody onClose={onClose} {...props} />
    </Sheet>
  );
}

const ROW_H = 44;
const WHEEL_ROWS = 5;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

function TimeBody({
  value,
  onSelect,
  onClose,
  onClear,
  minuteStep = 5,
}: Omit<TimePickerSheetProps, 'visible' | 'title'>) {
  const parsed = parseTime(value) ?? { hour: 9, minute: 0 };
  const initial = to12h(parsed.hour);
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(parsed.minute);
  const [pm, setPm] = useState(initial.pm);
  // Offer the opening minute even when it is off-step, so Done without changes keeps it
  const [minutes] = useState(() => minuteOptions(minuteStep, parsed.minute));

  const time = formatHHMM(to24h(hour12, pm), minute);

  return (
    <View style={styles.body}>
      <Text variant="display" center tabular accessibilityLiveRegion="polite" style={styles.bigTime}>
        {formatTime(time)}
      </Text>
      <View style={styles.wheels}>
        <Wheel
          label="Hour"
          items={HOURS.map((h) => ({ value: h, label: String(h) }))}
          selected={hour12}
          onSelect={setHour12}
        />
        <Text variant="heading" tone="muted" style={styles.colon}>
          :
        </Text>
        <Wheel
          label="Minute"
          items={minutes.map((m) => ({ value: m, label: String(m).padStart(2, '0') }))}
          selected={minute}
          onSelect={setMinute}
        />
        <Segmented
          value={pm ? 'pm' : 'am'}
          onChange={(v) => setPm(v === 'pm')}
          options={[
            { value: 'am', label: 'AM' },
            { value: 'pm', label: 'PM' },
          ]}
          style={styles.meridiem}
        />
      </View>
      <View style={styles.actions}>
        {onClear ? (
          <Button
            title="Clear"
            variant="dangerGhost"
            onPress={() => {
              onClose();
              onClear();
            }}
          />
        ) : null}
        <View style={{ flex: 1 }} />
        <Button title="Cancel" variant="ghost" onPress={onClose} />
        <Button
          title="Done"
          variant="primary"
          onPress={() => {
            onClose();
            onSelect(time);
          }}
        />
      </View>
    </View>
  );
}

/** Snapping scroll column; the row under the centre band is the selection. */
function Wheel({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: { value: number; label: string }[];
  selected: number;
  onSelect: (v: number) => void;
}) {
  const { colors } = useTheme();
  const ref = useRef<ScrollViewInstance>(null);
  const indexOf = (v: number) => Math.max(0, items.findIndex((i) => i.value === v));

  return (
    <View style={styles.wheel}>
      <View pointerEvents="none" style={[styles.band, { backgroundColor: colors.accentSoft }]} />
      <ScrollView
        ref={ref}
        // Android needs an explicit scroll once laid out; contentOffset is iOS only
        onLayout={() => ref.current?.scrollTo({ y: indexOf(selected) * ROW_H, animated: false })}
        contentOffset={{ x: 0, y: indexOf(selected) * ROW_H }}
        snapToInterval={ROW_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        onMomentumScrollEnd={(e) => {
          const i = Math.min(items.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.y / ROW_H)));
          if (items[i].value !== selected) {
            haptic.tap();
            onSelect(items[i].value);
          }
        }}
        contentContainerStyle={{ paddingVertical: ROW_H * Math.floor(WHEEL_ROWS / 2) }}
      >
        {items.map((it, i) => {
          const active = it.value === selected;
          return (
            <Pressable
              key={it.value}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${it.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptic.tap();
                onSelect(it.value);
                ref.current?.scrollTo({ y: i * ROW_H, animated: true });
              }}
              style={styles.wheelRow}
            >
              <Text variant="bodyLarge" weight={active ? 'bold' : 'regular'} tone={active ? 'accent' : 'muted'} tabular>
                {it.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, paddingBottom: space.xs, gap: space.xs },
  dim: { opacity: 0.3 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  headerTitle: { flex: 1 },
  titleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 40,
    borderRadius: radius.md,
  },
  week: { flexDirection: 'row' },
  // 1/7 of the width, so the grid fits 360dp phones and scales up
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: {
    width: `${100 / 3}%`,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  bigTime: { marginBottom: space.xs },
  wheels: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  wheel: { width: 76, height: ROW_H * WHEEL_ROWS, overflow: 'hidden' },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ROW_H * Math.floor(WHEEL_ROWS / 2),
    height: ROW_H,
    borderRadius: radius.md,
  },
  wheelRow: { height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  colon: { marginHorizontal: -space.xs },
  meridiem: { width: 96, marginLeft: space.md },
});

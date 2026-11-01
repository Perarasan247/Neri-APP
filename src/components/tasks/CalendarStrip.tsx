import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import { IconButton, Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { addDays, parseISODate, startOfWeek, toISODate, WEEKDAY_LETTERS } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

interface DayCellProps {
  date: string;
  today: string;
  selected: string;
  marked: boolean;
  /** Dim days outside the current month (month grid). */
  outside?: boolean;
  disabled?: boolean;
  label?: string;
  onPress: (date: string) => void;
}

/** One day: optional weekday letter, number in a circle, task dot. */
function DayCell({ date, today, selected, marked, outside, disabled, label, onPress }: DayCellProps) {
  const { colors } = useTheme();
  const isToday = date === today;
  const isSelected = date === selected;
  const bg = isToday ? colors.accent : isSelected ? colors.accentSoft : 'transparent';
  const fg = isToday ? colors.accentFg : isSelected ? colors.accentText : outside || disabled ? colors.fgSubtle : colors.fg;
  const d = parseISODate(date);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
      accessibilityLabel={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress(date);
      }}
      style={[styles.cell, disabled && { opacity: 0.45 }]}
    >
      {label ? (
        <Text variant="caption" tone={isSelected || isToday ? 'accent' : 'subtle'} weight="medium">
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.num,
          { backgroundColor: bg },
          isSelected && !isToday && { borderWidth: 1, borderColor: colors.accent },
        ]}
      >
        <Text variant="small" weight={isToday || isSelected ? 'bold' : 'medium'} color={fg} tabular>
          {d.getDate()}
        </Text>
      </View>
      <View style={[styles.dot, { backgroundColor: marked ? (isToday ? colors.accent : colors.fgSubtle) : 'transparent' }]} />
    </Pressable>
  );
}

interface NavProps {
  onPrev: () => void;
  onNext: () => void;
  canPrev?: boolean;
}

/** Horizontal swipe → prev/next; taps still reach the day cells. */
function useSwipe({ onPrev, onNext, canPrev = true }: NavProps) {
  const handlers = useRef({ onPrev, onNext, canPrev });
  useEffect(() => {
    handlers.current = { onPrev, onNext, canPrev };
  });
  // eslint-disable-next-line react-hooks/refs -- handlers is only read inside the swipe-release callback
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderRelease: (_e, g) => {
        const h = handlers.current;
        if (g.dx < -40) h.onNext();
        else if (g.dx > 40 && h.canPrev) h.onPrev();
      },
    }),
  );
  return responder.panHandlers;
}

function Arrow({ dir, onPress, disabled }: { dir: 'prev' | 'next'; onPress: () => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <IconButton
      label={dir === 'prev' ? 'Previous' : 'Next'}
      size={32}
      onPress={onPress}
      disabled={disabled}
      style={disabled ? { opacity: 0.3 } : undefined}
    >
      <Icon size={18} color={colors.fgMuted} />
    </IconButton>
  );
}

interface StripProps extends NavProps {
  /** Any day in the week to show (Monday-first). */
  weekOf: string;
  today: string;
  selected: string;
  marked: Set<string>;
  minDate?: string;
  onSelect: (date: string) => void;
}

/** Seven-day strip with arrows; swipe left/right to change week. */
export function WeekStrip({ weekOf, today, selected, marked, minDate, onSelect, ...nav }: StripProps) {
  const pan = useSwipe(nav);
  const start = startOfWeek(weekOf);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <View style={styles.row} {...pan}>
      <Arrow dir="prev" onPress={nav.onPrev} disabled={nav.canPrev === false} />
      {days.map((d, i) => (
        <DayCell
          key={d}
          date={d}
          label={WEEKDAY_LETTERS[i]}
          today={today}
          selected={selected}
          marked={marked.has(d)}
          disabled={!!minDate && d < minDate}
          onPress={onSelect}
        />
      ))}
      <Arrow dir="next" onPress={nav.onNext} />
    </View>
  );
}

interface MonthProps extends Omit<StripProps, 'weekOf'> {
  year: number;
  /** 1–12 */
  month: number;
}

/** Full month grid (6 rows, Monday-first) with the same day cells. */
export function MonthGrid({ year, month, today, selected, marked, minDate, onSelect, ...nav }: MonthProps) {
  const pan = useSwipe(nav);
  const first = toISODate(new Date(year, month - 1, 1));
  const start = startOfWeek(first);
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  return (
    <View {...pan}>
      <View style={styles.row}>
        <Arrow dir="prev" onPress={nav.onPrev} disabled={nav.canPrev === false} />
        {WEEKDAY_LETTERS.map((l, i) => (
          <View key={i} style={styles.cell}>
            <Text variant="caption" tone="subtle" weight="medium">
              {l}
            </Text>
          </View>
        ))}
        <Arrow dir="next" onPress={nav.onNext} />
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.row}>
          <View style={styles.gutter} />
          {week.map((d) => (
            <DayCell
              key={d}
              date={d}
              today={today}
              selected={selected}
              marked={marked.has(d)}
              outside={parseISODate(d).getMonth() !== month - 1}
              disabled={!!minDate && d < minDate}
              onPress={onSelect}
            />
          ))}
          <View style={styles.gutter} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  gutter: { width: 32 },
  cell: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 2 },
  num: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 4, height: 4, borderRadius: 2 },
});

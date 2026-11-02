import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';

import type { GoalLevel } from '@/api/types';
import { DatePickerSheet, IconButton, Sheet, Text } from '@/components/ui';
import { MONTH_NAMES } from '@/lib/calendarMath';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const FIRST_YEAR = 2000;
const LAST_YEAR = 2100;
const COLS = 3;
const ROW_H = 52;
const YEARS = Array.from({ length: LAST_YEAR - FIRST_YEAR + 1 }, (_, i) => FIRST_YEAR + i);

interface Props {
  visible: boolean;
  onClose: () => void;
  level: GoalLevel;
  /** First day of the viewed period, "YYYY-MM-DD". */
  start: string;
  today: string;
  /** Receives a date inside the chosen week, month or year. */
  onPick: (anchor: string) => void;
}

/**
 * Jump to any period: a day calendar for weeks (picking a day selects its Mon–Sun week),
 * a 12-month grid for months, a scrollable list of years for years.
 */
export function PeriodPickerSheet({ visible, onClose, level, start, today, onPick }: Props) {
  if (level === 'weekly') {
    return (
      <DatePickerSheet
        visible={visible}
        onClose={onClose}
        value={start}
        onSelect={onPick}
        title="Pick a week"
        minDate={`${FIRST_YEAR}-01-01`}
        maxDate={`${LAST_YEAR}-12-31`}
      />
    );
  }
  return (
    <Sheet visible={visible} onClose={onClose} title={level === 'monthly' ? 'Pick a month' : 'Pick a year'}>
      {level === 'monthly' ? (
        <MonthsBody start={start} today={today} onPick={onPick} onClose={onClose} />
      ) : (
        <YearsBody year={Number(start.slice(0, 4))} today={today} onPick={onPick} onClose={onClose} />
      )}
    </Sheet>
  );
}

function MonthsBody({ start, today, onPick, onClose }: Pick<Props, 'start' | 'today' | 'onPick' | 'onClose'>) {
  const { colors } = useTheme();
  const selYear = Number(start.slice(0, 4));
  const selMonth = Number(start.slice(5, 7));
  const nowYear = Number(today.slice(0, 4));
  const nowMonth = Number(today.slice(5, 7));
  const [year, setYear] = useState(selYear);
  const [years, setYears] = useState(false);

  if (years)
    return (
      <YearsBody
        year={year}
        today={today}
        onClose={onClose}
        onPick={(a) => {
          setYear(Number(a.slice(0, 4)));
          setYears(false);
        }}
        keepOpen
      />
    );

  return (
    <View style={styles.body}>
      <View style={styles.header}>
        <IconButton label="Previous year" disabled={year <= FIRST_YEAR} onPress={() => setYear((y) => y - 1)}>
          <ChevronLeft size={20} color={colors.fgMuted} />
        </IconButton>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${year}, choose year`}
          onPress={() => {
            haptic.tap();
            setYears(true);
          }}
          style={({ pressed }) => [styles.title, pressed && { backgroundColor: colors.muted }]}
        >
          <Text variant="title">{year}</Text>
          <ChevronDown size={16} color={colors.fgMuted} />
        </Pressable>
        <IconButton label="Next year" disabled={year >= LAST_YEAR} onPress={() => setYear((y) => y + 1)}>
          <ChevronRight size={20} color={colors.fgMuted} />
        </IconButton>
      </View>
      <View style={styles.grid}>
        {MONTH_NAMES.map((name, i) => {
          const active = year === selYear && i + 1 === selMonth;
          const current = year === nowYear && i + 1 === nowMonth;
          return (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`${name} ${year}`}
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptic.tap();
                onClose();
                onPick(`${year}-${String(i + 1).padStart(2, '0')}-01`);
              }}
              style={({ pressed }) => [
                styles.cell,
                { backgroundColor: active ? colors.accent : pressed ? colors.muted : 'transparent' },
                !active && current && { borderWidth: 1, borderColor: colors.accent },
              ]}
            >
              <Text weight="medium" color={active ? colors.accentFg : current ? colors.accentText : colors.fg}>
                {name.slice(0, 3)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function YearsBody({
  year,
  today,
  onPick,
  onClose,
  keepOpen,
}: {
  year: number;
  today: string;
  onPick: (anchor: string) => void;
  onClose: () => void;
  /** Used inside the month picker: choosing a year returns there instead of closing the sheet. */
  keepOpen?: boolean;
}) {
  const { colors } = useTheme();
  const nowYear = Number(today.slice(0, 4));
  const index = Math.max(0, YEARS.indexOf(year));
  return (
    <FlatList
      data={YEARS}
      numColumns={COLS}
      keyExtractor={(y) => String(y)}
      style={styles.years}
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, i) => ({ length: ROW_H, offset: ROW_H * Math.floor(i / COLS), index: i })}
      // Open with the selected year roughly centred
      initialScrollIndex={Math.max(0, Math.floor(index / COLS) * COLS - COLS)}
      renderItem={({ item: y }) => {
        const active = y === year;
        const current = y === nowYear;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={String(y)}
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic.tap();
              if (!keepOpen) onClose();
              onPick(`${y}-01-01`);
            }}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: active ? colors.accent : pressed ? colors.muted : 'transparent' },
              !active && current && { borderWidth: 1, borderColor: colors.accent },
            ]}
          >
            <Text weight="medium" tabular color={active ? colors.accentFg : current ? colors.accentText : colors.fg}>
              {y}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}


const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.md,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / COLS}%`,
    height: ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  years: { maxHeight: ROW_H * 5, marginHorizontal: space.lg },
});

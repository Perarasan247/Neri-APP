import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';

import type { InsightsRange } from '@/api/endpoints';
import { DateField } from '@/components/habits/DateField';
import { IconButton, Segmented, Text } from '@/components/ui';
import { useProfile } from '@/hooks/queries';
import { addDays, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export type RangeKey = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

const OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

/** Insights range state shared by the habit and task insights screens. */
export function useInsightsRange(initial: RangeKey = 'month') {
  const profile = useProfile();
  const todayStr = today();
  const currentYear = Number(todayStr.slice(0, 4));
  const trackingStart = profile.data?.tracking_start_date;
  const minYear = trackingStart ? Number(trackingStart.slice(0, 4)) : currentYear - 5;

  const [key, setKey] = useState<RangeKey>(initial);
  const [year, setYear] = useState(currentYear);
  const [start, setStart] = useState(addDays(todayStr, -29));
  const [end, setEnd] = useState(todayStr);

  const range: InsightsRange =
    key === 'year'
      ? { range: 'year', year }
      : key === 'custom'
        ? { range: 'custom', startDate: start, endDate: end }
        : { range: key };

  // Keep the custom range in order: moving one end past the other drags it along
  const setCustomStart = (d: string) => {
    setStart(d);
    if (d > end) setEnd(d);
  };
  const setCustomEnd = (d: string) => {
    setEnd(d);
    if (d < start) setStart(d);
  };

  return {
    key,
    setKey,
    year,
    setYear,
    minYear,
    maxYear: currentYear,
    start,
    end,
    setStart: setCustomStart,
    setEnd: setCustomEnd,
    today: todayStr,
    range,
  };
}

export type InsightsRangeState = ReturnType<typeof useInsightsRange>;

/** Range segmented control, plus a year stepper (Year) or two date fields (Custom). `ranges` limits the options. */
export function RangeControl({ state, ranges }: { state: InsightsRangeState; ranges?: RangeKey[] }) {
  const { colors } = useTheme();
  const { key, setKey, year, setYear, minYear, maxYear } = state;
  const options = ranges ? OPTIONS.filter((o) => ranges.includes(o.value)) : OPTIONS;
  return (
    <View style={{ gap: space.sm }}>
      <Segmented<RangeKey> value={key} onChange={setKey} options={options} />
      {key === 'year' ? (
        <View style={styles.stepper}>
          <IconButton label="Previous year" size={34} disabled={year <= minYear} onPress={() => setYear(year - 1)}>
            <ChevronLeft size={18} color={year <= minYear ? colors.fgSubtle : colors.fgSoft} />
          </IconButton>
          <Text variant="body" weight="semibold" tabular style={{ minWidth: 56, textAlign: 'center' }}>
            {year}
          </Text>
          <IconButton label="Next year" size={34} disabled={year >= maxYear} onPress={() => setYear(year + 1)}>
            <ChevronRight size={18} color={year >= maxYear ? colors.fgSubtle : colors.fgSoft} />
          </IconButton>
        </View>
      ) : null}
      {key === 'custom' ? (
        <View style={styles.custom}>
          <View style={{ flex: 1 }}>
            <DateField
              value={state.start}
              onChange={state.setStart}
              max={state.today}
              title="Start date"
              accessibilityLabel="Start date"
            />
          </View>
          <Text variant="small" tone="subtle">
            to
          </Text>
          <View style={{ flex: 1 }}>
            <DateField
              value={state.end}
              onChange={state.setEnd}
              max={state.today}
              title="End date"
              accessibilityLabel="End date"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  custom: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

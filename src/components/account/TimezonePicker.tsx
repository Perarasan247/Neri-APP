import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Check, ChevronDown, Globe, Search } from 'lucide-react-native';

import { Sheet, Text, TextField } from '@/components/ui';
import { DEFAULT_TIME_ZONE } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Used when the JS engine can't enumerate IANA zones. */
const CURATED_ZONES = [
  'Asia/Kolkata',
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Africa/Lagos',
  'Africa/Nairobi',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Kathmandu',
  'Asia/Colombo',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
];

/** All IANA zones the device knows, with the default guaranteed first. */
export const TIME_ZONES: string[] = (() => {
  let zones: string[] = [];
  try {
    const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') zones = intl.supportedValuesOf('timeZone');
  } catch {}
  if (zones.length === 0) zones = CURATED_ZONES;
  return [DEFAULT_TIME_ZONE, ...zones.filter((z) => z !== DEFAULT_TIME_ZONE)];
})();

const abbrCache = new Map<string, string>();

/** Short zone name ("GMT+5:30", "PST"); empty if the engine can't format it. */
function zoneAbbr(tz: string): string {
  const hit = abbrCache.get(tz);
  if (hit !== undefined) return hit;
  let abbr = '';
  try {
    abbr =
      new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {}
  abbrCache.set(tz, abbr);
  return abbr;
}

/** "India (IST)" for the default, otherwise "America/New York (EST)". */
export function zoneLabel(tz: string): string {
  if (tz === DEFAULT_TIME_ZONE) return 'India (IST)';
  const abbr = zoneAbbr(tz);
  const name = tz.replace(/_/g, ' ');
  return abbr ? `${name} (${abbr})` : name;
}

/** Field-style button that opens a searchable timezone list in a Sheet. */
export function TimezonePicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Timezone, ${zoneLabel(value)}`}
        onPress={() => {
          haptic.tap();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.field,
          { borderColor: colors.lineStrong, backgroundColor: pressed ? colors.muted : colors.surface },
        ]}
      >
        <Globe size={18} color={colors.fgMuted} />
        <Text style={{ flex: 1 }} numberOfLines={1}>
          {zoneLabel(value)}
        </Text>
        <ChevronDown size={18} color={colors.fgSubtle} />
      </Pressable>
      {open ? (
        <TimezoneSheet
          value={value}
          onClose={() => setOpen(false)}
          onSelect={(tz) => {
            onChange(tz);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function TimezoneSheet({
  value,
  onClose,
  onSelect,
}: {
  value: string;
  onClose: () => void;
  onSelect: (tz: string) => void;
}) {
  const { colors } = useTheme();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const raw = query.trim().toLowerCase();
    if (!raw) return TIME_ZONES;
    const q = raw.replace(/\s+/g, '_');
    // The default is labelled "India (IST)", so let those words find it too
    const matchesDefault = 'india (ist)'.includes(raw) || raw.includes('india');
    return TIME_ZONES.filter((tz) => tz.toLowerCase().includes(q) || (tz === DEFAULT_TIME_ZONE && matchesDefault));
  }, [query]);

  return (
    <Sheet visible onClose={onClose} title="Timezone" keyboard scroll={false}>
      <View style={styles.search}>
        <Search size={16} color={colors.fgSubtle} style={styles.searchIcon} />
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search city or region"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={{ paddingLeft: space.xxxl }}
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(tz) => tz}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        style={{ height: Math.min(height * 0.55, 480) }}
        ListEmptyComponent={
          <Text tone="muted" center style={{ padding: space.xl }}>
            No timezones match “{query}”
          </Text>
        }
        renderItem={({ item }) => {
          const selected = item === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => {
                haptic.tap();
                onSelect(item);
              }}
              style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.muted }]}
            >
              <Text style={{ flex: 1 }} numberOfLines={1} weight={selected ? 'semibold' : 'regular'}>
                {zoneLabel(item)}
              </Text>
              {selected ? <Check size={18} color={colors.accent} /> : null}
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
  },
  search: { paddingHorizontal: space.lg, marginBottom: space.sm, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: space.lg + space.md, zIndex: 1 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 48,
    paddingHorizontal: space.lg,
  },
});

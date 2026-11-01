import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  Archive,
  BarChart3,
  CalendarDays,
  CalendarCheck,
  Inbox,
  ListChecks,
  Repeat,
  Settings,
  Target,
  Trophy,
} from 'lucide-react-native';

import { NavGroup, NavRow } from '@/components/account/NavRow';
import { zoneLabel } from '@/components/account/TimezonePicker';
import { Card, Screen, Text } from '@/components/ui';
import { useCurrentGoals, useHabits, useProfile, useTodos } from '@/hooks/queries';
import { useSession } from '@/hooks/session';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const ICON = 17;

/** Browse hub: account summary plus links to every view, report and setting. */
export default function BrowseScreen() {
  const { colors } = useTheme();
  const { email, isDemo } = useSession();
  const profile = useProfile();
  const openTasks = useTodos({ view: 'pending' });
  const archived = useHabits('archived');
  const goals = useCurrentGoals();
  const reviewCount = goals.data?.needs_review.length ?? 0;

  const refreshing = openTasks.isRefetching || archived.isRefetching || profile.isRefetching || goals.isRefetching;
  const refresh = () => {
    openTasks.refetch();
    archived.refetch();
    profile.refetch();
    goals.refetch();
  };

  const name = isDemo ? 'Demo account' : profile.data?.email || email || 'My account';
  const initial = (name.trim()[0] ?? 'A').toUpperCase();
  const tint = colors.accentText;

  return (
    <Screen title="Browse" safeTop onRefresh={refresh} refreshing={refreshing}>
      <Card style={{ marginBottom: space.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name}. Open settings`}
          onPress={() => {
            haptic.tap();
            router.push('/settings');
          }}
          style={({ pressed }) => [styles.account, pressed && { backgroundColor: colors.muted }]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
            <Text variant="title" weight="bold" tone="onAccent">
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyLarge" weight="semibold" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="small" tone="muted" numberOfLines={1}>
              {profile.data ? zoneLabel(profile.data.timezone) : ' '}
            </Text>
          </View>
        </Pressable>
      </Card>

      <NavGroup title="Views">
        <NavRow
          icon={<Inbox size={ICON} color={tint} />}
          label="Inbox"
          count={openTasks.data?.length}
          onPress={() => router.navigate('/(tabs)/inbox')}
        />
        <NavRow
          icon={<CalendarCheck size={ICON} color={tint} />}
          label="Today"
          onPress={() => router.navigate('/(tabs)')}
        />
        <NavRow
          icon={<CalendarDays size={ICON} color={tint} />}
          label="Calendar"
          onPress={() => router.navigate('/(tabs)/calendar')}
        />
        <NavRow
          icon={<Target size={ICON} color={tint} />}
          label="Goals"
          value={reviewCount ? `${reviewCount} to review` : undefined}
          onPress={() => router.push('/goals')}
        />
      </NavGroup>

      <NavGroup title="Habits">
        <NavRow
          icon={<Repeat size={ICON} color={tint} />}
          label="Habit tracker"
          onPress={() => router.navigate('/(tabs)/habits')}
        />
        <NavRow
          icon={<Archive size={ICON} color={tint} />}
          label="Archived habits"
          count={archived.data?.length}
          onPress={() => router.push('/archived')}
        />
      </NavGroup>

      <NavGroup title="Reports">
        <NavRow
          icon={<BarChart3 size={ICON} color={tint} />}
          label="Habit insights"
          onPress={() => router.push('/insights')}
        />
        <NavRow
          icon={<ListChecks size={ICON} color={tint} />}
          label="Task insights"
          onPress={() => router.push('/insights/tasks')}
        />
        <NavRow
          icon={<Trophy size={ICON} color={tint} />}
          label="Goal insights"
          onPress={() => router.push('/insights/goals')}
        />
      </NavGroup>

      <NavGroup title="App">
        <NavRow icon={<Settings size={ICON} color={tint} />} label="Settings" onPress={() => router.push('/settings')} />
      </NavGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  account: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

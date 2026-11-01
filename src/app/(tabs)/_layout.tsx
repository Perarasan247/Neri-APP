import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { CalendarDays, Inbox, LayoutGrid, Repeat } from 'lucide-react-native';

import { Text } from '@/components/ui';
import { haptic } from '@/lib/haptics';
import { parseISODate, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';

/** Today tab icon shows the current day number, like a desk calendar. */
function TodayIcon({ color, focused }: { color: string; focused: boolean }) {
  const day = parseISODate(today()).getDate();
  return (
    <View style={[styles.todayIcon, { borderColor: color }]}>
      <View style={[styles.todayBar, { backgroundColor: color }]} />
      <Text variant="caption" weight={focused ? 'bold' : 'semibold'} color={color} style={styles.todayNum}>
        {day}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.tap() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.fgSubtle,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', letterSpacing: 0.1 },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: ({ color, focused }) => <TodayIcon color={String(color)} focused={focused} /> }}
      />
      <Tabs.Screen
        name="inbox"
        options={{ title: 'Inbox', tabBarIcon: ({ color }) => <Inbox size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: ({ color }) => <CalendarDays size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="habits"
        options={{ title: 'Habits', tabBarIcon: ({ color }) => <Repeat size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="browse"
        options={{ title: 'Browse', tabBarIcon: ({ color }) => <LayoutGrid size={22} color={color} /> }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  todayIcon: { width: 22, height: 22, borderWidth: 1.75, borderRadius: 6, overflow: 'hidden', alignItems: 'center' },
  todayBar: { width: '100%', height: 4 },
  todayNum: { fontSize: 10, lineHeight: 13 },
});

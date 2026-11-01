import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';

import { ServerUrlSheet } from '@/components/account/ServerUrlSheet';
import { GoalPromptHost } from '@/components/goals/GoalPromptHost';
import { Button, DialogProvider, ErrorState, Text, ToastProvider, useDisclosure } from '@/components/ui';
import { useProfile } from '@/hooks/queries';
import { SessionProvider, useSession } from '@/hooks/session';
import { config, loadApiUrlOverride } from '@/lib/config';
import { setAppTimeZone } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useWidgetSync } from '@/widget/useWidgetSync';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Deep links (e.g. the widget's "+" → neri://task/new) land on top of the tabs, so closing returns to the app
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    loadApiUrlOverride().finally(() => setConfigReady(true));
  }, []);

  if (!configReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SessionProvider>
            <ToastProvider>
              <DialogProvider>
                <AppNavigator />
              </DialogProvider>
            </ToastProvider>
          </SessionProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Auth gate: signed out → sign-in, not onboarded → onboarding, else the app. */
function AppNavigator() {
  const { colors, scheme } = useTheme();
  const { status } = useSession();
  useWidgetSync(status);
  const signedIn = status === 'signedIn';
  const profile = useProfile(signedIn);
  const serverSheet = useDisclosure();

  const resolving = status === 'loading' || (signedIn && profile.isPending);
  const onboarded = Boolean(profile.data);

  useEffect(() => {
    if (profile.data) setAppTimeZone(profile.data.timezone);
  }, [profile.data]);

  useEffect(() => {
    if (!resolving) SplashScreen.hideAsync().catch(() => {});
  }, [resolving]);

  if (resolving) return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;

  // Signed in but the server is unreachable: don't guess, let the user retry or fix the address
  if (signedIn && profile.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center' }}>
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
        <Text variant="caption" tone="subtle" center>
          Server: {config.apiUrl}
        </Text>
        <Button title="Change server address" variant="ghost" onPress={serverSheet.show} style={{ marginTop: 8 }} />
        {serverSheet.open ? (
          <ServerUrlSheet visible onClose={serverSheet.hide} onSaved={() => profile.refetch()} />
        ) : null}
      </View>
    );
  }

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.accent,
      background: colors.canvas,
      card: colors.surface,
      text: colors.fg,
      border: colors.line,
      notification: colors.danger,
    },
  };

  return (
    <NavThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {signedIn && onboarded ? <GoalPromptHost /> : null}
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.canvas },
          headerTitleStyle: { fontWeight: '600', color: colors.fg },
          headerTintColor: colors.accent,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.canvas },
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && !onboarded}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>

        <Stack.Protected guard={signedIn && onboarded}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* Quick add: bottom popup. The screen is transparent and draws its own backdrop and card, because
              formSheet is full screen on Android. */}
          <Stack.Screen
            name="task/new"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen name="task/[id]" options={{ title: '' }} />
          <Stack.Screen name="habit/new" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="habit/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="habit/[id]/edit" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="insights/index" options={{ title: 'Habit insights' }} />
          <Stack.Screen name="insights/tasks" options={{ title: 'Task insights' }} />
          <Stack.Screen name="insights/goals" options={{ title: 'Goal insights' }} />
          <Stack.Screen name="goals" options={{ title: 'Goals' }} />
          <Stack.Screen name="goal/new" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="goal/[id]/index" options={{ title: '' }} />
          <Stack.Screen name="goal/[id]/edit" options={{ presentation: 'modal', headerShown: false }} />
          <Stack.Screen name="archived" options={{ title: 'Archived habits' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        </Stack.Protected>
      </Stack>
    </NavThemeProvider>
  );
}

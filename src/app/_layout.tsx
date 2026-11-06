import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';

import { AnimatedSplash } from '@/components/AnimatedSplash';
import { ServerUrlSheet } from '@/components/account/ServerUrlSheet';
import { GoalPromptHost } from '@/components/goals/GoalPromptHost';
import { SyncBanner } from '@/components/SyncBanner';
import { Button, DialogProvider, ErrorState, Text, ToastProvider, useDisclosure } from '@/components/ui';
import { useProfile } from '@/hooks/queries';
import { SessionProvider, useSession } from '@/hooks/session';
import { config, loadApiUrlOverride } from '@/lib/config';
import { cleanupExportFiles } from '@/lib/exportFiles';
import { outbox, restoreQueryCache, startSync } from '@/offline/sync';
import { setAppTimeZone } from '@/lib/format';
import { queryClient } from '@/lib/queryClient';
import { readStoredOwner } from '@/lib/storedOwner';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { useWidgetAccent, useWidgetSync } from '@/widget/useWidgetSync';

SplashScreen.preventAutoHideAsync().catch(() => {});

/** Shown by expo-router when a screen crashes while rendering, instead of a red/blank screen. */
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#0b0b0f' }}>
      <Text variant="title" center style={{ color: '#ededf2' }}>
        Something went wrong
      </Text>
      <Text variant="small" center style={{ color: '#9696a6', marginTop: 6, marginBottom: 16 }}>
        Neri hit an unexpected problem. Your data is safe.
      </Text>
      <Button title="Try again" onPress={() => retry()} />
    </View>
  );
}

// Deep links (e.g. the widget's "+" → neri://task/new) land on top of the tabs, so closing returns to the app
export const unstable_settings = { anchor: '(tabs)' };

export default function RootLayout() {
  const [configReady, setConfigReady] = useState(false);

  useEffect(() => {
    cleanupExportFiles(); // exports left in the cache by a previous run hold personal data
    // Saved settings, queued offline changes and the saved data cache are all read before the first screen
    Promise.all([loadApiUrlOverride(), outbox.load(), readStoredOwner().then((o) => restoreQueryCache(queryClient, o))]).finally(() => setConfigReady(true));
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
  const { colors, accent } = useTheme();
  const { status } = useSession();
  useWidgetSync(status);
  useWidgetAccent(accent);

  // While signed in: watch the connection, send queued changes, keep the data cache saved
  useEffect(() => {
    if (status !== 'signedIn') return;
    return startSync();
  }, [status]);
  const signedIn = status === 'signedIn';
  const profile = useProfile(signedIn);

  const resolving = status === 'loading' || (signedIn && profile.isPending);

  useEffect(() => {
    if (profile.data) setAppTimeZone(profile.data.timezone);
  }, [profile.data]);

  // The navigator must never be unmounted once it exists: removing and re-creating the root stack at
  // runtime (e.g. when the profile is fetched right after signing in) leaves a blank screen and the
  // "REMOVE_ROUTES was not handled by any navigator" error. So it is mounted once the first state is
  // known, then stays; later waits are covered by an overlay instead.
  const [appMounted, setAppMounted] = useState(false);
  if (!resolving && !appMounted) setAppMounted(true);

  // The native splash is hidden by <AnimatedSplash>, which plays over the app until it's ready
  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {appMounted || !resolving ? <AppContent resolving={resolving} /> : null}
      <AnimatedSplash ready={!resolving} />
    </View>
  );
}

function AppContent({ resolving }: { resolving: boolean }) {
  const { colors, scheme, reduceMotion } = useTheme();
  const { status } = useSession();
  const signedIn = status === 'signedIn';
  const profile = useProfile(signedIn);
  const serverSheet = useDisclosure();
  const onboarded = Boolean(profile.data);

  // Signed in but the server is unreachable and nothing is saved on the device: don't guess, let the
  // user retry or fix the address. (With a saved copy of the profile we carry on and work offline.)
  // Shown over the navigator rather than instead of it, so the navigator is never unmounted.
  const failed = signedIn && profile.isError && !profile.data;
  const cover = failed ? (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center' }]}>
      <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      <Text variant="caption" tone="subtle" center>
        Server: {config.apiUrl}
      </Text>
      <Button title="Change server address" variant="ghost" onPress={serverSheet.show} style={{ marginTop: 8 }} />
      {serverSheet.open ? <ServerUrlSheet visible onClose={serverSheet.hide} onSaved={() => profile.refetch()} /> : null}
    </View>
  ) : resolving ? (
    // e.g. the profile loading right after signing in
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.canvas, justifyContent: 'center', alignItems: 'center' }]}>
      <ActivityIndicator color={colors.accent} />
    </View>
  ) : null;

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
      {signedIn && onboarded ? <SyncBanner /> : null}
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.canvas },
          headerTitleStyle: { fontWeight: '600', color: colors.fg },
          headerTintColor: colors.accent,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.canvas },
          // "Reduce motion": screens appear instead of sliding
          animation: reduceMotion ? 'none' : 'default',
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
              animation: reduceMotion ? 'none' : 'fade',
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          {/* Calendar composer: same bottom popup, laid out like the web app's event dialog */}
          <Stack.Screen
            name="event/new"
            options={{
              presentation: 'transparentModal',
              animation: reduceMotion ? 'none' : 'fade',
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
      {cover}
    </NavThemeProvider>
  );
}

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { palette, type ColorScheme, type Colors } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  colors: Colors;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const STORAGE_KEY = 'neri.theme';
const LEGACY_STORAGE_KEY = 'aura.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    (async () => {
      const v = (await AsyncStorage.getItem(STORAGE_KEY)) || (await AsyncStorage.getItem(LEGACY_STORAGE_KEY));
      if (v === 'light' || v === 'dark' || v === 'system') setPreferenceState(v);
    })().catch(() => {});
  }, []);

  // Native UI (Android date/time dialogs, alerts, keyboards) follows the app's
  // theme choice, not only the system setting
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'auto' : preference);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme =
      preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
    return {
      colors: palette[scheme],
      scheme,
      preference,
      setPreference: (p) => {
        setPreferenceState(p);
        AsyncStorage.setItem(STORAGE_KEY, p).catch(() => {});
      },
    };
  }, [preference, system]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/**
 * Build a StyleSheet-like object from theme colors, memoized per scheme.
 * Usage: `const styles = useStyles((c) => ({ row: { backgroundColor: c.surface } }));`
 */
export function useStyles<T>(factory: (c: Colors) => T): T {
  const { colors } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(colors), [colors]);
}

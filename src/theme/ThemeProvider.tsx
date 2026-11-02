import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Appearance as RNAppearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';

import { deriveAccent } from './accent';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveReduceMotion,
  serializeAppearance,
  type Appearance,
  type ReduceMotionPreference,
  type ThemePreference,
} from './appearance';
import { palette, type ColorScheme, type Colors } from './tokens';

export type { ReduceMotionPreference, ThemePreference } from './appearance';

interface ThemeContextValue {
  colors: Colors;
  scheme: ColorScheme;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Custom accent (#rrggbb), or null for the Neri default. */
  accent: string | null;
  setAccent: (hex: string | null) => void;
  /** In-app text size multiplier; null follows the device's font size setting. */
  textScale: number | null;
  setTextScale: (scale: number | null) => void;
  reduceMotionPreference: ReduceMotionPreference;
  setReduceMotionPreference: (p: ReduceMotionPreference) => void;
  /** True when animations should be skipped (the user's choice, else the device setting). */
  reduceMotion: boolean;
}

const STORAGE_KEY = 'neri.appearance';
const THEME_KEY = 'neri.theme';
const LEGACY_THEME_KEY = 'aura.theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The device's "reduce motion" accessibility setting, kept live. */
function useSystemReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => live && setOn(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return on;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const systemReduces = useSystemReduceMotion();
  const [prefs, setPrefs] = useState<Appearance>(DEFAULT_APPEARANCE);
  // Don't write the defaults back over saved choices before they've been read
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      const [raw, theme, legacy] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        AsyncStorage.getItem(THEME_KEY),
        AsyncStorage.getItem(LEGACY_THEME_KEY),
      ]);
      setPrefs(parseAppearance(raw, theme || legacy));
    })()
      .catch(() => {})
      .finally(() => {
        loaded.current = true;
      });
  }, []);

  const update = useCallback((patch: Partial<Appearance>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      if (loaded.current) AsyncStorage.setItem(STORAGE_KEY, serializeAppearance(next)).catch(() => {});
      return next;
    });
  }, []);

  // Native UI (Android date/time dialogs, alerts, keyboards) follows the app's
  // theme choice, not only the system setting
  useEffect(() => {
    RNAppearance.setColorScheme(prefs.theme === 'system' ? 'auto' : prefs.theme);
  }, [prefs.theme]);

  const reduceMotion = resolveReduceMotion(prefs.reduceMotion, systemReduces);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: ColorScheme = prefs.theme === 'system' ? (system === 'dark' ? 'dark' : 'light') : prefs.theme;
    const colors: Colors = prefs.accent ? { ...palette[scheme], ...deriveAccent(prefs.accent, scheme) } : palette[scheme];
    return {
      colors,
      scheme,
      preference: prefs.theme,
      setPreference: (theme) => update({ theme }),
      accent: prefs.accent,
      setAccent: (accent) => update({ accent }),
      textScale: prefs.textScale,
      setTextScale: (textScale) => update({ textScale }),
      reduceMotionPreference: prefs.reduceMotion,
      setReduceMotionPreference: (reduceMotionPref) => update({ reduceMotion: reduceMotionPref }),
      reduceMotion,
    };
  }, [prefs, system, reduceMotion, update]);

  return (
    <ThemeContext.Provider value={value}>
      {/* Reanimated animations follow the same switch (layout transitions, springs, timings) */}
      <ReducedMotionConfig mode={reduceMotion ? ReduceMotion.Always : ReduceMotion.Never} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

/** Whether animations should be skipped. Use instead of Reanimated's/RN's own hook so the in-app choice counts. */
export const useReduceMotion = () => useTheme().reduceMotion;

/**
 * Build a StyleSheet-like object from theme colors, memoized per scheme.
 * Usage: `const styles = useStyles((c) => ({ row: { backgroundColor: c.surface } }));`
 */
export function useStyles<T>(factory: (c: Colors) => T): T {
  const { colors } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(colors), [colors]);
}

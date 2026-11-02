/**
 * Appearance preferences (pure, no React Native): what is stored, how it is validated,
 * and the small helpers the UI uses to apply text size and reduced motion.
 */
import { normalizeHex } from './accent';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ReduceMotionPreference = 'system' | 'on' | 'off';

/** In-app text sizes, as a multiplier on the design's base sizes. 1 is the design size. */
export const TEXT_SCALE_STEPS = [
  { value: 0.88, label: 'Small' },
  { value: 1, label: 'Default' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Larger' },
  { value: 1.5, label: 'Largest' },
] as const;

export interface Appearance {
  theme: ThemePreference;
  /** Custom accent colour (#rrggbb); null = the Neri default. */
  accent: string | null;
  /** In-app text size multiplier; null = follow the device's font size setting. */
  textScale: number | null;
  reduceMotion: ReduceMotionPreference;
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  accent: null,
  textScale: null,
  reduceMotion: 'system',
};

/** The multiplier is limited to what the design was laid out for. */
export const clampTextScale = (n: number) => Math.min(1.5, Math.max(0.8, n));

const isTheme = (v: unknown): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark';
const isMotion = (v: unknown): v is ReduceMotionPreference => v === 'system' || v === 'on' || v === 'off';

/**
 * Read stored preferences, tolerating missing, old or corrupt data (anything invalid falls back
 * to the default for that field). `legacyTheme` is the value the app stored before these
 * settings existed.
 */
export function parseAppearance(raw: string | null | undefined, legacyTheme?: string | null): Appearance {
  const out: Appearance = { ...DEFAULT_APPEARANCE };
  if (isTheme(legacyTheme)) out.theme = legacyTheme;
  if (!raw) return out;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === 'object') {
      if (isTheme(v.theme)) out.theme = v.theme;
      if (v.accent === null) out.accent = null;
      else if (typeof v.accent === 'string') out.accent = normalizeHex(v.accent);
      if (v.textScale === null) out.textScale = null;
      else if (typeof v.textScale === 'number' && Number.isFinite(v.textScale)) out.textScale = clampTextScale(v.textScale);
      if (isMotion(v.reduceMotion)) out.reduceMotion = v.reduceMotion;
    }
  } catch {
    // corrupt JSON: keep defaults
  }
  return out;
}

export const serializeAppearance = (a: Appearance) => JSON.stringify(a);

/** Whether to cut motion, given the user's choice and the device setting. */
export function resolveReduceMotion(pref: ReduceMotionPreference, systemReduces: boolean): boolean {
  return pref === 'on' ? true : pref === 'off' ? false : systemReduces;
}

/** Scale `fontSize` and `lineHeight` of a flat style. `scale` null leaves it to the OS. */
export function scaleFont<T extends { fontSize?: number; lineHeight?: number }>(style: T, scale: number | null): T {
  if (scale === null || scale === 1) return style;
  const out = { ...style };
  if (typeof out.fontSize === 'number') out.fontSize = Math.round(out.fontSize * scale * 10) / 10;
  if (typeof out.lineHeight === 'number') out.lineHeight = Math.round(out.lineHeight * scale * 10) / 10;
  return out;
}

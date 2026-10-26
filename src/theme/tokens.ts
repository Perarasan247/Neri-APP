/**
 * Design tokens. Mirrors the web app's Ledger theme (frontend/src/index.css)
 * so both clients feel like one product. Components never use raw hex values;
 * they read these through `useTheme()`.
 */

export const palette = {
  light: {
    canvas: '#f6f8fa',
    surface: '#ffffff',
    subtle: '#fafbfc',
    muted: '#f1f4f7',
    mutedStrong: '#e6eaef',
    line: '#e3e8ee',
    lineStrong: '#d5dbe1',

    fg: '#1a1f36',
    fgSoft: '#3c4257',
    fgMuted: '#697386',
    fgSubtle: '#8792a2',

    accent: '#635bff',
    accentPressed: '#544de0',
    accentSoft: '#f0efff',
    accentFg: '#ffffff',
    accentText: '#5851ea',

    success: '#0e7a54',
    successSoft: '#d7f7e6',
    warning: '#a35200',
    warningSoft: '#fdedd3',
    danger: '#c0123c',
    dangerSoft: '#ffe7ec',
    info: '#0062c4',
    infoSoft: '#e0efff',

    p1: '#df1b41',
    p2: '#e56f00',
    p3: '#0570de',
    p4: '#8792a2',

    overlay: 'rgba(26, 31, 54, 0.4)',
    shadow: '#1a1f36',
  },
  dark: {
    canvas: '#0e131b',
    surface: '#161d29',
    subtle: '#1a2230',
    muted: '#1e2634',
    mutedStrong: '#283142',
    line: '#262f3e',
    lineStrong: '#344052',

    fg: '#e6e9f0',
    fgSoft: '#c3cad6',
    fgMuted: '#98a2b3',
    fgSubtle: '#6f7a8d',

    accent: '#7a73ff',
    accentPressed: '#8c86ff',
    accentSoft: '#24224a',
    accentFg: '#ffffff',
    accentText: '#a9a4ff',

    success: '#3ecf8e',
    successSoft: '#10352a',
    warning: '#f0a54a',
    warningSoft: '#3a2a14',
    danger: '#ff6b85',
    dangerSoft: '#3f1724',
    info: '#5ea8ff',
    infoSoft: '#132b48',

    p1: '#ff5c7a',
    p2: '#ff9a3d',
    p3: '#5ea8ff',
    p4: '#7d8799',

    overlay: 'rgba(0, 0, 0, 0.6)',
    shadow: '#000000',
  },
} as const;

export type ColorScheme = keyof typeof palette;
export type Colors = { [K in keyof typeof palette.light]: string };

/** 4pt spacing scale. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  pill: 999,
} as const;

export const font = {
  /** size / lineHeight pairs */
  caption: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 17, lineHeight: 22 },
  heading: { fontSize: 22, lineHeight: 28 },
  display: { fontSize: 28, lineHeight: 34 },
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Brand gradient used for the logo tile. */
export const brand = { from: '#635bff', to: '#a259ff' } as const;

/** Colors offered when creating habits and tasks (stored on the server). */
export const PRESET_COLORS = [
  '#635bff',
  '#8b5cf6',
  '#ec4899',
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#64748b',
] as const;

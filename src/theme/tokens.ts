/**
 * Design tokens. Mirrors the web app's Neri theme (frontend/src/index.css)
 * so both clients feel like one product. Components never use raw hex values;
 * they read these through `useTheme()`.
 */

export const palette = {
  light: {
    canvas: '#f5f5f7',
    surface: '#ffffff',
    subtle: '#fafafb',
    muted: '#f1f1f4',
    mutedStrong: '#e6e6eb',
    line: '#e9e9ee',
    lineStrong: '#d9d9e0',

    fg: '#121218',
    fgSoft: '#373744',
    fgMuted: '#6a6a7a',
    fgSubtle: '#93939f',

    accent: '#5b4ff5',
    accentPressed: '#4d41e6',
    accentSoft: '#f0eeff',
    accentFg: '#ffffff',
    accentText: '#4e42e3',
    accent2: '#9a5cff',

    success: '#0a7d57',
    successSoft: '#e1f5ec',
    warning: '#a95400',
    warningSoft: '#fdf1df',
    danger: '#d02848',
    dangerSoft: '#fdebee',
    info: '#1f66d6',
    infoSoft: '#e7effd',

    p1: '#e5294b',
    p2: '#ea7a0c',
    p3: '#2f74e6',
    p4: '#93939f',

    overlay: 'rgba(18, 18, 24, 0.38)',
    shadow: '#121218',
  },
  dark: {
    canvas: '#0b0b0f',
    surface: '#141419',
    subtle: '#17171d',
    muted: '#1c1c23',
    mutedStrong: '#26262f',
    line: '#23232b',
    lineStrong: '#31313b',

    fg: '#ededf2',
    fgSoft: '#c8c8d2',
    fgMuted: '#9696a6',
    fgSubtle: '#6b6b7b',

    accent: '#7466ff',
    accentPressed: '#8679ff',
    accentSoft: '#1f1b3c',
    accentFg: '#ffffff',
    accentText: '#aaa1ff',
    accent2: '#b07cff',

    success: '#3dd598',
    successSoft: '#0f2a20',
    warning: '#f3a83b',
    warningSoft: '#2e2211',
    danger: '#ff6b81',
    dangerSoft: '#3a1520',
    info: '#62a4ff',
    infoSoft: '#13223b',

    p1: '#ff5f79',
    p2: '#ff9b40',
    p3: '#62a4ff',
    p4: '#74748a',

    overlay: 'rgba(0, 0, 0, 0.62)',
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
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 24,
  pill: 999,
} as const;

/** Soft, layered elevation (iOS shadow + Android elevation). Color comes from `colors.shadow`. */
export const elevation = {
  card: { shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  raised: { shadowOpacity: 0.1, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  float: { shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
} as const;

export const font = {
  /** size / lineHeight pairs */
  caption: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyLarge: { fontSize: 16, lineHeight: 22 },
  title: { fontSize: 17, lineHeight: 22 },
  heading: { fontSize: 22, lineHeight: 28 },
  display: { fontSize: 32, lineHeight: 38 },
} as const;

export const weight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Brand gradient used for the logo tile. */
export const brand = { from: '#5b4ff5', to: '#9a5cff' } as const;

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

/**
 * Accent colour maths (pure, no React Native): turns one colour the user picks into the
 * full set of accent tokens for light and dark, keeping text and controls readable.
 *
 * Rules (WCAG 2.x):
 * - the accent itself stays >= 3:1 against the surface (it fills buttons, rings, checkboxes)
 * - text drawn on the accent (`accentFg`) is whichever of white / near-black reads better
 * - accent-coloured text (`accentText`) is >= 4.5:1 against its soft tint and the surface
 */

export type RGB = [number, number, number];

export interface AccentSet {
  accent: string;
  accentPressed: string;
  accentSoft: string;
  accentFg: string;
  accentText: string;
  accent2: string;
  /** Logo-style gradient ends (the floating "+" button). */
  brandFrom: string;
  brandTo: string;
}

export interface AccentPreset {
  id: string;
  name: string;
  /** null = the built-in Neri indigo, whose hand-tuned light/dark values are kept as they are. */
  hex: string | null;
}

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: 'indigo', name: 'Indigo', hex: null },
  { id: 'violet', name: 'Violet', hex: '#8b5cf6' },
  { id: 'pink', name: 'Pink', hex: '#db2777' },
  { id: 'red', name: 'Red', hex: '#e11d48' },
  { id: 'orange', name: 'Orange', hex: '#ea580c' },
  { id: 'amber', name: 'Amber', hex: '#d97706' },
  { id: 'green', name: 'Green', hex: '#16a34a' },
  { id: 'teal', name: 'Teal', hex: '#0d9488' },
  { id: 'blue', name: 'Blue', hex: '#2563eb' },
  { id: 'slate', name: 'Slate', hex: '#475569' },
];

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#141419';
const NEAR_BLACK = '#121218';

/* ---------- Conversions ---------- */

/** "#abc", "abc", "#AABBCC" → "#aabbcc"; anything else → null. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map((ch) => ch + ch).join('');
  return /^[0-9a-f]{6}$/.test(s) ? `#${s}` : null;
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function rgbToHex([r, g, b]: RGB): string {
  const part = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** h in degrees [0, 360), s and l in [0, 1]. */
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

export function hslToRgb([h, s, l]: [number, number, number]): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

/* ---------- Contrast ---------- */

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as RGB;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (none) to 21 (black on white). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `t` of the way from a to b. */
export function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
}

/** Whichever of white / near-black has more contrast on `bg`. */
export function readableOn(bg: string): string {
  return contrast('#ffffff', bg) >= contrast(NEAR_BLACK, bg) ? '#ffffff' : NEAR_BLACK;
}

/** Step the lightness of `hex` until it reaches `min` contrast against `against` (or runs out of room). */
export function ensureContrast(hex: string, against: string, min: number, direction: 'darker' | 'lighter'): string {
  if (contrast(hex, against) >= min) return hex;
  const [h, s, l0] = rgbToHsl(hexToRgb(hex));
  let l = l0;
  for (let i = 0; i < 60; i++) {
    l = clamp(l + (direction === 'darker' ? -0.015 : 0.015), 0, 1);
    const next = rgbToHex(hslToRgb([h, s, l]));
    if (contrast(next, against) >= min) return next;
    if (l === 0 || l === 1) return next;
  }
  return hex;
}

/** The same colour with its hue turned `deg` degrees (used for the second gradient stop). */
export function rotateHue(hex: string, deg: number): string {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  return rgbToHex(hslToRgb([h + deg, s, l]));
}

/* ---------- Derivation ---------- */

export function deriveAccent(base: string, scheme: 'light' | 'dark'): AccentSet {
  const picked = normalizeHex(base) ?? '#5b4ff5';
  const dark = scheme === 'dark';
  const surface = dark ? DARK_SURFACE : LIGHT_SURFACE;

  let accent = ensureContrast(picked, surface, 3, dark ? 'lighter' : 'darker');
  // Mid-tones can miss 4.5:1 with both white and near-black labels: nudge towards the nearer one
  const fg0 = readableOn(accent);
  if (contrast(fg0, accent) < 4.5) {
    accent = ensureContrast(accent, fg0, 4.5, fg0 === '#ffffff' ? 'darker' : 'lighter');
  }
  const accentPressed = dark ? mix(accent, '#ffffff', 0.14) : mix(accent, '#000000', 0.12);
  const accentSoft = mix(accent, surface, dark ? 0.82 : 0.9);
  const accentText = ensureContrast(dark ? mix(accent, '#ffffff', 0.25) : accent, accentSoft, 4.5, dark ? 'lighter' : 'darker');
  const accent2 = rotateHue(accent, 28);

  return {
    accent,
    accentPressed,
    accentSoft,
    accentFg: readableOn(accent),
    accentText,
    accent2,
    brandFrom: accent,
    brandTo: accent2,
  };
}

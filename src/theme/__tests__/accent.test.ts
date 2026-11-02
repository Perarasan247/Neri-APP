import {
  ACCENT_PRESETS,
  contrast,
  deriveAccent,
  ensureContrast,
  hexToRgb,
  normalizeHex,
  readableOn,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
} from '../accent';
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveReduceMotion,
  scaleFont,
  serializeAppearance,
} from '../appearance';

describe('hex handling', () => {
  it('normalises shorthand, case and the # prefix', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('5b4ff5')).toBe('#5b4ff5');
    expect(normalizeHex('  #5B4FF5 ')).toBe('#5b4ff5');
  });
  it('rejects anything that is not a colour', () => {
    for (const bad of ['', '#12', '#12345', '#gggggg', 'red', null, undefined]) expect(normalizeHex(bad as any)).toBeNull();
  });
  it('round-trips through rgb and hsl', () => {
    for (const hex of ['#5b4ff5', '#e11d48', '#16a34a', '#000000', '#ffffff', '#808080']) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
      const back = rgbToHex(hslToRgb(rgbToHsl(hexToRgb(hex))));
      const [r1, g1, b1] = hexToRgb(hex);
      const [r2, g2, b2] = hexToRgb(back);
      expect(Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)).toBeLessThanOrEqual(3);
    }
  });
});

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });
  it('picks a readable foreground', () => {
    expect(readableOn('#ffeb3b')).not.toBe('#ffffff'); // yellow needs dark text
    expect(readableOn('#1e3a8a')).toBe('#ffffff');
  });
  it('ensureContrast only moves a colour as far as needed', () => {
    expect(ensureContrast('#000000', '#ffffff', 3, 'darker')).toBe('#000000');
    const fixed = ensureContrast('#ffe082', '#ffffff', 3, 'darker');
    expect(contrast(fixed, '#ffffff')).toBeGreaterThanOrEqual(3);
  });
});

describe('deriveAccent', () => {
  const samples = [...ACCENT_PRESETS.map((p) => p.hex).filter((h): h is string => !!h), '#ffeb3b', '#000000', '#ffffff', '#00ff00', '#ff00ff'];

  it.each(samples)('keeps %s readable in light and dark', (base) => {
    for (const scheme of ['light', 'dark'] as const) {
      const surface = scheme === 'light' ? '#ffffff' : '#141419';
      const set = deriveAccent(base, scheme);
      // The accent can fill buttons and rings without vanishing into the surface
      expect(contrast(set.accent, surface)).toBeGreaterThanOrEqual(3);
      // Label text on a filled button
      expect(contrast(set.accentFg, set.accent)).toBeGreaterThanOrEqual(4.5);
      // Accent-coloured text on its own soft tint and on the surface
      expect(contrast(set.accentText, set.accentSoft)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(set.accentText, surface)).toBeGreaterThanOrEqual(4.5);
      for (const v of Object.values(set)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('leaves a colour that already passes untouched', () => {
    expect(deriveAccent('#2563eb', 'light').accent).toBe('#2563eb');
  });
  it('falls back to the default colour for garbage input', () => {
    expect(deriveAccent('nope', 'light').accent).toBe(deriveAccent('#5b4ff5', 'light').accent);
  });
});

describe('appearance storage', () => {
  it('defaults when nothing is stored', () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('')).toEqual(DEFAULT_APPEARANCE);
  });
  it('migrates the old theme-only setting', () => {
    expect(parseAppearance(null, 'dark').theme).toBe('dark');
    expect(parseAppearance(null, 'bogus').theme).toBe('system');
  });
  it('round-trips valid preferences', () => {
    const a = { theme: 'dark', accent: '#e11d48', textScale: 1.3, reduceMotion: 'on' } as const;
    expect(parseAppearance(serializeAppearance(a))).toEqual(a);
  });
  it('survives corrupt or hostile data, field by field', () => {
    expect(parseAppearance('{not json')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance('[1,2]')).toEqual(DEFAULT_APPEARANCE);
    const odd = parseAppearance(JSON.stringify({ theme: 'neon', accent: 'blue', textScale: 99, reduceMotion: 'maybe' }));
    expect(odd).toEqual({ ...DEFAULT_APPEARANCE, textScale: 1.5 });
    expect(parseAppearance(JSON.stringify({ textScale: 'big' })).textScale).toBeNull();
    expect(parseAppearance(JSON.stringify({ textScale: 0.1 })).textScale).toBe(0.8);
  });
});

describe('motion and text helpers', () => {
  it('lets an explicit choice beat the device setting', () => {
    expect(resolveReduceMotion('on', false)).toBe(true);
    expect(resolveReduceMotion('off', true)).toBe(false);
    expect(resolveReduceMotion('system', true)).toBe(true);
    expect(resolveReduceMotion('system', false)).toBe(false);
  });
  it('scales font size and line height together', () => {
    expect(scaleFont({ fontSize: 15, lineHeight: 21, color: 'x' } as any, 1.3)).toEqual({ fontSize: 19.5, lineHeight: 27.3, color: 'x' });
    const s = { fontSize: 15 };
    expect(scaleFont(s, null)).toBe(s);
    expect(scaleFont({ lineHeight: 20 }, 1.5)).toEqual({ lineHeight: 30 });
  });
});

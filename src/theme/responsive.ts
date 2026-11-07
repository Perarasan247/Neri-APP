/**
 * Responsive layout maths: pure functions of the window size, so they can be unit tested
 * without a React Native runtime. Screens read them live through `useResponsive()`.
 *
 * Size classes (window width in dp/pt):
 *   compact  < 360   small phones (iPhone SE 1st gen, small Androids, split screen)
 *   regular  360–413 most phones
 *   large    414–599 Plus / Max / large Androids
 *   tablet   600–899 small tablets, unfolded foldables, phones in landscape
 *   wide     ≥ 900   large tablets, desktop web
 */

export type SizeClass = 'compact' | 'regular' | 'large' | 'tablet' | 'wide';

export const BREAKPOINTS = { regular: 360, large: 414, tablet: 600, wide: 900 } as const;

/** Side padding of screen content. */
const GUTTER: Record<SizeClass, number> = { compact: 12, regular: 16, large: 20, tablet: 24, wide: 32 };

/** Widest a column of content may grow; phones use the whole width. */
const MAX_WIDTH: Record<SizeClass, number | undefined> = {
  compact: undefined,
  regular: undefined,
  large: undefined,
  tablet: 720,
  wide: 960,
};

/** Gentle multiplier for spacing and icon sizes (not text: text follows the user's font scale). */
const SCALE: Record<SizeClass, number> = { compact: 0.9, regular: 1, large: 1.04, tablet: 1.08, wide: 1.1 };

export function sizeClassFor(width: number): SizeClass {
  if (width >= BREAKPOINTS.wide) return 'wide';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  if (width >= BREAKPOINTS.large) return 'large';
  if (width >= BREAKPOINTS.regular) return 'regular';
  return 'compact';
}

export interface ResponsiveLayout {
  width: number;
  height: number;
  sizeClass: SizeClass;
  isCompact: boolean;
  /** Tablet or wider: content is centred in a capped column. */
  isTablet: boolean;
  landscape: boolean;
  gutter: number;
  /** Cap for the content column, or undefined to use the full width. */
  contentMaxWidth: number | undefined;
  /** Usable width of the content column (inside the gutters). */
  contentWidth: number;
  /** How many items of at least `minItemWidth` fit side by side in the content column. */
  columns: (minItemWidth: number, gap?: number, max?: number) => number;
  /** Scale a spacing / icon size for this size class, rounded to whole points. */
  scale: (n: number) => number;
}

export function describeLayout(width: number, height: number): ResponsiveLayout {
  const w = Math.max(0, width);
  const sizeClass = sizeClassFor(w);
  const gutter = GUTTER[sizeClass];
  const contentMaxWidth = MAX_WIDTH[sizeClass];
  const column = contentMaxWidth ? Math.min(w, contentMaxWidth) : w;
  const contentWidth = Math.max(0, column - gutter * 2);
  const factor = SCALE[sizeClass];
  return {
    width: w,
    height,
    sizeClass,
    isCompact: sizeClass === 'compact',
    isTablet: sizeClass === 'tablet' || sizeClass === 'wide',
    landscape: w > height,
    gutter,
    contentMaxWidth,
    contentWidth,
    columns: (minItemWidth, gap = 0, max = Infinity) => columnsFor(contentWidth, minItemWidth, gap, max),
    scale: (n) => Math.round(n * factor),
  };
}

/** Items of at least `minItemWidth` (with `gap` between them) that fit in `available`, from 1 to `max`. */
export function columnsFor(available: number, minItemWidth: number, gap = 0, max = Infinity): number {
  if (minItemWidth <= 0) return 1;
  const n = Math.floor((available + gap) / (minItemWidth + gap));
  return Math.max(1, Math.min(max, n));
}

/** Split items into rows of `columns` (for grids built from flex rows). */
export function chunk<T>(items: T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Entrance stagger for list item `index`: grows by `step` ms, capped so long lists don't wait. */
export function staggerDelay(index: number, step = 35, cap = 8): number {
  return Math.max(0, Math.min(index, cap)) * step;
}

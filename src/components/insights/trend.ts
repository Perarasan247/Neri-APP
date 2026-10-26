import type { TrendGranularity } from '@/api/types';

/** Up to this many points a trend reads better as bars than as a line. */
export const BAR_MAX_POINTS = 14;

/** Tooltip title for a trend point label. */
export const pointTitle = (label: string, g?: TrendGranularity) => (g === 'week' ? `Week of ${label}` : label);

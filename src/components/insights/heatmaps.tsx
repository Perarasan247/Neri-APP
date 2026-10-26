import React from 'react';

import { Heatmap, mixHex, type HeatmapDay } from '@/components/charts';
import { useTheme } from '@/theme/ThemeProvider';
import type { Colors } from '@/theme/tokens';

/** Heatmap scales, matching the web: accent for build habits, green/red for avoid habits. */
export function heatmapPalette(c: Colors) {
  const empty = c.mutedStrong;
  return {
    empty,
    rest: mixHex(c.warning, empty, 45),
    build: [empty, mixHex(c.accent, empty, 28), mixHex(c.accent, empty, 52), mixHex(c.accent, empty, 76), c.accent],
    avoid: {
      0: mixHex(c.success, empty, 60),
      2: mixHex(c.danger, empty, 40),
      3: mixHex(c.danger, empty, 70),
      4: c.danger,
    } as Record<number, string>,
  };
}

interface DashboardDay extends HeatmapDay {
  rate: number;
  done: number;
  scheduled: number;
  intensity: number;
  is_rest: boolean;
}

/** All-habits calendar: share of scheduled habits completed per day. */
export function DashboardHeatmap({ days }: { days: DashboardDay[] }) {
  const { colors } = useTheme();
  const p = heatmapPalette(colors);
  return (
    <Heatmap
      days={days}
      colorFor={(d) => (d.is_rest ? p.rest : p.build[Math.max(0, Math.min(4, d.intensity))])}
      describe={(d) =>
        d.is_rest
          ? 'Rest day, streak protected'
          : d.scheduled === 0
            ? 'Nothing scheduled'
            : `${d.done} of ${d.scheduled} done (${d.rate}%)`
      }
      legend={{ low: 'Less', high: 'More', steps: p.build, extra: [{ label: 'Rest', color: p.rest }] }}
    />
  );
}

interface YesNoDay extends HeatmapDay {
  intensity: number;
  is_done: boolean;
  is_rest: boolean;
  is_eligible: boolean;
}

/** Single build habit: done days in full accent. */
export function HabitActivityHeatmap({ days }: { days: YesNoDay[] }) {
  const { colors } = useTheme();
  const p = heatmapPalette(colors);
  return (
    <Heatmap
      days={days}
      colorFor={(d) => (d.is_done ? p.build[4] : d.is_rest ? p.rest : p.empty)}
      describe={(d) =>
        d.is_done ? 'Done' : d.is_rest ? 'Rest day, streak protected' : d.is_eligible ? 'Not done' : 'Not scheduled'
      }
      legend={{ low: 'Missed', high: 'Done', steps: [p.empty, p.build[4]], extra: [{ label: 'Rest', color: p.rest }] }}
    />
  );
}

interface AvoidDay extends HeatmapDay {
  occurrences: number;
  intensity: number;
  is_rest: boolean;
}

/** Avoid habit: clean days green, darker red means more slips. */
export function AvoidHeatmap({ days }: { days: AvoidDay[] }) {
  const { colors } = useTheme();
  const p = heatmapPalette(colors);
  return (
    <Heatmap
      days={days}
      colorFor={(d) => (d.is_rest ? p.rest : (p.avoid[d.intensity] ?? p.empty))}
      describe={(d) =>
        d.is_rest
          ? 'Rest day, streak protected'
          : d.occurrences === 0
            ? 'Clean day, no slips'
            : `${d.occurrences} ${d.occurrences === 1 ? 'slip' : 'slips'} recorded`
      }
      legend={{
        low: 'Clean',
        high: 'More slips',
        steps: [p.avoid[0], p.avoid[2], p.avoid[3], p.avoid[4]],
        extra: [{ label: 'Rest', color: p.rest }],
      }}
    />
  );
}

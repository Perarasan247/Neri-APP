import type { ImportReport } from '@/api/endpoints';

const FORMAT_NAMES: Record<string, string> = {
  neri_json: 'Neri backup (JSON)',
  long_csv: 'CSV, one row per habit and day',
  wide_csv: 'CSV, one column per habit (Loop Habit Tracker style)',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/** Readable lines for an import report: what was found (or, for a preview, what would happen). */
export function summarizeImport(r: ImportReport): string[] {
  const lines: string[] = [`Format: ${FORMAT_NAMES[r.format] ?? r.format}`];
  const add = (n: number, text: string) => n > 0 && lines.push(text);

  add(r.habits_created, `${plural(r.habits_created, 'new habit')}`);
  add(r.habits_matched, `${plural(r.habits_matched, 'habit')} matched with ones you already have`);
  add(r.logs_created, `${plural(r.logs_created, 'habit log')}`);
  add(r.value_entries_created, `${plural(r.value_entries_created, 'tracked value')}`);
  add(r.rest_days_created, `${plural(r.rest_days_created, 'rest day')}`);
  add(r.goals_created, `${plural(r.goals_created, 'goal')}`);
  add(r.tasks_created, `${plural(r.tasks_created, 'task')}`);
  add(r.logs_skipped, `${plural(r.logs_skipped, 'log')} skipped (already there, or not importable)`);
  add(r.tasks_skipped, `${plural(r.tasks_skipped, 'task')} skipped (already there)`);
  if (r.tracking_start_date_lowered_to) lines.push(`Tracking start date moves back to ${r.tracking_start_date_lowered_to}`);
  return lines;
}

/** True when importing would add nothing at all. */
export function isEmptyImport(r: ImportReport): boolean {
  return (
    r.habits_created + r.logs_created + r.value_entries_created + r.rest_days_created + r.goals_created + r.tasks_created === 0
  );
}

/** At most `max` warnings, with a count of the rest. */
export function summarizeWarnings(warnings: string[], max = 3): string[] {
  if (warnings.length <= max) return warnings;
  return [...warnings.slice(0, max), `…and ${warnings.length - max} more`];
}

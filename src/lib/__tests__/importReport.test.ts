import type { ImportReport } from '@/api/endpoints';
import { isEmptyImport, summarizeImport, summarizeWarnings } from '../importReport';

const base: ImportReport = {
  format: 'long_csv',
  dry_run: true,
  habits_created: 0,
  habits_matched: 0,
  logs_created: 0,
  logs_skipped: 0,
  value_entries_created: 0,
  rest_days_created: 0,
  goals_created: 0,
  tasks_created: 0,
  tasks_skipped: 0,
  tracking_start_date_lowered_to: null,
  warnings: [],
  errors: [],
};

describe('summarizeImport', () => {
  it('names the format and only mentions what is there, with correct plurals', () => {
    const lines = summarizeImport({ ...base, habits_created: 1, logs_created: 1200, habits_matched: 2 });
    expect(lines[0]).toBe('Format: CSV, one row per habit and day');
    expect(lines).toContain('1 new habit');
    expect(lines).toContain('1,200 habit logs');
    expect(lines).toContain('2 habits matched with ones you already have');
    expect(lines.join(' ')).not.toMatch(/goal|task|rest day/);
  });
  it('mentions a moved tracking start date and skipped rows', () => {
    const lines = summarizeImport({ ...base, logs_created: 3, logs_skipped: 1, tracking_start_date_lowered_to: '2024-01-05' });
    expect(lines).toContain('Tracking start date moves back to 2024-01-05');
    expect(lines).toContain('1 log skipped (already there, or not importable)');
  });
  it('falls back to the raw format name', () => {
    expect(summarizeImport({ ...base, format: 'mystery' })[0]).toBe('Format: mystery');
  });
});

describe('isEmptyImport', () => {
  it('is empty only when nothing would be created', () => {
    expect(isEmptyImport(base)).toBe(true);
    expect(isEmptyImport({ ...base, logs_skipped: 40, habits_matched: 2 })).toBe(true);
    expect(isEmptyImport({ ...base, tasks_created: 1 })).toBe(false);
  });
});

describe('summarizeWarnings', () => {
  it('caps the list', () => {
    expect(summarizeWarnings(['a', 'b'])).toEqual(['a', 'b']);
    expect(summarizeWarnings(['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', '…and 2 more']);
  });
});

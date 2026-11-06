import { isExportFileName } from '../exportFiles';

// (hoisted above the import by Jest)
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));

describe('export file names', () => {
  it('matches only what the app itself exports', () => {
    expect(isExportFileName('neri-backup-2026-11-01.json')).toBe(true);
    expect(isExportFileName('neri-habit-logs-2026-11-01.csv')).toBe(true);
    expect(isExportFileName('neri-tasks-2026-11-01.csv')).toBe(true);
    expect(isExportFileName('photo.jpg')).toBe(false);
    expect(isExportFileName('neri-backup.json')).toBe(false);
    expect(isExportFileName('neri-other-2026-11-01.csv')).toBe(false);
  });
});

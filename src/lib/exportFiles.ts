/**
 * Exported backups are written to the cache so the share sheet can read them. They hold personal data,
 * so they are removed later: not the moment the share sheet's promise resolves (on Android that is when
 * the sheet opens, and the receiving app may not have read the file yet), but after a delay, and on the next launch.
 */
import { Directory, File, Paths } from 'expo-file-system';

/** The names this app gives its exports (see DataSettings). */
export const isExportFileName = (name: string) => /^neri-(backup|habit-logs|tasks)-\d{4}-\d{2}-\d{2}\.(json|csv)$/.test(name);

/** Delete leftover export files from the cache. Never throws. */
export function cleanupExportFiles(): void {
  try {
    const dir = new Directory(Paths.cache);
    for (const entry of dir.list()) {
      if (entry instanceof File && isExportFileName(entry.name)) {
        try {
          entry.delete();
        } catch {}
      }
    }
  } catch {}
}

/** Delete one file after `ms` (best effort; anything missed is caught by `cleanupExportFiles` next launch). */
export function deleteLater(file: File, ms = 5 * 60_000): void {
  setTimeout(() => {
    try {
      file.delete();
    } catch {}
  }, ms);
}

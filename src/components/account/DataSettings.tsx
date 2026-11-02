import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { FileJson, FileSpreadsheet, ListChecks, Upload } from 'lucide-react-native';

import * as api from '@/api/endpoints';
import { NavGroup, NavRow } from '@/components/account/NavRow';
import { Text, useDialog, useToast } from '@/components/ui';
import { isEmptyImport, summarizeImport, summarizeWarnings } from '@/lib/importReport';
import { haptic } from '@/lib/haptics';
import { today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const ICON = 17;
/** The server refuses larger imports (10 MB of text). */
const MAX_IMPORT_CHARS = 10_000_000;

const FILES: Record<api.ExportKind, { name: string; mime: string; uti: string; label: string }> = {
  json: { name: 'neri-backup', mime: 'application/json', uti: 'public.json', label: 'Neri backup' },
  logs: { name: 'neri-habit-logs', mime: 'text/csv', uti: 'public.comma-separated-values-text', label: 'Habit logs' },
  tasks: { name: 'neri-tasks', mime: 'text/csv', uti: 'public.comma-separated-values-text', label: 'Tasks' },
};

/** Export your data (JSON backup, CSV of habit logs or tasks) and import from Neri or other trackers. */
export function DataSettings() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const [busy, setBusy] = useState<string | null>(null);
  const tint = colors.accentText;

  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      haptic.warning();
      toast(e instanceof Error ? e.message : 'Something went wrong.', { tone: 'danger' });
    } finally {
      setBusy(null);
    }
  };

  const doExport = (kind: api.ExportKind) =>
    run(`export-${kind}`, async () => {
      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Sharing isn’t available on this device.');
      }
      const text = await api.exportData(kind);
      const f = FILES[kind];
      const ext = kind === 'json' ? 'json' : 'csv';
      const file = new File(Paths.cache, `${f.name}-${today()}.${ext}`);
      file.create({ overwrite: true });
      await file.write(text);
      try {
        await Sharing.shareAsync(file.uri, { mimeType: f.mime, UTI: f.uti, dialogTitle: `Export ${f.label.toLowerCase()}` });
      } finally {
        // The file holds personal data: don't leave a copy in the cache
        try {
          file.delete();
        } catch {}
      }
    });

  const doImport = () =>
    run('import', async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];

      const file = new File(asset.uri);
      let text: string;
      try {
        text = await file.text();
      } finally {
        try {
          file.delete(); // the picker's cached copy
        } catch {}
      }
      if (!text.trim()) throw new Error('That file is empty.');
      if (text.length > MAX_IMPORT_CHARS) throw new Error('That file is too large to import (10 MB max).');

      // Preview first: exact counts, nothing changed yet
      const preview = await api.importData(text, { filename: asset.name, dryRun: true });
      const lines = summarizeImport(preview);
      const warnings = summarizeWarnings(preview.warnings);

      if (isEmptyImport(preview)) {
        dialog.alert(
          'Nothing to import',
          [...lines, ...(warnings.length ? ['', ...warnings] : [])].join('\n') + '\n\nEverything in this file is already in Neri.',
          [{ text: 'OK' }],
        );
        return;
      }

      dialog.alert(
        'Import this file?',
        [`${asset.name}`, '', ...lines, ...(warnings.length ? ['', ...warnings.map((w) => `⚠ ${w}`)] : []), '', 'Nothing you already have is overwritten.'].join('\n'),
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () =>
              void run('import-confirm', async () => {
                const done = await api.importData(text, { filename: asset.name });
                haptic.success();
                await qc.invalidateQueries();
                toast(
                  `Imported ${done.logs_created.toLocaleString('en-GB')} logs, ${done.tasks_created} tasks, ${done.habits_created} habits`,
                  { tone: 'success' },
                );
              }),
          },
        ],
      );
    });

  const status = (key: string, idle: string) => (busy === key ? 'Working…' : idle);

  return (
    <>
      <NavGroup title="Your data">
        <NavRow
          icon={<FileJson size={ICON} color={tint} />}
          label="Export everything"
          value={status('export-json', 'JSON backup')}
          onPress={() => doExport('json')}
        />
        <NavRow
          icon={<FileSpreadsheet size={ICON} color={tint} />}
          label="Export habit logs"
          value={status('export-logs', 'CSV')}
          onPress={() => doExport('logs')}
        />
        <NavRow
          icon={<ListChecks size={ICON} color={tint} />}
          label="Export tasks"
          value={status('export-tasks', 'CSV')}
          onPress={() => doExport('tasks')}
        />
        <NavRow
          icon={<Upload size={ICON} color={tint} />}
          label="Import data"
          value={status('import', 'JSON or CSV')}
          onPress={doImport}
        />
      </NavGroup>
      <Text variant="caption" tone="subtle" style={{ marginTop: -space.md, marginBottom: space.xl, paddingHorizontal: space.xs }}>
        Imports Neri backups, Loop Habit Tracker exports, and any CSV with date and habit columns. You see a summary
        before anything is added, and existing data is never overwritten. Exports and imports need a connection.
      </Text>
    </>
  );
}

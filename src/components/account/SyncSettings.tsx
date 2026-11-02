import React, { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CloudOff, RefreshCw } from 'lucide-react-native';

import { pingServer } from '@/api/client';
import { Button, Card, Row, SectionHeader, Text, useDialog, useToast } from '@/components/ui';
import { useOnline } from '@/offline/connectivity';
import { describeOp } from '@/offline/outbox';
import { flushNow, getSyncOwner, outbox } from '@/offline/sync';
import { useOutboxState } from '@/offline/useOutbox';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

/** Offline status, a "Sync now" button, and any changes the server rejected (retry or discard). */
export function SyncSettings() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const online = useOnline();
  const { pending, failed, flushing } = useOutboxState();
  const [busy, setBusy] = useState(false);
  const owner = getSyncOwner();
  const failedList = owner ? outbox.failedEntries(owner) : [];

  const syncNow = async () => {
    setBusy(true);
    try {
      const reachable = online || (await pingServer());
      if (!reachable) {
        toast('Still offline. Your changes are saved on this device.', { tone: 'danger' });
        return;
      }
      await flushNow(qc);
      qc.invalidateQueries();
      toast(outbox.getState().pending > 0 ? 'Some changes are still waiting' : 'Up to date', {
        tone: outbox.getState().pending > 0 ? 'default' : 'success',
      });
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = async () => {
    if (!owner) return;
    await outbox.retryFailed(owner);
    await syncNow();
  };

  const discardFailed = () =>
    dialog.alert(
      'Discard these changes?',
      `${plural(failed)} will be removed from this device and never sent. This can’t be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => owner && outbox.discard(owner) },
      ],
    );

  const headline = !online ? 'Offline' : flushing || busy ? 'Syncing…' : pending > 0 ? 'Waiting to sync' : failed > 0 ? 'Needs attention' : 'All synced';
  const detail = !online
    ? pending > 0
      ? `${plural(pending)} saved on this device. They’ll be sent when you’re back online.`
      : 'You can keep logging habits and editing tasks. Changes are saved here and sent when you’re back online.'
    : pending > 0
      ? `${plural(pending)} waiting to be sent.`
      : failed > 0
        ? `${plural(failed)} couldn’t be saved on the server.`
        : 'Everything on this device is on the server.';

  return (
    <View style={{ marginBottom: space.xl }}>
      <SectionHeader title="Sync" tone="muted" />
      <Card padded style={{ gap: space.md }}>
        <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
          {online && pending === 0 && failed === 0 ? (
            <CheckCircle2 size={18} color={colors.success} style={{ marginTop: 2 }} />
          ) : (
            <CloudOff size={18} color={online ? colors.warning : colors.fgMuted} style={{ marginTop: 2 }} />
          )}
          <View style={{ flex: 1 }}>
            <Text weight="semibold">{headline}</Text>
            <Text variant="small" tone="muted">
              {detail}
            </Text>
          </View>
        </Row>

        {failedList.length > 0 ? (
          <View style={{ gap: space.xs }}>
            {failedList.slice(0, 5).map((e) => (
              <View key={e.id}>
                <Text variant="small" weight="semibold">
                  {describeOp(e.op)}
                </Text>
                {e.error ? (
                  <Text variant="caption" tone="danger">
                    {e.error}
                  </Text>
                ) : null}
              </View>
            ))}
            {failedList.length > 5 ? (
              <Text variant="caption" tone="subtle">
                …and {failedList.length - 5} more
              </Text>
            ) : null}
          </View>
        ) : null}

        <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
          <Button
            title="Sync now"
            size="sm"
            variant="primary"
            loading={busy}
            icon={<RefreshCw size={14} color={colors.accentFg} />}
            onPress={syncNow}
          />
          {failed > 0 ? <Button title="Retry failed" size="sm" onPress={retryFailed} /> : null}
          {failed > 0 ? <Button title="Discard failed" size="sm" variant="dangerGhost" onPress={discardFailed} /> : null}
        </Row>
      </Card>
    </View>
  );
}

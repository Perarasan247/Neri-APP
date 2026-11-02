import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { AlertCircle, CloudOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text, useToast } from '@/components/ui';
import { useOnline } from '@/offline/connectivity';
import { useOutboxState } from '@/offline/useOutbox';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const plural = (n: number) => `${n} change${n === 1 ? '' : 's'}`;

/**
 * A small pill above the tab bar that appears only when something needs your attention:
 * offline (with how many changes are waiting), syncing, or changes the server rejected.
 * Says "All changes synced" once after a queue clears.
 */
export function SyncBanner() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const online = useOnline();
  const { pending, failed, flushing } = useOutboxState();

  // One reassuring toast when a backlog finally goes through
  const hadBacklog = useRef(false);
  useEffect(() => {
    if (pending > 0) hadBacklog.current = true;
    else if (hadBacklog.current && online && !flushing) {
      hadBacklog.current = false;
      if (failed === 0) toast('All changes synced', { tone: 'success' });
    }
  }, [pending, failed, online, flushing, toast]);

  const mode = failed > 0 ? 'failed' : !online ? 'offline' : pending > 0 || flushing ? 'syncing' : null;
  if (!mode) return null;

  const label =
    mode === 'failed'
      ? `${plural(failed)} couldn’t sync`
      : mode === 'offline'
        ? pending > 0
          ? `Offline · ${plural(pending)} waiting to sync`
          : 'Offline · changes will sync later'
        : pending > 0
          ? `Syncing ${plural(pending)}…`
          : 'Syncing…';

  const bg = mode === 'failed' ? colors.danger : colors.fg;
  const fg = mode === 'failed' ? '#ffffff' : colors.canvas;
  const tappable = mode === 'failed' || (mode === 'offline' && pending > 0);

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: insets.bottom + 68 }]}>
      <Pressable
        accessibilityRole={tappable ? 'button' : 'text'}
        accessibilityLabel={label}
        accessibilityHint={tappable ? 'Opens sync settings' : undefined}
        accessibilityLiveRegion="polite"
        disabled={!tappable}
        onPress={() => router.push('/settings')}
        style={[styles.pill, { backgroundColor: bg }]}
      >
        {mode === 'syncing' ? (
          <ActivityIndicator size="small" color={fg} />
        ) : mode === 'failed' ? (
          <AlertCircle size={15} color={fg} />
        ) : (
          <CloudOff size={15} color={fg} />
        )}
        <Text variant="small" weight="semibold" color={fg} numberOfLines={2} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    maxWidth: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCircle2,
  Globe,
  Info,
  LogOut,
  Mail,
  RotateCcw,
  Server,
  XCircle,
} from 'lucide-react-native';

import { NavGroup, NavRow } from '@/components/account/NavRow';
import { ServerUrlSheet, testServer } from '@/components/account/ServerUrlSheet';
import { zoneLabel } from '@/components/account/TimezonePicker';
import { Button, Card, Row, Screen, SectionHeader, Segmented, Text, useDialog, useToast } from '@/components/ui';
import { useProfile } from '@/hooks/queries';
import { useSession } from '@/hooks/session';
import { config, setApiUrlOverride } from '@/lib/config';
import { parseISODate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

const ICON = 17;

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'ok' } | { status: 'fail'; message: string };

/** "22 October 2026" */
const fullDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const { email, isDemo, signOut } = useSession();
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();

  const [serverOpen, setServerOpen] = useState(false);
  const [apiUrl, setApiUrl] = useState(config.apiUrl);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const isDefaultUrl = apiUrl === config.defaultApiUrl();
  const tint = colors.accentText;

  const onServerChanged = () => {
    setApiUrl(config.apiUrl);
    setTest({ status: 'idle' });
    qc.invalidateQueries();
  };

  const runTest = async () => {
    setTest({ status: 'testing' });
    const error = await testServer(config.apiUrl);
    if (error) {
      haptic.warning();
      setTest({ status: 'fail', message: error });
    } else {
      haptic.success();
      setTest({ status: 'ok' });
    }
  };

  const resetServer = () =>
    dialog.alert('Reset server address?', `Go back to ${config.defaultApiUrl()}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: async () => {
          await setApiUrlOverride(null);
          onServerChanged();
          toast('Server address reset', { tone: 'success' });
        },
      },
    ]);

  const confirmSignOut = () =>
    dialog.alert('Sign out?', isDemo ? 'You can come back to the demo any time.' : 'You’ll need your password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);

  const accountEmail = isDemo ? 'Demo account' : profile.data?.email || email || '—';
  const version = Constants.expoConfig?.version ?? '—';

  return (
    <Screen safeTop={false} onRefresh={() => profile.refetch()} refreshing={profile.isRefetching}>
      <Stack.Screen options={{ title: 'Settings' }} />

      {/* Appearance */}
      <View style={styles.group}>
        <SectionHeader title="Appearance" tone="muted" />
        <Card padded style={{ gap: space.sm }}>
          <Segmented<ThemePreference>
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Text variant="caption" tone="subtle">
            System follows your device’s light or dark setting.
          </Text>
        </Card>
      </View>

      {/* Server */}
      <View style={styles.group}>
        <SectionHeader title="Server" tone="muted" />
        <Card padded style={{ gap: space.md }}>
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Server size={ICON} color={tint} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text selectable numberOfLines={2}>
                {apiUrl}
              </Text>
              <Text variant="caption" tone="subtle">
                {isDefaultUrl ? 'Default address' : 'Custom address'}
              </Text>
            </View>
          </Row>

          {test.status === 'ok' ? (
            <Row gap={space.xs}>
              <CheckCircle2 size={14} color={colors.success} />
              <Text variant="small" tone="success">
                Connected
              </Text>
            </Row>
          ) : test.status === 'fail' ? (
            <Row gap={space.xs} style={{ alignItems: 'flex-start' }}>
              <XCircle size={14} color={colors.danger} style={{ marginTop: 2 }} />
              <Text variant="small" tone="danger" style={{ flex: 1 }}>
                Couldn’t reach the server: {test.message}
              </Text>
            </Row>
          ) : null}

          <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
            <Button title="Edit" size="sm" onPress={() => setServerOpen(true)} />
            <Button
              title="Test connection"
              size="sm"
              loading={test.status === 'testing'}
              onPress={runTest}
            />
            {!isDefaultUrl ? (
              <Button
                title="Reset"
                size="sm"
                variant="ghost"
                icon={<RotateCcw size={14} color={colors.fgSoft} />}
                onPress={resetServer}
              />
            ) : null}
          </Row>
        </Card>
      </View>

      {/* Account */}
      <NavGroup title="Account">
        <NavRow icon={<Mail size={ICON} color={tint} />} label="Email" value={accountEmail} />
        <NavRow
          icon={<Globe size={ICON} color={tint} />}
          label="Timezone"
          value={profile.data ? zoneLabel(profile.data.timezone) : '—'}
        />
        <NavRow
          icon={<CalendarClock size={ICON} color={tint} />}
          label="Tracking since"
          value={profile.data ? fullDate(profile.data.tracking_start_date) : '—'}
        />
        <NavRow
          icon={<LogOut size={ICON} color={colors.danger} />}
          label="Sign out"
          tone="danger"
          chevron={false}
          onPress={confirmSignOut}
        />
      </NavGroup>
      <Text variant="caption" tone="subtle" style={styles.footnote}>
        Your tracking start date and timezone are locked after onboarding so your history stays honest: nothing
        before the start date ever counts against you.
      </Text>

      {/* About */}
      <NavGroup title="About">
        <NavRow icon={<Info size={ICON} color={tint} />} label="Version" value={version} />
      </NavGroup>

      {serverOpen ? <ServerUrlSheet visible onClose={() => setServerOpen(false)} onSaved={onServerChanged} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: space.xl },
  footnote: { marginTop: -space.md, marginBottom: space.xl, paddingHorizontal: space.xs },
});

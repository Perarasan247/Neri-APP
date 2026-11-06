import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field, Sheet, Text, TextField } from '@/components/ui';
import { config, IS_DEV, setApiUrlOverride } from '@/lib/config';
import { checkServerUrl } from '@/lib/serverUrl';
import { space } from '@/theme/tokens';

/** Ping the backend root; resolves to an error message or null when it answers. */
export async function testServer(url = config.apiUrl): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${url}/`, { signal: controller.signal });
    return res.ok ? null : `Server answered with ${res.status}`;
  } catch (e) {
    return controller.signal.aborted ? 'Timed out' : e instanceof Error ? e.message : 'Unreachable';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bottom sheet to change (or reset) the backend URL. Mount it only while
 * open so the draft starts from the current address each time.
 */
export function ServerUrlSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState(config.apiUrl);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const check = checkServerUrl(draft, IS_DEV);
  const invalid = draft.trim().length > 0 && !check.ok;
  const isDefault = config.apiUrl === config.defaultApiUrl();

  const apply = async (url: string | null) => {
    setBusy(true);
    await setApiUrlOverride(url);
    setBusy(false);
    onSaved?.();
    onClose();
  };

  // Changing the address is the one setting that redirects the login token: say so before saving
  const save = (url: string) => {
    if (url === config.defaultApiUrl()) void apply(null);
    else setConfirming(url);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Server address" keyboard>
      <View style={styles.body}>
        <Field
          label="Backend URL"
          hint={`Default: ${config.defaultApiUrl()}`}
          error={invalid && !check.ok ? check.reason : null}
        >
          <TextField
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              setConfirming(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://api.example.com"
            invalid={invalid}
            returnKeyType="done"
            onSubmitEditing={() => check.ok && save(check.url)}
          />
        </Field>
        <Text variant="caption" tone="subtle">
          Use your computer’s LAN address when running the backend locally. Outside development, only https
          addresses (or servers on your own network) are accepted.
        </Text>
        {confirming ? (
          <View style={styles.warn}>
            <Text variant="small" weight="semibold" tone="danger">
              Send your login to {confirming}?
            </Text>
            <Text variant="small" tone="muted">
              Every request, including the token that proves you’re signed in, is sent to this address. Only continue if
              you run or fully trust that server.
            </Text>
          </View>
        ) : null}
        <View style={styles.actions}>
          <Button
            title="Reset"
            variant="ghost"
            disabled={busy || isDefault}
            onPress={() => apply(null)}
          />
          <View style={{ flex: 1 }} />
          <Button title="Cancel" variant="secondary" onPress={confirming ? () => setConfirming(null) : onClose} />
          <Button
            title={confirming ? 'Yes, use it' : 'Save'}
            variant="primary"
            loading={busy}
            disabled={!check.ok}
            onPress={() => (confirming ? apply(confirming) : check.ok && save(check.url))}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.md },
  warn: { gap: space.xs, padding: space.md, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: '#d92d20' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Field, Sheet, Text, TextField } from '@/components/ui';
import { config, setApiUrlOverride } from '@/lib/config';
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

const isValidUrl = (s: string) => /^https?:\/\/[^\s/]+/i.test(s.trim());

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
  const invalid = draft.trim().length > 0 && !isValidUrl(draft);
  const isDefault = config.apiUrl === config.defaultApiUrl();

  const apply = async (url: string | null) => {
    setBusy(true);
    await setApiUrlOverride(url);
    setBusy(false);
    onSaved?.();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Server address" keyboard>
      <View style={styles.body}>
        <Field
          label="Backend URL"
          hint={`Default: ${config.defaultApiUrl()}`}
          error={invalid ? 'Enter a full URL, e.g. http://192.168.1.20:8000' : null}
        >
          <TextField
            value={draft}
            onChangeText={setDraft}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.20:8000"
            invalid={invalid}
            returnKeyType="done"
            onSubmitEditing={() => isValidUrl(draft) && apply(draft.trim())}
          />
        </Field>
        <Text variant="caption" tone="subtle">
          Use your computer’s LAN address when running the backend locally.
        </Text>
        <View style={styles.actions}>
          <Button
            title="Reset"
            variant="ghost"
            disabled={busy || isDefault}
            onPress={() => apply(null)}
          />
          <View style={{ flex: 1 }} />
          <Button title="Cancel" variant="secondary" onPress={onClose} />
          <Button
            title="Save"
            variant="primary"
            loading={busy}
            disabled={!isValidUrl(draft)}
            onPress={() => apply(draft.trim())}
          />
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: space.lg, gap: space.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
});

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';
import { HeaderButton } from './HeaderButton';

/**
 * Custom top bar for modal forms (Cancel · title · Save). Replaces the native header, whose
 * left/right slots align differently on iOS and Android. Both sides share a flex basis so the
 * title is truly centred, and every control is 44dp tall.
 */
export function FormHeader({
  title,
  onCancel,
  onSave,
  cancelLabel = 'Cancel',
  saveLabel = 'Save',
  saveDisabled,
  saving,
}: {
  title: string;
  onCancel: () => void;
  /** Omit to hide the Save button (e.g. while the form is still loading). */
  onSave?: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        { paddingTop: insets.top, backgroundColor: colors.canvas, borderBottomColor: colors.line },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.side, { alignItems: 'flex-start' }]}>
          <HeaderButton title={cancelLabel} onPress={onCancel} />
        </View>
        <Text weight="semibold" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          {onSave ? <HeaderButton title={saveLabel} primary disabled={saveDisabled} loading={saving} onPress={onSave} /> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: space.xs },
  side: { flex: 1, justifyContent: 'center' },
  title: { textAlign: 'center', marginHorizontal: space.sm },
});

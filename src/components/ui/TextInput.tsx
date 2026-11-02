import React from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { scaleFont } from '@/theme/appearance';
import { useTheme } from '@/theme/ThemeProvider';

type TextInputInstance = React.ComponentRef<typeof TextInput>;

/**
 * TextInput that follows the app's text size setting, like <Text> does.
 * Use this instead of react-native's TextInput.
 */
export function AppTextInput({ style, ref, ...props }: TextInputProps & { ref?: React.Ref<TextInputInstance> }) {
  const { textScale } = useTheme();
  if (textScale === null) return <TextInput ref={ref} maxFontSizeMultiplier={2} style={style} {...props} />;
  const flat = (StyleSheet.flatten(style) ?? {}) as { fontSize?: number; lineHeight?: number };
  return <TextInput ref={ref} allowFontScaling={false} style={scaleFont(flat, textScale)} {...props} />;
}

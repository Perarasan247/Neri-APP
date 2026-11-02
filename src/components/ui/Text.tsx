import React from 'react';
import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { scaleFont } from '@/theme/appearance';
import { useTheme } from '@/theme/ThemeProvider';
import { font, weight as weights, type Colors } from '@/theme/tokens';

export type TextVariant = keyof typeof font;
export type TextTone = 'fg' | 'soft' | 'muted' | 'subtle' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'onAccent';

const toneKey: Record<TextTone, keyof Colors> = {
  fg: 'fg',
  soft: 'fgSoft',
  muted: 'fgMuted',
  subtle: 'fgSubtle',
  accent: 'accentText',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  onAccent: 'accentFg',
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: keyof typeof weights;
  /** Raw color override (e.g. a habit's own color). */
  color?: string;
  center?: boolean;
  tabular?: boolean;
  strike?: boolean;
}

/** Themed text. Use variants instead of ad-hoc font sizes. */
export function Text({
  variant = 'body',
  tone = 'fg',
  weight,
  color,
  center,
  tabular,
  strike,
  style,
  ...props
}: TextProps) {
  const { colors, textScale } = useTheme();
  const defaultWeight =
    variant === 'display' || variant === 'heading' ? 'bold' : variant === 'title' ? 'semibold' : 'regular';
  const style_ = StyleSheet.flatten([
    font[variant],
    {
      color: color ?? colors[toneKey[tone]],
      fontWeight: weights[weight ?? defaultWeight],
      letterSpacing: variant === 'display' ? -0.9 : variant === 'heading' ? -0.5 : variant === 'title' ? -0.2 : 0,
    },
    center && { textAlign: 'center' },
    tabular && { fontVariant: ['tabular-nums'] },
    strike && { textDecorationLine: 'line-through' },
    style,
  ]);
  // An in-app text size replaces the device's font scaling (never both, or sizes would multiply).
  // Following the device is capped so fixed-height layouts degrade instead of breaking.
  return textScale === null ? (
    <RNText {...props} maxFontSizeMultiplier={props.maxFontSizeMultiplier ?? 2} style={style_} />
  ) : (
    <RNText {...props} allowFontScaling={false} style={scaleFont(style_ as { fontSize?: number; lineHeight?: number }, textScale)} />
  );
}

import { useMemo } from 'react';
import { useWindowDimensions, type ViewStyle } from 'react-native';

import { describeLayout, type ResponsiveLayout } from './responsive';

/**
 * Live responsive layout for the current window. Re-renders on rotation, split screen,
 * foldable posture changes and web resizes.
 */
export function useResponsive(): ResponsiveLayout {
  const { width, height } = useWindowDimensions();
  return useMemo(() => describeLayout(width, height), [width, height]);
}

/**
 * Style for a scroll view's content container (or any full-width block): the size-class gutter,
 * and on tablets a centred column capped at `contentMaxWidth`.
 */
export function useContentFrame(opts: { padded?: boolean } = {}): ViewStyle {
  const { gutter, contentMaxWidth } = useResponsive();
  const padded = opts.padded ?? true;
  return useMemo<ViewStyle>(
    () => ({
      width: '100%',
      maxWidth: contentMaxWidth,
      alignSelf: 'center',
      paddingHorizontal: padded ? gutter : 0,
    }),
    [gutter, contentMaxWidth, padded],
  );
}

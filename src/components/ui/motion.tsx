import React, { useState } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { staggerDelay } from '@/theme/responsive';

/**
 * Shared motion language (DESIGN.md): quick and purposeful, one easing curve, springs for
 * presses and checks. Reduced motion is applied globally by ThemeProvider's ReducedMotionConfig,
 * so every Reanimated animation here jumps straight to its end state when it is on.
 */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
export const DURATION = { fast: 160, base: 240, page: 320, enter: 380 } as const;
/** Snappy, barely-overshooting spring for press feedback. */
export const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 } as const;
/** Bouncier spring for checks and completions. */
export const POP_SPRING = { damping: 11, stiffness: 320, mass: 0.7 } as const;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressState = { pressed: boolean };

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  /** Scale while held (0.97 = subtle, 0.9 = icon buttons). */
  scaleTo?: number;
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  children?: React.ReactNode | ((state: PressState) => React.ReactNode);
}

/**
 * Pressable that springs down while held and back on release, on the UI thread.
 * Accepts the same function-style `style` / `children` as Pressable.
 */
export function PressableScale({
  scaleTo = 0.97,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: PressableScaleProps) {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const state = { pressed };
  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        scale.set(withSpring(scaleTo, PRESS_SPRING));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        scale.set(withSpring(1, PRESS_SPRING));
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style(state) : style, animated]}
      {...props}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
}

/** Entrance for list item `index`: fade + short rise, staggered and capped. */
export const enterAt = (index = 0) =>
  FadeInDown.duration(DURATION.enter)
    .delay(staggerDelay(index))
    .easing(EASE)
    .withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });

/** Smooth reflow when siblings are added, removed or reordered. */
export const reflow = LinearTransition.duration(DURATION.base).easing(EASE);

export const leave = FadeOut.duration(DURATION.fast);

/**
 * Wraps a list row: rises in (staggered by `index`) when it first mounts, glides when the list
 * reorders and fades out when removed. Rows that stay mounted across refetches don't re-animate.
 * Pass `animateIn={false}` for rows far down a virtualized list so scrolling never waits.
 */
export function Appear({
  index = 0,
  animateIn = true,
  layout = true,
  style,
  children,
}: {
  index?: number;
  animateIn?: boolean;
  /** Animate position changes (only meaningful outside virtualized lists). */
  layout?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={animateIn ? enterAt(index) : undefined}
      layout={layout ? reflow : undefined}
      exiting={leave}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

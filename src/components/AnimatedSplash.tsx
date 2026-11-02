import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReduceMotion, useTheme } from '@/theme/ThemeProvider';

// Same image and size as the native splash (app.json), so the hand-off is seamless
const logo = require('@/assets/images/splash-icon.png');
const LOGO = 76;
const GLOW = 320;

/**
 * Short branded intro shown over the app while it starts.
 * Logo pops in with a glow, the name and tagline rise in, then everything fades into the app
 * once `ready` is true. Respects the system "reduce motion" setting.
 */
export function AnimatedSplash({ ready }: { ready: boolean }) {
  const { colors, scheme } = useTheme();
  const reduced = useReduceMotion();
  const [introDone, setIntroDone] = useState(false);
  const [gone, setGone] = useState(false);

  const logoScale = useSharedValue(1);
  const glow = useSharedValue(0);
  const ring = useSharedValue(0);
  const word = useSharedValue(0);
  const tag = useSharedValue(0);
  const exit = useSharedValue(0);

  // Intro
  useEffect(() => {
    if (reduced) {
      word.set(withTiming(1, { duration: 200 }));
      tag.set(withTiming(1, { duration: 200 }, () => runOnJS(setIntroDone)(true)));
      return;
    }
    const ease = Easing.out(Easing.cubic);
    // Quick "breath in", then a springy pop back
    logoScale.set(
      withSequence(
        withTiming(0.9, { duration: 180, easing: Easing.inOut(Easing.quad) }),
        withSpring(1, { damping: 9, stiffness: 180, mass: 0.8 }),
      ),
    );
    // Soft glow that keeps breathing while we wait for data
    glow.set(
      withDelay(
        150,
        withSequence(
          withTiming(1, { duration: 500, easing: ease }),
          withRepeat(withTiming(0.7, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true),
        ),
      ),
    );
    // One ripple ring
    ring.set(withDelay(250, withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) })));
    word.set(withDelay(380, withTiming(1, { duration: 450, easing: ease })));
    tag.set(withDelay(560, withTiming(1, { duration: 450, easing: ease }, () => runOnJS(setIntroDone)(true))));
  }, [reduced, logoScale, glow, ring, word, tag]);

  // Exit once the intro has played and the app is ready
  useEffect(() => {
    if (!introDone || !ready) return;
    exit.set(
      withDelay(
        reduced ? 0 : 120,
        withTiming(1, { duration: reduced ? 200 : 380, easing: Easing.in(Easing.cubic) }, (finished) => {
          if (finished) runOnJS(setGone)(true);
        }),
      ),
    );
  }, [introDone, ready, reduced, exit]);

  const containerStyle = useAnimatedStyle(() => ({ opacity: 1 - exit.value }));
  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value * (1 + exit.value * 0.35) }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scale: 0.6 + glow.value * 0.4 }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.5,
    transform: [{ scale: 1 + ring.value * 1.6 }],
  }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: word.value * (1 - exit.value),
    transform: [{ translateY: (1 - word.value) * 14 }],
  }));
  const tagStyle = useAnimatedStyle(() => ({
    opacity: tag.value * (1 - exit.value),
    transform: [{ translateY: (1 - tag.value) * 10 }],
  }));

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={introDone && ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: colors.canvas }, containerStyle]}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
    >
      <View style={styles.center}>
        <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]}>
          <Svg width={GLOW} height={GLOW}>
            <Defs>
              <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={scheme === 'dark' ? 0.45 : 0.28} />
                <Stop offset="0.55" stopColor={colors.accent2} stopOpacity={scheme === 'dark' ? 0.12 : 0.08} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect width={GLOW} height={GLOW} fill="url(#splashGlow)" />
          </Svg>
        </Animated.View>

        <Animated.View pointerEvents="none" style={[styles.ring, { borderColor: colors.accent }, ringStyle]} />

        <Animated.View style={logoStyle}>
          <Image source={logo} style={{ width: LOGO, height: LOGO }} contentFit="contain" />
        </Animated.View>
      </View>

      <View style={styles.text}>
        <Animated.Text style={[styles.word, { color: colors.fg }, wordStyle]}>Neri</Animated.Text>
        <Animated.Text style={[styles.tag, { color: colors.fgMuted }, tagStyle]}>
          Small steps, every day.
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: GLOW, height: GLOW },
  ring: {
    position: 'absolute',
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO * 0.28,
    borderWidth: 1.5,
  },
  // Absolutely placed under the logo so the logo stays exactly where the native splash drew it
  text: { position: 'absolute', top: '50%', marginTop: LOGO / 2 + 22, alignItems: 'center' },
  word: { fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  tag: { marginTop: 4, fontSize: 14, fontWeight: '500' },
});

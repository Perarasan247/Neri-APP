import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, type ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, type LucideIcon } from 'lucide-react-native';

import { BrandMark } from '@/components/account/BrandMark';
import { KeyboardAvoider, KeyboardScrollView, Notice, Text, TextField } from '@/components/ui';
import { useSession } from '@/hooks/session';
import { isSupabaseConfigured } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

type Mode = 'signIn' | 'signUp' | 'forgotPassword';

const COPY: Record<Mode, { title: string; subtitle: string; action: string }> = {
  signIn: { title: 'Welcome back', subtitle: 'Log in to pick up where you left off.', action: 'Log in' },
  signUp: { title: 'Create your account', subtitle: 'Habits and tasks, in one calm place.', action: 'Create account' },
  forgotPassword: { title: 'Reset your password', subtitle: 'We’ll email you a link to set a new one.', action: 'Send reset link' },
};

/** Staggered entrance for the screen's sections (respects the system "reduce motion" setting). */
const enter = (step: number) =>
  FadeInDown.delay(80 + step * 70)
    .duration(520)
    .easing(Easing.out(Easing.cubic));

/** Sign in / sign up with Supabase, or reset your password. */
export default function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useSession();

  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const scrollViewRef = useRef<ScrollViewInstance>(null);

  const isSignUp = mode === 'signUp';
  const isForgot = mode === 'forgotPassword';
  const emailOk = email.trim().length > 3 && email.includes('@');
  const mismatch = isSignUp && confirmPassword !== '' && confirmPassword !== password;
  const canSubmit = isForgot
    ? emailOk
    : emailOk && password.length >= 6 && (!isSignUp || (confirmPassword.length > 0 && confirmPassword === password));

  const switchMode = (next: Mode) => {
    haptic.tap();
    setMode(next);
    setConfirmPassword('');
    setError(null);
    setNotice(null);
  };

  const submitAuth = async () => {
    if (isSignUp && password !== confirmPassword) {
      setError('The two passwords don’t match.');
      return;
    }
    if (isSignUp) {
      const { needsConfirmation } = await signUp(email.trim(), password);
      if (needsConfirmation) {
        setNotice('Account created. Check your email to confirm it, then log in.');
        setConfirmPassword('');
        setMode('signIn');
      }
    } else {
      await signIn(email.trim(), password);
    }
    // On success the root layout swaps this screen out automatically
  };

  const submitReset = async () => {
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (resetError) throw resetError;
    setNotice(`If an account exists for ${email.trim()}, we’ve sent a reset link.`);
  };

  const submit = async () => {
    if (!canSubmit || busy) return;
    haptic.tap();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await (isForgot ? submitReset() : submitAuth());
    } catch (e) {
      setError(e instanceof Error ? e.message : isForgot ? 'Couldn’t send the reset email.' : 'Couldn’t log you in.');
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[mode];

  return (
    <KeyboardAvoider style={{ backgroundColor: colors.surface }}>
      <Glow />
      <KeyboardScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxxl, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.inner}>
          <Animated.View entering={enter(0)} style={styles.logo}>
            <BrandMark size={64} />
          </Animated.View>

          {/* Keyed by mode so the heading fades in fresh on every switch */}
          <Animated.View key={mode} entering={FadeIn.duration(320)} style={styles.heading}>
            <Animated.View entering={enter(1)}>
              <Text variant="display" weight="bold" center style={{ letterSpacing: -0.8 }}>
                {copy.title}
              </Text>
              <Text tone="muted" center style={{ marginTop: space.xs }}>
                {copy.subtitle}
              </Text>
            </Animated.View>
          </Animated.View>

          {isSupabaseConfigured ? (
            <Animated.View entering={enter(2)} layout={LinearTransition.duration(260)} style={styles.form}>
              {error ? (
                <Shake trigger={error}>
                  <Notice tone="danger">{error}</Notice>
                </Shake>
              ) : null}
              {notice ? (
                <Animated.View entering={FadeInDown.duration(260)}>
                  <Notice tone="success">{notice}</Notice>
                </Animated.View>
              ) : null}

              <AuthField
                icon={Mail}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType={isForgot ? 'send' : 'next'}
                submitBehavior={isForgot ? undefined : 'submit'}
                onSubmitEditing={() => (isForgot ? submit() : passwordRef.current?.focus())}
              />

              {!isForgot ? (
                <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOutUp.duration(160)}>
                  <AuthField
                    ref={passwordRef}
                    icon={Lock}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={isSignUp ? 'Password (6+ characters)' : 'Password'}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    textContentType={isSignUp ? 'newPassword' : 'password'}
                    returnKeyType={isSignUp ? 'next' : 'go'}
                    submitBehavior={isSignUp ? 'submit' : undefined}
                    onSubmitEditing={() => (isSignUp ? confirmRef.current?.focus() : submit())}
                    trailing={
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                        onPress={() => setShowPassword((s) => !s)}
                        hitSlop={8}
                        style={styles.trailing}
                      >
                        {showPassword ? (
                          <EyeOff size={18} color={colors.fgSubtle} />
                        ) : (
                          <Eye size={18} color={colors.fgSubtle} />
                        )}
                      </Pressable>
                    }
                  />
                </Animated.View>
              ) : null}

              {isSignUp ? (
                <Animated.View entering={FadeInDown.duration(240)} exiting={FadeOutUp.duration(160)} style={{ gap: 6 }}>
                  <AuthField
                    ref={confirmRef}
                    icon={Lock}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="go"
                    invalid={mismatch}
                    onSubmitEditing={submit}
                  />
                  {mismatch ? (
                    <Text variant="caption" tone="danger" style={{ marginLeft: space.xs }}>
                      Passwords don’t match yet.
                    </Text>
                  ) : null}
                </Animated.View>
              ) : null}

              {mode === 'signIn' ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => switchMode('forgotPassword')}
                  style={styles.forgot}
                >
                  <Text variant="small" tone="accent" weight="medium">
                    Forgot password?
                  </Text>
                </Pressable>
              ) : null}

              <PrimaryButton label={copy.action} busy={busy} disabled={!canSubmit} onPress={submit} />

              {isForgot ? (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => switchMode('signIn')}
                  style={styles.switchRow}
                >
                  <ArrowLeft size={16} color={colors.accentText} />
                  <Text variant="small" weight="semibold" tone="accent">
                    Back to log in
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.switchRow}>
                  <Text variant="small" tone="muted">
                    {isSignUp ? 'Already have an account?' : 'New to Neri?'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => switchMode(isSignUp ? 'signIn' : 'signUp')}
                  >
                    <Text variant="small" weight="semibold" tone="accent">
                      {isSignUp ? 'Log in' : 'Create an account'}
                    </Text>
                  </Pressable>
                </View>
              )}
            </Animated.View>
          ) : (
            <Animated.View entering={enter(2)} style={styles.form}>
              <Text variant="caption" tone="subtle" center>
                Accounts aren’t set up on this build.
              </Text>
            </Animated.View>
          )}
        </View>
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

/* ---------- Pieces ---------- */

/** Soft brand-coloured light behind the logo that slowly breathes. */
function Glow() {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    pulse.set(withRepeat(withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduced, pulse]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.75 + pulse.value * 0.25,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.glow, style]} entering={FadeIn.duration(900)}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="38%" r="55%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={scheme === 'dark' ? 0.3 : 0.16} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#glow)" />
      </Svg>
    </Animated.View>
  );
}

/** Text input with a leading icon and an accent border while focused. */
function AuthField({
  icon: Icon,
  trailing,
  invalid,
  ref,
  onFocus,
  onBlur,
  ...props
}: React.ComponentProps<typeof TextField> & { icon: LucideIcon; trailing?: React.ReactNode }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <TextField
        ref={ref}
        invalid={invalid}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          { backgroundColor: colors.subtle, paddingRight: trailing ? 46 : space.md + 2 },
          focused && !invalid ? { borderColor: colors.accent, backgroundColor: colors.surface } : null,
        ]}
        {...props}
      />
      <View pointerEvents="none" style={styles.leading}>
        <Icon size={18} color={focused ? colors.accent : colors.fgSubtle} />
      </View>
      {trailing}
    </View>
  );
}

/** Brand button that dips slightly under the finger. */
function PrimaryButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || busy;

  return (
    <Animated.View style={style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: inactive, busy }}
        disabled={inactive}
        onPress={onPress}
        onPressIn={() => {
          scale.set(withSpring(0.97, { damping: 18, stiffness: 400 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { damping: 14, stiffness: 300 }));
        }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? colors.accentPressed : colors.accent,
            opacity: disabled && !busy ? 0.45 : 1,
          },
        ]}
      >
        {busy ? <ActivityIndicator size="small" color={colors.accentFg} /> : null}
        <Text weight="semibold" color={colors.accentFg}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

/** Shakes its child whenever `trigger` changes (e.g. a new error message). */
function Shake({ trigger, children }: { trigger: unknown; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);

  useEffect(() => {
    haptic.warning();
    if (reduced) return;
    const t = { duration: 55 };
    x.set(withSequence(withTiming(-8, t), withTiming(8, t), withTiming(-5, t), withTiming(5, t), withTiming(0, t)));
  }, [trigger, reduced, x]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Animated.View entering={FadeIn.duration(180)} style={style}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.xl },
  inner: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 520 },
  logo: { alignSelf: 'center' },
  heading: { marginTop: space.xl },
  form: { marginTop: space.xxxl, gap: space.md },
  input: { minHeight: 52, borderRadius: radius.lg, paddingLeft: 46 },
  leading: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 46, alignItems: 'center', justifyContent: 'center' },
  trailing: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 46, alignItems: 'center', justifyContent: 'center' },
  forgot: { alignSelf: 'flex-end', marginTop: -space.xs },
  button: {
    height: 52,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xs,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
});

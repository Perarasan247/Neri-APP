import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type ScrollViewInstance,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff, Mail, Server } from 'lucide-react-native';

import { AuthShowcase } from '@/components/account/AuthShowcase';
import { BrandMark } from '@/components/account/BrandMark';
import { ServerUrlSheet } from '@/components/account/ServerUrlSheet';
import { KeyboardAvoider, KeyboardScrollView, Notice, Text, TextField } from '@/components/ui';
import { useSession } from '@/hooks/session';
import { config, isSupabaseConfigured } from '@/lib/config';
import { haptic } from '@/lib/haptics';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Sign in / sign up with Supabase, or reset your password. */
export default function SignInScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { signIn, signUp } = useSession();

  const [mode, setMode] = useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'auth' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [serverOpen, setServerOpen] = useState(false);
  // Re-render the footnote after the server URL changes (config isn't reactive)
  const [, setServerVersion] = useState(0);
  const passwordRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const confirmRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  const isSignUp = mode === 'signUp';
  const isForgot = mode === 'forgotPassword';
  const mismatch = isSignUp && confirmPassword !== '' && confirmPassword !== password;
  const canSubmit = isForgot
    ? email.trim().length > 3 && email.includes('@')
    : email.trim().length > 3 &&
      password.length >= 6 &&
      (!isSignUp || (confirmPassword.length > 0 && confirmPassword === password));

  const submit = async () => {
    if (!canSubmit || busy) return;
    setError(null);
    setNotice(null);
    if (isSignUp && password !== confirmPassword) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy('auth');
    try {
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Authentication failed');
    } finally {
      setBusy(null);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setBusy('reset');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (resetError) throw resetError;
      setNotice(`If an account exists for ${email.trim()}, password reset instructions have been sent.`);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to send reset email');
    } finally {
      setBusy(null);
    }
  };

  const scrollViewRef = useRef<ScrollViewInstance>(null);

  return (
    <KeyboardAvoider style={{ backgroundColor: colors.surface }}>
      <KeyboardScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.xxl },
        ]}
      >
        <View style={styles.inner}>
          <View style={styles.brand}>
            <BrandMark size={28} />
            <Text variant="title" weight="semibold">
              Neri
            </Text>
          </View>

          {!isForgot && <AuthShowcase />}

          <View style={{ marginTop: isForgot ? space.lg : space.xxl }}>
            <Text variant="display" weight="bold" style={{ letterSpacing: -0.8 }}>
              {isForgot
                ? 'Reset password'
                : isSignUp
                  ? 'Create your account'
                  : 'Welcome to Neri'}
            </Text>
            <Text tone="muted" style={{ marginTop: space.xs }}>
              {isForgot
                ? 'Enter your registered email address to receive recovery instructions.'
                : isSignUp
                  ? 'Start tracking habits and tasks in one calm place.'
                  : 'Plan your tasks, keep your habits, own your week.'}
            </Text>
          </View>

          <View style={{ marginTop: space.xl, gap: space.md }}>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            {notice ? <Notice tone="success">{notice}</Notice> : null}

            {isForgot ? (
              /* Forgot password flow */
              <>
                <View style={{ gap: 6 }}>
                  <Text variant="small" weight="semibold">
                    Email address
                  </Text>
                  <TextField
                    value={email}
                    onChangeText={setEmail}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="done"
                    onSubmitEditing={handleForgotPassword}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={!canSubmit || busy !== null}
                  onPress={() => {
                    haptic.tap();
                    handleForgotPassword();
                  }}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: pressed ? colors.fgSoft : colors.fg,
                      opacity: canSubmit && !busy ? 1 : 0.5,
                    },
                  ]}
                >
                  {busy === 'reset' ? (
                    <ActivityIndicator size="small" color={colors.canvas} />
                  ) : (
                    <Mail size={16} color={colors.canvas} />
                  )}
                  <Text weight="semibold" color={colors.canvas}>
                    Send reset link
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => {
                    setMode('signIn');
                    setError(null);
                    setNotice(null);
                  }}
                  style={styles.backButton}
                >
                  <ArrowLeft size={16} color={colors.accentText} />
                  <Text variant="small" weight="semibold" tone="accent">
                    Back to log in
                  </Text>
                </Pressable>
              </>
            ) : (
              /* Normal Sign-in / Sign-up flow */
              <>
                {isSupabaseConfigured ? (
                  <>
                    <View style={{ gap: 6 }}>
                      <Text variant="small" weight="semibold">
                        Email
                      </Text>
                      <TextField
                        value={email}
                        onChangeText={setEmail}
                        placeholder="you@example.com"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        submitBehavior="submit"
                      />
                    </View>

                    <View style={{ gap: 6 }}>
                      <View style={styles.labelRow}>
                        <Text variant="small" weight="semibold">
                          Password
                        </Text>
                        {!isSignUp ? (
                          <Pressable
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={() => {
                              setMode('forgotPassword');
                              setError(null);
                              setNotice(null);
                            }}
                          >
                            <Text variant="small" tone="accent" weight="medium">
                              Forgot password?
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                      <View>
                        <TextField
                          ref={passwordRef}
                          value={password}
                          onChangeText={setPassword}
                          placeholder={isSignUp ? 'At least 6 characters' : '••••••••'}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          autoComplete={isSignUp ? 'new-password' : 'current-password'}
                          textContentType={isSignUp ? 'newPassword' : 'password'}
                          returnKeyType={isSignUp ? 'next' : 'go'}
                          onSubmitEditing={() => (isSignUp ? confirmRef.current?.focus() : submit())}
                          submitBehavior={isSignUp ? 'submit' : undefined}
                          style={{ paddingRight: 44 }}
                        />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                          onPress={() => setShowPassword((s) => !s)}
                          hitSlop={8}
                          style={styles.eye}
                        >
                          {showPassword ? (
                            <EyeOff size={18} color={colors.fgSubtle} />
                          ) : (
                            <Eye size={18} color={colors.fgSubtle} />
                          )}
                        </Pressable>
                      </View>
                    </View>

                    {isSignUp ? (
                      <View style={{ gap: 6 }}>
                        <Text variant="small" weight="semibold">
                          Confirm password
                        </Text>
                        <TextField
                          ref={confirmRef}
                          value={confirmPassword}
                          onChangeText={setConfirmPassword}
                          placeholder="Re-enter your password"
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          autoComplete="new-password"
                          textContentType="newPassword"
                          returnKeyType="go"
                          invalid={mismatch}
                          onSubmitEditing={submit}
                        />
                        {mismatch ? (
                          <Text variant="caption" tone="danger">
                            Passwords don’t match yet.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}

                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !canSubmit || busy !== null, busy: busy === 'auth' }}
                      disabled={!canSubmit || busy !== null}
                      onPress={() => {
                        haptic.tap();
                        submit();
                      }}
                      style={({ pressed }) => [
                        styles.button,
                        {
                          backgroundColor: pressed ? colors.fgSoft : colors.fg,
                          opacity: canSubmit ? 1 : 0.5,
                        },
                      ]}
                    >
                      {busy === 'auth' ? <ActivityIndicator size="small" color={colors.canvas} /> : null}
                      <Text weight="semibold" color={colors.canvas}>
                        {isSignUp ? 'Create account' : 'Log in'}
                      </Text>
                    </Pressable>

                    <View style={styles.toggle}>
                      <Text variant="small" tone="muted">
                        {isSignUp ? 'Already have an account?' : 'Don’t have an account?'}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => {
                          setMode(isSignUp ? 'signIn' : 'signUp');
                          setConfirmPassword('');
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        <Text variant="small" weight="bold" style={{ textDecorationLine: 'underline' }}>
                          {isSignUp ? 'Log in' : 'Sign up'}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <Text variant="caption" tone="subtle" center>
                    Accounts aren’t set up on this build.
                  </Text>
                )}
              </>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Server ${config.apiUrl}. Change server address`}
            onPress={() => setServerOpen(true)}
            hitSlop={8}
            style={styles.server}
          >
            <Server size={12} color={colors.fgSubtle} />
            <Text variant="caption" tone="subtle" numberOfLines={1}>
              Server: <Text variant="caption" tone="accent">{config.apiUrl}</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardScrollView>

      {serverOpen ? (
        <ServerUrlSheet visible onClose={() => setServerOpen(false)} onSaved={() => setServerVersion((v) => v + 1)} />
      ) : null}
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: space.lg },
  inner: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  button: {
    height: 48,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eye: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
  },
  toggle: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  server: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    marginTop: space.xxl,
    alignSelf: 'center',
    maxWidth: '100%',
  },
});

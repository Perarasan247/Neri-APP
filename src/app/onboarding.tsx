import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, Lock, ShieldCheck } from 'lucide-react-native';

import { BrandMark } from '@/components/account/BrandMark';
import { DateField } from '@/components/account/DateField';
import { TimezonePicker } from '@/components/account/TimezonePicker';
import { Button, Card, Chip, Divider, Field, KeyboardAvoider, KeyboardScrollView, Row, Text, useToast } from '@/components/ui';
import { useSubmitOnboarding } from '@/hooks/queries';
import { useSession } from '@/hooks/session';
import { DEFAULT_TIME_ZONE, today } from '@/lib/format';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

const PRINCIPLES = [
  {
    Icon: ShieldCheck,
    title: 'Fair progress',
    text: 'Only days a habit could actually be done count toward your percentages.',
  },
  {
    Icon: Lock,
    title: 'Honest history',
    text: 'Habit names and types are locked once created, so the past stays true.',
  },
  {
    Icon: Clock,
    title: 'Your time',
    text: 'Days follow your timezone, so late-night logs land on the right date.',
  },
];

/** First run: choose the timezone and the (permanent) tracking start date. */
export default function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { signOut } = useSession();
  const submit = useSubmitOnboarding();

  const [timezone, setTimezone] = useState(DEFAULT_TIME_ZONE);
  const todayStr = today(timezone);
  const monthStartStr = `${todayStr.slice(0, 8)}01`;
  const [picked, setPicked] = useState(todayStr);
  // Never in the future, even after switching to a zone where "today" is earlier
  const startDate = picked > todayStr ? todayStr : picked;

  const presets = [
    { label: 'Today', value: todayStr },
    ...(monthStartStr !== todayStr ? [{ label: 'Start of this month', value: monthStartStr }] : []),
  ];

  const start = () =>
    submit.mutate(
      { startDate, timezone },
      // On success the root layout moves on to the app automatically
      { onError: (e) => toast(e.message || 'Failed to complete onboarding', { tone: 'danger' }) },
    );

  return (
    <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
      <KeyboardScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl },
        ]}
      >
        <View style={styles.inner}>
          <Row gap={space.sm} style={{ justifyContent: 'center', marginBottom: space.xl }}>
            <BrandMark size={32} />
            <Text variant="title" weight="semibold">
              Neri
            </Text>
          </Row>

          <Card>
            <View style={styles.section}>
              <View style={{ gap: space.xs }}>
                <Text variant="heading">When do you want to start?</Text>
                <Text variant="small" tone="muted">
                  Pick the day you begin tracking. Nothing before this date will ever count against you.
                </Text>
              </View>

              <Field label="Timezone" hint="Defaults to India (IST). Decides when each day starts and ends.">
                <TimezonePicker value={timezone} onChange={setTimezone} />
              </Field>

              <Field label="Tracking start date" hint="You can’t change this later.">
                <DateField label="Tracking start date" value={startDate} max={todayStr} onChange={setPicked} />
              </Field>

              <Row gap={space.sm} style={{ flexWrap: 'wrap', marginTop: -space.xs }}>
                {presets.map((p) => (
                  <Chip key={p.value} label={p.label} selected={startDate === p.value} onPress={() => setPicked(p.value)} />
                ))}
              </Row>

              <Button
                title="Start tracking"
                variant="primary"
                size="lg"
                block
                loading={submit.isPending}
                onPress={start}
              />
            </View>

            <Divider />

            <View style={[styles.section, { backgroundColor: colors.subtle, gap: space.md + 2 }]}>
              {PRINCIPLES.map(({ Icon, title, text }) => (
                <View key={title} style={styles.principle}>
                  <View style={[styles.principleIcon, { backgroundColor: colors.accentSoft }]}>
                    <Icon size={14} color={colors.accentText} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="small" weight="medium">
                      {title}
                    </Text>
                    <Text variant="small" tone="muted">
                      {text}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          <Button
            title="Sign out"
            variant="ghost"
            size="sm"
            style={{ alignSelf: 'center', marginTop: space.lg }}
            onPress={signOut}
          />
        </View>
      </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: space.lg },
  inner: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  section: { padding: space.xl, gap: space.lg },
  principle: { flexDirection: 'row', gap: space.md },
  principleIcon: {
    width: 24,
    height: 24,
    marginTop: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Live preview on the sign-in screen: cycles through what Neri does (quick-add
 * tasks, habit check-ins, calendar time blocking) with small animations.
 * Decorative only, so it is hidden from screen readers.
 */
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { ArrowUp, Calendar, Check, Clock, Flag, Flame, Hash, Repeat } from 'lucide-react-native';

import { ProgressRing, Text, withAlpha } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { brand, radius, space } from '@/theme/tokens';

type SceneKey = 'tasks' | 'habits' | 'calendar';

const SCENES: { key: SceneKey; title: string; text: string }[] = [
  {
    key: 'tasks',
    title: 'Capture tasks the way you think',
    text: 'Dates, times, priorities and repeats are understood.',
  },
  {
    key: 'habits',
    title: 'Build habits that stick',
    text: 'Check off your week and watch the streak grow.',
  },
  {
    key: 'calendar',
    title: 'See your day at a glance',
    text: 'Block out time for what matters.',
  },
];

const SCENE_MS = 7000;

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

export function AuthShowcase() {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const id = setInterval(
      () => {
        setIndex((i) => {
          const next = (i + 1) % SCENES.length;
          if (next === 0) setRound((r) => r + 1);
          return next;
        });
      },
      reduced ? SCENE_MS * 1.5 : SCENE_MS,
    );
    return () => clearInterval(id);
  }, [reduced]);

  // Fade + lift each scene in
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: reduced ? 0 : 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, round, fade, reduced]);

  const scene = SCENES[index];
  const dark = scheme === 'dark';

  return (
    <View
      style={[styles.panel, { backgroundColor: dark ? '#1b1a3a' : '#eeedff' }]}
      onLayout={(e) =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Soft color field */}
      {size.w > 0 ? (
        <Svg style={StyleSheet.absoluteFill} width={size.w} height={size.h}>
          <Defs>
            <RadialGradient id="g1" cx="15%" cy="10%" r="65%">
              <Stop offset="0" stopColor={brand.from} stopOpacity={dark ? 0.55 : 0.35} />
              <Stop offset="1" stopColor={brand.from} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="g2" cx="95%" cy="45%" r="60%">
              <Stop offset="0" stopColor="#0570de" stopOpacity={dark ? 0.35 : 0.22} />
              <Stop offset="1" stopColor="#0570de" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="g3" cx="35%" cy="100%" r="60%">
              <Stop offset="0" stopColor={brand.to} stopOpacity={dark ? 0.4 : 0.25} />
              <Stop offset="1" stopColor={brand.to} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width={size.w} height={size.h} fill="url(#g1)" />
          <Rect width={size.w} height={size.h} fill="url(#g2)" />
          <Rect width={size.w} height={size.h} fill="url(#g3)" />
        </Svg>
      ) : null}

      <View style={styles.stage}>
        <Animated.View
          key={`${scene.key}-${round}`}
          style={{
            opacity: fade,
            transform: [
              {
                translateY: fade.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          {scene.key === 'tasks' && <TasksScene round={round} reduced={reduced} />}
          {scene.key === 'habits' && <HabitsScene reduced={reduced} />}
          {scene.key === 'calendar' && <CalendarScene reduced={reduced} />}
        </Animated.View>
      </View>

      <View style={styles.caption}>
        <Text weight="semibold" center>
          {scene.title}
        </Text>
        <Text variant="caption" tone="muted" center>
          {scene.text}
        </Text>
        <View style={styles.dots}>
          {SCENES.map((s, i) => (
            <View
              key={s.key}
              style={[
                styles.dot,
                i === index
                  ? { width: 18, backgroundColor: colors.accent }
                  : { backgroundColor: withAlpha(colors.fgSubtle, 0.45) },
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

/* ---------- shared ---------- */

function Glass({ children, style }: { children: React.ReactNode; style?: object }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.glass,
        {
          backgroundColor: withAlpha(colors.surface, scheme === 'dark' ? 0.75 : 0.85),
          borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ---------- Tasks: typewriter quick add ---------- */

type Chip = {
  icon: 'repeat' | 'clock' | 'hash' | 'calendar' | 'flag';
  label: string;
};

const EXAMPLES: {
  text: string;
  title: string;
  chips: Chip[];
  token: 'success' | 'p1' | 'p3';
}[] = [
  {
    text: 'Gym every Mon, Wed, Fri 7am',
    title: 'Gym',
    chips: [
      { icon: 'repeat', label: 'Every Mon, Wed, Fri' },
      { icon: 'clock', label: '7:00 am' },
    ],
    token: 'success',
  },
  {
    text: 'Call mom tomorrow 6pm p1',
    title: 'Call mom',
    chips: [
      { icon: 'calendar', label: 'Tomorrow' },
      { icon: 'clock', label: '6:00 pm' },
      { icon: 'flag', label: 'P1' },
    ],
    token: 'p1',
  },
  {
    text: 'Pay rent every month #Finance',
    title: 'Pay rent',
    chips: [
      { icon: 'repeat', label: 'Every month' },
      { icon: 'hash', label: 'Finance' },
    ],
    token: 'p3',
  },
];

const CHIP_ICONS = {
  repeat: Repeat,
  clock: Clock,
  hash: Hash,
  calendar: Calendar,
  flag: Flag,
};

function TasksScene({ round, reduced }: { round: number; reduced: boolean }) {
  const { colors } = useTheme();
  const ex = EXAMPLES[round % EXAMPLES.length];
  const [typed, setTyped] = useState(reduced ? ex.text.length : 0);
  const [added, setAdded] = useState(false);
  const [checked, setChecked] = useState(false);
  const doneTyping = typed >= ex.text.length;

  useEffect(() => {
    if (doneTyping) return;
    const id = setTimeout(() => setTyped((n) => n + 1), 55 + Math.random() * 45);
    return () => clearTimeout(id);
  }, [typed, doneTyping]);

  useEffect(() => {
    if (!doneTyping) return;
    const a = setTimeout(() => setAdded(true), 700);
    const b = setTimeout(() => setChecked(true), 2000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [doneTyping]);

  const draft = added ? '' : ex.text.slice(0, typed);

  return (
    <View style={{ gap: space.sm }}>
      <Glass style={styles.inputBar}>
        <Text numberOfLines={1} style={{ flex: 1 }} tone={draft ? 'fg' : 'subtle'}>
          {draft || 'Add a task…'}
          {!added ? <Text color={colors.accent}>|</Text> : null}
        </Text>
        <View style={[styles.send, { backgroundColor: draft ? colors.accent : colors.mutedStrong }]}>
          <ArrowUp size={16} color={draft ? colors.accentFg : colors.fgSubtle} strokeWidth={2.5} />
        </View>
      </Glass>

      <Glass style={{ padding: space.xs }}>
        {added ? (
          <TaskLine title={ex.title} color={colors[ex.token]} done={false} highlight>
            {ex.chips.map((c) => {
              const Icon = CHIP_ICONS[c.icon];
              return (
                <View key={c.label} style={styles.chip}>
                  <Icon size={11} color={colors.fgMuted} />
                  <Text variant="caption" tone="muted">
                    {c.label}
                  </Text>
                </View>
              );
            })}
          </TaskLine>
        ) : null}
        <TaskLine title="Review the weekly plan" color={colors.p2} done={checked}>
          <View style={styles.chip}>
            <Calendar size={11} color={colors.success} />
            <Text variant="caption" tone="success">
              Today
            </Text>
          </View>
        </TaskLine>
        {!added ? (
          <TaskLine title="Book dentist appointment" color={colors.p4} done={false}>
            <View style={styles.chip}>
              <Calendar size={11} color={colors.fgMuted} />
              <Text variant="caption" tone="muted">
                Thursday
              </Text>
            </View>
          </TaskLine>
        ) : null}
      </Glass>
    </View>
  );
}

function TaskLine({
  title,
  color,
  done,
  highlight,
  children,
}: {
  title: string;
  color: string;
  done: boolean;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.taskLine, highlight && { backgroundColor: withAlpha(colors.accent, 0.1) }]}>
      <View style={[styles.check, { borderColor: color, backgroundColor: done ? color : 'transparent' }]}>
        {done ? <Check size={11} color="#ffffff" strokeWidth={3.5} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" weight="medium" tone={done ? 'subtle' : 'fg'} strike={done} numberOfLines={1}>
          {title}
        </Text>
        {children ? <View style={styles.chips}>{children}</View> : null}
      </View>
    </View>
  );
}

/* ---------- Habits: a week filling in ---------- */

const HABITS = [
  { name: 'Morning run', color: '#10b981', week: [1, 1, 0, 1, 1, 1, 1] },
  { name: 'Read 20 pages', color: '#f59e0b', week: [1, 1, 1, 1, 0, 1, 1] },
  { name: 'Meditate', color: '#635bff', week: [1, 1, 1, 1, 1, 1, 1] },
];
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function HabitsScene({ reduced }: { reduced: boolean }) {
  const { colors } = useTheme();
  const total = HABITS.length * 7;
  const [filled, setFilled] = useState(reduced ? total : 0);

  useEffect(() => {
    if (filled >= total) return;
    const id = setTimeout(() => setFilled((n) => n + 1), filled === 0 ? 450 : 110);
    return () => clearTimeout(id);
  }, [filled, total]);

  // Fill day by day, the way a week actually goes
  const order = (h: number, d: number) => d * HABITS.length + h;
  const done = HABITS.reduce((n, hb, h) => n + hb.week.filter((v, d) => v === 1 && order(h, d) < filled).length, 0);
  const pct = done / total;

  return (
    <Glass style={{ padding: space.md }}>
      <View style={styles.rowBetween}>
        <View>
          <Text variant="small" weight="semibold">
            This week
          </Text>
          <Text variant="caption" tone="muted" tabular>
            {done} of {total} check-ins
          </Text>
        </View>
        <ProgressRing value={pct} size={46} stroke={5} color={colors.accent}>
          <Text variant="caption" weight="semibold" tabular style={{ fontSize: 11 }}>
            {Math.round(pct * 100)}%
          </Text>
        </ProgressRing>
      </View>

      <View style={{ marginTop: space.sm, gap: 6 }}>
        <View style={styles.habitRow}>
          <View style={{ flex: 1 }} />
          {DAYS.map((d, i) => (
            <Text key={i} variant="caption" tone="subtle" weight="semibold" style={styles.dayLabel}>
              {d}
            </Text>
          ))}
        </View>
        {HABITS.map((hb, h) => (
          <View key={hb.name} style={styles.habitRow}>
            <Text variant="caption" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
              {hb.name}
            </Text>
            {hb.week.map((v, d) => {
              const shown = order(h, d) < filled;
              const on = shown && v === 1;
              return (
                <View
                  key={d}
                  style={[
                    styles.habitDot,
                    on
                      ? { backgroundColor: hb.color, borderColor: hb.color }
                      : shown
                        ? { borderColor: withAlpha(hb.color, 0.4) }
                        : {
                            borderColor: colors.lineStrong,
                            borderStyle: 'dashed',
                            transform: [{ scale: 0.8 }],
                          },
                  ]}
                >
                  {on ? <Check size={11} color="#ffffff" strokeWidth={3} /> : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View style={[styles.chip, { marginTop: space.sm }]}>
        <Flame size={14} color={colors.p2} />
        <Text variant="caption" weight="semibold" tone="soft" tabular>
          {filled >= total ? 12 : 11}-day streak
        </Text>
      </View>
    </Glass>
  );
}

/* ---------- Calendar: blocks + a drag-created event ---------- */

const CAL_DAYS = ['Mon 20', 'Tue 21', 'Wed 22'];
const HOURS = ['9', '10', '11', '12'];
const ROW = 34;

function CalendarScene({ reduced }: { reduced: boolean }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(reduced ? 4 : 0);
  const [grow] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) return;
    const timers = [
      setTimeout(() => setStep(1), 350),
      setTimeout(() => setStep(2), 850),
      setTimeout(() => {
        setStep(3);
        Animated.timing(grow, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start(() => setStep(4));
      }, 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduced, grow]);

  const blocks = [
    { day: 0, start: 0, len: 1, title: 'Standup', color: '#0284c7', at: 1 },
    {
      day: 2,
      start: 0.5,
      len: 1.5,
      title: 'Design review',
      color: '#a855f7',
      at: 2,
    },
    { day: 0, start: 2, len: 1, title: 'Lunch run', color: '#10b981', at: 2 },
  ];

  return (
    <Glass style={{ padding: space.sm }}>
      <View style={styles.calHeader}>
        <View style={{ width: 26 }} />
        {CAL_DAYS.map((d, i) => (
          <View key={d} style={{ flex: 1, alignItems: 'center' }}>
            <View style={[styles.calDay, i === 1 && { backgroundColor: colors.accent }]}>
              <Text variant="caption" weight="semibold" color={i === 1 ? colors.accentFg : colors.fgMuted}>
                {d}
              </Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', height: ROW * HOURS.length }}>
        <View style={{ width: 26 }}>
          {HOURS.map((h, i) => (
            <Text key={h} variant="caption" tone="subtle" style={[styles.hour, { top: i * ROW - 7 }]}>
              {h}
            </Text>
          ))}
        </View>
        {CAL_DAYS.map((d, col) => (
          <View key={d} style={[styles.calCol, { borderLeftColor: colors.line }]}>
            {HOURS.map((h, i) => (
              <View key={h} style={[styles.hourLine, { top: i * ROW, backgroundColor: colors.line }]} />
            ))}
            {blocks
              .filter((b) => b.day === col && step >= b.at)
              .map((b) => (
                <View
                  key={b.title}
                  style={[
                    styles.block,
                    {
                      top: b.start * ROW + 1,
                      height: b.len * ROW - 3,
                      borderLeftColor: b.color,
                      backgroundColor: withAlpha(b.color, 0.15),
                    },
                  ]}
                >
                  <Text variant="caption" weight="medium" numberOfLines={1} style={{ fontSize: 10 }}>
                    {b.title}
                  </Text>
                </View>
              ))}
            {col === 1 && step >= 3 ? (
              <Animated.View
                style={[
                  styles.block,
                  {
                    top: ROW + 1,
                    height: grow.interpolate({
                      inputRange: [0, 1],
                      outputRange: [ROW * 0.35, ROW * 1.5 - 3],
                    }),
                    borderLeftColor: colors.accent,
                    backgroundColor: step >= 4 ? colors.accent : withAlpha(colors.accent, 0.22),
                  },
                ]}
              >
                <Text
                  variant="caption"
                  weight="semibold"
                  numberOfLines={1}
                  style={{ fontSize: 10 }}
                  color={step >= 4 ? colors.accentFg : colors.accentText}
                >
                  {step >= 4 ? 'Deep work' : '(No title)'}
                </Text>
              </Animated.View>
            ) : null}
          </View>
        ))}
      </View>
    </Glass>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.xl + 8,
    overflow: 'hidden',
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
  stage: { height: 224, justifyContent: 'center' },
  caption: { alignItems: 'center', gap: 2, marginTop: space.md },
  dots: { flexDirection: 'row', gap: 5, marginTop: space.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  glass: {
    borderRadius: radius.xl,
    borderWidth: 1,
    shadowColor: '#1a1f36',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: 50,
    paddingLeft: space.lg,
    paddingRight: 7,
  },
  send: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskLine: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.sm,
    borderRadius: radius.md,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: space.md,
    marginTop: 2,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayLabel: { width: 22, textAlign: 'center' },
  habitDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calHeader: { flexDirection: 'row', marginBottom: 6 },
  calDay: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.sm },
  calCol: { flex: 1, borderLeftWidth: StyleSheet.hairlineWidth },
  hour: { position: 'absolute', right: 6, fontSize: 9 },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
  block: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: radius.xs + 1,
    borderLeftWidth: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    overflow: 'hidden',
  },
});

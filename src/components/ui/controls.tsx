import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Check, Plus } from 'lucide-react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { font, radius, space } from '@/theme/tokens';
import { withAlpha } from './HabitIcon';
import { requestReveal } from './keyboard';
import { Text } from './Text';

/* ---------- Buttons ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerGhost';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  loading?: boolean;
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  variant = 'secondary',
  size = 'md',
  icon,
  loading,
  block,
  disabled,
  style,
  onPress,
  ...props
}: ButtonProps) {
  const { colors: c } = useTheme();
  const v = {
    primary: { bg: c.accent, pressed: c.accentPressed, fg: c.accentFg, border: 'transparent' },
    secondary: { bg: c.surface, pressed: c.muted, fg: c.fgSoft, border: c.lineStrong },
    ghost: { bg: 'transparent', pressed: c.muted, fg: c.fgSoft, border: 'transparent' },
    danger: { bg: c.danger, pressed: c.danger, fg: '#ffffff', border: 'transparent' },
    dangerGhost: { bg: 'transparent', pressed: c.dangerSoft, fg: c.danger, border: 'transparent' },
  }[variant];
  const h = { sm: 32, md: 40, lg: 48 }[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        haptic.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.button,
        {
          height: h,
          paddingHorizontal: size === 'sm' ? space.md : space.lg,
          backgroundColor: pressed ? v.pressed : v.bg,
          borderColor: v.border,
          opacity: disabled ? 0.5 : 1,
          alignSelf: block ? 'stretch' : 'auto',
        },
        style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" color={v.fg} /> : icon}
      <Text variant={size === 'sm' ? 'small' : 'body'} weight="semibold" color={v.fg}>
        {title}
      </Text>
    </Pressable>
  );
}

interface IconButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  children: React.ReactNode;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ label, children, size = 40, style, onPress, ...props }: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={(e) => {
        haptic.tap();
        onPress?.(e);
      }}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        pressed && { backgroundColor: colors.muted },
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

/** Floating "+" button, bottom-right above the tab bar. */
export function Fab({ onPress, label = 'Add' }: { onPress: () => void; label?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: pressed ? colors.accentPressed : colors.accent, shadowColor: colors.accent },
      ]}
    >
      <Plus size={26} color={colors.accentFg} strokeWidth={2.5} />
    </Pressable>
  );
}

/* ---------- Selection ---------- */

/** Round task checkbox; ring color shows priority (Todoist-style). */
export function Checkbox({
  checked,
  onChange,
  color,
  size = 22,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  color?: string;
  size?: number;
  label?: string;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const ring = color ?? colors.fgSubtle;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      hitSlop={10}
      disabled={disabled}
      onPress={() => {
        if (!checked) haptic.success();
        else haptic.tap();
        onChange();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.75,
        borderColor: ring,
        backgroundColor: checked ? ring : withAlpha(ring, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Check size={size * 0.6} color="#ffffff" strokeWidth={3} /> : null}
    </Pressable>
  );
}

/** Pill chip for filters and option pickers. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  /** Tint used when selected (defaults to accent). */
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const tint = color ?? colors.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          borderColor: selected ? tint : colors.lineStrong,
          backgroundColor: selected ? withAlpha(tint, 0.12) : pressed ? colors.muted : colors.surface,
        },
        style,
      ]}
    >
      {icon}
      <Text variant="small" weight="medium" color={selected ? (color ?? colors.accentText) : colors.fgSoft}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Segmented control for 2–5 mutually exclusive options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  style,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.muted }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.tap();
              onChange(o.value);
            }}
            style={[styles.segment, active && { backgroundColor: colors.surface, ...styles.segmentActive }]}
          >
            <Text variant="small" weight={active ? 'semibold' : 'medium'} tone={active ? 'fg' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- Inputs ---------- */

export function TextField({
  style,
  invalid,
  multiline,
  ref,
  onFocus,
  ...props
}: TextInputProps & { invalid?: boolean; ref?: React.Ref<React.ComponentRef<typeof TextInput>> }) {
  const { colors } = useTheme();
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={colors.fgSubtle}
      selectionColor={colors.accent}
      multiline={multiline}
      onFocus={(e) => {
        requestReveal();
        onFocus?.(e);
      }}
      style={[
        font.body,
        {
          color: colors.fg,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: invalid ? colors.danger : colors.lineStrong,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: multiline ? space.md : 0,
          minHeight: multiline ? 88 : 44,
          textAlignVertical: multiline ? 'top' : 'center',
        },
        style,
      ]}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  style,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ gap: space.xs + 2 }, style]}>
      {label ? (
        <Text variant="small" weight="medium" tone="soft">
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="subtle">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ---------- Data display ---------- */

export function ProgressBar({ value, color, height = 6 }: { value: number; color?: string; height?: number }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.mutedStrong, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: height / 2, backgroundColor: color ?? colors.accent }} />
    </View>
  );
}

/** Circular progress (count habits, completion summary). */
export function ProgressRing({
  value,
  size = 24,
  stroke = 2.5,
  color,
  track,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track ?? colors.mutedStrong} strokeWidth={stroke} fill="none" />
        {pct > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ} ${circ}`}
            strokeDashoffset={circ * (1 - pct)}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({ label, tone = 'neutral', dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const { colors: c } = useTheme();
  const map = {
    neutral: [c.mutedStrong, c.fgMuted],
    accent: [c.accentSoft, c.accentText],
    success: [c.successSoft, c.success],
    warning: [c.warningSoft, c.warning],
    danger: [c.dangerSoft, c.danger],
    info: [c.infoSoft, c.info],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map[0] }]}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: map[1] }} /> : null}
      <Text variant="caption" weight="semibold" color={map[1]}>
        {label}
      </Text>
    </View>
  );
}

/** Signed change chip: +5 pts (green), -2 (red), 0 (grey). */
export function Delta({ value, unit = '', invert }: { value: number; unit?: string; invert?: boolean }) {
  const good = invert ? value < 0 : value > 0;
  return <Badge label={`${value > 0 ? '+' : ''}${value}${unit}`} tone={value === 0 ? 'neutral' : good ? 'success' : 'danger'} />;
}

/** KPI tile: label, big value, optional delta and footnote. Lay out in a 2-column grid. */
export function Kpi({
  label,
  value,
  delta,
  footnote,
  footnoteTone = 'subtle',
  valueTone = 'fg',
  onPress,
  style,
}: {
  label: string;
  value: string;
  delta?: React.ReactNode;
  footnote?: string;
  footnoteTone?: 'subtle' | 'danger' | 'success';
  /** Color the big number (e.g. danger for overdue counts). */
  valueTone?: 'fg' | 'danger' | 'success' | 'warning';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const body = (
    <>
      <Text variant="caption" tone="muted" weight="medium" numberOfLines={1}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs, flexWrap: 'wrap' }}>
        <Text variant="heading" tabular weight="semibold" tone={valueTone}>
          {value}
        </Text>
        {delta}
      </View>
      {footnote ? (
        <Text variant="caption" tone={footnoteTone} numberOfLines={1} style={{ marginTop: 2 }}>
          {footnote}
        </Text>
      ) : null}
    </>
  );
  const base = [styles.kpi, { backgroundColor: colors.surface, borderColor: colors.line }, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [...base, pressed && { backgroundColor: colors.subtle }]}>
      {body}
    </Pressable>
  ) : (
    <View style={base}>{body}</View>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ gap: space.sm }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
          {r.map((item, j) => (
            <View key={j} style={{ flex: 1 }}>
              {item}
            </View>
          ))}
          {r.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    height: 32,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: space.sm },
  segmentActive: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.xs,
  },
  kpi: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md + 2 },
});

import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CloudOff } from 'lucide-react-native';

import { ApiError } from '@/api/client';
import { useTheme } from '@/theme/ThemeProvider';
import { elevation, radius, space } from '@/theme/tokens';
import { Button } from './controls';
import { Text } from './Text';

export function EmptyState({
  icon,
  title,
  description,
  action,
  style,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, style]}>
      {icon ? (
        <View style={[styles.emptyIcon, { backgroundColor: colors.surface, borderColor: colors.line, shadowColor: colors.shadow }]}>
          {icon}
        </View>
      ) : null}
      <Text variant="title" center>
        {title}
      </Text>
      {description ? (
        <Text variant="small" tone="muted" center style={{ maxWidth: 300 }}>
          {description}
        </Text>
      ) : null}
      {action ? <View style={{ marginTop: space.md }}>{action}</View> : null}
    </View>
  );
}

/** Full-area error with retry. Network errors get a friendlier offline message. */
export function ErrorState({ error, onRetry, style }: { error: unknown; onRetry?: () => void; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const offline = error instanceof ApiError && error.isNetwork;
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <EmptyState
      style={style}
      icon={<CloudOff size={24} color={colors.fgSubtle} />}
      title={offline ? 'You’re offline' : 'Couldn’t load this'}
      description={message}
      action={onRetry ? <Button title="Try again" onPress={onRetry} /> : undefined}
    />
  );
}

/** Pulsing placeholder blocks while the first load is in flight. */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.mutedStrong, opacity }, style]} />;
}

/** Generic list skeleton: n rows of circle + two lines. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={{ gap: space.lg, paddingVertical: space.md }}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <Skeleton width={22} height={22} style={{ borderRadius: 11 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={14} width="70%" />
            <Skeleton height={10} width="40%" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Inline banner (rest day, warnings, info). */
export function Notice({
  tone = 'info',
  icon,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const { colors: c } = useTheme();
  const [bg, fg] = {
    info: [c.infoSoft, c.info],
    warning: [c.warningSoft, c.warning],
    danger: [c.dangerSoft, c.danger],
    success: [c.successSoft, c.success],
  }[tone];
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      {icon}
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? (
          <Text variant="small" color={fg}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxxl * 1.5, paddingHorizontal: space.xxl },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: radius.lg + 2,
    borderWidth: StyleSheet.hairlineWidth,
    ...elevation.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md + 2,
    borderRadius: radius.lg,
  },
});

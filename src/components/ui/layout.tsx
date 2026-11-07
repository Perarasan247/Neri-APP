import React from 'react';
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown } from 'lucide-react-native';

import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useStyles, useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { useResponsive } from '@/theme/useResponsive';
import { DURATION, EASE } from './motion';
import { KeyboardAvoider, KeyboardScrollView } from './keyboard';
import { Text } from './Text';

/* ---------- Screen ---------- */

interface ScreenProps extends ScrollViewProps {
  /** Large title shown at the top of the content (tab roots). */
  title?: string;
  subtitle?: React.ReactNode;
  /** Icon buttons on the right of the large title. */
  actions?: React.ReactNode;
  /** Pull-to-refresh handler. */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Render children without a ScrollView (e.g. when the screen owns a FlatList). */
  scroll?: boolean;
  /** Space reserved at the bottom for a floating action button. */
  fabSpace?: boolean;
  padded?: boolean;
  /** Add the top safe-area inset (tab roots have no native header). */
  safeTop?: boolean;
}

/**
 * Standard screen scaffold: canvas background, optional large title,
 * pull-to-refresh and consistent padding.
 */
export function Screen({
  title,
  subtitle,
  actions,
  onRefresh,
  refreshing = false,
  scroll = true,
  fabSpace,
  padded = true,
  safeTop = true,
  children,
  contentContainerStyle,
  ...props
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { gutter, contentMaxWidth } = useResponsive();

  const header = title ? <LargeTitle title={title} subtitle={subtitle} actions={actions} /> : null;
  // Size-class gutter (plus the side insets in landscape); on tablets a centred, capped column
  const padding: ViewStyle = {
    paddingTop: safeTop ? insets.top + space.sm : space.md,
    paddingLeft: padded ? gutter + insets.left : insets.left,
    paddingRight: padded ? gutter + insets.right : insets.right,
    paddingBottom: fabSpace ? 96 : space.xxl,
  };
  const column: ViewStyle = { width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' };

  if (!scroll) {
    return (
      <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
        <View style={[{ flex: 1 }, column, padding, { paddingBottom: 0 }]}>
          {header}
          {children}
        </View>
      </KeyboardAvoider>
    );
  }

  return (
    <KeyboardAvoider style={{ backgroundColor: colors.canvas }}>
    <KeyboardScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={[column, padding, contentContainerStyle]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.fgSubtle} colors={[colors.accent]} />
        ) : undefined
      }
      {...props}
    >
      {header}
      {children}
    </KeyboardScrollView>
    </KeyboardAvoider>
  );
}

export function LargeTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const { isCompact, isTablet } = useResponsive();
  // Small phones get a slightly smaller title so long ones ("Habit insights") still fit; tablets a touch larger
  const titleSize = isCompact ? { fontSize: 27, lineHeight: 33 } : isTablet ? { fontSize: 36, lineHeight: 42 } : undefined;
  return (
    <View style={[styles.titleRow, isCompact && { marginBottom: space.lg }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={titleSize}>
          {title}
        </Text>
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

/* ---------- Card & rows ---------- */

export function Card({ style, padded, ...props }: ViewProps & { padded?: boolean }) {
  const s = useStyles((c) => ({
    card: {
      backgroundColor: c.surface,
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.line,
      overflow: 'hidden' as const,
    },
  }));
  return <View style={[s.card, padded && { padding: space.lg }, style]} {...props} />;
}

interface SectionHeaderProps {
  title: string;
  count?: number | string;
  tone?: 'fg' | 'danger' | 'muted';
  action?: { label: string; onPress: () => void; tone?: 'accent' | 'danger' };
  collapsed?: boolean;
  onToggle?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** Group heading above a list: "Overdue · 4" with an optional action. */
export function SectionHeader({ title, count, tone = 'fg', action, collapsed, onToggle, style }: SectionHeaderProps) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.sectionHeader, style]}>
      <Text
        variant="caption"
        weight="semibold"
        tone={tone === 'muted' ? 'subtle' : tone === 'fg' ? 'muted' : tone}
        style={{ textTransform: 'uppercase', letterSpacing: 0.7 }}
      >
        {title}
        {count !== undefined ? <Text variant="caption" tone="subtle">{`  ${count}`}</Text> : null}
      </Text>
      <View style={styles.sectionRight}>
        {action ? (
          <Pressable onPress={action.onPress} hitSlop={8}>
            <Text variant="small" weight="semibold" tone={action.tone ?? 'accent'}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
        {onToggle ? <Chevron collapsed={!!collapsed} color={colors.fgMuted} /> : null}
      </View>
    </View>
  );
  return onToggle ? (
    <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: !collapsed }}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/** Disclosure chevron that rotates smoothly between open and collapsed. */
function Chevron({ collapsed, color }: { collapsed: boolean; color: string }) {
  const turn = useSharedValue(collapsed ? 1 : 0);
  React.useEffect(() => {
    turn.set(withTiming(collapsed ? 1 : 0, { duration: DURATION.base, easing: EASE }));
  }, [collapsed, turn]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${-90 * turn.value}deg` }] }));
  return (
    <Animated.View style={style}>
      <ChevronDown size={18} color={color} />
    </Animated.View>
  );
}

/** Hairline divider, inset to align with row text by default. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginLeft: inset }} />;
}

export function Row({ style, gap = space.sm, ...props }: ViewProps & { gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]} {...props} />;
}

export function Spacer({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, marginBottom: space.xl, marginTop: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

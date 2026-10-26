import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check } from 'lucide-react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { KeyboardAvoider, useKeyboardVisible } from './keyboard';
import { Text } from './Text';

/* ---------- Bottom sheet ---------- */

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Fires once the close animation has finished (safe point to open another modal). */
  onDismissed?: () => void;
  title?: string;
  children: React.ReactNode;
  /** Form sheet: rises above the keyboard and scrolls its content when it doesn't fit. */
  keyboard?: boolean;
  /** With `keyboard`, set false when the children already own a scroll view. */
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Lightweight bottom sheet for small pickers and forms that belong to the
 * current screen. Full forms (new task, new habit) use router formSheet screens.
 */
export function Sheet({
  visible,
  onClose,
  onDismissed,
  title,
  children,
  keyboard,
  scroll = true,
  contentStyle,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardUp = useKeyboardVisible();

  // iOS reports dismissal natively; Android has no onDismiss, so wait out the slide animation
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (wasVisible.current && !visible && Platform.OS !== 'ios' && onDismissed) {
      const t = setTimeout(onDismissed, 250);
      wasVisible.current = visible;
      return () => clearTimeout(t);
    }
    wasVisible.current = visible;
  }, [visible, onDismissed]);

  const body = (
    <View
      style={[
        styles.sheet,
        { backgroundColor: colors.surface, paddingBottom: keyboardUp ? space.md : Math.max(insets.bottom, space.lg) },
        contentStyle,
      ]}
    >
      <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
      {title ? (
        <Text variant="title" style={{ paddingHorizontal: space.lg, marginBottom: space.md }}>
          {title}
        </Text>
      ) : null}
      {keyboard && scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={Platform.OS === 'ios' ? onDismissed : undefined}
      statusBarTranslucent
    >
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Close" />
      {/* Always avoid: it is a no-op without a keyboard, and any sheet may host an input */}
      <KeyboardAvoider style={styles.sheetHost} pointerEvents="box-none">
        {body}
      </KeyboardAvoider>
    </Modal>
  );
}

/* ---------- Action menu ---------- */

export interface MenuOption {
  label: string;
  icon?: React.ReactNode;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
  hint?: string;
}

/** Bottom action list ("..." menus, sort pickers). */
export function ActionSheet({
  visible,
  onClose,
  title,
  options,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: MenuOption[];
}) {
  const { colors } = useTheme();
  // Run the chosen action only after this sheet is fully gone, so it can open another modal
  const pending = useRef<(() => void) | null>(null);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      onDismissed={() => {
        const run = pending.current;
        pending.current = null;
        run?.();
      }}
    >
      {options.map((o, i) => (
        <Pressable
          key={`${o.label}-${i}`}
          accessibilityRole="menuitem"
          onPress={() => {
            haptic.tap();
            pending.current = o.onPress;
            onClose();
          }}
          style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.muted }]}
        >
          {o.icon ? <View style={{ width: 22, alignItems: 'center' }}>{o.icon}</View> : null}
          <Text style={{ flex: 1 }} tone={o.destructive ? 'danger' : 'fg'}>
            {o.label}
          </Text>
          {o.hint ? (
            <Text variant="small" tone="subtle">
              {o.hint}
            </Text>
          ) : null}
          {o.selected ? <Check size={18} color={colors.accent} /> : null}
        </Pressable>
      ))}
    </Sheet>
  );
}

/** Convenience state hook for ActionSheet. */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial);
  return useMemo(
    () => ({ open, show: () => setOpen(true), hide: () => setOpen(false), toggle: () => setOpen((o) => !o) }),
    [open],
  );
}

/* ---------- Toasts ---------- */

type ToastTone = 'default' | 'success' | 'danger';
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  action?: { label: string; onPress: () => void };
}

const ToastContext = createContext<(message: string, opts?: { tone?: ToastTone; action?: Toast['action'] }) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, opts: { tone?: ToastTone; action?: Toast['action'] } = {}) => {
    if (timer.current) clearTimeout(timer.current);
    if (opts.tone === 'danger') haptic.warning();
    setToast({ id: Date.now(), message, tone: opts.tone ?? 'default', action: opts.action });
    timer.current = setTimeout(() => setToast(null), opts.action ? 5000 : 3000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <ToastView key={toast.id} toast={toast} onDismiss={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
  }, [anim]);
  const bg = toast.tone === 'danger' ? colors.danger : colors.fg;
  const fg = toast.tone === 'danger' ? '#ffffff' : colors.canvas;
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.toastHost,
        {
          bottom: insets.bottom + 72,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
        },
      ]}
    >
      <Pressable onPress={onDismiss} style={[styles.toast, { backgroundColor: bg }]} accessibilityRole="alert">
        <Text variant="small" color={fg} style={{ flex: 1 }}>
          {toast.message}
        </Text>
        {toast.action ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
          >
            <Text variant="small" weight="bold" color={toast.tone === 'danger' ? '#ffffff' : colors.accent}>
              {toast.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/** `const toast = useToast(); toast('Saved', { tone: 'success' })` */
export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  sheetHost: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: space.sm,
    maxHeight: '90%',
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: space.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 50,
    paddingHorizontal: space.lg,
  },
  toastHost: { position: 'absolute', left: space.lg, right: space.lg, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

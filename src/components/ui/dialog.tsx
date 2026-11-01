import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { Text } from './Text';

/* ---------- Types ---------- */

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogOptions {
  /** Tap outside / Android back dismisses. Defaults to true when there is a cancel button. */
  cancelable?: boolean;
  /** Fires when the dialog is dismissed without pressing a button (outside tap, back). */
  onDismiss?: () => void;
  /** Optional glyph above the title. */
  icon?: React.ReactNode;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  icon?: React.ReactNode;
}

interface DialogApi {
  /** Same arguments as the native alert. */
  alert: (title: string, message?: string, buttons?: DialogButton[], options?: DialogOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

interface Request {
  id: number;
  title: string;
  message?: string;
  buttons: DialogButton[];
  cancelable: boolean;
  onDismiss?: () => void;
  icon?: React.ReactNode;
}

const DialogContext = createContext<DialogApi>({ alert: () => {}, confirm: () => Promise.resolve(false) });

/** `const dialog = useDialog(); dialog.alert('Delete?', 'Cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, …])` */
export const useDialog = () => useContext(DialogContext);

/* ---------- Provider ---------- */

/**
 * Renders app-themed dialogs in a Modal, one at a time (extra requests queue). A button's
 * `onPress` runs once the dialog is fully gone, so it can open a sheet, another dialog or navigate.
 */
export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<Request | null>(null);
  const [open, setOpen] = useState(false);
  const active = useRef<Request | null>(null);
  const queue = useRef<Request[]>([]);
  const pending = useRef<(() => void) | null>(null);
  const closing = useRef(false);
  const nextId = useRef(1);

  const present = useCallback((req: Request) => {
    active.current = req;
    closing.current = false;
    setCurrent(req);
    setOpen(true);
  }, []);

  /** The Modal is gone: clear it, run the chosen action, then show the next queued dialog. */
  const finish = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    const run = pending.current;
    pending.current = null;
    active.current = null;
    setCurrent(null);
    run?.();
    const next = queue.current.shift();
    if (next && !active.current) present(next);
  }, [present]);

  const close = useCallback((action?: (() => void) | null) => {
    if (!active.current || closing.current) return;
    closing.current = true;
    pending.current = action ?? null;
    setOpen(false);
  }, []);

  // iOS reports dismissal via Modal.onDismiss; Android has no callback, so wait a beat. Both back this up.
  useEffect(() => {
    if (open || !current) return;
    const t = setTimeout(finish, Platform.OS === 'ios' ? 700 : 60);
    return () => clearTimeout(t);
  }, [open, current, finish]);

  const alert = useCallback<DialogApi['alert']>(
    (title, message, buttons, options = {}) => {
      const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
      const req: Request = {
        id: nextId.current++,
        title,
        message,
        buttons: list,
        cancelable: options.cancelable ?? list.some((b) => b.style === 'cancel'),
        onDismiss: options.onDismiss,
        icon: options.icon,
      };
      if (active.current) queue.current.push(req);
      else present(req);
    },
    [present],
  );

  const confirm = useCallback<DialogApi['confirm']>(
    (o) =>
      new Promise<boolean>((resolve) => {
        alert(
          o.title,
          o.message,
          [
            { text: o.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: o.confirmText ?? 'OK', style: o.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
          ],
          { icon: o.icon, onDismiss: () => resolve(false) },
        );
      }),
    [alert],
  );

  const api = useMemo(() => ({ alert, confirm }), [alert, confirm]);

  /** Outside tap / Android back: behaves like the cancel button, or just closes. */
  const dismiss = () => {
    const req = active.current;
    if (!req) return;
    const cancel = req.buttons.find((b) => b.style === 'cancel');
    if (!cancel && !req.cancelable) return; // Android back on a non-cancelable alert does nothing
    close(() => {
      cancel?.onPress?.();
      req.onDismiss?.();
    });
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      {current ? (
        <Modal
          visible={open}
          transparent
          animationType="none"
          statusBarTranslucent
          onRequestClose={dismiss}
          onDismiss={Platform.OS === 'ios' ? finish : undefined}
        >
          <DialogCard
            key={current.id}
            request={current}
            onScrim={current.cancelable ? dismiss : undefined}
            onPress={(b) => {
              haptic.tap();
              close(b.onPress);
            }}
          />
        </Modal>
      ) : null}
    </DialogContext.Provider>
  );
}

/* ---------- View ---------- */

function DialogCard({
  request,
  onScrim,
  onPress,
}: {
  request: Request;
  onScrim?: () => void;
  onPress: (b: DialogButton) => void;
}) {
  const { colors } = useTheme();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduced) => {
        if (live) Animated.timing(anim, { toValue: 1, duration: reduced ? 0 : 160, useNativeDriver: true }).start();
      });
    return () => {
      live = false;
    };
  }, [anim]);

  const stacked = request.buttons.length > 2;
  const look = (style: DialogButton['style']) =>
    style === 'destructive'
      ? { bg: colors.dangerSoft, fg: colors.danger }
      : style === 'cancel'
        ? { bg: colors.muted, fg: colors.fgSoft }
        : { bg: colors.accentSoft, fg: colors.accentText };

  return (
    <View style={styles.host}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onScrim} accessible={false} />
      </Animated.View>
      <Animated.View
        accessibilityRole="alert"
        accessibilityViewIsModal
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }],
          },
        ]}
      >
        {request.icon ? <View style={styles.icon}>{request.icon}</View> : null}
        <Text variant="title" weight="bold" center>
          {request.title}
        </Text>
        {request.message ? (
          <Text tone="muted" center style={{ marginTop: space.sm }}>
            {request.message}
          </Text>
        ) : null}
        <View style={[styles.buttons, stacked ? styles.stacked : styles.row]}>
          {request.buttons.map((b, i) => {
            const { bg, fg } = look(b.style);
            return (
              <Pressable
                key={`${b.text}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={b.text}
                onPress={() => onPress(b)}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: bg, opacity: pressed ? 0.7 : 1 },
                  !stacked && { flex: 1 },
                ]}
              >
                <Text weight="semibold" color={fg} center numberOfLines={2}>
                  {b.text}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: radius.xl,
    padding: space.xl,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  icon: { alignItems: 'center', marginBottom: space.md },
  buttons: { marginTop: space.xl, gap: space.sm },
  row: { flexDirection: 'row' },
  stacked: { flexDirection: 'column' },
  button: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderRadius: radius.lg,
  },
});

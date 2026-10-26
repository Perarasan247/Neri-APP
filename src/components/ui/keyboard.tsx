import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  ScrollView,
  TextInput,
  View,
  type KeyboardEvent,
  type ScrollViewInstance,
  type ScrollViewProps,
  type ViewInstance,
  type ViewProps,
} from 'react-native';

/*
 * One keyboard mechanism for the whole app.
 *
 * Android is edge-to-edge on SDK 58, so the system may or may not resize the window for the IME
 * (`softwareKeyboardLayoutMode: "resize"` is not honoured consistently), and RN's own
 * KeyboardAvoidingView measures its frame relative to its parent, not the window, which breaks under
 * a native header. KeyboardAvoider therefore measures its own window position and pads only the part
 * that actually overlaps the keyboard. If the window was already resized the overlap is 0, so it never
 * double-counts and behaves the same on iOS and Android.
 */

const SHOW = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/** Time for the IME animation and the avoider's re-layout to settle before measuring a focused input. */
const SETTLE_MS = 220;

type Listener = () => void;
const revealListeners = new Set<Listener>();

/** Ask every mounted KeyboardScrollView to bring the focused input into view (TextField calls this on focus). */
export function requestReveal() {
  revealListeners.forEach((l) => l());
}

/** True while the software keyboard is up. */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener(SHOW, () => setVisible(true));
    const b = Keyboard.addListener(HIDE, () => setVisible(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return visible;
}

/**
 * Flex container that lifts its content above the keyboard by padding its bottom with the overlap
 * between its on-screen frame and the keyboard. Use as the root of any screen or sheet host with inputs.
 */
export function KeyboardAvoider({ style, children, onLayout, ...props }: ViewProps) {
  const ref = useRef<ViewInstance>(null);
  const keyboardTop = useRef<number | null>(null);
  const [pad, setPad] = useState(0);

  const measure = useCallback((duration?: number) => {
    const top = keyboardTop.current;
    const view = ref.current;
    if (top == null || !view) {
      setPad(0);
      return;
    }
    view.measureInWindow((_x, y, _w, h) => {
      const next = Math.max(0, Math.round(y + h - top));
      if (Platform.OS === 'ios' && duration) {
        LayoutAnimation.configureNext(LayoutAnimation.create(duration, 'keyboard', 'opacity'));
      }
      setPad(next);
    });
  }, []);

  useEffect(() => {
    const show = Keyboard.addListener(SHOW, (e: KeyboardEvent) => {
      keyboardTop.current = e.endCoordinates.height > 0 ? e.endCoordinates.screenY : null;
      measure(e.duration);
    });
    const hide = Keyboard.addListener(HIDE, (e: KeyboardEvent) => {
      keyboardTop.current = null;
      if (Platform.OS === 'ios' && e.duration) {
        LayoutAnimation.configureNext(LayoutAnimation.create(e.duration, 'keyboard', 'opacity'));
      }
      setPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [measure]);

  return (
    <View
      ref={ref}
      style={[{ flex: 1 }, style, { paddingBottom: pad }]}
      onLayout={(e) => {
        // The system may resize the window after the keyboard event: re-check against the new frame
        if (keyboardTop.current != null) measure();
        onLayout?.(e);
      }}
      {...props}
    >
      {children}
    </View>
  );
}

/**
 * ScrollView for forms: taps reach buttons while typing, dragging dismisses the keyboard, and the
 * focused input is scrolled clear of the keyboard when it opens or focus moves between fields.
 */
export function KeyboardScrollView({
  ref: forwardedRef,
  onScroll,
  ...props
}: ScrollViewProps & { ref?: React.Ref<ScrollViewInstance> }) {
  const scroll = useRef<ScrollViewInstance | null>(null);
  const offset = useRef(0);

  const reveal = useCallback(() => {
    setTimeout(() => {
      const sv = scroll.current;
      const input = TextInput.State.currentlyFocusedInput();
      if (!sv || !input) return;
      input.measureInWindow((_x, y, _w, h) => {
        sv.measureInWindow((_sx, sy, _sw, sh) => {
          if (!sh) return;
          const margin = 24;
          const below = y + h + margin - (sy + sh);
          const above = sy + margin - y;
          if (below > 0) sv.scrollTo({ y: offset.current + below, animated: true });
          else if (above > 0) sv.scrollTo({ y: Math.max(0, offset.current - above), animated: true });
        });
      });
    }, SETTLE_MS);
  }, []);

  useEffect(() => {
    revealListeners.add(reveal);
    const sub = Keyboard.addListener(SHOW, reveal);
    return () => {
      revealListeners.delete(reveal);
      sub.remove();
    };
  }, [reveal]);

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      scrollEventThrottle={32}
      {...props}
      ref={(node) => {
        scroll.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      onScroll={(e) => {
        offset.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
    />
  );
}

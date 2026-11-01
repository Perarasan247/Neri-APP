/**
 * Keeps the home-screen widget in step with the app ("push" updates), so the
 * widget's own 30-minute refresh is only a fallback:
 * - after any successful change in the app (habit logged, task added…)
 * - when the app opens or goes to the background
 * - on sign-out, so the widget stops showing the old account
 *
 * Taps made on the widget while the app was closed are replayed here too, and
 * the app's screens are refreshed when that happens.
 */
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { markSignedOut, syncWidgetData } from './sync';
import { updateAllWidgets } from './taskHandler';

const DEBOUNCE_MS = 1200;

export function useWidgetSync(status: 'loading' | 'signedIn' | 'signedOut') {
  const qc = useQueryClient();

  useEffect(() => {
    if (Platform.OS !== 'android' || status === 'loading') return;

    if (status === 'signedOut') {
      markSignedOut()
        .then(updateAllWidgets)
        .catch(() => {});
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const run = async () => {
      try {
        const sentFromWidget = await syncWidgetData();
        // The widget changed data behind React Query's back: refresh what's on screen
        if (sentFromWidget > 0 && !disposed) {
          qc.invalidateQueries({ queryKey: ['today'] });
          qc.invalidateQueries({ queryKey: ['todos'] });
          qc.invalidateQueries({ queryKey: ['month'] });
        }
        await updateAllWidgets();
      } catch {
        // Not a widget-capable build (e.g. Expo Go) or offline: nothing to do
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(run, DEBOUNCE_MS);
    };

    run();

    const unsubscribeMutations = qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success') schedule();
    });
    const appState = AppState.addEventListener('change', (s) => {
      // Leaving the app: sync now, a timer may never fire once JS is paused
      if (s === 'background') run();
      else if (s === 'active') schedule();
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
      unsubscribeMutations();
      appState.remove();
    };
  }, [status, qc]);
}

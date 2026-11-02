import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today } from '@/lib/format';

/** Today's date, refreshed every minute and whenever the app returns to the foreground (so it rolls over at midnight). */
export function useToday(): string {
  const [now, setNow] = useState(() => today());
  useEffect(() => {
    const refresh = () => setNow(today());
    const id = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return now;
}

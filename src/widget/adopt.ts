/**
 * App side only. Two queues exist (the app's outbox and the widget's own, which also works while the app
 * is closed) and each is replayed in order, but not relative to the other. When the app has changes
 * waiting, the widget's taps are moved into the outbox with their own timestamps so everything is sent in
 * the order it was made. Taps that can't be expressed there (a habit created from the widget and what
 * depends on it) stay in the widget queue.
 */
import { getSyncOwner, outbox } from '@/offline/sync';

import { splitForOutbox } from './convert';
import { isOwnedBy, readQueue, serial, writeQueue } from './store';

/** Returns how many widget taps were handed to the outbox. */
export async function adoptWidgetQueue(): Promise<number> {
  const owner = getSyncOwner();
  if (!owner || !outbox.hasPending(owner)) return 0; // nothing queued in the app: the widget's own replay keeps the order
  return serial(async () => {
    const queue = await readQueue();
    const mine = queue.filter((a) => isOwnedBy(a, owner));
    if (!mine.length) return 0;
    const { take, keep } = splitForOutbox(mine);
    if (!take.length) return 0;
    const others = queue.filter((a) => !isOwnedBy(a, owner));
    await outbox.adopt(owner, take);
    await writeQueue([...others, ...keep]);
    return take.length;
  });
}

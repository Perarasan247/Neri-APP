import { useSyncExternalStore } from 'react';

import { outbox } from './sync';
import type { OutboxState } from './outbox';

/** Live counts of queued, failed and in-flight changes. */
export const useOutboxState = (): OutboxState => useSyncExternalStore(outbox.subscribe, outbox.getState, outbox.getState);

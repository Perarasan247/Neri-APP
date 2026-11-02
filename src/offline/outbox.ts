/**
 * The outbox: changes made while the server could not be reached, kept on the device (persisted)
 * and replayed in order once it can. Pure logic with an injected key-value store, so it is unit
 * tested without React Native.
 *
 * Guarantees:
 * - order: operations are sent oldest first, and a network failure stops the run so later
 *   operations never overtake an earlier one
 * - at-least-once, made safe by idempotent operations: logs are absolute upserts, creates carry a
 *   `client_id`, deletes treat "already gone" as done
 * - nothing is silently dropped: a rejected operation is kept as `failed` for the user to retry or discard
 */
import type { TodoInput, TodoPatch, UpsertLogInput } from '@/api/endpoints';
import { newClientId } from '@/lib/id';

export interface KV {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type OutboxOp =
  | { type: 'upsertLog'; body: UpsertLogInput }
  | { type: 'incrementLog'; body: { habit_id: string; log_date: string; delta: number } }
  | { type: 'addValue'; body: { habit_id: string; entry_date: string; value: number; client_id: string } }
  | { type: 'restDay'; date: string; on: boolean; reason?: string }
  | { type: 'createTodo'; body: TodoInput & { client_id: string } }
  | { type: 'updateTodo'; id: string; patch: TodoPatch; scope: 'this' | 'future' }
  | { type: 'deleteTodo'; id: string; scope: 'this' | 'future' | 'all' };

export interface OutboxEntry {
  id: string;
  /** Whose change this is; entries of another account are never sent. */
  owner: string;
  op: OutboxOp;
  createdAt: number;
  attempts: number;
  status: 'pending' | 'failed';
  error?: string;
}

export interface OutboxState {
  /** Waiting to be sent (all owners). */
  pending: number;
  failed: number;
  flushing: boolean;
}

/** What to do with an operation that threw. */
export type Verdict =
  | 'network' // server unreachable: stop, try again later, don't count it
  | 'retry' // server trouble (5xx / 429 / 408): stop, count the attempt
  | 'done' // already applied (e.g. deleting something that is gone): drop it
  | 'fail'; // the server rejected it: keep it for the user

export interface FlushResult {
  sent: number;
  failed: number;
  /** True when the run stopped early because the server could not be reached. */
  blocked: boolean;
}

const STORAGE_KEY = 'neri.outbox.v1';
const MAX_ATTEMPTS = 6;

/* ---------- Pure helpers ---------- */

/** Short human description of an operation, for the sync screen. */
export function describeOp(op: OutboxOp): string {
  switch (op.type) {
    case 'upsertLog':
      return op.body.status === 'skipped' ? `Skip habit · ${op.body.log_date}` : `Habit log · ${op.body.log_date}`;
    case 'incrementLog':
      return `Habit count · ${op.body.log_date}`;
    case 'addValue':
      return `Habit value · ${op.body.entry_date}`;
    case 'restDay':
      return `${op.on ? 'Rest day' : 'Remove rest day'} · ${op.date}`;
    case 'createTodo':
      return `New task: ${op.body.title}`;
    case 'updateTodo':
      return 'Task change';
    case 'deleteTodo':
      return 'Delete task';
  }
}

/** The (habit, date) an operation touches, for log operations. */
const logKey = (op: OutboxOp): string | null =>
  op.type === 'upsertLog'
    ? `${op.body.habit_id}|${op.body.log_date}`
    : op.type === 'incrementLog'
      ? `${op.body.habit_id}|${op.body.log_date}`
      : null;

const todoIdOf = (op: OutboxOp): string | null =>
  op.type === 'createTodo' ? op.body.client_id : op.type === 'updateTodo' || op.type === 'deleteTodo' ? op.id : null;

/**
 * Add `op` to the queue, folding it into earlier pending operations where that cannot change the
 * result (so a habit tapped ten times offline is one request, and a task created then deleted
 * offline is none). Returns the new list; the input is not modified.
 */
export function coalesce(entries: OutboxEntry[], entry: OutboxEntry, lockedId?: string | null): OutboxEntry[] {
  const list = entries.slice();
  const { op, owner } = entry;
  // The entry being sent right now can't be edited: its request is already on the wire
  const mine = (e: OutboxEntry) => e.owner === owner && e.status === 'pending' && e.id !== lockedId;
  const inFlight = (e: OutboxEntry) => e.id === lockedId;

  if (op.type === 'upsertLog') {
    const key = logKey(op);
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (inFlight(e) && logKey(e.op) === key) break;
      if (!mine(e) || logKey(e.op) !== key) continue;
      if (e.op.type === 'upsertLog') {
        // Same day, same habit: the newer absolute value wins, but never erase a note already set
        const note = op.body.note ?? e.op.body.note;
        list[i] = { ...e, op: { type: 'upsertLog', body: { ...op.body, ...(note !== undefined ? { note } : {}) } } };
        return list;
      }
      break; // an increment sits in between: keep the order
    }
  }

  if (op.type === 'restDay') {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (inFlight(e) && e.op.type === 'restDay' && e.op.date === op.date) break;
      if (mine(e) && e.op.type === 'restDay' && e.op.date === op.date) {
        list[i] = { ...e, op };
        return list;
      }
    }
  }

  if (op.type === 'updateTodo') {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (inFlight(e) && todoIdOf(e.op) === op.id) break;
      if (!mine(e) || todoIdOf(e.op) !== op.id) continue;
      if (e.op.type === 'updateTodo' && e.op.scope === op.scope && !('repeat' in e.op.patch) && !('repeat' in op.patch)) {
        list[i] = { ...e, op: { ...op, patch: { ...e.op.patch, ...op.patch } } };
        return list;
      }
      break;
    }
  }

  if (op.type === 'deleteTodo') {
    const id = op.id;
    const created = list.some((e) => mine(e) && e.op.type === 'createTodo' && e.op.body.client_id === id);
    if (created && op.scope === 'this') {
      // Never reached the server: forget the task entirely
      return list.filter((e) => !(mine(e) && todoIdOf(e.op) === id));
    }
    // Edits to a task that is about to be deleted are pointless
    return [...list.filter((e) => !(mine(e) && e.op.type === 'updateTodo' && e.op.id === id)), entry];
  }

  list.push(entry);
  return list;
}

/* ---------- The outbox ---------- */

export interface Outbox {
  load(): Promise<void>;
  add(owner: string, op: OutboxOp): Promise<void>;
  entries(): OutboxEntry[];
  getState(): OutboxState;
  hasPending(owner: string): boolean;
  pendingCount(owner: string): number;
  failedEntries(owner: string): OutboxEntry[];
  subscribe(fn: () => void): () => void;
  flush(
    owner: string,
    execute: (op: OutboxOp, entry: OutboxEntry) => Promise<unknown>,
    classify: (error: unknown, op: OutboxOp) => Verdict,
  ): Promise<FlushResult>;
  retryFailed(owner: string): Promise<void>;
  discard(owner: string, id?: string): Promise<void>;
  /** Drop everything that belongs to a different account. */
  purgeOthers(owner: string): Promise<void>;
  clear(): Promise<void>;
}

export function createOutbox(kv: KV, now: () => number = Date.now): Outbox {
  let list: OutboxEntry[] = [];
  let state: OutboxState = { pending: 0, failed: 0, flushing: false };
  let flushing: Promise<FlushResult> | null = null;
  let inflightId: string | null = null;
  const listeners = new Set<() => void>();
  // Writes happen one at a time, in order, so a slow write never lands after a newer one
  let writes: Promise<void> = Promise.resolve();

  const recompute = () => {
    const pending = list.filter((e) => e.status === 'pending').length;
    const failed = list.length - pending;
    if (pending !== state.pending || failed !== state.failed || (flushing !== null) !== state.flushing) {
      state = { pending, failed, flushing: flushing !== null };
    }
  };
  const emit = () => {
    recompute();
    listeners.forEach((l) => l());
  };
  const persist = () => {
    const payload = JSON.stringify({ version: 1, entries: list });
    writes = writes.then(() => kv.setItem(STORAGE_KEY, payload)).catch(() => {});
    return writes;
  };
  const commit = async (next: OutboxEntry[]) => {
    list = next;
    emit();
    await persist();
  };

  const self: Outbox = {
    async load() {
      try {
        const raw = await kv.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const entries: unknown = parsed?.version === 1 ? parsed.entries : [];
        list = Array.isArray(entries)
          ? (entries as OutboxEntry[]).filter(
              (e) => e && typeof e.id === 'string' && typeof e.owner === 'string' && e.op && typeof e.op.type === 'string',
            )
          : [];
      } catch {
        list = [];
      }
      emit();
    },

    async add(owner, op) {
      const entry: OutboxEntry = { id: newClientId(), owner, op, createdAt: now(), attempts: 0, status: 'pending' };
      await commit(coalesce(list, entry, inflightId));
    },

    entries: () => list,
    getState: () => state,
    hasPending: (owner) => list.some((e) => e.owner === owner && e.status === 'pending'),
    pendingCount: (owner) => list.filter((e) => e.owner === owner && e.status === 'pending').length,
    failedEntries: (owner) => list.filter((e) => e.owner === owner && e.status === 'failed'),
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    flush(owner, execute, classify) {
      // One run at a time; callers during a run share its result
      if (flushing) return flushing;
      const run = (async (): Promise<FlushResult> => {
        const result: FlushResult = { sent: 0, failed: 0, blocked: false };
        // Re-read the list each round: operations may be added (or folded together) while we send
        for (;;) {
          const next = list.find((e) => e.owner === owner && e.status === 'pending');
          if (!next) break;
          inflightId = next.id;
          try {
            await execute(next.op, next);
            result.sent++;
            await commit(list.filter((e) => e.id !== next.id));
          } catch (error) {
            const verdict = classify(error, next.op);
            const message = error instanceof Error ? error.message : 'Rejected by the server';
            if (verdict === 'done') {
              await commit(list.filter((e) => e.id !== next.id));
            } else if (verdict === 'network') {
              result.blocked = true;
              break;
            } else if (verdict === 'retry' && next.attempts + 1 < MAX_ATTEMPTS) {
              await commit(list.map((e) => (e.id === next.id ? { ...e, attempts: e.attempts + 1 } : e)));
              result.blocked = true;
              break;
            } else {
              result.failed++;
              await commit(
                list.map((e) => (e.id === next.id ? { ...e, attempts: e.attempts + 1, status: 'failed', error: message } : e)),
              );
            }
          }
        }
        return result;
      })().finally(() => {
        flushing = null;
        inflightId = null;
        emit();
      });
      flushing = run;
      emit();
      return run;
    },

    async retryFailed(owner) {
      await commit(list.map((e) => (e.owner === owner && e.status === 'failed' ? { ...e, status: 'pending', attempts: 0, error: undefined } : e)));
    },

    async discard(owner, id) {
      await commit(list.filter((e) => !(e.owner === owner && e.status === 'failed' && (id === undefined || e.id === id))));
    },

    async purgeOthers(owner) {
      if (list.some((e) => e.owner !== owner)) await commit(list.filter((e) => e.owner === owner));
    },

    async clear() {
      await commit([]);
    },
  };
  return self;
}

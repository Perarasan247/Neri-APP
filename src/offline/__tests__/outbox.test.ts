import { newClientId } from '@/lib/id';
import { backoffDelay, classifyFailure, coalesce, createOutbox, describeOp, MAX_ATTEMPTS, type KV, type OutboxEntry, type OutboxOp, type Verdict } from '../outbox';
import { getOnline, resetConnectivity, setDeviceConnected, setServerReachable, subscribeOnline } from '../connectivity';

function memoryKV(initial: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: async (k) => (k in data ? data[k] : null),
    setItem: async (k, v) => {
      data[k] = v;
    },
    removeItem: async (k) => {
      delete data[k];
    },
  };
}

const log = (habit: string, date: string, count: number, extra: object = {}): OutboxOp => ({
  type: 'upsertLog',
  body: { habit_id: habit, log_date: date, count, status: 'done', ...extra },
});
const entry = (op: OutboxOp, owner = 'u1', id = Math.random().toString(36)): OutboxEntry => ({
  id,
  owner,
  op,
  createdAt: 0,
  attempts: 0,
  status: 'pending',
});
const netErr = () => Object.assign(new Error('offline'), { kind: 'network' });
const classify = (e: unknown): Verdict => ((e as any)?.kind === 'network' ? 'network' : (e as any)?.verdict ?? 'fail');

describe('newClientId', () => {
  it('matches the pattern the server accepts and does not repeat', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newClientId()));
    expect(ids.size).toBe(500);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Za-z0-9_-]{8,36}$/);
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});

describe('coalesce', () => {
  it('folds repeated writes to the same habit and day into the newest one', () => {
    let q: OutboxEntry[] = [];
    q = coalesce(q, entry(log('h1', '2026-11-02', 1)));
    q = coalesce(q, entry(log('h1', '2026-11-02', 2)));
    q = coalesce(q, entry(log('h1', '2026-11-02', 3)));
    expect(q).toHaveLength(1);
    expect((q[0].op as any).body.count).toBe(3);
  });

  it('keeps different habits and days apart', () => {
    let q: OutboxEntry[] = [];
    q = coalesce(q, entry(log('h1', '2026-11-02', 1)));
    q = coalesce(q, entry(log('h2', '2026-11-02', 1)));
    q = coalesce(q, entry(log('h1', '2026-11-01', 1)));
    expect(q).toHaveLength(3);
  });

  it('does not erase a note when a later write has none', () => {
    let q = coalesce([], entry(log('h1', 'd', 1, { note: 'felt great' })));
    q = coalesce(q, entry(log('h1', 'd', 0)));
    expect((q[0].op as any).body.note).toBe('felt great');
    q = coalesce(q, entry(log('h1', 'd', 0, { note: 'changed my mind' })));
    expect((q[0].op as any).body.note).toBe('changed my mind');
  });

  it('never merges across owners', () => {
    let q = coalesce([], entry(log('h1', 'd', 1), 'a'));
    q = coalesce(q, entry(log('h1', 'd', 2), 'b'));
    expect(q).toHaveLength(2);
  });

  it('merges consecutive edits to one task, but not when the repeat rule is involved', () => {
    const upd = (patch: any): OutboxOp => ({ type: 'updateTodo', id: 't1', patch, scope: 'this' });
    let q = coalesce([], entry(upd({ title: 'A' })));
    q = coalesce(q, entry(upd({ priority: 'high' })));
    expect(q).toHaveLength(1);
    expect((q[0].op as any).patch).toEqual({ title: 'A', priority: 'high' });
    q = coalesce(q, entry(upd({ repeat: null })));
    q = coalesce(q, entry(upd({ title: 'B' })));
    expect(q).toHaveLength(3);
  });

  it('cancels a task that was created and deleted before it ever synced', () => {
    const create: OutboxOp = { type: 'createTodo', body: { title: 'Buy milk', client_id: 'cid-0001' } };
    let q = coalesce([], entry(create));
    q = coalesce(q, entry({ type: 'updateTodo', id: 'cid-0001', patch: { title: 'Buy oat milk' }, scope: 'this' }));
    q = coalesce(q, entry({ type: 'deleteTodo', id: 'cid-0001', scope: 'this' }));
    expect(q).toHaveLength(0);
  });

  it('does not cancel an offline-created repeating task when only one occurrence is deleted', () => {
    const create = entry({ type: 'createTodo', body: { client_id: 'task-rep1', title: 'Gym', repeat: { frequency: 'daily', interval: 1, weekdays: [], end_date: null } } });
    const q = coalesce([create], entry({ type: 'deleteTodo', id: 'task-rep1', scope: 'this' }));
    expect(q.map((e) => e.op.type)).toEqual(['createTodo', 'deleteTodo']);
  });

  it('drops pointless edits before deleting a task that exists on the server', () => {
    let q = coalesce([], entry({ type: 'updateTodo', id: 'x', patch: { title: 'A' }, scope: 'this' }));
    q = coalesce(q, entry({ type: 'deleteTodo', id: 'x', scope: 'this' }));
    expect(q.map((e) => e.op.type)).toEqual(['deleteTodo']);
  });

  it('treats the last rest-day toggle for a date as the truth', () => {
    let q = coalesce([], entry({ type: 'restDay', date: 'd', on: true, reason: 'sick' }));
    q = coalesce(q, entry({ type: 'restDay', date: 'd', on: false }));
    expect(q).toHaveLength(1);
    expect((q[0].op as any).on).toBe(false);
  });

  it('does not fold value entries together (each one is a separate measurement)', () => {
    const v = (id: string): OutboxOp => ({ type: 'addValue', body: { habit_id: 'h', entry_date: 'd', value: 5, client_id: id } });
    let q = coalesce([], entry(v('a')));
    q = coalesce(q, entry(v('b')));
    expect(q).toHaveLength(2);
  });

  it('never edits the entry that is already being sent', () => {
    const first = entry(log('h1', 'd', 1), 'u1', 'inflight');
    const q = coalesce([first], entry(log('h1', 'd', 2)), 'inflight');
    expect(q).toHaveLength(2);
    expect((q[0].op as any).body.count).toBe(1);
    expect((q[1].op as any).body.count).toBe(2);
  });
});

describe('outbox', () => {
  it('sends in order and persists the queue', async () => {
    const kv = memoryKV();
    const box = createOutbox(kv);
    await box.add('u1', log('h1', 'd1', 1));
    await box.add('u1', { type: 'restDay', date: 'd2', on: true });
    await box.add('u1', { type: 'createTodo', body: { title: 'T', client_id: 'cid-1234' } });
    expect(JSON.parse(kv.data['neri.outbox.v1']).entries).toHaveLength(3);

    const sent: string[] = [];
    const res = await box.flush('u1', async (op) => void sent.push(op.type), classify);
    expect(sent).toEqual(['upsertLog', 'restDay', 'createTodo']);
    expect(res).toEqual({ sent: 3, failed: 0, blocked: false });
    expect(box.getState()).toEqual({ pending: 0, failed: 0, flushing: false });
    expect(JSON.parse(kv.data['neri.outbox.v1']).entries).toHaveLength(0);
  });

  it('stops at a network failure so later operations never overtake it, then resumes', async () => {
    const box = createOutbox(memoryKV());
    await box.add('u1', log('h1', 'd1', 1));
    await box.add('u1', log('h2', 'd1', 1));
    await box.add('u1', log('h3', 'd1', 1));

    const sent: string[] = [];
    let down = true;
    const exec = async (op: OutboxOp) => {
      if (op.type !== 'upsertLog') return;
      if (op.body.habit_id === 'h2' && down) throw netErr();
      sent.push(op.body.habit_id);
    };
    let res = await box.flush('u1', exec, classify);
    expect(sent).toEqual(['h1']);
    expect(res).toMatchObject({ sent: 1, blocked: true });
    expect(box.pendingCount('u1')).toBe(2);
    expect(box.entries()[0].attempts).toBe(0); // being offline is not a failed attempt

    down = false;
    res = await box.flush('u1', exec, classify);
    expect(sent).toEqual(['h1', 'h2', 'h3']);
    expect(res.blocked).toBe(false);
    expect(box.pendingCount('u1')).toBe(0);
  });

  it('keeps a rejected operation as failed and carries on with the rest', async () => {
    const box = createOutbox(memoryKV());
    await box.add('u1', log('bad', 'd1', 1));
    await box.add('u1', log('good', 'd1', 1));
    const exec = async (op: OutboxOp) => {
      if (op.type === 'upsertLog' && op.body.habit_id === 'bad') throw new Error('Future dates cannot be logged.');
    };
    const res = await box.flush('u1', exec, () => 'fail');
    expect(res).toEqual({ sent: 1, failed: 1, blocked: false });
    expect(box.failedEntries('u1')).toHaveLength(1);
    expect(box.failedEntries('u1')[0].error).toBe('Future dates cannot be logged.');
    expect(box.getState()).toMatchObject({ pending: 0, failed: 1 });

    await box.retryFailed('u1');
    expect(box.getState()).toMatchObject({ pending: 1, failed: 0 });
    await box.flush('u1', async () => {}, classify);
    expect(box.entries()).toHaveLength(0);
  });

  it('can discard failed operations, one or all', async () => {
    const box = createOutbox(memoryKV());
    await box.add('u1', log('a', 'd', 1));
    await box.add('u1', log('b', 'd', 1));
    await box.flush('u1', async () => { throw new Error('no'); }, () => 'fail');
    const [first] = box.failedEntries('u1');
    await box.discard('u1', first.id);
    expect(box.failedEntries('u1')).toHaveLength(1);
    await box.discard('u1');
    expect(box.entries()).toHaveLength(0);
  });

  it('treats "already gone" as done', async () => {
    const box = createOutbox(memoryKV());
    await box.add('u1', { type: 'deleteTodo', id: 'x', scope: 'this' });
    const res = await box.flush('u1', async () => { throw new Error('404'); }, () => 'done');
    expect(res).toEqual({ sent: 0, failed: 0, blocked: false });
    expect(box.entries()).toHaveLength(0);
  });

  it('gives up on an operation after repeated server errors instead of blocking forever', async () => {
    let t = 1_000_000;
    const box = createOutbox(memoryKV(), () => t);
    await box.add('u1', log('a', 'd', 1));
    await box.add('u1', log('b', 'd', 1));
    const exec = async (op: OutboxOp) => {
      if (op.type === 'upsertLog' && op.body.habit_id === 'a') throw new Error('500');
    };
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      const r = await box.flush('u1', exec, () => 'retry');
      expect(r.blocked).toBe(true);
      expect(box.failedEntries('u1')).toHaveLength(0);
      t += 10 * 60_000; // wait out the backoff
    }
    const last = await box.flush('u1', exec, () => 'retry');
    expect(last).toMatchObject({ failed: 1 });
    expect(box.failedEntries('u1')[0].op).toMatchObject({ body: { habit_id: 'a' } });
    expect(box.entries().some((e) => e.status === 'pending')).toBe(false); // b went through
  });

  it('waits out a backoff by time: no retry storm, and nothing overtakes the waiting item', async () => {
    let t = 5_000_000;
    const box = createOutbox(memoryKV(), () => t);
    await box.add('u1', log('a', 'd', 1));
    await box.add('u1', log('b', 'd', 1));
    const calls: string[] = [];
    let down = true;
    const exec = async (op: OutboxOp) => {
      const id = (op as any).body.habit_id as string;
      calls.push(id);
      if (down && id === 'a') throw new Error('503');
    };
    await box.flush('u1', exec, () => 'retry');
    expect(calls).toEqual(['a']);
    expect(box.entries()[0].nextAttemptAt).toBe(t + backoffDelay(1));

    // Flushing again right away (the 15 s probe, a read gate) must not hit the server or skip ahead to b
    t += 1_000;
    const again = await box.flush('u1', exec, () => 'retry');
    expect(again.blocked).toBe(true);
    expect(calls).toEqual(['a']);

    // A minute-long outage later: it succeeds, and the attempt counter never failed it
    down = false;
    t += 60_000;
    const done = await box.flush('u1', exec, () => 'retry');
    expect(done).toMatchObject({ sent: 2, failed: 0 });
    expect(calls).toEqual(['a', 'a', 'b']);
  });

  it('keeps edits that depend on a rejected create, visibly, instead of dropping them', async () => {
    const box = createOutbox(memoryKV());
    const create: OutboxOp = { type: 'createTodo', body: { client_id: 'task-0001', title: 'Pay rent' } };
    await box.add('u1', create);
    await box.add('u1', { type: 'updateTodo', id: 'task-0001', patch: { title: 'Pay rent now' }, scope: 'this' });
    await box.add('u1', log('h', 'd', 1));
    const exec = async (op: OutboxOp) => {
      if (op.type === 'createTodo') throw new Error('Title is not valid');
    };
    const r = await box.flush('u1', exec, () => 'fail');
    expect(r.failed).toBe(2);
    const failed = box.failedEntries('u1');
    expect(failed).toHaveLength(2);
    expect(failed[1].error).toContain('earlier change to this task');
    expect(box.entries().filter((e) => e.status === 'pending')).toHaveLength(0); // the unrelated log went through
  });

  it('counts only the viewer’s changes and keeps other accounts’ entries untouched', async () => {
    const box = createOutbox(memoryKV());
    await box.add('alice', log('a', 'd', 1));
    await box.add('bob', log('b', 'd', 1));
    box.setViewer('bob');
    expect(box.getState()).toMatchObject({ pending: 1 });
    box.setViewer(null);
    expect(box.getState()).toMatchObject({ pending: 0 });
    box.setViewer('alice');
    expect(box.entries()).toHaveLength(2);
    expect(box.hasPending('bob')).toBe(true);
  });

  it('adopts timestamped operations in time order without folding them', async () => {
    const box = createOutbox(memoryKV(), () => 5_000);
    await box.add('u1', log('x', 'd', 1)); // createdAt 5000
    await box.adopt('u1', [
      { op: log('w1', 'd', 1), createdAt: 1_000 },
      { op: log('w1', 'd', 2), createdAt: 9_000 },
    ]);
    expect(box.entries().map((e) => (e.op as any).body.habit_id + ':' + (e.op as any).body.count)).toEqual(['w1:1', 'x:1', 'w1:2']);
  });

  it('classifies failures: 409 on a rest-day create is done, auth is kept, 5xx retries', () => {
    const rest: OutboxOp = { type: 'restDay', date: 'd', on: true };
    expect(classifyFailure({ status: 409, isNetwork: false }, rest)).toBe('done');
    expect(classifyFailure({ status: 409, isNetwork: false }, { type: 'createTodo', body: { client_id: 'abcdefgh', title: 't' } })).toBe('fail');
    expect(classifyFailure({ status: 401, isNetwork: false }, rest)).toBe('network');
    expect(classifyFailure({ status: 0, isNetwork: true }, rest)).toBe('network');
    expect(classifyFailure({ status: 503, isNetwork: false }, rest)).toBe('retry');
    expect(classifyFailure({ status: 404, isNetwork: false }, { type: 'deleteTodo', id: 'x', scope: 'this' })).toBe('done');
    expect(classifyFailure(null, rest)).toBe('fail');
  });

  it('backs off 5s, 15s, 45s … capped at five minutes', () => {
    expect([1, 2, 3].map(backoffDelay)).toEqual([5_000, 15_000, 45_000]);
    expect(backoffDelay(4)).toBe(135_000);
    expect(backoffDelay(10)).toBe(300_000);
  });

  it('only sends the current account’s changes and can purge the rest', async () => {
    const box = createOutbox(memoryKV());
    await box.add('alice', log('a', 'd', 1));
    await box.add('bob', log('b', 'd', 1));
    const sent: string[] = [];
    await box.flush('bob', async (op) => void sent.push((op as any).body.habit_id), classify);
    expect(sent).toEqual(['b']);
    expect(box.hasPending('alice')).toBe(true);
    await box.purgeOthers('bob');
    expect(box.entries()).toHaveLength(0);
  });

  it('shares one run between concurrent flush calls (no double sends)', async () => {
    const box = createOutbox(memoryKV());
    await box.add('u1', log('a', 'd', 1));
    let calls = 0;
    const exec = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
    };
    const [r1, r2] = await Promise.all([box.flush('u1', exec, classify), box.flush('u1', exec, classify)]);
    expect(calls).toBe(1);
    expect(r1).toBe(r2);
  });

  it('keeps a change made while an earlier one is being sent', async () => {
    const box = createOutbox(memoryKV());
    await box.add('u1', log('h', 'd', 1));
    const seen: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const exec = async (op: OutboxOp) => {
      seen.push((op as any).body.count);
      if (seen.length === 1) await gate; // first request is "on the wire"
    };
    const run = box.flush('u1', exec, classify);
    await new Promise((r) => setTimeout(r, 0));
    await box.add('u1', log('h', 'd', 2)); // tapped again mid-flight
    release();
    await run;
    expect(seen).toEqual([1, 2]); // the second value was sent too, not lost
    expect(box.entries()).toHaveLength(0);
  });

  it('survives a restart and ignores corrupt storage', async () => {
    const kv = memoryKV();
    const a = createOutbox(kv);
    await a.add('u1', log('h', 'd', 1));
    const b = createOutbox(kv);
    await b.load();
    expect(b.pendingCount('u1')).toBe(1);

    for (const bad of ['{nope', '[]', '{"version":2,"entries":[1]}', '{"version":1,"entries":[null,{"id":1}]}']) {
      const c = createOutbox(memoryKV({ 'neri.outbox.v1': bad }));
      await c.load();
      expect(c.entries()).toHaveLength(0);
    }
  });

  it('notifies subscribers as the state changes', async () => {
    const box = createOutbox(memoryKV());
    const seen: number[] = [];
    box.subscribe(() => seen.push(box.getState().pending));
    await box.add('u1', log('h', 'd', 1));
    await box.flush('u1', async () => {}, classify);
    expect(seen[0]).toBe(1);
    expect(seen[seen.length - 1]).toBe(0);
  });

  it('describes operations for the sync screen', () => {
    expect(describeOp({ type: 'createTodo', body: { title: 'Buy milk', client_id: 'x' } })).toBe('New task: Buy milk');
    expect(describeOp(log('h', '2026-11-02', 1))).toContain('2026-11-02');
  });
});

describe('connectivity', () => {
  beforeEach(resetConnectivity);
  it('is online only when the device and the server are both reachable', () => {
    expect(getOnline()).toBe(true);
    setServerReachable(false);
    expect(getOnline()).toBe(false);
    setServerReachable(true);
    setDeviceConnected(false);
    expect(getOnline()).toBe(false);
    setDeviceConnected(true);
    expect(getOnline()).toBe(true);
  });
  it('only notifies on a real change', () => {
    const fn = jest.fn();
    subscribeOnline(fn);
    setServerReachable(true);
    setDeviceConnected(true);
    expect(fn).not.toHaveBeenCalled();
    setServerReachable(false);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

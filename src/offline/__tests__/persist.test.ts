import { CACHE_MAX_AGE_MS, CACHE_VERSION, parseCache, selectQueries } from '../persist';

const q = (key: string, updated: number, status = 'success', hasData = true) =>
  ({ queryKey: [key], queryHash: key, state: { status, data: hasData ? { k: key } : undefined, dataUpdatedAt: updated } }) as any;

describe('selectQueries', () => {
  it('keeps only loaded queries, newest first, up to the limit', () => {
    const out = selectQueries([q('old', 1), q('new', 3), q('err', 5, 'error'), q('empty', 6, 'success', false), q('mid', 2)], 2);
    expect(out.map((x) => x.queryKey[0])).toEqual(['new', 'mid']);
  });
});

describe('parseCache', () => {
  const now = 1_000_000_000;
  const good = { version: CACHE_VERSION, savedAt: now - 1000, owner: 'u1', state: { mutations: [], queries: [] } };

  it('accepts a fresh cache', () => {
    expect(parseCache(JSON.stringify(good), now)?.owner).toBe('u1');
  });
  it('rejects missing, corrupt, wrong-version, malformed and expired caches', () => {
    expect(parseCache(null, now)).toBeNull();
    expect(parseCache('{oops', now)).toBeNull();
    expect(parseCache(JSON.stringify({ ...good, version: 99 }), now)).toBeNull();
    expect(parseCache(JSON.stringify({ ...good, state: {} }), now)).toBeNull();
    expect(parseCache(JSON.stringify({ ...good, savedAt: now - CACHE_MAX_AGE_MS - 1 }), now)).toBeNull();
    expect(parseCache('null', now)).toBeNull();
  });
});

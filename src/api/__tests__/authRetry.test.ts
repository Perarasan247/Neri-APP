import { withAuthRefresh, type RefreshOutcome } from '../authRetry';

const res = (status: number) => ({ status });
const boom = () => new Error('unreachable');

describe('withAuthRefresh', () => {
  it('passes a normal answer straight through without refreshing', async () => {
    const refresh = jest.fn<Promise<RefreshOutcome>, []>();
    const out = await withAuthRefresh(async () => res(200), refresh, boom);
    expect(out).toEqual({ result: res(200), unauthorized: false });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes on a 401 and repeats the request once, without signing out', async () => {
    const run = jest.fn().mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200));
    const out = await withAuthRefresh(run, async () => 'refreshed', boom);
    expect(run).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ result: res(200), unauthorized: false });
  });

  it('reports unauthorized only when the retry is refused too', async () => {
    const run = jest.fn().mockResolvedValue(res(401));
    const out = await withAuthRefresh(run, async () => 'refreshed', boom);
    expect(run).toHaveBeenCalledTimes(2); // retried once, not forever
    expect(out.unauthorized).toBe(true);
  });

  it('reports unauthorized when the refresh token itself was refused', async () => {
    const run = jest.fn().mockResolvedValue(res(401));
    const out = await withAuthRefresh(run, async () => 'rejected', boom);
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.unauthorized).toBe(true);
  });

  it('keeps the session (throws a network error) when the refresh could not be attempted', async () => {
    const run = jest.fn().mockResolvedValue(res(401));
    await expect(withAuthRefresh(run, async () => 'unreachable', boom)).rejects.toThrow('unreachable');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

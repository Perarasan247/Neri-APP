import { getServerWaking, hasReachedServer, resetConnectivity, setServerReachable, trackWaking } from '../connectivity';

describe('cold start tracking', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetConnectivity();
  });
  afterEach(() => jest.useRealTimers());

  it('says "waking up" only when the very first request is slow', () => {
    const stop = trackWaking(true);
    expect(getServerWaking()).toBe(false);
    jest.advanceTimersByTime(4100);
    expect(getServerWaking()).toBe(true);
    stop();
    expect(getServerWaking()).toBe(false);
  });

  it('a fast first request never flickers the state', () => {
    const stop = trackWaking(true);
    jest.advanceTimersByTime(500);
    stop();
    jest.advanceTimersByTime(10_000);
    expect(getServerWaking()).toBe(false);
  });

  it('ignores requests once the server has answered', () => {
    expect(hasReachedServer()).toBe(false);
    setServerReachable(true);
    expect(hasReachedServer()).toBe(true);
    const stop = trackWaking(false);
    jest.advanceTimersByTime(60_000);
    expect(getServerWaking()).toBe(false);
    stop();
  });
});

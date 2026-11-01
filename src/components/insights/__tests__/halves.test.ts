import { halfRateChange, halfSumChange, pooledRate } from '@/components/insights/halves';

describe('insight trend math', () => {
  it('pools rates weighted by scheduled habits, not by averaging percentages', () => {
    // 1/1 (100%) and 1/9 (11%) → 2/10 = 20%, not 55%
    expect(pooledRate([{ done: 1, scheduled: 1 }, { done: 1, scheduled: 9 }])).toBeCloseTo(20);
  });

  it('returns null when nothing was scheduled', () => {
    expect(pooledRate([])).toBeNull();
    expect(pooledRate([{ done: 0, scheduled: 0 }])).toBeNull();
  });

  it('compares the second half of a period with the first', () => {
    const trend = [
      { done: 1, scheduled: 4 },
      { done: 1, scheduled: 4 },
      { done: 3, scheduled: 4 },
      { done: 3, scheduled: 4 },
    ];
    expect(halfRateChange(trend)).toBe(50); // 25% → 75%
  });

  it('needs at least two points, and a scheduled day in each half', () => {
    expect(halfRateChange([{ done: 1, scheduled: 1 }])).toBeNull();
    expect(halfRateChange([{ done: 1, scheduled: 1 }, { done: 0, scheduled: 0 }])).toBeNull();
  });

  it('sums a value across halves', () => {
    expect(halfSumChange([1, 2, 5, 6], (n) => n)).toBe(8); // 11 - 3
    expect(halfSumChange([1], (n) => n)).toBeNull();
  });
});

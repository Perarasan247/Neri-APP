import { isoWeekday, nextMatchingDate, ordinal, sameShape } from '@/lib/repeat';
import type { Repeat } from '@/api/types';

const weekly = (weekdays: number[], interval = 1): Repeat => ({ frequency: 'weekly', interval, weekdays }) as Repeat;

describe('repeat rules', () => {
  it('numbers ISO weekdays Monday=1 … Sunday=7', () => {
    expect(isoWeekday('2026-10-26')).toBe(1); // Monday
    expect(isoWeekday('2026-10-31')).toBe(6); // Saturday
    expect(isoWeekday('2026-11-01')).toBe(7); // Sunday
  });

  it('writes ordinals, including the teens', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd',
    ]);
  });

  it('moves a date to the next day the weekly rule allows', () => {
    expect(nextMatchingDate('2026-10-31', weekly([1, 3]))).toBe('2026-11-02'); // Sat → Mon
    expect(nextMatchingDate('2026-10-26', weekly([1, 3]))).toBe('2026-10-26'); // already a Monday
  });

  it('leaves the date alone when there is nothing to align to', () => {
    expect(nextMatchingDate('2026-10-31', null)).toBe('2026-10-31');
    expect(nextMatchingDate('2026-10-31', { frequency: 'daily', interval: 1 } as Repeat)).toBe('2026-10-31');
  });

  it('compares the shape of two rules', () => {
    expect(sameShape(null, null)).toBe(true);
    expect(sameShape(weekly([1]), null)).toBe(false);
    expect(sameShape(weekly([1, 3]), weekly([1, 3]))).toBe(true);
    expect(sameShape(weekly([1, 3]), weekly([1, 4]))).toBe(false);
  });
});

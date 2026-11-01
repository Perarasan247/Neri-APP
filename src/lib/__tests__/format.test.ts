import { addDays, diffDays, formatTime, friendlyDate, parseISODate, pluralize, startOfWeek, streakText, toISODate } from '@/lib/format';

describe('date helpers', () => {
  it('round-trips a date without shifting it by timezone', () => {
    expect(toISODate(parseISODate('2026-03-01'))).toBe('2026-03-01');
    expect(toISODate(parseISODate('2026-12-31'))).toBe('2026-12-31');
  });

  it('adds days across month and year boundaries, and leap days', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('diffs days', () => {
    expect(diffDays('2026-10-31', '2026-10-24')).toBe(7);
    expect(diffDays('2026-10-24', '2026-10-31')).toBe(-7);
    expect(diffDays('2026-10-31', '2026-10-31')).toBe(0);
  });

  it('finds the Monday of a week', () => {
    expect(startOfWeek('2026-10-31')).toBe('2026-10-26'); // Saturday
    expect(startOfWeek('2026-10-26')).toBe('2026-10-26'); // Monday
    expect(startOfWeek('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the week before
  });

  it('describes dates relative to a reference day', () => {
    expect(friendlyDate('2026-10-31', '2026-10-31')).toBe('Today');
    expect(friendlyDate('2026-11-01', '2026-10-31')).toBe('Tomorrow');
    expect(friendlyDate('2026-10-30', '2026-10-31')).toBe('Yesterday');
  });
});

describe('text helpers', () => {
  it('formats 24h times as 12h', () => {
    expect(formatTime('00:05')).toBe('12:05 am');
    expect(formatTime('12:00')).toBe('12:00 pm');
    expect(formatTime('15:30')).toBe('3:30 pm');
    expect(formatTime(null)).toBe('');
  });

  it('pluralizes and words streaks', () => {
    expect(pluralize(1, 'habit')).toBe('1 habit');
    expect(pluralize(3, 'habit')).toBe('3 habits');
    expect(streakText(1)).toBe('1 day');
    expect(streakText(2, 'week')).toBe('2 weeks');
  });
});

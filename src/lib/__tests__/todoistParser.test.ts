import { parseTodoistInput } from '@/lib/todoistParser';

describe('quick-add parser', () => {
  it('keeps a plain title untouched', () => {
    const r = parseTodoistInput('Buy milk');
    expect(r.cleanTitle).toBe('Buy milk');
    expect(r.dueDate).toBeUndefined();
    expect(r.category).toBeUndefined();
  });

  it('pulls a #category out of the title', () => {
    const r = parseTodoistInput('Review report #Work');
    expect(r.category).toBe('Work');
    expect(r.cleanTitle).toBe('Review report');
  });

  it('reads a time range like "3 to 4 pm"', () => {
    const r = parseTodoistInput('Review 3 to 4 pm');
    expect(r.startTime).toBe('15:00');
    expect(r.endTime).toBe('16:00');
    expect(r.cleanTitle).toBe('Review');
  });

  it('never returns an empty title for blank input', () => {
    expect(() => parseTodoistInput('   ')).not.toThrow();
  });

  it('does not read plain number ranges as times ("pages 10-20")', () => {
    for (const text of ['Read pages 10-20', 'Read pages 10 to 20', 'Chapters 3-4']) {
      const r = parseTodoistInput(text);
      expect(r.startTime).toBeUndefined();
      expect(r.endTime).toBeUndefined();
      expect(r.cleanTitle).toBe(text);
    }
  });

  it('still reads ranges that say they are times', () => {
    expect(parseTodoistInput('Standup 9:30-10:00')).toMatchObject({ startTime: '09:30', endTime: '10:00' });
    expect(parseTodoistInput('Lunch from 12 to 1pm')).toMatchObject({ startTime: '12:00', endTime: '13:00' });
    expect(parseTodoistInput('Gym 6-7pm')).toMatchObject({ startTime: '18:00', endTime: '19:00' });
  });

  it('never produces an end before the start', () => {
    const r = parseTodoistInput('Party 11pm to 1am');
    expect(r.startTime).toBe('23:00');
    expect(r.endTime).toBe('23:59');
    const late = parseTodoistInput('Call at 11pm');
    expect(late.endTime).toBe('23:59');
  });

  it('keeps "in N weeks" to a sane, valid date', () => {
    const huge = parseTodoistInput('Renew in 99999999 weeks');
    expect(huge.dueDate).toBeUndefined();
    const far = parseTodoistInput('Renew in 999 weeks');
    expect(far.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number(far.dueDate!.slice(0, 4))).toBeLessThan(2100);
  });
});

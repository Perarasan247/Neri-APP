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
});

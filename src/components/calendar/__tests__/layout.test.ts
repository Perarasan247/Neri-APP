import { assignLanes, fromMinutes, isAllDayTask, taskSpan, toMinutes } from '@/components/calendar/layout';

describe('time conversion', () => {
  it('converts HH:MM and HH:MM:SS to minutes', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(toMinutes('23:59:00')).toBe(1439);
    expect(toMinutes('')).toBeNaN();
    expect(toMinutes('abc')).toBeNaN();
  });

  it('clamps minutes into the day', () => {
    expect(fromMinutes(0)).toBe('00:00');
    expect(fromMinutes(75)).toBe('01:15');
    expect(fromMinutes(5000)).toBe('23:59');
    expect(fromMinutes(-10)).toBe('00:00');
  });
});

describe('task placement', () => {
  it('puts untimed tasks in the all-day row', () => {
    expect(isAllDayTask({ is_all_day: true, start_time: '09:00' })).toBe(true);
    expect(isAllDayTask({ is_all_day: false })).toBe(true);
    expect(isAllDayTask({ is_all_day: false, start_time: '09:00' })).toBe(false);
    expect(isAllDayTask({ is_all_day: false, due_time: '09:00' })).toBe(false);
  });

  it('defaults to one hour and never runs past midnight', () => {
    expect(taskSpan({ start_time: '09:00' })).toEqual({ start: 540, end: 600 });
    expect(taskSpan({ start_time: '09:00', end_time: '10:30' })).toEqual({ start: 540, end: 630 });
    expect(taskSpan({ start_time: '09:00', end_time: '08:00' })).toEqual({ start: 540, end: 600 }); // end before start
    expect(taskSpan({ start_time: '23:30' }).end).toBe(1440);
  });
});

describe('assignLanes', () => {
  const lanesOf = (items: { id: string; start: number; end: number }[]) =>
    Object.fromEntries(assignLanes(items).map((p) => [p.id, [p.lane, p.lanes]]));

  it('keeps separate events full width', () => {
    expect(lanesOf([{ id: 'a', start: 0, end: 60 }, { id: 'b', start: 60, end: 120 }])).toEqual({ a: [0, 1], b: [0, 1] });
  });

  it('splits overlapping events into side-by-side lanes', () => {
    expect(lanesOf([{ id: 'a', start: 0, end: 90 }, { id: 'b', start: 30, end: 120 }])).toEqual({ a: [0, 2], b: [1, 2] });
  });

  it('reuses a free lane inside one cluster', () => {
    // a and b overlap; c starts after a ends but still overlaps b → c reuses a's lane
    expect(
      lanesOf([
        { id: 'a', start: 0, end: 60 },
        { id: 'b', start: 30, end: 150 },
        { id: 'c', start: 70, end: 120 },
      ]),
    ).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2] });
  });

  it('does not let one busy cluster narrow a later, separate event', () => {
    const r = lanesOf([
      { id: 'a', start: 0, end: 60 },
      { id: 'b', start: 0, end: 60 },
      { id: 'c', start: 200, end: 260 },
    ]);
    expect(r.c).toEqual([0, 1]);
  });
});

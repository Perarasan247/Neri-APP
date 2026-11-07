import { chunk, columnsFor, describeLayout, sizeClassFor, staggerDelay } from '../responsive';

describe('sizeClassFor', () => {
  it('maps widths to size classes at the breakpoints', () => {
    expect(sizeClassFor(0)).toBe('compact');
    expect(sizeClassFor(320)).toBe('compact');
    expect(sizeClassFor(359.9)).toBe('compact');
    expect(sizeClassFor(360)).toBe('regular');
    expect(sizeClassFor(393)).toBe('regular');
    expect(sizeClassFor(414)).toBe('large');
    expect(sizeClassFor(430)).toBe('large');
    expect(sizeClassFor(600)).toBe('tablet');
    expect(sizeClassFor(840)).toBe('tablet');
    expect(sizeClassFor(900)).toBe('wide');
    expect(sizeClassFor(1366)).toBe('wide');
  });
});

describe('describeLayout', () => {
  it('uses the full width with a tight gutter on small phones', () => {
    const l = describeLayout(320, 568);
    expect(l.sizeClass).toBe('compact');
    expect(l.isCompact).toBe(true);
    expect(l.isTablet).toBe(false);
    expect(l.gutter).toBe(12);
    expect(l.contentMaxWidth).toBeUndefined();
    expect(l.contentWidth).toBe(296);
    expect(l.landscape).toBe(false);
  });

  it('caps and centres the content column on tablets', () => {
    const l = describeLayout(1024, 768);
    expect(l.sizeClass).toBe('wide');
    expect(l.isTablet).toBe(true);
    expect(l.contentMaxWidth).toBe(960);
    expect(l.contentWidth).toBe(960 - 64);
    expect(l.landscape).toBe(true);
  });

  it('does not cap a tablet narrower than its max width', () => {
    const l = describeLayout(640, 900);
    expect(l.contentMaxWidth).toBe(720);
    expect(l.contentWidth).toBe(640 - 48);
  });

  it('scales sizes gently by class', () => {
    expect(describeLayout(320, 600).scale(56)).toBe(50);
    expect(describeLayout(390, 800).scale(56)).toBe(56);
    expect(describeLayout(800, 1200).scale(56)).toBe(60);
  });

  it('never reports a negative width', () => {
    expect(describeLayout(-10, 0).contentWidth).toBe(0);
  });
});

describe('columnsFor', () => {
  it('fits as many minimum-width items as possible', () => {
    expect(columnsFor(358, 150, 8)).toBe(2);
    expect(columnsFor(296, 150, 8)).toBe(1);
    expect(columnsFor(896, 150, 8)).toBe(5);
  });
  it('respects the maximum and never goes below one', () => {
    expect(columnsFor(896, 150, 8, 4)).toBe(4);
    expect(columnsFor(10, 150, 8)).toBe(1);
    expect(columnsFor(100, 0)).toBe(1);
  });
});

describe('chunk', () => {
  it('splits into rows of the column count', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]);
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('staggerDelay', () => {
  it('grows per item and caps', () => {
    expect(staggerDelay(0)).toBe(0);
    expect(staggerDelay(2)).toBe(70);
    expect(staggerDelay(50)).toBe(280);
    expect(staggerDelay(-1)).toBe(0);
    expect(staggerDelay(3, 20, 2)).toBe(40);
  });
});

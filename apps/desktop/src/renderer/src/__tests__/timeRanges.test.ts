import { describe, it, expect } from 'vitest';
import { toRanges, inRange, formatRange } from '../utils/timeRanges';

describe('timeRanges', () => {
  it('merges consecutive seconds and splits on gaps', () => {
    expect(toRanges([7, 0, 1, 2, 3, 4, 8, 9, 10, 15])).toEqual([
      { start: 0, end: 4 },
      { start: 7, end: 10 },
      { start: 15, end: 15 },
    ]);
    expect(toRanges([])).toEqual([]);
    expect(toRanges(undefined)).toEqual([]);
  });

  it('covers start to end + 1 and formats', () => {
    const r = { start: 0, end: 10 };
    expect(inRange(r, 10.5)).toBe(true);
    expect(inRange(r, 11)).toBe(false);
    expect(formatRange(r)).toBe('0:00–0:10');
    expect(formatRange({ start: 65, end: 65 })).toBe('1:05');
  });
});

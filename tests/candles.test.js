import { describe, it, expect } from 'vitest';
import { tdValuesToCandles } from '../src/lib/candles.js';

const VALS = [
  { datetime: '2026-01-02', open: '10.5', high: '11', low: '10', close: '10.8', volume: '1000' },
  { datetime: '2026-01-05', open: '10.8', high: '12', low: '10.7', close: '11.9', volume: '2500' },
];

describe('tdValuesToCandles', () => {
  it('maps TD values to the synthetic candle shape', () => {
    const c = tdValuesToCandles(VALS);
    expect(c.s).toBe('ok');
    expect(c.t).toEqual([
      Math.floor(new Date('2026-01-02T00:00:00Z').getTime() / 1000),
      Math.floor(new Date('2026-01-05T00:00:00Z').getTime() / 1000),
    ]);
    expect(c.o).toEqual([10.5, 10.8]);
    expect(c.h).toEqual([11, 12]);
    expect(c.l).toEqual([10, 10.7]);
    expect(c.c).toEqual([10.8, 11.9]);
    expect(c.v).toEqual([1000, 2500]);
  });

  it('preserves input order (oldest-first passthrough, no sorting)', () => {
    const rev = [...VALS].reverse();
    expect(tdValuesToCandles(rev).c).toEqual([11.9, 10.8]);
  });

  it('parses like the legacy inline code: bad numerics become NaN, not null', () => {
    const c = tdValuesToCandles([{ datetime: '2026-01-02', open: 'x', high: '1', low: '1', close: '1', volume: 'y' }]);
    expect(Number.isNaN(c.o[0])).toBe(true);
    expect(Number.isNaN(c.v[0])).toBe(true);
  });

  it('returns null on empty or missing input', () => {
    expect(tdValuesToCandles([])).toBeNull();
    expect(tdValuesToCandles(null)).toBeNull();
  });
});

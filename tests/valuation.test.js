import { describe, it, expect } from 'vitest';
import { computePEG, trimValuationSeries, valuationVsHistory, valuationTone } from '../src/lib/valuation.js';

describe('computePEG', () => {
  it('returns null when inputs are missing or non-positive', () => {
    expect(computePEG(null, 20)).toBeNull();
    expect(computePEG(20, null)).toBeNull();
    expect(computePEG(20, 0)).toBeNull();   // can't divide by zero growth
    expect(computePEG(20, -10)).toBeNull(); // negative growth → PEG undefined
    expect(computePEG(-5, 20)).toBeNull();  // negative P/E → meaningless
  });

  it('computes PEG = P/E ÷ growth%', () => {
    expect(computePEG(30, 30)).toBeCloseTo(1.0, 5);
    expect(computePEG(20, 40)).toBeCloseTo(0.5, 5);
    expect(computePEG(60, 20)).toBeCloseTo(3.0, 5);
  });

  it('rounds to two decimals', () => {
    // 25 / 17 = 1.470... → 1.47
    expect(computePEG(25, 17)).toBe(1.47);
  });
});

// Finnhub series shape: { quarterly: { peTTM: [{ period, v }] }, annual: { pe: [...] } }, newest first.
const quarters = (vals, end = 2026) => vals.map((v, i) => {
  const m = 12 - (i % 4) * 3, y = end - Math.floor(i / 4);
  return { period: `${y}-${String(m).padStart(2, '0')}-30`, v };
});

describe('trimValuationSeries', () => {
  it('keeps only P/E and P/S, quarterly first, newest first, capped', () => {
    const series = { quarterly: { peTTM: quarters(Array(40).fill(20)), roeTTM: quarters([1, 2]) }, annual: { ps: quarters([5, 6, 7, 8]) } };
    const t = trimValuationSeries(series);
    expect(Object.keys(t).sort()).toEqual(['pe', 'ps']);
    expect(t.pe).toHaveLength(24);
    expect(t.pe[0].period > t.pe[1].period).toBe(true);
  });
  it('returns an empty object for a missing or malformed series', () => {
    expect(trimValuationSeries(undefined)).toEqual({});
    expect(trimValuationSeries({ quarterly: { peTTM: [{ period: 1, v: 'x' }] } })).toEqual({ pe: [] });
  });
});

describe('valuationVsHistory', () => {
  const history = { pe: quarters([40, 42, 44, 46, 48, 50, 45, 45]), ps: quarters([10, 10, 10]) };
  it('compares the current multiple with its own median', () => {
    const v = valuationVsHistory({ peTTM: 30, psTTM: 9 }, history);
    expect(v.pe).toMatchObject({ now: 30, median: 45, pct: -33 });
    expect(v.ps).toBeNull(); // fewer than 4 points
  });
  it('ignores loss-year (≤ 0) multiples and points older than the window', () => {
    const h = { pe: [...quarters([-5, 20, 20, 20, 20]), { period: '2010-12-30', v: 900 }] };
    expect(valuationVsHistory({ peTTM: 20 }, h).pe).toMatchObject({ median: 20, n: 4 });
  });
  it('is null without history or a positive current multiple', () => {
    expect(valuationVsHistory({ peTTM: 30 }, null)).toBeNull();
    expect(valuationVsHistory({ peTTM: -4 }, history)).toBeNull();
  });
  it('tones cheap / normal / rich at ±15%', () => {
    expect(valuationTone(-33)).toBe('good');
    expect(valuationTone(5)).toBe('waiting');
    expect(valuationTone(20)).toBe('caution');
  });
});

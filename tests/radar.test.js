import { describe, it, expect } from 'vitest';
import { computeRadar } from '../src/lib/radar.js';

// Fixture builder. Defaults pass BOTH gates with a SOON pullback.
function ticker(symbol, o = {}) {
  const {
    readiness = 'SOON', setupType = 'pullback', setupScore = 6, etaWeeks = 2,
    rs3m = 5, revGrowth = 20, pe = 20, epsGrowth = 30,
    hasMetrics = true, hasRs = true, hasSetups = true, anchors = undefined,
    price = 80, adx = null, swingLows = [],
  } = o;
  const data = { quote: { data: { c: price } }, indicators: { adx, swingLows } };
  if (hasSetups) {
    const active = { score: setupScore, readiness, etaWeeks };
    const idle = { score: 0, readiness: 'WAIT', etaWeeks: null };
    data.setups = {
      pullback: setupType === 'pullback' ? active : idle,
      momentum: setupType === 'momentum' ? active : idle,
    };
  }
  if (hasRs) data.rs = { rs1m: rs3m, rs3m };
  if (hasMetrics) {
    data.metrics = { data: { metric: {
      revenueGrowthTTMYoy: revGrowth,
      peNormalizedAnnual: pe,
      epsGrowthTTMYoy: epsGrowth,
    } } };
  }
  if (anchors) data.anchors = anchors;
  return { symbol, data };
}

describe('computeRadar', () => {
  it('includes a name passing both gates', () => {
    const out = computeRadar([ticker('AAA')]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe('AAA');
    expect(out[0].setupType).toBe('PULLBACK');
    expect(out[0].readiness).toBe('SOON');
    expect(out[0].peg).toBeCloseTo(20 / 30, 1); // computePEG rounds to 2 dp (0.67)
    expect(out[0].rsRank).toBe(1);
    expect(out[0].rsTotal).toBe(1);
  });

  it('excludes an active setup that fails the quality gate (rs3m <= 0)', () => {
    expect(computeRadar([ticker('AAA', { rs3m: -2 })])).toHaveLength(0);
  });

  it('excludes a great company with only WAIT readiness', () => {
    const t = ticker('AAA');
    t.data.setups.pullback.readiness = 'WAIT';
    expect(computeRadar([t])).toHaveLength(0);
  });

  it('includes when PEG is null (non-positive eps growth) but rev+rs pass', () => {
    const out = computeRadar([ticker('AAA', { epsGrowth: -5 })]);
    expect(out).toHaveLength(1);
    expect(out[0].peg).toBeNull();
  });

  it('excludes when PEG >= 3', () => {
    expect(computeRadar([ticker('AAA', { pe: 60, epsGrowth: 10 })])).toHaveLength(0);
  });

  it('excludes when rs or metrics are missing', () => {
    expect(computeRadar([ticker('AAA', { hasRs: false })])).toHaveLength(0);
    expect(computeRadar([ticker('AAA', { hasMetrics: false })])).toHaveLength(0);
  });

  it('ranks ACT before SOON, then by setupScore', () => {
    const out = computeRadar([
      ticker('SOONLOW', { readiness: 'SOON', setupScore: 9, rs3m: 4 }),
      ticker('ACTONE',  { readiness: 'ACT',  setupScore: 5, rs3m: 4 }),
      ticker('SOONHI',  { readiness: 'SOON', setupScore: 8, rs3m: 4 }),
    ]);
    expect(out.map(h => h.symbol)).toEqual(['ACTONE', 'SOONLOW', 'SOONHI']);
  });

  it('returns [] for empty input', () => {
    expect(computeRadar([])).toEqual([]);
  });

  it('passes through ADX', () => {
    const out = computeRadar([ticker('AAA', { adx: 28 })]);
    expect(out[0].adx).toBe(28);
  });

  it('flags when price has broken the most recent swing-low support', () => {
    const out = computeRadar([ticker('AAA', { price: 60, swingLows: [{ price: 65, barsAgo: 10 }] })]);
    expect(out[0].support.belowSupport).toBe(true);
    expect(out[0].support.nearestSupport).toBe(65);
  });

  it('does not flag when price holds above the most recent swing low', () => {
    const out = computeRadar([ticker('AAA', { price: 80, swingLows: [{ price: 65, barsAgo: 10 }] })]);
    expect(out[0].support.belowSupport).toBe(false);
  });

  it('degrades gracefully with no swing lows or ADX', () => {
    const out = computeRadar([ticker('AAA')]);
    expect(out[0].adx).toBe(null);
    expect(out[0].support).toEqual({ belowSupport: false, nearestSupport: null });
  });

  it('computes whole-watchlist RS rank by rs3m', () => {
    const out = computeRadar([
      ticker('LOW',  { rs3m: 2 }),
      ticker('HIGH', { rs3m: 9 }),
    ]);
    const bySym = Object.fromEntries(out.map(h => [h.symbol, h]));
    expect(bySym.HIGH.rsRank).toBe(1);
    expect(bySym.LOW.rsRank).toBe(2);
    expect(bySym.HIGH.rsTotal).toBe(2);
  });
});

describe('radar anchor readiness nudge', () => {
  it('bumps WATCH to SOON when AVWAP reclaimed and POC not below', () => {
    const t = ticker('AAA', { readiness: 'WATCH', anchors: { avwap: { reclaimed: true }, poc: { position: 'above' } } });
    expect(computeRadar([t])[0].readiness).toBe('SOON');
  });

  it('bumps SOON to ACT', () => {
    const t = ticker('AAA', { readiness: 'SOON', anchors: { avwap: { reclaimed: true }, poc: { position: 'inside' } } });
    expect(computeRadar([t])[0].readiness).toBe('ACT');
  });

  it('does not nudge when POC is below', () => {
    const t = ticker('AAA', { readiness: 'WATCH', anchors: { avwap: { reclaimed: true }, poc: { position: 'below' } } });
    expect(computeRadar([t])[0].readiness).toBe('WATCH');
  });

  it('does not nudge when AVWAP not reclaimed', () => {
    const t = ticker('AAA', { readiness: 'WATCH', anchors: { avwap: { reclaimed: false }, poc: { position: 'above' } } });
    expect(computeRadar([t])[0].readiness).toBe('WATCH');
  });

  it('is a no-op when anchors are absent', () => {
    expect(computeRadar([ticker('AAA', { readiness: 'WATCH' })])[0].readiness).toBe('WATCH');
  });
});

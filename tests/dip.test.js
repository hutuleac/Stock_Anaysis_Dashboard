import { describe, it, expect } from 'vitest';
import { computeDipRadar } from '../src/lib/dip.js';

// Fully-qualifying deep-dip ticker; tests knock out one dimension at a time.
function makeTicker(overrides = {}) {
  return {
    symbol: 'TEST',
    data: {
      quote: { data: { c: 80 } },
      metrics: { data: { metric: {
        epsGrowthTTMYoy: 15, revenueGrowthTTMYoy: 10, netProfitMarginTTM: 12,
        peNormalizedAnnual: 20, '52WeekHigh': 120, '52WeekLow': 70,
        '50DayMovingAverage': 90, '200DayMovingAverage': 95,
      } } },
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true },
      smartMoney: { data: { rec: { buyRatio: 0.7, deteriorating: false }, mspr3m: 12 } },
      ...overrides,
    },
  };
}
const FEAR = { fearGreedValue: 20, spyBelowEma50: true };
const GREED = { fearGreedValue: 80, spyBelowEma50: false };

describe('computeDipRadar quality gate', () => {
  it('includes a qualifying deep dip at ACT', () => {
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(hits.length).toBe(1);
    expect(hits[0].readiness).toBe('ACT');
    expect(hits[0].score).toBe(10);
  });

  for (const [name, patch] of [
    ['negative EPS growth', { epsGrowthTTMYoy: -5 }],
    ['missing EPS growth', { epsGrowthTTMYoy: null }],
    ['negative revenue growth', { revenueGrowthTTMYoy: -2 }],
    ['unprofitable', { netProfitMarginTTM: -3 }],
    ['PEG too high', { peNormalizedAnnual: 90, epsGrowthTTMYoy: 25 }],
  ]) {
    it(`excludes: ${name}`, () => {
      const t = makeTicker();
      Object.assign(t.data.metrics.data.metric, patch);
      expect(computeDipRadar([t], FEAR).length).toBe(0);
    });
  }

  it('excludes tickers without a quote', () => {
    const t = makeTicker({ quote: { data: null } });
    expect(computeDipRadar([t], FEAR).length).toBe(0);
  });
});

describe('dip score components', () => {
  const comp = (hits, label) => hits[0].components.find(c => c.label === label);

  it('never returns ACT without a fear component', () => {
    const hits = computeDipRadar([makeTicker()], GREED);
    expect(hits.length).toBe(1);
    expect(hits[0].readiness).not.toBe('ACT');
  });

  it('degrades gracefully with F&G and smart money missing', () => {
    const t = makeTicker({ smartMoney: null });
    const hits = computeDipRadar([t], { fearGreedValue: null, spyBelowEma50: null });
    expect(hits.length).toBe(1); // oversold + drawdown alone still qualify
    expect(comp(hits, 'Market Fear').score).toBe(0);
    expect(comp(hits, 'Market Fear').detail).toBe('n/a');
    const sm = comp(hits, 'Smart Money');
    expect(sm.score).toBe(0);
    expect(sm.detail).toBe('n/a');
  });

  it('hides shallow dips (score < 3)', () => {
    const t = makeTicker({
      indicators: { rsi: 55, rsiZScore: 0.2, roc20: 1, roc60: 4, oversoldConfluence: false },
      smartMoney: null,
    });
    expect(computeDipRadar([t], GREED).length).toBe(0);
  });

  it('scores RSI tiers: <30 → 1.5, <35 → 1.0, <40 → 0.5', () => {
    for (const [rsi, expected] of [[29, 1.5], [34, 1.0], [39, 0.5], [45, 0]]) {
      const t = makeTicker({
        indicators: { rsi, rsiZScore: 0, roc20: 0, roc60: 0, oversoldConfluence: false },
        smartMoney: null,
      });
      const hits = computeDipRadar([t], FEAR); // fear keeps score ≥ 3 threshold irrelevant here
      if (hits.length) expect(comp(hits, 'Oversold').score).toBe(expected);
    }
  });

  it('scores F&G tiers: <25 → 2, <35 → 1.5, <45 → 0.75 (+0.5 SPY)', () => {
    for (const [fg, spy, expected] of [[20, false, 2], [30, false, 1.5], [40, false, 0.75], [60, false, 0], [20, true, 2.5]]) {
      const hits = computeDipRadar([makeTicker()], { fearGreedValue: fg, spyBelowEma50: spy });
      expect(comp(hits, 'Market Fear').score).toBe(expected);
    }
  });

  it('scores drawdown tiers and caps at 2.5', () => {
    // roc60 −18 → 1.25, roc20 −7 → 0.5, range pos 0.2 → 0.75 = 2.5
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(comp(hits, 'Drawdown').score).toBe(2.5);
    const mild = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: 0, roc60: -9, oversoldConfluence: true },
    });
    mild.data.metrics.data.metric['52WeekLow'] = 20; // range pos (80-20)/100 = 0.6 → no bonus
    const h2 = computeDipRadar([mild], FEAR);
    expect(comp(h2, 'Drawdown').score).toBe(0.75);
  });

  it('smart money: insider buying + analyst buys = 2; deteriorating recs drop 1', () => {
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(comp(hits, 'Smart Money').score).toBe(2);
    const det = makeTicker({
      smartMoney: { data: { rec: { buyRatio: 0.7, deteriorating: true }, mspr3m: 12 } },
    });
    expect(comp(computeDipRadar([det], FEAR), 'Smart Money').score).toBe(1);
  });

  it('sorts by readiness then score', () => {
    const deep = makeTicker();
    const mild = makeTicker({
      indicators: { rsi: 38, rsiZScore: -0.5, roc20: -3, roc60: -9, oversoldConfluence: false },
    });
    mild.symbol = 'MILD';
    const hits = computeDipRadar([mild, deep], FEAR);
    expect(hits.length).toBe(2);
    expect(hits[0].symbol).toBe('TEST');
  });

  it('returns [] on empty/invalid input', () => {
    expect(computeDipRadar([], FEAR)).toEqual([]);
    expect(computeDipRadar(null, FEAR)).toEqual([]);
  });
});

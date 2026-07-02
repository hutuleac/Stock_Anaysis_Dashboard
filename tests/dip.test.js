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
        peNormalizedAnnual: 10, '52WeekHigh': 120, '52WeekLow': 78,
        '50DayMovingAverage': 90, '200DayMovingAverage': 95,
      } } },
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true, macdCrossover: 'bullish_cross' },
      smartMoney: { data: { rec: { buyRatio: 0.7, deteriorating: false }, mspr3m: 12 } },
      rs: { rs3m: -10 },
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
    expect(hits.length).toBe(1); // other components still qualify
    expect(comp(hits, 'Market Fear').score).toBe(0);
    expect(comp(hits, 'Market Fear').detail).toBe('n/a');
    const sm = comp(hits, 'Smart Money');
    expect(sm.score).toBe(0);
    expect(sm.detail).toBe('n/a');
  });

  it('hides shallow dips (score < 3)', () => {
    const t = makeTicker({
      indicators: { rsi: 55, rsiZScore: 0.2, roc20: 1, roc60: 4, oversoldConfluence: false, macdCrossover: null },
      smartMoney: null,
      rs: { rs3m: 10 },
    });
    t.data.metrics.data.metric.peNormalizedAnnual = 40; // PEG 2.67 — gate-passing but no Value bonus
    t.data.metrics.data.metric['52WeekLow'] = 10; // far from price — no 52w-Low bonus
    expect(computeDipRadar([t], GREED).length).toBe(0);
  });

  it('scores RSI tiers: <30 → 1.0, <35 → 0.7, <40 → 0.3', () => {
    for (const [rsi, expected] of [[29, 1.0], [34, 0.7], [39, 0.3], [45, 0]]) {
      const t = makeTicker({
        indicators: { rsi, rsiZScore: 0, roc20: 0, roc60: 0, oversoldConfluence: false },
        smartMoney: null,
      });
      const hits = computeDipRadar([t], FEAR); // fear keeps score ≥ 3 threshold irrelevant here
      if (hits.length) expect(comp(hits, 'Oversold').score).toBe(expected);
    }
  });

  it('scores F&G tiers: <25 → 1.2, <35 → 0.9, <45 → 0.45 (+0.3 SPY)', () => {
    for (const [fg, spy, expected] of [[20, false, 1.2], [30, false, 0.9], [40, false, 0.45], [60, false, 0], [20, true, 1.5]]) {
      const hits = computeDipRadar([makeTicker()], { fearGreedValue: fg, spyBelowEma50: spy });
      expect(comp(hits, 'Market Fear').score).toBe(expected);
    }
  });

  it('scores drawdown tiers and caps at 1.0', () => {
    // roc60 −18 → 0.6, roc20 −7 → 0.4 = 1.0
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(comp(hits, 'Drawdown').score).toBe(1.0);
    const mild = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: 0, roc60: -9, oversoldConfluence: true },
    });
    const h2 = computeDipRadar([mild], FEAR);
    expect(comp(h2, 'Drawdown').score).toBe(0.3);
  });

  it('scores 52w-low proximity tiers', () => {
    for (const [low, expected] of [[78, 1.0], [68, 0.7], [55, 0.4], [20, 0]]) {
      const t = makeTicker();
      t.data.metrics.data.metric['52WeekLow'] = low;
      const hits = computeDipRadar([t], FEAR);
      expect(comp(hits, '52w Low').score).toBe(expected);
    }
  });

  it('turn: MACD bullish cross scores 1.0, otherwise 0', () => {
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(comp(hits, 'Turn').score).toBe(1.0);
    expect(comp(hits, 'Turn').detail).toBe('MACD bull cross');
    const noCross = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true, macdCrossover: null },
    });
    const h2 = computeDipRadar([noCross], FEAR);
    expect(comp(h2, 'Turn').score).toBe(0);
    expect(comp(h2, 'Turn').detail).toBe('no turn yet');
  });

  it('relative strength: rewards mild underperformance, not extreme or positive', () => {
    for (const [rs3m, expected] of [[-10, 1.0], [-15, 1.0], [-5, 1.0], [-3, 0.4], [-20, 0], [5, 0]]) {
      const t = makeTicker({ rs: { rs3m } });
      const hits = computeDipRadar([t], FEAR);
      expect(comp(hits, 'Rel. Strength').score).toBe(expected);
    }
  });

  it('value: PEG < 1 → 1.0, < 1.5 → 0.7, < 2 → 0.4, else 0', () => {
    for (const [pe, expected] of [[10, 1.0], [18, 0.7], [25, 0.4], [35, 0]]) {
      const t = makeTicker();
      t.data.metrics.data.metric.peNormalizedAnnual = pe; // eps growth 15 → PEG = pe/15
      const hits = computeDipRadar([t], FEAR);
      expect(comp(hits, 'Value').score).toBe(expected);
    }
  });

  it('smart money: insider buying + analyst buys = 1.5; deteriorating recs drop 0.75', () => {
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(comp(hits, 'Smart Money').score).toBe(1.5);
    const det = makeTicker({
      smartMoney: { data: { rec: { buyRatio: 0.7, deteriorating: true }, mspr3m: 12 } },
    });
    expect(comp(computeDipRadar([det], FEAR), 'Smart Money').score).toBe(0.75);
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

import { describe, it, expect } from 'vitest';
import { scoreEtfEntry, scoreEtfExit, computeEtfSignals, generateEtfThesis } from '../src/lib/etf.js';

const comp = (res, label) => res.components.find(c => c.label === label);

// Fully-loaded entry inputs; tests knock out one dimension at a time.
const ENTRY_MAX = {
  rsiW: 28, belowLowerBB: true,
  rs3m: -12, groupMedianRs3m: 0,
  macdCross: 'bullish_cross', divergence: { type: 'BULL', strength: 1, barsAgo: 2 },
  drawdownPct: 22,
};

describe('scoreEtfEntry', () => {
  it('maxes at 10 with all signals firing', () => {
    const r = scoreEtfEntry(ENTRY_MAX);
    expect(r.score).toBe(10);
    expect(r.readiness).toBe('ACT');
  });

  it('component maxes sum to 10', () => {
    const r = scoreEtfEntry(ENTRY_MAX);
    expect(r.components.reduce((s, c) => s + c.max, 0)).toBe(10);
  });

  it('oversold caps at 3 even with RSI<30 plus BB touch', () => {
    expect(comp(scoreEtfEntry(ENTRY_MAX), 'Oversold').score).toBe(3);
  });

  it('mid oversold: RSI 33 without BB touch scores 1.5', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, rsiW: 33, belowLowerBB: false });
    expect(comp(r, 'Oversold').score).toBe(1.5);
  });

  it('rotation: extreme underperformance (rs3m < -25) zeroes the component', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, rs3m: -30 });
    expect(comp(r, 'Rotation').score).toBe(0);
  });

  it('rotation: mild lag vs SPY and group scores partial', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, rs3m: -4, groupMedianRs3m: 1 });
    // vs SPY -4 → 0.5; median gap 5 → 1.0
    expect(comp(r, 'Rotation').score).toBe(1.5);
  });

  it('turn: divergence alone scores 1', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, macdCross: null });
    expect(comp(r, 'Turn').score).toBe(1);
  });

  it('null inputs degrade to WAIT, not crash', () => {
    const r = scoreEtfEntry({ rsiW: null, belowLowerBB: null, rs3m: null,
      groupMedianRs3m: null, macdCross: null, divergence: null, drawdownPct: null });
    expect(r.score).toBe(0);
    expect(r.readiness).toBe('WAIT');
  });
});

const EXIT_MAX = { rsiW: 76, extensionPct: 26, rs1m: -3, rs3m: 8, volumeRatio: 2.2 };

describe('scoreEtfExit', () => {
  it('maxes at 10 with all signals firing', () => {
    const r = scoreEtfExit(EXIT_MAX);
    expect(r.score).toBe(10);
    expect(r.readiness).toBe('ACT');
  });

  it('component maxes sum to 10', () => {
    expect(scoreEtfExit(EXIT_MAX).components.reduce((s, c) => s + c.max, 0)).toBe(10);
  });

  it('overbought tiers: RSI 68 scores 1', () => {
    expect(comp(scoreEtfExit({ ...EXIT_MAX, rsiW: 68 }), 'Overbought').score).toBe(1);
  });

  it('rotation loss: mild fade (rs1m<0, rs3m>0 but rs1m>-2) scores 1', () => {
    expect(comp(scoreEtfExit({ ...EXIT_MAX, rs1m: -1 }), 'Rotation Loss').score).toBe(1);
  });

  it('climax volume ignored when weekly RSI < 60', () => {
    expect(comp(scoreEtfExit({ ...EXIT_MAX, rsiW: 55 }), 'Climax Vol').score).toBe(0);
  });

  it('calm market scores near zero → WAIT', () => {
    const r = scoreEtfExit({ rsiW: 50, extensionPct: 3, rs1m: 1, rs3m: 2, volumeRatio: 1 });
    expect(r.score).toBe(0);
    expect(r.readiness).toBe('WAIT');
  });
});

// ── Integration through computeEtfSignals ────────────────────────────────
// Synthetic weekly raw builder (Finnhub-style, oldest-first)
function makeWeekly(closes, volumes = null) {
  return {
    s: 'ok',
    t: closes.map((_, i) => 1600000000 + i * 604800),
    o: closes.map(c => c),
    h: closes.map(c => c * 1.01),
    l: closes.map(c => c * 0.99),
    c: [...closes],
    v: volumes ?? closes.map(() => 1000),
  };
}
// Daily closes: n bars, linear from `start` to `end`
function ramp(start, end, n) {
  return Array.from({ length: n }, (_, i) => start + (end - start) * (i / (n - 1)));
}

describe('computeEtfSignals', () => {
  it('returns null for a proxy with <20 weekly bars', () => {
    const out = computeEtfSignals(
      [{ proxy: 'SMH', weeklyRaw: makeWeekly(ramp(100, 90, 10)), dailyCloses: ramp(100, 90, 100) }],
      ramp(100, 100, 100),
    );
    expect(out.SMH).toBeNull();
  });

  it('downtrending ETF vs flat SPY gets a higher entry than exit score', () => {
    const daily = ramp(100, 70, 252);           // −30% over a year, oversold
    const weekly = makeWeekly(ramp(100, 70, 52));
    const spy = ramp(100, 100, 252);            // flat benchmark
    const out = computeEtfSignals([{ proxy: 'XLE', weeklyRaw: weekly, dailyCloses: daily }], spy);
    expect(out.XLE).not.toBeNull();
    expect(out.XLE.entry.score).toBeGreaterThan(out.XLE.exit.score);
    expect(out.XLE.rs.rs3m).toBeLessThan(0);
  });

  it('parabolic ETF vs flat SPY gets a higher exit than entry score', () => {
    const daily = [...ramp(100, 110, 192), ...ramp(110, 180, 60)]; // late vertical run
    const weekly = makeWeekly([...ramp(100, 110, 40), ...ramp(110, 180, 12)]);
    const spy = ramp(100, 100, 252);
    const out = computeEtfSignals([{ proxy: 'SMH', weeklyRaw: weekly, dailyCloses: daily }], spy);
    expect(out.SMH.exit.score).toBeGreaterThan(out.SMH.entry.score);
  });

  it('computes group median rs3m across proxies', () => {
    const spy = ramp(100, 100, 252);
    const mk = (endVal) => ({
      weeklyRaw: makeWeekly(ramp(100, endVal, 52)),
      dailyCloses: ramp(100, endVal, 252),
    });
    const out = computeEtfSignals([
      { proxy: 'A', ...mk(120) }, { proxy: 'B', ...mk(100) }, { proxy: 'C', ...mk(80) },
    ], spy);
    expect(out.B.groupMedianRs3m).toBeCloseTo(out.B.rs.rs3m, 0);
  });

  it('handles missing spyCloses (rs null, rotation components 0)', () => {
    const out = computeEtfSignals(
      [{ proxy: 'QQQ', weeklyRaw: makeWeekly(ramp(100, 90, 52)), dailyCloses: ramp(100, 90, 252) }],
      null,
    );
    expect(out.QQQ.rs.rs3m).toBeNull();
    expect(comp(out.QQQ.entry, 'Rotation').score).toBe(0);
  });
});

describe('computeEtfSignals display indicators (v0.17)', () => {
  const spy = ramp(100, 100, 252);

  it('uptrending ETF: UPTREND, high range position, positive roc13w, wRsi > 50', () => {
    const out = computeEtfSignals(
      [{ proxy: 'QQQ', weeklyRaw: makeWeekly(ramp(100, 150, 52)), dailyCloses: ramp(100, 150, 252) }], spy);
    const ind = out.QQQ.indicators;
    expect(ind.trendState).toBe('UPTREND');
    expect(ind.rangePos52w).toBeGreaterThan(90);
    expect(ind.roc13w).toBeGreaterThan(0);
    expect(ind.wRsi).toBeGreaterThan(50);
  });

  it('downtrending ETF: DOWNTREND near its 52w low with negative roc13w', () => {
    const out = computeEtfSignals(
      [{ proxy: 'XLE', weeklyRaw: makeWeekly(ramp(100, 70, 52)), dailyCloses: ramp(100, 70, 252) }], spy);
    const ind = out.XLE.indicators;
    expect(ind.trendState).toBe('DOWNTREND');
    expect(ind.rangePos52w).toBeLessThan(10);
    expect(ind.roc13w).toBeLessThan(0);
  });

  it('flat series: no 52w range → rangePos52w null, trendState BASING', () => {
    const out = computeEtfSignals(
      [{ proxy: 'SPY', weeklyRaw: makeWeekly(ramp(100, 100, 52)), dailyCloses: ramp(100, 100, 252) }], spy);
    expect(out.SPY.indicators.rangePos52w).toBeNull();
    expect(out.SPY.indicators.trendState).toBe('BASING');
  });
});

describe('generateEtfThesis', () => {
  it('entry-led: names firing components, adds trend context and missing-turn caveat', () => {
    const sig = {
      entry: scoreEtfEntry({ ...ENTRY_MAX, macdCross: null, divergence: null }), // Turn = 0
      exit: scoreEtfExit({ rsiW: 28, extensionPct: -5, rs1m: 1, rs3m: -12, volumeRatio: 1 }),
      indicators: { trendState: 'DOWNTREND', wRsi: 28, rangePos52w: 5, roc13w: -12 },
    };
    const t = generateEtfThesis(sig);
    expect(t).toMatch(/^Entry case/);
    expect(t.toLowerCase()).toContain('oversold');
    expect(t).toContain('weekly downtrend');
    expect(t).toContain("MACD hasn't turned");
    expect(t).not.toContain('no turn yet'); // zero-scoring component detail omitted
  });

  it('exit-led: leads with the exit case', () => {
    const sig = {
      entry: scoreEtfEntry({ rsiW: 55, belowLowerBB: false, rs3m: 10, groupMedianRs3m: 2, macdCross: null, divergence: null, drawdownPct: 1 }),
      exit: scoreEtfExit(EXIT_MAX),
      indicators: { trendState: 'UPTREND', wRsi: 76, rangePos52w: 99, roc13w: 30 },
    };
    const t = generateEtfThesis(sig);
    expect(t).toMatch(/^Exit case/);
    expect(t.toLowerCase()).toContain('overbought');
  });

  it('quiet ETF: says nothing is firing', () => {
    const sig = {
      entry: scoreEtfEntry({ rsiW: 50, belowLowerBB: false, rs3m: 2, groupMedianRs3m: 1, macdCross: null, divergence: null, drawdownPct: 1 }),
      exit: scoreEtfExit({ rsiW: 50, extensionPct: 3, rs1m: 1, rs3m: 2, volumeRatio: 1 }),
      indicators: { trendState: 'BASING', wRsi: 50, rangePos52w: 50, roc13w: 1 },
    };
    expect(generateEtfThesis(sig)).toContain('No entry signals firing');
  });

  it('null-safe', () => {
    expect(generateEtfThesis(null)).toBeNull();
    expect(generateEtfThesis({})).toBeNull();
  });
});

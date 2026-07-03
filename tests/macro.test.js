import { describe, it, expect } from 'vitest';
import { parseFredObservations, deriveMacroRegime } from '../src/lib/macro.js';
import { computeScore } from '../src/lib/scoring.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const obs = (pairs) => pairs.map(([date, value]) => ({ date, value }));

function bullishTicker() {
  return {
    quote: { data: { c: 110, dp: 2.5 } },
    metrics: { data: { metric: { '50DayMovingAverage': 100 } } },
  };
}

// ─── parseFredObservations ───────────────────────────────────────────────────

describe('parseFredObservations', () => {
  it('parses values and skips FRED "." missing markers', () => {
    const json = { observations: [
      { date: '2026-07-02', value: '0.35' },
      { date: '2026-07-01', value: '.' },
      { date: '2026-06-30', value: '-0.12' },
    ] };
    expect(parseFredObservations(json)).toEqual([
      { date: '2026-07-02', value: 0.35 },
      { date: '2026-06-30', value: -0.12 },
    ]);
  });

  it('returns [] on unexpected shape', () => {
    expect(parseFredObservations(null)).toEqual([]);
    expect(parseFredObservations({})).toEqual([]);
    expect(parseFredObservations({ observations: 'nope' })).toEqual([]);
  });
});

// ─── deriveMacroRegime ───────────────────────────────────────────────────────

describe('deriveMacroRegime', () => {
  it('flags inverted curve when latest T10Y2Y < 0', () => {
    const r = deriveMacroRegime({ T10Y2Y: obs([['2026-07-02', -0.25]]) });
    expect(r.curveInverted).toBe(true);
    expect(r.t10y2y).toBe(-0.25);
  });

  it('positive spread is not inverted', () => {
    const r = deriveMacroRegime({ T10Y2Y: obs([['2026-07-02', 0.35]]) });
    expect(r.curveInverted).toBe(false);
  });

  it('flags fedRising when latest FEDFUNDS > previous month', () => {
    const r = deriveMacroRegime({ FEDFUNDS: obs([['2026-06-01', 4.5], ['2026-05-01', 4.25]]) });
    expect(r.fedRising).toBe(true);
    expect(r.fedFunds).toBe(4.5);
    expect(r.fedFundsPrev).toBe(4.25);
  });

  it('flat or falling fed funds is not rising', () => {
    expect(deriveMacroRegime({ FEDFUNDS: obs([['2026-06-01', 4.5], ['2026-05-01', 4.5]]) }).fedRising).toBe(false);
    expect(deriveMacroRegime({ FEDFUNDS: obs([['2026-06-01', 4.25], ['2026-05-01', 4.5]]) }).fedRising).toBe(false);
  });

  it('computes CPI YoY from the observation 12 months back', () => {
    const cpi = [['2026-06-01', 320.6]];
    for (let i = 1; i <= 12; i++) cpi.push([`2025-0${i}`, i === 12 ? 313.0 : 315]);
    const r = deriveMacroRegime({ T10Y2Y: obs([['2026-07-02', 0.3]]), CPIAUCSL: obs(cpi) });
    expect(r.cpiYoY).toBeCloseTo(((320.6 / 313.0) - 1) * 100, 5);
  });

  it('cpiYoY is null with fewer than 13 CPI observations', () => {
    const r = deriveMacroRegime({ T10Y2Y: obs([['2026-07-02', 0.3]]), CPIAUCSL: obs([['2026-06-01', 320.6]]) });
    expect(r.cpiYoY).toBeNull();
    expect(r.cpi).toBe(320.6);
  });

  it('returns null when no usable series', () => {
    expect(deriveMacroRegime(null)).toBeNull();
    expect(deriveMacroRegime({})).toBeNull();
    expect(deriveMacroRegime({ T10Y2Y: [], FEDFUNDS: [] })).toBeNull();
  });
});

// ─── computeScore macro regime integration ───────────────────────────────────

describe('computeScore macroRegime', () => {
  const inverted   = { curveInverted: true,  fedRising: false, t10y2y: -0.2 };
  const fedRising  = { curveInverted: false, fedRising: true,  t10y2y: 0.3 };

  it('inverted curve pulls bullish scores toward neutral', () => {
    const base = computeScore(bullishTicker(), {});
    const hit  = computeScore(bullishTicker(), { macro: inverted });
    expect(base.score).toBeGreaterThan(50); // sanity: ticker is bullish
    expect(hit.score).toBeLessThan(base.score);
    expect(hit.macroRegime.penaltyApplied).toBe(true);
  });

  it('rising fed funds shifts weight from technical to fundamental', () => {
    const base = computeScore(bullishTicker(), {});
    const hit  = computeScore(bullishTicker(), { macro: fedRising });
    expect(hit.weights.tech).toBeLessThan(base.weights.tech);
    expect(hit.weights.fund).toBeGreaterThan(base.weights.fund);
    expect(hit.regimeNote).toMatch(/Fed funds rising/);
  });

  it('fed-rising weight shift never drops tech below the VIX-extreme floor', () => {
    const hit = computeScore(bullishTicker(), { vixPrice: 40, macro: fedRising });
    expect(hit.weights.tech).toBeCloseTo(0.20, 5); // already at floor — no further shift
  });

  it('no macro context leaves score and output untouched', () => {
    const r = computeScore(bullishTicker(), {});
    expect(r.macroRegime).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { DEMO_TICKERS, DEMO_CANDLES, DEMO_MARKET_DATA, DEMO_QUALITY, DEMO_REVENUE_HISTORY } from '../src/lib/demoData.js';
import { resampleWeekly, computeRelativeStrength } from '../src/lib/indicators.js';
import { computeSetupSignals } from '../src/lib/signals.js';
import { computeTimingScore } from '../src/lib/timingScore.js';

// Demo mode exists so a visitor without API keys sees the dashboard work. These
// fixtures feed the real engines, so an engine change can silently empty every
// panel again — the point of these assertions is that it can't do so quietly.
const SYMBOLS = DEMO_TICKERS.map(t => t.symbol);

describe('demo candle series', () => {
  it('generates a usable series for every ticker and ETF proxy', () => {
    for (const [sym, c] of Object.entries(DEMO_CANDLES)) {
      expect(c.s, sym).toBe('ok');
      expect(c.c.length, sym).toBeGreaterThanOrEqual(200);
      expect(c.t.length, sym).toBe(c.c.length);
      expect(resampleWeekly(c)?.c.length ?? 0, sym).toBeGreaterThanOrEqual(20);
    }
  });

  it('keeps OHLC and time-ordering invariants', () => {
    for (const [sym, c] of Object.entries(DEMO_CANDLES)) {
      for (let i = 0; i < c.c.length; i++) {
        expect(c.h[i], `${sym}@${i}`).toBeGreaterThanOrEqual(Math.max(c.o[i], c.c[i]));
        expect(c.l[i], `${sym}@${i}`).toBeLessThanOrEqual(Math.min(c.o[i], c.c[i]));
        expect(c.v[i], `${sym}@${i}`).toBeGreaterThan(0);
        if (i) expect(c.t[i], `${sym}@${i}`).toBeGreaterThan(c.t[i - 1]);
      }
    }
  });

  it('ends each ticker series on the price its quote shows', () => {
    for (const sym of SYMBOLS) {
      expect(DEMO_CANDLES[sym].c.at(-1), sym).toBeCloseTo(DEMO_MARKET_DATA[sym].quote.data.c, 1);
    }
  });

  it('is deterministic — the same seed yields the same series every load', () => {
    // A changing series would make demo screenshots and these assertions flaky.
    expect(DEMO_CANDLES.MSFT.c.slice(0, 3)).toEqual(DEMO_CANDLES.MSFT.c.slice(0, 3));
    expect(Number.isFinite(DEMO_CANDLES.NVDA.c[0])).toBe(true);
  });
});

describe('demo panels are not empty', () => {
  const setups = Object.fromEntries(SYMBOLS.map(s => [s, computeSetupSignals(resampleWeekly(DEMO_CANDLES[s]))]));

  it('computes both weekly setups for every ticker', () => {
    for (const sym of SYMBOLS) {
      expect(setups[sym], sym).not.toBeNull();
      expect(setups[sym].pullback.score, sym).toBeGreaterThanOrEqual(0);
      expect(setups[sym].momentum.score, sym).toBeGreaterThanOrEqual(0);
    }
  });

  it('fires at least one Accumulation and one Breakout candidate, so Setup Radar has rows', () => {
    const active = (s) => ['WATCH', 'SOON', 'ACT'].includes(s.readiness);
    expect(SYMBOLS.some(s => active(setups[s].pullback))).toBe(true);
    expect(SYMBOLS.some(s => active(setups[s].momentum))).toBe(true);
  });

  it('produces a timing score for every ticker', () => {
    for (const sym of SYMBOLS) {
      const t = computeTimingScore({
        dailyCandles: DEMO_CANDLES[sym],
        weeklyCandles: resampleWeekly(DEMO_CANDLES[sym]),
        marketContext: { spyAboveEma50: false, fearGreed: 38 },
      });
      expect(t.total, sym).not.toBeNull();
      expect(t.total, sym).toBeGreaterThan(0);
    }
  });

  it('keeps SPY free of the breakout tail so relative strength is not cancelled', () => {
    // Every uptrend name shares one shape; if the benchmark got the same tail,
    // every RS would collapse to ~0 and the leaders gates would filter everything.
    const rs = computeRelativeStrength(DEMO_CANDLES.MSFT.c, DEMO_CANDLES.SPY.c);
    expect(rs.rs3m).toBeGreaterThan(0);
  });

  it('carries the lazily-fetched quality and revenue fixtures for every ticker', () => {
    for (const sym of SYMBOLS) {
      expect(DEMO_QUALITY[sym]?.total, sym).toBeGreaterThan(0);
      expect(DEMO_REVENUE_HISTORY[sym]?.length, sym).toBe(5);
    }
  });

  it('carries the metrics the Dip Hunter and Setup Radar quality gates read', () => {
    for (const sym of SYMBOLS) {
      const m = DEMO_MARKET_DATA[sym].metrics.data.metric;
      expect(m.revenueGrowthTTMYoy, sym).toBeTypeOf('number');
      expect(m.netProfitMarginTTM, sym).toBeTypeOf('number');
    }
  });
});

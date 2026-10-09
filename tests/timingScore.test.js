import { describe, it, expect } from 'vitest';
import { computeTimingScore } from '../src/lib/timingScore.js';

// A long declining daily series → deep drawdown, low RSIs, weak volume.
// ~420 bars so monthly resampling + all lookbacks have data.
function decliningDaily() {
  const n = 420;
  const c = Array.from({ length: n }, (_, i) => 300 - i * 0.5); // 300 → ~90
  return {
    s: 'ok',
    t: Array.from({ length: n }, (_, i) => 1600000000 + i * 86400),
    o: c, h: c.map(x => x + 1), l: c.map(x => x - 1), c, v: c.map(() => 1000),
  };
}

function weeklyFrom(daily) {
  // cheap weekly proxy: every 5th daily bar
  const idx = [];
  for (let i = 0; i < daily.c.length; i += 5) idx.push(i);
  const pick = (arr) => idx.map(i => arr[i]);
  return { s: 'ok', t: pick(daily.t), o: pick(daily.o), h: pick(daily.h), l: pick(daily.l), c: pick(daily.c), v: pick(daily.v) };
}

describe('computeTimingScore', () => {
  it('returns all-null components and WAIT when candles are missing', () => {
    const r = computeTimingScore({});
    expect(r.total).toBeNull();
    expect(r.label).toBe('WAIT');
    expect(r.components.drawdown).toBeNull();
  });

  it('scores drawdown and the oversold phase on a deep decline', () => {
    const daily = decliningDaily();
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(r.components.drawdown).toBe(25);             // well below 52w high
    expect(r.phase).toBe('oversold');                   // RSIs depressed
    expect(r.signals.some(s => s.startsWith('Daily RSI'))).toBe(true);
  });

  it('phase is the best path, not the sum of paths', () => {
    const daily = decliningDaily();
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    const paths = Object.values(r.paths).filter(v => v != null);
    expect(r.components.phase).toBe(Math.max(...paths));
    expect(r.signals.some(s => s.startsWith('Other paths:'))).toBe(true);
  });

  it('pins total→label for the deep-decline fixture, and a bull-market panic reaches STRONG', () => {
    const daily = decliningDaily();
    // drawdown 25 + oversold path 38, no market inputs = 63 → WATCHLIST.
    const bare = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(bare.total).toBe(63);
    expect(bare.label).toBe('WATCHLIST');
    // + BULL trend 10 + extreme fear 15 = 88 → the 70 gate is reachable again.
    const panic = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { regime: 'BULL', fearGreed: 20 } });
    expect(panic.components.marketContext).toBe(25);
    expect(panic.label).toBe('STRONG_ACCUMULATION_ZONE');
  });

  it('a volume breakout above a prior base scores on the base path', () => {
    // decline, then a tight range, then one wide-volume close far above it
    const n = 300;
    const c = Array.from({ length: n }, (_, i) => (i < 200 ? 200 - i * 0.5 : 100 + (i % 2 ? 1 : -1)));
    c[n - 1] = 130;
    const v = c.map(() => 1000); v[n - 1] = 5000;
    const daily = { s: 'ok', t: c.map((_, i) => 1600000000 + i * 86400), o: c, h: c.map(x => x + 0.5), l: c.map(x => x - 0.5), c, v };
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(r.phase).toBe('base');
    expect(r.signals).toContain('Breakout above the base on above-average volume');
  });

  it('does not score a reversal without a prior pullback', () => {
    const c = Array.from({ length: 300 }, (_, i) => 100 + i * 0.3);
    const daily = { s: 'ok', t: c.map((_, i) => 1600000000 + i * 86400), o: c, h: c.map(x => x + 0.5), l: c.map(x => x - 0.5), c, v: c.map(() => 1000) };
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(r.components.drawdown).toBe(2);
    expect(r.paths.reversal).toBe(0);
  });

  it('scores a shallow bull-regime pullback that the bear/chop bands would miss', () => {
    // ~8% pullback off the highs — negligible in bear/chop bands, meaningful in BULL.
    const n = 420;
    const c = Array.from({ length: n }, (_, i) => (i < n - 20 ? 100 + i * 0.05 : 100 + (n - 20) * 0.05 - (i - (n - 20)) * 0.5));
    const daily = { s: 'ok', t: Array.from({ length: n }, (_, i) => 1600000000 + i * 86400), o: c, h: c.map(x => x + 1), l: c.map(x => x - 1), c, v: c.map(() => 1000) };
    const weekly = weeklyFrom(daily);
    const bearBands = computeTimingScore({ dailyCandles: daily, weeklyCandles: weekly, marketContext: {} });
    const bullBands = computeTimingScore({ dailyCandles: daily, weeklyCandles: weekly, marketContext: { regime: 'BULL' } });
    expect(bullBands.components.drawdown).toBeGreaterThan(bearBands.components.drawdown);
    expect(bullBands.components.marketContext).toBeGreaterThan(0);
  });

  it('adds market-context points and a downtrend warning appropriately', () => {
    const daily = decliningDaily();
    const up = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { spyAboveEma50: true } });
    const down = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { spyAboveEma50: false, spyDowntrend: true } });
    expect(up.components.marketContext).toBeGreaterThan(down.components.marketContext);
    expect(down.warnings).toContain('Broad market trend is still negative');
  });

  it('treats fear as opportunity: lower Fear & Greed scores higher', () => {
    const daily = decliningDaily();
    const mc = (fearGreed) => computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { regime: 'BEAR', fearGreed } }).components.marketContext;
    expect(mc(20)).toBe(15);
    expect(mc(50)).toBe(3);
    expect(mc(80)).toBe(0);
  });

  it('emits n/a for monthly RSI when history is too short but still scores', () => {
    // ~40 daily bars → only ~2 monthly buckets → monthly RSI null, daily/weekly present
    const n = 40;
    const c = Array.from({ length: n }, (_, i) => 120 - i);
    const daily = { s: 'ok', t: Array.from({ length: n }, (_, i) => 1600000000 + i * 86400), o: c, h: c.map(x => x + 1), l: c.map(x => x - 1), c, v: c.map(() => 1000) };
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(r.signals.some(s => s.includes('Monthly RSI n/a'))).toBe(true);
    expect(r.paths.oversold).not.toBeNull();
  });
});

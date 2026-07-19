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

  it('scores drawdown and oversold on a deep decline', () => {
    const daily = decliningDaily();
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(r.components.drawdown).toBeGreaterThan(0);   // well below 52w high
    expect(r.components.oversold).toBeGreaterThan(0);   // RSIs depressed
    expect(typeof r.total).toBe('number');
    expect(r.signals.some(s => s.startsWith('Daily RSI'))).toBe(true);
  });

  it('maps the total to the correct label band', () => {
    const daily = decliningDaily();
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { spyAboveEma50: true, sectorOutperforming: true } });
    const expected = r.total >= 70 ? 'STRONG_ACCUMULATION_ZONE'
      : r.total >= 50 ? 'WATCHLIST'
      : r.total >= 30 ? 'NEUTRAL' : 'WAIT';
    expect(r.label).toBe(expected);
  });

  it('adds market-context points and a downtrend warning appropriately', () => {
    const daily = decliningDaily();
    const up = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { spyAboveEma50: true, sectorOutperforming: true } });
    const down = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: { spyAboveEma50: false, spyDowntrend: true } });
    expect(up.components.marketContext).toBeGreaterThan(down.components.marketContext);
    expect(down.warnings).toContain('Broad market trend is still negative');
  });

  it('emits n/a for monthly RSI when history is too short but still scores', () => {
    // ~40 daily bars → only ~2 monthly buckets → monthly RSI null, daily/weekly present
    const n = 40;
    const c = Array.from({ length: n }, (_, i) => 120 - i);
    const daily = { s: 'ok', t: Array.from({ length: n }, (_, i) => 1600000000 + i * 86400), o: c, h: c.map(x => x + 1), l: c.map(x => x - 1), c, v: c.map(() => 1000) };
    const r = computeTimingScore({ dailyCandles: daily, weeklyCandles: weeklyFrom(daily), marketContext: {} });
    expect(r.signals.some(s => s.includes('Monthly RSI n/a'))).toBe(true);
    expect(r.components.oversold).not.toBeNull();
  });
});

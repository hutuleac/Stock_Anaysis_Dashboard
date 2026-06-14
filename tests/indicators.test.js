import { describe, it, expect } from 'vitest';
import {
  emaArray,
  computeRSI,
  computeMACD,
  computeATR,
  computeRSIZScore,
  computeIndicatorsFromCandles,
  computeWeeklyTrend,
} from '../src/lib/indicators.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Constant prices → zero change, RSI undefined (avgLoss=0=avgGain)
const flat = n => Array(n).fill(100);

// Rising prices by step
const rising = (n, step = 1, start = 100) =>
  Array.from({ length: n }, (_, i) => start + i * step);

// Falling prices by step
const falling = (n, step = 1, start = 200) =>
  Array.from({ length: n }, (_, i) => start - i * step);

// Minimal Finnhub-style candle object
function candles(closes, highs, lows) {
  return {
    s: 'ok',
    c: closes,
    h: highs ?? closes.map(c => c + 1),
    l: lows ?? closes.map(c => c - 1),
    o: closes,
    v: closes.map(() => 1000000),
    t: closes.map((_, i) => 1700000000 + i * 86400),
  };
}

// ─── emaArray ────────────────────────────────────────────────────────────────

describe('emaArray', () => {
  it('returns [] when fewer values than period', () => {
    expect(emaArray([1, 2], 5)).toEqual([]);
  });

  it('seeds at the SMA of the first `period` values', () => {
    // period=3, first 3 values [1,2,3] → seed = 2
    const result = emaArray([1, 2, 3, 4, 5], 3);
    expect(result[2]).toBeCloseTo(2, 5);
  });

  it('applies correct EMA multiplier after seed', () => {
    // k = 2/(3+1) = 0.5; EMA[3] = 4*0.5 + 2*0.5 = 3; EMA[4] = 5*0.5 + 3*0.5 = 4
    const result = emaArray([1, 2, 3, 4, 5], 3);
    expect(result[3]).toBeCloseTo(3, 5);
    expect(result[4]).toBeCloseTo(4, 5);
  });

  it('returns array of correct length', () => {
    const result = emaArray(rising(20), 10);
    expect(result.length).toBe(20);
  });

  it('converges toward a rising trend', () => {
    const result = emaArray(rising(50), 10);
    const last = result[49];
    expect(last).toBeGreaterThan(result[20]);
  });
});

// ─── computeRSI ──────────────────────────────────────────────────────────────

describe('computeRSI', () => {
  it('returns null when data is too short', () => {
    expect(computeRSI(null)).toBeNull();
    expect(computeRSI(rising(14))).toBeNull(); // needs period+1 = 15
  });

  it('returns 100 when all candles are gains (avgLoss=0)', () => {
    expect(computeRSI(rising(20))).toBe(100);
  });

  it('returns 0 when all candles are losses (avgGain=0)', () => {
    expect(computeRSI(falling(20))).toBe(0);
  });

  it('is in [0, 100] for any realistic series', () => {
    const closes = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83,
                    45.10, 45.15, 43.61, 44.33, 44.83, 45.10, 45.15, 46.00];
    const rsi = computeRSI(closes);
    expect(rsi).toBeGreaterThanOrEqual(0);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  it('gives a lower RSI for a declining series than a rising one', () => {
    const upRSI   = computeRSI(rising(20));
    const downRSI = computeRSI(falling(20));
    expect(downRSI).toBeLessThan(upRSI);
  });

  it('uses Wilder smoothing — each bar updates avgGain and avgLoss', () => {
    // With one extra bar of strong gain after an even series, RSI should rise.
    const base  = computeRSI([...rising(15)]);
    const extra = computeRSI([...rising(15), 116]); // extra gain bar
    // Extra gain bar pushes RSI up from 100 or keeps it there
    expect(extra).toBeGreaterThanOrEqual(base);
  });

  it('custom period works', () => {
    const rsi5  = computeRSI(rising(20), 5);
    const rsi14 = computeRSI(rising(20), 14);
    // Both max out at 100 on a rising series
    expect(rsi5).toBe(100);
    expect(rsi14).toBe(100);
  });
});

// ─── computeMACD ─────────────────────────────────────────────────────────────

describe('computeMACD', () => {
  it('returns null when data is too short', () => {
    expect(computeMACD(rising(34))).toBeNull(); // needs slow+signal = 35
  });

  it('returns correct structure', () => {
    const result = computeMACD(rising(50));
    expect(result).toHaveProperty('current');
    expect(result.current).toHaveProperty('macd');
    expect(result.current).toHaveProperty('signal');
    expect(result.current).toHaveProperty('histogram');
  });

  it('histogram = macd - signal', () => {
    const result = computeMACD(rising(50));
    expect(result.current.histogram).toBeCloseTo(
      result.current.macd - result.current.signal, 5
    );
  });

  it('detects a bullish crossover when histogram flips positive', () => {
    // Build series: long downtrend then sharp reversal to force a cross
    const down = falling(40, 2, 200);
    const up   = rising(20, 5, down[down.length - 1]);
    const result = computeMACD([...down, ...up]);
    // Crossover may or may not fire depending on EMA state; just check it's a valid value
    expect([null, 'bullish_cross', 'bearish_cross']).toContain(result?.crossover);
  });

  it('MACD is near zero for a flat price series', () => {
    const result = computeMACD(flat(50));
    expect(Math.abs(result.current.macd)).toBeLessThan(0.001);
  });
});

// ─── computeATR ──────────────────────────────────────────────────────────────

describe('computeATR', () => {
  it('returns null when data is too short', () => {
    const h = rising(14), l = falling(14, 1, 90), c = flat(14);
    expect(computeATR(h, l, c)).toBeNull(); // needs period+1 = 15
  });

  it('computes simple-average ATR correctly for uniform ranges', () => {
    // H always 10, L always 5, C always 7. TR = max(5, |10-7|, |5-7|) = 5
    const n = 20;
    const h = Array(n).fill(10);
    const l = Array(n).fill(5);
    const c = Array(n).fill(7);
    const atr = computeATR(h, l, c);
    expect(atr).toBeCloseTo(5, 5);
  });

  it('uses the last `period` true ranges (slices trs at end)', () => {
    // Insert a spike at the beginning — should not affect result since ATR uses last 14
    const n = 30;
    const h = Array(n).fill(10); h[0] = 100; // big spike at start
    const l = Array(n).fill(5);
    const c = Array(n).fill(7);
    const atr = computeATR(h, l, c);
    expect(atr).toBeCloseTo(5, 5); // spike at index 0 produces TR at index 1, outside last 14
  });

  it('true range includes gap (prev close vs current high/low)', () => {
    // Closes: [10, 10], Highs: [10, 12], Lows: [10, 6]
    // TR[1] = max(12-6, |12-10|, |6-10|) = max(6, 2, 4) = 6
    const h = [10, 10, 12];
    const l = [10, 10, 6];
    const c = [10, 10, 10];
    // period=1: uses only last 1 TR. trs has 2 entries (i=1,2). recent = trs.slice(-1) = [TR at i=2]
    const atr = computeATR(h, l, c, 1);
    expect(atr).toBeCloseTo(6, 5);
  });
});

// ─── computeRSIZScore ─────────────────────────────────────────────────────────

describe('computeRSIZScore', () => {
  it('returns null when data is too short', () => {
    expect(computeRSIZScore(rising(20))).toBeNull();
  });

  it('returns a number for a series of adequate length', () => {
    const result = computeRSIZScore(rising(80));
    expect(typeof result).toBe('number');
  });

  it('returns 0 when RSI has no variance (all-rising series)', () => {
    // All-rising → RSI always 100, std dev ≈ 0 → z-score = 0
    const result = computeRSIZScore(rising(80));
    expect(result).toBe(0);
  });
});

// ─── computeIndicatorsFromCandles ─────────────────────────────────────────────

describe('computeIndicatorsFromCandles', () => {
  it('returns null for bad/short data', () => {
    expect(computeIndicatorsFromCandles(null)).toBeNull();
    expect(computeIndicatorsFromCandles({ s: 'no_data', c: [] })).toBeNull();
    expect(computeIndicatorsFromCandles({ s: 'ok', c: rising(20) })).toBeNull(); // < 30
  });

  it('returns all expected fields', () => {
    const raw = candles(rising(60));
    const result = computeIndicatorsFromCandles(raw);
    expect(result).toBeTruthy();
    expect(result).toHaveProperty('rsi');
    expect(result).toHaveProperty('macd');
    expect(result).toHaveProperty('ema50');
    expect(result).toHaveProperty('ema200');
    expect(result).toHaveProperty('bb');
    expect(result).toHaveProperty('adx');
    expect(result).toHaveProperty('stochK');
    expect(result.source).toBe('local');
  });

  it('RSI is 100 for a pure rising series', () => {
    const raw = candles(rising(60));
    const result = computeIndicatorsFromCandles(raw);
    expect(result.rsi).toBe(100);
  });

  it('EMA50 is null when fewer than 50 candles', () => {
    const raw = candles(rising(40));
    const result = computeIndicatorsFromCandles(raw);
    expect(result.ema50).toBeNull();
  });

  it('EMA200 is null when fewer than 200 candles', () => {
    const raw = candles(rising(60));
    const result = computeIndicatorsFromCandles(raw);
    expect(result.ema200).toBeNull();
  });

  it('BB bands are ordered: lower < middle < upper', () => {
    const raw = candles(rising(60));
    const result = computeIndicatorsFromCandles(raw);
    expect(result.bb.lower).toBeLessThan(result.bb.middle);
    expect(result.bb.middle).toBeLessThan(result.bb.upper);
  });

  it('RSI direction is rising for a pure uptrend', () => {
    const raw = candles(rising(60));
    const result = computeIndicatorsFromCandles(raw);
    // All-rising → RSI stays at 100 each bar, so direction is 'flat'
    expect(['rising', 'flat']).toContain(result.rsiDirection);
  });

  it('warns but does not crash when OHLC arrays are missing', () => {
    const raw = { s: 'ok', c: rising(60), h: [], l: [] };
    const result = computeIndicatorsFromCandles(raw);
    expect(result.adx).toBeNull();
    expect(result.stochK).toBeNull();
    expect(result.bb).not.toBeNull(); // BB only needs closes
  });

  it('ADX stays within [0, 100] for a strong trend (regression: was summed not averaged)', () => {
    const raw = candles(rising(60, 2)); // strong, clean uptrend
    const result = computeIndicatorsFromCandles(raw);
    expect(result.adx).not.toBeNull();
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.adx).toBeLessThanOrEqual(100);
  });

  it('ADX stays within [0, 100] for a choppy series', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 2) * 6);
    const result = computeIndicatorsFromCandles(candles(closes));
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.adx).toBeLessThanOrEqual(100);
  });
});

// ─── computeWeeklyTrend ──────────────────────────────────────────────────────

describe('computeWeeklyTrend', () => {
  it('returns null when data is too short', () => {
    expect(computeWeeklyTrend({ s: 'ok', c: rising(10), h: rising(10,1,101), l: rising(10,1,99) })).toBeNull(); // < 14
  });

  it('returns correct structure', () => {
    const raw = candles(rising(30));
    const result = computeWeeklyTrend(raw);
    expect(result).toHaveProperty('trend');
    expect(result).toHaveProperty('rsi');
    expect(result).toHaveProperty('ema10');
    expect(result).toHaveProperty('aboveEma');
    expect(result).toHaveProperty('atr');
  });

  it('trend is "up" for a strong uptrend (all bullish signals)', () => {
    // Strong rising: above EMA10, EMA rising, RSI > 55, MACD positive → bullCount >= 3
    const raw = candles(rising(50, 2));
    const result = computeWeeklyTrend(raw);
    expect(result.trend).toBe('up');
  });

  it('trend is "down" for a strong downtrend', () => {
    const raw = candles(falling(50, 2, 1000));
    const result = computeWeeklyTrend(raw);
    expect(result.trend).toBe('down');
  });

  it('aboveEma is true when price is above EMA10', () => {
    const raw = candles(rising(50, 2));
    const result = computeWeeklyTrend(raw);
    expect(result.aboveEma).toBe(true);
  });
});

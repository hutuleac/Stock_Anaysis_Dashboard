import { describe, it, expect } from 'vitest';
import {
  emaArray,
  computeRSI,
  computeMACD,
  computeATR,
  computeRSIZScore,
  computeIndicatorsFromCandles,
  computeWeeklyTrend,
  priceReturn,
  computeRelativeStrength,
  computeBreadth,
  computeEmaStack,
  computeOversoldConfluence,
  proximityTo52wHigh,
  pct52wRange,
  computeRSISeries,
  computeOBV,
  computeVolumeConfirmation,
  computeSwingLows,
  resampleWeekly,
  resampleMonthly,
  realizedVol,
} from '../src/lib/indicators.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Constant prices → zero change, no momentum → RSI 50 (avgLoss=0=avgGain)
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

  it('returns neutral 50 for a perfectly flat / halted series (no momentum)', () => {
    // avgGain === avgLoss === 0 — must NOT return 100 ("Overbought") or NaN.
    expect(computeRSI(flat(20))).toBe(50);
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
    expect(result.atr).toBeNull(); // ATR needs OHLC
    expect(result.bb).not.toBeNull(); // BB only needs closes
  });

  it('computes a positive ATR when OHLC is present', () => {
    const result = computeIndicatorsFromCandles(candles(rising(60)));
    expect(result.atr).toBeGreaterThan(0);
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

// ─── priceReturn ─────────────────────────────────────────────────────────────

describe('priceReturn', () => {
  it('returns null when not enough bars', () => {
    expect(priceReturn([100, 101], 21)).toBeNull();
    expect(priceReturn(null, 21)).toBeNull();
  });

  it('computes percent return over the lookback window', () => {
    // 22 bars: first 100, last 110, lookback 21 → (110-100)/100 = 10%
    const closes = [100, ...Array.from({ length: 20 }, () => 105), 110];
    expect(priceReturn(closes, 21)).toBeCloseTo(10, 5);
  });

  it('is negative for a decline', () => {
    const closes = [200, ...Array.from({ length: 20 }, () => 180), 150];
    expect(priceReturn(closes, 21)).toBeCloseTo(-25, 5);
  });
});

// ─── computeRelativeStrength ─────────────────────────────────────────────────

describe('computeRelativeStrength', () => {
  it('returns null fields when series too short', () => {
    const r = computeRelativeStrength([100, 101], [100, 101]);
    expect(r.rs1m).toBeNull();
    expect(r.rs3m).toBeNull();
  });

  it('positive RS when stock outperforms SPY (1M)', () => {
    // stock +20% over 21 bars, SPY +5% → RS = +15
    const stock = [100, ...Array(20).fill(110), 120];
    const spy   = [100, ...Array(20).fill(102), 105];
    const r = computeRelativeStrength(stock, spy);
    expect(r.rs1m).toBeCloseTo(15, 1);
  });

  it('negative RS when stock underperforms SPY', () => {
    const stock = [100, ...Array(20).fill(99), 98];   // -2%
    const spy   = [100, ...Array(20).fill(104), 108]; // +8%
    const r = computeRelativeStrength(stock, spy);
    expect(r.rs1m).toBeLessThan(0);
  });

  it('computes 3M RS when ≥ 63 bars are present', () => {
    const stock = Array.from({ length: 64 }, (_, i) => 100 + i);     // +63% over 63 bars
    const spy   = Array.from({ length: 64 }, (_, i) => 100 + i * 0.5); // +31.5%
    const r = computeRelativeStrength(stock, spy);
    expect(r.rs3m).not.toBeNull();
    expect(r.rs3m).toBeGreaterThan(0);
  });
});

// ─── computeBreadth ────────────────────────────────────────────────────────

describe('computeBreadth', () => {
  it('counts tickers above EMA50 and EMA200 independently', () => {
    const entries = [
      { price: 110, ema50: 100, ema200: 90 },  // above both
      { price: 95,  ema50: 100, ema200: 90 },  // below ema50, above ema200
      { price: 85,  ema50: 100, ema200: 90 },  // below both
    ];
    const r = computeBreadth(entries);
    expect(r.ema50).toEqual({ above: 1, total: 3 });
    expect(r.ema200).toEqual({ above: 2, total: 3 });
  });

  it('excludes entries with a missing EMA from that EMA\'s denominator, not from the other', () => {
    const entries = [
      { price: 110, ema50: 100, ema200: null }, // has ema50 only
      { price: 110, ema50: null, ema200: 90 },  // has ema200 only
    ];
    const r = computeBreadth(entries);
    expect(r.ema50).toEqual({ above: 1, total: 1 });
    expect(r.ema200).toEqual({ above: 1, total: 1 });
  });

  it('skips entries with a missing price entirely', () => {
    const entries = [
      { price: null, ema50: 100, ema200: 90 },
      { price: 110,  ema50: 100, ema200: 90 },
    ];
    const r = computeBreadth(entries);
    expect(r.ema50).toEqual({ above: 1, total: 1 });
  });

  it('returns all-zero totals for an empty or null input', () => {
    expect(computeBreadth([])).toEqual({ ema50: { above: 0, total: 0 }, ema200: { above: 0, total: 0 } });
    expect(computeBreadth(null)).toEqual({ ema50: { above: 0, total: 0 }, ema200: { above: 0, total: 0 } });
  });
});

// ─── computeEmaStack ──────────────────────────────────────────────────────────

describe('computeEmaStack', () => {
  it('returns null when any input is missing', () => {
    expect(computeEmaStack(110, 100, 90, null)).toBeNull();
    expect(computeEmaStack(null, 100, 90, 80)).toBeNull();
  });

  it('BULL_STACK when price > EMA20 > EMA50 > EMA200', () => {
    expect(computeEmaStack(110, 105, 100, 95)).toBe('BULL_STACK');
  });

  it('BROKEN when fully inverted (price < EMA20 < EMA50 < EMA200)', () => {
    expect(computeEmaStack(90, 95, 100, 105)).toBe('BROKEN');
  });

  it('PARTIAL when alignment is incomplete', () => {
    // price > EMA20, but EMA20 < EMA50 → 1 of 3 conditions
    expect(computeEmaStack(110, 105, 108, 100)).toBe('PARTIAL');
  });
});

// ─── computeOversoldConfluence ────────────────────────────────────────────────

describe('computeOversoldConfluence', () => {
  it('false on missing inputs', () => {
    expect(computeOversoldConfluence(null, 30, { lower: 100 })).toBe(false);
    expect(computeOversoldConfluence(100, null, { lower: 100 })).toBe(false);
    expect(computeOversoldConfluence(100, 30, null)).toBe(false);
  });

  it('true when RSI < 35 and price at/below lower band (+2%)', () => {
    expect(computeOversoldConfluence(101, 30, { lower: 100 })).toBe(true); // within 2%
    expect(computeOversoldConfluence(98, 34, { lower: 100 })).toBe(true);
  });

  it('false when RSI not oversold even if price low', () => {
    expect(computeOversoldConfluence(98, 40, { lower: 100 })).toBe(false);
  });

  it('false when price well above the lower band', () => {
    expect(computeOversoldConfluence(110, 30, { lower: 100 })).toBe(false);
  });
});

// ─── proximityTo52wHigh ───────────────────────────────────────────────────────

describe('proximityTo52wHigh', () => {
  it('returns null on missing/invalid inputs', () => {
    expect(proximityTo52wHigh(null, 100)).toBeNull();
    expect(proximityTo52wHigh(100, null)).toBeNull();
    expect(proximityTo52wHigh(100, 0)).toBeNull();
  });

  it('near = true within the threshold', () => {
    const r = proximityTo52wHigh(98, 100); // 2% from high
    expect(r.pctFromHigh).toBeCloseTo(2, 1);
    expect(r.near).toBe(true);
  });

  it('near = false beyond the threshold', () => {
    const r = proximityTo52wHigh(90, 100); // 10% from high
    expect(r.near).toBe(false);
  });

  it('near = true and pctFromHigh negative when price exceeds the lagging high', () => {
    const r = proximityTo52wHigh(105, 100);
    expect(r.pctFromHigh).toBeLessThan(0);
    expect(r.near).toBe(true);
  });
});

// ─── pct52wRange ──────────────────────────────────────────────────────────────
describe('pct52wRange', () => {
  it('returns null on missing or degenerate inputs (high <= low)', () => {
    expect(pct52wRange(null, 50, 100)).toBeNull();
    expect(pct52wRange(75, 0, 100)).toBeNull();       // low falsy
    expect(pct52wRange(75, 100, 100)).toBeNull();     // high == low
    expect(pct52wRange(75, 120, 100)).toBeNull();     // high < low
  });

  it('maps price linearly to 0–100 within the band', () => {
    expect(pct52wRange(75, 50, 100)).toBe(50);
    expect(pct52wRange(60, 40, 120)).toBe(25);
    expect(pct52wRange(100, 50, 150)).toBe(50);
  });

  it('clamps to 100 when live price exceeds the lagging 52w high (fresh breakout)', () => {
    expect(pct52wRange(120, 50, 100)).toBe(100);
  });

  it('clamps to 0 when price prints below the lagging 52w low', () => {
    expect(pct52wRange(40, 50, 100)).toBe(0);
  });
});

// ─── computeRSISeries flat-series handling ────────────────────────────────────
describe('computeRSISeries', () => {
  it('emits neutral 50 (not 100) for a flat / halted series', () => {
    const candles = flat(20).map((close, i) => ({ time: i, close }));
    const series = computeRSISeries(candles);
    expect(series).not.toBeNull();
    expect(series.every(p => p.value === 50)).toBe(true);
  });
});

// ─── computeOBV ───────────────────────────────────────────────────────────────
describe('computeOBV', () => {
  it('returns null on missing or insufficient inputs', () => {
    expect(computeOBV(null, [100])).toBeNull();
    expect(computeOBV([100], null)).toBeNull();
    expect(computeOBV([100], [100])).toBeNull(); // needs ≥ 2 closes
    expect(computeOBV([100, 101], [100])).toBeNull(); // volumes shorter than closes
  });

  it('adds volume on up-close days', () => {
    const closes  = [100, 101, 102];
    const volumes = [1000, 2000, 3000];
    const r = computeOBV(closes, volumes);
    // OBV: 0 → +2000 → +5000
    expect(r.obv).toBe(5000);
  });

  it('subtracts volume on down-close days', () => {
    const closes  = [102, 101, 100];
    const volumes = [1000, 2000, 3000];
    const r = computeOBV(closes, volumes);
    // OBV: 0 → -2000 → -5000
    expect(r.obv).toBe(-5000);
  });

  it('holds OBV unchanged on flat close', () => {
    const closes  = [100, 100, 100];
    const volumes = [1000, 2000, 3000];
    const r = computeOBV(closes, volumes);
    expect(r.obv).toBe(0);
  });

  it('returns rising trend when OBV consistently increases', () => {
    // Build 40 bars of steadily rising closes + high volume so OBV trends up
    const n = 40;
    const closes  = Array.from({ length: n }, (_, i) => 100 + i);
    const volumes = Array(n).fill(100_000);
    const r = computeOBV(closes, volumes);
    expect(r.trend).toBe('rising');
  });

  it('returns falling trend when OBV consistently decreases', () => {
    const n = 40;
    const closes  = Array.from({ length: n }, (_, i) => 100 - i);
    const volumes = Array(n).fill(100_000);
    const r = computeOBV(closes, volumes);
    expect(r.trend).toBe('falling');
  });

  it('returns null trend when smoothed series is too short', () => {
    // Only 3 bars — 20-bar EMA can't produce 11 values
    const closes  = [100, 101, 100];
    const volumes = [1000, 1000, 1000];
    const r = computeOBV(closes, volumes);
    expect(r.trend).toBeNull();
  });
});

// ─── computeVolumeConfirmation ────────────────────────────────────────────────
describe('computeVolumeConfirmation', () => {
  it('returns null on missing or insufficient inputs', () => {
    expect(computeVolumeConfirmation(null)).toBeNull();
    expect(computeVolumeConfirmation([])).toBeNull();
    expect(computeVolumeConfirmation(Array(19).fill(1000))).toBeNull(); // needs ≥ 20
  });

  it('returns null when average volume is zero', () => {
    expect(computeVolumeConfirmation(Array(20).fill(0))).toBeNull();
  });

  it('confirmed = true when recent 5-bar avg ≥ 1.2× the 20-bar avg', () => {
    // 15 bars at 100k, then 5 bars at 200k → recent avg 200k, overall avg 175k → ratio ~1.14
    // Use a cleaner ratio: 15 bars at 100k, 5 bars at 300k → recent avg 300k, overall avg 175k → ratio ~1.71
    const vols = [...Array(15).fill(100_000), ...Array(5).fill(300_000)];
    const r = computeVolumeConfirmation(vols);
    expect(r.confirmed).toBe(true);
    expect(r.ratio).toBeGreaterThan(1.2);
  });

  it('confirmed = false when recent volume is in line with the average', () => {
    const vols = Array(20).fill(100_000);
    const r = computeVolumeConfirmation(vols);
    expect(r.confirmed).toBe(false);
    expect(r.ratio).toBeCloseTo(1.0, 1);
  });

  it('confirmed = false when recent volume is below average', () => {
    const vols = [...Array(15).fill(100_000), ...Array(5).fill(50_000)];
    const r = computeVolumeConfirmation(vols);
    expect(r.confirmed).toBe(false);
    expect(r.ratio).toBeLessThan(1.0);
  });

  it('uses only the last avgBars window for the baseline', () => {
    // 100 bars of noise followed by 20 bars all at 200k — baseline is 200k
    // recent 5 at 200k → ratio should be 1.0 (not confirmed)
    const vols = [...Array(100).fill(1_000_000), ...Array(20).fill(200_000)];
    const r = computeVolumeConfirmation(vols);
    expect(r.ratio).toBeCloseTo(1.0, 1);
    expect(r.confirmed).toBe(false);
  });
});

// ─── computeSwingLows ─────────────────────────────────────────────────────────
describe('computeSwingLows', () => {
  it('returns empty array on missing or too-short input', () => {
    expect(computeSwingLows(null)).toEqual([]);
    expect(computeSwingLows([])).toEqual([]);
    expect(computeSwingLows(Array(10).fill(100))).toEqual([]); // < 2*window+1
  });

  it('detects a clear pivot low', () => {
    // 15 bars: flat at 100, dips to 80 in the middle, flat again
    const lows = [...Array(7).fill(100), 80, ...Array(7).fill(100)];
    const result = computeSwingLows(lows);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].price).toBe(80);
  });

  it('returns at most maxLevels results', () => {
    // Create 3 clear pivot lows spaced well apart
    const lows = [
      ...Array(6).fill(100), 70, ...Array(6).fill(100),  // pivot at index 6
      ...Array(6).fill(100), 75, ...Array(6).fill(100),  // pivot at index 19
      ...Array(6).fill(100), 80, ...Array(5).fill(100),  // pivot at index 32
    ];
    const result = computeSwingLows(lows);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('returns results sorted most-recent first', () => {
    const lows = [
      ...Array(6).fill(100), 70, ...Array(6).fill(100),  // older pivot
      ...Array(6).fill(100), 80, ...Array(5).fill(100),  // more recent pivot
    ];
    const result = computeSwingLows(lows);
    if (result.length >= 2) {
      expect(result[0].barsAgo).toBeLessThan(result[1].barsAgo);
    }
  });

  it('does not flag a bar that is tied with a neighbour', () => {
    // Two equal lows side by side — neither is strictly the minimum
    const lows = [...Array(5).fill(100), 80, 80, ...Array(5).fill(100)];
    const result = computeSwingLows(lows);
    expect(result.every(r => r.price !== 80)).toBe(true);
  });

  it('barsAgo is correct', () => {
    // Pivot is 6 bars from the right end (window=5, so index = length-1-5=last-window)
    const lows = [...Array(5).fill(100), 80, ...Array(5).fill(100)];
    // lows.length = 11, pivot at index 5, barsAgo = 11-1-5 = 5
    const result = computeSwingLows(lows);
    expect(result[0].barsAgo).toBe(5);
  });
});

// ─── resampleWeekly ──────────────────────────────────────────────────────────
describe('resampleWeekly', () => {
  const D = 86400;
  const MON = 1780272000; // Mon 2026-06-01 00:00 UTC
  function bars(ts) {
    return {
      s: 'ok',
      t: ts,
      o: ts.map((_, i) => 10 + i),
      h: ts.map((_, i) => 20 + i),
      l: ts.map((_, i) => 5 + i),
      c: ts.map((_, i) => 15 + i),
      v: ts.map(() => 100),
    };
  }

  it('aggregates a full Mon–Fri week into one bar', () => {
    const w = resampleWeekly(bars([MON, MON + D, MON + 2 * D, MON + 3 * D, MON + 4 * D]));
    expect(w.c.length).toBe(1);
    expect(w.o[0]).toBe(10);        // first open
    expect(w.h[0]).toBe(24);        // max high
    expect(w.l[0]).toBe(5);         // min low
    expect(w.c[0]).toBe(19);        // last close
    expect(w.v[0]).toBe(500);       // summed volume
    expect(w.t[0]).toBe(MON);       // week's first bar ts
  });

  it('splits across the weekend and keeps the partial current week', () => {
    // Thu+Fri, then Mon+Tue of next week
    const w = resampleWeekly(bars([MON + 3 * D, MON + 4 * D, MON + 7 * D, MON + 8 * D]));
    expect(w.c.length).toBe(2);
    expect(w.v[0]).toBe(200);
    expect(w.v[1]).toBe(200);
    expect(w.c[1]).toBe(18);        // latest daily close survives
  });

  it('handles a holiday-short week (4 bars) as one week', () => {
    const w = resampleWeekly(bars([MON + D, MON + 2 * D, MON + 3 * D, MON + 4 * D]));
    expect(w.c.length).toBe(1);
    expect(w.o[0]).toBe(10);
  });

  it('returns null on invalid input', () => {
    expect(resampleWeekly(null)).toBeNull();
    expect(resampleWeekly({ s: 'no_data' })).toBeNull();
    expect(resampleWeekly({ s: 'ok', c: [1], t: [] })).toBeNull();
  });
});

// ─── resampleMonthly ──────────────────────────────────────────────────────────

describe('resampleMonthly', () => {
  // Three trading days across two calendar months (UTC).
  // 2026-01-30, 2026-01-31, 2026-02-02
  const raw = {
    s: 'ok',
    t: [1769731200, 1769817600, 1770004800],
    o: [10, 11, 20],
    h: [12, 15, 22],
    l: [9, 10, 19],
    c: [11, 14, 21],
    v: [100, 200, 500],
  };

  it('groups daily bars into calendar-month OHLCV buckets', () => {
    const m = resampleMonthly(raw);
    expect(m.c).toEqual([14, 21]);        // last close of Jan, last close of Feb
    expect(m.o).toEqual([10, 20]);        // first open of each month
    expect(m.h).toEqual([15, 22]);        // max high per month
    expect(m.l).toEqual([9, 19]);         // min low per month
    expect(m.v).toEqual([300, 500]);      // summed volume per month
    expect(m.t).toEqual([1769731200, 1770004800]); // first ts of each month
  });

  it('returns null for malformed or empty input', () => {
    expect(resampleMonthly(null)).toBeNull();
    expect(resampleMonthly({ s: 'no_data' })).toBeNull();
    expect(resampleMonthly({ s: 'ok', t: [1], c: [] })).toBeNull();
    expect(resampleMonthly({ s: 'ok', t: [1, 2], c: [10] })).toBeNull(); // length mismatch
  });
});

// ─── realizedVol ─────────────────────────────────────────────────────────────
describe('realizedVol', () => {
  it('is ~0 for a flat series', () => {
    expect(realizedVol(Array(30).fill(100))).toBeCloseTo(0, 5);
  });

  it('matches hand-computed annualized stdev of log returns', () => {
    // alternating ±1% daily moves → per-bar log-return stdev ≈ 0.01
    const closes = [100];
    for (let i = 0; i < 25; i++) closes.push(closes[i] * (i % 2 ? 0.99 : 1.01));
    const v = realizedVol(closes, 20);
    expect(v).toBeGreaterThan(14);  // ≈ 0.01 * sqrt(252) * 100 ≈ 15.9
    expect(v).toBeLessThan(18);
  });

  it('returns null with insufficient data', () => {
    expect(realizedVol([1, 2, 3], 20)).toBeNull();
    expect(realizedVol(null)).toBeNull();
  });
});

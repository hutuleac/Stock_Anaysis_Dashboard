import { describe, it, expect } from 'vitest';
import {
  drawdownFrom52wHigh,
  bbWidthPercentile,
  detectConsolidation,
  breakoutConfirmation,
  emaReclaim,
  macdHistogramImproving,
  upDownVolumeRatio,
  detectCapitulation,
} from '../src/lib/technicalPatterns.js';

// Helper: build a raw candle object from parallel arrays (t auto-filled).
function raw({ o, h, l, c, v }) {
  const n = c.length;
  return {
    s: 'ok',
    t: Array.from({ length: n }, (_, i) => 1700000000 + i * 86400),
    o: o ?? c, h: h ?? c, l: l ?? c, c, v: v ?? c.map(() => 1000),
  };
}

describe('drawdownFrom52wHigh', () => {
  it('computes percent below the rolling max', () => {
    // high 100, last 75 → -25%
    const closes = [80, 100, 90, 75];
    expect(drawdownFrom52wHigh(closes)).toBeCloseTo(-25, 5);
  });
  it('returns 0 at a fresh high', () => {
    expect(drawdownFrom52wHigh([50, 60, 70])).toBeCloseTo(0, 5);
  });
  it('returns null for insufficient or invalid input', () => {
    expect(drawdownFrom52wHigh([10])).toBeNull();
    expect(drawdownFrom52wHigh(null)).toBeNull();
    expect(drawdownFrom52wHigh([0, 0])).toBeNull();
  });
});

describe('bbWidthPercentile', () => {
  it('ranks a tight current band low when history was wider', () => {
    // 40 volatile bars then a flat tail → current bandwidth near the bottom of the range
    const volatile = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 15 : -15));
    const flat = Array.from({ length: 30 }, () => 100);
    const r = bbWidthPercentile([...volatile, ...flat]);
    expect(r).not.toBeNull();
    expect(r.percentile).toBeLessThan(30);
    expect(r.width).toBeGreaterThanOrEqual(0);
  });
  it('returns null when there are fewer than `period` closes', () => {
    expect(bbWidthPercentile([1, 2, 3])).toBeNull();
  });
});

describe('detectConsolidation', () => {
  it('detects a tight multi-week range', () => {
    // 30 bars oscillating within ~4% → consolidating
    const c = Array.from({ length: 30 }, (_, i) => 100 + (i % 2 === 0 ? 2 : -2));
    const r = detectConsolidation(raw({ c, h: c.map(x => x + 1), l: c.map(x => x - 1) }));
    expect(r).not.toBeNull();
    expect(r.days).toBeGreaterThanOrEqual(20);
    expect(r.rangePct).toBeLessThanOrEqual(15);
  });
  it('returns null when the recent range is too wide', () => {
    const c = Array.from({ length: 30 }, (_, i) => 100 + i * 3); // trending, wide range
    expect(detectConsolidation(raw({ c }))).toBeNull();
  });
  it('returns null with fewer than minDays bars', () => {
    expect(detectConsolidation(raw({ c: [100, 101, 100] }))).toBeNull();
  });
});

describe('breakoutConfirmation', () => {
  it('confirms a close above the range high on a volume surge', () => {
    const c = [...Array(20).fill(100), 110];
    const v = [...Array(20).fill(1000), 3000];
    expect(breakoutConfirmation(raw({ c, v }), 105)).toBe(true);
  });
  it('rejects a breakout without volume', () => {
    const c = [...Array(20).fill(100), 110];
    const v = [...Array(20).fill(1000), 1000];
    expect(breakoutConfirmation(raw({ c, v }), 105)).toBe(false);
  });
  it('rejects when price stays below the range high', () => {
    const c = [...Array(20).fill(100), 104];
    const v = [...Array(20).fill(1000), 3000];
    expect(breakoutConfirmation(raw({ c, v }), 105)).toBe(false);
  });
});

describe('emaReclaim', () => {
  it('detects a close back above EMA20 after a stretch below it', () => {
    // 25 declining closes (drives price below its EMA20), then a sharp jump above
    const down = Array.from({ length: 25 }, (_, i) => 130 - i * 2); // 130..82
    const c = [...down, 200]; // last close spikes well above the EMA
    expect(emaReclaim({ s: 'ok', c })).toBe(true);
  });
  it('returns false when the last close is still below EMA20', () => {
    const c = Array.from({ length: 30 }, (_, i) => 130 - i); // steady decline
    expect(emaReclaim({ s: 'ok', c })).toBe(false);
  });
  it('returns false with insufficient history', () => {
    expect(emaReclaim({ s: 'ok', c: [1, 2, 3] })).toBe(false);
  });
});

describe('macdHistogramImproving', () => {
  it('returns true when the histogram rises over the last 3 intervals', () => {
    // long flat base then an accelerating rise → histogram increasing at the end
    const base = Array.from({ length: 40 }, () => 100);
    const rise = [101, 103, 106, 110];
    expect(macdHistogramImproving([...base, ...rise])).toBe(true);
  });
  it('returns false on a steady decline', () => {
    const c = Array.from({ length: 45 }, (_, i) => 200 - i);
    expect(macdHistogramImproving(c)).toBe(false);
  });
  it('returns false with insufficient history', () => {
    expect(macdHistogramImproving([1, 2, 3, 4, 5])).toBe(false);
  });
});

describe('upDownVolumeRatio', () => {
  it('divides up-day volume by down-day volume over the window', () => {
    // closes alternate up/down; up days carry 2000, down days 1000
    const c = [100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100];
    const v = [500, 2000, 1000, 2000, 1000, 2000, 1000, 2000, 1000, 2000, 1000];
    // last 10 diffs: up days (2000 x5) / down days (1000 x5) = 2.0
    expect(upDownVolumeRatio({ s: 'ok', c, v })).toBeCloseTo(2.0, 5);
  });
  it('returns Infinity when there is up-volume but no down days', () => {
    const c = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
    const v = c.map(() => 1000);
    expect(upDownVolumeRatio({ s: 'ok', c, v })).toBe(Infinity);
  });
  it('returns null with insufficient history', () => {
    expect(upDownVolumeRatio({ s: 'ok', c: [1, 2], v: [1, 1] })).toBeNull();
  });
});

describe('detectCapitulation', () => {
  it('flags a high-volume climax down day inside a downtrend', () => {
    // 30 declining bars, then a spike-volume down day closing near its low
    const n = 32;
    const c = Array.from({ length: n }, (_, i) => 200 - i * 3); // steady decline
    const h = c.map(x => x + 2);
    const l = c.map(x => x - 2);
    const v = c.map(() => 1000);
    // make the last bar a capitulation: big down move, closes at the low, huge volume
    c[n - 1] = c[n - 2] - 12;
    l[n - 1] = c[n - 1] - 1;
    h[n - 1] = c[n - 2];
    v[n - 1] = 5000;
    const r = detectCapitulation({ s: 'ok', t: c.map((_, i) => 1700000000 + i * 86400), o: c, h, l, c, v });
    expect(r.detected).toBe(true);
    expect(r.dates.length).toBeGreaterThanOrEqual(1);
  });
  it('returns detected=false when there is no volume spike', () => {
    const n = 32;
    const c = Array.from({ length: n }, (_, i) => 200 - i * 3);
    const v = c.map(() => 1000); // flat volume, no spike
    const r = detectCapitulation({ s: 'ok', t: c.map((_, i) => 1700000000 + i * 86400), o: c, h: c.map(x => x + 2), l: c.map(x => x - 2), c, v });
    expect(r.detected).toBe(false);
  });
  it('returns detected=false with insufficient history', () => {
    expect(detectCapitulation({ s: 'ok', c: [1, 2, 3], h: [1, 2, 3], l: [1, 2, 3], v: [1, 1, 1] }).detected).toBe(false);
  });
});

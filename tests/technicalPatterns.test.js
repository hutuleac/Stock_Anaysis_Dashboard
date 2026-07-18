import { describe, it, expect } from 'vitest';
import {
  drawdownFrom52wHigh,
  bbWidthPercentile,
  detectConsolidation,
  breakoutConfirmation,
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

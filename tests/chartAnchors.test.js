import { describe, it, expect } from 'vitest';
import {
  computeAVWAP,
  computePOC,
  computeFib,
  detectFVG,
  computeChartAnchors,
} from '../src/lib/chartAnchors.js';

describe('computeAVWAP', () => {
  it('anchors at the lowest swing low and computes VWAP from there', () => {
    const highs   = [12, 11, 11, 10, 11, 12, 13];
    const lows    = [11, 10, 10,  8, 10, 11, 12];
    const closes  = [11, 10, 10,  9, 10, 11, 12];
    const volumes = [10, 10, 10, 10, 10, 10, 10];
    const r = computeAVWAP(highs, lows, closes, volumes);
    expect(r.anchorIndex).toBe(3);
    const tps = [(8 + 10 + 9) / 3, (11 + 10 + 10) / 3, (12 + 11 + 11) / 3, (13 + 12 + 12) / 3];
    const expected = tps.reduce((a, b) => a + b, 0) / tps.length;
    expect(r.value).toBeCloseTo(expected, 4);
    expect(r.reclaimed).toBe(true);
    expect(r.pctFromPrice).toBeCloseTo((12 - expected) / expected * 100, 4);
  });

  it('returns null when there is no confirmed swing low', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(computeAVWAP(arr, arr, arr, [1, 1, 1, 1, 1, 1, 1])).toBeNull();
  });

  it('returns null when volume from the anchor is zero', () => {
    const highs = [3, 2, 3], lows = [2, 1, 2], closes = [2, 1, 2];
    expect(computeAVWAP(highs, lows, closes, [0, 0, 0])).toBeNull();
  });
});

describe('computePOC', () => {
  it('puts POC at the highest-volume price bucket and classifies position', () => {
    const highs   = [10, 10, 10, 10, 20];
    const lows    = [10, 10, 10, 10, 20];
    const closes  = [10, 10, 10, 10, 20];
    const volumes = [50, 50, 50, 50,  1];
    const r = computePOC(highs, lows, closes, volumes, 10);
    expect(r.pocPrice).toBeCloseTo(10.5, 5); // midpoint of the lowest bucket [10,11)
    expect(r.valueAreaLow).toBeLessThanOrEqual(10.5);
    expect(r.position).toBe('above');
  });

  it('returns null when the range is degenerate', () => {
    expect(computePOC([5, 5], [5, 5], [5, 5], [1, 1], 10)).toBeNull();
  });

  it('returns null when total volume is zero', () => {
    expect(computePOC([3, 2, 1], [1, 1, 1], [2, 1, 1], [0, 0, 0], 10)).toBeNull();
  });
});

describe('computeFib', () => {
  it('computes retracement levels for an up move (low before high)', () => {
    //          idx  0   1  2   3   4   5   6   7
    const highs = [12, 11, 11, 13, 14, 16, 14, 13]; // swing high 16 at idx5 (2 bars each side)
    const lows  = [11, 10,  8, 11, 12, 15, 13, 12]; // swing low 8 at idx2
    const r = computeFib(highs, lows);
    expect(r.swingHigh).toBe(16);
    expect(r.swingLow).toBe(8);
    expect(r.direction).toBe('up'); // low (idx2) before high (idx5)
    expect(r.levels['0.5']).toBeCloseTo(16 - 0.5 * (16 - 8), 6); // = 12
    expect(r.levels['0.618']).toBeCloseTo(16 - 0.618 * (16 - 8), 6);
  });

  it('returns null without confirmed pivots', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(computeFib(arr, arr)).toBeNull();
  });
});

describe('detectFVG', () => {
  it('finds an unfilled bullish gap relative to price', () => {
    const highs  = [10, 30, 25];
    const lows   = [ 8, 22, 20];
    const closes = [ 9, 25, 22];
    const r = detectFVG(highs, lows, closes);
    expect(r.gapsBelow.length).toBe(1);
    expect(r.gapsBelow[0]).toMatchObject({ bottom: 10, top: 20, index: 1 });
  });

  it('excludes a gap that price later traded back through', () => {
    // bullish gap [10,22] at i=1; candle 3 (12-23) trades back into it → filled
    const highs  = [10, 30, 25, 23];
    const lows   = [ 8, 15, 22, 12];
    const closes = [ 9, 25, 23, 20];
    const r = detectFVG(highs, lows, closes);
    expect(r.gapsAbove.length + r.gapsBelow.length).toBe(0);
  });

  it('returns empty arrays when there are no gaps', () => {
    const a = [5, 5, 5, 5];
    expect(detectFVG(a, a, a)).toEqual({ gapsAbove: [], gapsBelow: [] });
  });
});

describe('computeChartAnchors', () => {
  const mkRaw = (n) => {
    const c = Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 3) * 5);
    return { s: 'ok', c, h: c.map(x => x + 1), l: c.map(x => x - 1), v: c.map(() => 1000) };
  };

  it('returns null below the minimum bar count', () => {
    expect(computeChartAnchors(mkRaw(59))).toBeNull();
    expect(computeChartAnchors({ s: 'no_data', c: [] })).toBeNull();
  });

  it('returns the four sub-objects on a healthy series', () => {
    const r = computeChartAnchors(mkRaw(120));
    expect(r).toHaveProperty('avwap');
    expect(r).toHaveProperty('poc');
    expect(r).toHaveProperty('fib');
    expect(r).toHaveProperty('fvg');
    expect(r.poc.position).toMatch(/above|inside|below/);
  });
});

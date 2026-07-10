import { describe, it, expect } from 'vitest';
import {
  findSwingPivots,
  detectDivergence,
  detectSqueeze,
  detectVolumeProfile,
  detectStructure,
  scorePullbackSetup,
  scoreMomentumSetup,
  computeSetupSignals,
} from '../src/lib/signals.js';
import { computeRSI } from '../src/lib/indicators.js';

describe('findSwingPivots', () => {
  it('returns [] for arrays shorter than 2*pivotBars+1', () => {
    expect(findSwingPivots([1, 2, 3], 2, 'high')).toEqual([]);
  });

  it('detects a swing high', () => {
    // index 2 (value 5) is >= its 2 neighbors each side
    const pivots = findSwingPivots([1, 3, 5, 3, 1], 2, 'high');
    expect(pivots).toContainEqual({ index: 2, value: 5 });
  });

  it('detects a swing low', () => {
    const pivots = findSwingPivots([9, 7, 2, 7, 9], 2, 'low');
    expect(pivots).toContainEqual({ index: 2, value: 2 });
  });

  it('respects pivotBars window (no pivot near edges)', () => {
    const pivots = findSwingPivots([5, 4, 3, 2, 1], 2, 'high');
    // index 0 has no left neighbors; never a pivot
    expect(pivots.every(p => p.index >= 2 && p.index <= 2)).toBe(true);
  });
});

// ── detectDivergence ─────────────────────────────────────────────────────────
function bullishDivergenceCloses() {
  return [
    50, 48, 44, 40, 38, 42, 46, 48, 50, 49,
    47, 44, 41, 39, 37, 41, 45, 48, 51, 54,
    56, 58, 60, 62, 64, 66, 68, 70, 72, 74,
  ];
}

describe('detectDivergence', () => {
  it('returns NONE for too-short input', () => {
    const r = detectDivergence([1, 2, 3], [3, 4, 5], [0, 1, 2]);
    expect(r.type).toBe('NONE');
  });

  it('returns a valid shape', () => {
    const closes = bullishDivergenceCloses();
    const highs = closes.map(c => c + 1);
    const lows = closes.map(c => c - 1);
    const r = detectDivergence(closes, highs, lows);
    expect(r).toHaveProperty('type');
    expect(r).toHaveProperty('strength');
    expect(r).toHaveProperty('barsAgo');
    expect(['BULL', 'BEAR', 'NONE']).toContain(r.type);
  });

  it('strength is within [0, 1]', () => {
    const closes = bullishDivergenceCloses();
    const highs = closes.map(c => c + 1);
    const lows = closes.map(c => c - 1);
    const r = detectDivergence(closes, highs, lows);
    expect(r.strength).toBeGreaterThanOrEqual(0);
    expect(r.strength).toBeLessThanOrEqual(1);
  });

  it('returns NONE when price and momentum move together (no divergence)', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 50 + i);
    const highs = closes.map(c => c + 1);
    const lows = closes.map(c => c - 1);
    const r = detectDivergence(closes, highs, lows);
    expect(r.type).toBe('NONE');
  });
});

// ── detectSqueeze ────────────────────────────────────────────────────────────
describe('detectSqueeze', () => {
  it('returns FLAT for too-short input', () => {
    expect(detectSqueeze([1, 2, 3]).phase).toBe('FLAT');
  });

  it('detects COMPRESSING when bandwidth is shrinking', () => {
    const closes = [];
    for (let i = 0; i < 40; i++) {
      const amp = 20 * (1 - i / 40);
      closes.push(100 + (i % 2 === 0 ? amp : -amp));
    }
    const r = detectSqueeze(closes);
    expect(['COMPRESSING', 'SQUEEZE']).toContain(r.phase);
  });

  it('detects EXPANDING when bandwidth is growing', () => {
    const closes = [];
    for (let i = 0; i < 40; i++) {
      const amp = 2 + 20 * (i / 40);
      closes.push(100 + (i % 2 === 0 ? amp : -amp));
    }
    const r = detectSqueeze(closes);
    expect(['EXPANDING', 'FLAT']).toContain(r.phase);
  });

  it('percentile is within [0, 100]', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
    const r = detectSqueeze(closes);
    expect(r.percentile).toBeGreaterThanOrEqual(0);
    expect(r.percentile).toBeLessThanOrEqual(100);
  });
});

// ── detectVolumeProfile ──────────────────────────────────────────────────────
describe('detectVolumeProfile', () => {
  it('returns NEUTRAL for too-short / empty input', () => {
    expect(detectVolumeProfile([]).state).toBe('NEUTRAL');
    expect(detectVolumeProfile([1, 2, 3]).state).toBe('NEUTRAL');
  });

  it('detects DRY_UP on a declining volume series', () => {
    const vols = Array.from({ length: 12 }, (_, i) => 1000 - i * 70);
    const r = detectVolumeProfile(vols);
    expect(r.state).toBe('DRY_UP');
    expect(r.slopePct).toBeLessThan(0);
  });

  it('detects EXPANSION on a rising volume series ending high', () => {
    const vols = Array.from({ length: 12 }, (_, i) => 300 + i * 80);
    const r = detectVolumeProfile(vols);
    expect(r.state).toBe('EXPANSION');
    expect(r.slopePct).toBeGreaterThan(0);
  });

  it('percentile within [0, 100]', () => {
    const vols = Array.from({ length: 12 }, () => 500);
    const r = detectVolumeProfile(vols);
    expect(r.percentile).toBeGreaterThanOrEqual(0);
    expect(r.percentile).toBeLessThanOrEqual(100);
  });
});

// ── detectStructure ──────────────────────────────────────────────────────────
describe('detectStructure', () => {
  it('returns Neutral/STABLE for too-short input', () => {
    const r = detectStructure([1, 2], [0, 1]);
    expect(r.current).toBe('Neutral');
    expect(r.signal).toBe('STABLE');
  });

  it('identifies a Bullish regime on rising highs and lows', () => {
    const highs = Array.from({ length: 20 }, (_, i) => 100 + i * 2);
    const lows = Array.from({ length: 20 }, (_, i) => 98 + i * 2);
    const r = detectStructure(highs, lows);
    expect(r.current).toBe('Bullish');
  });

  it('identifies a Bearish regime on falling highs and lows', () => {
    const highs = Array.from({ length: 20 }, (_, i) => 140 - i * 2);
    const lows = Array.from({ length: 20 }, (_, i) => 138 - i * 2);
    const r = detectStructure(highs, lows);
    expect(r.current).toBe('Bearish');
  });

  it('confidence within [0, 1]', () => {
    const highs = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i));
    const lows = Array.from({ length: 20 }, (_, i) => 98 + Math.sin(i));
    const r = detectStructure(highs, lows);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

// ── scorePullbackSetup ───────────────────────────────────────────────────────
describe('scorePullbackSetup', () => {
  const strong = {
    divergence: { type: 'BULL', strength: 0.8, barsAgo: 1 },
    structure: { current: 'Bearish', signal: 'TREND_EXHAUSTION', confidence: 0.8 },
    volume: { state: 'DRY_UP', slopePct: -3, percentile: 20 },
    rangePos: 0.15,
  };
  const empty = {
    divergence: { type: 'NONE', strength: 0, barsAgo: 0 },
    structure: { current: 'Bullish', signal: 'STABLE', confidence: 0 },
    volume: { state: 'NEUTRAL', slopePct: 0, percentile: 50 },
    rangePos: 0.9,
  };

  it('score is within [0, 10]', () => {
    expect(scorePullbackSetup(strong).score).toBeLessThanOrEqual(10);
    expect(scorePullbackSetup(strong).score).toBeGreaterThanOrEqual(0);
    expect(scorePullbackSetup(empty).score).toBe(0);
  });

  it('strong inputs outscore empty inputs', () => {
    expect(scorePullbackSetup(strong).score).toBeGreaterThan(scorePullbackSetup(empty).score);
  });

  it('returns 4 components', () => {
    expect(scorePullbackSetup(strong).components).toHaveLength(4);
  });

  it('readiness label matches thresholds', () => {
    const r = scorePullbackSetup(strong);
    expect(['WAIT', 'WATCH', 'SOON', 'ACT']).toContain(r.readiness);
  });

  it('empty setup has NO SETUP label and WAIT readiness', () => {
    const r = scorePullbackSetup(empty);
    expect(r.label).toBe('NO SETUP');
    expect(r.readiness).toBe('WAIT');
  });
});

// ── scoreMomentumSetup ───────────────────────────────────────────────────────
describe('scoreMomentumSetup', () => {
  const strong = {
    squeeze: { phase: 'SQUEEZE', percentile: 5, currentBw: 3, barsToSqueeze: 0 },
    structure: { current: 'Bullish', signal: 'BREAKOUT', confidence: 0.6 },
    volume: { state: 'EXPANSION', slopePct: 4, percentile: 80 },
    emaReclaim: true,
  };
  const empty = {
    squeeze: { phase: 'EXPANDING', percentile: 90, currentBw: 20, barsToSqueeze: 99 },
    structure: { current: 'Bearish', signal: 'STABLE', confidence: 0 },
    volume: { state: 'NEUTRAL', slopePct: 0, percentile: 50 },
    emaReclaim: false,
  };

  it('score within [0, 10]', () => {
    const r = scoreMomentumSetup(strong);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(10);
    expect(scoreMomentumSetup(empty).score).toBe(0);
  });

  it('strong outscores empty', () => {
    expect(scoreMomentumSetup(strong).score).toBeGreaterThan(scoreMomentumSetup(empty).score);
  });

  it('returns 4 components', () => {
    expect(scoreMomentumSetup(strong).components).toHaveLength(4);
  });

  it('squeeze phase bumps readiness', () => {
    const r = scoreMomentumSetup(strong);
    expect(['WATCH', 'SOON', 'ACT']).toContain(r.readiness);
  });
});

// ── computeSetupSignals ──────────────────────────────────────────────────────
function weekly(closes) {
  return {
    s: 'ok',
    c: closes,
    h: closes.map(c => c + 1),
    l: closes.map(c => c - 1),
    v: closes.map(() => 1_000_000),
    t: closes.map((_, i) => 1_600_000_000 + i * 604800),
  };
}

describe('computeSetupSignals', () => {
  it('returns null for bad / short input', () => {
    expect(computeSetupSignals(null)).toBeNull();
    expect(computeSetupSignals({ s: 'no_data', c: [] })).toBeNull();
    expect(computeSetupSignals(weekly(Array.from({ length: 10 }, (_, i) => 100 + i)))).toBeNull();
  });

  it('returns both setups with valid shape on good input', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 8);
    const r = computeSetupSignals(weekly(closes));
    expect(r).toHaveProperty('pullback');
    expect(r).toHaveProperty('momentum');
    expect(r.pullback).toHaveProperty('score');
    expect(r.pullback).toHaveProperty('readiness');
    expect(r.momentum).toHaveProperty('components');
    expect(r.pullback.score).toBeGreaterThanOrEqual(0);
    expect(r.pullback.score).toBeLessThanOrEqual(10);
  });

  it('handles missing volume array gracefully', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
    const raw = weekly(closes);
    delete raw.v;
    const r = computeSetupSignals(raw);
    expect(r).not.toBeNull();
    expect(r.momentum).toHaveProperty('score');
  });
});

describe('computeSetupSignals meta (display-only weekly RSI)', () => {
  it('exposes rounded weekly RSI as meta.wRsi', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i); // steady rise → high RSI
    const raw = { s: 'ok', c: closes, h: [...closes], l: [...closes], v: closes.map(() => 1000) };
    const out = computeSetupSignals(raw);
    expect(out.meta.wRsi).toBe(Math.round(computeRSI(closes)));
    expect(out.meta.wRsi).toBeGreaterThan(60);
  });
});

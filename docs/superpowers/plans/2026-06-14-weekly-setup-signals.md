# Weekly Leading-Signal Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a weekly-timeframe leading-signal engine that surfaces two separately-scored entry setups per ticker — Pullback/Accumulation and Momentum/Breakout — to help time entries for months-to-a-year holds.

**Architecture:** A new pure-function module `src/lib/signals.js` provides four detectors (divergence, squeeze, volume profile, structure) and two aggregators, reusing the existing math in `indicators.js`. It is wired into `App.svelte` on the weekly candle data already fetched (zero new API calls), persisted in the localStorage supplement, and surfaced via a table badge plus an expanded-row block with tooltips.

**Tech Stack:** Svelte 5, Vite, Vitest. Plain ES modules. No new dependencies.

---

## File Structure

- **Create** `src/lib/signals.js` — all detector + aggregator logic. One responsibility: turn weekly OHLCV into two setup results.
- **Create** `tests/signals.test.js` — Vitest unit tests for every exported function.
- **Modify** `src/App.svelte` — call `computeSetupSignals` on each weekly path; persist + rehydrate `setups`.
- **Modify** `src/lib/tooltipDefs.js` — add `setupPullback` and `setupMomentum` tooltip definitions.
- **Modify** `src/lib/components/WatchlistTable.svelte` — render a compact setup badge.
- **Modify** `src/lib/components/FundamentalsBar.svelte` — render the expanded-row setup block.
- **Modify** `README.md`, `CLAUDE.md`, `ROADMAP.md` — docs.

### Shared types (used across tasks)

```
// Detector results
DivergenceResult = { type: 'BULL'|'BEAR'|'NONE', strength: number /*0..1*/, barsAgo: number }
SqueezeResult    = { phase: 'FLAT'|'COMPRESSING'|'SQUEEZE'|'EXPANDING', percentile: number, currentBw: number, barsToSqueeze: number }
VolumeResult     = { state: 'DRY_UP'|'EXPANSION'|'NEUTRAL', slopePct: number, percentile: number }
StructureResult  = { current: 'Bullish'|'Bearish'|'Neutral', signal: 'STABLE'|'TREND_EXHAUSTION'|'RANGE_FORMING'|'BREAKOUT', confidence: number /*0..1*/ }

// Aggregator result
SetupResult = {
  score: number,            // 0..10
  label: string,            // 'STRONG SETUP' | 'FORMING' | 'EARLY' | 'NO SETUP'
  components: { label: string, score: number, max: number, detail: string }[],
  readiness: 'WAIT'|'WATCH'|'SOON'|'ACT',
  etaWeeks: number | null,
}

// Main result
SetupSignals = { pullback: SetupResult, momentum: SetupResult } | null
```

---

## Task 1: Swing-pivot helper

**Files:**
- Create: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/signals.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { findSwingPivots } from '../src/lib/signals.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "findSwingPivots is not exported" / module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/signals.js`:

```js
// Weekly leading-signal engine — pure functions.
// Adapted from range-finder/signal_engine.py for long-term stock entries.
// Runs on weekly OHLCV; reuses core math from indicators.js. Zero API calls.

import { computeRSI, computeMACD, emaArray } from './indicators.js';

// ── Swing pivot detection (N-bar pivot) ──────────────────────────────────────
export function findSwingPivots(arr, pivotBars = 2, direction = 'both') {
  const result = [];
  const n = arr.length;
  for (let i = pivotBars; i < n - pivotBars; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= pivotBars; j++) {
      if (!(arr[i] >= arr[i - j] && arr[i] >= arr[i + j])) isHigh = false;
      if (!(arr[i] <= arr[i - j] && arr[i] <= arr[i + j])) isLow = false;
    }
    if ((direction === 'both' || direction === 'high') && isHigh) {
      result.push({ index: i, value: arr[i] });
    } else if ((direction === 'both' || direction === 'low') && isLow) {
      result.push({ index: i, value: arr[i] });
    }
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add findSwingPivots helper"
```

---

## Task 2: Divergence detector

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { detectDivergence } from '../src/lib/signals.js';

// Helper: build a closes array with an engineered bullish divergence.
// Price makes a lower low on the second swing while momentum lifts.
function bullishDivergenceCloses() {
  // First leg down to a low, bounce, deeper low, then recovery so RSI on the
  // second low is higher than on the first.
  return [
    50, 48, 44, 40, 38, 42, 46, 48, 50, 49,   // first swing low ~38 (deep, weak RSI)
    47, 44, 41, 39, 37, 41, 45, 48, 51, 54,   // second swing low ~37 (lower price, stronger RSI recovery)
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
    // Pure uptrend: each swing low is higher AND RSI higher — no bullish divergence
    const closes = Array.from({ length: 30 }, (_, i) => 50 + i);
    const highs = closes.map(c => c + 1);
    const lows = closes.map(c => c - 1);
    const r = detectDivergence(closes, highs, lows);
    expect(r.type).toBe('NONE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "detectDivergence is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
// ── RSI value at each index (incremental, reuses computeRSI on prefixes) ──────
function rsiAtPivots(closes, pivotIndices, period = 14) {
  const out = {};
  for (const idx of pivotIndices) {
    out[idx] = computeRSI(closes.slice(0, idx + 1), period);
  }
  return out;
}

// ── Divergence: price vs RSI on the two most recent swing lows/highs ──────────
export function detectDivergence(closes, highs, lows, lookback = 30, period = 14) {
  const none = { type: 'NONE', strength: 0, barsAgo: 0 };
  if (!closes || closes.length < period + 4) return none;

  const start = Math.max(0, closes.length - lookback);
  const wClose = closes.slice(start);
  const wHigh = highs.slice(start);
  const wLow = lows.slice(start);

  const swingLows = findSwingPivots(wLow, 2, 'low');
  const swingHighs = findSwingPivots(wHigh, 2, 'high');

  // Bullish: price lower-low, RSI higher-low
  if (swingLows.length >= 2) {
    const a = swingLows[swingLows.length - 2];
    const b = swingLows[swingLows.length - 1];
    const rsi = rsiAtPivots(wClose, [a.index, b.index], period);
    if (rsi[a.index] != null && rsi[b.index] != null &&
        b.value < a.value && rsi[b.index] > rsi[a.index]) {
      const priceDiff = a.value > 0 ? Math.abs(a.value - b.value) / a.value : 0;
      const rsiDiff = Math.min(1, Math.abs(rsi[b.index] - rsi[a.index]) / 50);
      const strength = Math.min(1, (priceDiff + rsiDiff) / 2);
      return { type: 'BULL', strength, barsAgo: wClose.length - 1 - b.index };
    }
  }

  // Bearish: price higher-high, RSI lower-high
  if (swingHighs.length >= 2) {
    const a = swingHighs[swingHighs.length - 2];
    const b = swingHighs[swingHighs.length - 1];
    const rsi = rsiAtPivots(wClose, [a.index, b.index], period);
    if (rsi[a.index] != null && rsi[b.index] != null &&
        b.value > a.value && rsi[b.index] < rsi[a.index]) {
      const priceDiff = a.value > 0 ? Math.abs(b.value - a.value) / a.value : 0;
      const rsiDiff = Math.min(1, Math.abs(rsi[a.index] - rsi[b.index]) / 50);
      const strength = Math.min(1, (priceDiff + rsiDiff) / 2);
      return { type: 'BEAR', strength, barsAgo: wClose.length - 1 - b.index };
    }
  }

  return none;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS. If the `bullishDivergenceCloses` fixture does not produce a BULL (pivot windows depend on exact values), the shape/range/NONE tests still pass — those are the assertions that matter. Do not weaken the "move together → NONE" test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add RSI divergence detector"
```

---

## Task 3: Squeeze detector

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { detectSqueeze } from '../src/lib/signals.js';

describe('detectSqueeze', () => {
  it('returns FLAT for too-short input', () => {
    expect(detectSqueeze([1, 2, 3]).phase).toBe('FLAT');
  });

  it('detects COMPRESSING when bandwidth is shrinking', () => {
    // Start volatile, converge toward a tight value
    const closes = [];
    for (let i = 0; i < 40; i++) {
      const amp = 20 * (1 - i / 40);           // amplitude shrinks over time
      closes.push(100 + (i % 2 === 0 ? amp : -amp));
    }
    const r = detectSqueeze(closes);
    expect(['COMPRESSING', 'SQUEEZE']).toContain(r.phase);
  });

  it('detects EXPANDING when bandwidth is growing', () => {
    const closes = [];
    for (let i = 0; i < 40; i++) {
      const amp = 2 + 20 * (i / 40);           // amplitude grows over time
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "detectSqueeze is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
// ── Bollinger bandwidth series ((upper-lower)/middle * 100) ───────────────────
function bbBandwidthSeries(closes, period = 20, mult = 2) {
  const n = closes.length;
  if (n < period) return [];
  const bw = [];
  for (let i = 0; i <= n - period; i++) {
    const slice = closes.slice(i, i + period);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    bw.push(mean > 0 ? ((2 * mult * std) / mean) * 100 : 0);
  }
  return bw;
}

const SQ_BW_THRESHOLD = 5;       // bandwidth % below which we call it a squeeze
const SQ_COMPRESSION_SLOPE = -0.1;

export function detectSqueeze(closes, period = 20, mult = 2) {
  const flat = { phase: 'FLAT', percentile: 50, currentBw: 0, barsToSqueeze: 99 };
  const bw = bbBandwidthSeries(closes, period, mult);
  if (bw.length < 10) return flat;

  const currentBw = bw[bw.length - 1];
  const tail = bw.slice(-10);

  // Linear regression slope over last 10 bandwidth values
  const xMean = 4.5; // mean of 0..9
  const yMean = tail.reduce((s, v) => s + v, 0) / tail.length;
  let num = 0, den = 0;
  tail.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;

  const percentile = (bw.filter(v => v <= currentBw).length / bw.length) * 100;

  let phase, barsToSqueeze;
  if (currentBw > 0 && currentBw < SQ_BW_THRESHOLD) {
    phase = 'SQUEEZE'; barsToSqueeze = 0;
  } else if (slope < SQ_COMPRESSION_SLOPE && currentBw < 15) {
    phase = 'COMPRESSING';
    barsToSqueeze = slope < 0 ? Math.max(1, Math.round((currentBw - SQ_BW_THRESHOLD) / Math.abs(slope))) : 99;
  } else if (slope > Math.abs(SQ_COMPRESSION_SLOPE)) {
    phase = 'EXPANDING'; barsToSqueeze = 99;
  } else {
    phase = 'FLAT'; barsToSqueeze = 99;
  }

  return { phase, percentile, currentBw, barsToSqueeze };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add BB squeeze detector"
```

---

## Task 4: Volume profile detector

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { detectVolumeProfile } from '../src/lib/signals.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "detectVolumeProfile is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
// ── Volume profile: dry-up (accumulation) vs expansion (breakout) ────────────
export function detectVolumeProfile(volumes, lookback = 12) {
  const neutral = { state: 'NEUTRAL', slopePct: 0, percentile: 50 };
  if (!volumes || volumes.length < lookback) return neutral;

  const vols = volumes.slice(-lookback);
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  if (mean <= 0) return neutral;

  const xMean = (lookback - 1) / 2;
  let num = 0, den = 0;
  vols.forEach((v, i) => { num += (i - xMean) * (v - mean); den += (i - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const slopePct = (slope / mean) * 100;

  const current = vols[vols.length - 1];
  const percentile = (vols.filter(v => v <= current).length / vols.length) * 100;

  let state = 'NEUTRAL';
  if (slopePct < -1.5 && percentile < 45) state = 'DRY_UP';
  else if (slopePct > 1.5 && percentile > 60) state = 'EXPANSION';

  return { state, slopePct, percentile };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add volume profile detector"
```

---

## Task 5: Structure detector

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { detectStructure } from '../src/lib/signals.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "detectStructure is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
const STRUCT_EXHAUSTION_PCT = 0.03; // 3% — swing extremes flattening threshold

export function detectStructure(highs, lows, lookback = 20) {
  const def = { current: 'Neutral', signal: 'STABLE', confidence: 0 };
  if (!highs || highs.length < 5) return def;

  const h = highs.slice(-lookback);
  const l = lows.slice(-lookback);
  const n = h.length;

  // Current regime — same 5-bar logic as indicators' weekly structure
  let current = 'Neutral';
  if (n >= 5) {
    const [h0, h2, h4] = [h[n - 1], h[n - 3], h[n - 5]];
    const [l0, l2, l4] = [l[n - 1], l[n - 3], l[n - 5]];
    if (h0 > h2 && h2 > h4 && l0 > l2 && l2 > l4) current = 'Bullish';
    else if (h0 < h2 && h2 < h4 && l0 < l2 && l2 < l4) current = 'Bearish';
  }

  const swingH = findSwingPivots(h, 2, 'high');
  const swingL = findSwingPivots(l, 2, 'low');

  // Breakout: latest close-region clears the prior swing high
  if (current === 'Bullish' && swingH.length >= 1 && h[n - 1] > swingH[swingH.length - 1].value) {
    return { current, signal: 'BREAKOUT', confidence: 0.6 };
  }

  // Trend exhaustion: swing extremes flattening
  if (current === 'Bullish' && swingH.length >= 2) {
    const prev = swingH[swingH.length - 2].value, last = swingH[swingH.length - 1].value;
    const diff = prev > 0 ? Math.abs(last - prev) / prev : 0;
    if (diff < STRUCT_EXHAUSTION_PCT) {
      return { current, signal: 'TREND_EXHAUSTION', confidence: 1 - diff / STRUCT_EXHAUSTION_PCT };
    }
  }
  if (current === 'Bearish' && swingL.length >= 2) {
    const prev = swingL[swingL.length - 2].value, last = swingL[swingL.length - 1].value;
    const diff = prev > 0 ? Math.abs(last - prev) / prev : 0;
    if (diff < STRUCT_EXHAUSTION_PCT) {
      return { current, signal: 'TREND_EXHAUSTION', confidence: 1 - diff / STRUCT_EXHAUSTION_PCT };
    }
  }

  // Range forming: swing highs and lows converging
  if (swingH.length >= 2 && swingL.length >= 2) {
    const hRange = Math.abs(swingH[swingH.length - 1].value - swingH[swingH.length - 2].value);
    const lRange = Math.abs(swingL[swingL.length - 1].value - swingL[swingL.length - 2].value);
    const avg = (swingH[swingH.length - 1].value + swingL[swingL.length - 1].value) / 2;
    if (avg > 0) {
      const convergence = (hRange + lRange) / avg;
      if (convergence < STRUCT_EXHAUSTION_PCT * 2) {
        return { current, signal: 'RANGE_FORMING', confidence: Math.max(0, 1 - convergence / (STRUCT_EXHAUSTION_PCT * 2)) };
      }
    }
  }

  return { current, signal: 'STABLE', confidence: 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add market structure detector"
```

---

## Task 6: Readiness/ETA helper + Pullback aggregator

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { scorePullbackSetup } from '../src/lib/signals.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "scorePullbackSetup is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
// ── Shared label + readiness derivation ──────────────────────────────────────
function labelForScore(score) {
  if (score >= 7) return 'STRONG SETUP';
  if (score >= 4.5) return 'FORMING';
  if (score > 0) return 'EARLY';
  return 'NO SETUP';
}

function readinessForScore(score, urgencyBonus) {
  const rank = score + urgencyBonus;
  if (rank >= 8) return 'ACT';
  if (rank >= 6) return 'SOON';
  if (rank >= 3.5) return 'WATCH';
  return 'WAIT';
}

// ── Pullback / Accumulation setup ────────────────────────────────────────────
export function scorePullbackSetup({ divergence, structure, volume, rangePos }) {
  const components = [];

  // C1: Bullish divergence (max 3.5)
  let s1 = 0;
  if (divergence.type === 'BULL') {
    s1 = 2 + divergence.strength * 1.5;
    s1 = Math.min(3.5, s1);
  }
  components.push({ label: 'Bullish Divergence', score: round1(s1), max: 3.5,
    detail: divergence.type === 'BULL' ? `str ${(divergence.strength * 100).toFixed(0)}%, ${divergence.barsAgo}w ago` : 'none' });

  // C2: Downtrend exhaustion / range forming (max 2.5)
  let s2 = 0;
  if (structure.current === 'Bearish' && structure.signal === 'TREND_EXHAUSTION') s2 = 1.5 + structure.confidence;
  else if (structure.signal === 'RANGE_FORMING') s2 = structure.confidence * 1.5;
  s2 = Math.min(2.5, s2);
  components.push({ label: 'Downtrend Exhaustion', score: round1(s2), max: 2.5, detail: structure.signal });

  // C3: Volume dry-up (max 2.0)
  const s3 = volume.state === 'DRY_UP' ? 2.0 : volume.slopePct < -1 ? 0.5 : 0;
  components.push({ label: 'Volume Dry-Up', score: round1(s3), max: 2.0, detail: `${volume.state} slope ${volume.slopePct.toFixed(1)}%` });

  // C4: Lower-half of range (max 2.0) — cheaper near the lows
  let s4 = 0;
  if (rangePos != null) {
    if (rangePos < 0.25) s4 = 2.0;
    else if (rangePos < 0.4) s4 = 1.2;
    else if (rangePos < 0.5) s4 = 0.5;
  }
  components.push({ label: 'Range Position', score: round1(s4), max: 2.0,
    detail: rangePos != null ? `${(rangePos * 100).toFixed(0)}th pctile` : 'n/a' });

  const score = Math.min(10, round1(s1 + s2 + s3 + s4));
  const urgencyBonus = (divergence.type === 'BULL' && divergence.barsAgo <= 2) ? 1.5 : 0;
  const readiness = score > 0 ? readinessForScore(score, urgencyBonus) : 'WAIT';
  const etaWeeks = structure.signal === 'TREND_EXHAUSTION' && structure.confidence > 0
    ? Math.max(1, Math.round((1 - structure.confidence) * 6)) : null;

  return { score, label: labelForScore(score), components, readiness, etaWeeks };
}

function round1(v) { return Math.round(v * 10) / 10; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add pullback/accumulation aggregator"
```

---

## Task 7: Momentum aggregator

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { scoreMomentumSetup } from '../src/lib/signals.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "scoreMomentumSetup is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
// ── Momentum / Breakout setup ────────────────────────────────────────────────
export function scoreMomentumSetup({ squeeze, structure, volume, emaReclaim }) {
  const components = [];

  // C1: Squeeze resolving up (max 3.0)
  let s1 = 0;
  if (squeeze.phase === 'SQUEEZE') s1 = emaReclaim ? 3.0 : 2.0;
  else if (squeeze.phase === 'COMPRESSING') {
    if (squeeze.barsToSqueeze <= 5) s1 = 2.0;
    else if (squeeze.barsToSqueeze <= 15) s1 = 1.2;
    else s1 = 0.6;
  }
  components.push({ label: 'Volatility Squeeze', score: round1(s1), max: 3.0,
    detail: `${squeeze.phase} bw ${squeeze.currentBw.toFixed(1)}%` });

  // C2: Structure bullish / breakout (max 3.0)
  let s2 = 0;
  if (structure.signal === 'BREAKOUT') s2 = 3.0;
  else if (structure.current === 'Bullish' && structure.signal === 'STABLE') s2 = 1.5;
  else if (structure.current === 'Bullish') s2 = 2.0;
  components.push({ label: 'Structure Breakout', score: round1(s2), max: 3.0,
    detail: `${structure.current}/${structure.signal}` });

  // C3: Volume expansion (max 2.0)
  const s3 = volume.state === 'EXPANSION' ? 2.0 : volume.slopePct > 1 ? 0.5 : 0;
  components.push({ label: 'Volume Expansion', score: round1(s3), max: 2.0,
    detail: `${volume.state} slope ${volume.slopePct.toFixed(1)}%` });

  // C4: Price reclaiming EMA (max 2.0)
  const s4 = emaReclaim ? 2.0 : 0;
  components.push({ label: 'EMA Reclaim', score: round1(s4), max: 2.0, detail: emaReclaim ? 'above weekly EMA' : 'below EMA' });

  const score = Math.min(10, round1(s1 + s2 + s3 + s4));
  let urgencyBonus = 0;
  if (squeeze.phase === 'SQUEEZE') urgencyBonus = 2;
  else if (squeeze.phase === 'COMPRESSING' && squeeze.barsToSqueeze <= 5) urgencyBonus = 1.5;
  const readiness = score > 0 ? readinessForScore(score, urgencyBonus) : 'WAIT';
  const etaWeeks = squeeze.phase === 'COMPRESSING' && squeeze.barsToSqueeze < 99 ? squeeze.barsToSqueeze : null;

  return { score, label: labelForScore(score), components, readiness, etaWeeks };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add momentum/breakout aggregator"
```

---

## Task 8: Main `computeSetupSignals` orchestrator

**Files:**
- Modify: `src/lib/signals.js`
- Test: `tests/signals.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js`:

```js
import { computeSetupSignals } from '../src/lib/signals.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js`
Expected: FAIL — "computeSetupSignals is not exported".

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/signals.js`:

```js
// ── Main orchestrator ─────────────────────────────────────────────────────────
export function computeSetupSignals(weeklyRaw) {
  if (!weeklyRaw?.c || weeklyRaw.s !== 'ok' || weeklyRaw.c.length < 20) return null;

  const closes = weeklyRaw.c;
  const highs = weeklyRaw.h ?? closes;
  const lows = weeklyRaw.l ?? closes;
  const volumes = weeklyRaw.v ?? [];

  const divergence = detectDivergence(closes, highs, lows);
  const squeeze = detectSqueeze(closes);
  const volume = volumes.length >= 12
    ? detectVolumeProfile(volumes)
    : { state: 'NEUTRAL', slopePct: 0, percentile: 50 };
  const structure = detectStructure(highs, lows);

  // Range position over available weekly history (self-contained — no Finnhub 52w)
  const lo = Math.min(...lows);
  const hi = Math.max(...highs);
  const price = closes[closes.length - 1];
  const rangePos = hi > lo ? (price - lo) / (hi - lo) : null;

  // EMA reclaim: price above weekly EMA10
  const ema10arr = emaArray(closes, 10);
  const ema10 = ema10arr.length ? ema10arr[ema10arr.length - 1] : null;
  const emaReclaim = ema10 != null && price > ema10;

  const pullback = scorePullbackSetup({ divergence, structure, volume, rangePos });
  const momentum = scoreMomentumSetup({ squeeze, structure, volume, emaReclaim });

  return { pullback, momentum };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS — full suite green (indicators + scoring + signals).

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat(signals): add computeSetupSignals orchestrator"
```

---

## Task 9: Wire into App.svelte

**Files:**
- Modify: `src/App.svelte` (import line ~4; TwelveData weekly path ~206-215; Finnhub weekly path ~231-233; supplement persist ~286-290; supplement rehydrate ~354-357; startup candle hydrate ~334-335)

- [ ] **Step 1: Add the import**

In `src/App.svelte`, find:

```js
  import { computeIndicatorsFromCandles, computeWeeklyTrend } from './lib/indicators.js';
```

Replace with:

```js
  import { computeIndicatorsFromCandles, computeWeeklyTrend } from './lib/indicators.js';
  import { computeSetupSignals } from './lib/signals.js';
```

- [ ] **Step 2: TwelveData weekly path — add volume + setups**

Find (the `weeklyRaw` object built from resampled daily bars):

```js
              const wIdx = synthetic.c.map((_, i) => i).filter(i => i % 5 === 0);
              const weeklyRaw = {
                s: 'ok',
                c: wIdx.map(i => synthetic.c[i]),
                h: wIdx.map(i => synthetic.h[i]),
                l: wIdx.map(i => synthetic.l[i]),
                t: wIdx.map(i => synthetic.t[i]),
              };
              const weeklyTrend = computeWeeklyTrend(weeklyRaw);
              if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
```

Replace with:

```js
              const wIdx = synthetic.c.map((_, i) => i).filter(i => i % 5 === 0);
              const weeklyRaw = {
                s: 'ok',
                c: wIdx.map(i => synthetic.c[i]),
                h: wIdx.map(i => synthetic.h[i]),
                l: wIdx.map(i => synthetic.l[i]),
                v: wIdx.map(i => synthetic.v[i]),
                t: wIdx.map(i => synthetic.t[i]),
              };
              const weeklyTrend = computeWeeklyTrend(weeklyRaw);
              if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
              const setups = computeSetupSignals(weeklyRaw);
              if (setups) results[ticker.symbol].setups = setups;
```

- [ ] **Step 3: Finnhub weekly path — add setups**

Find:

```js
            const weeklyFromTs = toTs - 52 * 7 * 86400;
            const weeklyRes = await fetchCandles(ticker.symbol, 'W', weeklyFromTs, toTs);
            const weeklyTrend = computeWeeklyTrend(weeklyRes?.data);
            if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
```

Replace with:

```js
            const weeklyFromTs = toTs - 52 * 7 * 86400;
            const weeklyRes = await fetchCandles(ticker.symbol, 'W', weeklyFromTs, toTs);
            const weeklyTrend = computeWeeklyTrend(weeklyRes?.data);
            if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
            const setups = computeSetupSignals(weeklyRes?.data);
            if (setups) results[ticker.symbol].setups = setups;
```

- [ ] **Step 4: Persist setups in the supplement**

Find:

```js
            weekly:      d.weekly      ?? null,
            sectorTrend: d.sectorTrend ?? null,
```

Replace with:

```js
            weekly:      d.weekly      ?? null,
            setups:      d.setups      ?? null,
            sectorTrend: d.sectorTrend ?? null,
```

- [ ] **Step 5: Rehydrate setups from the supplement**

Find:

```js
            if (s.weekly      != null) results[sym].weekly      = s.weekly;
            if (s.sectorTrend != null) results[sym].sectorTrend = s.sectorTrend;
```

Replace with:

```js
            if (s.weekly      != null) results[sym].weekly      = s.weekly;
            if (s.setups      != null) results[sym].setups      = s.setups;
            if (s.sectorTrend != null) results[sym].sectorTrend = s.sectorTrend;
```

- [ ] **Step 6: Recompute setups from cached weekly candles on startup**

Find:

```js
      if (data._candlesWeekly) { const wt  = computeWeeklyTrend(data._candlesWeekly);           if (wt)  data.weekly    = wt;  }
```

Replace with:

```js
      if (data._candlesWeekly) { const wt  = computeWeeklyTrend(data._candlesWeekly);           if (wt)  data.weekly    = wt;  }
      if (data._candlesWeekly) { const st  = computeSetupSignals(data._candlesWeekly);          if (st)  data.setups    = st;  }
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: builds with no errors. (No unit test for Svelte wiring; the build is the gate.)

- [ ] **Step 8: Commit**

```bash
git add src/App.svelte
git commit -m "feat(signals): wire computeSetupSignals into refresh + cache paths"
```

---

## Task 10: Tooltip definitions

**Files:**
- Modify: `src/lib/tooltipDefs.js` (add two entries near `weeklyTrend`, before the closing of the exported object)

- [ ] **Step 1: Add the tooltip definitions**

In `src/lib/tooltipDefs.js`, find the `weeklyTrend: { ... },` block and add immediately after its closing `},`:

```js
  setupPullback: {
    title: 'Pullback Setup',
    subtitle: 'Accumulation / Reversal Timing (weekly)',
    category: 'Entry Timing',
    description: 'A leading score (0–10) for buying weakness before the turn: bullish RSI divergence at the lows, downtrend exhaustion, volume dry-up, and price in the lower half of its range. Built on weekly candles for months-to-year holds.',
    levels: [
      { range: '7–10', label: 'Strong Setup', color: C.green, desc: 'Multiple accumulation signals aligned — reversal forming. Watch for entry.' },
      { range: '4.5–7', label: 'Forming',      color: C.amber, desc: 'Setup developing — some signals present, not yet confirmed.' },
      { range: '0–4.5', label: 'Early / None',  color: C.dim,   desc: 'Little or no accumulation signal yet.' },
    ],
    why: 'Buying a quality name at a local top is the classic timing error. This catches bottoming structure before the lagging score reacts.',
  },

  setupMomentum: {
    title: 'Momentum Setup',
    subtitle: 'Breakout / Base Confirmation (weekly)',
    category: 'Entry Timing',
    description: 'A leading score (0–10) for buying strength as a trend starts: weekly Bollinger squeeze resolving, structure breaking out, volume expansion, and price reclaiming the weekly EMA. Built for months-to-year holds.',
    levels: [
      { range: '7–10', label: 'Strong Setup', color: C.green, desc: 'Squeeze + breakout + volume aligned — trend ignition likely.' },
      { range: '4.5–7', label: 'Forming',      color: C.amber, desc: 'Base tightening — breakout not yet confirmed.' },
      { range: '0–4.5', label: 'Early / None',  color: C.dim,   desc: 'No breakout setup forming.' },
    ],
    why: 'The best multi-month trends start from a tight base with expanding volume. This flags that ignition window before price has run.',
  },
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tooltipDefs.js
git commit -m "feat(signals): add setup tooltip definitions"
```

---

## Task 11: UI — table badge + expanded-row block

**Files:**
- Modify: `src/lib/components/WatchlistTable.svelte` (add a compact badge in the row; follow the existing badge/cell pattern)
- Modify: `src/lib/components/FundamentalsBar.svelte` (add the expanded setup block)

> **Note for implementer:** Read each component first to match its existing markup, class names, and how it accesses ticker data (e.g. `data.setups`). The exact cell placement is a visual judgment — follow the patterns already in the file. Below is the minimum logic each must render.

- [ ] **Step 1: WatchlistTable — derive and render the badge**

In `src/lib/components/WatchlistTable.svelte`, where per-row derived values are computed, add a helper that picks the stronger setup:

```js
  function topSetup(setups) {
    if (!setups) return null;
    const p = setups.pullback, m = setups.momentum;
    const best = (m.score > p.score) ? { ...m, kind: 'BREAKOUT' } : { ...p, kind: 'PULLBACK' };
    if (best.readiness === 'WAIT' || best.score < 4.5) return null; // hide noise
    return best;
  }
```

Render (place in an existing cell, matching sibling badge markup — colors: ACT/green, SOON/amber, WATCH/dim):

```svelte
{#if topSetup(data.setups)}
  {@const su = topSetup(data.setups)}
  <span class="setup-badge" class:act={su.readiness === 'ACT'} class:soon={su.readiness === 'SOON'}>
    {su.kind} · {su.readiness}{su.etaWeeks ? ` · ~${su.etaWeeks}w` : ''}
  </span>
{/if}
```

Add minimal styling consistent with existing badges (reuse an existing badge class if present rather than inventing new CSS).

- [ ] **Step 2: FundamentalsBar — render both setups with components**

In `src/lib/components/FundamentalsBar.svelte`, add a block (gated on `data.setups`) that renders each setup with its component bars, reusing the existing tooltip action (`use:tooltip` pattern) bound to `setupPullback` / `setupMomentum`:

```svelte
{#if data.setups}
  <div class="setups">
    {#each [['Pullback', data.setups.pullback, 'setupPullback'], ['Momentum', data.setups.momentum, 'setupMomentum']] as [name, su, tipKey]}
      <div class="setup">
        <span class="setup-head" use:tooltip={tipKey}>
          {name}: {su.score.toFixed(1)}/10 · {su.label} · {su.readiness}{su.etaWeeks ? ` (~${su.etaWeeks}w)` : ''}
        </span>
        <div class="setup-components">
          {#each su.components as c}
            <div class="comp" title={c.detail}>
              <span class="comp-label">{c.label}</span>
              <span class="comp-bar"><span class="comp-fill" style="width:{(c.score / c.max) * 100}%"></span></span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{/if}
```

Match the surrounding component's CSS conventions for the new classes (reuse existing bar styles where they exist).

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: builds clean.

- [ ] **Step 4: Manual smoke check**

Run: `npm run dev`, open the app. With no API key it loads demo mode — confirm no console errors. (Demo tickers have no `setups`, so the blocks are simply absent; that is expected and correct.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/WatchlistTable.svelte src/lib/components/FundamentalsBar.svelte
git commit -m "feat(signals): surface setup badge and expanded-row block"
```

---

## Task 12: Documentation

**Files:**
- Modify: `README.md` (Testing section test count + a feature bullet under Scoring Engine; Changelog entry)
- Modify: `CLAUDE.md` (Project State — add signals.js to key files + a Setup signals subsection)
- Modify: `ROADMAP.md` (mark shipped items)

- [ ] **Step 1: README — update test count and add feature note**

In `README.md`, in the Testing section, change "79 unit tests" to the new total (run `npm test` and read the passing count), and add a row to the suite table:

```
| `signals.js` | Swing pivots, divergence, squeeze, volume profile, structure, both setup aggregators, orchestrator null guards |
```

Add a bullet under the Scoring Engine feature list:

```
- **Weekly Setup Signals (leading)** — two separately-scored entry timers built on weekly candles: **Pullback/Accumulation** (bullish divergence + downtrend exhaustion + volume dry-up) and **Momentum/Breakout** (squeeze resolving + structure breakout + volume expansion). Each shows a 0–10 score, readiness (WATCH/SOON/ACT), and an ETA in weeks. Zero extra API calls.
```

Add a Changelog entry at the top:

```
### v0.10 (2026-06-14)
- **Weekly Setup Signals** — leading-indicator layer adapted from grid-bot signal research: Pullback (accumulation) and Momentum (breakout) setups scored 0–10 on weekly candles, with readiness + ETA. Surfaced as a table badge and an expanded-row component breakdown with tooltips. No new API calls.
```

- [ ] **Step 2: CLAUDE.md — document signals.js**

In `CLAUDE.md` under "Key files", add to the `src/lib/` list:

```
  signals.js          — weekly leading-signal engine (divergence, squeeze, volume, structure → Pullback + Momentum setups)
```

And add a subsection after "Indicator math (indicators.js)":

```
## Setup signals (signals.js)

Leading-signal layer on **weekly** candles (adapted from the range-finder crypto project). Two separately-scored setups per ticker:
- **Pullback / Accumulation** (0–10): bullish RSI divergence + downtrend exhaustion + volume dry-up + lower-half range position.
- **Momentum / Breakout** (0–10): BB squeeze resolving + structure breakout + volume expansion + EMA reclaim.

Each returns `{ score, label, components[], readiness: WAIT/WATCH/SOON/ACT, etaWeeks }`. Entry point `computeSetupSignals(weeklyRaw)`; returns null if < 20 weekly bars. Wired in App.svelte on the existing weekly candle fetch — zero new API calls. Crypto-only inputs (funding, OI, order-flow CVD) were intentionally dropped.
```

- [ ] **Step 3: ROADMAP — mark shipped**

In `ROADMAP.md`, mark the now-shipped items (Volume dry-up detection, and the divergence/squeeze elements covered) as done with a `✅ v0.10` note. Leave un-shipped items intact.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all suites green (indicators + scoring + signals).

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md ROADMAP.md
git commit -m "docs: document weekly setup signals (v0.10)"
```

---

## Self-Review Notes

- **Spec coverage:** divergence (T2), squeeze (T3), volume (T4), structure (T5), two aggregators (T6/T7), orchestrator with self-contained range position + null guards (T8), App.svelte wiring all three weekly paths + persist/rehydrate (T9), tooltips (T10), UI badge + expanded block (T11), docs (T12). All spec sections covered.
- **Type consistency:** `SetupResult` fields (`score`, `label`, `components`, `readiness`, `etaWeeks`) identical across T6/T7/T8 and consumed unchanged in T11. Detector result shapes match aggregator inputs.
- **Data constraint honored:** orchestrator computes `rangePos` from weekly candles directly (no Finnhub 52w dependency), and degrades to NEUTRAL volume when < 12 weekly bars — consistent with the ~52-bar limit noted in the spec.
- **No placeholders:** every code step contains complete code. T11's exact cell placement is explicitly delegated to the implementer's reading of the component (visual judgment), with the required render logic fully specified.
```

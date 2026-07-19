# Long-Term Timing Score + Technical Patterns (Slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure Timing Score engine (`computeTimingScore`) and its new technical-pattern primitives, returning the spec's `TimingScore` shape — no UI, no Quality Score, no decision function (those are Slices 2 and 3).

**Architecture:** One new pure-logic module `technicalPatterns.js` (new primitives only), one new module `timingScore.js` (composition), a `resampleMonthly` addition to `indicators.js` (mirrors existing `resampleWeekly`), and a one-line deepening of the daily-candle fetch window so monthly RSI can populate. Everything composes existing, already-tested functions (`computeRSI`, `computeMACD`, `detectDivergence`, `emaArray`) — new code matches their conventions exactly.

**Tech Stack:** Svelte 5 + Vite, Vitest, plain JavaScript with JSDoc (this project has zero TypeScript — the parent spec's `.ts`/`type` notation is realized as `.js` + `@typedef`).

**Spec:** `docs/superpowers/specs/2026-07-18-long-term-timing-score-slice1-design.md`.

## Global Constraints

- **Plain JS + JSDoc only.** No `.ts` files, no `type` keyword. Use `@typedef`/`@param`/`@returns` like `dip.js`.
- **Zero new API endpoints.** The only fetch change is deepening the existing daily-candle window (Task 2). No new Finnhub calls.
- **Null-safe, never zero, never throw.** Any missing/non-finite input → the affected component is `null` and omitted from the total (never a fake `0`). Insufficient history → the primitive returns `null`/`false`. If every component is null, `total` is `null` and `label` is `'WAIT'`.
- **Match existing indicator conventions exactly:** RSI = Wilder's smoothing via `computeRSI` (do not reimplement); EMA via `emaArray` (SMA seed, `k=2/(period+1)`); Bollinger Bands use population variance (÷N). `emaArray` returns a sparse array whose indices `0..period-2` are `undefined` — always guard with `!= null`.
- **Raw candle shape** everywhere: `{ s: 'ok', t: number[], o: number[], h: number[], l: number[], c: number[], v: number[] }`, ascending by time. This is what `fetchCandles` returns and what `resampleWeekly`/`computeIndicatorsFromCandles` consume.
- **Component maxes (sum to 100):** drawdown 20 · oversold 20 · reversal 20 · consolidation 15 · volumeBehavior 15 · marketContext 10.
- **Label thresholds:** `STRONG_ACCUMULATION_ZONE ≥ 70 · WATCHLIST 50–69 · NEUTRAL 30–49 · WAIT < 30 (or null)`.
- **Test style:** Vitest, matching `tests/*.test.js`. Real inputs and assertions — no mocks of the functions under test.

---

### Task 1: `resampleMonthly` in `indicators.js`

**Files:**
- Modify: `src/lib/indicators.js` (add after `resampleWeekly`, which ends at line 389)
- Test: `tests/indicators.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `resampleMonthly(raw) → { s, t, o, h, l, c, v }|null` — groups daily bars into calendar months (UTC), open = first bar of month, high = max, low = min, close = last, volume = sum. Includes the current partial month. Task 5 (`timingScore.js`) imports it.

- [ ] **Step 1: Write the failing tests**

In `tests/indicators.test.js`, add `resampleMonthly` to the import list at the top (next to `resampleWeekly` if present, otherwise add it):

```js
  resampleMonthly,
```

Add this describe block after the existing `resampleWeekly` tests (or at the end of the file if there are none):

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/indicators.test.js`
Expected: FAIL — `resampleMonthly is not a function` / import error.

- [ ] **Step 3: Implement `resampleMonthly`**

In `src/lib/indicators.js`, directly after the closing `}` of `resampleWeekly` (line 389), insert:

```js

// ── Daily → monthly OHLCV resampling ─────────────────────────────────────────
// Groups daily bars into calendar months (UTC): open = first, high = max,
// low = min, close = last, volume = sum. Includes the current partial month,
// so monthly signals reflect the latest trading day. Mirrors resampleWeekly.
export function resampleMonthly(raw) {
  if (!raw?.c?.length || raw.s !== 'ok' || !raw.t || raw.t.length !== raw.c.length) return null;
  const monthKey = (ts) => {
    const d = new Date(ts * 1000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };
  const out = { s: 'ok', t: [], o: [], h: [], l: [], c: [], v: [] };
  let key = null;
  for (let i = 0; i < raw.c.length; i++) {
    const k = monthKey(raw.t[i]);
    if (k !== key) {
      key = k;
      out.t.push(raw.t[i]);
      out.o.push(raw.o?.[i] ?? raw.c[i]);
      out.h.push(raw.h?.[i] ?? raw.c[i]);
      out.l.push(raw.l?.[i] ?? raw.c[i]);
      out.c.push(raw.c[i]);
      out.v.push(raw.v?.[i] ?? 0);
    } else {
      const j = out.c.length - 1;
      out.h[j] = Math.max(out.h[j], raw.h?.[i] ?? raw.c[i]);
      out.l[j] = Math.min(out.l[j], raw.l?.[i] ?? raw.c[i]);
      out.c[j] = raw.c[i];
      out.v[j] += raw.v?.[i] ?? 0;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/indicators.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indicators.js tests/indicators.test.js
git commit -m "feat: add resampleMonthly for monthly candle aggregation

Build by Peter"
```

---

### Task 2: Deepen the daily-candle fetch window

**Files:**
- Modify: `src/App.svelte:161-162` (the `fromTs`/`toTs` window feeding the per-ticker daily and SPY candle fetches)

**Interfaces:**
- Consumes: nothing.
- Produces: no new symbols — a runtime data-depth change so monthly RSI(14) has ≥15 monthly bars. No test (Svelte/App wiring is verified by build, matching this project's convention).

- [ ] **Step 1: Widen the daily fetch window**

In `src/App.svelte`, find (around line 161-162):

```js
      const toTs = Math.floor(Date.now() / 1000);
      const fromTs = toTs - 365 * 86400; // 365 calendar days ≈ 260 trading days — required for EMA200
```

Replace with:

```js
      const toTs = Math.floor(Date.now() / 1000);
      const fromTs = toTs - 600 * 86400; // ~600 calendar days ≈ 415 trading days ≈ 19 monthly bars — EMA200 + monthly RSI(14)
```

(Same endpoint, same cache key `${symbol}_D`, same call count — just more history. Trailing-window indicators are unaffected; monthly RSI now has enough bars to compute. Newly-listed tickers still degrade to a null monthly RSI.)

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds, no errors.

Run: `npm test`
Expected: PASS — full suite still green (no test targets this change; this confirms no regression).

- [ ] **Step 3: Commit**

```bash
git add src/App.svelte
git commit -m "feat: deepen daily candle history to ~600d for monthly RSI

Build by Peter"
```

---

### Task 3: `technicalPatterns.js` — structure primitives

**Files:**
- Create: `src/lib/technicalPatterns.js`
- Test: `tests/technicalPatterns.test.js` (new)

**Interfaces:**
- Consumes: `emaArray` from `src/lib/indicators.js` (import; used in Task 4, kept out of this task's functions).
- Produces (Task 5 imports all):
  - `drawdownFrom52wHigh(closes, window = 252) → number|null` — percent (negative) of the last close below the rolling max of the last `window` closes.
  - `bbWidthPercentile(closes, lookback = 126, period = 20, mult = 2) → { width, percentile }|null` — current Bollinger bandwidth and its percentile rank (`v <= current`) over the last `lookback` bandwidth values.
  - `detectConsolidation(raw, maxRangePct = 15, minDays = 20) → { days, rangePct, high, low }|null` — longest trailing run where the high-low range stays within `maxRangePct`; null if under `minDays`.
  - `breakoutConfirmation(raw, consolidationHigh, volMult = 1.5, avgWindow = 20) → boolean` — last close above `consolidationHigh` on volume above `volMult` × trailing-average.

- [ ] **Step 1: Write the failing tests**

Create `tests/technicalPatterns.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/technicalPatterns.test.js`
Expected: FAIL — module `technicalPatterns.js` does not exist.

- [ ] **Step 3: Implement the structure primitives**

Create `src/lib/technicalPatterns.js`:

```js
// Technical-pattern primitives for the Long-Term Timing Score (Slice 1).
// Pure functions over the raw candle shape { s, t[], o[], h[], l[], c[], v[] }.
// Every function returns null / false on insufficient or invalid input —
// never a fake 0, never a throw. Bollinger math uses population variance to
// match computeBBLocal/computeBBSeries in indicators.js.
// (emaArray is imported in Task 4, when the first function that needs it lands.)

/**
 * Percent of the last close below the rolling max of the last `window` closes.
 * @returns {number|null} negative percent, or null if invalid
 */
export function drawdownFrom52wHigh(closes, window = 252) {
  if (!closes || closes.length < 2) return null;
  const slice = closes.slice(-window);
  const hi = Math.max(...slice);
  const price = closes[closes.length - 1];
  if (!(hi > 0)) return null;
  return ((price - hi) / hi) * 100;
}

/**
 * Current Bollinger bandwidth ((upper-lower)/middle * 100) and its percentile
 * rank over the last `lookback` bandwidth values (share of values <= current).
 * @returns {{ width: number, percentile: number }|null}
 */
export function bbWidthPercentile(closes, lookback = 126, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const bw = [];
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1);
    const mean = win.reduce((s, v) => s + v, 0) / period;
    const variance = win.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    bw.push(mean > 0 ? (((mean + mult * sd) - (mean - mult * sd)) / mean) * 100 : 0);
  }
  if (bw.length < 2) return null;
  const series = bw.slice(-lookback);
  const current = series[series.length - 1];
  const percentile = (series.filter(v => v <= current).length / series.length) * 100;
  return { width: current, percentile };
}

/**
 * Longest trailing run (ending at the last bar) where the high-low range stays
 * within `maxRangePct`. Returns null if that run is shorter than `minDays`.
 * @returns {{ days: number, rangePct: number, high: number, low: number }|null}
 */
export function detectConsolidation(raw, maxRangePct = 15, minDays = 20) {
  const h = raw?.h, l = raw?.l;
  if (!h || !l || h.length < minDays) return null;
  const n = h.length;
  let hi = h[n - 1], lo = l[n - 1];
  let best = null;
  for (let len = 1; len <= n; len++) {
    const idx = n - len;
    hi = Math.max(hi, h[idx]);
    lo = Math.min(lo, l[idx]);
    const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : Infinity;
    if (rangePct <= maxRangePct) best = { days: len, rangePct, high: hi, low: lo };
    else break; // once an older bar breaks the range, the trailing run ends
  }
  return best && best.days >= minDays ? best : null;
}

/**
 * True when the last close is above `consolidationHigh` and the last volume is
 * above `volMult` x the average of the preceding `avgWindow` volumes.
 * @returns {boolean}
 */
export function breakoutConfirmation(raw, consolidationHigh, volMult = 1.5, avgWindow = 20) {
  const c = raw?.c, v = raw?.v;
  if (!c || !v || c.length < avgWindow + 1 || consolidationHigh == null) return false;
  const lastClose = c[c.length - 1];
  const lastVol = v[v.length - 1];
  const prior = v.slice(-avgWindow - 1, -1);
  const avg = prior.reduce((s, x) => s + (x ?? 0), 0) / prior.length;
  return lastClose > consolidationHigh && avg > 0 && lastVol > volMult * avg;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/technicalPatterns.test.js`
Expected: PASS — all structure-primitive tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/technicalPatterns.js tests/technicalPatterns.test.js
git commit -m "feat: add structure primitives (drawdown, BB width pctile, consolidation, breakout)

Build by Peter"
```

---

### Task 4: `technicalPatterns.js` — momentum & volume primitives

**Files:**
- Modify: `src/lib/technicalPatterns.js` (append)
- Test: `tests/technicalPatterns.test.js` (append)

**Interfaces:**
- Consumes: `emaArray` from `indicators.js` (already imported in Task 3).
- Produces (Task 5 imports all):
  - `emaReclaim(raw, period = 20, minBelow = 3) → boolean` — last close above EMA(period) after the previous `minBelow` closes were all below it.
  - `macdHistogramImproving(closes, streak = 3, fast = 12, slow = 26, signal = 9) → boolean` — MACD histogram strictly rising over the last `streak` intervals (even if still negative).
  - `upDownVolumeRatio(raw, window = 10) → number|null` — sum of up-day volume ÷ sum of down-day volume over the last `window` days (`Infinity` if there is up-volume but no down-volume; `null` if neither).
  - `detectCapitulation(raw, opts?) → { detected: boolean, dates: number[] }` — high-volume down days with a climax/reversal close, occurring within a prior downtrend, in the last `lookback` days.

- [ ] **Step 1: Write the failing tests**

Append to `tests/technicalPatterns.test.js` — first extend the import at the top:

```js
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
```

Then append these describe blocks:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/technicalPatterns.test.js`
Expected: FAIL — the four new functions are not exported yet.

- [ ] **Step 3: Implement the momentum & volume primitives**

First, add the `emaArray` import at the very top of `src/lib/technicalPatterns.js` (these functions are the first to need it), directly under the header comment block:

```js
import { emaArray } from './indicators.js';
```

Then append to the end of `src/lib/technicalPatterns.js`:

```js

/**
 * True when the last close is above EMA(period) and the previous `minBelow`
 * closes were all below their EMA — a reclaim after a stretch under the line.
 * @returns {boolean}
 */
export function emaReclaim(raw, period = 20, minBelow = 3) {
  const c = raw?.c;
  if (!c || c.length < period + minBelow + 1) return false;
  const ema = emaArray(c, period);
  const n = c.length;
  if (ema[n - 1] == null || !(c[n - 1] > ema[n - 1])) return false;
  for (let k = 2; k <= minBelow + 1; k++) {
    const idx = n - k;
    if (ema[idx] == null || c[idx] >= ema[idx]) return false;
  }
  return true;
}

/**
 * True when the MACD histogram strictly rises over the last `streak` intervals
 * (checks `streak + 1` histogram points), even if the histogram is still
 * negative. MACD line/signal use emaArray to match computeMACD's convention.
 * @returns {boolean}
 */
export function macdHistogramImproving(closes, streak = 3, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal + streak) return false;
  const ema12 = emaArray(closes, fast);
  const ema26 = emaArray(closes, slow);
  const macd = [];
  for (let i = slow - 1; i < closes.length; i++) macd.push(ema12[i] - ema26[i]);
  const sig = emaArray(macd, signal);
  const hist = [];
  for (let i = signal - 1; i < macd.length; i++) hist.push(macd[i] - sig[i]);
  if (hist.length < streak + 1) return false;
  const tail = hist.slice(-(streak + 1));
  for (let i = 1; i < tail.length; i++) if (!(tail[i] > tail[i - 1])) return false;
  return true;
}

/**
 * Up-day volume ÷ down-day volume over the last `window` days.
 * @returns {number|null} Infinity if up-volume with no down days; null if neither
 */
export function upDownVolumeRatio(raw, window = 10) {
  const c = raw?.c, v = raw?.v;
  if (!c || !v || c.length < window + 1) return null;
  let up = 0, down = 0;
  for (let i = Math.max(1, c.length - window); i < c.length; i++) {
    const vol = v[i] ?? 0;
    if (c[i] > c[i - 1]) up += vol;
    else if (c[i] < c[i - 1]) down += vol;
  }
  if (down === 0) return up > 0 ? Infinity : null;
  return up / down;
}

/**
 * Detects capitulation-style days in the last `lookback` bars: a down day with
 * volume >= volMult x the trailing `avgWindow`-day average, occurring after a
 * prior decline (`minPriorDowntrend` days ago higher than now), whose close
 * sits in the lower third (climax selloff) or upper third (intraday reversal)
 * of the day's range.
 * @returns {{ detected: boolean, dates: number[] }}
 */
export function detectCapitulation(raw, { lookback = 15, volMult = 1.8, minPriorDowntrend = 10, avgWindow = 20 } = {}) {
  const c = raw?.c, h = raw?.h, l = raw?.l, v = raw?.v, t = raw?.t;
  if (!c || !h || !l || !v) return { detected: false, dates: [] };
  const n = c.length;
  const need = avgWindow + minPriorDowntrend + 1;
  if (n < need) return { detected: false, dates: [] };
  const dates = [];
  const startI = Math.max(need - 1, n - lookback);
  for (let i = startI; i < n; i++) {
    if (c[i] >= c[i - 1]) continue;
    const priorVols = v.slice(i - avgWindow, i);
    const avg = priorVols.reduce((s, x) => s + (x ?? 0), 0) / priorVols.length;
    if (!(avg > 0) || v[i] < volMult * avg) continue;
    if (!(c[i - minPriorDowntrend] > c[i])) continue;
    const range = h[i] - l[i];
    if (range <= 0) continue;
    const closePos = (c[i] - l[i]) / range;
    if (closePos <= 1 / 3 || closePos >= 2 / 3) dates.push(t?.[i] ?? i);
  }
  return { detected: dates.length > 0, dates };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/technicalPatterns.test.js`
Expected: PASS — all technicalPatterns tests (Task 3 + Task 4) green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/technicalPatterns.js tests/technicalPatterns.test.js
git commit -m "feat: add momentum/volume primitives (EMA reclaim, MACD trend, up/down vol, capitulation)

Build by Peter"
```

---

### Task 5: `timingScore.js` — `computeTimingScore`

**Files:**
- Create: `src/lib/timingScore.js`
- Test: `tests/timingScore.test.js` (new)

**Interfaces:**
- Consumes:
  - `computeRSI`, `computeMACD`, `resampleMonthly` from `src/lib/indicators.js`
  - `detectDivergence` from `src/lib/signals.js` — signature `detectDivergence(closes, highs, lows, lookback=30, period=14) → { type: 'BULL'|'BEAR'|'NONE', strength, barsAgo }`
  - all eight primitives from `src/lib/technicalPatterns.js` (Tasks 3–4)
- Produces: `computeTimingScore(input) → TimingScore` (the shape below). Slice 3 will call this and render the result.

```js
/**
 * @typedef {Object} TimingScore
 * @property {number|null} total
 * @property {'STRONG_ACCUMULATION_ZONE'|'WATCHLIST'|'NEUTRAL'|'WAIT'} label
 * @property {{drawdown:number|null, oversold:number|null, reversal:number|null,
 *   consolidation:number|null, volumeBehavior:number|null, marketContext:number|null}} components
 * @property {string[]} signals
 * @property {string[]} warnings
 */
```

`computeTimingScore(input)` accepts:
- `input.dailyCandles` — raw daily candle object (`{ s,t,o,h,l,c,v }`), ~415 bars.
- `input.weeklyCandles` — raw weekly candle object (already fetched by the app).
- `input.marketContext` — `{ spyAboveEma50?: boolean, spyDowntrend?: boolean, fearGreed?: number, volProxy?: number, sectorOutperforming?: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/timingScore.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/timingScore.test.js`
Expected: FAIL — module `timingScore.js` does not exist.

- [ ] **Step 3: Implement `computeTimingScore`**

Create `src/lib/timingScore.js`:

```js
// Long-Term Timing Score (Slice 1) — pure composition of technical primitives.
// Measures only whether the moment is attractive for accumulation; it never
// says "buy" on its own (that is Slice 3's buildLongTermSetup). Null-safe:
// a component is null when its inputs are missing, and is omitted from the
// total; all-null → total null, label WAIT.

import { computeRSI, computeMACD, resampleMonthly } from './indicators.js';
import { detectDivergence } from './signals.js';
import {
  drawdownFrom52wHigh,
  bbWidthPercentile,
  detectConsolidation,
  breakoutConfirmation,
  emaReclaim,
  macdHistogramImproving,
  upDownVolumeRatio,
  detectCapitulation,
} from './technicalPatterns.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cap = (v, max) => Math.min(v, max);

function labelForTiming(total) {
  if (total == null) return 'WAIT';
  if (total >= 70) return 'STRONG_ACCUMULATION_ZONE';
  if (total >= 50) return 'WATCHLIST';
  if (total >= 30) return 'NEUTRAL';
  return 'WAIT';
}

/**
 * @param {{ dailyCandles?: object, weeklyCandles?: object, marketContext?: object }} input
 * @returns {TimingScore}
 */
export function computeTimingScore(input = {}) {
  const { dailyCandles, weeklyCandles, marketContext = {} } = input;
  const signals = [];
  const warnings = [];
  const components = {
    drawdown: null, oversold: null, reversal: null,
    consolidation: null, volumeBehavior: null, marketContext: null,
  };

  const dOk = !!(dailyCandles?.c?.length && dailyCandles.s === 'ok');
  const dCloses = dOk ? dailyCandles.c : null;

  // ── Drawdown (max 20) ──
  if (dCloses) {
    const dd = drawdownFrom52wHigh(dCloses);
    if (dd != null) {
      let pts;
      if (dd <= -40) { pts = 20; warnings.push('Deep drawdown: verify whether the investment thesis changed'); }
      else if (dd <= -25) pts = 18;
      else if (dd <= -15) pts = 12;
      else if (dd <= -10) pts = 6;
      else pts = 2;
      components.drawdown = pts;
      signals.push(`Drawdown ${dd.toFixed(1)}% from 52-week high`);
    }
  }

  // ── Oversold multi-timeframe (max 20) ──
  const dRsi = dCloses ? computeRSI(dCloses) : null;
  const wRsi = weeklyCandles?.c?.length ? computeRSI(weeklyCandles.c) : null;
  const monthly = dOk ? resampleMonthly(dailyCandles) : null;
  const mRsi = monthly?.c?.length ? computeRSI(monthly.c) : null;
  if (dRsi != null || wRsi != null || mRsi != null) {
    let pts = 0;
    if (dRsi != null) pts += dRsi < 30 ? 6 : dRsi <= 35 ? 3 : 0;
    if (wRsi != null) pts += wRsi < 35 ? 6 : wRsi <= 40 ? 3 : 0;
    if (mRsi != null) pts += mRsi < 40 ? 8 : mRsi <= 45 ? 4 : 0;
    components.oversold = cap(pts, 20);
    const r = (x) => (x == null ? 'n/a' : x.toFixed(0));
    signals.push(`Daily RSI ${r(dRsi)} | Weekly RSI ${r(wRsi)} | Monthly RSI ${r(mRsi)}`);
  }

  // ── Reversal confirmation (max 20) ──
  if (dCloses && dailyCandles.h && dailyCandles.l) {
    let pts = 0;
    const div = detectDivergence(dCloses, dailyCandles.h, dailyCandles.l);
    if (div?.type === 'BULL') { pts += 8; signals.push('Bullish RSI divergence detected'); }
    if (emaReclaim(dailyCandles)) { pts += 5; signals.push('Reclaimed the 20-day EMA'); }
    if (macdHistogramImproving(dCloses)) { pts += 4; signals.push('MACD histogram improving 3 days'); }
    const macd = computeMACD(dCloses);
    if (macd?.crossover === 'bullish_cross') { pts += 3; signals.push('MACD bullish crossover'); }
    components.reversal = cap(pts, 20);
  }

  // ── Consolidation quality (max 15) ──
  let consolidationHigh = null;
  if (dCloses) {
    let pts = 0;
    const bb = bbWidthPercentile(dCloses);
    if (bb) pts += bb.percentile < 10 ? 8 : bb.percentile < 20 ? 5 : bb.percentile < 30 ? 2 : 0;
    const con = detectConsolidation(dailyCandles);
    if (con) {
      pts += con.days >= 60 ? 7 : con.days >= 40 ? 4 : con.days >= 20 ? 2 : 0;
      consolidationHigh = con.high;
      signals.push(`Consolidation: ${con.days} trading days, range ${con.rangePct.toFixed(1)}%${bb ? `, BB Width percentile ${bb.percentile.toFixed(0)}` : ''}`);
    }
    if (bb || con) components.consolidation = cap(pts, 15);
  }

  // ── Volume behavior (max 15) ──
  if (dCloses && dailyCandles.v) {
    let pts = 0;
    const capit = detectCapitulation(dailyCandles);
    if (capit.detected) { pts += 6; signals.push('Capitulation-style volume detected'); }
    const udr = upDownVolumeRatio(dailyCandles);
    if (udr != null) {
      if (udr > 1.3) pts += 6;
      else if (udr >= 1.0) pts += 3;
      else if (udr < 0.7) warnings.push('Selling volume remains dominant');
    }
    if (consolidationHigh != null && breakoutConfirmation(dailyCandles, consolidationHigh)) {
      pts += 3; signals.push('Breakout on above-average volume');
    }
    components.volumeBehavior = cap(pts, 15);
  }

  // ── Market context (max 10) ──
  {
    const mc = marketContext || {};
    let pts = 0, any = false;
    if (mc.spyAboveEma50 === true) { pts += 3; any = true; }
    if (mc.spyAboveEma50 === false && mc.spyDowntrend === true) { warnings.push('Broad market trend is still negative'); any = true; }
    if (mc.sectorOutperforming === true) { pts += 3; any = true; }
    const fg = num(mc.fearGreed);
    if (fg != null) { any = true; if (fg < 30) pts += 2; }
    const vp = num(mc.volProxy);
    if (vp != null) {
      any = true;
      if (vp > 35) warnings.push('Extreme volatility: use staged entries only');
      else if (vp >= 25) pts += 2;
    }
    if (any) components.marketContext = cap(pts, 10);
  }

  // ── Total + label ──
  const present = Object.values(components).filter(v => v != null);
  const total = present.length ? Math.round(present.reduce((s, v) => s + v, 0)) : null;
  return { total, label: labelForTiming(total), components, signals, warnings };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/timingScore.test.js`
Expected: PASS — all timing-score tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timingScore.js tests/timingScore.test.js
git commit -m "feat: add computeTimingScore — composes timing components into 0-100 score

Build by Peter"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green. Baseline before this slice was the post-merge count; expect it plus the new `resampleMonthly`, `technicalPatterns`, and `timingScore` tests (~25 new).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds, `dist/` produced, no errors and no new warnings beyond the two pre-existing a11y warnings (`WatchlistTable.svelte`, `SettingsPanel.svelte`).

- [ ] **Step 3: Confirm the new modules export what Slice 3 will need**

Run: `grep -n "export function" src/lib/timingScore.js src/lib/technicalPatterns.js`
Expected: `computeTimingScore` in `timingScore.js`; `drawdownFrom52wHigh`, `bbWidthPercentile`, `detectConsolidation`, `breakoutConfirmation`, `emaReclaim`, `macdHistogramImproving`, `upDownVolumeRatio`, `detectCapitulation` in `technicalPatterns.js`; plus `resampleMonthly` in `indicators.js`.

- [ ] **Step 4: Confirm no new API endpoint was added**

Run: `git diff --stat main..HEAD -- src/lib/api/`
Expected: no output (this slice touches no API-layer file; the only fetch change was the `fromTs` window in `App.svelte`, not a new endpoint).

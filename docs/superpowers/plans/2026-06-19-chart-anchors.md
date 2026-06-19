# Chart Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four price-anchored signals — AVWAP and POC as display pills + Setup-Radar readiness nudge, Fibonacci and FVG as optional chart overlays — all from one daily-candle module with zero new API calls.

**Architecture:** A new pure module `src/lib/chartAnchors.js` computes everything from the Finnhub-style daily candle object already fetched in `App.svelte`. The result is attached as `data.anchors`. `FundamentalsBar.svelte` renders AVWAP/POC pills; `PriceChart.svelte` renders Fib/FVG overlays; `radar.js` reads the anchors to nudge a name's readiness tier (never its numeric score).

**Tech Stack:** Svelte 5 runes, Vitest, lightweight-charts v5. Pure JS for the math module.

## Global Constraints

- Zero new API calls — `chartAnchors` consumes candles already in memory.
- Display-only **except** the Radar readiness nudge (explicitly approved). `computeScore` and `signals.js` are NOT modified.
- One feature = one branch (`feat/chart-anchors`) = one PR. Work is already on this branch.
- `npm test` must stay green — tests gate the merge. Vitest style: `import { describe, it, expect } from 'vitest'`.
- Daily candle object shape (oldest-first ascending): `{ s:'ok', t:[], o:[], h:[], l:[], c:[], v:[] }`.
- AVWAP anchor = most significant (lowest-priced) confirmed swing low; reuse `findSwingPivots` exported from `src/lib/signals.js`.

---

### Task 1: AVWAP — `computeAVWAP`

**Files:**
- Create: `src/lib/chartAnchors.js`
- Test: `tests/chartAnchors.test.js`

**Interfaces:**
- Consumes: `findSwingPivots(arr, pivotBars=2, direction)` from `./signals.js` → `[{ index, value }]`.
- Produces: `computeAVWAP(highs, lows, closes, volumes, pivotBars=2)` → `{ value, pctFromPrice, reclaimed, anchorIndex } | null`.

- [ ] **Step 1: Write the failing test**

```javascript
// tests/chartAnchors.test.js
import { describe, it, expect } from 'vitest';
import { computeAVWAP } from '../src/lib/chartAnchors.js';

describe('computeAVWAP', () => {
  it('anchors at the lowest swing low and computes VWAP from there', () => {
    // index 3 is a confirmed swing low (lowest). VWAP runs index 3..end.
    const highs   = [12, 11, 11, 10, 11, 12, 13];
    const lows    = [11, 10, 10,  8, 10, 11, 12];
    const closes  = [11, 10, 10,  9, 10, 11, 12];
    const volumes = [10, 10, 10, 10, 10, 10, 10];
    const r = computeAVWAP(highs, lows, closes, volumes);
    expect(r.anchorIndex).toBe(3);
    // typical prices idx3..6: 9, 10.333.., 11.333.., 12.333.. ; equal volumes → mean
    const tps = [(8+10+9)/3, (11+10+10)/3, (12+11+11)/3, (13+12+12)/3];
    const expected = tps.reduce((a, b) => a + b, 0) / tps.length;
    expect(r.value).toBeCloseTo(expected, 4);
    expect(r.reclaimed).toBe(true); // last close 12 > avwap
    expect(r.pctFromPrice).toBeCloseTo((12 - expected) / expected * 100, 4);
  });

  it('returns null when there is no confirmed swing low', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(computeAVWAP(arr, arr, arr, [1,1,1,1,1,1,1])).toBeNull();
  });

  it('returns null when volume from the anchor is zero', () => {
    const highs = [3, 2, 3], lows = [2, 1, 2], closes = [2, 1, 2];
    expect(computeAVWAP(highs, lows, closes, [0, 0, 0])).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chartAnchors.test.js`
Expected: FAIL — "Failed to resolve import" / `computeAVWAP is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/lib/chartAnchors.js
// Price-anchored signals (AVWAP, POC, Fibonacci, FVG) computed from the daily
// candle object already in memory. Pure logic, no I/O, no Svelte. Display-only
// except the AVWAP/POC fields consumed by radar.js for a readiness nudge.
import { findSwingPivots } from './signals.js';

export function computeAVWAP(highs, lows, closes, volumes, pivotBars = 2) {
  if (!highs?.length || highs.length !== lows.length || highs.length !== closes.length) return null;
  const lowPivots = findSwingPivots(lows, pivotBars, 'low');
  if (!lowPivots.length) return null;
  // Most significant anchor = lowest-priced confirmed swing low.
  const anchor = lowPivots.reduce((m, p) => (p.value < m.value ? p : m), lowPivots[0]);
  const anchorIndex = anchor.index;

  let sumPV = 0, sumV = 0;
  for (let i = anchorIndex; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes?.[i] ?? 0;
    sumPV += tp * vol;
    sumV += vol;
  }
  if (sumV <= 0) return null;

  const value = sumPV / sumV;
  const lastClose = closes[closes.length - 1];
  return {
    value,
    pctFromPrice: ((lastClose - value) / value) * 100,
    reclaimed: lastClose > value,
    anchorIndex,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chartAnchors.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chartAnchors.js tests/chartAnchors.test.js
git commit -m "feat(anchors): AVWAP from most significant swing low"
```

---

### Task 2: POC + value area — `computePOC`

**Files:**
- Modify: `src/lib/chartAnchors.js`
- Test: `tests/chartAnchors.test.js`

**Interfaces:**
- Produces: `computePOC(highs, lows, closes, volumes, numBuckets=24)` → `{ pocPrice, valueAreaHigh, valueAreaLow, position } | null`. `position` ∈ `'above' | 'inside' | 'below'` (last close vs value area).

- [ ] **Step 1: Write the failing test**

```javascript
// add to tests/chartAnchors.test.js
import { computePOC } from '../src/lib/chartAnchors.js';

describe('computePOC', () => {
  it('puts POC at the highest-volume price bucket and classifies position', () => {
    // Most volume trades near price 10 → POC bucket mid ~10. Last close 20 = above VA.
    const highs   = [10, 10, 10, 10, 20];
    const lows    = [10, 10, 10, 10, 20];
    const closes  = [10, 10, 10, 10, 20];
    const volumes = [50, 50, 50, 50,  1];
    const r = computePOC(highs, lows, closes, volumes, 10);
    expect(r.pocPrice).toBeCloseTo(10, 0);
    expect(r.valueAreaLow).toBeLessThanOrEqual(10);
    expect(r.position).toBe('above'); // last close 20 above value-area high
  });

  it('returns null when the range is degenerate', () => {
    expect(computePOC([5,5], [5,5], [5,5], [1,1], 10)).toBeNull();
  });

  it('returns null when total volume is zero', () => {
    expect(computePOC([3,2,1], [1,1,1], [2,1,1], [0,0,0], 10)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chartAnchors.test.js -t computePOC`
Expected: FAIL — `computePOC is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// add to src/lib/chartAnchors.js
export function computePOC(highs, lows, closes, volumes, numBuckets = 24) {
  if (!highs?.length) return null;
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  if (!(high > low)) return null;

  const size = (high - low) / numBuckets;
  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
    priceMid: low + (i + 0.5) * size,
    priceMin: low + i * size,
    priceMax: low + (i + 1) * size,
    volume: 0,
  }));
  let total = 0;
  for (let i = 0; i < highs.length; i++) {
    const typical = (highs[i] + lows[i] + closes[i]) / 3;
    const idx = Math.min(Math.floor((typical - low) / size), numBuckets - 1);
    if (idx >= 0) { buckets[idx].volume += volumes?.[i] ?? 0; total += volumes?.[i] ?? 0; }
  }
  if (total <= 0) return null;

  // POC = highest-volume bucket. Value area = expand around POC to 70% of volume.
  let pocIdx = 0;
  for (let i = 1; i < buckets.length; i++) if (buckets[i].volume > buckets[pocIdx].volume) pocIdx = i;

  let lo = pocIdx, hi = pocIdx, acc = buckets[pocIdx].volume;
  const target = total * 0.7;
  while (acc < target && (lo > 0 || hi < buckets.length - 1)) {
    const below = lo > 0 ? buckets[lo - 1].volume : -1;
    const above = hi < buckets.length - 1 ? buckets[hi + 1].volume : -1;
    if (above >= below) { hi += 1; acc += buckets[hi].volume; }
    else { lo -= 1; acc += buckets[lo].volume; }
  }

  const valueAreaHigh = buckets[hi].priceMax;
  const valueAreaLow = buckets[lo].priceMin;
  const lastClose = closes[closes.length - 1];
  const position = lastClose > valueAreaHigh ? 'above' : lastClose < valueAreaLow ? 'below' : 'inside';

  return { pocPrice: buckets[pocIdx].priceMid, valueAreaHigh, valueAreaLow, position };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chartAnchors.test.js -t computePOC`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chartAnchors.js tests/chartAnchors.test.js
git commit -m "feat(anchors): POC + value area from daily volume profile"
```

---

### Task 3: Fibonacci — `computeFib`

**Files:**
- Modify: `src/lib/chartAnchors.js`
- Test: `tests/chartAnchors.test.js`

**Interfaces:**
- Produces: `computeFib(highs, lows, pivotBars=2)` → `{ swingHigh, swingLow, direction, levels } | null`. `direction` ∈ `'up' | 'down'`. `levels` = `{ '0.382', '0.5', '0.618' }` (price numbers). Display/overlay only.

- [ ] **Step 1: Write the failing test**

```javascript
// add to tests/chartAnchors.test.js
import { computeFib } from '../src/lib/chartAnchors.js';

describe('computeFib', () => {
  it('computes retracement levels for an up move (low before high)', () => {
    const highs = [12, 11, 11, 10, 12, 16, 14]; // swing high 16 at idx 5
    const lows  = [11, 10,  8, 10, 11, 15, 13]; // swing low 8 at idx 2
    const r = computeFib(highs, lows);
    expect(r.swingHigh).toBe(16);
    expect(r.swingLow).toBe(8);
    expect(r.direction).toBe('up'); // low (idx2) before high (idx5)
    expect(r.levels['0.5']).toBeCloseTo(16 - 0.5 * (16 - 8), 6); // = 12
    expect(r.levels['0.618']).toBeCloseTo(16 - 0.618 * 8, 6);
  });

  it('returns null without confirmed pivots', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7];
    expect(computeFib(arr, arr)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chartAnchors.test.js -t computeFib`
Expected: FAIL — `computeFib is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// add to src/lib/chartAnchors.js
const FIB_RATIOS = [0.382, 0.5, 0.618];

export function computeFib(highs, lows, pivotBars = 2) {
  if (!highs?.length) return null;
  const highPivots = findSwingPivots(highs, pivotBars, 'high');
  const lowPivots = findSwingPivots(lows, pivotBars, 'low');
  if (!highPivots.length || !lowPivots.length) return null;

  const hi = highPivots.reduce((m, p) => (p.value > m.value ? p : m), highPivots[0]);
  const lo = lowPivots.reduce((m, p) => (p.value < m.value ? p : m), lowPivots[0]);
  const swingHigh = hi.value, swingLow = lo.value;
  const range = swingHigh - swingLow;
  if (!(range > 0)) return null;

  const direction = lo.index < hi.index ? 'up' : 'down';
  const lv = (r) => (direction === 'up' ? swingHigh - r * range : swingLow + r * range);
  const levels = {};
  for (const r of FIB_RATIOS) levels[String(r)] = lv(r);

  return { swingHigh, swingLow, direction, levels };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chartAnchors.test.js -t computeFib`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chartAnchors.js tests/chartAnchors.test.js
git commit -m "feat(anchors): Fibonacci retracement levels"
```

---

### Task 4: Fair Value Gaps — `detectFVG`

**Files:**
- Modify: `src/lib/chartAnchors.js`
- Test: `tests/chartAnchors.test.js`

**Interfaces:**
- Produces: `detectFVG(highs, lows, closes)` → `{ gapsAbove, gapsBelow }`. Each gap = `{ top, bottom, index }`. Arrays are sorted nearest-to-price first; empty when none. Display/overlay only.

- [ ] **Step 1: Write the failing test**

```javascript
// add to tests/chartAnchors.test.js
import { detectFVG } from '../src/lib/chartAnchors.js';

describe('detectFVG', () => {
  it('finds an unfilled bullish gap above price', () => {
    // 3-candle bullish gap at i=1: lows[2]=20 > highs[0]=10. Price ends below gap.
    const highs  = [10, 30, 25];
    const lows   = [ 8, 22, 20];
    const closes = [ 9, 25, 22];
    const r = detectFVG(highs, lows, closes);
    // gap region bottom=highs[0]=10, top=lows[2]=20. last close 22 is above gap → gapBelow
    expect(r.gapsBelow.length).toBe(1);
    expect(r.gapsBelow[0]).toMatchObject({ bottom: 10, top: 20, index: 1 });
  });

  it('excludes a gap that price later filled', () => {
    // bullish gap at i=1 (lows[2]=20 > highs[0]=10) but a later low (5) trades back through it
    const highs  = [10, 30, 25, 8];
    const lows   = [ 8, 22, 20, 5];
    const closes = [ 9, 25, 22, 6];
    const r = detectFVG(highs, lows, closes);
    expect(r.gapsAbove.length + r.gapsBelow.length).toBe(0);
  });

  it('returns empty arrays when there are no gaps', () => {
    const a = [5, 5, 5, 5];
    expect(detectFVG(a, a, a)).toEqual({ gapsAbove: [], gapsBelow: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chartAnchors.test.js -t detectFVG`
Expected: FAIL — `detectFVG is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// add to src/lib/chartAnchors.js
export function detectFVG(highs, lows, closes) {
  const empty = { gapsAbove: [], gapsBelow: [] };
  if (!highs?.length || highs.length < 3) return empty;
  const n = highs.length;
  const gaps = [];

  for (let i = 1; i < n - 1; i++) {
    let bottom = null, top = null;
    if (lows[i + 1] > highs[i - 1]) { bottom = highs[i - 1]; top = lows[i + 1]; }       // bullish gap
    else if (highs[i + 1] < lows[i - 1]) { bottom = highs[i + 1]; top = lows[i - 1]; }  // bearish gap
    if (bottom === null) continue;

    // Unfilled = no later candle traded back into the gap region.
    let filled = false;
    for (let j = i + 2; j < n; j++) {
      if (lows[j] <= top && highs[j] >= bottom) { filled = true; break; }
    }
    if (!filled) gaps.push({ top, bottom, index: i });
  }

  const lastClose = closes[closes.length - 1];
  const gapsAbove = gaps.filter(g => g.bottom > lastClose).sort((a, b) => a.bottom - b.bottom);
  const gapsBelow = gaps.filter(g => g.top < lastClose).sort((a, b) => b.top - a.top);
  return { gapsAbove, gapsBelow };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/chartAnchors.test.js -t detectFVG`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chartAnchors.js tests/chartAnchors.test.js
git commit -m "feat(anchors): unfilled fair-value-gap detection"
```

---

### Task 5: Orchestrator — `computeChartAnchors`

**Files:**
- Modify: `src/lib/chartAnchors.js`
- Test: `tests/chartAnchors.test.js`

**Interfaces:**
- Consumes: the four helpers above.
- Produces: `computeChartAnchors(raw)` where `raw = { s, c, h, l, v }` → `{ avwap, poc, fib, fvg } | null`. Returns `null` when `raw.s !== 'ok'` or `raw.c.length < 60`. Sub-objects are individually `null` when their helper can't compute.

- [ ] **Step 1: Write the failing test**

```javascript
// add to tests/chartAnchors.test.js
import { computeChartAnchors } from '../src/lib/chartAnchors.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chartAnchors.test.js -t computeChartAnchors`
Expected: FAIL — `computeChartAnchors is not a function`.

- [ ] **Step 3: Write minimal implementation**

```javascript
// add to src/lib/chartAnchors.js
const MIN_BARS = 60;

export function computeChartAnchors(raw) {
  if (!raw || raw.s !== 'ok' || !Array.isArray(raw.c) || raw.c.length < MIN_BARS) return null;
  const closes = raw.c;
  const highs = raw.h ?? closes;
  const lows = raw.l ?? closes;
  const volumes = raw.v ?? [];
  return {
    avwap: computeAVWAP(highs, lows, closes, volumes),
    poc: computePOC(highs, lows, closes, volumes),
    fib: computeFib(highs, lows),
    fvg: detectFVG(highs, lows, closes),
  };
}
```

- [ ] **Step 4: Run the whole module suite to verify it passes**

Run: `npx vitest run tests/chartAnchors.test.js`
Expected: PASS (all groups).

- [ ] **Step 5: Commit**

```bash
git add src/lib/chartAnchors.js tests/chartAnchors.test.js
git commit -m "feat(anchors): computeChartAnchors orchestrator with bar-count guard"
```

---

### Task 6: Wire into App.svelte (all three candle paths)

**Files:**
- Modify: `src/App.svelte` (TwelveData daily path ~line 245; Finnhub path ~line 270; cache-hydrate ~line 381)

**Interfaces:**
- Consumes: `computeChartAnchors(raw)` from `./lib/chartAnchors.js`.
- Produces: `data.anchors` on each ticker result (read by Tasks 7, 8, 9).

- [ ] **Step 1: Add the import**

In the `<script>` import block (next to `import { computeSetupSignals } from './lib/signals.js';`, line 5):

```javascript
import { computeChartAnchors } from './lib/chartAnchors.js';
```

- [ ] **Step 2: Wire the TwelveData daily path**

After the setups assignment in the TwelveData branch (~line 245, `if (setups) results[ticker.symbol].setups = setups;`), add:

```javascript
              const anchors = computeChartAnchors(synthetic);
              if (anchors) results[ticker.symbol].anchors = anchors;
```

- [ ] **Step 3: Wire the Finnhub path**

After the setups assignment in the Finnhub branch (~line 270, `if (setups) results[ticker.symbol].setups = setups;`), add:

```javascript
            const anchors = computeChartAnchors(candleRes?.data);
            if (anchors) results[ticker.symbol].anchors = anchors;
```

- [ ] **Step 4: Wire the cache-hydrate path**

In the hydrate loop (~line 381, after the `data._candlesWeekly` setups line and before `delete data._candlesDaily;`), add:

```javascript
      if (data._candlesDaily) { const an = computeChartAnchors(data._candlesDaily); if (an) data.anchors = an; }
```

- [ ] **Step 5: Verify build + tests still green**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (no test asserts on App wiring directly — this is a smoke check that nothing broke).

- [ ] **Step 6: Commit**

```bash
git add src/App.svelte
git commit -m "feat(anchors): compute data.anchors on all three candle paths"
```

---

### Task 7: AVWAP + POC pills — FundamentalsBar.svelte

**Files:**
- Modify: `src/lib/components/FundamentalsBar.svelte` (derive `anchors` near line 13; add pill markup after the RS block, ~line 424)

**Interfaces:**
- Consumes: `data.anchors.avwap` (`{ pctFromPrice, reclaimed }`) and `data.anchors.poc` (`{ pocPrice, position }`).

- [ ] **Step 1: Add the derived anchors**

After `const price = $derived(data?.quote?.data?.c ?? null);` (line 13):

```javascript
  const anchors = $derived(data?.anchors ?? null);
```

- [ ] **Step 2: Add the AVWAP + POC pills**

Immediately after the closing `{/if}` of the RS block (the block at lines 412–423 ends with `{/if}`), insert:

```svelte
    {#if anchors?.avwap}
      {@const av = anchors.avwap}
      {@const avColor = av.reclaimed ? 'text-bull-strong' : 'text-bear-strong'}
      <div class="flex flex-col min-w-[95px] cursor-default" title="Price vs anchored VWAP (swing-low cost basis)">
        <span class="text-[13px] text-text-muted uppercase tracking-wider">AVWAP</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {avColor}">{(av.pctFromPrice >= 0 ? '+' : '') + av.pctFromPrice.toFixed(1)}%</span>
        </div>
        <span class="text-[12px] {avColor}">{av.reclaimed ? 'reclaimed' : 'below'}</span>
      </div>
    {/if}

    {#if anchors?.poc}
      {@const pc = anchors.poc}
      {@const vaLabel = pc.position === 'above' ? 'upper VA' : pc.position === 'below' ? 'lower VA' : 'in VA'}
      <div class="flex flex-col min-w-[95px] cursor-default" title="Point of Control + value area position">
        <span class="text-[13px] text-text-muted uppercase tracking-wider">POC</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold text-text-secondary">${pc.pocPrice.toFixed(2)}</span>
        </div>
        <span class="text-[12px] text-text-muted">{vaLabel}</span>
      </div>
    {/if}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds, no Svelte compile errors.

- [ ] **Step 4: Manual check (optional but recommended)**

Run: `npm run dev`, open a ticker's expanded row, confirm AVWAP (green when reclaimed) and POC pills render next to RS. Pills are absent for tickers with no `data.anchors` (e.g. < 60 bars).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/FundamentalsBar.svelte
git commit -m "feat(anchors): AVWAP + POC display pills in FundamentalsBar"
```

---

### Task 8: Fib + FVG chart overlays — PriceChart.svelte

**Files:**
- Modify: `src/lib/components/PriceChart.svelte` (import + state + toggle buttons + draw effect + SVG)

**Interfaces:**
- Consumes: `getTickerData(symbol)?.anchors.fib` (`{ levels }`) and `.fvg` (`{ gapsAbove, gapsBelow }`). Overlays render only on daily timeframes (`!isIntraday`) to match the daily-computed anchors.

- [ ] **Step 1: Add the import**

After line 6 (`import { getChecklist } from '../stores/checklist.svelte.js';`):

```javascript
  import { getTickerData } from '../stores/watchlist.svelte.js';
```

- [ ] **Step 2: Add state for the toggles, refs, and FVG SVG coords**

Near the other overlay toggles (after line 45, `let showAnnotations = $state(true);`):

```javascript
  let showFib   = $state(false);
  let showFVG   = $state(false);
  let fibLineRefs = [];          // createPriceLine refs to clear
  let fvgRects  = $state([]);    // {y, height} pixel rects for FVG SVG
```

- [ ] **Step 3: Add the draw/clear helpers**

After `computeVolumeProfile` / `updateVolumeProfile` (after line ~145, before the drawings section):

```javascript
  // ─── Fib + FVG anchors (daily only) ──────────────────────────────────────────
  function clearFibLines() {
    if (series) for (const ref of fibLineRefs) series.removePriceLine(ref);
    fibLineRefs = [];
  }

  function updateFibLines() {
    clearFibLines();
    if (!series || isIntraday || !showFib) return;
    const fib = getTickerData(symbol)?.anchors?.fib;
    if (!fib?.levels) return;
    for (const [ratio, price] of Object.entries(fib.levels)) {
      fibLineRefs.push(series.createPriceLine({
        price, color: '#a78bfa', lineWidth: 1, lineStyle: 2,
        axisLabelVisible: true, title: `${ratio} $${price.toFixed(2)}`,
      }));
    }
  }

  function updateFvgRects() {
    if (!series || isIntraday || !showFVG) { fvgRects = []; return; }
    const fvg = getTickerData(symbol)?.anchors?.fvg;
    if (!fvg) { fvgRects = []; return; }
    const gaps = [...(fvg.gapsAbove ?? []), ...(fvg.gapsBelow ?? [])];
    fvgRects = gaps.map(g => {
      const yT = series.priceToCoordinate(g.top);
      const yB = series.priceToCoordinate(g.bottom);
      if (yT == null || yB == null) return null;
      return { y: Math.min(yT, yB), height: Math.abs(yB - yT) };
    }).filter(Boolean);
  }
```

- [ ] **Step 4: Add the toggle buttons**

In the overlay-toggle row, after the BB button (after line 595, the `>BB</button>` line):

```svelte
        <button
          class="px-1.5 py-0.5 text-xs rounded font-mono transition-colors {showFib ? 'text-violet-400' : 'text-text-muted opacity-40'}"
          title="Fibonacci retracements (daily)"
          onclick={() => showFib = !showFib}
        >FIB</button>
        <button
          class="px-1.5 py-0.5 text-xs rounded font-mono transition-colors {showFVG ? 'text-amber-400' : 'text-text-muted opacity-40'}"
          title="Fair value gaps (daily)"
          onclick={() => showFVG = !showFVG}
        >FVG</button>
```

- [ ] **Step 5: Add reactive effects**

After the volume-profile `$effect` (the block starting ~line 542):

```javascript
  // Fib lines (reactive to toggle / symbol / data)
  $effect(() => {
    showFib; symbol; chartReady; candleCount;
    if (chartReady) updateFibLines();
  });

  // FVG rects (reactive to toggle / symbol / data)
  $effect(() => {
    showFVG; symbol; chartReady; candleCount;
    if (chartReady) updateFvgRects();
  });
```

Also recompute FVG pixel rects on pan/zoom: in the `subscribeVisibleLogicalRangeChange` callback (line 505–508), add `if (showFVG) updateFvgRects();` alongside the existing volume-profile call.

- [ ] **Step 6: Add the FVG SVG overlay**

After the volume-profile SVG block (after line 673, the `{/if}` that closes `{#if showVolumeProfile && vpBars.length}`):

```svelte
    <!-- FVG translucent bands (daily only) -->
    {#if showFVG && fvgRects.length}
      <svg class="absolute inset-0 w-full pointer-events-none" style="height:300px;" aria-hidden="true">
        {#each fvgRects as r}
          <rect x="0" y={r.y} width="100%" height={Math.max(r.height, 2)}
            fill="#f59e0b14" stroke="#f59e0b40" stroke-width="1" rx="1" />
        {/each}
      </svg>
    {/if}
```

- [ ] **Step 7: Verify build + manual check**

Run: `npm run build`
Expected: build succeeds. Then `npm run dev`: on a daily timeframe (3M), toggle FIB → dashed violet retracement lines; toggle FVG → amber bands. Both vanish on intraday (1D/5D). No errors on pan/zoom.

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/PriceChart.svelte
git commit -m "feat(anchors): Fib + FVG chart overlays with daily-only toggles"
```

---

### Task 9: Setup Radar readiness nudge — radar.js

**Files:**
- Modify: `src/lib/radar.js`
- Test: `tests/radar.test.js`

**Interfaces:**
- Consumes: `item.data.anchors.avwap.reclaimed`, `item.data.anchors.poc.position`.
- Produces: nudged `readiness` on each radar hit. Bumps one tier (WATCH→SOON→ACT) only when AVWAP reclaimed AND POC not below. Never demotes; no-op when anchors absent. Numeric `setupScore` unchanged.

- [ ] **Step 1: Write the failing test**

```javascript
// add to tests/radar.test.js — match existing import style in that file
import { computeRadar } from '../src/lib/radar.js';

describe('radar anchor readiness nudge', () => {
  const base = (anchors) => ({
    symbol: 'AAA',
    data: {
      setups: { pullback: { readiness: 'WATCH', score: 6, etaWeeks: 2 }, momentum: null },
      metrics: { data: { metric: { revenueGrowthTTMYoy: 10, peNormalizedAnnual: 15, epsGrowthTTMYoy: 20 } } },
      rs: { rs3m: 5 },
      anchors,
    },
  });

  it('bumps WATCH to SOON when AVWAP reclaimed and POC not below', () => {
    const r = computeRadar([base({ avwap: { reclaimed: true }, poc: { position: 'above' } })]);
    expect(r[0].readiness).toBe('SOON');
  });

  it('does not nudge when POC is below', () => {
    const r = computeRadar([base({ avwap: { reclaimed: true }, poc: { position: 'below' } })]);
    expect(r[0].readiness).toBe('WATCH');
  });

  it('is a no-op when anchors are absent', () => {
    const r = computeRadar([base(undefined)]);
    expect(r[0].readiness).toBe('WATCH');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/radar.test.js -t "anchor readiness"`
Expected: FAIL — first test gets `WATCH` (nudge not yet applied).

- [ ] **Step 3: Add the nudge helper and apply it**

In `src/lib/radar.js`, add after `activeSetup` (before `export function computeRadar`):

```javascript
const NUDGE_UP = { WATCH: 'SOON', SOON: 'ACT', ACT: 'ACT' };

// AVWAP reclaimed + POC not below → bump readiness one tier. Never demotes.
function nudgeReadiness(readiness, anchors) {
  if (!anchors) return readiness;
  const avwapOk = anchors.avwap?.reclaimed === true;
  const pocOk = !!anchors.poc && anchors.poc.position !== 'below';
  return avwapOk && pocOk ? (NUDGE_UP[readiness] ?? readiness) : readiness;
}
```

Then inside `computeRadar`, replace the line `if (!setup) continue;` block's downstream use of `setup.readiness`. Specifically, after `const setup = activeSetup(data.setups); if (!setup) continue;`, add:

```javascript
    const readiness = nudgeReadiness(setup.readiness, data.anchors);
```

And in the `hits.push({ ... })` object, change `readiness: setup.readiness,` to:

```javascript
      readiness,
```

(The sort already keys off `READINESS_RANK[b.readiness]`, so the nudged tier flows through ranking automatically.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/radar.test.js`
Expected: PASS — new nudge tests pass AND all pre-existing radar tests still pass (helper is a no-op when anchors absent, so old fixtures are unaffected).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all tests green (chartAnchors + radar + the existing 144).

- [ ] **Step 6: Commit**

```bash
git add src/lib/radar.js tests/radar.test.js
git commit -m "feat(anchors): Setup Radar readiness nudge from AVWAP + POC"
```

---

## Final verification

- [ ] `npm test` — all green.
- [ ] `npm run build` — succeeds.
- [ ] Manual: a ticker with ≥60 daily bars shows AVWAP/POC pills; FIB/FVG overlays toggle on daily and hide on intraday; a name on the Radar with AVWAP reclaimed + POC not-below shows a bumped readiness.
- [ ] Update `CLAUDE.md` "What's next / BACKLOG" note and `BACKLOG.md` to mark chart anchors shipped (fold into the last commit or a docs commit).

## Self-review notes (already checked)

- **Spec coverage:** AVWAP (T1), POC (T2), Fib (T3), FVG (T4), orchestrator+guards (T5), wiring all 3 paths (T6), pills (T7), overlays (T8), readiness nudge (T9), test updates (T1–T5, T9). All spec sections mapped.
- **Type consistency:** `computeChartAnchors → { avwap, poc, fib, fvg }` consumed identically in T6–T9; `avwap.reclaimed` / `poc.position` names match across helper, pills, and nudge.
- **Convention compliance:** zero new API calls; `computeScore`/`signals.js` untouched; nudge is the only non-display change (approved); one branch/PR.

# Data Enrichment Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dividend yield display, watchlist breadth (%>EMA50/EMA200), and a smoothed numeric sector-momentum signal (replacing the current single-day boolean `sectorTrend`) — all using data already fetched, zero new API calls.

**Architecture:** Three independent, sequentially-ordered slices. Dividend yield is a pure display addition reading an already-fetched field. Breadth is a pure local aggregation over already-computed per-ticker indicators. Sector momentum adds a small localStorage rolling-window pattern (mirroring the existing `sv_<SYMBOL>` score-history pattern) and replaces a boolean field with a number end-to-end: storage → `App.svelte` wiring → `computeScore` → `generateThesis` → demo data.

**Tech Stack:** Svelte 5 (runes), Vitest, existing Finnhub API client (`src/lib/api/finnhub.svelte.js`), existing scoring engine (`src/lib/scoring.js`), existing indicators module (`src/lib/indicators.js`).

## Global Constraints

- Zero new API calls. Dividend yield reads a field already present in the `metric=all` response. Breadth is a pure local aggregation. Sector momentum reuses the `dp` value already fetched per sector ETF for the Market Context rotation tile.
- Display-only for dividend yield and breadth — no changes to `computeScore`'s bucket totals.
- Sector momentum replaces the existing `sectorTrend` boolean in the **same signal slot** — `sentTotal` stays `2` in `computeScore`. This is a breaking rename (`sectorTrend` → `sectorMomentum`, boolean → number), not an additive field. No dual-write period.
- No analyst price target in this round — `/stock/price-target` is a premium-only Finnhub endpoint (confirmed via commit `ad539bc`, June 2026: shipped once, removed because the field was always empty on the free tier).
- Match existing code conventions: tiered heuristics like the eps-growth tiers in `scoring.js`, `n/a`/`—` null-safe formatting per `fmt()`/`NA` conventions, localStorage rolling-window pattern like `storeScoreSnapshot`/`sv_<SYMBOL>`.
- Spec: `docs/superpowers/specs/2026-07-17-data-enrichment-round-design.md`.

---

### Task 1: Dividend yield (display-only)

**Files:**
- Modify: `src/lib/components/FundamentalsBar.svelte:61-131` (metrics array + tooltip ternary)
- Modify: `src/lib/tooltipDefs.js` (add `dividendYield` entry, insert before the closing `};` at end of file)
- Modify: `src/lib/export.js:79` (FUNDAMENTALS line in `buildStockSnapshot`)
- Modify: `src/lib/demoData.js` (add `dividendYieldIndicatedAnnual` to AAPL and MSFT demo metrics — both are real dividend payers; leave NVDA/TSLA/AMZN without the field to exercise the `—` null-safe path)
- Test: `tests/export.test.js`

**Interfaces:**
- Consumes: `data.metrics.data.metric.dividendYieldIndicatedAnnual` (already fetched by `fetchMetrics()` in `src/lib/api/finnhub.svelte.js:216-220`, no changes needed there).
- Produces: nothing consumed by later tasks — fully self-contained.

- [ ] **Step 1: Write the failing test for the AI export snapshot line**

Open `tests/export.test.js`. Find the `makeData()` helper (around line 5) and add `dividendYieldIndicatedAnnual: 0.52` to the `metrics.data.metric` object:

```js
metrics: { data: { metric: {
  epsGrowthTTMYoy: 21, revenueGrowthTTMYoy: 12, netProfitMarginTTM: 9.8,
  peNormalizedAnnual: 34, psTTM: 3.1, '52WeekHigh': 240, '52WeekLow': 150,
  dividendYieldIndicatedAnnual: 0.52,
} } },
```

Add a new test in the `describe('buildStockSnapshot', ...)` block (after the existing `'shows 52w range position...'` test):

```js
  it('shows dividend yield in the FUNDAMENTALS line', () => {
    const snap = buildStockSnapshot(TICKER, makeData(), CTX);
    expect(snap).toContain('Div yield 0.52%');
  });

  it('shows n/a for dividend yield when the field is absent', () => {
    const snap = buildStockSnapshot(TICKER, makeData({
      metrics: { data: { metric: { peNormalizedAnnual: 34 } } },
    }), CTX);
    expect(snap).toContain('Div yield n/a');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/export.test.js`
Expected: FAIL — `expect(snap).toContain('Div yield 0.52%')` fails because `buildStockSnapshot` doesn't emit that text yet.

- [ ] **Step 3: Add the field to the FUNDAMENTALS line in `export.js`**

In `src/lib/export.js`, find this line inside `buildStockSnapshot` (around line 79):

```js
    `FUNDAMENTALS: P/E ${fmt(pe)} · PEG ${peg !== null ? Math.round(peg * 10) / 10 : NA} · EPS growth ${fmtSigned(eps)} · Rev growth ${fmtSigned(m.revenueGrowthTTMYoy)} · Net margin ${fmt(m.netProfitMarginTTM, '%')} · P/S ${fmt(m.psTTM)}`,
```

Replace it with:

```js
    `FUNDAMENTALS: P/E ${fmt(pe)} · PEG ${peg !== null ? Math.round(peg * 10) / 10 : NA} · EPS growth ${fmtSigned(eps)} · Rev growth ${fmtSigned(m.revenueGrowthTTMYoy)} · Net margin ${fmt(m.netProfitMarginTTM, '%')} · P/S ${fmt(m.psTTM)} · Div yield ${fmt(m.dividendYieldIndicatedAnnual, '%')}`,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/export.test.js`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Add the FundamentalsBar tile**

In `src/lib/components/FundamentalsBar.svelte`, find the `metrics` array (starts around line 61). Insert a new tile object directly after the `PEG` entry (around line 118, right before the `EMA50` entry):

```js
    {
      label: 'Div Yield',
      value: fmt(m['dividendYieldIndicatedAnnual'], '', '%'),
      note: null,
    },
```

- [ ] **Step 6: Wire the tooltip for the new tile**

In the same file, find the `metricTip` ternary chain inside the `{#each metrics as metric}` block (around line 138):

```svelte
{@const metricTip = metric.label === 'EMA50' ? TIPS.ema50 : metric.label === 'EMA200' ? TIPS.ema200 : metric.label === 'P/E' ? TIPS.pe : metric.label === 'EPS Growth' ? TIPS.epsGrowth : metric.label === 'Mkt Cap' ? TIPS.mktCap : metric.label === 'Rev Growth' ? TIPS.revenueGrowth : metric.label === 'P/S' ? TIPS.priceToSales : metric.label === 'PEG' ? TIPS.peg : null}
```

Replace with (adds one clause before the trailing `: null`):

```svelte
{@const metricTip = metric.label === 'EMA50' ? TIPS.ema50 : metric.label === 'EMA200' ? TIPS.ema200 : metric.label === 'P/E' ? TIPS.pe : metric.label === 'EPS Growth' ? TIPS.epsGrowth : metric.label === 'Mkt Cap' ? TIPS.mktCap : metric.label === 'Rev Growth' ? TIPS.revenueGrowth : metric.label === 'P/S' ? TIPS.priceToSales : metric.label === 'PEG' ? TIPS.peg : metric.label === 'Div Yield' ? TIPS.dividendYield : null}
```

- [ ] **Step 7: Add the tooltip definition**

In `src/lib/tooltipDefs.js`, find the `peg: { ... }` entry (around line 413-424). Insert a new entry directly after it, before the `tfsScore: { ... }` entry:

```js
  dividendYield: {
    title: 'Dividend Yield',
    subtitle: 'Indicated annual dividend ÷ price',
    category: 'Fundamental',
    description: 'Annual dividend income as a percentage of the current share price. Most growth-stage names in a swing-trade watchlist won\'t pay one — that\'s expected, not a red flag.',
    levels: [
      { range: '0%',      label: 'Non-payer', color: C.dim,   desc: 'No dividend — common for growth names reinvesting cash into the business.' },
      { range: '< 2%',    label: 'Modest',    color: C.dim,   desc: 'Small income component, not the reason to hold this name.' },
      { range: '≥ 2%',    label: 'Payer',     color: C.green, desc: 'Meaningful income component — relevant for value/dividend-oriented positions.' },
    ],
    why: 'This dashboard is built for swing trades on price action, so dividend yield is informational only — it never feeds the composite score. Useful context when comparing a growth setup against a value/income alternative.',
  },

```

- [ ] **Step 8: Add dividend data to demo mode**

In `src/lib/demoData.js`, find the AAPL metrics object (around line 16):

```js
    metrics:     { data: { metric: { marketCapitalization: 3200, peNormalizedAnnual: 31.2, peBasicExclExtraTTM: 31.2, epsGrowthTTMYoy: 7.8, epsGrowth3Y: 12.4, '50DayMovingAverage': 221.80, '200DayMovingAverage': 206.40, '52WeekHigh': 237.49, '52WeekLow': 164.08, beta: 1.24 } }, stale: true },
```

Replace with (adds `dividendYieldIndicatedAnnual: 0.44`):

```js
    metrics:     { data: { metric: { marketCapitalization: 3200, peNormalizedAnnual: 31.2, peBasicExclExtraTTM: 31.2, epsGrowthTTMYoy: 7.8, epsGrowth3Y: 12.4, '50DayMovingAverage': 221.80, '200DayMovingAverage': 206.40, '52WeekHigh': 237.49, '52WeekLow': 164.08, beta: 1.24, dividendYieldIndicatedAnnual: 0.44 } }, stale: true },
```

Find the MSFT metrics object (around line 57):

```js
    metrics:       { data: { metric: { marketCapitalization: 2815, peNormalizedAnnual: 34.1, peBasicExclExtraTTM: 34.1, epsGrowthTTMYoy: 21.3, epsGrowth3Y: 18.9, revenueGrowthTTMYoy: 14.8, netProfitMarginTTM: 35.6, '50DayMovingAverage': 373.80, '200DayMovingAverage': 352.40, '52WeekHigh': 420.82, '52WeekLow': 309.45, beta: 0.91 } }, stale: true },
```

Replace with (adds `dividendYieldIndicatedAnnual: 0.68`):

```js
    metrics:       { data: { metric: { marketCapitalization: 2815, peNormalizedAnnual: 34.1, peBasicExclExtraTTM: 34.1, epsGrowthTTMYoy: 21.3, epsGrowth3Y: 18.9, revenueGrowthTTMYoy: 14.8, netProfitMarginTTM: 35.6, '50DayMovingAverage': 373.80, '200DayMovingAverage': 352.40, '52WeekHigh': 420.82, '52WeekLow': 309.45, beta: 0.91, dividendYieldIndicatedAnnual: 0.68 } }, stale: true },
```

Leave NVDA, TSLA, AMZN metrics unchanged — they exercise the `—` / `n/a` null-safe path in demo mode.

- [ ] **Step 9: Run the full test suite and build**

Run: `npm test`
Expected: PASS — all tests green, including the two new ones from Step 1.

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/FundamentalsBar.svelte src/lib/tooltipDefs.js src/lib/export.js src/lib/demoData.js tests/export.test.js
git commit -m "feat: add dividend yield display (FundamentalsBar, AI export, demo data)

Build by Peter"
```

---

### Task 2: Watchlist breadth — pure calculation function

**Files:**
- Modify: `src/lib/indicators.js:235` (insert after `computeRelativeStrength`, before the `computeEmaStack` comment block at line 237)
- Test: `tests/indicators.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `computeBreadth(entries)` — `entries: Array<{ price: number|null, ema50: number|null, ema200: number|null }>` → `{ ema50: { above: number, total: number }, ema200: { above: number, total: number } }`. Task 3 imports and calls this.

- [ ] **Step 1: Write the failing tests**

In `tests/indicators.test.js`, add `computeBreadth` to the import list at the top (after `computeRelativeStrength` on line 11):

```js
  computeRelativeStrength,
  computeBreadth,
```

Insert a new `describe` block after the closing `});` of `describe('computeRelativeStrength', ...)` (line 403), before the `// ─── computeEmaStack ───...` comment (line 405):

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/indicators.test.js`
Expected: FAIL — `computeBreadth is not defined` / import error.

- [ ] **Step 3: Implement `computeBreadth`**

In `src/lib/indicators.js`, insert directly after the closing `}` of `computeRelativeStrength` (line 235), before the `// ── EMA stack alignment ──...` comment (line 237):

```js

// ── Watchlist breadth ────────────────────────────────────────────────────────
// % of watchlist tickers trading above EMA50 / EMA200 — a regime read on the
// watchlist as a group, not a per-ticker signal. Each MA's denominator only
// counts entries that actually have that MA (insufficient history → excluded,
// not counted as failing).
export function computeBreadth(entries) {
  let ema50Above = 0, ema50Total = 0, ema200Above = 0, ema200Total = 0;
  for (const e of entries || []) {
    if (e?.price == null) continue;
    if (e.ema50 != null) {
      ema50Total++;
      if (e.price > e.ema50) ema50Above++;
    }
    if (e.ema200 != null) {
      ema200Total++;
      if (e.price > e.ema200) ema200Above++;
    }
  }
  return {
    ema50:  { above: ema50Above,  total: ema50Total },
    ema200: { above: ema200Above, total: ema200Total },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/indicators.test.js`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/indicators.js tests/indicators.test.js
git commit -m "feat: add computeBreadth() for watchlist %>EMA50/EMA200

Build by Peter"
```

---

### Task 3: Watchlist breadth — wire into App.svelte + Market Context tile

**Files:**
- Modify: `src/App.svelte:5` (import), `src/App.svelte:354-358` (add breadth computation after the score-snapshot loop)
- Modify: `src/lib/components/MarketContextBar.svelte` (new tile)
- Modify: `src/lib/tooltipDefs.js` (add `breadth` entry)
- Modify: `src/lib/demoData.js:67-87` (add `breadth` to `DEMO_MARKET_CONTEXT`)

**Interfaces:**
- Consumes: `computeBreadth(entries)` from Task 2 (`src/lib/indicators.js`).
- Produces: `marketContextData.breadth` — read by `MarketContextBar.svelte` via its `marketData` prop. Nothing later depends on this.

No test coverage for this task — matches the existing project convention that Svelte component wiring (as opposed to pure `src/lib/*.js` functions) is verified by build + manual smoke check, same as e.g. the Rotation tile added in the ETF refinement round (`docs/superpowers/specs/2026-07-10-etf-refinement-v017-design.md`, section 1: "Testing: manual").

- [ ] **Step 1: Import `computeBreadth` in App.svelte**

In `src/App.svelte`, find the indicators import (line 5):

```js
  import { computeIndicatorsFromCandles, computeWeeklyTrend, computeRelativeStrength, resampleWeekly, realizedVol, emaArray } from './lib/indicators.js';
```

Replace with:

```js
  import { computeIndicatorsFromCandles, computeWeeklyTrend, computeRelativeStrength, computeBreadth, resampleWeekly, realizedVol, emaArray } from './lib/indicators.js';
```

- [ ] **Step 2: Compute breadth after the score-snapshot loop**

In `src/App.svelte`, find this block (around line 354-358):

```js
      // Store score snapshots for velocity tracking
      for (const ticker of tickers) {
        const data = results[ticker.symbol];
        if (data) storeScoreSnapshot(ticker.symbol, computeScore(data).score);
      }
```

Replace with (adds breadth computation immediately after):

```js
      // Store score snapshots for velocity tracking
      for (const ticker of tickers) {
        const data = results[ticker.symbol];
        if (data) storeScoreSnapshot(ticker.symbol, computeScore(data).score);
      }

      // Watchlist breadth (%>EMA50/EMA200) — pure local aggregation, no new calls
      if (marketContextData) {
        const breadthEntries = tickers.map(t => {
          const d = results[t.symbol];
          return {
            price:  d?.quote?.data?.c ?? null,
            ema50:  d?.indicators?.ema50 ?? null,
            ema200: d?.indicators?.ema200 ?? null,
          };
        });
        marketContextData = { ...marketContextData, breadth: computeBreadth(breadthEntries) };
      }
```

- [ ] **Step 3: Add the tooltip definition**

In `src/lib/tooltipDefs.js`, find the `sectorLaggards: { ... }` entry (around line 698-708). Insert a new entry directly after it, before the `scoreHistory: { ... }` entry:

```js
  breadth: {
    title: 'Watchlist Breadth',
    subtitle: '% of Watchlist Above EMA50 / EMA200',
    category: 'Market Context',
    description: 'How many of your watchlist tickers are trading above their 50-day and 200-day EMAs, right now. A regime read on your specific watchlist as a group — not the broad market.',
    levels: [
      { range: '≥ 70%', label: 'Bullish', color: C.green, desc: 'Broad strength across your watchlist — favorable backdrop for new longs.' },
      { range: '40–70%', label: 'Mixed',  color: C.dim,   desc: 'Split picture — some names participating, others lagging. Be selective.' },
      { range: '< 40%',  label: 'Bearish', color: C.red,  desc: 'Most of your watchlist is below trend — a tough tape for new longs, whatever any single setup looks like.' },
    ],
    why: 'A single ticker can look great in isolation while the group it belongs to is broadly breaking down (or vice versa). Breadth catches that — check it before sizing up on an individual setup.',
  },

```

- [ ] **Step 4: Add the Market Context tile**

In `src/lib/components/MarketContextBar.svelte`, find the `getRotation` function (around line 78-91) and add a new function directly after it, before `getNudge`:

```js

  function getBreadthInfo(breadth) {
    const e50 = breadth?.ema50;
    if (!e50 || !e50.total) return null;
    const ratio = e50.above / e50.total;
    const state = ratio >= 0.7 ? { ...STATES.good, label: 'BULLISH' }
                : ratio <= 0.4 ? { ...STATES.bad,  label: 'BEARISH' }
                :                { ...STATES.neutral, label: 'MIXED' };
    return { ...state, value: `${e50.above}/${e50.total}`, ema50: e50, ema200: breadth.ema200 };
  }
```

Find the derived values block (around line 102-108):

```js
  let vixInfo  = $derived(getVixInfo(marketData?.volProxy ?? null));
  let spyInfo  = $derived(getSpyInfo(marketData?.spy?.data ?? null));
  let btcInfo  = $derived(getBtcInfo(marketData?.btc?.data ?? null));
  let macroInfo = $derived(getMacroInfo(marketData?.macro ?? null));
  let fgInfo   = $derived(getFgInfo(marketData?.fearGreed?.data ?? null));
  let rotation = $derived(getRotation(marketData?.sectors));
  let nudge    = $derived(getNudge(vixInfo.level, spyInfo.label, fgInfo));
```

Replace with (adds `breadthInfo`):

```js
  let vixInfo  = $derived(getVixInfo(marketData?.volProxy ?? null));
  let spyInfo  = $derived(getSpyInfo(marketData?.spy?.data ?? null));
  let btcInfo  = $derived(getBtcInfo(marketData?.btc?.data ?? null));
  let macroInfo = $derived(getMacroInfo(marketData?.macro ?? null));
  let fgInfo   = $derived(getFgInfo(marketData?.fearGreed?.data ?? null));
  let rotation = $derived(getRotation(marketData?.sectors));
  let breadthInfo = $derived(getBreadthInfo(marketData?.breadth ?? null));
  let nudge    = $derived(getNudge(vixInfo.level, spyInfo.label, fgInfo));
```

Find the Sector Rotation tile block (around line 205-215):

```svelte
        <!-- Sector Rotation (breadth + leaders/laggards) -->
        {#if rotation}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={TIPS.sectorLeaders}>
            {@render tileHeader(rotation, 'Rotation')}
            <div class="flex flex-col gap-0.5 text-[12px] font-mono min-w-0 leading-tight mt-0.5">
              {@render rotationRow('▲', 'text-bull-strong', rotation.leaders)}
              {@render rotationRow('▼', 'text-bear-weak', rotation.laggards)}
            </div>
          </div>
        {/if}
      </div>
```

Replace with (adds the Breadth tile after Rotation):

```svelte
        <!-- Sector Rotation (breadth + leaders/laggards) -->
        {#if rotation}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={TIPS.sectorLeaders}>
            {@render tileHeader(rotation, 'Rotation')}
            <div class="flex flex-col gap-0.5 text-[12px] font-mono min-w-0 leading-tight mt-0.5">
              {@render rotationRow('▲', 'text-bull-strong', rotation.leaders)}
              {@render rotationRow('▼', 'text-bear-weak', rotation.laggards)}
            </div>
          </div>
        {/if}

        <!-- Watchlist Breadth (%>EMA50/EMA200) -->
        {#if breadthInfo}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={TIPS.breadth}>
            {@render tileHeader(breadthInfo, 'Breadth')}
            <span class="text-[12px] text-text-muted font-mono truncate">
              {breadthInfo.ema50.above}/{breadthInfo.ema50.total} &gt; EMA50 · {breadthInfo.ema200.above}/{breadthInfo.ema200.total} &gt; EMA200
            </span>
          </div>
        {/if}
      </div>
```

- [ ] **Step 5: Add breadth to demo data**

In `src/lib/demoData.js`, find `DEMO_MARKET_CONTEXT` (around line 67-87):

```js
export const DEMO_MARKET_CONTEXT = {
  volProxy:  22.4,
  spyBelowEma50: true,
  spy:       { data: { c: 534.20, dp: -0.8 } },
  fearGreed: { data: { score: 38, rating: 'Fear' } },
  btc:       { data: { price: 61840, dp: -2.3 } },
  macro:     { curveInverted: false, fedRising: false, t10y2y: 0.35, fedFunds: 3.63, fedFundsPrev: 3.63, cpi: 320.6, cpiYoY: 2.4, unemployment: 4.1 },
  sectors: {
```

Add `breadth:` directly before the closing `};` of the object (after the `sectors: { ... }` block, around line 86):

```js
  sectors: {
    XLK:  { data: { dp: -1.1 } },
    XLF:  { data: { dp:  0.4 } },
    XLV:  { data: { dp:  0.2 } },
    XLY:  { data: { dp: -0.9 } },
    XLP:  { data: { dp:  0.6 } },
    XLE:  { data: { dp: -0.3 } },
    XLI:  { data: { dp: -0.5 } },
    XLB:  { data: { dp: -0.2 } },
    XLU:  { data: { dp:  0.8 } },
    XLRE: { data: { dp:  0.1 } },
    XLC:  { data: { dp: -0.7 } },
  },
  breadth: {
    ema50:  { above: 3, total: 5 },
    ema200: { above: 5, total: 5 },
  },
};
```

(Values match the 5 demo tickers: NVDA/AMZN/MSFT are above their demo EMA50, all 5 are above their demo EMA200 — see `DEMO_MARKET_DATA` in the same file.)

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test`
Expected: PASS — no regressions (this task has no new automated tests, per the project's UI-wiring convention).

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manual smoke check**

Run: `npm run dev`, open the app with no API key configured (demo mode loads automatically). Confirm a new "Breadth" tile appears in the Market Context bar showing "3/5 > EMA50 · 5/5 > EMA200", with a working hover tooltip.

- [ ] **Step 8: Commit**

```bash
git add src/App.svelte src/lib/components/MarketContextBar.svelte src/lib/tooltipDefs.js src/lib/demoData.js
git commit -m "feat: add watchlist breadth tile to Market Context bar

Build by Peter"
```

---

### Task 4: Sector momentum — storage + computation helpers

**Files:**
- Modify: `src/lib/scoring.js` (insert new section after the `getScoreVelocity`/score-velocity block, before `// ─── MAIN SCORING ENGINE ───`... — find the exact insertion point in Step 3 below)
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `storeSectorMomentumSnapshot(etf: string, dp: number): void` — appends `{ dp, ts }` to `localStorage['sm_' + etf]`, deduped within 1 hour, trimmed to the trailing 10 entries.
  - `getSectorMomentumHistory(etf: string): Array<{ dp: number, ts: number }>` — reads the stored array, `[]` if absent/corrupt.
  - `computeSectorMomentum(history: Array<{dp:number}>, todayDp: number|null): number|null` — average of `history`'s `dp` values when `history.length >= 3`, else falls back to `todayDp`; `null` if neither is available.

  Task 6 imports and calls all three.

- [ ] **Step 1: Locate the insertion point and write the failing tests**

First, find where the score-velocity section ends in `src/lib/scoring.js` (run `grep -n "SCORE VELOCITY\|MAIN SCORING ENGINE" src/lib/scoring.js` to confirm exact line numbers in your checkout — the section starts at the `// ─── SCORE VELOCITY ───` comment around line 297 and ends before `// ─── MAIN SCORING ENGINE ───` around line 36 in the original file ordering, but re-verify locally since line numbers shift as this plan's earlier tasks are applied).

In `tests/scoring.test.js`, add the three new function names to the import list at the top (after `betaAdjustedRiskPct` on line 13):

```js
  betaAdjustedRiskPct,
  storeSectorMomentumSnapshot,
  getSectorMomentumHistory,
  computeSectorMomentum,
```

Add a new `describe` block at the end of the file (after the last existing `describe` block):

```js

// ─── Sector momentum ──────────────────────────────────────────────────────────

describe('storeSectorMomentumSnapshot / getSectorMomentumHistory', () => {
  beforeEach(() => localStorage.clear());

  it('stores a snapshot and reads it back', () => {
    storeSectorMomentumSnapshot('XLK', 1.5);
    const history = getSectorMomentumHistory('XLK');
    expect(history).toHaveLength(1);
    expect(history[0].dp).toBe(1.5);
    expect(typeof history[0].ts).toBe('number');
  });

  it('does not add a duplicate within 1 hour', () => {
    storeSectorMomentumSnapshot('XLK', 1.5);
    storeSectorMomentumSnapshot('XLK', 2.0);
    expect(getSectorMomentumHistory('XLK')).toHaveLength(1);
  });

  it('trims to the trailing 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      localStorage.setItem('sm_XLK', JSON.stringify(
        [...JSON.parse(localStorage.getItem('sm_XLK') || '[]'), { dp: i, ts: Date.now() - (15 - i) * 3600000 * 2 }]
      ));
    }
    storeSectorMomentumSnapshot('XLK', 99);
    const history = getSectorMomentumHistory('XLK');
    expect(history.length).toBeLessThanOrEqual(10);
    expect(history[history.length - 1].dp).toBe(99);
  });

  it('returns an empty array when nothing is stored', () => {
    expect(getSectorMomentumHistory('XLF')).toEqual([]);
  });

  it('ignores non-finite dp values', () => {
    storeSectorMomentumSnapshot('XLK', NaN);
    storeSectorMomentumSnapshot('XLK', undefined);
    expect(getSectorMomentumHistory('XLK')).toEqual([]);
  });
});

describe('computeSectorMomentum', () => {
  it('falls back to today\'s dp when fewer than 3 snapshots exist (cold start)', () => {
    expect(computeSectorMomentum([], 2.5)).toBe(2.5);
    expect(computeSectorMomentum([{ dp: 1 }, { dp: 2 }], 2.5)).toBe(2.5);
  });

  it('returns null when there is no history and no today value', () => {
    expect(computeSectorMomentum([], null)).toBeNull();
  });

  it('averages the window once at least 3 snapshots exist', () => {
    const history = [{ dp: 1 }, { dp: 2 }, { dp: 3 }];
    expect(computeSectorMomentum(history, 99)).toBe(2); // average of 1,2,3 — ignores todayDp once warm
  });

  it('filters out non-finite entries before averaging', () => {
    const history = [{ dp: 1 }, { dp: NaN }, { dp: 2 }, { dp: 3 }];
    expect(computeSectorMomentum(history, 99)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/scoring.test.js`
Expected: FAIL — `storeSectorMomentumSnapshot is not defined` / import error.

- [ ] **Step 3: Implement the three functions**

In `src/lib/scoring.js`, find the end of the score-velocity section — the `getScoreVelocity` function that follows `getScoreHistory` (search for `export function getScoreVelocity`). Insert the new section directly after `getScoreVelocity`'s closing `}`, before the `// ─── MAIN SCORING ENGINE ───` comment (or before whatever section directly follows score-velocity in your checkout):

```js

// ─── SECTOR MOMENTUM ────────────────────────────────────────────────────────
// Smoothed replacement for the old single-day sectorTrend boolean. Stores a
// rolling window of the sector ETF's daily % change (already fetched for the
// Market Context rotation tile — zero new API calls), same localStorage
// pattern as the sv_<SYMBOL> score-velocity history above.

const SECTOR_MOMENTUM_KEY = (etf) => `sm_${etf}`;
const MOMENTUM_WINDOW = 10;

export function storeSectorMomentumSnapshot(etf, dp) {
  if (!Number.isFinite(dp)) return;
  const key = SECTOR_MOMENTUM_KEY(etf);
  let history = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) history = JSON.parse(raw);
  } catch { /* noop */ }

  const now = Date.now();
  const last = history[history.length - 1];
  if (!last || now - last.ts > 3600000) {
    history.push({ dp, ts: now });
  }
  if (history.length > MOMENTUM_WINDOW) history = history.slice(-MOMENTUM_WINDOW);

  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch { /* noop */ }
}

export function getSectorMomentumHistory(etf) {
  const key = SECTOR_MOMENTUM_KEY(etf);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const history = JSON.parse(raw);
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

// Cold start (< 3 snapshots — new install, or a sector newly appearing because
// a ticker was just added): fall back to today's single-day dp so scoring is
// never undefined on day one.
export function computeSectorMomentum(history, todayDp) {
  const valid = (Array.isArray(history) ? history : []).filter(e => Number.isFinite(e?.dp));
  if (valid.length < 3) {
    return Number.isFinite(todayDp) ? todayDp : null;
  }
  const sum = valid.reduce((acc, e) => acc + e.dp, 0);
  return Math.round((sum / valid.length) * 100) / 100;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/scoring.test.js`
Expected: PASS — all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.js tests/scoring.test.js
git commit -m "feat: add sector-momentum rolling-window storage helpers

Build by Peter"
```

---

### Task 5: Sector momentum — computeScore + generateThesis integration

**Files:**
- Modify: `src/lib/scoring.js:178-181` (computeScore signal), `src/lib/scoring.js:457-458` (generateThesis bullets)
- Test: `tests/scoring.test.js`

**Interfaces:**
- Consumes: `tickerData.sectorMomentum` (a number, produced by Task 6's `App.svelte` wiring — but this task can be written and tested independently by constructing `tickerData` fixtures directly, without waiting for Task 6).
- Produces: `computeScore`'s sentiment signal and `generateThesis`'s bull/bear bullets now key off `sectorMomentum` instead of `sectorTrend`. Task 6 must set `tickerData.sectorMomentum`, not `tickerData.sectorTrend`, for this to take effect.

- [ ] **Step 1: Update the test helper and write the failing tests**

In `tests/scoring.test.js`, find the `makeTicker()` helper (around line 18-56). Rename the `sectorTrend = null` parameter and the `sectorTrend,` property:

```js
function makeTicker({
  price = 100,
  dp = 1,
  ema50 = null,
  ema200 = null,
  pe = null,
  epsGrowth = null,
  rsi = null,
  macd = null,
  macdCrossover = null,
  adx = null,
  stochK = null,
  stochCross = null,
  high52 = null,
  low52 = null,
  sectorTrend = null,
  news = null,
} = {}) {
  return {
    quote: { data: { c: price, dp } },
    metrics: {
      data: {
        metric: {
          ...(ema50   != null && { '50DayMovingAverage':  ema50 }),
          ...(ema200  != null && { '200DayMovingAverage': ema200 }),
          ...(pe      != null && { peNormalizedAnnual: pe }),
          ...(epsGrowth != null && { epsGrowthTTMYoy: epsGrowth }),
          ...(high52  != null && { '52WeekHigh': high52 }),
          ...(low52   != null && { '52WeekLow':  low52 }),
        },
      },
    },
    news: news ?? null,
    sectorTrend,
```

Replace with:

```js
function makeTicker({
  price = 100,
  dp = 1,
  ema50 = null,
  ema200 = null,
  pe = null,
  epsGrowth = null,
  rsi = null,
  macd = null,
  macdCrossover = null,
  adx = null,
  stochK = null,
  stochCross = null,
  high52 = null,
  low52 = null,
  sectorMomentum = null,
  news = null,
} = {}) {
  return {
    quote: { data: { c: price, dp } },
    metrics: {
      data: {
        metric: {
          ...(ema50   != null && { '50DayMovingAverage':  ema50 }),
          ...(ema200  != null && { '200DayMovingAverage': ema200 }),
          ...(pe      != null && { peNormalizedAnnual: pe }),
          ...(epsGrowth != null && { epsGrowthTTMYoy: epsGrowth }),
          ...(high52  != null && { '52WeekHigh': high52 }),
          ...(low52   != null && { '52WeekLow':  low52 }),
        },
      },
    },
    news: news ?? null,
    sectorMomentum,
```

Add new tests in a new `describe` block, placed directly after the closing `});` of the existing `describe('generateThesis', ...)` block:

```js

// ─── sectorMomentum scoring + thesis ──────────────────────────────────────────

describe('computeScore — sectorMomentum signal', () => {
  it('scores higher sentiment for stronger positive momentum', () => {
    const strong = makeTicker({ sectorMomentum: 4 });
    const weak   = makeTicker({ sectorMomentum: -4 });
    expect(computeScore(strong).sentiment).toBeGreaterThan(computeScore(weak).sentiment);
  });

  it('treats missing sectorMomentum as neutral (0.5), same as an in-range value of 0', () => {
    const withNull = makeTicker({ sectorMomentum: null });
    const neutral  = makeTicker({ sectorMomentum: 0 }); // strictly inside (-1, 1] → maps to 0.5
    expect(computeScore(withNull).sentiment).toBeCloseTo(computeScore(neutral).sentiment, 5);
  });
});

describe('generateThesis — sector momentum bullets', () => {
  it('adds a bullish bullet with the numeric value for positive momentum', () => {
    const ticker = makeTicker({ price: 100, sectorMomentum: 2.3 });
    const thesis = generateThesis(ticker, computeScore(ticker));
    expect(thesis.bulls.some(b => b.includes('+2.3%'))).toBe(true);
  });

  it('adds a bearish bullet with the numeric value for negative momentum', () => {
    const ticker = makeTicker({ price: 100, sectorMomentum: -4.1 });
    const thesis = generateThesis(ticker, computeScore(ticker));
    expect(thesis.bears.some(b => b.includes('-4.1%'))).toBe(true);
  });

  it('adds no sector-momentum bullet when the value is null', () => {
    const ticker = makeTicker({ price: 100, sectorMomentum: null });
    const thesis = generateThesis(ticker, computeScore(ticker));
    expect(thesis.bulls.some(b => b.includes('Sector momentum'))).toBe(false);
    expect(thesis.bears.some(b => b.includes('Sector momentum'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- tests/scoring.test.js`
Expected: FAIL — the sentiment/thesis assertions fail because `computeScore`/`generateThesis` still read `sectorTrend`, which is no longer set by the (renamed) test fixture.

- [ ] **Step 3: Update `computeScore`'s sentiment signal**

In `src/lib/scoring.js`, find (around line 178-181):

```js
  if (tickerData.sectorTrend !== undefined && tickerData.sectorTrend !== null) {
    const v = tickerData.sectorTrend ? 0.2 : 0.8;
    sentScore += v; sentFactors++; signals.push(v);
  } else sentScore += 0.5;
```

Replace with:

```js
  if (tickerData.sectorMomentum !== undefined && tickerData.sectorMomentum !== null) {
    const sm = tickerData.sectorMomentum;
    const v = sm > 3 ? 0.9 : sm > 1 ? 0.7 : sm > -1 ? 0.5 : sm > -3 ? 0.3 : 0.1;
    sentScore += v; sentFactors++; signals.push(v);
  } else sentScore += 0.5;
```

- [ ] **Step 4: Update `generateThesis`'s bullets**

In `src/lib/scoring.js`, find (around line 457-458):

```js
  // ── SENTIMENT ──
  if (tickerData.sectorTrend === true)  bears.push(`Sector ETF is in a downtrend — headwind for individual names.`);
  if (tickerData.sectorTrend === false) bulls.push(`Sector ETF trending up — tailwind for this setup.`);
```

Replace with:

```js
  // ── SENTIMENT ──
  if (tickerData.sectorMomentum != null) {
    const sm = tickerData.sectorMomentum;
    if (sm < 0)      bears.push(`Sector momentum ${sm.toFixed(1)}% (10d) — headwind for individual names.`);
    else if (sm > 0) bulls.push(`Sector momentum +${sm.toFixed(1)}% (10d) — tailwind for this setup.`);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/scoring.test.js`
Expected: PASS — all tests in the file green.

Run: `npm test`
Expected: PASS — full suite green (confirms nothing else in the codebase still relies on the old `sectorTrend` boolean shape for these two functions).

- [ ] **Step 6: Commit**

```bash
git add src/lib/scoring.js tests/scoring.test.js
git commit -m "feat: replace sectorTrend boolean with numeric sectorMomentum in scoring + thesis

Build by Peter"
```

---

### Task 6: Sector momentum — App.svelte wiring + demo data

**Files:**
- Modify: `src/App.svelte:2` (import `getSectorETF`), `src/App.svelte:11` (import the three scoring helpers), `src/App.svelte:200-210` (replace the sectorTrend fetch block), `src/App.svelte:382` (persisted-supplement field), `src/App.svelte:503` (restored-supplement field)
- Modify: `src/lib/demoData.js:21,31,41,52,63` (rename `sectorTrend: false` → `sectorMomentum: <number>` per ticker)

**Interfaces:**
- Consumes: `getSectorETF(sector)` (already exported from `src/lib/api/finnhub.svelte.js`), `storeSectorMomentumSnapshot`, `getSectorMomentumHistory`, `computeSectorMomentum` (Task 4, `src/lib/scoring.js`).
- Produces: `results[symbol].sectorMomentum`, consumed by `computeScore`/`generateThesis` (Task 5) at render/scoring time. This is the last task in the sector-momentum slice — after this, `sectorTrend` no longer exists anywhere in the codebase.

No new automated tests — this is pure UI/data-flow wiring around already-tested pure functions (Tasks 4 and 5 cover the logic; this task is verified by build + manual smoke check, same convention as Task 3).

- [ ] **Step 1: Add the new imports**

In `src/App.svelte`, find the finnhub import (line 2):

```js
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, fetchMarketContext, isStorageFull, clearStorageFullFlag, fetchCandles, fetchProfile, fetchSmartMoney, hydrateFromCache, pruneOrphanedCache, delay } from './lib/api/finnhub.svelte.js';
```

Replace with (adds `getSectorETF`):

```js
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, getSectorETF, fetchMarketContext, isStorageFull, clearStorageFullFlag, fetchCandles, fetchProfile, fetchSmartMoney, hydrateFromCache, pruneOrphanedCache, delay } from './lib/api/finnhub.svelte.js';
```

Find the scoring import (line 11):

```js
  import { getDaysToEarnings, computeScore, storeScoreSnapshot, setMarketContext } from './lib/scoring.js';
```

Replace with (adds the three sector-momentum helpers):

```js
  import { getDaysToEarnings, computeScore, storeScoreSnapshot, setMarketContext, storeSectorMomentumSnapshot, getSectorMomentumHistory, computeSectorMomentum } from './lib/scoring.js';
```

- [ ] **Step 2: Replace the sectorTrend fetch block**

In `src/App.svelte`, find (around line 200-210):

```js
        // Sector trend
        try {
          const etfQuote = await fetchSectorETFQuote(ticker.sector);
          if (etfQuote.data) {
            results[ticker.symbol].sectorTrend = etfQuote.data.dp < -1;
          } else {
            results[ticker.symbol].sectorTrend = null;
          }
        } catch {
          results[ticker.symbol].sectorTrend = null;
        }
        await delay(100);
```

Replace with:

```js
        // Sector momentum — smoothed 10-snapshot rolling average of the sector
        // ETF's daily % change, replacing the old single-day boolean.
        try {
          const etf = getSectorETF(ticker.sector);
          const etfQuote = await fetchSectorETFQuote(ticker.sector);
          if (etfQuote.data) {
            storeSectorMomentumSnapshot(etf, etfQuote.data.dp);
            results[ticker.symbol].sectorMomentum = computeSectorMomentum(getSectorMomentumHistory(etf), etfQuote.data.dp);
          } else {
            results[ticker.symbol].sectorMomentum = null;
          }
        } catch {
          results[ticker.symbol].sectorMomentum = null;
        }
        await delay(100);
```

- [ ] **Step 3: Rename the persisted-supplement field**

In `src/App.svelte`, find (around line 382):

```js
            sectorTrend: d.sectorTrend ?? null,
```

Replace with:

```js
            sectorMomentum: d.sectorMomentum ?? null,
```

- [ ] **Step 4: Rename the restored-supplement field**

In `src/App.svelte`, find (around line 503):

```js
            if (s.sectorTrend != null) results[sym].sectorTrend = s.sectorTrend;
```

Replace with:

```js
            if (s.sectorMomentum != null) results[sym].sectorMomentum = s.sectorMomentum;
```

- [ ] **Step 5: Update demo data**

In `src/lib/demoData.js`, replace all five `sectorTrend:   false,` lines with numeric `sectorMomentum` values. AAPL, NVDA, and MSFT are `XLK` (Technology) — give them a mildly positive 10-day momentum despite today's `-1.1%` dp in `DEMO_MARKET_CONTEXT.sectors.XLK` (illustrates the smoothing: one bad day doesn't flip the signal). TSLA and AMZN are `XLY` (Consumer Cyclical) — give them a mildly negative value, consistent with `XLY`'s `-0.9%` today.

AAPL (line 21): `sectorTrend:   false,` → `sectorMomentum: 1.4,`
NVDA (line 31): `sectorTrend:   false,` → `sectorMomentum: 1.4,`
TSLA (line 41): `sectorTrend:   false,` → `sectorMomentum: -0.6,`
AMZN (line 52): `sectorTrend:   false,` → `sectorMomentum: -0.6,`
MSFT (line 63): `sectorTrend:   false,` → `sectorMomentum: 1.4,`

- [ ] **Step 6: Run the full test suite and build**

Run: `npm test`
Expected: PASS — full suite green, `sectorTrend` no longer referenced anywhere (confirm with `grep -rn "sectorTrend" src/ tests/` — expected: no output).

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manual smoke check**

Run: `npm run dev`, open the app in demo mode (no API key). Expand a ticker row and confirm the Thesis Summary shows a "Sector momentum ±X.X% (10d)" bullet in either the bulls or bears list, matching the sign of the ticker's demo `sectorMomentum` value.

- [ ] **Step 8: Commit**

```bash
git add src/App.svelte src/lib/demoData.js
git commit -m "feat: wire sector momentum through App.svelte, drop sectorTrend boolean entirely

Build by Peter"
```

---

### Task 7: Final verification

**Files:** none (verification only)

**Interfaces:** none — this task confirms the previous six integrate cleanly.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (baseline was 319 tests before this plan; expect 319 + ~4 export tests + ~4 breadth tests + ~9 sector-momentum storage tests + ~5 sector-momentum scoring/thesis tests ≈ 341).

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds, `dist/` produced, no errors or warnings about unused/undefined variables.

- [ ] **Step 3: Confirm no stray references to removed/renamed fields**

Run: `grep -rn "sectorTrend" src/ tests/ docs/superpowers/specs/2026-07-17-data-enrichment-round-design.md`
Expected: no output in `src/` or `tests/` (the spec file itself is allowed to mention the old name historically — that grep target is just a sanity check, not a requirement to edit the spec).

- [ ] **Step 4: Manual smoke check in demo mode**

Run: `npm run dev`. In demo mode (no API key), confirm all three features are visible:
- FundamentalsBar shows a "Div Yield" tile for AAPL/MSFT with a percentage, and "—" for NVDA/TSLA/AMZN.
- Market Context bar shows a "Breadth" tile: "3/5 > EMA50 · 5/5 > EMA200".
- Any expanded ticker's Thesis Summary shows a "Sector momentum" bullet with a signed percentage.

- [ ] **Step 5: Update CLAUDE.md project state section (optional but recommended)**

If the user wants the project's CLAUDE.md kept current (per its own convention of documenting each feature round), add a short entry under a new "v0.20 data enrichment round" heading summarizing the three features, following the style of the existing "v0.19 mobile pass" section. This step is optional — confirm with the user before editing CLAUDE.md, since it's a project-wide reference document, not scoped by the design spec.

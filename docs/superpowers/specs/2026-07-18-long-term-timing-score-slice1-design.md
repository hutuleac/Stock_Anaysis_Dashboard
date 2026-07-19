# Design Spec — Long-Term Timing Score + Technical Patterns (Slice 1 of 3)

**Date:** 2026-07-18
**Parent feature:** "Long-Term Dip Buying & Quality Framework" (full spec supplied by user, 2026-07-18)
**This slice:** the Timing Score engine and its supporting technical-pattern primitives. Pure computation + unit tests only — no UI, no Quality Score, no `buildLongTermSetup`.

---

## Context

The parent feature adds two independent scores to each ticker — `qualityScore` (structural business quality) and `timingScore` (attractiveness of the accumulation moment) — plus a `buildLongTermSetup` decision function and a "Long-Term Setup" UI card. The goal is to improve long-term *accumulation* decisions in already-solid companies (healthy dips vs. value traps), **not** to build an automated trading system. The existing `computeScore`/conviction engine is untouched.

Pre-implementation investigation established three things that shape this slice:

1. **Much of the timing/technical side already exists** in `signals.js`, `indicators.js`, `dip.js`, and `etf.js` and should be reused, not rebuilt (this project has a strict "reuse existing patterns" convention).
2. **The project is plain JavaScript with zero TypeScript** (no `.ts` files, no `tsconfig.json`). The parent spec's `.ts` filenames and `type` declarations are converted to `.js` files with JSDoc `@typedef`, matching the documented style already used in `dip.js`/`scoring.js`.
3. **The Quality Score half depends on unverified free-tier Finnhub fundamentals** (ROIC, net debt/EBITDA, current ratio, FCF, etc.) and carries real data-availability risk (cf. the removed `price-target` and `short-interest` features). It is therefore deferred to Slice 2, which begins with a live-data probe.

Splitting the parent feature into three independently shippable slices keeps this first slice zero-risk and fully buildable today:

- **Slice 1 (this doc):** Timing Score engine + technical-pattern primitives. Pure functions + tests. Zero data-availability risk.
- **Slice 2:** Quality Score (opens with a live `metric=all` probe) + earnings beat-rate.
- **Slice 3:** `buildLongTermSetup` + `LongTermSetupCard.svelte`, wiring both scores into the UI and the refresh/cache cycle.

This slice ships as a pure engine with no UI, exactly as `computeBreadth` (an earlier round's Task 2) shipped as a pure function in one PR before being wired into the UI in the next.

## Goals

- A pure `computeTimingScore(...)` function returning the parent spec's `TimingScore` shape.
- The new technical-pattern primitives the timing score needs, as pure, independently testable functions.
- Full unit-test coverage of every new primitive and the composed score, including null-degradation paths.
- Zero new API endpoints. One bounded change to an existing call: deepen the daily-candle fetch so monthly RSI can populate.

## Non-goals (deferred to later slices)

- Quality Score, red flags, earnings beat-rate (Slice 2).
- `buildLongTermSetup` decision logic and the `ACCUMULATE`/`WAIT` statuses (Slice 3).
- The `LongTermSetupCard.svelte` UI, tooltips, colors (Slice 3).
- Wiring timing into the refresh cycle and `timing_analysis` caching (Slice 3, when it becomes user-visible).

---

## Data model (JSDoc typedef, in `timingScore.js`)

```js
/**
 * @typedef {Object} TimingScore
 * @property {number|null} total  0–100, or null if inputs insufficient
 * @property {'STRONG_ACCUMULATION_ZONE'|'WATCHLIST'|'NEUTRAL'|'WAIT'} label
 * @property {Object} components
 * @property {number|null} components.drawdown        0–20
 * @property {number|null} components.oversold        0–20
 * @property {number|null} components.reversal        0–20
 * @property {number|null} components.consolidation   0–15
 * @property {number|null} components.volumeBehavior  0–15
 * @property {number|null} components.marketContext   0–10
 * @property {string[]} signals   human-readable positives
 * @property {string[]} warnings  human-readable cautions
 */
```

`total` is the sum of the non-null components, rounded to the nearest integer. A component is `null` only when its own required inputs are entirely missing (e.g. monthly RSI with <15 monthly bars contributes nothing to `oversold` but does not null the whole component if daily/weekly RSI are present). If **every** component is null, `total` is `null` and `label` is `WAIT`.

### Label thresholds

The parent spec defines the four label values but not their score cutoffs. This slice defines them, consistent with the `buildLongTermSetup` cutoffs Slice 3 will use (timing ≥70 and ≥50):

| Total | Label |
|---|---|
| ≥ 70 | `STRONG_ACCUMULATION_ZONE` |
| 50–69 | `WATCHLIST` |
| 30–49 | `NEUTRAL` |
| < 30 (or null) | `WAIT` |

---

## Component scoring (transcribed from parent spec §4, scoped to timing)

All component maxes sum to 100: drawdown 20 · oversold 20 · reversal 20 · consolidation 15 · volumeBehavior 15 · marketContext 10.

### Drawdown from 52-week high — max 20
`drawdownPct = (currentPrice − week52High) / week52High × 100`, using a **local rolling max over the last ~252 daily closes** (reusing `etf.js`'s approach — not the lagging Finnhub 52w metric).

| Drawdown | Points |
|---|---|
| ≤ −40% | 20 + warning `Deep drawdown: verify whether the investment thesis changed` |
| −40% < dd ≤ −25% | 18 |
| −25% < dd ≤ −15% | 12 |
| −15% < dd ≤ −10% | 6 |
| dd > −10% | 2 |

> **Spec-gap fill:** the parent spec leaves −15% to −10% unspecified; this slice assigns it 6 (documented above). Deeper drawdown is *not* auto-treated as better for weak companies — that guard lives in `buildLongTermSetup` (Slice 3), which routes low-quality + deep-drawdown names to `OVERSOLD_BUT_CAUTION`.

### Oversold multi-timeframe — max 20
Daily RSI(14) and weekly RSI(14) already exist. Monthly RSI(14) is new: resample daily candles to monthly (`resampleMonthly`), then run the existing `computeRSI` (timeframe-agnostic, Wilder's smoothing).

- daily RSI < 30 → +6 · 30–35 → +3
- weekly RSI < 35 → +6 · 35–40 → +3
- monthly RSI < 40 → +8 · 40–45 → +4
- capped at 20

Emits a signal string: `Daily RSI 29 | Weekly RSI 37 | Monthly RSI 44` (monthly shown as `n/a` when null).

### Reversal confirmation — max 20
- bullish RSI divergence on daily (reuse `signals.js:detectDivergence`) → +8
- price closes above EMA20 after ≥3 prior closes below → +5
- MACD histogram rises 3 consecutive days (even if still negative) → +4
- MACD bullish crossover → +3
- capped at 20

### Consolidation quality — max 15
- BB width percentile (over ~126 trading days): <10th → +8 · <20th → +5 · <30th → +2
- consolidation duration (price held within a ≤15% high-low range, sliding window): 20–39d → +2 · 40–59d → +4 · ≥60d → +7
- capped at 15

Emits: `Consolidation: 47 trading days, range 11.2%, BB Width percentile 14`.

### Volume behavior — max 15
- ≥1 capitulation day in the last 15 days → +6
- up/down volume ratio (10d): >1.3 → +6 · 1.0–1.3 → +3 · <0.7 → 0 + warning `Selling volume remains dominant`
- breakout above consolidation high on volume >1.5× 20-day avg → +3
- capped at 15

### Market context — max 10
Pure function over already-available inputs (SPY/EMA50, Fear & Greed, VIX/volProxy, sector momentum from the prior round):
- SPY above EMA50 → +3
- ticker's sector outperforming SPY → +3
- Fear & Greed < 30 but not extreme panic → +2
- VIX/volProxy elevated but not extreme → +2
- Penalties (no points, warning only): SPY below EMA50 & in downtrend → `Broad market trend is still negative`; VIX extreme (>35 or proxy equivalent) → `Extreme volatility: use staged entries only`
- capped at 10

---

## Architecture & interfaces

### Reuse vs. new

| Capability | Source |
|---|---|
| Daily / weekly RSI(14) | **Reuse** `indicators.js:computeRSI` (Wilder's smoothing — new code must match this exactly). |
| Monthly RSI(14) | **New** `resampleMonthly` in `indicators.js` (mirrors `resampleWeekly`; UTC year×12+month key) → existing `computeRSI`. |
| Bullish RSI divergence (daily) | **Reuse** `signals.js:detectDivergence` with daily OHLC + tuned `lookback`. |
| EMA20 reclaim | **New** small helper (uses existing `emaArray`). |
| Drawdown from 52w high | **New** `drawdownFrom52wHigh` (reuses `etf.js`'s local rolling-max pattern). |
| BB width + percentile | **New** `bbWidthPercentile` adapting `signals.js:detectSqueeze`'s `bbBandwidthSeries` math with a parameterized ~126-day lookback. |
| Consolidation range detection | **New** — no prior art. |
| Up/down volume ratio (10d) | **New** — adapts OBV's up/down-day classification. |
| Capitulation-day detection | **New** — no prior art. |
| MACD histogram improving 3d | **New** — slices existing `computeMACDSeries` histogram. |

### New file: `src/lib/technicalPatterns.js`
Hosts **only the new pure primitives**. Each takes plain arrays/inputs, returns a value or `null`, never throws, matches `dip.js` JSDoc style:

- `drawdownFrom52wHigh(dailyCloses)` → `number|null` (negative pct)
- `bbWidthPercentile(dailyCandles, lookback = 126)` → `{ width, percentile }|null`
- `detectConsolidation(dailyCandles, { maxRangePct = 15, minDays = 20 })` → `{ days, rangePct, high, low }|null`
- `upDownVolumeRatio(dailyCandles, window = 10)` → `number|null`
- `detectCapitulation(dailyCandles, { lookback = 15, volMult = 1.8, minPriorDowntrend = 10 })` → `{ detected: boolean, dates: number[] }`
- `macdHistogramImproving(dailyCloses, streak = 3)` → `boolean`
- `emaReclaim(dailyCandles, period = 20, minBelow = 3)` → `boolean`
- `breakoutConfirmation(dailyCandles, consolidationHigh, volMult = 1.5)` → `boolean`

Divergence and RSI/MACD/EMA stay in their existing homes (`signals.js`/`indicators.js`); `timingScore.js` imports them directly, so `technicalPatterns.js` contains only genuinely new logic.

### New file: `src/lib/timingScore.js`
```js
/**
 * @param {Object} input
 * @param {Array} input.dailyCandles   ascending [{t,o,h,l,c,v}], ~400 bars
 * @param {Array} input.weeklyCandles  ascending weekly OHLCV (already fetched)
 * @param {Object} input.marketContext { spyAboveEma50, spyDowntrend, fearGreed, volProxy, sectorOutperforming }
 * @returns {TimingScore}
 */
export function computeTimingScore(input) { ... }
```
Internally: resamples monthly, computes the three RSIs, runs the pattern detectors, sums components, assigns the label. Fully null-safe. No fetching, no cache, no `localStorage` — a pure function of its inputs.

### Modified: `src/lib/indicators.js`
Add `resampleMonthly(raw)` next to `resampleWeekly`. Consider extracting a shared `resampleOHLCV(raw, keyFn)` helper if it keeps both wrappers trivial; otherwise a parallel function is acceptable (≤~15 new lines).

### Modified: `src/lib/api/finnhub.svelte.js`
`fetchCandles` default look-back from ~180 days to ~400 days so monthly RSI(14) has ≥~15 monthly bars. Same endpoint, same call count, more bars. Existing indicators use trailing windows, so more history is safe. Newly-listed tickers with insufficient history still degrade to `null` monthly RSI (no error). The TwelveData daily path (`_250` bars ≈ 12 months) yields ~12 monthly bars — slightly short of 15; monthly RSI simply returns `null` on that path until the deeper Finnhub daily set is present, per the standard degradation rule.

---

## Error handling & null-safety

Follows the project's existing convention (`num()`/`fmt()`/`NA` in `export.js`, "neutral, not penalized" for scoring inputs):
- Any missing/non-finite input → the affected component is `null` and omitted from the sum, never a fake `0`, never a throw.
- Insufficient history for a primitive (e.g. <20 bars for consolidation, <15 monthly bars for monthly RSI) → that primitive returns `null`/`false` and contributes nothing.
- All-null components → `total = null`, `label = 'WAIT'`.

## Cache & refresh

Slice 1 adds **no new cache types**. The only cache-adjacent change is the deeper daily-candle fetch, which reuses the existing `candles` TTL (24h) unchanged. The parent spec's `monthly_candles` cache slot is unnecessary here (monthly is resampled locally, not fetched). The `timing_analysis: 1h` cache and recompute-on-refresh wiring are deferred to Slice 3, when the timing score first becomes user-visible.

## Testing

New/extended unit tests (Vitest, matching existing `tests/*.test.js` style):

- `tests/indicators.test.js` — add `resampleMonthly` cases (month-boundary grouping, OHLCV aggregation, ascending order, insufficient input).
- `tests/technicalPatterns.test.js` (new) — `drawdownFrom52wHigh`, `bbWidthPercentile`, `detectConsolidation`, `upDownVolumeRatio`, `detectCapitulation`, `macdHistogramImproving`, `emaReclaim`, `breakoutConfirmation`, each with a happy path, a boundary case, and a null/insufficient-data case.
- `tests/timingScore.test.js` (new) — per-component scoring at threshold boundaries; the combined `total`/`label` mapping; the null-degradation paths (missing monthly RSI, all-null → `WAIT`); the multi-timeframe RSI signal string format.

Reused functions (`computeRSI`, `detectDivergence`) already have tests; new tests cover only the new daily/monthly call sites and compositions.

## Delivery notes (to report at slice end)

- Files modified/created.
- Confirmation that no new Finnhub endpoint was added (only the daily-candle depth change).
- Any assumption made about market-context inputs mapping (which existing fields feed `spyAboveEma50`, `sectorOutperforming`, `volProxy`).
- Build + full test suite green; no new TypeScript/lint errors.

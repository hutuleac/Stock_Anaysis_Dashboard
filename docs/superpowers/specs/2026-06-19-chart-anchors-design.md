# Chart Anchors — AVWAP, POC, Fibonacci, FVG

Date: 2026-06-19
Status: Design approved, ready for implementation plan

## Summary

Add four price-anchored signals to the dashboard. The two that reduce to a clear
number — anchored VWAP (institutional cost basis) and Point of Control (volume
magnet) — surface as **display pills** and feed the **Setup Radar** as readiness
confirmations. The two that stay visual — Fibonacci retracements and Fair Value
Gaps — surface as optional **chart overlays**. All four come from one
self-contained module computed on daily candles already in memory. Zero new API
calls.

## Motivation

AVWAP is a classic early-entry tell: it shows whether buyers since the last
accumulation low are in profit, which precedes trend confirmation. POC marks the
price where the most volume traded — a magnet and support/resistance reference.
A line on a chart is passive; a pill ("price +2.3% above AVWAP") states the
conclusion. Fib and FVG remain genuinely visual — a single number loses them —
so they stay as overlays.

## Decisions (locked during brainstorming)

| Decision | Choice | Why |
|----------|--------|-----|
| Placement | Pills + overlays on the **existing** PriceChart, not a new page | Anchors only make sense on the candles; reuses all chart plumbing |
| Anchors | All four | AVWAP + POC as pills; Fib + FVG as overlays |
| AVWAP anchor | Most significant **swing low** | Self-contained (no external earnings dates); accumulation cost basis |
| Compute timeframe | **Daily** candles (`allCandles`) | AVWAP fidelity matters; weekly is too coarse. Daily is already loaded |
| Radar integration | **Readiness nudge only** (WATCH→SOON→ACT) | Lowest blast radius; keeps the calibrated setup score untouched |
| Scoring engine | `computeScore` and signals.js **not modified** | Preserves the deliberate display-only / stable-engine convention |

## Architecture

### New module: `src/lib/chartAnchors.js`

Pure functions, no Svelte, no I/O. Mirrors the structure of `signals.js` /
`valuation.js`. Single entry point:

```
computeChartAnchors(dailyCandles) → {
  avwap: { value, pctFromPrice, reclaimed, anchorIndex } | null,
  poc:   { pocPrice, valueAreaHigh, valueAreaLow, position } | null,
  fib:   { swingHigh, swingLow, levels: { '0.382', '0.5', '0.618' }, direction } | null,
  fvg:   { gapsAbove: [...], gapsBelow: [...] } | null   // nearest unfilled gaps
}
```

`dailyCandles` is the oldest-first ascending OHLCV array the chart already uses.
Returns `null` for any sub-object when there aren't enough bars (see Edge cases).
The whole result is `null` if `dailyCandles.length < MIN_BARS` (proposed 60).

#### AVWAP (anchored VWAP)
- Anchor = most significant swing low in the lookback window, found by reusing
  `findSwingPivots` (exported from signals.js) with `direction: 'low'`. "Most
  significant" = lowest-priced confirmed pivot in the window.
- From the anchor index to the latest bar, accumulate `Σ(typicalPrice × volume) /
  Σ(volume)`, where `typicalPrice = (h + l + c) / 3`.
- `pctFromPrice = (lastClose − avwap) / avwap × 100`.
- `reclaimed = lastClose > avwap`.

#### POC + value area
- Bucket the daily price range into N buckets (reuse the bucketing approach from
  `computeVolumeProfile` in PriceChart.svelte — extract shared logic or
  replicate; do **not** reuse `detectVolumeProfile` in signals.js, which is a
  volume-*trend* detector, not a price histogram).
- POC = price of the highest-volume bucket.
- Value area = contiguous buckets around POC accumulating ~70% of total volume →
  `valueAreaHigh` / `valueAreaLow`.
- `position` = `'above'` / `'inside'` / `'below'` based on lastClose vs the value area.

#### Fibonacci (overlay only)
- Take the last major swing high and swing low (`findSwingPivots`, both
  directions). `direction` = whether the more recent pivot is the high or low.
- Levels 0.382 / 0.5 / 0.618 between them. Display only — never feeds the Radar.

#### FVG (overlay only)
- Three-candle bullish gap: `candle[i+1].low > candle[i-1].high` (gap up);
  bearish: `candle[i+1].high < candle[i-1].low` (gap down).
- A gap is "unfilled" if price has not since traded back through it.
- Return nearest unfilled gap above and below current price as
  `{ top, bottom, index }`. Display only.

### Pills (display-only) — `FundamentalsBar.svelte`
- Render AVWAP and POC pills next to the existing RS / PEG / P-S group.
- AVWAP: `AVWAP +2.3%` — green when `reclaimed`, red when below. Tooltip names the
  anchor ("vs swing-low cost basis").
- POC: `POC $182 · upper VA` (or `lower VA` / `at POC`) from `position`.
- Both hidden when their sub-object is `null`.

### Chart overlays — `PriceChart.svelte`
- Two new toggle buttons in the existing overlay-toggle row (alongside BB / RSI /
  Vol Profile). Default **off**.
- Fib: one `createPriceLine` per level (dashed, labeled `0.618 $176`), following
  the existing price-line pattern (e.g. price-target lines at lines 154–156).
- FVG: SVG rectangle overlay reusing the volume-profile SVG pattern (line 662) —
  lightweight-charts v5 has no native box primitive. Shaded translucent band
  spanning the gap's price range; coordinate mapping via the series'
  price-to-coordinate API. This is the one piece with real implementation work;
  scope it explicitly to the SVG approach.

### Radar integration — `src/lib/radar.js`
- App attaches `data.anchors` to each watchlist item (see Wiring).
- In the readiness derivation, AVWAP `reclaimed === true` and POC
  `position !== 'below'` act as confirmation that can bump a name's readiness one
  tier (WATCH→SOON→ACT). Capped at one tier; never demotes.
- The numeric setup score and sort order by score are **unchanged**. signals.js
  is not touched.
- Exact nudge rule to finalize in the plan; default proposal: bump one tier only
  when **both** AVWAP reclaimed and POC not-below, to avoid over-promoting.

### Wiring — `App.svelte`
- Call `computeChartAnchors(dailyCandles)` on the existing daily-candle fetch,
  all three paths (TwelveData, Finnhub, cache-hydrate) → `data.anchors`.
- No new endpoints. Same pattern as the RS / SPY wiring.

## Data flow

```
daily candles (already fetched)
   └─ computeChartAnchors() ─→ data.anchors
                                 ├─ FundamentalsBar  → AVWAP / POC pills (display)
                                 ├─ PriceChart       → Fib / FVG overlays (toggle)
                                 └─ radar.js         → readiness nudge (AVWAP+POC)
```

## Edge cases
- < 60 daily bars → `computeChartAnchors` returns `null`; pills and overlays hide,
  Radar nudge is a no-op.
- No confirmed swing low in window → `avwap = null`.
- Flat/zero volume → `poc = null` (guard divide-by-zero, like valuation.js null guards).
- Fewer than the pivots needed for Fib → `fib = null`.
- No unfilled gaps → `fvg = { gapsAbove: [], gapsBelow: [] }`.

## Testing
- New `tests/chartAnchors.test.js`: AVWAP math against a hand-computed fixture;
  POC/value-area on a known histogram; Fib level arithmetic; FVG detection
  (bullish, bearish, filled-so-excluded); all null-guard paths.
- Update `tests/radar.test.js` for the readiness-nudge behavior (nudges up,
  caps at one tier, never demotes, no-op when anchors null).
- `npm test` must stay green — tests gate the merge.

## Out of scope (YAGNI)
- Earnings-anchored AVWAP (would break self-containment; revisit later as a
  second display-only pill if wanted).
- Feeding anchors into `computeScore` or the numeric setup score.
- Multi-timeframe / intraday AVWAP.
- User-draggable anchor selection.

## Conventions followed
- One feature = one branch = one PR.
- Zero new API calls.
- Display-only except the readiness nudge (explicitly approved).
- Calibrated `computeScore` and signals.js left stable.

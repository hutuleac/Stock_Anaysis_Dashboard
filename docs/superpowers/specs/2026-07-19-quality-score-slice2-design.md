# Design Spec — Quality Score (Slice 2 of 3)

**Date:** 2026-07-19
**Parent feature:** "Long-Term Dip Buying & Quality Framework" (full spec supplied by user, 2026-07-18)
**This slice:** the Quality Score engine + the `financials-reported` fetch capability it needs. Pure computation + one new API wrapper + unit tests. No UI, no `buildLongTermSetup`, no refresh-loop wiring (those are Slice 3).

---

## Context

The parent feature adds `qualityScore` (structural business quality) and `timingScore` (accumulation-moment attractiveness) as two independent scores, feeding a `buildLongTermSetup` decision and a "Long-Term Setup" card. Slice 1 (PR #45) delivered the timing engine. This slice delivers the **Quality Score**.

A live Finnhub free-tier probe (2026-07-19, tickers AAPL/KO/MSFT) settled the feasibility question that gated this slice. Findings:

- **`metric=all` (already fetched + cached as `fh_fundamentals_<TICKER>`, 133 fields) returns nearly every ratio input:** `roiTTM` (return on investment — an ROIC *proxy*, labeled honestly), `roeTTM`, `roaTTM`, `operatingMarginTTM`, `grossMarginTTM`, `netProfitMarginTTM`, `currentRatioQuarterly`, `totalDebt/totalEquityQuarterly`, `netInterestCoverageTTM`, `payoutRatioTTM`, `dividendYieldIndicatedAnnual`, `pegTTM`. It also carries `series.annual`/`series.quarterly` time-series (`fcfMargin`, `netDebtToTotalEquity`, `ebitda`, per-share trends).
- **Net debt/EBITDA is absent** under any name → the balance-sheet component uses the spec's `debt/equity` fallback path (which the parent spec caps at 10, not 15 — so balance-sheet realistically tops out ~20/25; this is an accepted, documented consequence of the data, consistent with the parent spec's own fallback design).
- **`financials-reported` works on the free tier** (16 quarters). Cash-flow concept codes are stable across all three companies even though labels differ wildly: OCF = `us-gaap_NetCashProvidedByUsedInOperatingActivities`, capex = `us-gaap_PaymentsToAcquirePropertyPlantAndEquipment`, buyback = `us-gaap_PaymentsForRepurchaseOfCommonStock`. So **FCF = OCF − capex** is cleanly computable (AAPL FY: 111.5B − 12.7B = 98.8B), and share-count reduction is derivable from the income-statement diluted-share concept.
- **Earnings beat rate** uses `/stock/earnings` history (`fetchHistoricalEarnings`, already in the codebase) — actual/estimate/surprisePercent per quarter.

**Scope decision (user, 2026-07-19):** include `financials-reported`. FCF comes from true OCF − capex (not the `pfcfShareTTM` proxy), and buyback/share-reduction is a real signal — fully realizing the cash-flow and shareholder-return components. This is one new cached endpoint per ticker (rate-limited, 7-day TTL).

Like Slice 1, the Quality **engine** ships as a pure, tested function that is not yet wired to the UI or the refresh loop — that integration, plus `buildLongTermSetup` and the card, is Slice 3.

## Goals

- A pure `computeQualityScore(input)` returning the parent spec's `QualityScore` shape.
- `parseFinancials(report)` — stable, concept-based extraction of OCF, capex, buyback, and diluted-share count from a `financials-reported` payload.
- `fetchFinancialsReported(symbol)` — a cached, rate-limited API wrapper mirroring the existing `fetchHistoricalEarnings`.
- Full unit-test coverage of both pure functions, including null-degradation and the parent spec §8 red-flag cases.

## Non-goals (deferred to Slice 3)

- Wiring `fetchFinancialsReported` and `computeQualityScore` into `App.svelte`'s per-ticker refresh loop.
- `buildLongTermSetup` (combining quality + timing into ACCUMULATE/WAIT statuses).
- `LongTermSetupCard.svelte` and all UI/tooltips/colors.
- Settling the open Slice-1 `fg < 30` "extreme panic" market-context decision.

---

## Data model (JSDoc typedef, in `qualityScore.js`)

```js
/**
 * @typedef {Object} QualityScore
 * @property {number|null} total  0–100, or null if too little data
 * @property {'HIGH'|'MEDIUM'|'LOW'|'INSUFFICIENT_DATA'} label
 * @property {Object} components
 * @property {number|null} components.profitability     0–30
 * @property {number|null} components.cashFlow          0–25
 * @property {number|null} components.balanceSheet      0–25
 * @property {number|null} components.shareholderReturn 0–10
 * @property {number|null} components.earningsQuality   0–10
 * @property {string[]} redFlags
 * @property {string[]} notes
 */
```

`total` = sum of non-null components, rounded. A component is `null` only when all its inputs are missing (a single missing sub-input contributes 0 to a still-scored component, per the parent spec). Label thresholds (parent spec defines the enum but not the cutoffs; defined here consistent with `buildLongTermSetup`'s quality gates of ≥75/≥65/≥60):

| Condition | Label |
|---|---|
| < 3 of 5 components non-null | `INSUFFICIENT_DATA` (total may still be reported) |
| total ≥ 75 | `HIGH` |
| total 50–74 | `MEDIUM` |
| total < 50 | `LOW` |

---

## Component scoring (transcribed from parent spec §3, with confirmed field mappings)

Maxes sum to 100: profitability 30 · cashFlow 25 · balanceSheet 25 · shareholderReturn 10 · earningsQuality 10.

### Profitability — max 30  (`metric=all`)
**ROIC** (from `roiTTM`; if absent, fall back to `roeTTM` and add a note "ROIC unavailable — used ROE"):
- ≥ 20% → 18 · ≥ 15% → 15 · ≥ 10% → 10 · ≥ 5% → 5 · < 5% → 0

**Operating margin** (`operatingMarginTTM`):
- ≥ 25% → 8 · ≥ 15% → 6 · ≥ 8% → 4 · > 0% → 2 · ≤ 0% → 0

**Profitability stability** (`epsGrowthTTMYoy`, `epsGrowth3Y`):
- both positive → +4 · exactly one positive → +2 · both negative → 0 + warning `EPS growth is negative across multiple periods`

(`grossMarginTTM`, `roaTTM` are carried in `notes` for context, not separately scored.) Cap 30.

### Cash flow & valuation — max 25  (`financials-reported` + `metric=all`)
**FCF yield** = `FCF / marketCap × 100`, where `FCF = OCF − capex` from `parseFinancials`, `marketCap` from `profile2`.
> **Unit reconciliation (implementation gotcha):** `profile2.marketCapitalization` is in **USD millions**; `financials-reported` FCF is in **absolute USD**. Convert to the same scale (marketCap × 1e6) before dividing. If either is missing → cashFlow FCF sub-score is null, not 0.

- ≥ 8% → 15 · ≥ 6% → 12 · ≥ 4% → 8 · ≥ 2% → 4 · < 2% → 1 · FCF < 0 → 0 + red flag `Negative free cash flow`

**PEG** (`pegTTM`):
- PEG > 0 and ≤ 1.0 → 10 · ≤ 1.5 → 7 · ≤ 2.0 → 4 · > 2.0 → 1 · invalid/≤0/absent → no points (do not penalize)

Cap 25.

### Balance sheet — max 25  (`metric=all`)
Net debt/EBITDA is unavailable on Finnhub, so the **debt/equity fallback path** is the norm (accessed as `m['totalDebt/totalEquityQuarterly']` — the key contains a slash):
- debt/equity < 0.5 → 10 · < 1.0 → 7 · < 2.0 → 3 · ≥ 2.0 → 0 + warning `High leverage: debt/equity at or above 2`
- (If a future data source provides net debt/EBITDA, the parent spec's ≤1→15 / ≤2→11 / ≤3→6 / ≤4→2 / >4→0+redflag path applies instead.)

**Liquidity** (`currentRatioQuarterly`):
- ≥ 1.5 → +5 · ≥ 1.0 → +3 · < 1.0 → 0 + warning `Current ratio below 1`

**Interest coverage** (`netInterestCoverageTTM`):
- ≥ 8 → +5 · ≥ 3 → +3 · < 3 → 0 + red flag `Weak interest coverage`

Cap 25 (via the debt/equity fallback the leverage sub-score maxes at 10, so this component typically tops out ≈20 — an honest reflection of the weaker leverage signal).

### Shareholder return — max 10  (`metric=all` + `financials-reported`)
**Dividend** (`dividendYieldIndicatedAnnual`, `payoutRatioTTM`):
- div yield ≥ 2% and payout < 70% → 4 · div yield > 0 and payout < 90% → 2 · payout ≥ 90% → 0 + warning `Dividend payout may be unsustainable`
- A non-payer (growth company) is not penalized — the dividend sub-score is simply 0, no warning.

**Share-count reduction** (diluted shares YoY from `parseFinancials`: latest vs prior annual `WeightedAverageNumberOfDilutedSharesOutstanding`):
- shares down > 2% YoY → +6 · down 0–2% → +3 · up > 3% YoY → 0 + warning `Material share dilution`
- If diluted-share history is missing → this sub-score is null (component still scores off the dividend sub-score); do not force it.

Cap 10.

### Earnings quality — max 10  (`/stock/earnings` history)
Beat rate over the last up-to-8 reports (`actual > estimate`):
- ≥ 75% → 10 · ≥ 60% → 7 · ≥ 50% → 4 · < 50% → 1
- 3+ consecutive misses (trailing `actual < estimate`) → 0 + red flag `Repeated earnings misses`

---

## Architecture & interfaces

### New: `fetchFinancialsReported(symbol)` in `src/lib/api/finnhub.svelte.js`
Mirrors `fetchHistoricalEarnings` exactly: `fetchWithCache('financials', symbol, () => fetchFinnhub('/stock/financials-reported?symbol=…'))`. Add `CACHE_TTL.financials = 604800` (7 days — statements update quarterly) and a matching `EVICT_TTL` prefix entry (`fh_financials_`). Uses the existing rate limiter and cache/evict machinery — no new infra.

### New: `src/lib/qualityScore.js`
- `parseFinancials(reported)` → `{ fcf, ocf, capex, buyback, dilutedShares, dilutedSharesPrior }` (each `number|null`). Operates on the `financials-reported` payload (`{ data: [{ year, quarter, form, report: { bs, cf, ic } }] }`). Picks the latest annual report (`quarter === 0`, else the latest) and, for the share-count delta, the prior annual. Extraction keys off the **stable US-GAAP `concept`** via case-insensitive substring — never the company-specific `label`:
  - OCF ← `NetCashProvidedByUsedInOperatingActivities`
  - capex ← `PaymentsToAcquirePropertyPlantAndEquipment`
  - buyback ← `PaymentsForRepurchaseOfCommonStock`
  - dilutedShares ← `WeightedAverageNumberOfDilutedSharesOutstanding` (in `ic`)
  - `fcf = ocf - capex` when both present, else null. Any concept not found → that field is null (never throws, never a fake 0).
- `computeQualityScore(input)` → `QualityScore`, composing the five components above. Input:
  ```js
  /**
   * @param {Object} input
   * @param {Object} input.metric    the metric=all `metric` object (roiTTM, roeTTM, operatingMarginTTM, pegTTM, currentRatioQuarterly, 'totalDebt/totalEquityQuarterly', netInterestCoverageTTM, payoutRatioTTM, dividendYieldIndicatedAnnual, epsGrowthTTMYoy, epsGrowth3Y, grossMarginTTM, roaTTM)
   * @param {number|null} input.marketCap   USD millions (from profile2)
   * @param {Object|null} input.financials  parsed output of parseFinancials()
   * @param {Array|null}  input.earnings    [{ actual, estimate }] most-recent-first, up to 8
   */
  ```
  Pure — no fetching, no localStorage, no UI.

### Reuse
- `fetchHistoricalEarnings` (existing) provides the earnings array; `parseFinancials` + `fetchFinancialsReported` are new. No indicator/scoring reuse needed — Quality is independent of the technical engine.

## Error handling & null-safety
Follows the project convention (`num()`/`NA`, "missing → null, never fake-zero, never throw"). A missing metric → its sub-score contributes 0 within an otherwise-scored component; a component whose inputs are entirely absent → `null` and omitted from the total; < 3 of 5 components present → label `INSUFFICIENT_DATA`. `parseFinancials` returns nulls for any concept it can't find and never throws on a malformed payload.

## Cache & refresh
One new cache type: `financials` (7-day TTL) with its evict prefix. `metric=all` and `/stock/earnings` are already fetched and cached — the Quality Score reads them. No duplicate fetches. (Wiring the actual fetch call into the refresh cycle is Slice 3; this slice only defines the wrapper + the pure engine.)

## Testing
- `tests/qualityScore.test.js` (new):
  - `parseFinancials` against fixtures shaped like the real probe output (the three confirmed concept codes with divergent labels; a payload missing capex → null fcf; an empty/malformed payload → all null; a two-annual-report fixture exercising the diluted-share YoY delta).
  - `computeQualityScore` at each component tier boundary (ROIC 20/15/10/5, FCF yield 8/6/4/2/negative, PEG 1.0/1.5/2.0, debt/equity 0.5/1.0/2.0, current ratio 1.5/1.0, coverage 8/3, payout 70/90, share-count ±, beat rate 75/60/50 + 3-consecutive-miss).
  - The parent spec §8 red-flag cases: negative FCF, weak coverage, repeated earnings misses, and the `INSUFFICIENT_DATA` path.
  - The ROIC→ROE fallback note and the non-payer "no penalty" path.

## Delivery notes (to report at slice end)
- Files created/modified.
- The one new Finnhub endpoint used (`/stock/financials-reported`) and its cache TTL.
- Metrics Finnhub does **not** provide (net debt/EBITDA — balance-sheet uses the debt/equity fallback).
- Assumptions: `roiTTM` used as an ROIC proxy; `profile2.marketCapitalization` is USD millions and is scaled to match absolute-USD FCF.

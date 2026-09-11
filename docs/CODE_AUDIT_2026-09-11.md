# Deep code check — v0.23 (2026-09-11)

Baseline before any change: **458 tests / 20 files pass**, `npm run build` clean.
Scope: all of `src/lib/**`, `src/App.svelte`, API layer. Method: mechanical invariant
checks (component-max sums, tooltip-key coverage, metric unwrap paths, percent-vs-fraction
units) + line-by-line read of the math and orchestration code.

---

## Executive summary

Eight defects, one of which is a live scoring bug and one a silent UI regression from the
last engine change. No crashes, no data loss, no security issues. The scoring/gate
invariants the project depends on (component maxes summing to their documented totals,
the `metrics.data.metric` unwrap path, percent-scaled Finnhub thresholds, tooltip-key
coverage) all hold — those classes of bug are clean.

The two that matter:

1. **Timing-score display drift** — commit `f4644ca` changed the engine's component caps
   (reversal 20→15, market 10→15) and never updated the chips, tooltips, or CLAUDE.md.
   The Market chip can render **`Market 14/10`**.
2. **`detectDivergence` computes RSI on a 30-bar slice instead of full history** — makes
   bullish divergence undetectable for roughly half of otherwise valid pivot pairs, and
   materially wrong when it does fire. Feeds three separate scores.

---

## A. Correctness bugs — fixed in this round

### A1. Timing-score component maxes drifted out of sync with the display layer
`src/lib/timingScore.js` vs `src/lib/longTermIndicators.js`, `src/lib/tooltipDefs.js`, `CLAUDE.md`

Engine caps today: drawdown 20 · oversold 20 · reversal **15** · consolidation 15 ·
volume 15 · marketContext **15** (sums to 100 — the engine is self-consistent).

Display layer still carries the pre-`f4644ca` numbers: reversal **20**, market **10**.

Consequences:
- Market context can score up to 14 (3+3+2+2 plus the +4 BULL regime bonus) against a
  displayed max of 10 → the chip renders `Market 14/10` and `chipColor` computes a fill
  ratio of 1.4.
- Reversal renders `Reversal n/20` when 15 is unreachable — every reversal chip reads
  weaker than it is.
- `TIPS.ltReversal` lists per-signal points `+8/+5/+4/+3`; the code awards `+6/+4/+3/+2`.
  `TIPS.ltMarket` says "max 10 pts" and never mentions the regime bonus.

**Fix:** export `TIMING_MAX` / `QUALITY_MAX` from the score engines and have
`longTermIndicators.js` consume them, so a future cap change cannot drift again. Correct
the two tooltip bodies. Update CLAUDE.md.

### A2. `detectDivergence` computes RSI on the lookback window, not the full series
`src/lib/signals.js`

`rsiAtPivots(wClose, …)` is called with `wClose = closes.slice(-30)` and indexes into
that window. Two failures:

- `computeRSI` needs `period + 1 = 15` bars, so **any pivot at window index < 14 returns
  `null`** and the divergence check silently fails. Swing pivots regularly land there.
- When it does return, the RSI is seeded from ≤30 bars instead of full history. Measured
  on a 250-bar series: **48.91 (window) vs 54.89 (full)** at the same bar — enough to
  flip a higher-low/lower-low comparison.

Blast radius: Pullback setup C1 (3.5 of 10 points, `signals.js`), ETF Entry `Turn`
(1.0 of 10, `etf.js`), Long-Term Timing `reversal` (6 of 15, `timingScore.js`).

**Fix:** compute RSI on the full `closes` array at absolute index (`start + pivot.index`).

### A3. News sentiment matches substrings, not words
`src/lib/scoring.js` — `scoreNewsHeadlines`

`BULLISH_WORDS.filter(w => text.includes(w))` produces false hits:
`"executive"` contains **cut** (bearish), `"Armstrong"` contains **strong**, `"brisk"`
contains **risk**, `"fallout"` contains **fall**, `"gloss"` contains **loss**.

News is one of two sentiment signals; sentiment is 20% of the composite, so this is
~10% of every score for any ticker whose headlines mention an executive.

**Fix:** word-boundary regex per term, built once at module load.

### A4. `revenueHistory` never survives a page reload
`src/App.svelte`

`loadQualityScoreForTicker` writes both `qualityScore` and `revenueHistory`, but only
`qualityScore` is persisted into `dashboard_supplement` and re-hydrated on startup. The
function's first line is `if (!data || data.qualityScore) return;` — so after any reload,
`qualityScore` is present, the function short-circuits, and **the 5-bar revenue chart
never renders again** until the cache is cleared.

**Fix:** persist + hydrate `revenueHistory`; gate the early return on both fields.

### A5. `computeScoreZScore` claims a 90-day mean it can never have
`src/lib/scoring.js`

`storeScoreSnapshot` prunes to 7 days and `getScoreHistory` filters to 7 days, so
`getScoreHistory(symbol, 90)` returns at most a week of snapshots. The `maxPoints = 90`
argument is inert and the "90-day mean" comment is wrong.

**Fix (this round):** correct the comment to describe what the code does. Extending
retention would change every displayed Score-Z — see Question Q2.

### A6. ETF Rotation Loss detail can print `RS3m null%`
`src/lib/etf.js` — `scoreEtfExit`

The detail string is gated on `r1 === null` only; when `rs1m` is present and `rs3m` is
null it renders `RS1m +2%, RS3m null%`. Every other component in the codebase renders
`n/a` for a missing input.

### A7. `radar.js` sort tiebreak is NaN for ACCUMULATION rows
`src/lib/radar.js`

The final comparator falls through to `b.rs3m - a.rs3m`. ACCUMULATION deliberately admits
rows with null `rs3m` (documented, correct), so the subtraction yields `NaN` and ordering
among equal-readiness/equal-score rows is undefined.

### A8. `getDaysToEarnings` assumes the calendar is date-ascending
`src/lib/scoring.js`

It returns the *first* entry with `diff >= 0` rather than the *nearest* one. Correct only
while Finnhub returns the calendar sorted ascending. One-line hardening: take the min.

---

## B. Open questions — deliberately not shipped

**Q1. Momentum setup scored exhaustion above a clean trend. — RESOLVED, fix shipped.**
`signals.js` `scoreMomentumSetup` C2 had `Bullish + STABLE → 1.5` while the `else if
(structure.current === 'Bullish')` fallthrough gave both `TREND_EXHAUSTION` and
`RANGE_FORMING` **2.0**. Peter's call: the two mean opposite things to a breakout setup,
so they are now split — `BREAKOUT 3.0 > RANGE_FORMING 2.0 > STABLE 1.5 >
TREND_EXHAUSTION 0.5`. A converging range is coiling energy; flattening swing highs are
the move running out, which should read as a warning rather than a near-clean-trend
score. Momentum scores and Setup Radar readiness move on the next refresh.

**Q2. Score-Z retention.** Extending snapshot retention from 7 to 90 days would make
`computeScoreZScore` mean what its name says, but every currently displayed Score-Z would
move. Left at 7 days; comment corrected instead.

---

## C. Verified intentional / verified clean — no action

Checked and confirmed correct, listed so a future audit doesn't re-flag them:

- **Component maxes all sum correctly**: `dip.js` 9 components → 10.0 · `etf.js` entry
  3+3+2+2 = 10, exit 3+3+2+2 = 10 · `qualityScore.js` 30+25+25+10+10 = 100 ·
  `timingScore.js` 20+20+15+15+15+15 = 100.
- **Metric unwrap path** — all 10 consumers use `metrics?.data?.metric`. No repeat of the
  PR #49 bug.
- **Percent-vs-fraction units** — every Finnhub ratio consumer (`roiTTM`,
  `payoutRatioTTM`, `dividendYieldIndicatedAnnual`, `currentRatioQuarterly`,
  `netProfitMarginTTM`, `revenueGrowthTTMYoy`) is percent-scaled, fixtures included.
- **Tooltip key coverage** — `LT_CHIP_TIPS` covers all 11 timing/quality component keys;
  `COMPONENT_TIPS` covers all 8 ETF entry/exit labels. No silent missing tooltips.
- **Async ordering** — no other fetch path repeats the out-of-order shape fixed in
  `c07549a`; `refreshAll` writes per-symbol keys, and the TD queue resolves per-promise.
- Documented-deliberate items left alone: `sectorTrend === true` meaning downtrend ·
  ATR as a simple average · ACCUMULATION omitting the `rs3m > 0` leaders gate ·
  `chartAnchors.MIN_BARS = 30` · lazy quality fetch in `LongTermScanPanel` ·
  `text-[12px]`/`text-[13px]` literals · `getDaysToEarnings` off-by-one in US timezones.

---

## D. Style / bloat — listed only, not changed

- `computeRSIZScore` is O(n²) (recomputes RSI from scratch for each of 90 bars, per
  ticker, per refresh). Correct, just wasteful; an incremental Wilder pass would be O(n).
- `dip.js` `gateMetrics` calls `computeScore(data)` per ticker on every radar recompute —
  the score is already computed elsewhere in the same render.
- `findSwingPivots(arr, n, 'both')` returns highs and lows in one untagged array; no
  caller uses `'both'`.

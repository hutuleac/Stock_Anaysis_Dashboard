# Data Enrichment Round — Design

**Date:** 2026-07-17
**Status:** Approved (brainstorming session)
**Scope:** Three improvements using data already inside Finnhub's free tier — one true zero-new-call addition, one pure local calculation, one that replaces a noisy boolean with a smoothed number at the cost of zero new API calls (it reuses quotes already fetched for Market Context).

**Dropped from this round:** Analyst price target. Already built and removed once (`ad539bc`, June 2026) — `/stock/price-target` is a premium-only Finnhub endpoint and the field was always empty on the free tier. Not revisited unless a paid data source is added later.

**Out of scope, larger decisions for a future round:** options IV / put-call ratio (needs a backend — this is a static, backend-free SPA), short interest (Finnhub's `/stock/short-interest` also regressed to paid-tier-only, per `BACKLOG.md`; would need FMP or scraping), earnings-surprise-into-scoring (currently display-only by design, not audited here).

**Delivery:** one PR, three commits in order (each independently revertable):

| Order | Item | Touches |
|---|---|---|
| 1 | Dividend yield | `finnhub.svelte.js`, `FundamentalsBar.svelte`, `export.js` |
| 2 | Watchlist breadth | `MarketContextBar.svelte` (or wherever Market Context aggregates) |
| 3 | Sector momentum (replaces `sectorTrend` boolean) | `scoring.js`, `App.svelte`, `MarketContextBar.svelte`, `scoring.test.js` |

---

## 1. Dividend yield (display-only)

**Data source:** already fetched. `fetchMetrics()` calls Finnhub `/stock/metric?metric=all`, which includes `dividendYieldIndicatedAnnual` (percent, e.g. `1.85` for 1.85%). Currently read nowhere in the codebase. Zero new API calls.

**Display:**
- New tile in `FundamentalsBar.svelte`, alongside the other valuation metrics (near P/E, PEG). Format: `1.85%`, or `—` when the field is null/zero (most growth names in a swing-trade watchlist won't pay one — this is an expected, not an error, state).
- Added to `buildStockSnapshot()` in `export.js` so it appears in the Copy-for-AI text export, following the existing "every missing field renders `n/a`" convention.
- New tooltip entry in `tooltipDefs.js` (`TIPS.dividendYield`) matching the existing hover-card pattern.

**Scoring:** none. Matches the project convention (RS, Rev growth, P/S, PEG are all display-only "to keep the calibrated engine stable").

**Testing:** extend `export.test.js` for the new snapshot field (present, `n/a` when null). No new indicator math, so no `indicators.test.js` changes.

---

## 2. Watchlist breadth (display-only)

**Data source:** pure local aggregation over `data.indicators.ema50` / `data.indicators.ema200` and current price, already computed per-ticker for every watchlist name. Zero new API calls, zero new storage — recomputed from the in-memory watchlist array on every render/refresh.

**Calculation:** for the currently-loaded watchlist, count tickers where `price > ema50` and separately where `price > ema200`. Skip tickers with missing indicators (insufficient history) rather than counting them as failing.

**Display:** new stat row in the Market Context bar: `Breadth: 7/10 > EMA50 · 8/10 > EMA200`. Hidden (not shown as `0/0`) when the watchlist has zero tickers with valid EMA data.

**Scoring:** none — this is a watchlist-level regime readout, not a per-ticker signal, so it has no natural slot in `computeScore` (which scores one ticker at a time).

**Testing:** if `MarketContextBar.svelte` currently has no test coverage, none added here (matches existing component-level testing pattern — the project's 319 tests are concentrated in `src/lib/*.js` pure functions, not Svelte components). If the breadth calculation is extracted into a pure helper function (e.g. `computeBreadth(watchlist)` in `indicators.js` or `highlights.js`), it gets unit tests the same way `computeHighlights` does — known-fixture watchlist in, correct counts out, empty-watchlist edge case.

---

## 3. Sector momentum (replaces `sectorTrend` boolean in scoring)

**Problem today:** `sectorTrend` (`App.svelte:204`) is `etfQuote.data.dp < -1` — a single day's percent move on the sector ETF, flipped to a boolean, fed straight into `computeScore` as a flat `0.2`/`0.8` signal (`scoring.js:178-181`) and into `generateThesis` as a plain bull/bear bullet. One noisy trading day can flip a ticker's sentiment signal.

**Data source:** zero new API calls. Every refresh already fetches all 11 sector ETF quotes for the Market Context rotation tile (`ALL_SECTOR_ETFS`, `fetchMarketContext()`). This design reuses that `dp` value — it just stops discarding it after one use.

**Storage — new localStorage pattern, mirrors `sv_<SYMBOL>` score history:**
- New key per sector ETF: `sm_<ETF>` (e.g. `sm_XLK`).
- On each refresh, append `{ dp, ts }` to the array (same shape as the existing score-velocity entries).
- Trim to the trailing ~10 entries (≈10 trading days at one refresh/day; more frequent refreshing just means the window covers fewer calendar days, which is fine — it's a snapshot-count window, not a calendar window).
- `sm_<ETF>` keys get swept by the existing `pruneOrphanedCache` pass alongside `sv_` — same 7-day-unused trim logic, extended to cover the new prefix.

**Computed value — "sector momentum":** simple average of the trailing window's `dp` values. Below ~3 snapshots (cold start — new install, or an ETF newly appearing because a ticker was just added), fall back to today's single `dp` value alone, i.e. today's existing behavior, so scoring is never undefined on day one.

**Scoring — replaces the flat 0.2/0.8 in `scoring.js:178-181`,** same signal slot (`sentTotal` stays `2`), tiered mapping matching the existing eps-growth tier style (`scoring.js:165`):

```js
const v = momentum > 3  ? 0.9
        : momentum > 1  ? 0.7
        : momentum > -1 ? 0.5
        : momentum > -3 ? 0.3
        : 0.1;
```

These tier breakpoints are a first-pass calibration by analogy to the existing eps-growth tiers, not derived from backtested data — same status as every other threshold in `computeScore` (RSI bands, ADX levels, etc.). Tune later if live results suggest otherwise; not blocking for this round.

**Thesis (`generateThesis`, `scoring.js:457-458`):** bullets become numeric instead of binary, e.g. `"Sector momentum +2.3% (10d) — tailwind for this setup."` / `"Sector momentum -4.1% (10d) — headwind for individual names."` Sign and magnitude both shown; the existing bull/bear bucket choice (which list the bullet goes into) still follows the sign of the momentum value.

**Display:** the numeric momentum can optionally also show in the Market Context sector-rotation tile (e.g. as a tooltip on each sector's leader/laggard row — "10d momentum: +2.3%"), but that's a nice-to-have, not required for this spec — the primary deliverable is the scoring/thesis replacement.

**Naming clarification:** `tickerData.sectorTrend` (the field name threaded through `App.svelte` → `computeScore` → `generateThesis`) is renamed to `tickerData.sectorMomentum` (a number, not a boolean) throughout. This is a breaking rename, not an additive field — no dual-write period, since nothing outside this codebase reads `sectorTrend`.

**Testing:** extend `scoring.test.js` — each tier boundary (>3, >1, >-1, >-3, ≤-3) produces the expected signal value; cold-start fallback (< 3 snapshots) uses today's `dp` directly; `generateThesis` bullet text and bull/bear bucket assignment for a positive and a negative momentum fixture. New pure helper (e.g. `computeSectorMomentum(snapshots, todayDp)` in `scoring.js`) gets its own unit tests for the trim-to-10 and averaging logic.

---

## Non-goals for this round

- No new API integrations (yfinance, FMP, or otherwise).
- No backend/server component.
- No changes to the 9-signal engine's weights or bucket totals beyond the sectorTrend→sectorMomentum value-mapping swap (bucket count and `sentTotal` unchanged).
- No revisiting analyst price target or short interest — both previously shipped and removed for the same free-tier-endpoint-regression reason.

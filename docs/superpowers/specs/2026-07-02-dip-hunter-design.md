# Dip Hunter — audit fixes + early dip-entry card

Date: 2026-07-02 · Base: v0.15 · Audit: `docs/audit-2026-07-02.md`

## Goal

Find great entry points in quality stocks the user already follows: when the market is fearful, the stock has been beaten down, but its fundamentals are solid — surface it early with an entry suggestion. Two phases: fix the data defects the audit found, then build the card on the corrected base.

## Phase 1 — audit fixes (branch `fix/audit-f1-f2-f4`)

### F1: real weekly resampling
New export in `src/lib/indicators.js`:

```
resampleWeekly(raw) → { s:'ok', t[], o[], h[], l[], c[], v[] }
```

Groups daily bars by ISO week (from `raw.t` epoch seconds, UTC): open = first bar's open, high = max, low = min, close = last bar's close, volume = sum, t = first bar's timestamp. The current partial week is included. Returns null if input invalid. Replaces the two `i % 5 === 0` blocks in `App.svelte` (refresh path and TD hydrate path). Downstream consumers (`computeWeeklyTrend`, `computeSetupSignals`) are unchanged — they just finally receive correct bars. Expected visible effects: weekly ATR rises to a true weekly value (EntryPanel stops widen to where they should have been), setups reflect the latest trading day.

### F2: VIX removal + volatility proxy
- Delete `fetchQuote('^GSPC')` and `fetchQuote('VIX')` from `fetchMarketContext` (2 saved calls/refresh). `vix` key removed from its return value.
- New export in `indicators.js`: `realizedVol(closes, window = 20)` — annualized stdev of daily log returns × 100 (≈ VIX points). Computed in `App.svelte` from the SPY closes already fetched for RS; passed to `setMarketContext` as `vixPrice` so `scoring.js` and its calibrated 25/35 thresholds stay untouched.
- Null-guard: anywhere a quote's `c` feeds logic, `c > 0` is required (guards future zero-quotes).
- `MarketContextBar` shows "VOL" (SPY 20d realized, annualized) instead of VIX; tooltip updated to explain the proxy. Demo data updated accordingly.
- Since SPY closes are fetched after `fetchMarketContext`, `setMarketContext` is called (again) after they arrive; scores are computed later in the same refresh, so ordering holds. On hydrate, the persisted supplement stores the last computed proxy value.

### F4: SPY trend, not SPY day
`spyDowntrend = lastClose < EMA50(spyCloses)` when ≥ 50 closes are available; falls back to the old `dp < -0.5` rule otherwise. Same `setMarketContext` call as F2.

### F3: remove short interest (endpoint 403 on free tier)
Delete `fetchShortInterest`, its `refreshAll` + hydrate wiring, `short_interest` cache TTL entry, the FundamentalsBar row, and its tooltip def. Note in README changelog; BACKLOG item 5 annotated (endpoint regressed to premium).

### Tests (phase 1)
- `resampleWeekly`: multi-week fixture with a holiday-short week and a partial current week; verifies o/h/l/c/v aggregation and bar count.
- `realizedVol`: known-variance fixture.
- Existing 187 tests stay green.

## Phase 2 — Dip Hunter card (branch `feat/dip-hunter`)

### Data: two new free Finnhub endpoints (verified live 2026-07-02)
Both cached 7 days, called inside the existing serialized enrichment loop in `refreshAll`'s per-ticker section, persisted in `dashboard_supplement`, hydrated on startup. Cost: +2 calls/ticker on the first refresh of a week, then zero.

- `/stock/recommendation` → latest month: `{ strongBuy, buy, hold, sell, strongSell }` + previous month for direction.
- `/stock/insider-sentiment` (last 6 months) → `mspr3m`: mean MSPR of the 3 most recent months.

Stored as `results[symbol].smartMoney = { rec: { buyRatio, deteriorating }, mspr3m }` where `buyRatio = (strongBuy+buy)/total` and `deteriorating = buyRatio dropped > 0.05 vs previous month`.

### Logic: `src/lib/dip.js` — pure, display-only
`computeDipRadar(list, marketCtx)` where `marketCtx = { fearGreed, spyBelowEma50 }`. Never feeds `computeScore` or `signals.js`.

**Quality gate — ALL must pass or the ticker is excluded:**
| Check | Source | Rule |
|---|---|---|
| EPS growth | `epsGrowthTTMYoy ?? epsGrowth3Y` | > 0 |
| Revenue growth | `revenueGrowthTTMYoy` | > 0 |
| Profitability | `netProfitMarginTTM` (fallback `netMargin`) | > 0 |
| PEG | `computePEG(...)` (valuation.js) | < 3 or null |
| Fundamental sub-score | `computeScore(data).fundamental` | ≥ 60 |

**Dip score 0–10, four components (each `{ label, score, max, detail }` like signals.js):**

1. Market fear (max 2.5): F&G < 25 → 2 · < 35 → 1.5 · < 45 → 0.75 · else 0; +0.5 if SPY below EMA50. F&G null → 0, detail "n/a".
2. Oversold (max 3.0): RSI < 30 → 1.5 · < 35 → 1.0 · < 40 → 0.5; +0.75 if `oversoldConfluence`; +0.75 if `rsiZScore ≤ −1.5`.
3. Drawdown (max 2.5): roc60 ≤ −15 → 1.25 · ≤ −8 → 0.75; roc20 ≤ −5 → +0.5; 52w range position < 0.4 → +0.75 (from existing quote + metrics). Capped at 2.5.
4. Smart money (max 2.0): `mspr3m > 0` → +1; `buyRatio ≥ 0.6 && !deteriorating` → +1. Missing data → 0, detail "n/a".

**Readiness:** ACT if score ≥ 7 AND fear component > 0 (never ACT in a greedy market) · SOON ≥ 5 · WATCH ≥ 3 · below 3 not shown. Sort: readiness rank, then score.

### UI: `src/lib/components/DipRadar.svelte`
Rendered directly below SetupRadar, same visual language (table card, readiness pill, hover tooltips via tooltipDefs). Columns: Symbol · Dip Score (n/10) · Readiness · Fear (F&G value chip) · RSI · 60d % · Smart Money (insider/analyst chips) · component breakdown in the row tooltip. Empty state mirrors SetupRadar's. Tooltip defs added to `tooltipDefs.js` explaining each column and the quality gate.

### Tests (phase 2)
`tests/dip.test.js`: gate exclusions (each check individually failing), component tier boundaries, F&G/smart-money null degradation, ACT-requires-fear rule, sort order. Target ~25 tests.

### Ship
- Phase 1 PR first; phase 2 PR after merge. One feature = one branch = one PR.
- Version → v0.16, README changelog entries for both, BACKLOG updated.

## Non-goals
- No changes to `computeScore` weights/inputs (dip card is display-only).
- No push/email alerts on dip signals (localStorage alert system untouched; candidate for a later iteration).
- No new chart overlays.

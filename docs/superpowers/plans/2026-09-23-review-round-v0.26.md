# Review round v0.26 — bugs + deep-dive legibility

Source: codebase review 2026-09-23 (live-verified with real Finnhub/TD/FRED keys).
Baseline: 514/514 tests, clean build, 0 vulns, 176 kB gz.

## Decisions from Peter

| # | Question | Answer |
|---|---|---|
| 1 | Primary device | **Desktop.** Phone preferred long-term but currently too crowded — every change must also *reduce* mobile density |
| 2 | Main job | **Deep dive per ticker** → the expanded row is the primary surface, not the scan panels |
| 3 | Monthly RSI fix may move Timing classifications (+≤8 pts) | **OK** |
| 4 | Entry Panel | Condense, dedupe, **remove Position Size (2% risk rule)** |
| 5 | "β 1.10" | Beta (stock volatility vs S&P 500; 1.10 = moves ~10% more than the market). Lived only inside Position Size → goes with it |

Rules (BACKLOG): one feature = one branch = one PR, zero new API calls, tests gate the merge.

---

## PR 1 — `fix/refresh-guard` (bugs, do first)

### 1a. Concurrent refresh
- **Bug:** `refreshing` flag (`finnhub.svelte.js:329-348`) only covers `refreshAll`. The enrichment loop (`App.svelte:206-400`, minutes on TD 8/min) runs unguarded. `r` key, Refresh button, the API-key `$effect` (`App.svelte:50`) and auto-refresh (`App.svelte:92`) all start a second parallel run. Auto-refresh re-fires every 60s because `lastRefreshed` is written only at the end. Verified live: second run re-fetched AVGO/CRDO quotes while run 1 was on AMZN; 14 tickers >6 min.
- **Fix:** local `let inFlight = $state(false)` in `handleRefresh`, set at entry, cleared in `finally`. Header spinner + progress bind to `inFlight` (not `isRefreshing()`), progress shows the enrichment phase too ("Indicators 5/14").
- **Test:** extract guard if needed, or assert via a small unit on a pure helper; manual: press `r` twice → one run in Network tab.

### 1b. TwelveData is required, not optional
- **Bug:** Finnhub `/stock/candle` = 403 on free tier (verified). Without a TD key, Setup Radar, Dip Hunter, Timing, ETF and chart are silently empty.
- **Fix:** Settings copy: TD "Required for charts, setups, dips, ETFs". One-line empty state in the candle panels when `!hasTDApiKey()`: "Add a free TwelveData key to unlock". Remove the dead Finnhub-candle branch? **No** — keep; paid Finnhub users need it.

### 1c. No-data ticker renders a fake score
- **Bug:** AOI shows `$0.00`, `50 (0/8)`, NEUTRAL badge.
- **Fix:** when quote `c` is 0/null → row shows "no data" and no score/badge; exclude from breadth + scan panels.

### 1d. Partial refresh loses market context
- Market context + RS only persisted at end of `handleRefresh`. Close tab mid-run → empty Market Context tiles, RS "—" after reload.
- **Fix:** write `marketContextData` + SPY closes into `dashboard_supplement` right after they're computed (before the ticker loop).

## PR 2 — `fix/monthly-rsi-bars`

- **Bug:** TD path fetches 250 daily bars ≈ 12 monthly bars; RSI(14) needs 15 → `Monthly RSI n/a` always (verified in demo + live). 8/20 Oversold pts unreachable; Timing caps at 92.
- **Fix:** one const `TD_DAILY_BARS = 400` used at all five sites: `App.svelte:172, 251, 339` (fetch) and `:622, :657` (hydrate cache key `td_ts_1day_<sym>_1day_<N>`). Missing a hydrate site = silent startup blank.
- Assumption to verify: TD `time_series` costs 1 credit regardless of `outputsize`. Watch localStorage size (~1.6× per symbol) — eviction path already exists.
- **Test:** `timingScore` test with 400 synthetic bars → `mRsi` non-null; demoData generates ≥400 bars so demo shows monthly RSI too.
- Expect: some tickers move WAIT→WATCHLIST. Note it in the PR.

## PR 3 — `feat/entry-panel-condense`

Current `EntryPanel.svelte` shows the same numbers 2–3 times: Current Price (already in the row header), Suggested Stop (card **and** Stop-out scenario row), Risk % (card **and** Stop-out P&L), R:R (scenario column **and** separate "R:R to Target" card).

**Target: one compact block, ~4 lines.**
```
Entry $224.42 → Stop $206.10 (−8.2%) → Target $251.30 swing high (+12.0%)   R:R 1:1.5
[ stop ▌────── entry ●────── 2R ─── 3R ── target ▲ ]   ← price ladder bar
```
- Delete: Position Size block, β chip, `betaAdj`, `recommendedShares`, `positionCost`, `maxRiskDollars`, the 4-card Risk Snapshot grid, the separate R:R-to-Target card.
- Scenario table → folded into the ladder (1R/2R/3R ticks with prices on hover via `tipAction`).
- Keep: high-volatility-day warning (only when |dp| ≥ 5%), stop-too-tight band.
- Merge the daily ATR block from `WatchlistTable.svelte:628-640` ("Intraday Volatility") into this block as one line — it's the same risk topic in a different card.
- Remove `portfolioValue` from Settings + `portfolio.svelte.js` if nothing else reads it (grep 2026-09-23: only Settings + EntryPanel). Leave the localStorage key alone (harmless).
- Collapsed by default? No — it becomes small enough to always show.

## PR 4 — `feat/deep-dive-layout` (the main UX round)

The expanded row is the product. Goal: answer "should I act on this ticker, and why" in the first screen, without scrolling.

1. **Verdict header** (top of expanded row, one line): badge + score bar + the reconciler sentence. Fixes live contradiction: SOFI shows `PULLBACK 6.1 SOON` in radar **and** `LEAN SHORT 36 · BROKEN` in table with no explanation. Reconciler rules (pure function in `readiness.js`, tested):
   - short-term bearish + pullback setup SOON/ACT → "Weak now, accumulation setup forming — small, staged size"
   - bullish + breakout ACT → "Trend confirmed — breakout entry"
   - long-term ACCUMULATE → "Quality on sale — long-term entry window"
   - else badge text only.
2. **Section order:** Verdict → Chart → Entry (PR 3) → Setups (Pullback/Momentum/Dip/Long-Term as 4 compact readiness rows with `waitingOn`) → Indicators (FundamentalsBar, collapsed to the active playbook tab) → Fundamentals → AI export.
3. **Colour only verdicts.** Neutral facts (ADX value, PEG, revenue %) render in `text-secondary`; colour only when a threshold makes it good/bad *for this playbook*. Negative RS in ACCUMULATION = `waiting`, not red. Enforce via `tone.js`.
4. **Score readability:** replace tiny T/F/S bars with one 0–100 bar showing badge bands (28/42/58/72) + marker; T/F/S as a hover tooltip. Explain the `*` (regime/SPY penalty applied) via `tipAction`.
5. **Noise:** stale ⚠ shown once in the header ("Quotes 12 min old") instead of every row; replace its native `title=` with `tipAction`. Drop the "Elevated VIX + bearish" banner (duplicates Volatility + SPY tiles). Market Context: 7 tiles → 4 (Volatility, SPY trend, F&G, Macro); Rotation/Breadth/BTC into a hover detail.

## PR 5 — `feat/table-first` (desktop + phone decluttering)

- Scan panels (Setup Radar, Dip Hunter, Long-Term) collapse by default to one summary line: `Setups 1 SOON · Dips 0 · Long-term 0 ready of 13`. Click expands. WAIT-only long-term cards → count only.
- Table gets a **Signals** column of readiness chips (`PULLBACK SOON`, `DIP WATCH`, `LT WAIT`) so each ticker has one home; clicking a summary item filters the table.
- Mobile: watchlist reachable within the first screen; per-row chips wrap under the ticker.
- Acceptance: 402×874 `scrollWidth === clientWidth`; watchlist first row visible above the fold on 1440×900.

---

## Order & sizing
1. PR 1 (small, bugs) → 2. PR 2 (small) → 3. PR 3 (medium) → 4. PR 4 (large, split if >400 lines) → 5. PR 5 (medium).
Bump minor to v0.26 at PR 3 (first visible feature).

## Verification per PR
- `npm test`, `npm run build`, no new svelte-check a11y warnings.
- Browser check with live keys (desktop 1440×900 + 402×874) via `/browse`, before/after screenshots in the PR.

## Out of scope (noted, not planned)
- ~900 svelte-check "errors" = implicit-any on untyped JS. Either set `checkJs: false` or ignore; not bugs.
- Bundle 560 kB (176 kB gz) — fine for a personal tool; lazy-load `lightweight-charts` only if load time becomes a complaint.
- Dependency bumps (all minor) — batch into any PR.

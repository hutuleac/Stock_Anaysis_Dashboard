# Backlog

Forward-looking work only. Shipped features live in the README changelog; current architecture lives in CLAUDE.md.

**Trade style this serves:** medium-term positions (2 months – 1 year), large-cap growth + mid/small cap.
**North star:** two views — **Momentum / Trend Following** and **Pullback / Mean Reversion**.

---

## How we work (so iterations stay cheap)

1. **One feature = one branch = one PR.** Branch off `main` (`feat/<slug>`), never commit to `main` directly.
2. **Zero new API calls is the default.** GitHub Pages is static (no backend) and Finnhub free tier is rate-limited — prefer computing from candles/metrics already fetched. If a feature needs a new endpoint, call it out explicitly (cost column below) and get a yes first.
3. **Display-only unless agreed.** New signals render in the UI but do **not** feed `computeScore` or the weekly setups — the scoring engine is calibrated; changing its inputs is a separate, deliberate decision.
4. **Tests gate the merge.** Add unit tests in `tests/` for any new `indicators.js` / `scoring.js` / `signals.js` / `valuation.js` math. `npm test` green before PR.
5. **On ship:** mark the item done here (or delete it), add a README changelog entry, bump the README version header.

---

## Open queue (priority order)

### ~~1. OBV (On-Balance Volume)~~ ✓ DONE (v0.15)
### ~~2. 52-week-high volume confirmation~~ ✓ DONE (v0.15)
### ~~3. Swing-low support levels~~ ✓ DONE (v0.15)
### ~~4. Beta-adjusted position sizing~~ ✓ DONE (v0.15)

### ~~5. Short interest~~ ✗ REMOVED (2026-07)
- Shipped in v0.15, but the endpoint regressed to premium (403 on free tier) — feature removed in the 2026-07 audit fixes. Restore if Finnhub re-opens `/stock/short-interest`.

### ~~6. Ticker-search edge cases~~ ✓ DONE (2026-09-10)
- No-results, error ("search unavailable"), ambiguous multi-match list, "already in watchlist" dim, and US-exchange filtering were already implemented. The one real gap — an out-of-order-response race when typing fast enough to overlap two in-flight fetches — is now guarded with a request token in `WatchlistTable.svelte`.

### 7. AI export phase 2: Gemini inline analysis
- v0.18 shipped "Copy for AI" (`export.js` snapshot + editable prompt templates, clipboard-only). Phase 2: optional Gemini free-tier API key in Settings, an "Analyze" button next to "Copy for AI" that sends the same merged prompt to Gemini and renders the response inline in the expanded row (no external paste step).
- Needs a new outbound API call (Gemini), so it's an explicit exception to the zero-new-calls default — opt-in and gated behind a user-supplied key, never called without one.
- Spec reference: `docs/superpowers/specs/2026-07-11-ai-export-prompt-design.md`.
- Cost: **1 call per "Analyze" click, opt-in only**.

### ~~8. EtfDashboard mobile card layout~~ ✓ DONE (2026-09-10)
- `EtfDashboard.svelte` now renders a stacked mobile card list (gated by the same `isMobile` matchMedia pattern from #10) instead of the CSS-hidden desktop table on small screens. Expanded content (thesis, indicator chips, entry/exit breakdown, chart) extracted into a shared `expandedContent` snippet used by both layouts.

### ~~9. FundamentalsBar tipAction pair dedup~~ ✓ DONE (2026-09-10)
- Extracted the identical "n/a" (no-value) card markup — RSI, MACD, ADX, Stoch, Volume, W.Trend — into one `emptyMetric(label, minWClass, tip)` snippet in `FundamentalsBar.svelte`. BB and 52W Range keep their own `{:else}` bodies (progress-bar markup differs from the plain dash cards).

### ~~10. Gate ticker expansion panel to the active breakpoint~~ ✓ DONE (2026-09-10)
- `WatchlistTable.svelte` now gates the mobile/desktop `expandedPanel` mount behind a `matchMedia('(max-width: 639px)')`-driven `isMobile` state instead of CSS-only `hidden`/`block` — only the active breakpoint mounts, no more duplicate `PriceChart`/`NewsPanel`.

### 11. "Distance to next tier" on every 0–10 score
Dip Hunter, Setup Radar and the ETF entry/exit scores all use the same tiers — **ACT ≥ 7 · SOON ≥ 5 · WATCH ≥ 3** — but a `6.2 SOON` never says it needs 7.0. Same gap the Long-Term card had before v0.24, and the same fix: one helper alongside `timingHint`/`qualityHint` in the shared colour layer, reused by all three panels. `scoreTone()` in `readiness.js` already owns those tiers, so the thresholds are in one place already.

**Related, and the reason this is worth doing:** Dip Hunter's `ACT` has a *hidden second condition* — score ≥ 7 **and** a non-zero Fear component (`dip.js`, the v0.21 gate). A 7.5 that stays SOON currently reads as a bug. It should say "needs market fear", not leave the user to find that rule in the source.

- Display-only, zero new API calls, zero new math — the tiers and components already exist.
- Cost: **0 calls**.

### 12. "Waiting on" for the other component-based panels
`waitingOn()` / `qualityWaitingOn()` in `longTermIndicators.js` rank the components with the most points still on the table and render them as `Label +gap`. Dip Hunter (9 components), Setup Radar (4 per setup) and the ETF entry/exit scores (4 each) all carry `components[]` in the same `{label, score, max}` shape, so the ranking works on them verbatim — it needs to be lifted out of `longTermIndicators.js` into the shared layer and pointed at each panel's own component list.

Highest value on **Dip Hunter**, where 9 components are too many to eyeball for "what's actually missing here".

- Display-only, zero new API calls, zero new math — pure ranking of existing sub-scores.
- Cost: **0 calls**.

---

## ~~Two-view architecture (the larger arc)~~ ✓ DONE (v0.24, 2026-09-12)

Shipped as an `All | Trend Setup | Pullback Setup` toggle inside `FundamentalsBar.svelte` — it filters the existing technical cards by a membership set (`VIEW_CARDS`), no new math and no new markup per card. Fundamentals and the score-context cards (`CORE`: T/F/S, Conviction, Score Z) are never filtered; `All` is the default. Same tabs on mobile. `tests/fundamentalsBarViews.test.js` asserts the markup keys and the membership sets stay in sync (a typo would silently hide a card).

ATR stop / R:R stayed in `EntryPanel` — it's its own section, not an indicator card.

### ✓ Dip Hunter card (v0.16, 2026-07)
- Quality-gated dip-entry card (market fear + oversold + drawdown + smart money). Uses `/stock/recommendation` + `/stock/insider-sentiment` (free, 7d cache, +2 calls/ticker/week). See `docs/superpowers/specs/2026-07-02-dip-hunter-design.md`.

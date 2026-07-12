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

### 6. Ticker-search edge cases *(carried over from old TODOS)*
- Search works, but failure/ambiguity states are undefined: no results, multiple matches (e.g. "META" → Meta + Metavisio), `/search` down, debounce timing, US-exchange filtering.
- Low effort, UX-only. Spec the behavior, then implement in `WatchlistTable.svelte`.
- Cost: **0 calls**.

### 7. AI export phase 2: Gemini inline analysis
- v0.18 shipped "Copy for AI" (`export.js` snapshot + editable prompt templates, clipboard-only). Phase 2: optional Gemini free-tier API key in Settings, an "Analyze" button next to "Copy for AI" that sends the same merged prompt to Gemini and renders the response inline in the expanded row (no external paste step).
- Needs a new outbound API call (Gemini), so it's an explicit exception to the zero-new-calls default — opt-in and gated behind a user-supplied key, never called without one.
- Spec reference: `docs/superpowers/specs/2026-07-11-ai-export-prompt-design.md`.
- Cost: **1 call per "Analyze" click, opt-in only**.

---

## Two-view architecture (the larger arc)

Most queued signals slot into one of two setups. Target: a **detail-panel tab toggle** (preferred over widening the watchlist table, which must stay scannable):

- **Trend Setup tab:** RS vs SPY · EMA stack · OBV trend · ROC 20/60 · 52w-high breakout proximity
- **Pullback Setup tab:** BB+RSI confluence · volume dry-up · ATR stop / R:R · swing lows

Several of these already ship as Fundamentals-Bar cells; this item is the *organizing UI* that groups them into the two named playbooks, not net-new math.

### ✓ Dip Hunter card (v0.16, 2026-07)
- Quality-gated dip-entry card (market fear + oversold + drawdown + smart money). Uses `/stock/recommendation` + `/stock/insider-sentiment` (free, 7d cache, +2 calls/ticker/week). See `docs/superpowers/specs/2026-07-02-dip-hunter-design.md`.

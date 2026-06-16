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

### 1. OBV (On-Balance Volume)
- Accumulation/distribution read from existing OHLCV. OBV rising while price consolidates = accumulation; OBV falling while price holds = distribution warning.
- Add to `computeIndicatorsFromCandles` (`indicators.js`); display-only cell + tooltip.
- Cost: **0 calls** (existing candle `v` array).

### 2. 52-week-high volume confirmation
- Extends the shipped proximity chip (`proximityTo52wHigh`): a breakout near the 52w high is stronger on above-average volume.
- Overlay a volume-confirmation flag on the existing chip using the candle `v` array.
- Cost: **0 calls**.

### 3. Swing-low support levels
- Auto-detect the last ~3 significant lows from daily candles — the mean-reversion entry anchor (price returning to prior support).
- Compute in `indicators.js`; surface in the Pullback view + as chart lines.
- Cost: **0 calls**.

### 4. Beta-adjusted position sizing
- Finnhub metrics already expose `beta`. High beta + wide ATR → suggest a smaller position.
- Requires a one-time account-size input in Settings; then feed the 2%-rule sizing in EntryPanel.
- Cost: **0 calls** (beta already in metrics).

### 5. Short interest *(needs a new endpoint — approve first)*
- Finnhub `/stock/short-interest`. High short % + improving fundamentals = potential squeeze; most relevant for mid/small caps.
- Add to `finnhub.svelte.js`, display alongside insider transactions.
- Cost: **+1 call/ticker** — the only queued item that isn't free. Decide if it's worth the rate-limit budget.

### 6. Ticker-search edge cases *(carried over from old TODOS)*
- Search works, but failure/ambiguity states are undefined: no results, multiple matches (e.g. "META" → Meta + Metavisio), `/search` down, debounce timing, US-exchange filtering.
- Low effort, UX-only. Spec the behavior, then implement in `WatchlistTable.svelte`.
- Cost: **0 calls**.

---

## Two-view architecture (the larger arc)

Most queued signals slot into one of two setups. Target: a **detail-panel tab toggle** (preferred over widening the watchlist table, which must stay scannable):

- **Trend Setup tab:** RS vs SPY · EMA stack · OBV trend · ROC 20/60 · 52w-high breakout proximity
- **Pullback Setup tab:** BB+RSI confluence · volume dry-up · ATR stop / R:R · swing lows

Several of these already ship as Fundamentals-Bar cells; this item is the *organizing UI* that groups them into the two named playbooks, not net-new math.

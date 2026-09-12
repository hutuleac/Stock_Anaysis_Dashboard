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
5. **On ship:** delete the item from this file, add a README changelog entry, bump the version badge + test count in README and CLAUDE.md.

---

## Open queue (priority order)

### 1. AI export phase 2: Gemini inline analysis
- v0.18 shipped "Copy for AI" (`export.js` snapshot + editable prompt templates, clipboard-only). Phase 2: optional Gemini free-tier API key in Settings, an "Analyze" button next to "Copy for AI" that sends the same merged prompt to Gemini and renders the response inline in the expanded row (no external paste step).
- Needs a new outbound API call (Gemini), so it's an explicit exception to the zero-new-calls default — opt-in and gated behind a user-supplied key, never called without one.
- Spec reference: `docs/superpowers/specs/2026-07-11-ai-export-prompt-design.md`.
- Cost: **1 call per "Analyze" click, opt-in only**.

### 2. "Distance to next tier" on every 0–10 score
Dip Hunter, Setup Radar and the ETF entry/exit scores all use the same tiers — **ACT ≥ 7 · SOON ≥ 5 · WATCH ≥ 3** — but a `6.2 SOON` never says it needs 7.0. Same gap the Long-Term card had before v0.24, and the same fix: one helper alongside `timingHint`/`qualityHint` in the shared colour layer, reused by all three panels. `scoreTone()` in `readiness.js` already owns those tiers, so the thresholds are in one place already.

**Related, and the reason this is worth doing:** Dip Hunter's `ACT` has a *hidden second condition* — score ≥ 7 **and** a non-zero Fear component (`dip.js`, the v0.21 gate). A 7.5 that stays SOON currently reads as a bug. It should say "needs market fear", not leave the user to find that rule in the source.

- Display-only, zero new API calls, zero new math — the tiers and components already exist.
- Cost: **0 calls**.

### 3. "Waiting on" for the other component-based panels
`waitingOn()` / `qualityWaitingOn()` in `longTermIndicators.js` rank the components with the most points still on the table and render them as `Label +gap`. Dip Hunter (9 components), Setup Radar (4 per setup) and the ETF entry/exit scores (4 each) all carry `components[]` in the same `{label, score, max}` shape, so the ranking works on them verbatim — it needs to be lifted out of `longTermIndicators.js` into the shared layer and pointed at each panel's own component list.

Highest value on **Dip Hunter**, where 9 components are too many to eyeball for "what's actually missing here".

- Display-only, zero new API calls, zero new math — pure ranking of existing sub-scores.
- Cost: **0 calls**.

---

## Parked / decided against

- **Dip Hunter's scored components are frozen** after the OBV addition. Further ideas (Stochastic cross, EMA stack, volume confirmation) are risk-context candidates, not new score components, unless a future session revisits it deliberately.
- **Setup Radar (Jul 2026):** an overbought/extension guard on Momentum, and relaxing the leaders gate globally. Peter watches entries manually instead.
- **Macro inputs (Jul 2026):** T10Y3M, DFF, ICSA, Alpha Vantage fallback, CBOE vol indices, direct SEC EDGAR — redundant or YAGNI. HY credit spread is the only macro input that changes a classification.
- **Short interest:** shipped in v0.15, removed in the Jul 2026 audit when Finnhub moved `/stock/short-interest` behind the paid tier (403 on free). Restore only if it re-opens.

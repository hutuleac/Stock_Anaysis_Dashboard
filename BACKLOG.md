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

---

## Parked / decided against

- **Dip Hunter's scored components are frozen** after the OBV addition. Further ideas (Stochastic cross, EMA stack, volume confirmation) are risk-context candidates, not new score components, unless a future session revisits it deliberately.
- **Setup Radar (Jul 2026):** an overbought/extension guard on Momentum, and relaxing the leaders gate globally. Peter watches entries manually instead.
- **Macro inputs (Jul 2026):** T10Y3M, DFF, ICSA, Alpha Vantage fallback, CBOE vol indices, direct SEC EDGAR — redundant or YAGNI. HY credit spread is the only macro input that changes a classification.
- **Short interest:** shipped in v0.15, removed in the Jul 2026 audit when Finnhub moved `/stock/short-interest` behind the paid tier (403 on free). Restore only if it re-opens.

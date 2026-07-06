# ETF Section — UCITS Entry/Exit Signals via US Proxies

Date: 2026-07-06
Status: Approved (design), pending implementation plan

## Problem

The user invests in Ireland-domiciled accumulating UCITS ETFs (tax-efficient in Europe) with a months-to-a-year horizon. They want a dedicated dashboard section to:

1. Find good entry points — oversold conditions, or underperformance caused by capital rotation (e.g. AI/energy absorbing all flows, leaving other sectors relatively cheap).
2. Spot ETFs with strong momentum in growing industries/regions (buy candidates).
3. Find exit points — overbought / exhaustion after large runs, or when rotation pulls capital out.

## Constraint & core decision: US proxy data

Finnhub free tier and TwelveData free tier do NOT provide candles for European exchanges (Xetra, LSE, Borsa Italiana). The app is 100% client-side on GitHub Pages, so CORS rules out unofficial sources (Yahoo, etc.).

**Decision:** every tracked UCITS ETF is mapped to a US-listed proxy tracking the same (or near-identical) index. All signal math runs on the proxy's candles via the existing Finnhub/TwelveData pipeline — **zero new APIs**. For a months-to-a-year horizon, index-level correlation is ~1:1; only currency and TER differ, neither affects timing signals.

Tradeoff (accepted): displayed price is the US proxy's price in USD, not the UCITS price in EUR. The proxy ticker is shown clearly next to the price to avoid confusion.

## Default ETF catalog

| UCITS ticker | ISIN | Name | TER | Category | US Proxy |
|---|---|---|---|---|---|
| VUAA | IE00BFMXXD54 | Vanguard S&P 500 (Acc) | 0.07% | Core US | SPY |
| CSPX | IE00B5BMR087 | iShares Core S&P 500 (Acc) | 0.07% | Core US | SPY |
| CNDX | IE00B53SZB19 | iShares Nasdaq 100 | 0.33% | Tech / Big-cap | QQQ |
| EQQQ | IE00BFZXGZ54 | Invesco EQQQ Nasdaq-100 | 0.30% | Tech / Big-cap | QQQ |
| AIAI | IE00BK5BCD43 | L&G Artificial Intelligence | — | AI thematic | THNQ |
| AIRO | IE00BYZK4552 | Global X Robotics & AI | — | AI/Robotics | BOTZ |
| SMGB | IE00BMC38736 | VanEck Semiconductor | 0.35% | Semiconductors | SMH |
| IUES | IE00B42Z5J44 | iShares S&P 500 Energy | — | Energy (fossil) | XLE |
| INRG | IE00B1XNHC34 | iShares Global Clean Energy | — | Clean energy | ICLN |

List is user-editable: add/remove ETFs; adding one requires entering the US proxy ticker (plus name/ISIN/TER/category as optional display fields). Persisted in localStorage.

Note: VUAA+CSPX share proxy SPY, CNDX+EQQQ share QQQ — candles are fetched once per unique proxy, signals computed once, displayed on each mapped row.

## UI / Navigation

- Header toggle button: `Stocks | ETFs`. Switches the whole content area to a new `EtfDashboard.svelte` view. Stock view untouched.
- ETF table columns: UCITS ticker + ISIN + TER, category, proxy ticker + proxy price (USD), RS 1M / RS 3M, Entry score, Exit score, readiness badge.
- Sortable by RS 3M (rotation ranking view — see where capital flows in/out at a glance).
- Expandable row: score component breakdown + proxy candlestick chart (reuse `PriceChart.svelte`).

## Data layer

- New store `src/lib/stores/etflist.svelte.js`: default catalog above, user edits, localStorage persistence (key `etfList`).
- Candle fetches (weekly + daily) for unique proxies go through the existing TwelveData/Finnhub pipeline with the existing rate-limit queue and localStorage cache conventions. SPY is already fetched for stock RS. Budget: ~7 unique new symbols — fits free-tier limits.

## Signal engine — `src/lib/etf.js`

Reuses math from `indicators.js` and the weekly setup engine `signals.js`. Display-only: does NOT touch `computeScore` or the stock watchlist.

Per ETF (computed on the proxy):

- **Entry score 0–10:**
  - Weekly oversold: RSI tiers, z-score, Bollinger confluence.
  - Rotation discount: moderate underperformance vs SPY AND vs the median of the other tracked ETFs (rotation "AI absorbs everything" = the others get relatively cheap). Extreme underperformance scores 0 (flag, not discount) — same philosophy as Dip Hunter's RS component.
  - Turn signal: MACD bullish cross, bullish divergence (from signals.js).
- **Exit score 0–10:**
  - Weekly overbought: RSI > 70 tiers.
  - Exhaustion: extension above weekly EMA50 (distance in ATRs / percent tiers), parabolic run.
  - Rotation loss: RS 3M falling below the group median (capital rotating out).
  - Climax volume.
- **Rotation ranking:** RS 1M / RS 3M vs SPY (via existing `computeRelativeStrength`) + cross-ranking among tracked ETFs.
- **Readiness labels:** WATCH / SOON / ACT thresholds, calibrated for weekly cadence (months-to-a-year horizon).

Component maxes within each score must always sum to 10 (same convention as dip.js).

No fundamentals: ETFs have no EPS/margins, so Dip Hunter's quality gate and the fundamental scoring pillar do not apply. The engine is purely technical + relative strength.

## Testing

`tests/etf.test.js` with synthetic fixtures (oversold series, parabolic run, rotation rank shifts), following the style of `dip.test.js` / `signals.test.js`. Existing 214 tests must keep passing.

## Out of scope

- Real UCITS prices in EUR (no free CORS-friendly source; revisit only if one appears).
- Feeding ETF signals into the stock scoring engine.
- Currency/FX overlay, TER-adjusted return comparisons.

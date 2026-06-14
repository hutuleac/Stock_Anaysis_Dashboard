# Weekly Leading-Signal Layer — Design Spec

**Date:** 2026-06-14
**Status:** Approved for planning
**Author:** Peter + Claude

## Problem

The dashboard's composite score is entirely **lagging** — it rates whether a stock is good *right now*. For the target trade style (medium-term positions, 2 months to 1 year), *timing the entry* matters as much as picking the name. A high score is exactly when you risk buying a quality stock at a local top.

This adds a **leading-signal layer**: forward-looking detectors that fire *before* the lagging score catches up, telling the user an entry window is opening and roughly when.

The approach is adapted from the `range-finder` crypto project's Signal Scanner (`signal_engine.py`), which separates a lagging "Grid Score" from a leading "Setup Score" built on 6 leading detectors. We port the **transferable** detectors, **invert** the crypto bias (grid bots want chop; we want trends), and run them on the **weekly** timeframe to match a months-to-year hold.

## Goals

- Surface two distinct, separately-scored entry setups per ticker:
  - **Pullback / Accumulation** — catch bottoms (buy weakness before the turn)
  - **Momentum / Breakout** — catch the start of trends (buy strength)
- Add a readiness/ETA framing (WAIT → WATCH → SOON → ACT) so output is decision-useful, not just descriptive.
- Zero new API calls — reuse weekly candles already fetched per ticker.
- Pure, unit-tested functions matching the existing `indicators.js` / `scoring.js` style.

## Non-Goals (YAGNI)

- No funding rate, Open Interest, or order-flow CVD — crypto/derivatives only, unavailable on Finnhub free tier.
- No daily-timeframe trigger layer in v1 (weekly only).
- No new data sources or API endpoints.
- No backtesting harness (separate future effort).

## Background: what ports from range-finder

| range-finder detector | Ports? | Stock adaptation |
|---|---|---|
| CVD divergence | Partial | No order-flow data; use **RSI/MACD divergence** on price instead (OBV later) |
| Squeeze progression (BB bandwidth) | Yes | Direct — weekly BB bandwidth compression |
| Structure transition | Yes | Direct — weekly swing-pivot HH/HL vs LH/LL |
| Momentum divergence (RSI/MACD) | Yes | Direct — this becomes our primary divergence engine |
| Volume exhaustion | Yes | Direct — weekly volume slope + percentile |
| Funding/OI imbalance | No | Crypto-only, dropped |

**Inversions from the crypto logic:**
- Crypto blocks on high ADX (grid bots want ranging). We treat a confirmed trend as *positive* for the momentum setup.
- Crypto trades both directions equally. We prioritize **bullish** divergence at lows and **downtrend** exhaustion (long-only entry timing).
- Crypto runs on 4H candles. We run on **weekly** candles.

## Architecture

### New file: `src/lib/signals.js`

Pure functions. Imports `emaArray`, `computeRSI`, `computeMACD` from `indicators.js` — no duplication of core math.

**Shared helper**

```
findSwingPivots(arr, pivotBars = 2, direction = 'both') -> [{ index, value }]
```
Ported from `_find_swing_pivots`. A bar is a swing high if it's >= its `pivotBars` neighbors on each side (low = <=).

**Detectors** — each takes raw weekly arrays, returns a small result object.

1. `detectDivergence(closes, highs, lows, lookback)` 
   - Bullish: most recent two swing **lows** show price lower-low while RSI (and/or MACD histogram) higher-low.
   - Returns `{ type: 'BULL'|'BEAR'|'NONE', strength: 0..1, barsAgo }`.
   - For v1 the aggregators consume the **bullish** case primarily.

2. `detectSqueeze(closes, period = 20, mult = 2, lookback = 40)`
   - Computes BB bandwidth `(upper-lower)/middle*100` per bar, slope over last 10, percentile vs available history.
   - Returns `{ phase: 'FLAT'|'COMPRESSING'|'SQUEEZE'|'EXPANDING', percentile, currentBw, barsToSqueeze }`.

3. `detectVolumeProfile(volumes, lookback = 12)`
   - Linear-regression slope of volume as % of mean + current percentile.
   - Returns `{ state: 'DRY_UP'|'EXPANSION'|'NEUTRAL', slopePct, percentile }`.
   - DRY_UP = declining slope + low percentile (accumulation/exhaustion). EXPANSION = rising slope + high percentile (breakout confirmation).

4. `detectStructure(highs, lows, lookback = 20)`
   - Current regime Bull/Bear/Neutral from swing pivots (HH/HL vs LH/LL).
   - Signal: `STABLE` | `TREND_EXHAUSTION` (swing extremes flattening) | `RANGE_FORMING` (highs+lows converging) | `BREAKOUT` (price clears recent swing-high range).
   - Returns `{ current, signal, confidence: 0..1 }`.

**Aggregators** — two separate setups, each 0–10.

```
scorePullbackSetup({ divergence, structure, volume, rangePos }) -> setupResult
scoreMomentumSetup({ squeeze, structure, volume, emaReclaim }) -> setupResult
```

`setupResult` shape:
```
{
  score: 0..10,
  label: string,            // e.g. 'STRONG SETUP' | 'FORMING' | 'NO SETUP'
  components: [{ label, score, max, detail }],
  readiness: 'WAIT'|'WATCH'|'SOON'|'ACT',
  etaWeeks: number | null,
}
```

**Pullback components** (weights, max points):
- Bullish divergence (max 3.5) — strongest single accumulation signal
- Downtrend exhaustion / range forming (max 2.5)
- Volume dry-up (max 2.0)
- Price in lower-half of 52-week range (max 2.0)

**Momentum components**:
- Squeeze resolving up: SQUEEZE/COMPRESSING phase + price above EMA (max 3.0)
- Structure flipping bullish / BREAKOUT (max 3.0)
- Volume expansion (max 2.0)
- Price reclaiming weekly EMA10/EMA(n) (max 2.0)

Readiness derived from score + phase urgency (mirrors `_calc_urgency`): squeeze/imminent or fresh divergence bumps readiness up. `etaWeeks` from `barsToSqueeze` / exhaustion confidence (mirrors `_estimate_eta`, but in weeks).

**Main export**
```
computeSetupSignals(weeklyRaw) -> { pullback: setupResult, momentum: setupResult } | null
```
Returns `null` if `weeklyRaw` invalid or too few bars (guard: `< 20` weekly bars). `rangePos` is computed from the weekly candles themselves (min low / max high over available history) — no dependency on Finnhub 52w metrics, keeping `signals.js` self-contained.

### Integration: `src/App.svelte`

Three small edits, no new fetches:
1. Import `computeSetupSignals` from `./lib/signals.js`.
2. After each `computeWeeklyTrend(weeklyRaw)` call (the live path ~line 232 and the cache-hydrate path ~line 335), also call `computeSetupSignals(weeklyRaw)` and attach `results[sym].setups` / `data.setups`.
3. In the cache-snapshot object (~line 286 block), persist `setups: d.setups ?? null` and rehydrate it alongside `weekly`.

### UI surfacing (minimal, existing patterns)

- **WatchlistTable**: a compact "Setup" badge showing the higher-readiness of the two setups with a `PULLBACK` / `BREAKOUT` tag and readiness color. Hidden when both are WAIT/NO SETUP.
- **Expanded row** (FundamentalsBar or a small dedicated block): both setups rendered with their component bars + ETA, reusing the existing component-bar rendering style used elsewhere.
- **Tooltips**: add entries to `tooltipDefs.js` for each setup type and component, following the existing schema (range/label/color/desc + why).

### Tests: `tests/signals.test.js`

Vitest, same style as `tests/indicators.test.js` / `tests/scoring.test.js`:
- `findSwingPivots`: detects highs/lows, respects `pivotBars`, handles short arrays.
- `detectDivergence`: engineered price-down/RSI-up series triggers BULL; aligned series returns NONE; null/short guards.
- `detectSqueeze`: contracting-bandwidth series → COMPRESSING/SQUEEZE; expanding → EXPANDING; percentile bounds.
- `detectVolumeProfile`: declining series → DRY_UP; rising → EXPANSION; flat → NEUTRAL.
- `detectStructure`: rising HH/HL → Bullish; flattening highs → TREND_EXHAUSTION; converging → RANGE_FORMING.
- `scorePullbackSetup` / `scoreMomentumSetup`: scores in [0,10], readiness label matches thresholds, components sum correctly, ETA present when phase implies it.
- `computeSetupSignals`: returns null on bad/short input; returns both setups with valid shape on good input.

## Data constraints

- Finnhub free 'W' fetch = ~52 weekly bars (App.svelte line 230: `52 * 7 * 86400`). Sufficient for divergence/structure (lookback 20–30). Squeeze percentile window capped to available history (≤ ~40 bars) rather than the crypto version's longer lookback. Documented as a known limitation.
- All detectors must degrade gracefully (return neutral/NONE) when bars are insufficient, never throw.

## Rollout

1. `signals.js` + `signals.test.js` (TDD), all green.
2. Wire into App.svelte (live + cache paths), verify build.
3. UI badge + expanded-row block + tooltips.
4. Update README (Testing + feature section), CLAUDE.md project state, ROADMAP (mark items shipped).

## Success criteria

- `npm test` green including new `signals.test.js`.
- `npm run build` clean.
- A ticker in a multi-month base with tightening weekly bands surfaces a Momentum/Breakout `WATCH`/`SOON`; a ticker making lower lows with rising weekly RSI surfaces a Pullback/Accumulation setup.
- No increase in API calls per refresh.

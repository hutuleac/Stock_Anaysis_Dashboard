# Design Spec — Long-Term Setup (Slice 3 of 3)

**Date:** 2026-07-19
**Parent feature:** "Long-Term Dip Buying & Quality Framework" (full spec supplied by user, 2026-07-18)
**This slice:** `buildLongTermSetup` decision logic + wiring both prior engines into the refresh loop + the "Long-Term Setup" UI (scan panel + per-ticker card). Final slice — closes out the parent feature.

---

## Context

Slice 1 (PR #45, merged) delivered `computeTimingScore` — pure, not yet wired into `App.svelte`. Slice 2 (PR #47, merged) delivered `computeQualityScore` + `fetchFinancialsReported` — same status: pure, not wired. Neither engine currently runs during a refresh; neither has any UI surface.

This slice closes both gaps: combines the two scores into a single actionable status via `buildLongTermSetup`, wires both engines into `App.svelte`, and ships the UI.

Two open questions carried over from Slices 1–2 are resolved here (user decisions, 2026-07-19):
1. **Where does it surface?** Both — a watchlist-wide scan panel (DipRadar-style) *and* a per-ticker detail card in the expanded row (ThesisSummary-style).
2. **Fear & Greed < 30 "extreme panic" handling** (deferred from Slice 1): boosts a `WATCHLIST` status to `ACCUMULATE` when quality is also confirmed decent — panic accelerates an already-good setup, it doesn't manufacture one.

A third decision was settled during this slice's design: **Quality Score's inputs (`fetchFinancialsReported` + `fetchHistoricalEarnings`) are fetched lazily**, on row-expand, not in the eager batch-refresh loop — mirroring the existing lazy-fetch pattern `PriceChart.svelte` already uses for `fetchHistoricalEarnings`. This avoids adding 2 more Finnhub calls per ticker to every refresh on a free-tier quota, at the cost of the scan panel not having quality data for never-expanded tickers (handled explicitly, not silently — see below).

## Goals

- `buildLongTermSetup(timingScore, qualityScore, marketContext)` — pure function combining the two engines' outputs into one status.
- `timingScore` computed eagerly for every ticker during the existing refresh loop, reusing candles already fetched — zero new API calls for this half.
- `qualityScore` computed lazily on row-expand, reusing `fetchFinancialsReported` (Slice 2) + the existing-but-not-yet-wired `fetchHistoricalEarnings` — the one new *call site* for previously-unused-in-refresh endpoints, gated to only fire when a user actually looks at a ticker.
- `LongTermScanPanel.svelte` — watchlist-wide bird's-eye view.
- Per-ticker card in `WatchlistTable.svelte`'s expanded row.
- Full unit-test coverage of `buildLongTermSetup`.

## Non-goals

- Changing `computeScore`/conviction engine (untouched, as in Slices 1–2).
- ETF section (Long-Term Setup is stocks-only, matching Dip Hunter's scope).
- Persisting `longTermSetup` itself to localStorage as a distinct key — it's derived from `timingScore`/`qualityScore`, which already persist via the existing `dashboard_supplement` mechanism; recomputed on load like `computeScore` is.

---

## `buildLongTermSetup` — status enum & gate matrix

```js
/**
 * @typedef {Object} LongTermSetup
 * @property {'ACCUMULATE'|'WATCHLIST'|'OVERSOLD_BUT_CAUTION'|'NEUTRAL'|'WAIT'|'INSUFFICIENT_DATA'} status
 * @property {import('./timingScore.js').TimingScore|null} timingScore
 * @property {import('./qualityScore.js').QualityScore|null} qualityScore
 * @property {string[]} reasons
 */
```

**Bands:**
- Timing: `t = timingScore?.total ?? null`. `STRONG` if `t >= 70`, `WATCH` if `t >= 50`, else `WEAK` (includes `null`).
- Quality: `q = qualityScore?.total ?? null`, `ql = qualityScore?.label ?? null`. `HIGH` if `q >= 75`, `GOOD` if `q >= 65`, `OK` if `q >= 60`, else `WEAK_OR_UNKNOWN` (includes `q < 60`, `ql === 'INSUFFICIENT_DATA'`, and `qualityScore == null` — i.e. not yet fetched).

**Matrix** (row = timing band, column = quality band):

| | HIGH | GOOD | OK | WEAK_OR_UNKNOWN |
|---|---|---|---|---|
| **STRONG** | ACCUMULATE | ACCUMULATE | ACCUMULATE | OVERSOLD_BUT_CAUTION |
| **WATCH** | WATCHLIST | WATCHLIST | NEUTRAL | NEUTRAL |
| **WEAK** | WAIT | WAIT | WAIT | WAIT |

**Override:** if `t === null` (timing engine had nothing — e.g. under 15 monthly bars and under 20 weekly bars) **and** (`qualityScore == null` or `ql === 'INSUFFICIENT_DATA'`) → `status = 'INSUFFICIENT_DATA'`, skipping the matrix entirely. This is a genuine "we have nothing to say" case, distinct from `WAIT` ("we checked, the moment isn't right").

**Extreme-panic boost:** after the matrix (and before the `INSUFFICIENT_DATA` override check — the override still wins if data is truly absent), if `marketContext?.fearGreed < 30` and quality band is `HIGH` or `GOOD` and the matrix-derived status is `WATCHLIST` → promote to `ACCUMULATE`. Push a reason: `"Extreme market panic (F&G < 30) + confirmed quality — accelerated to ACCUMULATE"`. Never fires when quality band is `OK`/`WEAK_OR_UNKNOWN` or status is anything other than `WATCHLIST`.

**`reasons` construction** (1–2 entries, plain English, mirrors `dip.js`/`etf.js` thesis-string conventions):
- `ACCUMULATE`: `"Strong timing (${t}) + ${qualityLabel} quality (${q}) — accumulation zone"`.
- `OVERSOLD_BUT_CAUTION`, quality genuinely weak (`ql !== null && ql !== 'INSUFFICIENT_DATA'` and `q < 60`): `"Deep drawdown/oversold but quality score ${q} is below the ≥60 gate — could be a value trap"`.
- `OVERSOLD_BUT_CAUTION`, quality not yet checked (`qualityScore == null`): `"Timing looks attractive but quality hasn't been checked yet — expand this ticker to fetch fundamentals"`.
- `WATCHLIST`: `"Good quality (${q}), timing not yet ripe (${t}) — watch for a better entry"`.
- `NEUTRAL`: `"Timing and quality signals are mixed — no clear edge either way"`.
- `WAIT`: `"Timing score too low (${t ?? 'n/a'}) — not yet an attractive entry moment"`.
- `INSUFFICIENT_DATA`: `"Not enough data for either score yet — needs more price history and/or fundamentals"`.

## Architecture & wiring

### New: `src/lib/longTermSetup.js`
`buildLongTermSetup(timingScore, qualityScore, marketContext)` — pure, no fetching, no localStorage, no UI. Consumes the exact `TimingScore`/`QualityScore` shapes from Slices 1–2 unchanged.

### `App.svelte` — eager half (timingScore)
In the existing per-ticker daily-candle block (both the TD path, ~line 238, and the Finnhub path, ~line 273), immediately after `computeSetupSignals`/`computeChartAnchors` are computed from the same `synthetic`/`candleRes.data` and `weeklyRaw`/`weeklyRes.data`:

```js
const timing = computeTimingScore({
  dailyCandles: synthetic,        // or candleRes.data on the Finnhub path
  weeklyCandles: weeklyRaw,       // or weeklyRes.data on the Finnhub path
  marketContext: { fearGreed: marketContextData?.fearGreed?.data?.score ?? null },
});
if (timing) results[ticker.symbol].timingScore = timing;
```

Zero new API calls — `computeTimingScore` only consumes candle arrays already in scope.

### `App.svelte` / `WatchlistTable.svelte` — lazy half (qualityScore)
Mirrors `PriceChart.svelte`'s existing `$effect` that calls `fetchHistoricalEarnings` when its `symbol` prop changes (see `PriceChart.svelte:205`). A new handler, triggered when `WatchlistTable`'s `isSelected`/expand state activates a ticker for the first time (or `data.qualityScore` is absent), calls:

```js
async function loadQualityScore(symbol, data) {
  if (data.qualityScore) return; // already computed this session
  const [finRes, earnRes] = await Promise.all([
    fetchFinancialsReported(symbol).catch(() => null),
    fetchHistoricalEarnings(symbol, 8).catch(() => null),
  ]);
  const financials = finRes?.data ? parseFinancials(finRes.data) : null;
  const earnings = Array.isArray(earnRes?.data) ? earnRes.data : null;
  const marketCap = data.profile?.marketCapitalization ?? null;
  const metric = data.metrics?.data ?? null;
  const quality = computeQualityScore({ metric, marketCap, financials, earnings });
  setMarketData({ [symbol]: { ...data, qualityScore: quality } });
}
```

Both `fetchFinancialsReported` and `fetchHistoricalEarnings` are already-cached (7d / 24h) — re-expanding a ticker within the cache window costs nothing.

### `App.svelte` — combining
Wherever `data.longTermSetup` is read (both new UI components pull it via a `$derived` or direct call, not a stored field, to always reflect the latest of both inputs without an extra write path):

```js
const longTermSetup = $derived(
  data.timingScore || data.qualityScore
    ? buildLongTermSetup(data.timingScore ?? null, data.qualityScore ?? null, { fearGreed: marketContextData?.fearGreed?.data?.score ?? null })
    : null
);
```

### UI

**`src/lib/components/LongTermScanPanel.svelte`** (new) — collapsible panel in the `'stocks'` view, positioned alongside `DipRadar` (above `WatchlistTable`). For each watchlist ticker with a `timingScore`, computes `buildLongTermSetup` and groups into three buckets, sorted by status priority:
1. `ACCUMULATE` / boosted-`ACCUMULATE`
2. `OVERSOLD_BUT_CAUTION` with `qualityScore == null` (labeled distinctly: "Timing looks good — check quality")
3. Everything else collapsed under a "show more" toggle (matches `DipRadar`'s collapsed-by-default convention for low-priority rows).

Tickers with no `timingScore` yet (candle fetch failed/pending) are silently excluded, same as `DipRadar`'s existing null-handling.

**`WatchlistTable.svelte` expanded row** — a new section in the shared `{#snippet expandedPanel(...)}` (both mobile and desktop layouts, per the v0.19 shared-snippet convention), placed next to `ThesisSummary`: status badge (color per status — reusing the existing `scoreStyle`-style color convention: green=ACCUMULATE, blue=WATCHLIST, amber=OVERSOLD_BUT_CAUTION, gray=NEUTRAL/WAIT, muted=INSUFFICIENT_DATA), the two component scores/labels, and the `reasons` list. Triggers `loadQualityScore` on first render if `data.qualityScore` is absent.

## Error handling & null-safety

Follows the established convention throughout: `buildLongTermSetup` never throws — `timingScore`/`qualityScore` args may independently be `null` (engine not yet run) or a full object with `total: null` (engine ran, insufficient inputs). Both are treated identically by the band logic (`WEAK`/`WEAK_OR_UNKNOWN`). The lazy `loadQualityScore` fetch failures (`.catch(() => null)`) degrade to `qualityScore: null` on the ticker — the UI then shows "not yet checked", never a crash or a fake score.

## Testing

- `tests/longTermSetup.test.js` (new):
  - All 12 matrix cell combinations (3 timing bands × 4 quality bands) → correct status.
  - `INSUFFICIENT_DATA` override: both engines empty/null → `INSUFFICIENT_DATA`, even though the raw bands alone would say `WAIT`.
  - `INSUFFICIENT_DATA` does NOT fire when only one side is null (e.g. `timingScore.total === 50`, `qualityScore === null` → falls through to matrix as `WATCH` × `WEAK_OR_UNKNOWN` → `NEUTRAL`, not `INSUFFICIENT_DATA`).
  - Extreme-panic boost: `WATCHLIST` + `fearGreed < 30` + `HIGH`/`GOOD` quality → `ACCUMULATE`; confirms it does NOT fire on `WAIT`, `OVERSOLD_BUT_CAUTION`, `NEUTRAL`, or `INSUFFICIENT_DATA`, and does NOT fire when `fearGreed >= 30` or quality band is `OK`/`WEAK_OR_UNKNOWN`.
  - `reasons` text distinguishes `qualityScore == null` ("not yet checked") from `qualityScore.total < 60` ("below the gate") in the `OVERSOLD_BUT_CAUTION` case.
  - Boundary values at every threshold (t=70/69, t=50/49, q=75/74, q=65/64, q=60/59).

- No changes needed to `tests/timingScore.test.js` or `tests/qualityScore.test.js` — both engines' contracts are unchanged, only newly consumed.

- Manual verification (no automated UI test in this codebase's convention — matches how Slices 1–2 and prior UI rounds were verified): `npm run dev`, add a ticker, confirm the scan panel and per-ticker card render, expand a ticker and confirm the lazy quality fetch fires exactly once (check Network / cache keys), confirm a second expand within the cache window makes no new calls.

## Delivery notes (to report at slice end)

- Files created: `src/lib/longTermSetup.js`, `tests/longTermSetup.test.js`, `src/lib/components/LongTermScanPanel.svelte`.
- Files modified: `src/App.svelte` (timingScore wiring + qualityScore lazy loader + longTermSetup derivation), `src/lib/components/WatchlistTable.svelte` (expanded-row card).
- No new Finnhub endpoints in this slice (both used by `qualityScore`'s lazy fetch — `financials-reported`, `stock/earnings` — already exist from Slices 1–2; this slice just adds the call *sites*).
- Confirms the parent feature's three-slice delivery is complete.

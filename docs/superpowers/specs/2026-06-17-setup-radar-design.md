# Setup Radar — early entries in great stocks

**Date:** 2026-06-17
**Status:** Approved design, ready for implementation plan
**Scope:** Surface, in one place, the watchlist names that have an *early* technical entry forming **and** are *great* companies. Zero new API calls; display-only; does not touch the calibrated `computeScore` or setup math.

---

## Problem

The app already detects early entries (weekly Pullback/Accumulation + Momentum/Breakout setups with WAIT/WATCH/SOON/ACT readiness) and already has quality signals (RS-vs-SPY, revenue growth, PEG). But they live in separate places — the watchlist row, the Fundamentals Bar — so the user has to assemble "is this an early entry in a great stock?" by hand, ticker by ticker. The Setup Radar does that assembly automatically and shows the answer above the fold.

Trade-style scope: medium-term (2mo–1yr) entries in large-cap growth + mid/small cap.

---

## Architecture

Follows the existing convention: pure logic module + thin Svelte component + unit tests (mirrors `indicators.js` / `scoring.js` / `signals.js` / `valuation.js`).

| File | Type | Responsibility |
|---|---|---|
| `src/lib/radar.js` | NEW (pure) | `computeRadar(list)` — gate + rank logic. No Svelte, no DOM, fully unit-testable. |
| `src/lib/components/SetupRadar.svelte` | NEW | Collapsible panel; consumes `computeRadar`, renders rows, handles click-to-select. Modeled on `MorningBrief.svelte`. |
| `tests/radar.test.js` | NEW | Unit tests for `computeRadar`. |
| `src/App.svelte` | EDIT | Import + render `<SetupRadar />` between `<MorningBrief />` and the watchlist table. |

No changes to API layer, scoring, or signals.

---

## Data inputs (all already on the ticker `data` object)

- `data.setups` → `{ pullback, momentum }`, each `{ score, label, components, readiness, etaWeeks }`. May be `null` (< 20 weekly bars or no weekly candles).
- `data.rs` → `{ rs1m, rs3m }` (stock return − SPY return). May be `null`.
- `data.metrics.data.metric` → Finnhub metrics object: `revenueGrowthTTMYoy`, `peNormalizedAnnual` / `peBasicExclExtraTTM`, `epsGrowthTTMYoy` / `epsGrowth3Y`.
- PEG via existing `computePEG(pe, epsGrowth)` from `valuation.js` (returns `null` when growth ≤ 0 or P/E ≤ 0).

---

## `computeRadar(list)` — contract

**Input:** `list` — array of `{ symbol, data }` (one per watchlist ticker). Tolerates missing/`null` `data`.

**Output:** array of hit objects, sorted (see Ranking), each:

```
{
  symbol,
  setupType,    // 'PULLBACK' | 'MOMENTUM'
  readiness,    // 'WATCH' | 'SOON' | 'ACT'
  setupScore,   // 0–10, the active setup's score
  etaWeeks,     // number | null
  rs3m,         // number (percent) — from data.rs.rs3m
  rsRank,       // 1..N rank across the watchlist by rs3m (1 = strongest); null if rs3m missing
  rsTotal,      // N = count of names with an rs3m value (denominator for "1/N")
  revGrowth,    // number (percent) — revenueGrowthTTMYoy
  peg           // number | null
}
```

### Gates (a hit requires BOTH)

1. **Early-entry gate.** Consider `pullback` and `momentum`. Keep those whose `readiness ∈ {WATCH, SOON, ACT}` (exclude `WAIT` and absent setups). If both qualify, pick the **active setup** = the one with the higher `readiness` priority (ACT > SOON > WATCH), tie-broken by higher `score`. If neither qualifies → not a hit.
2. **Great-stock gate.** All of:
   - `revenueGrowthTTMYoy` is a finite number `> 0`,
   - `data.rs.rs3m` is a finite number `> 0` (outperforming SPY over ~3M),
   - `peg < 3` **OR** `peg == null` (not computable → not penalized; covers ADRs / negative-EPS-growth names that still grow revenue).
   - Missing `revenueGrowthTTMYoy` or `rs3m` → gate **fails** (cannot confirm "great" → exclude). Honest-uncertainty principle.

### RS rank (whole-watchlist)

Across all input names that have a finite `rs.rs3m`, rank descending (strongest = 1). Attach `rsRank` / `rsTotal` to each hit. This delivers part of PRD 5.4 (relative-strength ranking) at no extra cost. Sector-relative leader tagging is explicitly out of scope.

### Ranking of the output

Sort hits by, in order:
1. readiness priority (ACT > SOON > WATCH),
2. `setupScore` descending,
3. `rs3m` descending.

---

## Component: `SetupRadar.svelte`

- `$derived` over `getTickers()` + `getTickerData()` → builds `list` → `computeRadar(list)`. (Same data-access pattern as `MorningBrief.svelte`.)
- Collapsible (local `$state` `collapsed`), header "★ SETUP RADAR — early entries in great stocks".
- One row per hit: ticker · setup type badge (PULLBACK/MOMENTUM) · readiness chip (reuse existing readiness colors) · ETA (`~Nw` if `etaWeeks != null`, else omitted) · `RS #r/N` + `rs3m%` · `rev +g%` · `PEG x` (or `—`). Row click → `selectTicker(symbol)`.
- Empty state (no hits): muted line "No great-stock entries today — the gate is intentionally strict."
- Hidden entirely if watchlist is empty (consistent with MorningBrief returning null).
- Reuse existing tooltip action + add a header tooltip explaining the gate (early setup + rev growth > 0 + beating SPY + PEG < 3).

---

## App.svelte wiring

Render `<SetupRadar />` directly after `<MorningBrief />` and before the watchlist table. No other changes.

---

## Testing (`tests/radar.test.js`, pure `computeRadar`)

Build minimal fixture ticker objects:

1. Passes both gates (active SOON pullback + revGrowth > 0 + rs3m > 0 + PEG < 3) → included, fields populated.
2. Active setup but fails quality (rs3m ≤ 0) → excluded.
3. Great company but only `WAIT` readiness on both setups → excluded.
4. PEG `null` (growth ≤ 0 in PEG inputs) but rev growth > 0 + rs3m > 0 → included (PEG not penalized).
5. PEG ≥ 3 → excluded.
6. Missing `rs` or missing `metrics` → excluded.
7. Ranking: an ACT hit sorts before a SOON hit; among equal readiness, higher setupScore first.
8. Empty input `[]` → `[]`.
9. `rsRank` / `rsTotal` correct across a small set.

Target: all green via `npm test`; keeps total suite at 136 + new cases.

---

## Constraints honored

- **Zero new API calls** — reads only data already fetched.
- **Display-only** — does not feed or alter `computeScore` or the setup scoring.
- **One feature = one branch = one PR** — implement on `feat/setup-radar` (separate from the v0.12 PR #5).

## Out of scope (YAGNI)

- Sector-relative leader tagging (whole-watchlist RS rank only).
- Historical pattern backtest (PRD 5.5).
- Anchored VWAP / advanced chart anchors (PRD 4.5).

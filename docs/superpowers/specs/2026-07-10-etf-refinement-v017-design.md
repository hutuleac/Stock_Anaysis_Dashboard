# ETF Page Refinement Round (v0.17) — Design

**Date:** 2026-07-10
**Status:** Approved (brainstorming session)
**Scope:** Six display-only improvements across the ETF page and shared UI. Zero new API calls. The scoring engines (`computeScore`, weekly setups, dip score, ETF entry/exit scores) are untouched — every new value is displayed, never scored.

**Delivery:** four PRs, in order:

| PR | Branch | Items |
|----|--------|-------|
| 1 | `fix/tooltip-viewport-clamp` | Tooltip clipping fix (this spec rides with it) |
| 2 | `feat/etf-indicators` | Setup Radar RSI display + ETF decision indicators |
| 3 | `feat/etf-thesis-highlights` | ETF thesis + highlights strip + in-browser notifications |
| 4 | `feat/etf-catalog-search` | UCITS catalog search |

---

## 1. Tooltip viewport clamp (app-wide fix)

**Problem:** the shared tooltip action (`src/lib/actions/tooltip.js`) positions tooltips without viewport awareness. Depending on scroll position, tooltip content clips off-screen above or below — visible in Setup Radar, the ETF hover info, and the indicator grid.

**Fix (one place, fixes all consumers):**
- After the tooltip element renders, measure its `getBoundingClientRect()`.
- **Vertical:** prefer the default side (below the anchor); if it would overflow the viewport bottom, flip above; if both overflow, pin to whichever side has more room and cap `max-height` with internal scroll.
- **Horizontal:** clamp `left` so the tooltip stays within `[8px, viewportWidth − 8px]`.
- Reposition on scroll/resize while open (or simply use `position: fixed` coordinates computed from the anchor rect, which survives scroll without listeners as long as tooltips close on scroll — pick whichever the current action's lifecycle supports with the smaller diff).
- Mobile bottom-sheet behavior (from PR #23) is unaffected — the clamp applies only to the floating desktop path.

**Testing:** manual — hover rows at the very top and very bottom of a scrolled page in both views. No unit tests (pure DOM positioning).

## 2. Weekly RSI in Setup Radar (display-only)

`computeSetupSignals` (`src/lib/signals.js`) already computes weekly RSI internally for the divergence component. Expose it in the return object as `meta: { wRsi }` (rounded, null-safe), and render the raw value in `SetupRadar.svelte` — a small "wRSI 42" readout near the setup scores, with the standard tooltip explaining it is informational and not part of either setup score.

**Testing:** extend `tests/signals.test.js` — `meta.wRsi` present, numerically correct on a known fixture, null when insufficient bars.

## 3. ETF decision indicators (display-only)

Add four fields to each ETF's result in `computeEtfSignals` (`src/lib/etf.js`), computed from the proxy candles already fetched:

| Field | Definition | Display |
|-------|-----------|---------|
| `trendState` | Weekly close vs EMA10/EMA30: close > both & EMA10 > EMA30 → `UPTREND`; close < EMA10 but > EMA30 → `PULLBACK`; close < both → `DOWNTREND`; else → `BASING` | Colored chip |
| `wRsi` | Weekly RSI(14), the same value the Oversold/Overbought components consume | Number |
| `rangePos52w` | `(price − 52wLow) / (52wHigh − 52wLow)` from daily candles, 0–100% | Percent + mini bar |
| `roc13w` | 13-week close-over-close rate of change | Signed percent |

All four render in the ETF **expanded row** (the table itself stays scannable — matching the stocks-side pattern). Null-safe when history is short; `computeEtfSignals` keeps its existing `< 20 weekly bars → null` guard.

**Testing:** unit tests in `tests/etf.test.js` for each field — known-fixture values, each trendState branch, null guards.

## 4. ETF thesis (plain-English)

`generateEtfThesis(result)` in `etf.js` — 1–2 sentences per ETF explaining the entry/exit picture from the component values and the new indicators, in the spirit of the stocks-side ThesisSummary. Examples:

- "Weekly RSI 31 with 3m rotation lagging the group — accumulation zone; MACD hasn't turned yet."
- "Extended 12% above EMA30 with RSI 74 and climax volume — exhaustion risk; entry setup absent."

Rules: lead with the stronger of the two scores; mention only components that contributed (non-zero); reference trendState as context; never give advice verbs beyond the existing readiness vocabulary (WAIT/WATCH/SOON/ACT). Rendered in the expanded row above the component breakdown.

**Testing:** unit tests — thesis mentions contributing components, omits zero components, entry-led vs exit-led selection, null-safe.

## 5. Highlights strip + in-browser notifications

**Highlights strip:** a compact digest bar at the top of the app, visible in both views, computed from state already in memory after refresh:

- ETF entries/exits at ACT or SOON ("QQQ entry ACT 7.5")
- Dip Hunter scores ≥ SOON threshold
- Weekly setups at SOON/ACT readiness

Each item is clickable — switches view if needed and scrolls to / expands the ticker. Empty state: strip hidden entirely (no "nothing to see" noise). Order: ACT before SOON, ETF/dip/setup interleaved by score descending.

**In-browser notifications:** after each refresh, diff the current ACT/SOON set against the previous refresh's set (persisted in localStorage under `notifySeen`, keyed `type:symbol:readiness`). Fire one Web Notification per *newly arrived* item (readiness upgrades count as new; downgrades and repeats do not). Request `Notification` permission once, from an explicit toggle in SettingsPanel (default off — no unprompted permission dialogs). Works while the tab is open; the existing auto-refresh loop makes this useful on a pinned tab. No service worker, no push server.

**Testing:** the diff/dedupe logic lives in a pure helper (`computeNotifications(prev, current)`) with unit tests; the Notification API call itself is a thin untested wrapper.

## 6. UCITS catalog search

Expand the built-in catalog in `etflist.svelte.js` to ~60–80 popular Ireland-domiciled accumulating UCITS ETFs (iShares, Vanguard, Invesco, Xtrackers, SPDR core + major sector/thematic funds), each entry: UCITS ticker, name, theme tag, US proxy. Proxy mapping is curated at authoring time — the search UI never asks the user to pick a proxy for catalog entries.

UI in the ETF add bar: a search input filtering the catalog client-side by ticker / name / theme (case-insensitive substring); results as a dropdown with one-click add. Already-added ETFs shown disabled. Manual add (UCITS ticker + proxy) stays as the fallback for anything uncatalogued. Zero API calls.

**Testing:** unit test for the filter function (match on ticker/name/theme, exclusion of added ETFs); catalog data sanity check (every entry has a proxy).

---

## Out of scope (deliberate)

- LLM/AI-generated commentary (external dependency, per-call cost — declined).
- Push notifications when the tab is closed (needs a push service or scheduled worker — declined for now; the design keeps `computeNotifications` pure so a GitHub-Action-based ntfy/Telegram sender can reuse it later).
- Any change to scored components in any engine.
- European-exchange price data (free tiers don't offer it; proxy architecture stands).

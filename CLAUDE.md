# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED
Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:
- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED
Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:
- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED
WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:
- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)
Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:
- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)
If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)
Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command | Action |
|---------|--------|
| `ctx stats` | Call the `ctx_stats` MCP tool and display the full output verbatim |
| `ctx doctor` | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

## gstack

Use the `/browse` skill from gstack for all web browsing. Never use `mcp__claude-in-chrome__*` tools.

To install: `git clone https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup`

Available gstack skills:
`/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/land-and-deploy`, `/canary`, `/benchmark`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/setup-deploy`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/cso`, `/autoplan`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`

---

# Project State — Stock Analysis Dashboard v0.24

## What this is

Offline-first stock analysis dashboard for retail swing traders. Svelte 5 + Vite. No backend. All data via Finnhub free API (+ optional TwelveData). Deployed to GitHub Pages. Live: https://hutuleac.github.io/Stock_Anaysis_Dashboard/

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Svelte 5 (runes: `$state`, `$derived`, `$props`, `$effect`) |
| Build | Vite 8 + Tailwind v4 |
| Charts | TradingView lightweight-charts v5 |
| Data | Finnhub.io free tier + optional TwelveData |
| Storage | localStorage only — nothing sent to any server |
| Deploy | GitHub Actions → GitHub Pages |
| Tests | Vitest (`npm test`) |

## Key files

```
src/lib/
  indicators.js       — all indicator math (RSI, MACD, EMA, ATR, BB, ADX, Stoch) + priceReturn/computeRelativeStrength (RS vs SPY)
  scoring.js          — 9-signal scoring engine, thesis generator, badge logic, market-context holder (set/getMarketContext)
  signals.js          — weekly leading-signal engine (divergence, squeeze, volume, structure → Pullback + Momentum setups)
  valuation.js        — PEG ratio (P/E ÷ growth) with null guards; display-only valuation math
  dip.js              — Dip Hunter: quality gate + 9-component 0–10 dip score
  radar.js            — Setup Radar: gates setups on fundamentals, splits into ACCUMULATION/BREAKOUT buckets, ranks survivors
  etf.js              — ETF section: entry/exit scores on US proxies of UCITS ETFs + generateEtfThesis + buildEtfBriefing
  etfCatalog.js       — curated ~55-fund UCITS catalog + client-side search
  export.js           — AI export: buildStockSnapshot() + buildPrompt() + DEFAULT_TEMPLATES presets
  candles.js          — tdValuesToCandles(vals): TD → synthetic-candle mapping, shared by all 4 App.svelte call sites
  chartAnchors.js     — AVWAP / POC / Fib / FVG chart anchors (MIN_BARS 30)
  highlights.js       — cross-view ACT/SOON digest + notification diff
  timingScore.js      — Long-Term Timing Score (0–100): drawdown/oversold/reversal/consolidation/volume/market ctx
  technicalPatterns.js — pattern primitives for timingScore (consolidation, capitulation, EMA reclaim, BB width %ile…)
  qualityScore.js     — Quality Score (0–100) from Finnhub metrics + financials-reported + earnings history
  longTermSetup.js    — buildLongTermSetup: timing×quality gate matrix → ACCUMULATE/WATCHLIST/…; F&G<30 panic boost
  macro.js            — FRED parsing + macro regime derivation (pure)
  demoData.js         — no-API-key demo fixtures: seeded synthetic OHLCV per ticker + ETF proxy, run through the real engines
  tone.js             — the one colour palette (good/partial/caution/danger/waiting/none)
  readiness.js        — ACT/SOON/WATCH/WAIT + direction-aware BUY/SELL tones on top of tone.js
  tooltipDefs.js      — TIPS.* rich tooltip definitions
  actions/tooltip.js  — Svelte action: desktop hover + mobile tap-to-open (touchend on iOS)
  api/
    finnhub.svelte.js — Finnhub API calls + localStorage cache + evictStaleCache
    twelvedata.svelte.js — TwelveData API calls (optional, rate-limited)
    fred.js           — FRED macro series (dev: vite proxy /fred-api; prod: corsproxy.io — API key visible to that proxy)
  components/
    WatchlistTable.svelte   — main table + expanded row (incl. Long-Term Setup card, Copy for AI)
    EntryPanel.svelte       — position sizing, stop-loss, scenario table
    PriceChart.svelte       — candlestick + MACD/RSI/BB sub-panes
    FundamentalsBar.svelte  — all indicators displayed inline
    ThesisSummary.svelte    — plain-English score explanation
    MarketContextBar.svelte — VIX proxy / SPY / F&G / breadth / macro tiles
    DipRadar.svelte         — Dip Hunter collapsible watchlist-scan panel
    SetupRadar.svelte       — Setup Radar panel (radar.js)
    LongTermScanPanel.svelte — Long-Term Setup watchlist scan (longTermSetup.js)
    EtfDashboard.svelte     — UCITS ETF table (Stocks|ETFs header toggle) + catalog search add bar
    HighlightsStrip.svelte  — cross-view "Today" ACT/SOON digest + in-browser notifications
    SettingsPanel.svelte    — API keys, AI prompts, notification toggle
    TooltipOverlay.svelte / OnboardingModal.svelte
  stores/
    watchlist.svelte.js     — ticker list, fetch orchestration
    portfolio.svelte.js     — trade log, FIFO P&L
    etflist.svelte.js       — UCITS ETF catalog (+US proxy mapping) + proxy candle data
    prompts.svelte.js       — AI prompt templates (localStorage, seeded from DEFAULT_TEMPLATES)
    notes.svelte.js / tooltip.svelte.js
tests/                — 23 files, 499 tests (~1s). One test file per lib module, same basename.
```

## Scoring engine (scoring.js)

- **Weights:** Technical 35% / Fundamental 45% / Sentiment 20% (default)
- **Regime shift:** VIX > 25 → fund 55%; VIX > 35 → fund 60%
- **SPY penalty:** downtrend → LONG scores pulled 20% toward 50
- **F&G modifier:** extreme fear < 25 → −3; extreme greed > 75 → −2
- **Badges:** STRONG_LONG ≥ 72 · LEAN_LONG ≥ 58 · NEUTRAL ≥ 42 · LEAN_SHORT ≥ 28 · STRONG_SHORT < 28
- **Conviction:** % of signals aligned with score direction; HIGH ≥ 75% / MODERATE ≥ 55% / LOW ≥ 35% / MIXED

## Indicator math (indicators.js)

- **RSI(14):** Wilder's smoothing (RMA). Matches TradingView.
- **EMA:** SMA seed for first `period` values, then k=2/(n+1) multiplier.
- **MACD(12,26,9):** EMA crossover; crossover event = histogram sign flip.
- **ATR(14):** Simple average of last 14 true ranges — NOT Wilder's RMA. Small divergence vs TradingView ATR; fine for stop-loss guidance.
- **Bollinger Bands(20,2):** Population std dev (÷period). Matches TradingView.
- **ADX(14):** Full Wilder-smoothed +DM/−DM/TR pipeline. Final ADX is the Wilder RMA (average) of DX, bounded [0,100] — NOT the running sum (that bug inflated it ~period×; fixed v0.10).
- **Stochastic(14,3,3):** Raw %K, 3-bar SMA for %D, crossover on sign change.
- **Display-only signals (v0.12), all in `computeIndicatorsFromCandles` unless noted:** `computeEmaStack` (BULL STACK/BROKEN), `computeOversoldConfluence` (RSI<35 + price ≤ lower BB), `priceReturn`→`roc20`/`roc60`, daily `atr` (now exposed — EntryPanel reads `data.indicators.atr` for its stop-too-tight band). `proximityTo52wHigh` runs at display time off the Finnhub `52WeekHigh` metric. EntryPanel's suggested stop uses **weekly** ATR (`data.weekly.atr`), entry − 2×ATR; R:R = (target − entry)/(entry − stop).

## Setup signals (signals.js)

Leading-signal layer on **weekly** candles (adapted from the range-finder crypto project's signal engine). Two separately-scored setups per ticker:
- **Pullback / Accumulation** (0–10): bullish RSI divergence + downtrend exhaustion + volume dry-up + lower-half range position. Buy weakness before the turn.
- **Momentum / Breakout** (0–10): BB squeeze resolving + structure breakout + volume expansion + weekly EMA reclaim. Buy strength as a trend starts.

Each returns `{ score, label, components[], readiness: WAIT/WATCH/SOON/ACT, etaWeeks }`. Entry point `computeSetupSignals(weeklyRaw)`; returns null if < 20 weekly bars. Wired into App.svelte on the existing weekly candle fetch (all three paths: TwelveData, Finnhub, cache-hydrate) — zero new API calls. Range position is computed from the weekly candles themselves, not Finnhub 52w metrics, keeping signals.js self-contained.

**Momentum C2 structure ladder (v0.24):** `BREAKOUT 3.0 > RANGE_FORMING 2.0 > STABLE 1.5 > TREND_EXHAUSTION 0.5`. Exhaustion and range-forming previously shared one `else if (Bullish)` branch worth 2.0, which scored a topping trend above a clean one — they mean opposite things to a breakout setup, so they are scored separately. Don't re-merge them.

**Inversions from the crypto source** (grid bots want chop; we want trends): high ADX/trend is positive for momentum, divergence is used long-only (bullish at lows), and everything runs on weekly not 4H. Crypto-only inputs (funding, OI, order-flow CVD) were dropped. Squeeze COMPRESSING is gated on bandwidth percentile (scale-agnostic across tickers), not an absolute bandwidth level.

## Setup Radar (radar.js)

Watchlist-wide surface for the weekly setups above (`computeSetupSignals`), display-only. `computeRadar(list)` picks the stronger active (WATCH/SOON/ACT) setup per ticker and tags it with a **`category`** (v0.21):
- **ACCUMULATION** (Pullback setup — buy weakness before the wave): the leaders `rs3m > 0` gate is **deliberately NOT applied** — laggards/red names are exactly what a buy-weakness setup wants, so they're allowed and `rs3m` may be null/negative.
- **BREAKOUT** (Momentum setup — confirmation as a leader's trend starts): leaders gate **kept** (`rs3m > 0`, finite required).

Both buckets still require revenue growth > 0 and PEG < 3 (quality). `SetupRadar.svelte` renders the two as separate labelled sections; null/negative RS is guarded in the UI. AVWAP-reclaimed + POC-not-below nudges readiness one tier (never demotes). Rejected (Jul 2026, deliberate): A) an overbought/extension guard on Momentum and B) relaxing the leaders gate globally — Peter watches entries manually instead. The split (C) + Dip fear gate (D) shipped; A/B did not.

## Dip Hunter (dip.js)

Watchlist-wide scan for early entries in quality names on sale — display-only, does not feed `computeScore`. Two stages, entry point `computeDipRadar(list, marketCtx)`:

1. **Quality gate** (`gateMetrics`, ALL must pass): EPS growth > 0, revenue growth > 0, net margin > 0, PEG < 3 (via `valuation.js`, skipped if growth ≤ 0), fundamental score ≥ 60. Filters falling knives before any dip scoring happens.
2. **Dip score**, 0–10 across 9 components, rebalanced whenever a component is added — always keep the maxes summing to 10:

| Component | Max | Signal |
|---|---|---|
| Market Fear | 1.5 | F&G in fear zone + SPY below EMA50 — **gated on stock-specific weakness (v0.21):** only counts when this ticker's own Oversold / Drawdown / 52w-Low fired, else 0. Stops a rising, high-RSI name banking the market-wide 1.5 and masquerading as a dip in a fearful tape |
| Oversold | 1.5 | RSI tiers + z-score ≤ −1.5 + BB confluence |
| Drawdown | 1.0 | 60d/20d ROC decline |
| 52w Low | 1.0 | proximity to 52-week low (own tiers, not folded into Drawdown) |
| Turn | 1.0 | MACD histogram just crossed bullish — leading reversal, complements the coincident Oversold reading |
| Rel. Strength | 1.0 | mild RS underperformance vs SPY (−5% to −15%) reads as overreaction; beyond −15% or positive RS scores 0 — extreme weakness is a flag, not a discount |
| Value | 1.0 | grades PEG *within* the gate's <3 band — PEG<1 scores higher than PEG 2–3 |
| Smart Money | 1.0 | insider net-buying (MSPR) + ≥60% analyst buy ratio, not deteriorating |
| OBV | 1.0 | OBV rising while price is still declining (60d ROC ≤ −8%) signals accumulation — a more real-time smart-money tell than the 7d-cached insider/analyst data |

**Risk context (not scored, never gates):** a strong-ADX (>35) downtrend that hasn't stalled (60d ROC ≤ −8%) caps readiness at WATCH. A broken most-recent swing-low support level (`data.indicators.swingLows`) is flagged in the UI. Both surface as warnings only — they never add or remove score points.

Readiness: `ACT` needs score ≥ 7 **and** a non-zero Fear component — which now (v0.21) requires *both* a fearful market **and** this ticker being genuinely down, so ACT never fires on a greedy market or on a name that isn't itself on sale · `SOON` ≥ 5 · `WATCH` ≥ 3 (below 3, excluded entirely). All inputs are already computed elsewhere on the ticker object (`data.indicators`, `data.rs`, `data.smartMoney`, `data.metrics`) — zero new API calls.

## ETF section (etf.js)

Dedicated `Stocks | ETFs` header-toggle view for Ireland-domiciled accumulating UCITS ETFs, months-to-a-year horizon. **Key decision:** Finnhub/TwelveData free tiers have no European-exchange candles, so every UCITS ETF is mapped to a US-listed proxy tracking the same index (CSPX/VUAA→SPY, CNDX/EQQQ→QQQ, SMGB→SMH, AIAI→THNQ, AIRO→BOTZ, IUES→XLE, INRG→ICLN); all math runs on the proxy — zero new APIs. Displayed price is the proxy's (USD). Spec: `docs/superpowers/specs/2026-07-06-etf-section-design.md`.

Entry point `computeEtfSignals(list, spyCloses)` — per proxy `{ price, rs, groupMedianRs3m, entry, exit }`, null under 20 weekly bars. Two 0–10 scores (component maxes sum to 10, dip.js convention):

- **Entry** (buy weakness): Oversold 3.0 (weekly RSI tiers + weekly BB touch) · Rotation 3.0 (mild RS3m lag vs SPY + vs group median; **0 if rs3m < −25** — falling knife) · Turn 2.0 (weekly MACD bull cross + bull divergence) · Drawdown 2.0 (off 52w daily high).
- **Exit** (sell exhaustion): Overbought 3.0 (weekly RSI ≥65/70/75) · Extension 3.0 (% above weekly EMA30) · Rotation Loss 2.0 (rs1m negative while rs3m positive = capital rotating out) · Climax Vol 2.0 (weekly volume ≥1.5×/2× avg, only when wRSI ≥ 60).
- Readiness both: ACT ≥ 7 · SOON ≥ 5 · WATCH ≥ 3 · else WAIT (no filtering — table shows all).

Display-only (does not feed `computeScore`). Catalog in `etflist.svelte.js`, localStorage key `etfList`, user-editable (add needs UCITS ticker + US proxy). Proxy candles fetched in `handleRefresh` per unique proxy (SPY/QQQ usually cache hits) and hydrated on startup from `td_ts_1day_<proxy>_1day_250`.

**v0.17 additions (all display-only, zero new API calls):** per-proxy `indicators { trendState, wRsi, rangePos52w, roc13w }` + `generateEtfThesis()` in `etf.js` (expanded row); `meta.wRsi` on `computeSetupSignals` shown in Setup Radar; `highlights.js` (`computeHighlights` ACT/SOON digest + `computeNotifications` diff, localStorage `notifySeen`, opt-in toggle `notifyEnabled` in Settings) rendered by `HighlightsStrip.svelte`; curated ~55-fund UCITS catalog with client-side search in `etfCatalog.js` (search bar in the ETF add panel); tooltip overlay clamps to viewport using measured height and closes on scroll.

**v0.21 additions:** `XDEW` (Xtrackers S&P 500 Equal Weight, Ireland-domiciled Acc, proxy RSP — the RSP-equivalent European traders were missing) added to `HARDCODED_ETFS` in `etflist.svelte.js`; existing users need to re-add it manually via the catalog search (their `localStorage['etfList']` predates the change and isn't migrated). Each of the 8 Entry/Exit score components in the expanded row (Oversold, Rotation, Turn, Drawdown, Overbought, Extension, Rotation Loss, Climax Vol) plus the Entry/Exit section headers got a `tipAction` hover tooltip (`TIPS.etf*Comp` in `tooltipDefs.js`, mapped via `EtfDashboard.svelte`'s `COMPONENT_TIPS` const) — same "what it measures / exact point thresholds / why it matters" pattern as the Long-Term Setup chips.

## Long-Term Dip Buying framework (v0.20 — timingScore.js / qualityScore.js / longTermSetup.js)

Three-slice framework for long-horizon accumulation, all display-only:

- **Timing Score** `computeTimingScore({ dailyCandles, weeklyCandles, marketContext })` → 0–100 across drawdown 20 / oversold (D+W+M RSI) 20 / reversal 15 / consolidation 15 / volume 15 / market ctx 15 (caps exported as `TIMING_MAX` — `longTermIndicators.js` imports them, so chip maxes can no longer drift). Null-safe: missing components are omitted, all-null → total null. Primitives live in `technicalPatterns.js`. Market ctx comes from App.svelte's `timingMarketContext()` (derived from `getMarketContext()`; `spyAboveEma50 = !spyDowntrend` — same EMA50 semantic). `sectorOutperforming` is per-ticker and stays unset.
- **Quality Score** `computeQualityScore({ metric, marketCap, financials, earnings })` → 0–100 across profitability 30 / cashFlow 25 / balanceSheet 25 / shareholderReturn 10 / earningsQuality 10. Label INSUFFICIENT_DATA under 3 non-null components. Fetched **lazily on row expand** (`loadQualityScoreForTicker`, 2 extra cached Finnhub calls: financials-reported 7d + earnings 24h) — never on batch refresh. `parseFinancials` extracts FCF/buyback/diluted shares from the raw financials-reported payload by concept substring.
- **Revenue history (v0.21):** `parseRevenueHistory(reported, years=5)` in `qualityScore.js` reuses the exact same financials-reported payload as `parseFinancials` (zero new API calls) to extract annual revenue + YoY growth per fiscal year, oldest→newest. Revenue concept tag varies by filer/era, tried in priority order (`REVENUE_CONCEPTS`: ASC 606 tags → `salesrevenuenet` → generic `revenues`) via the same `findConcept` substring-match helper. Stored as `data.revenueHistory` alongside `qualityScore` in `loadQualityScoreForTicker` (App.svelte). Rendered as a 5-bar mini chart (green/red by YoY sign, hover tooltip per bar) in the WatchlistTable Long-Term Setup card, right after the Quality chips — answers "is growth accelerating or decelerating", which the single YoY number in FundamentalsBar's `revenueGrowthTTMYoy` chip can't show on its own. Not surfaced in `LongTermScanPanel` (quality data stays lazy there too).
- **Long-Term Setup** `buildLongTermSetup(timingScore, qualityScore, { fearGreed, creditStress })` — fixed gate matrix (never blends the totals): timing STRONG×quality ≥60 → ACCUMULATE; STRONG×weak/unknown → OVERSOLD_BUT_CAUTION (UI: "CHECK QUALITY"); WATCH×good → WATCHLIST (boosted to ACCUMULATE when F&G < 30); WEAK → WAIT. Rendered in the WatchlistTable expanded row + `LongTermScanPanel`.
- **Indicator breakdown (v0.21):** `longTermIndicators.js` (`timingChips`/`qualityChips`/`chipColor`) maps the timing & quality component sub-scores into labeled fill-coloured chips — pure formatting, zero new compute. Expanded card shows both chip rows + the concrete timing `signals[]` (Daily/Weekly/Monthly RSI, drawdown %, consolidation days, capitulation/breakout) and `warnings[]`; scan-panel rows show T/Q totals + timing chips (quality stays lazy). Null component (missing input) reads muted grey, distinct from a real 0. Timing chip maxes are imported from `TIMING_MAX`; the quality ones are still mirrored literals — `tests/longTermIndicators.test.js` asserts both sets sum to 100.
- **HY credit-stress gate (FRED `BAMLH0A0HYM2`):** `deriveMacroRegime` adds `creditStress` — STRESS when HY spread > 5% or Δ ≥ +0.5pp over ~20 sessions, ELEVATED 4–5%, CALM below. STRESS demotes ACCUMULATE → OVERSOLD_BUT_CAUTION and overrides the panic boost (systemic risk, not a dip); ELEVATED appends a staged-entries reason. This is the **only macro input that changes classification** — everything else in the Macro tile is context-only. Deliberately rejected as redundant/YAGNI (Jul 2026): T10Y3M, DFF, ICSA, Alpha Vantage fallback, CBOE vol indices, direct SEC EDGAR (Finnhub financials-reported *is* EDGAR data).
- **v0.21 UI consolidation (Aug 2026):** the Long-Term Setup card and the `ThesisSummary`/Trade-Window/ATR block (previously split — the latter three lived inside `EntryPanel`'s right column) are now one visual card in `WatchlistTable.svelte`'s `expandedPanel` snippet, with larger text (`text-xs`/`text-sm` in place of `text-[10px]`/`text-[11px]`) for readability on large screens. `EntryPanel.svelte` lost its two-column grid (R:R to Target moved to the bottom of the single remaining column) and no longer imports `ThesisSummary` — that component is now only rendered from `WatchlistTable`. Every element in the merged card (status badge, Timing/Quality totals, all 11 timing/quality chips) got a rich `tipAction` hover tooltip (`TIPS.lt*` in `tooltipDefs.js`) explaining what it measures, the exact point thresholds, and why it matters — aimed at making the section readable without knowing the underlying formulas. The chip→tooltip mapping lives in `WatchlistTable.svelte`'s `LT_CHIP_TIPS` const; keep it in sync with `longTermIndicators.js`'s component keys.

## v0.22 readability + mobile round

Display-only, zero new API calls, zero logic changes.

- **Text sizing rule:** `html { font-size: 130% }` in `app.css` stays. That makes `1rem = 20.8px`, so `text-xs` is 15.6px and `text-sm` is 18.2px — too large for dense rows, which is why the codebase uses absolute-px literals there. The floor is now **`text-[12px]` / `text-[13px]`** (was 10/11px). Do not sweep those to `text-xs`: it's a 1.56x jump that blows out every `sm:w-*` column in the scan panels. New dense UI uses the 12/13px literals; prose and cards use the rem scale.
- **Token ramp lifted for AA contrast:** `text-muted #64748b → #94a3b8`, `text-secondary #94a3b8 → #cbd5e1`, `border #1e293b → #2b3a4f`. The old muted was ~4.1:1 on `surface-900` and failed AA. The ramp moved as a unit so the three-level hierarchy survives.
- **Sector moved under the ticker** in both the desktop table and the mobile card; the separate Sector column, its `<th>`/`<td>` and its sort branch are gone (`colspan` 9 → 8). Sector is still in the CSV export.
- **Setup Radar RS spans self-label:** `RS rank #3/12` and `3M vs SPY +4.2%` — the bare `+4.2%` gave no clue what it was relative to.
- **Long-Term scan panel rows rewritten** (`LongTermScanPanel.svelte`): the plain-English `setup.reasons[0]` verdict is now displayed (it was already produced by `buildLongTermSetup` and thrown away), totals read `Timing 34/100` / `Quality 62/100`, a missing quality reads **"Quality — expand ticker to load"** so a lazy-loaded score is distinguishable from a bad one, and the timing chips show `Label n/max` and wrap instead of scrolling sideways. Quality stays lazy — do not eager-fetch it here.
- **Mobile (≤ sm):** Setup Radar and Dip Hunter rows use `flex-wrap` with the fixed column widths gated behind `sm:` (`sm:w-16 shrink-0`), so they wrap on a phone and keep desktop column alignment. `MarketContextBar` sub-lines are `sm:truncate` — they wrap at ~180px tile width instead of ellipsing mid-sentence. Verified by rendering at 402x874 (iPhone 17): page `scrollWidth === clientWidth`, no horizontal overflow.

## Colour ramp (v0.24 — tone.js / readiness.js)

`tone.js` holds **the** palette — `good` green · `partial` amber · `caution` orange · `danger` red · `waiting` slate · `none` grey — plus `toneColor()` / `toneStyle()`. Everything that colours a state imports from here; nothing redefines a hex locally for a shared state.

`readiness.js` maps the ACT / SOON / WATCH / WAIT tiers onto it (`readinessTone/Color/Style`), used by Setup Radar, Dip Hunter, the ETF table and the FundamentalsBar setup cards. Before this it was four near-copies that had drifted: SOON was purple in a badge class and amber in the hex variant *of the same file*, and WATCH was grey in two panels and near-white in a third. **Don't reintroduce a local readiness ramp** — one state, one colour.

- **`signalTone(readiness, isBuy)`** — a SELL never borrows the buy green. `SELL ACT` is red, `SELL SOON` orange. `EtfDashboard` rendered both directions through the same class before, so a strong exit signal read as "good to buy".
- **`scoreTone(score, direction)`** — the shared ACT ≥7 / SOON ≥5 tiers, inverted for `'exit'`: a high exit score is sell pressure, so it renders red, not green. `EtfDashboard` calls it through local `entryColor` / `exitColor` aliases.
- **Per-engine score bands stay per-engine.** Setup Radar's 4.5 cutoff mirrors `signals.js`'s own FORMING band and is deliberately *not* the 5.0 that Dip/ETF use — only the colour resolution is shared, not the thresholds.
- Class-vs-hex disagreements inside `FundamentalsBar` (RSI, ADX, Stoch, Conviction, Volume, support proximity) and `EtfDashboard` (PULLBACK trend state) were the same defect in miniature — the inline text said purple `uncertain`, the tooltip hex said amber, for the same condition. The class now follows the hex. `uncertain` (purple) is no longer used for a "middle" state anywhere.

## Long-Term Setup colour coding (v0.24 — longTermIndicators.js)

One colour ramp across the whole card so a colour means the same thing on every element — status badge, Timing/Quality totals, all 11 chips, the verdict line, and the scan-panel rows. Display-only, zero new math.

- **`TONE`** (now in `tone.js`, shared with every readiness badge) is the single source: `good` #22c55e (working for you) · `partial` #f59e0b (partly there) · `caution` #f97316 (timing is there, quality gate is not) · `waiting` #94a3b8 (not contributing yet — what you're waiting on) · `none` #6b7280 (no data). A real **0 is `waiting`, a null is `none`** — a zero is information, a missing input is not. Both components render the tint via `chipStyle()` / `statusStyle()`, which return inline `color:…;background:…` strings, not Tailwind classes, so the ramp can't drift between the two panels.
- **`statusTone`** gives ACCUMULATE / WATCHLIST / OVERSOLD_BUT_CAUTION three different colours. They used to share one purple `uncertain`, which hid the most important distinction in the matrix: a good name waiting on timing vs a cheap name that failed the quality gate.
- **Totals use the gate bands, not the fill ratio** (`timingTone` / `qualityTone`): 70 is the timing gate, 60 the quality gate, so a 62 quality reads `partial`, not `waiting`. These mirror `timingBand`/`qualityBand` in `longTermSetup.js` — if those thresholds move, move these.
- **`timingHint` / `qualityHint`** render "8 pts to watchlist timing (50+)" next to a total, so a bare 42 reads as a distance to the next band. Null at the top band.
- **`waitingOn` / `qualityWaitingOn`** rank the components with the most points still on the table and are shown as `Label +gap`. The card picks which set to show: **when the quality total is under the ≥60 gate, the timing gaps aren't the answer** — it names the quality components instead ("Waiting on quality: Profit +26 …"). Null components are skipped (nothing is known, so nothing is being waited on). Hidden entirely on ACCUMULATE.
- A five-dot legend closes the card so the ramp is self-explanatory.

## Two-view playbooks (v0.24 — FundamentalsBar.svelte)

The expanded row's indicator bar carries ~29 cards. An `All | Trend Setup | Pullback Setup` toggle filters the **technical** cards down to the playbook being considered — display-only, zero new math, zero new API calls.

- Membership is two string sets in the component: `VIEW_CARDS.trend` / `VIEW_CARDS.pullback`, plus `CORE` (T/F/S, Conviction, Score Z) which is shown in every tab because it's score context, not setup-specific. Cards in both playbooks (MACD, OBV, Volume, 52W Range) are simply listed in both sets.
- Each card block is wrapped in `{#if show('<key>')}`; the key is the card's identity. **`tests/fundamentalsBarViews.test.js` parses the source** and asserts every rendered key is declared and every declared key is rendered — a typo would otherwise hide a card from a tab forever with no error.
- Fundamentals (`{#each metrics}`) live in their own grid above the toggle and are never filtered — quality context applies to both playbooks.
- `view` defaults to `'all'`, so the panel looks exactly as it did before a tab is picked. Mobile gets the same toggle for free (same component, rendered inside the collapsible Indicators section).
- The weekly-setups block was split into two `{#if setups}` blocks so the Pullback and Momentum cards can be tagged separately.
- ATR stop / R:R stayed in `EntryPanel` — deliberately not pulled into the Pullback tab; it's its own section.

## AI export (export.js)

"Copy for AI" — formats the full dashboard reading for a ticker as plain text and merges it into a user-editable prompt template, for pasting into any external LLM chat. Stocks view only; ETF export is a future round. Display-only, zero new API calls.

- `buildStockSnapshot(ticker, d, marketCtx)` — plain-text snapshot: price/52w range, score + badge + conviction, technicals with interpretation labels (RSI/MACD/ADX/etc.), weekly Pullback + Momentum setups, fundamentals, RS vs SPY, smart money, dip score, market context (VIX/F&G/SPY trend), days-to-earnings. Every missing/null field renders `n/a` — never throws, so a thin ticker (few bars, no fundamentals) still produces a usable snapshot.
- `buildPrompt(body, snapshot, symbol)` — substitutes `{{DATA}}`, `{{TICKER}}`, `{{DATE}}` into a template body. Unknown placeholders are left untouched (no silent data loss if a template typos a token).
- `DEFAULT_TEMPLATES` — 4 shipped presets: deep-dive, trade-setup, risk-check, news-scan.
- Templates live in `stores/prompts.svelte.js`: localStorage key `promptTemplates` (seeded from `DEFAULT_TEMPLATES` on first load), `promptDefault` holds the default template id. `updateTemplate` / `resetTemplate` / `setDefaultId` are the only mutators.
- UI: `WatchlistTable.svelte` expanded row has a "🤖 Copy for AI" button + a ▾ template dropdown (click-outside overlay). Copies the merged prompt via `navigator.clipboard` with a `<textarea>`/`execCommand` fallback; flashes "Copied ✓" / "Copy failed". `SettingsPanel` has an "AI Prompts" section to edit (textarea, saves on blur), reset to shipped, and pick the default template.
- **v0.23 mobile copy/share:** when both clipboard paths fail (silently, in mobile in-app browsers like the Instagram/Facebook webview), a `copyFallback` state opens a modal with the prompt in a `<textarea>` the user can tap-to-select and copy manually. A 📤 share button (feature-detected on `navigator.share`, shown next to Copy for AI in both toolbars) sends the prompt through the native share sheet instead — more reliable than clipboard on mobile and drops it straight into Messages/Notes/an AI app. All 4 templates now end with a "keep it skimmable, I'm often on my phone" instruction.
- Phase 2 (parked, not built): optional Gemini free-tier API key in Settings + an "Analyze" button that sends the same merged prompt and renders the response inline. See `BACKLOG.md`.

## Demo mode (demoData.js)

Shown when no API key is set. It used to be static quote/metric literals only, which left Setup Radar, Dip Hunter, Long-Term Setup and the whole ETF table empty — about a third of the dashboard — because those panels need candle series, not summary fields.

- **`DEMO_CANDLES`** generates ~260 daily bars per demo ticker and per ETF proxy from a seeded mulberry32 PRNG (deterministic: same series every load, so screenshots and `tests/demoData.test.js` are stable). `App.svelte`'s demo branch runs them through the **real** engines — `resampleWeekly` → `computeSetupSignals` / `computeWeeklyTrend` / `computeTimingScore` / `computeRelativeStrength` / `computeChartAnchors` — so demo mode exercises production code paths rather than faked outputs.
- **`SHAPES`** bends the per-bar drift (uptrend / pullback / dip / downtrend / range) so the panels show *different* states side by side. **`TAILS`** then overwrites the last 120 bars of two shapes with a scripted pattern: `dip` ends in a lower low on drying volume (bullish divergence + dry-up → Pullback setup), `uptrend` ends in a tight range that breaks out on expanding volume (squeeze + structure → Momentum setup). A plain random walk produces neither, and every ticker reads `WAIT 0.0`.
- **`end` rescales the finished series** so the last close lands on the price in `DEMO_MARKET_DATA` — otherwise the chart disagrees with the quote above it, and an uptrend shape walks a proxy to 3× its starting price.
- **SPY carries `noTail: true`.** It is the RS benchmark; giving it the same breakout tail as the uptrend names cancels every ticker's relative strength to ~0 and the leaders gates then filter the whole watchlist out.
- `DEMO_QUALITY` / `DEMO_REVENUE_HISTORY` are the exception — they'd normally come from the lazy financials-reported fetch, so the *computed* results are hardcoded rather than a fake XBRL payload.
- Timing tops out around 44 (WEAK) on the dip name, so demo never reaches ACCUMULATE. Deliberate stopping point: pushing further is tuning a synthetic market, not building the product.

## Known conventions / gotchas

- `sectorTrend === true` means the sector ETF is in a **downtrend** (confusing name — do not invert). Consistent across `computeScore` and `generateThesis`.
- `getDaysToEarnings` parses date strings as UTC midnight. In US timezones "today" may return 1 instead of 0 due to `Math.ceil` on a small negative diff — known, not a bug.
- TwelveData is rate-limited to 8 calls/min on the free tier. The `twelvedata.svelte.js` queue handles this; do not add raw fetch calls outside it.
- **Market cap currency:** the Finnhub metrics endpoint (`metric.marketCapitalization`) reports in the company's reporting currency (e.g. KRW for ADRs like SKM → "$21T"). Use `profile2` (`data.profile.marketCapitalization`, USD, cached 7d) for display. FundamentalsBar prefers `data.profile` and falls back to metrics.
- **EPS growth** is a ratio (percent YoY), so it's currency-neutral — a large negative for a foreign ADR is likely real, not a units artifact.
- **Finnhub metric ratios are PERCENT numbers, not fractions:** `roiTTM: 22` = 22%, `payoutRatioTTM: 45` = 45%, `dividendYieldIndicatedAnnual: 0.44` = 0.44%. Thresholds must be percent-scaled (`>= 20`, not `>= 0.20`) and test fixtures must use percent units too — fraction-scaled fixtures made broken thresholds pass in v0.20 (fixed in PR #49). When a new module consumes a metric field for the first time, check units against demoData.js or a real API response.
- **Metric object path is `data.metrics?.data?.metric`** — the Finnhub payload wraps it in `{ metric, series }`. Passing `data.metrics?.data` gives a truthy object with zero expected fields (silent all-undefined reads, PR #49 bug).
- **profile2 marketCapitalization is in millions USD** — qualityScore multiplies by 1e6 for FCF yield.
- **Relative Strength (v0.11)** needs SPY history: App.svelte fetches SPY daily closes once per refresh (TD or Finnhub path, cached) and passes them to `computeRelativeStrength` per ticker → `data.rs = { rs1m, rs3m }`. RS = stock return − SPY return over ~21/63 trading bars. Candle sources are both oldest-first ascending (TD uses `order=ASC`).
- **Valuation metric keys (Finnhub):** `revenueGrowthTTMYoy`, `psTTM`/`psAnnual`. PEG is computed client-side from existing pe + epsGrowth (`valuation.js`), null when growth ≤ 0 or P/E ≤ 0. All four (RS, Rev growth, P/S, PEG) are **display-only** — they do NOT feed `computeScore` or the setups (deliberate, to keep the calibrated engine stable).
- All persistent state lives in localStorage. Score history keys: `sv_<SYMBOL>` (90-day retention, max 300 snapshots — Score-Z window). Trade log: `tradeLog`. Refresh snapshot: `dashboard_supplement`. (Paper trades, price alerts, and the News UI were removed in the post-v0.19 mobile-fit round — don't re-document them.)

## v0.17 patch round (post-release fixes)

Small correctness + robustness fixes landed after the v0.17 feature round. All display-only or infra; zero new API calls.

- **Version badge is now derived, not hardcoded.** `package.json` `version` (bumped to `0.17.0`) is the single source of truth. App.svelte imports `{ version }` (named import, tree-shaken) and renders `v{major.minor}` → "v0.17". Bump the minor for a new feature round; patch bumps don't change the badge. Don't reintroduce a hardcoded version string.
- **Chart anchors gate lowered:** `chartAnchors.js` `MIN_BARS` is **30** (was 60), aligned with `computeIndicatorsFromCandles`' floor so AVWAP/POC/Fib/FVG never silently vanish while RSI/MACD still render (they share the daily candle set). Don't raise it back to 60 without re-introducing that divergence.
- **RSI flat/halted series returns 50, not 100.** `computeRSI` + `computeRSISeries`: `avgLoss===0 && avgGain===0` (perfectly flat / halted ticker) → neutral **50** (no momentum). The genuine all-gains case (`avgLoss===0, avgGain>0`) still returns 100. Prevents mislabeling a frozen ticker "Overbought" and mis-scoring it 0.25 in the technical engine.
- **`pct52wRange(price, low, high)`** in `indicators.js` — clamped 0–100 (null on `high<=low` or falsy inputs). Live price can exceed the 7-day-cached 52w high on a breakout; this keeps the 52W-range marker inside the bar. FundamentalsBar's `pos52w` uses it. `low52w` of 0 is treated as invalid (`!low52w`), same as the original guard.
- **Cache self-heals under quota pressure.** `writeCache` in **both** `finnhub.svelte.js` and `twelvedata.svelte.js` catches `QuotaExceededError`, calls the shared **`evictStaleCache()`** (exported from finnhub; deletes TTL-expired + junk entries via the `EVICT_TTL` prefix table), and retries the write once before raising the storage-full banner. Inert on the happy path. TD imports the evictor from finnhub (one-way dependency; no cycle). Eviction is expired-only, not LRU — won't reclaim space if everything is fresh (a genuinely oversized watchlist).
- **`pruneOrphanedCache` now also prunes `sv_` score history** for removed symbols (its 90-day self-trim only runs on write, which stops at removal). `sv_` is written only by `scoring.js`; no collision. Still never touches macro/notes/watchlist/portfolio/API keys.
- **RSI label/color single-sourced** in FundamentalsBar: one `rsiLabel` const matching the 5 color bands (Oversold <30 / Mild OS 30–40 / Neutral 40–60 / Extended 60–70 / Overbought >70), used in both the inline text and the tooltip `current`. The `TIPS.rsi` levels table was reconciled to match. Score-Z label also single-sourced.
- **Hover coverage complete:** every FundamentalsBar indicator uses the rich `tipAction` card. AVWAP, POC (were native `title=`) and 52W Range (had none) now have `TIPS.avwap` / `TIPS.poc` / `TIPS.range52w` defs with live `current` values.
- **TD→synthetic-candle mapping is centralized.** The block that was duplicated verbatim ×4 in App.svelte is now `tdValuesToCandles(vals)` in `candles.js`, imported at all four former call sites (v0.19 slice 2). A date-parse/NaN fix now touches one place.

## v0.19 mobile pass

Three-slice mobile redesign round, all display-only, zero new API calls. Desktop layout and behavior are unchanged throughout.

- **Slice 1 (PR #31) — touch tooltips.** `actions/tooltip.js` gained a click listener, gated per-event on `matchMedia('(hover: none)')` so desktop hover behavior is untouched; `stopPropagation` on handled taps; a module-level `openedBy` node tracks the single open tooltip (tap the same element to close, tap a different one to replace in one tap — no double-tap needed). Also: one shared `{#snippet expandedPanel(ticker, data, score, variant)}` in `WatchlistTable.svelte` used by both layouts — mobile expansion gained NewsPanel, score history, price-alert management, Copy for AI, and remove-from-watchlist (parity with desktop).
- **Slice 2 (PR #32) — dedup.** `candles.js` `tdValuesToCandles(vals)` replaced the 4 duplicated synthetic-candle blocks in App.svelte (see the resolved maintenance-smell note above). `WatchlistTable.svelte` also gained a `scoreStyle(s)` helper and a `tickerChips(data, size)` snippet shared by both layouts — desktop keeps its mixed md/lg gates and omits the eta suffix via the `size` param.
- **Slice 3 (this branch) — mobile card redesign.** Chips render in a horizontally scrollable rail (hidden entirely when there are no chips); score is a colored right-aligned anchor using `scoreStyle`. Mobile expansion is now collapsible sections (Chart + Indicators open by default; Entry Plan / News / Notes collapsed) via a `sectionHeader` snippet + per-session `openSections` `$state`, plus a sticky bottom action bar (Copy for AI · 🔔 Alert — opens both the gated add-form and the Notes section · ✕ remove). Mobile uses the default AI template only (no chevron dropdown); desktop stays flat and unchanged.
- **Tests:** 306 → 319 (`tooltip.test.js` +9, `candles.test.js` +4).

## Running locally

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 499 unit tests, ~1s
npm run build     # production build → dist/
```

Vitest is scoped to `tests/**` in vite.config.js — do not remove that `include`, or it also runs suite copies inside `.claude/worktrees/` (and node_modules tests) whenever worktrees exist. Remove merged worktrees with `git worktree remove .claude/worktrees/<name>`.

## What's next (BACKLOG.md)

Dip Hunter's scored-component list is intentionally frozen after the OBV addition — any further ideas (Stochastic cross, EMA stack, volume-confirmation) go into `BACKLOG.md` as risk-context candidates, not new score components, unless a future session decides otherwise. See `BACKLOG.md` for the full queue and the per-iteration workflow rules (one feature = one branch = one PR, zero new API calls by default, display-only unless agreed, tests gate the merge).

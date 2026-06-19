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

# Project State — Stock Analysis Dashboard v0.12

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
  indicators.js       — all indicator math (RSI, MACD, EMA, ATR, BB, ADX, Stoch)
  scoring.js          — multi-signal scoring engine, thesis generator, badge logic
  signals.js          — weekly leading-signal engine (divergence, squeeze, volume, structure → Pullback + Momentum setups)
  valuation.js        — PEG ratio (P/E ÷ growth) with null guards; display-only valuation math
  indicators.js       — also: priceReturn + computeRelativeStrength (RS vs SPY, 1M/3M)
  api/
    finnhub.svelte.js — Finnhub API calls + localStorage cache
    twelvedata.svelte.js — TwelveData API calls (optional, rate-limited)
  components/
    WatchlistTable.svelte   — main table + expanded row
    EntryPanel.svelte       — position sizing, stop-loss, scenario table
    PriceChart.svelte       — candlestick + MACD/RSI/BB sub-panes
    FundamentalsBar.svelte  — all indicators displayed inline
    ThesisSummary.svelte    — plain-English score explanation
    PaperTradePanel.svelte  — paper trade entry + tracking
    PortfolioStats.svelte   — P&L, edge analysis, sector exposure
  stores/
    watchlist.svelte.js     — ticker list, fetch orchestration
    portfolio.svelte.js     — trade log, FIFO P&L
    papertrades.svelte.js   — paper trade state
    alerts.svelte.js        — price alert state
tests/
  indicators.test.js  — 59 unit tests for indicators.js
  scoring.test.js     — 42 unit tests for scoring.js
  signals.test.js     — 32 unit tests for signals.js
  valuation.test.js   — 3 unit tests for valuation.js  (136 total)
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

**Inversions from the crypto source** (grid bots want chop; we want trends): high ADX/trend is positive for momentum, divergence is used long-only (bullish at lows), and everything runs on weekly not 4H. Crypto-only inputs (funding, OI, order-flow CVD) were dropped. Squeeze COMPRESSING is gated on bandwidth percentile (scale-agnostic across tickers), not an absolute bandwidth level.

## Known conventions / gotchas

- `sectorTrend === true` means the sector ETF is in a **downtrend** (confusing name — do not invert). Consistent across `computeScore` and `generateThesis`.
- `getDaysToEarnings` parses date strings as UTC midnight. In US timezones "today" may return 1 instead of 0 due to `Math.ceil` on a small negative diff — known, not a bug.
- TwelveData is rate-limited to 8 calls/min on the free tier. The `twelvedata.svelte.js` queue handles this; do not add raw fetch calls outside it.
- **Market cap currency:** the Finnhub metrics endpoint (`metric.marketCapitalization`) reports in the company's reporting currency (e.g. KRW for ADRs like SKM → "$21T"). Use `profile2` (`data.profile.marketCapitalization`, USD, cached 7d) for display. FundamentalsBar prefers `data.profile` and falls back to metrics.
- **EPS growth** is a ratio (percent YoY), so it's currency-neutral — a large negative for a foreign ADR is likely real, not a units artifact.
- **Relative Strength (v0.11)** needs SPY history: App.svelte fetches SPY daily closes once per refresh (TD or Finnhub path, cached) and passes them to `computeRelativeStrength` per ticker → `data.rs = { rs1m, rs3m }`. RS = stock return − SPY return over ~21/63 trading bars. Candle sources are both oldest-first ascending (TD uses `order=ASC`).
- **Valuation metric keys (Finnhub):** `revenueGrowthTTMYoy`, `psTTM`/`psAnnual`. PEG is computed client-side from existing pe + epsGrowth (`valuation.js`), null when growth ≤ 0 or P/E ≤ 0. All four (RS, Rev growth, P/S, PEG) are **display-only** — they do NOT feed `computeScore` or the setups (deliberate, to keep the calibrated engine stable).
- All persistent state lives in localStorage. Score history keys: `sv_<SYMBOL>`. Trade log: `tradeLog`. Paper trades: `paperTrades`.

## Running locally

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # 136 unit tests, ~200ms
npm run build     # production build → dist/
```

## What's next (BACKLOG.md)

Open queue, priority order: OBV, 52w-high volume confirmation, swing-low support levels, beta-adjusted sizing — all zero-API-call. Short interest is the one queued item that costs +1 endpoint/ticker (needs approval). Plus the two-view (Momentum / Pullback) detail-panel tab toggle that organizes the shipped signals into two named playbooks. See `BACKLOG.md` for the full list and the per-iteration workflow rules (one feature = one branch = one PR, zero new API calls by default, display-only unless agreed, tests gate the merge).

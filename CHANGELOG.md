# Changelog

All notable changes to the Stock Analysis Dashboard. Newest first. The version badge in the app header is read from `package.json`: the minor number moves for each feature round, and patch releases don't change the badge.

## v0.27 (2026-09-24): snapshots, and the site works without keys

**Open the site and it just works.** A scheduled job now publishes the whole dashboard's data twice every weekday, so visitors see real scores, scans, charts and ETFs without entering an API key.

- **Open + close snapshots**: `snapshot.json` is published around 10:00 ET (market open) and 16:30 ET (close). The job runs the app's own Finnhub and TwelveData fetchers in Node, so the snapshot is byte-identical to what a browser would cache. With no keys the page loads in ~0.3 s and makes 0 API calls.
- **Refresh is the live path.** With your own keys, Refresh only spends the 26 quote calls (~34 s instead of 106 s). Everything else is already fresh from the snapshot.
- **The Macro tile works again in production.** corsproxy.io started requiring a paid key. FRED now comes from a same-origin `macro.json` built at deploy time, and the key is a repo secret.
- **Cold load**: ~5 min → instant (no keys) or ~34 s (live refresh).
- **Fewer wasted calls**: the TwelveData quote duplicate is gone (13 credits per refresh), sector ETF quotes are no longer fetched once per ticker, and TwelveData rate-limit errors returned inside the response body are now retried.
- **Smaller cache**: reported financials are trimmed to the fields the Quality Score reads (1,023 KB → 34 KB for 14 tickers, identical results).
- **`watchlist.json`** (repo root) is the default watchlist and the ticker list the job snapshots.
- **Fixes**: the chart crashed on a fast Stocks⇄ETFs switch; the chart was blank without a TwelveData key even when the snapshot had the data; default ticker `AOI` corrected to `AAOI`; a first run with keys now loads automatically; the Indicators step shows an ETA.
- QA report with measurements: [`docs/QA_2026-09-24_improvements.md`](docs/QA_2026-09-24_improvements.md).

## v0.26 (2026-09-23 → 2026-09-24): table-first, deep-dive review round

- **Table-first**: Setup Radar, Dip Hunter and Long-Term panels sit behind one `Scans` summary line. Clicking one opens that panel and filters the watchlist to its tickers. A new **Signals** column shows radar-surfaced setups per row.
- **Deep-dive expanded row**: a single verdict sentence (shown only when the score and a setup disagree), chart, **Entry & Risk in four lines**, setup rows that match the radar exactly, and a banded score bar (`BADGE_BANDS` is the single source).
- **Long-Term card reads top-down**: one row per component, sorted by points left, with Timing | Quality side by side and Revenue (5y) beside "Why this score".
- **Less noise**: 4 market tiles (Volatility · SPY · F&G · Macro), one stale-quote flag in the header, and colour used only for verdicts.
- **Data**: 400 daily bars, so monthly RSI renders; 1-year lookbacks kept; one refresh at a time; the cache stores only the fields the app reads (stops localStorage filling up).
- Position Size and the portfolio-value setting were removed.

## v0.25 (2026-09-13) — distance-to-next-tier and "waiting on" for Dip Hunter, Setup Radar, ETF
- **"+X to next tier"** on Dip Hunter and ETF entry/exit scores — a `6.2 SOON` now shows `+0.8 to ACT`, the same fix the Long-Term Setup card got in v0.24. Dip Hunter's hidden ACT gates are named explicitly: a score ≥7 that's still SOON reads `needs market fear` or `capped by downtrend` instead of leaving the rule buried in the source. (Setup Radar's readiness runs on an urgency-adjusted rank, not the displayed score, so it keeps its own `~Xw to full setup` hint rather than borrowing this one — see CLAUDE.md.)
- **"Waiting on"** — the component with the most points left on the table, e.g. `Waiting on: Turn +1.0, Smart Money +0.6`, now shows on Dip Hunter (9 components), Setup Radar (4 per setup) and both ETF entry/exit scores (4 each). The ranking helper (`waitingOn`/`qualityWaitingOn` in `longTermIndicators.js`) is unchanged for callers; its ranking logic moved into the shared `readiness.js` layer (`rankGaps`) so every panel's own `components[]` can reuse it.
- Display-only, zero new API calls, zero new math — pure formatting of scores already computed.

## v0.24 (2026-09-12) — two-view playbooks + dashboard-wide colour ramp
- **Demo mode shows the whole dashboard** — without API keys, Setup Radar, Dip Hunter, Long-Term Setup and the ETF table were all empty, because they need price history rather than summary fields. Demo mode now generates deterministic synthetic candle series per ticker and ETF proxy and runs them through the real engines, so every panel shows a plausible reading and both Setup Radar buckets, the dip scan and the ETF entry/exit table populate.
- **A strong SELL no longer looks green** — the ETF table rendered `SELL ACT` and a high Exit score through the same green as a buy signal, so the colour said "good" when the signal said "get out". Sell signals now have their own red/orange ramp, and the Exit score's ramp is inverted.
- **One readiness ramp** — ACT / SOON / WATCH / WAIT colours were duplicated in four components and had drifted: SOON rendered purple in one place and amber in another, WATCH grey in two panels and near-white in a third. All four now read from one palette (`tone.js` + `readiness.js`), so a colour means the same thing wherever you see it. Same for the class-vs-hex mismatches inside the indicator bar (RSI, ADX, Stochastic, Conviction, Volume).
- **Long-Term Setup reads at a glance** — one colour ramp across the status badge, the Timing/Quality totals, all 11 chips and the verdict: green = working for you, amber = partly there, orange = caution, slate = not yet (what you're waiting on), grey = no data. ACCUMULATE, WATCHLIST and CHECK QUALITY now have three distinct colours instead of sharing one.
- **"X pts to the next band"** — a bare `Timing: 42` now reads `42 (WEAK) · 8 pts to watchlist timing (50+)`, so the gap to a better entry is explicit.
- **"Waiting on"** — the components with the most points still on the table, shown as `Oversold +18 · Drawdown +16`. When the quality total is below the ≥60 gate it names the quality components instead, since that's what's actually blocking. Hidden on ACCUMULATE. A five-dot legend at the bottom of the card explains the ramp.
- **Trend Setup / Pullback Setup tabs** — the expanded row's indicator bar (~29 cards) now has an `All | Trend Setup | Pullback Setup` toggle that narrows the technical cards to the playbook being considered: Trend shows weekly trend, Momentum setup, RS vs SPY, ADX, ROC, AVWAP, OBV; Pullback shows RSI, Stochastic, BB position, oversold confluence, swing-low support, POC, the Pullback setup. Fundamentals and the score-context cards (T/F/S, Conviction, Score Z) stay visible in every tab. `All` is the default — nothing is hidden until a playbook is picked. Same tabs on mobile.
- **Docs + dead-code sweep** — `BACKLOG.md` holds only open items (shipped ones live here), `CLAUDE.md` dropped its per-release narrative for durable rules, the README's feature list now matches the app (the News panel, price alerts and the Notes field it still advertised were removed rounds ago), and the orphaned `stores/notes.svelte.js` was deleted.

## v0.23.1 (2026-09-12) — chart no longer hijacks page scroll
- **Click-to-activate scroll-zoom** — wheel over the candlestick chart used to zoom it while trying to scroll the page. Wheel zoom is now off until the chart is clicked and releases when the pointer leaves (hint badge shown while inactive); on touch, a vertical drag scrolls the page instead of panning the chart. Drag-pan, pinch and double-click reset unchanged.

## v0.23 (2026-09-11) — AI export: mobile copy & share
- **Manual-copy fallback** — "Copy for AI" now shows a selectable-text panel when the Clipboard API write silently fails (common in mobile in-app browsers like the Instagram/Facebook webview), so the prompt is never a dead end.
- **Share sheet button** — a 📤 button (shown only where `navigator.share` is supported) drops the prompt straight into the phone's native share sheet — Messages, Notes, an AI app — skipping the clipboard entirely.
- **Mobile-skimmable prompts** — all 4 export templates now ask for short paragraphs/bullets, since the AI's reply is usually read on a phone too.

## v0.22 (2026-09-03 → 2026-09-10) — readability, regime-adaptive timing, mobile fit
- **Readability + contrast pass** — sector moved under the ticker symbol (its own table column dropped), the muted/secondary/border color tokens lifted to meet AA contrast, dense-UI text floor raised from 10/11px to 12/13px.
- **Setup Radar / Dip Hunter mobile wrap** — rows wrap instead of scrolling sideways on a phone; RS spans are self-labelled ("vs SPY") instead of a bare percentage.
- **Regime-adaptive Timing Score** — a new composite market-regime detector (`detectMarketRegime` in `macro.js`) widens/narrows the Timing Score's drawdown and oversold bands and adds a market-context bonus, so quality names pulling back in a bull market score higher without loosening the gate in a real downturn.
- **Mobile perf + polish** — the ETF dashboard gained stacked mobile cards, the ticker-expansion panel now mounts only the active breakpoint's markup (was double-mounting chart/news), and duplicated FundamentalsBar empty-state markup was deduped.
- **Ticker-search race guard** — typing fast enough to overlap two in-flight searches could show a stale result; a request token now discards out-of-order responses.

## v0.21 (2026-07-20 → 2026-08) — Long-Term Setup UI + ETF/valuation polish
- **Long-Term Setup card merged into the main expanded row** — previously split across two components, now one card with larger text and a rich hover tooltip on every status badge, score, and chip explaining the underlying thresholds.
- **Indicator breakdown chips** — timing and quality sub-scores render as labelled, fill-coloured chips (`longTermIndicators.js`); a missing component reads muted grey, distinct from a real 0.
- **HY credit-spread risk gate** — FRED `BAMLH0A0HYM2` feeds a `creditStress` regime (CALM/ELEVATED/STRESS) that can demote an ACCUMULATE verdict when the broader credit market is stressed, overriding the Fear & Greed panic boost.
- **Setup Radar split into Accumulation / Breakout** — the "leaders only" (RS > 0) gate no longer suppresses laggards in the buy-the-dip Pullback setup; it still applies to the Momentum/Breakout setup.
- **Dip Hunter fear-gate fix** — the market-fear score component now only fires when the *stock itself* is oversold, not just because the tape is fearful.
- **Revenue history mini-chart** — 5-year YoY revenue bars in the Long-Term Setup card, reusing the financials-reported payload already fetched for the Quality Score (zero new API calls).
- **XDEW added to the ETF catalog** (S&P 500 Equal Weight); every Entry/Exit score component in the ETF expanded row gained a hover tooltip.

## v0.20 (2026-07-18 → 2026-07-20) — Long-Term Dip Buying framework
- **Timing Score (0–100)** — drawdown, oversold (daily+weekly+monthly RSI), reversal, consolidation, volume, and market-context components computed from candles already fetched.
- **Quality Score (0–100)** — profitability, cash flow, balance sheet, shareholder return, and earnings quality; fetched lazily on row expand (2 extra Finnhub calls, cached, never on a batch refresh).
- **Long-Term Setup** — a fixed timing×quality gate matrix producing ACCUMULATE / WATCHLIST / OVERSOLD_BUT_CAUTION / WAIT, with a Fear & Greed panic boost for oversold-but-cautious names.
- **Data enrichment** — dividend yield, watchlist breadth, and sector momentum surfaced in the Fundamentals Bar and AI export snapshot.
- **Deep code-review fixes** — Finnhub metric percent-vs-fraction unit bugs and a metric-object unwrap bug (both silently produced wrong scores) found and fixed; stale git worktrees removed from the repo. 424 tests.

## v0.19 (2026-07-12 → 2026-07-15) — mobile pass
- **Touch tooltips** — tap-to-open on iOS/Android, desktop hover unchanged; one shared expanded-row layout used by both breakpoints for parity.
- **Mobile card redesign** — collapsible sections (Chart/Indicators open by default, Entry Plan closed), a sticky bottom action bar (Copy for AI · Alert · Remove), and a horizontally scrollable chip rail.
- **Dedup** — the four duplicated TD-candle-mapping blocks in `App.svelte` became one `candles.js` helper; a shared `scoreStyle`/chip-row snippet replaced separate desktop/mobile copies.
- **Mobile-fit follow-up** — News, Notes, and score history dropped from the mobile card (desktop-only from here on), 3-column indicator grid, one-line ticker header, the Alerts feature removed entirely, Market Context's rotation tile made readable, and the Entry Panel compacted to a single column.

## v0.18 (2026-07-12) — Copy-for-AI export
- **Copy for AI** — one click formats a ticker's full dashboard reading (price, score, technicals, weekly setups, fundamentals, relative strength, smart money, dip score, market context) into a plain-text snapshot, merges it into an editable prompt template, and copies it for pasting into any external LLM chat.
- **4 starter templates** — Deep Dive, Trade Setup Review, Risk Check, News Catalyst Scan — editable and resettable from Settings.
- Zero new API calls; Stocks view only for now (ETF export is a future round).

## v0.17 (2026-07-10) — ETF refinement round
- **UCITS catalog search** — searchable curated catalog (55 funds pre-mapped to US proxies) in the ETF add bar: one-click add, already-added entries disabled, manual entry stays as fallback.
- **Tooltip viewport clamp** — tooltips measure their real height, flip above the cursor near the bottom edge, clamp to the viewport, and close on scroll. No more clipped hover info.
- **Setup Radar weekly RSI** — each radar row shows the raw weekly RSI value (display-only, not part of either setup score).
- **ETF decision indicators** — the ETF expanded row gains trend state (weekly close vs EMA10/EMA30), weekly RSI, 52-week range position, and 13-week momentum — all computed from candles already fetched, none feed any score.
- **ETF thesis + highlights + notifications** — plain-English thesis sentence per ETF, a cross-view "Today" highlights strip (ACT/SOON digest with click-through), and opt-in in-browser notifications for newly arrived signals.

## v0.16 (2026-07-02) — Dip Hunter
- **Dip Hunter card** — finds early entries when quality stocks go on sale. A strict quality gate must pass first (EPS growth > 0, revenue growth > 0, profitability, PEG < 3, fundamental score ≥ 60); survivors are scored 0–10 on **Market Fear** (F&G zone + SPY below EMA50), **Oversold** (RSI tiers, RSI z-score, BB confluence), **Drawdown** (60d/20d decline, lower half of 52w range), and **Smart Money** (insider net buying + analyst buy ratio). ACT requires an active fear component — the card never says ACT in a greedy market. Display-only; the composite score is untouched.
- **Smart-money data** — two new free Finnhub endpoints (`/stock/recommendation`, `/stock/insider-sentiment`), combined into one 7-day cache entry: +2 calls/ticker on the first refresh of a week, zero after.
- 16 new unit tests (210 total).

## v0.15.1 (2026-07-02) — audit fixes
- **Real weekly bars** — daily candles are now aggregated into true weekly OHLCV (max high / min low / last close / summed volume, current partial week included) instead of sampling every 5th bar. Weekly ATR is now a true weekly value (Entry Panel suggested stops widen accordingly) and setup signals always reflect the latest trading day.
- **Volatility regime proxy** — Finnhub free tier returns zeros for VIX, so the regime logic silently never fired. The market bar now shows **VOL**: SPY 20-day realized volatility (annualized, VIX-comparable), computed from already-fetched SPY closes. Two dead API calls per refresh removed.
- **SPY trend** — the "SPY downtrend" score penalty now uses SPY below its EMA50 instead of a single red day (dp < −0.5%).
- **Short Interest removed** — `/stock/short-interest` regressed to 403 (premium) on the free tier; the dead cell and fetch are gone.
- Full audit report: `docs/audit-2026-07-02.md`. 7 new unit tests (194 total).

## v0.15 (2026-06-20)
- **OBV** — On-Balance Volume with 20-bar EMA trend; Accumulation / Neutral / Distribution cell in Fundamentals Bar.
- **52w-High Volume Confirmation** — breakout chip in the watchlist table now shows `· ↑ vol` / `· low vol` based on recent vs baseline average volume ratio.
- **Swing-Low Support Levels** — S1/S2/S3 pivot lows in Fundamentals Bar (price + % above); SUP toggle on price chart draws dashed green lines.
- **Beta-Adjusted Position Sizing** — tiered risk % (β ≤ 0.8 → 2.5%, normal → 2%, elevated → 1.5%, β > 1.8 → 1%); Entry Panel shows β value colour-coded by tier.
- **Short Interest** — days-to-cover from Finnhub `/stock/short-interest` (free tier); "Short" cell in Fundamentals Bar; 7-day cache.
- 24 new unit tests (187 total); all backlog items 1–5 shipped.

## v0.14 (2026-06-20)
- **Interface cleanup** — removed four features that were non-functional on the Finnhub free tier: **Insider 90d** (endpoint always returned empty), **Pre-Buy Checklist** (friction with no payoff), **Trade Log**, and **Paper Trades** (including the Paper Trades Overview panel and Settings backup). **Replay / Backtest** panel also removed.
- **Entry Panel always unlocked** — no longer gated behind the checklist. Stop-loss input replaced by the ATR-derived suggested stop (2× weekly ATR) which now drives all risk math: risk/share, risk %, position sizing, and the scenario table.
- ~500 lines of dead UI removed; scoring engine, indicators, and test suite unchanged (163 tests).

## v0.13 (2026-06-19)
- **Chart anchors** — four price-anchored signals from one zero-API-call module (`chartAnchors.js`, computed on daily candles). **AVWAP** (anchored to the most significant swing low — institutional cost basis) and **POC + value area** surface as Fundamentals-Bar pills; **Fibonacci retracements** and **Fair Value Gaps** are optional daily-only chart overlays (FIB/FVG toggles). AVWAP-reclaimed + POC-not-below nudge a name's Setup-Radar readiness one tier (WATCH→SOON→ACT); the calibrated `computeScore` and `signals.js` are untouched.
- 19 new unit tests (163 total).

## v0.12 (2026-06-17)
- **Free signal batch** — four zero-API-call signals computed in `computeIndicatorsFromCandles` (52w at display): **EMA Stack** (`BULL STACK`/`BROKEN` chip), **Oversold Confluence** (RSI < 35 + lower-BB badge), **ROC 20d/60d** momentum cell, and **52-week-high proximity** chip. All display-only with tooltips. *Deferred:* the 52w-high volume-confirmation overlay (proximity only for now).
- **ATR-based stop + R:R** — EntryPanel now shows a suggested long stop (entry − 2× *weekly* ATR; weekly over daily so the stop isn't inside the noise on a 2mo–1yr hold) and R:R to the analyst target (keys off the manual stop when set, else the suggested stop; guarded for no-upside/inverted-stop). Daily `atr` exposed from `computeIndicatorsFromCandles`, letting EntryPanel drop its own daily candle fetch — one fewer Finnhub call per ticker.
- 13 new unit tests (136 total).

## v0.11 (2026-06-14)
- **Relative Strength vs SPY (1M/3M)** — each stock's return minus the S&P 500's over ~21 and ~63 trading days; outperform/underperform chip on watchlist rows + Fundamentals Bar cell. SPY daily closes fetched once per refresh (cached).
- **Revenue growth, P/S, PEG** — growth-and-valuation metrics for cases where P/E misleads (growth names, ADRs). Fundamentals Bar cells + "so what" tooltips. PEG computed client-side (`valuation.js`), guarded against zero/negative growth.
- Display-only — no change to the scoring engine. 13 new unit tests (123 total).

## v0.10 (2026-06-14)
- **Weekly Setup Signals** — leading-indicator layer adapted from grid-bot signal research: Pullback (accumulation) and Momentum (breakout) setups scored 0–10 on weekly candles, with readiness (WATCH/SOON/ACT) + ETA in weeks. Surfaced as a table badge and Fundamentals Bar cells with "so what" tooltips. Built from the weekly candles already fetched — no new API calls.
- **Test suite expanded** — 32 new unit tests for `signals.js` (111 total).

## v0.9 (2026-04-01)
- **Paper Trades** — record a hypothetical BUY/SELL, snapshot score + thesis at entry, track live P&L and CONFIRMED/AGAINST verdict over weeks/months; close with exit score snapshot; Paper Trades Overview panel on main dashboard
- **Chart sub-panes** — Volume bars (default on), MACD histogram/line/signal, RSI(14) with 30/70 lines, Bollinger Bands overlay; VOL and MACD are exclusive (one at a time); dynamic chart height
- **Configurable default watchlist** — editable in Settings (chip UI, add/remove/reset); updated to AMZN · GOOGL · SKM · TSLA · HOOD · NVDA · SOFI
- **TwelveData rate limiter** — sliding-window queue (8 calls/min) prevents hitting free tier limits; progressive retry on 429
- **Finnhub 403 tombstone** — restricted endpoints cached for 24h to stop repeated console errors
- **ADR ticker search** — SKM and other ADRs now appear in search results
- **Score arrow/sparkline fix** — shows → flat arrow and center line even with just 1 snapshot; `sv_*` keys now preserved by Clear API Cache

## v0.8 (2026-03-28)
- **Score z-score display** — surfaced in WatchlistTable (desktop, lg+) and Fundamentals Bar; shows how many std-devs current score is above/below its 90-day mean
- **Correlation warning** — Portfolio Stats now flags when 2+ open positions share the same sector with ⚡ warning and plain-English guidance
- **README + changelog** synced to v0.8

## v0.7 (2026-03-28)
- **Mobile card layout** — single-column morning scan mode for < sm breakpoint with expandable rows
- **"So what" tooltips** — hover RSI, MACD, ADX, Stochastic, Conviction, or Score for plain-English interpretation
- **Volume profile** — horizontal histogram SVG overlay on chart right side (toggle ▣ button)
- **Earnings annotations** — past earnings markers on chart coloured by surprise % (fetch from Finnhub `/stock/earnings`)
- **Analyst price target zone** — PT↓ / PT / PT↑ dashed lines on chart from Finnhub price target data
- **Drawing tools** — horizontal line (─), trend line (╱), rectangle (▭) drawn directly on chart and persisted to localStorage per symbol

## v0.6 (2026-03-28)
- **Fear & Greed index** — CNN F&G gauge in Market Context Bar; integrates into score modifier (extreme fear −3, extreme greed −2)
- **SPY downtrend penalty** — when SPY dp < −0.5%, all LONG scores pulled 20% toward neutral; ⚡ shown in table
- **Regime-aware weights** — VIX > 25: fund 55%; VIX > 35: fund 60%; regimeNote shown in thesis + score tooltip
- **Conviction scoring** — signal agreement % separate from directional score; HIGH/MODERATE/LOW/MIXED labels in table + Fundamentals Bar
- **RSI z-score** — 90-day rolling z-score in Fundamentals Bar with "unusually high/low vs history" tooltip

## v0.5 (2026-03-28)
- **Default watchlist** — first-time users see TSLA · SKM · SOFI · GOOGL · AMZN · HOOD immediately; no empty state
- **Startup hydration** — on every open the app loads last-cached quotes, scores, indicators, and news instantly without hitting any API; data only updates when Refresh is clicked
- **Intraday candles** — 1D (1h bars) and 5D (1h bars) timeframes on the price chart with 15-min cache
- **TwelveData as primary chart source** — all 6 timeframes (1D/5D/1M–1Y) via `/time_series`; 365 daily bars fetched once, `setVisibleRange` zooms per timeframe; shared cache eliminates duplicate API calls
- **ADX(14) signal (T7)** — trend strength scoring: strong trending + MACD direction = high conviction; Ranging/Emerging/Trending/Strong pill in Fundamentals Bar
- **Stochastic(14,3,3) signal (T8)** — %K/%D oversold/overbought zones + crossover detection; bull/bear cross badge in Fundamentals Bar
- **EMA50 + MA200 local fallback** — computed from cached candles so Fundamentals Bar always shows values even without Finnhub metrics
- **Credit budget** — 6 indicators × ~6 tickers = 36 credits/refresh (~22 full refreshes/day on free tier)

## v0.4 (2026-03-28)
- **Local RSI(14) + MACD** computed from Finnhub candles — T5/T6 scoring active for all users with no extra API key
- **TwelveData integration** — optional second key adds BB position + higher-precision indicator values; overrides local computation when available
- **ATR(14) volatility card** in Entry Panel — intraday range, stop-too-tight warnings (< 0.5 ATR)
- **High-volatility day warning** — |dp| ≥ 5% nudge in Entry Panel with contextual copy
- **Score history chart** — full-width SVG in expanded row with area fill, delta, 50-pt reference line
- **Edge Analysis** in Portfolio Stats — Expectancy, Kelly %, 5/10 loss streak probability (≥ 5 closed trades)
- **Per-ticker notes** — auto-saved textarea, 📝 badge on table row, survives cache clear

## v0.3 (2026-03-28)
- **Morning Brief** — top setups, earnings warnings, movers, blocked tickers at a glance
- **Thesis Summary** — plain-English score explanation per ticker (bulls ▲, bears ▼, warnings ⚠)
- **Trade Window card** — explicit earnings countdown in Entry Panel with risk colour coding
- **MA50/MA200 overlays** on price chart with toggle
- **Score sparkline** — inline SVG trend chart per row (last 7 snapshots)
- **Sector sort** + sortable Earnings column header
- **Sector concentration risk** warning + exposure breakdown bars
- **Portfolio beta** (weighted) + unrealized P&L in Portfolio Stats
- **BLOCKED badge** wired to hard warning state
- **CSV export** — watchlist with all metrics
- **j/k keyboard navigation** through watchlist rows
- **Auto-refresh** setting (5/15/30 min, market hours only) in Settings

## v0.2 (2026-03-28)
- 9-signal scoring engine (Technical/Fundamental/Sentiment) with T/F/S sub-score bars + velocity
- Candlestick chart (1M–1Y), news panel, fundamentals bar
- Trade log (FIFO P&L + CSV), portfolio stats (win rate, R:R, best/worst)
- Price alerts, bulk import, drag-and-drop reorder
- Market hours indicator, mobile responsive, position sizing (2% rule)
- Stop-loss quick-picks (3/5/8%), portfolio concentration risk

## v0.1 (2026-03-27)
- Watchlist, pre-buy checklist (friction layer), entry panel, market context bar (VIX + sectors)
- 3-signal score, onboarding modal, settings panel, GitHub Pages deploy

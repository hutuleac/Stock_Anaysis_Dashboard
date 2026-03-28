# Stock Analysis Dashboard v0.4

A fast, offline-first stock analysis dashboard for retail swing traders. Bloomberg-quality data workflow, built with Svelte 5 + Finnhub free API.

**Live:** https://hutuleac.github.io/Stock_Anaysis_Dashboard/

---

## Features

### Morning Brief
- Top 3 setups by score (≥ 55), earnings warnings (≤ 7 days), big movers (|Δ| ≥ 3%), blocked tickers — all at a glance above the table
- Collapsible, click any ticker to jump straight to the expanded row

### Watchlist
- Search and add tickers via Finnhub search API
- Bulk import — paste comma/newline-separated list
- Drag-and-drop reorder
- Sort by: score · price · change · earnings · sector · symbol
- Score sparkline — tiny SVG trend line of last 7 score snapshots per ticker
- Score velocity arrow (↑↓→) — 3-day delta
- Price alerts — set above/below targets, notified on next refresh
- CSV export — all tickers with score, sub-scores, price, sector, earnings countdown
- BLOCKED badge — automatically shown when a hard warning is active

### Scoring Engine (up to 11 signals)

| Category | Signals |
|----------|---------|
| **Technical 35%** | EMA50 position, MA200 regime, 52-week range, daily momentum, RSI(14), MACD crossover |
| **Fundamental 45%** | P/E ratio, EPS growth YoY, analyst price target premium |
| **Sentiment 20%** | News headline keywords (last 5), sector ETF trend, insider net buying (90d) |

- T5 RSI(14) + T6 MACD computed locally from Finnhub candles — no extra API key needed
- Optional TwelveData key adds Bollinger Band position and higher-precision indicator values
- Score badges: `STRONG` · `LEAN LONG` · `NEUTRAL` · `LEAN SHORT` · `STRONG SHORT` · `BLOCKED`
- Confidence band: `(factors/total)` shows how many signals had live data
- T/F/S sub-score mini bars inline per row

### Expanded Row (per ticker, click to open)

**Charts**
- Candlestick chart — 1M / 3M / 6M / 1Y (TradingView lightweight-charts)
- MA50 (amber) + MA200 (blue) overlays with toggle button
- Stop-loss price line auto-drawn from checklist input

**Data panels**
- News panel — last 6 headlines with bull/bear/neutral sentiment dots + timeAgo
- Fundamentals bar — Mkt Cap · P/E · EPS Growth · EMA50 · MA200 · Analyst Target · Insider 90d net shares · 52w range bar · RSI(14) · MACD · BB position (when TwelveData key set)
- Score history chart — full-width SVG with area fill, delta header, 50-point reference line

**Decision flow (left → right)**
1. **Pre-Buy Checklist** — macro calendar check, earnings gate (auto), sector trend (auto), stop-loss entry + 3/5/8% quick-picks
2. **Entry Panel** (unlocks after checklist):
   - Thesis Summary — 2–4 plain-English bullets explaining exactly why the score is what it is (positives ▲, negatives ▼, warnings ⚠)
   - Trade Window — explicit countdown to earnings with risk colour coding
   - High-volatility day warning — fires when |dp| ≥ 5% with contextual copy
   - Risk Snapshot — current price, stop-loss, risk/share, risk %
   - ATR(14) intraday volatility card — stop-too-tight warnings (< 0.5 ATR = noise range)
   - Position sizing — 2% rule: recommended shares, cost, % of portfolio, max loss
   - Scenario table — Base (1:2 R:R), Extended (1:3), Stop-out
3. **Trade Log** — BUY/SELL entries, FIFO realized P&L, unrealized P&L, CSV export

**Notes**
- Free-text note field per ticker — auto-saves on every keystroke
- 📝 badge on table row when notes exist
- Survives cache clear, persists indefinitely in localStorage

### Portfolio Stats (appears once you have closed trades)
- Realized P&L · Win Rate · Avg Win · Avg Loss · R:R Ratio · Best/Worst trade · Unrealized P&L
- Weighted portfolio beta — "Market sensitivity: your portfolio moves ~1.4× SPY"
- Sector exposure breakdown — bars per sector with ⚠ warning if any sector > 40%
- **Edge Analysis** (unlocks after 5+ closed trades): Expectancy/trade · Kelly % · probability of 5/10 consecutive losses

### Market Context Bar
- VIX with plain-English interpretation (CALM → EXTREME)
- SPY trend + 11 sector ETF performance
- Soft nudge banner for elevated risk conditions
- Collapsible

### App-level
- Market hours indicator — OPEN/CLOSED + countdown (ET), updates every minute
- Auto-refresh — Off / 5 / 15 / 30 min, only fires when market is open
- Keyboard shortcuts: `R` refresh · `Esc` close · `/` search · `J`/`K` navigate tickers
- Offline banner, storage quota protection, cache-clear in Settings
- GitHub Actions deploy to GitHub Pages on push to `main`

---

## Setup

1. Get a free API key from [finnhub.io/register](https://finnhub.io/register)
2. *(Optional)* Get a free TwelveData key from [twelvedata.com/register](https://twelvedata.com/register) for RSI/MACD/BBands precision
3. Clone and install:
   ```bash
   git clone https://github.com/hutuleac/Stock_Anaysis_Dashboard
   cd Stock_Anaysis_Dashboard
   npm install
   npm run dev
   ```
4. Open `http://localhost:5173` — enter your API key when prompted, then hit Refresh

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Svelte 5 (runes — `$state`, `$derived`, `$props`, `$effect`) |
| Build | Vite + Tailwind v4 |
| Charts | TradingView lightweight-charts |
| Data | Finnhub.io free tier + optional TwelveData free tier |
| Storage | localStorage (client-side only, nothing sent to any server) |
| Deploy | GitHub Actions → GitHub Pages |

## Cache TTLs

| Data | TTL |
|------|-----|
| Quotes | No cache (always fresh on refresh) |
| News / Earnings / Candles | 24h |
| Indicators (TwelveData) | 1h |
| Fundamentals / Profile / Insider | 7d |

---

## Changelog

### v0.4 (2026-03-28)
- **Local RSI(14) + MACD** computed from Finnhub candles — T5/T6 scoring active for all users with no extra API key
- **TwelveData integration** — optional second key adds BB position + higher-precision indicator values; overrides local computation when available
- **ATR(14) volatility card** in Entry Panel — intraday range, stop-too-tight warnings (< 0.5 ATR)
- **High-volatility day warning** — |dp| ≥ 5% nudge in Entry Panel with contextual copy
- **Score history chart** — full-width SVG in expanded row with area fill, delta, 50-pt reference line
- **Edge Analysis** in Portfolio Stats — Expectancy, Kelly %, 5/10 loss streak probability (≥ 5 closed trades)
- **Per-ticker notes** — auto-saved textarea, 📝 badge on table row, survives cache clear

### v0.3 (2026-03-28)
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

### v0.2 (2026-03-28)
- 9-signal scoring engine (Technical/Fundamental/Sentiment) with T/F/S sub-score bars + velocity
- Candlestick chart (1M–1Y), news panel, fundamentals bar
- Trade log (FIFO P&L + CSV), portfolio stats (win rate, R:R, best/worst)
- Price alerts, bulk import, drag-and-drop reorder
- Market hours indicator, mobile responsive, position sizing (2% rule)
- Stop-loss quick-picks (3/5/8%), portfolio concentration risk

### v0.1 (2026-03-27)
- Watchlist, pre-buy checklist (friction layer), entry panel, market context bar (VIX + sectors)
- 3-signal score, onboarding modal, settings panel, GitHub Pages deploy

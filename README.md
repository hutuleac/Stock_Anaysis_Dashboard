# Stock Analysis Dashboard v0.2

A fast, offline-first stock analysis dashboard for retail swing traders. Bloomberg-quality data workflow, built with Svelte 5 + Finnhub free API.

## Features

### Watchlist
- Search and add tickers via Finnhub search API
- Bulk import — paste a comma/newline-separated list
- Drag-and-drop reorder, sort by score/price/change
- Price alerts — set above/below targets, notified on next refresh

### Scoring Engine (10 signals)
| Category | Signals |
|----------|---------|
| **Technical 35%** | EMA50 position, MA200 regime, 52-week range, daily momentum |
| **Fundamental 45%** | P/E ratio, EPS growth, analyst price target premium |
| **Sentiment 20%** | News headline keywords, sector ETF trend, insider net buying (90d) |

Score badges: `STRONG` · `LEAN LONG` · `NEUTRAL` · `LEAN SHORT` · `STRONG SHORT`

Score velocity arrow (↑↓→) shows 3-day delta. T/F/S sub-score bars per row.

### Expanded Row (per ticker)
- **Candlestick chart** — 1M / 3M / 6M / 1Y (TradingView lightweight-charts)
- **News panel** — last 6 headlines with bull/bear/neutral sentiment dots
- **Fundamentals bar** — Mkt Cap · P/E · EPS Growth · EMA50 · MA200 · Analyst Target · Insider 90d · 52w range
- **Pre-Buy Checklist** — macro calendar, earnings gate, sector trend, stop-loss with quick-picks (3/5/8%)
- **Entry Panel** — risk snapshot, position sizing (2% rule), scenario table — unlocks after checklist
- **Trade Log** — BUY/SELL entries, FIFO realized P&L, unrealized P&L, CSV export

### Market Context Bar
- VIX with plain-English interpretation (CALM → EXTREME)
- SPY trend + sector leaders/laggards (11 ETFs)
- Soft nudge banner for elevated risk conditions

### App-level
- Market hours indicator — OPEN/CLOSED + countdown (ET)
- Portfolio summary — total realized P&L · open positions · trades logged
- Keyboard shortcuts: `R` refresh · `Esc` close · `/` search
- Offline banner, storage quota protection, cache-clear in Settings

## Setup

1. Get a free API key from [finnhub.io/register](https://finnhub.io/register)
2. Clone and install:
   ```bash
   git clone https://github.com/hutuleac/Stock_Anaysis_Dashboard
   cd Stock_Anaysis_Dashboard
   npm install
   npm run dev
   ```
3. Open `http://localhost:5173` — enter your API key when prompted, then hit Refresh

## Tech Stack

- **Svelte 5** (runes — `$state`, `$derived`, `$props`)
- **Vite + Tailwind v4**
- **TradingView lightweight-charts** — candlestick charts
- **Finnhub.io** free tier — quotes, earnings, metrics, news, insider transactions
- **localStorage** — all data stored client-side, nothing sent to any server

## Cache TTLs

| Data | TTL |
|------|-----|
| Quotes | No cache (always fresh) |
| News / Earnings | 24h |
| Candles | 24h |
| Fundamentals / Profile / Insider | 7d |

## Changelog

### v0.2 (2026-03-28)
- 10-signal scoring engine with T/F/S sub-score bars + score velocity
- Candlestick chart, news panel, fundamentals bar
- Trade log (FIFO P&L + CSV export), price alerts, bulk import
- Market hours indicator, keyboard shortcuts, mobile responsive
- Position sizing (2% rule), stop loss quick-picks

### v0.1 (2026-03-27)
- Watchlist, 3-signal score, pre-buy checklist, entry panel, market context bar

# Product Requirements Document — Next-Gen Stock Analysis Dashboard
**Type:** Visionary / Forward-Looking
**Status:** Planning Reference
**Replaces:** XTB Trading Dashboard v4 (see PRD_DETAILED.md for as-built reference)

---

## 1. Vision

Most retail traders don't fail because they lack information — they fail because they act on the wrong information at the wrong time, with no context about risk. This dashboard should function as a **pre-trade checklist and advisor**, not just a data viewer. It should make the user slow down, think about position sizing, and understand *why* a setup is or isn't worth taking — not just what the indicators say.

The product should feel like a Bloomberg terminal designed by Apple: dense with information, but never overwhelming. Every piece of data earns its place by directly influencing a decision.

---

## 2. Target User

**Primary:** Self-directed retail trader managing a personal portfolio of 5–25 stocks. They understand basic chart patterns and fundamental metrics. They check the dashboard before market open and before entering new positions. They trade on a platform like XTB, IBKR, or Robinhood.

**Not:** Algorithmic traders, HFT, or users who need sub-second data. This tool is for deliberate, thesis-driven entries.

**User's core question every morning:** "What should I do today — and what should I absolutely *not* do?"

---

## 3. Design Principles

1. **Decision-first, not data-first.** Every section answers a question: "Should I buy this? At what size? What's my exit?" Data that doesn't answer a question shouldn't be on the screen.

2. **Honest uncertainty.** Never show a score without showing its confidence. A score of 82 based on 6 indicators is not the same as 82 based on 14. Show the count, show the gaps.

3. **Risk before reward.** Stop-loss and downside scenarios must appear before take-profit levels. The user should see what they're risking first.

4. **Friction for bad trades.** When a ticker has a hard warning (earnings imminent, extreme volatility, deteriorating fundamentals), the UI should make the user confirm they've read it — not just show a yellow badge they can ignore.

5. **Mobile-first for reading, desktop for analysis.** Morning watchlist check on phone must be clean and scannable. Deep analysis happens on desktop.

6. **Dark mode only.** Trading dashboards are used at any hour; light mode is not a requirement.

---

## 4. Core Features (Must-Have)

### 4.1 Watchlist with Tiered Scoring

- Composite score 0–100 per ticker, with a **confidence band** (e.g., "82 ± 6") derived from data completeness
- Score breakdown visible without hover: a small inline bar showing technical / fundamental / sentiment sub-scores
- Visual severity system: STRONG LONG (green fill) · LEAN LONG (green outline) · NEUTRAL · LEAN SHORT (red outline) · STRONG SHORT (red fill) · BLOCKED (gray — hard warning active)
- Sortable by score, momentum, earnings proximity, volatility, or sector

### 4.2 Pre-Trade Decision Panel

Replaces the current "Entry Cards" with a more structured flow. For each actionable ticker, show:

1. **Thesis Summary** — 2–3 bullet auto-generated sentences explaining *why* the score is what it is, in plain English. E.g., "Price is testing AVWAP support with RSI at 38 — historically a favorable entry window for this ticker. However, earnings are in 12 days, limiting the trade window."
2. **Risk Snapshot:**
   - Position size recommendation (% of portfolio) with the rule that generated it
   - Dollar amount at risk at the suggested stop (requires user to input portfolio size once)
   - Max adverse excursion based on ATR: "In a normal volatility day, this could move against you by $X before your stop is hit"
3. **Scenario Table:** Three outcomes — Base case (TP1), Extended case (TP2), Stop-out. Each with price, P&L%, and probability label (not precise — just High/Medium/Low based on structure).
4. **Trade window indicator:** Countdown to earnings, ex-dividend date, or Fed announcement. Flagged explicitly as "Trade window: 18 days remaining."

### 4.3 Portfolio Context

Users should input a simple portfolio snapshot: ticker, shares held, average cost. The dashboard then:
- Shows unrealised P&L per position
- Flags concentration risk: if one sector > 40% of portfolio, warn the user before adding more
- Shows correlation between watchlist tickers — avoid adding a ticker that moves identically to one already held
- Calculates portfolio-level beta and displays it as "Market sensitivity: your portfolio will likely move ~1.4× what SPY moves"

### 4.4 Pre-Buy Checklist (friction layer)

Before the user can view entry levels, they answer 4 questions:
1. "Have you checked today's macro calendar?" (link to economic calendar)
2. "Is this ticker reporting earnings in the next 14 days?" (auto-answered from data)
3. "Is this sector currently in a downtrend?" (auto-answered)
4. "Do you have a stop-loss level in mind?" (free text, required)

Once all are answered, Entry Panel unlocks. The answers are stored per session. This adds 30 seconds of intentional friction that prevents impulse entries.

### 4.5 Charts (enhanced)

- Candlesticks with all current overlays (EMA, AVWAP, POC, Fibonacci, FVG, Sweep markers)
- **Volume profile** on the right side of the chart (horizontal histogram showing price levels with most volume)
- **Earnings annotations** — vertical line at each past earnings date, colored by reaction (green = gap up, red = gap down). Shows the average post-earnings move for context.
- **Analyst price target zone** — shaded band showing consensus low/mid/high target
- Toggle panel for overlays (don't force all indicators on at once)
- Drawing tools: horizontal line, trend line, rectangle (for marking levels before market open)
- Chart saved to localStorage per ticker so drawings persist across sessions

### 4.6 Market Context Panel

A collapsible top bar (not just a link) showing:
- **VIX level** with a plain-English interpretation: "VIX at 28 — elevated fear. Widen stops 20%, reduce position size by 1 tier."
- **Fear & Greed index** with context: "Extreme Greed (82). Historically, entries made here have lower expected returns over 30 days."
- **Sector heat map** — 11 S&P sectors shown as a grid with 1-week performance %. Tells the user if they're fighting the tide.
- **SPY trend status** — Bullish / Neutral / Bearish with one-line reason. If SPY is in a confirmed downtrend, all LONG scores are automatically penalised.

---

## 5. New Features (Future Consideration)

### 5.1 News Sentiment Layer

Pull headlines per ticker from a news API (Finnhub provides this). Run a simple keyword-based sentiment score (or use a small LLM API call). Display as a sentiment ribbon: 🟢 Positive / 🟡 Neutral / 🔴 Negative, with the most recent headline as tooltip. Negative news sentiment should reduce the composite score even if technicals are bullish.

### 5.2 Options Flow Indicator

Unusual options activity is often a leading indicator. Integrate a source like Unusual Whales (API) or Market Chameleon to flag tickers with unusual call or put buying. Show as a badge: "Options: Unusual CALL activity in last 24h." Not a buy signal on its own, but a confluence factor.

### 5.3 Insider Trading Feed

SEC Form 4 filings (available via Finnhub or OpenInsider) show when company insiders buy or sell. Show a badge when a C-suite insider bought shares in the last 30 days — historically bullish. Show a warning when insiders are selling into strength.

### 5.4 Relative Strength Ranking

Instead of just RS vs SPY, rank the entire watchlist by relative strength versus each other and versus their sector ETF. Show which ticker is the "leader" in each sector represented in the watchlist. Concentrate position sizing in the strongest names.

### 5.5 Historical Pattern Recognition (simple)

Track the scoring history per ticker in localStorage (one snapshot per day, rolling 30 days). When a score crosses above a threshold, check how many times that has happened in the last 30 days and what the subsequent 5-day move was. Show: "Score crossed 75 three times in the past month — average subsequent 5-day move: +4.2%." This is backward-looking, not predictive, but gives the user context.

### 5.6 Price Alerts (browser-based)

Allow the user to set price levels per ticker. On each data refresh, check if any alert levels are crossed and fire a `Notification` API browser notification. No backend required. Alerts stored in localStorage.

### 5.7 Trade Log

A simple table where the user logs entries manually: ticker, date, entry price, size, stop, notes. The dashboard reads this and shows:
- Open trades with live unrealised P&L
- Closed trades with win/loss and R:R achieved
- Running stats: win rate, average R:R, largest drawdown
This turns the tool from a screener into a lightweight trading journal.

---

## 6. Data Sources (Recommended Stack)

| Data Type | Recommended Source | Notes |
|---|---|---|
| OHLCV history | Twelve Data or Polygon.io | Polygon has better free tier reliability |
| Live quotes | Finnhub or Yahoo Finance scrape | Finnhub is cleaner |
| Fundamentals | Finnhub or Financial Modeling Prep | FMP has better free-tier fundamentals |
| News sentiment | Finnhub News API | Already in the stack |
| Options flow | Unusual Whales, Market Chameleon | Paid; add in v2 |
| Insider transactions | Finnhub or OpenInsider | Free |
| Economic calendar | Finnhub or TradingEconomics | For macro context panel |
| Sector ETF data | Already in stack (XLK, XLF, etc.) | |

---

## 7. Technical Direction

### Architecture Options (in order of preference)

**Option A — Enhanced static (no backend)**
Extend the current approach. Add a `workers/` directory with Web Workers for heavy indicator math (keeps UI unblocked). Add IndexedDB for larger historical storage (localStorage is limited to ~5MB). Add a Service Worker for offline caching. This is the fastest path and requires no server.

**Option B — Thin backend (recommended for v2)**
A minimal Node.js / Deno / Python FastAPI backend that:
- Handles API key storage server-side (removes exposure risk of localStorage)
- Caches data server-side (dramatically faster page loads for multiple users or devices)
- Runs nightly OHLCV refreshes so the page loads instantly with fresh data
- Enables multi-device sync
Frontend remains React or Svelte SPA. Backend is a single lightweight API layer, deployable on Railway, Fly.io, or Vercel Edge Functions.

**Option C — Full SaaS**
Multi-user, auth, persistent trade log, mobile app. Out of scope for a personal tool; only relevant if this becomes a product.

### Frontend Stack (if rebuilding)

- **Svelte** or **React + Vite** — both are easy to deploy statically
- **shadcn/ui** or **Radix UI** for accessible, dark-mode-native components
- **TanStack Table** for the sortable/filterable data tables
- **Lightweight Charts** (keep — it's excellent for financial charts)
- **Tailwind CSS** (keep — good fit for dense dark UIs)

### State Management

Move from `localStorage` + module globals to a proper state store (Zustand for React, Svelte stores for Svelte). Separates data, UI state, and user preferences cleanly.

---

## 8. Scoring System — Improvements

### Current Weaknesses
- Weights are heuristic; never validated against actual outcomes
- A score of 82 today means the same as 82 three months ago, even if market conditions changed
- Fundamentals and technicals are weighted equally regardless of market regime

### Recommended Improvements

1. **Regime-aware scoring:** When VIX > 25 (high fear), reduce weight on momentum signals and increase weight on value/fundamental signals. When VIX < 15 (low fear), momentum signals are more reliable.

2. **Relative scoring:** Instead of absolute thresholds, score each ticker relative to its own recent history. "RSI at 38 for TSLA" means something different than "RSI at 38 for KO." Use z-scores relative to a 90-day rolling window.

3. **Score velocity:** Show if the score is rising or falling. A stock at 70 and climbing is a better setup than one at 70 and declining. Add a 3-day score delta to the table.

4. **Confidence display:** Show how many of the ~15 criteria had valid data. "Score: 78 (11/15 factors)" is more honest than "Score: 78."

5. **Setup quality rating:** Separate the score (how bullish is the data) from the setup quality (how much do the signals agree). High score with low agreement = noisy setup. High score with high agreement = clean setup.

---

## 9. UX / Design Improvements

### Information Hierarchy
The current dashboard treats all data equally. Priority should be:
1. **Header:** Market context (VIX, Fear/Greed, SPY trend) — sets the daily mindset
2. **Watchlist table:** Score, trend, earnings warning — the 5-second scan
3. **Entry panel:** Pre-trade checklist, position size, risk snapshot — the 2-minute analysis
4. **Chart:** Visual confirmation — used last, not first
5. **Detail table:** Reference lookup — not the primary reading flow

### Mobile Experience
- Morning scan mode: Single-column card layout showing ticker · score · setup · earnings countdown. Designed to be read with one thumb.
- Swipe left on a card to add to a "watch closely today" list
- No charts on mobile by default (too slow, too small) — tap to load on demand

### Colour Language (consistent system)
| Meaning | Color |
|---|---|
| Strong bullish / confirmed | Solid green (#22c55e) |
| Weak bullish / potential | Green outline only |
| Neutral | Gray (#94a3b8) |
| Weak bearish / caution | Orange outline |
| Strong bearish / confirmed | Solid red (#ef4444) |
| Hard blocker / danger | Red background, white text |
| Data missing / uncertain | Muted purple (#7c3aed) |

All status badges should use this system. No ad-hoc colors for individual components.

### Cognitive Load Reduction
- Tooltips should explain *so what*, not just *what it is*. "RSI: 38" tooltip should say "Approaching oversold — historically a favorable entry zone. Watch for reversal confirmation." Not just "Relative Strength Index, 14-day."
- Scores should be accompanied by one-line plain English interpretations beneath them.
- The detail table should be hidden by default and expandable — it's reference data, not a primary reading path.

---

## 10. User Guidance Philosophy

### The "Slow Down" Principle

The dashboard should be slightly inconvenient for impulsive entries. Design choices that reinforce this:
- The pre-buy checklist (Section 4.4) must be completed before entry levels are shown
- Hard warnings (earnings < 7 days, VIX > 30) should require a visible click to dismiss — not just a badge
- Position size should always be shown *before* take-profit, not after
- Downside dollar amount (not just %) should be displayed prominently

### Advice Framing

Every recommendation should be phrased in terms of the user's downside first:
- ❌ "Target: $185 (+12%)"
- ✅ "Risk $X (2.1%) to target $185 (+12%) — 1:5.7 risk/reward"

Entry prices should always show the stop-loss level alongside them. A price without a stop is not an entry plan.

### What the Tool Should Never Do

- Never suggest a specific dollar amount to invest (legal liability; that's financial advice)
- Never say a trade "will" do anything — only that conditions "favour" or "support" a direction
- Never show a score without explaining the top 3 factors driving it
- Never hide a risk warning behind a secondary click path

---

## 11. Success Metrics (for a personal tool)

- Time to first decision (opening the dashboard to identifying the day's actionable tickers): < 2 minutes
- False positive rate (setups flagged LONG that go down > 5% within 10 days): tracked in trade log
- Average R:R achieved on logged trades vs. R:R shown at entry: tracked in trade log
- Page load time (first meaningful paint): < 3 seconds on a fresh load
- Mobile usability: full morning scan completable on a phone in < 90 seconds

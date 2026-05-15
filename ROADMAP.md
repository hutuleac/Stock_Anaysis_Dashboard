# Roadmap — Indicators & Features

Target trade style: medium-term positions (2 months – 1 year), large cap growth + mid/small cap.
Two planned views: **Momentum / Trend Following** and **Pullback / Mean Reversion**.

---

## Priority queue

### 1. EMA Stack signal
- Condition: price > EMA20 > EMA50 > EMA200 = full bull alignment
- All four values already computed in `indicators.js` — just needs a combined chip display
- Output: `BULL STACK` / `PARTIAL` / `BROKEN` badge on each ticker row
- Zero new API calls. ~1 hour to implement.

### 2. ATR-based stop + Risk/Reward
- ATR already computed in `computeWeeklyTrend` (indicators.js) but never surfaced to UI
- Formula: suggested stop = entry − 2×ATR; R:R = (analyst target − entry) / (entry − stop)
- Surface in Pullback view and EntryPanel
- Feeds into position sizing once account size is stored in Settings

### 3. Relative Strength vs SPY (1M / 3M)
- Stock's return vs SPY over 1 and 3 months
- SPY quote already fetched in market context — need to track its 1M/3M return
- Core signal for trend following: outperforming the index = institutional buying
- Compute from existing candle data, no new API calls

### 4. OBV (On-Balance Volume)
- Free computation from existing OHLCV candle data
- OBV rising while price consolidates = accumulation
- OBV falling while price holds = distribution warning
- Add to `computeIndicatorsFromCandles` in `indicators.js`

### 5. BB + RSI combo signal
- RSI < 35 AND price near BB lower band = high-conviction oversold entry
- Both values already computed — needs a combined signal field in `indicators.js`
- Show as a single "Oversold Confluence" badge in Pullback view
- No new data required

### 6. Volume dry-up detection
- 5-day avg volume < 50% of 20-day avg = selling exhaustion
- Price holding + volume collapsing = classic mean-reversion setup
- Compute from existing candle `v` array

### 7. Rate of Change (ROC 20d / 60d)
- Shows momentum acceleration/deceleration
- 20d ROC rising while 60d is flat = early trend emergence
- Compute from candle closes in `indicators.js`, zero API cost

### 8. 52-week high proximity alert
- < 3% from 52-week high = breakout watch signal
- Already display 52w bar — add a flag/chip when within striking distance
- Combine with volume confirmation (above-average volume = stronger signal)

### 9. Short interest
- Finnhub endpoint: `/stock/short-interest`
- High short % + improving fundamentals = potential squeeze setup
- Especially relevant for mid/small cap picks
- Add to `finnhub.svelte.js`, display alongside insider transactions

### 10. Revenue growth YoY + P/S ratio
- Revenue growth already available in Finnhub metrics — just not displayed
- P/S = market cap / revenue (both available)
- Critical for growth stocks where P/E is misleading or negative
- Add to FundamentalsBar

### 11. PEG ratio
- PEG = P/E ÷ EPS growth rate
- Both inputs already fetched from Finnhub metrics
- PEG < 1 = undervalued relative to growth; > 2 = expensive
- Compute client-side, display in FundamentalsBar alongside P/E

### 12. Beta
- Available in Finnhub metrics (`beta`)
- Feeds volatility-adjusted position sizing suggestion
- High beta + wide ATR = smaller position; surface a simple size suggestion
- Requires one-time account size input in Settings

### 13. Swing low support levels
- Auto-detect last 3 significant lows from daily candle data
- Classic mean-reversion entry anchor: price returning to prior support
- Compute in `indicators.js` from existing candle array

---

## Two-view architecture

**Option A — Toggle on WatchlistTable columns**
- Momentum columns: EMA stack, RS vs SPY, OBV trend, ROC, proximity to 52w high
- Pullback columns: BB+RSI combo, volume dry-up, ATR stop suggestion, distance from recent high

**Option B — Separate tabs in detail panel (FundamentalsBar area)**
- "Trend Setup" tab: RS vs SPY, OBV, ROC 20d/60d, EMA stack, breakout proximity
- "Pullback Setup" tab: BB+RSI confluence, ATR stop/target, swing lows, volume dry-up

Option B is preferred — keeps the watchlist table scannable and puts depth in the detail view.

---

## Computation cost summary

| Feature | API calls | Source |
|---|---|---|
| EMA stack | 0 | existing `indicators.js` |
| ATR stop / R:R | 0 | existing `computeWeeklyTrend` |
| Relative strength vs SPY | 0 | existing candles + SPY quote |
| OBV | 0 | existing candle `v` array |
| BB+RSI combo | 0 | existing `indicators.js` |
| Volume dry-up | 0 | existing candle `v` array |
| ROC 20d/60d | 0 | existing candle closes |
| 52w high proximity | 0 | existing Finnhub metrics |
| Short interest | +1 endpoint/ticker | Finnhub `/stock/short-interest` |
| Revenue growth + P/S | 0 | existing Finnhub metrics |
| PEG ratio | 0 | existing Finnhub metrics |
| Beta | 0 | existing Finnhub metrics |
| Swing low support | 0 | existing candle array |

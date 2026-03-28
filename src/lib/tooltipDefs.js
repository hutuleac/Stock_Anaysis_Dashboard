// Rich tooltip definitions for every indicator in the dashboard.
// Each entry: { title, subtitle, category, description, levels[], why }
// Pass to use:tooltip action — either static or wrapped in () => ({ ...def, current: {...} })

const C = {
  green:  '#22c55e',
  red:    '#ef4444',
  amber:  '#f59e0b',
  orange: '#f97316',
  muted:  '#6b7280',
  dim:    '#9ca3af',
  white:  '#f3f4f6',
};

export const TIPS = {

  rsi: {
    title: 'RSI(14)',
    subtitle: 'Relative Strength Index',
    category: 'Momentum',
    description: 'Compares average gains to average losses over 14 periods. Measures the speed and magnitude of price changes — showing whether a stock is being overbought or oversold.',
    levels: [
      { range: '< 30',  label: 'Oversold',   color: C.green,  desc: 'Selling exhausted — potential reversal zone. Wait for confirmation candle before entering.' },
      { range: '30–45', label: 'Mild Weak',  color: C.amber,  desc: 'Below-average momentum. Caution zone, no strong directional edge.' },
      { range: '45–55', label: 'Neutral',    color: C.dim,    desc: 'Balanced momentum — neither bulls nor bears dominate.' },
      { range: '55–70', label: 'Healthy',    color: C.green,  desc: 'Above-average momentum, uptrend likely intact. Good zone to stay long.' },
      { range: '> 70',  label: 'Overbought', color: C.red,    desc: 'Buying pressure extended — risk of pullback. Tighten stop, avoid chasing.' },
    ],
    why: 'One of the most reliable momentum gauges. Best as a mean-reversion signal at extremes (<30/>70), and as a trend health check in the 40–60 range.',
  },

  macd: {
    title: 'MACD(12,26,9)',
    subtitle: 'Moving Average Convergence / Divergence',
    category: 'Momentum',
    description: 'Measures the relationship between two EMAs. The histogram shows whether momentum is increasing (growing bars) or fading (shrinking bars). A crossover marks a momentum shift.',
    levels: [
      { range: 'Bull cross',   label: 'Buy signal',    color: C.green,  desc: 'MACD just crossed above signal — fresh momentum shift, strongest signal available.' },
      { range: '> 0 growing',  label: 'Accelerating',  color: C.green,  desc: 'Histogram rising above zero — trend has fuel. Good time to stay long.' },
      { range: '> 0 fading',   label: 'Decelerating',  color: C.amber,  desc: 'Positive but shrinking — watch for imminent crossover and exit risk.' },
      { range: 'Bear cross',   label: 'Sell signal',   color: C.red,    desc: 'MACD just crossed below signal — momentum turned negative. Consider exit or hedge.' },
      { range: '< 0',          label: 'Bearish',       color: C.red,    desc: 'Below zero — downside momentum in control. Avoid new longs.' },
    ],
    why: 'Captures both trend direction and momentum velocity. Crossovers near zero are most reliable. MACD divergences (price up, MACD down) can signal reversals early.',
  },

  adx: {
    title: 'ADX(14)',
    subtitle: 'Average Directional Index',
    category: 'Trend Strength',
    description: 'Measures the STRENGTH of the prevailing trend — not its direction. A rising ADX means the trend is strengthening. A falling ADX means momentum is fading regardless of direction.',
    levels: [
      { range: '< 20',  label: 'Ranging',  color: C.muted,  desc: 'No trend — choppy, mean-reverting conditions. Momentum signals unreliable here.' },
      { range: '20–25', label: 'Weak',     color: C.amber,  desc: 'Trend emerging but unconfirmed. Exercise caution on directional trades.' },
      { range: '25–35', label: 'Trending', color: C.green,  desc: 'A real trend is in place. Directional signals carry edge.' },
      { range: '> 35',  label: 'Strong',   color: C.green,  desc: 'Strong trend — momentum trades work well. Ride it until slope flattens.' },
      { range: '> 50',  label: 'Extreme',  color: C.amber,  desc: 'Potentially overextended. High ADX often precedes exhaustion — watch for reversal.' },
    ],
    why: 'ADX filters noise from other signals. RSI below 30 during ADX>25 downtrend means more selling, not a reversal. Always validate RSI/MACD signals against ADX context.',
  },

  stoch: {
    title: 'Stochastic(14,3)',
    subtitle: '%K and %D Oscillator',
    category: 'Momentum',
    description: 'Shows where the current close sits relative to the high-low range of the last 14 periods. %K is the raw reading; %D is the 3-period smoothed version. Crossovers generate entry/exit signals.',
    levels: [
      { range: '< 20',  label: 'Oversold',    color: C.green,  desc: 'Close near the bottom of recent range — exhaustion zone. Bull cross below 20 is high-conviction.' },
      { range: '20–35', label: 'Approaching', color: C.amber,  desc: 'Building toward oversold. Watch for %K/%D cross signal.' },
      { range: '35–65', label: 'Neutral',     color: C.dim,    desc: 'No meaningful extreme. Crossovers in this zone are lower confidence.' },
      { range: '65–80', label: 'Elevated',    color: C.amber,  desc: 'Near overbought — watch for %K rolling over as a sell signal.' },
      { range: '> 80',  label: 'Overbought',  color: C.red,    desc: 'Close near top of recent range — selling zone. Bear cross above 80 is high-conviction.' },
    ],
    why: 'More sensitive than RSI — turns faster and works better on shorter timeframes. Best used for timing entries after RSI confirms the broader setup.',
  },

  ema50: {
    title: 'EMA(50)',
    subtitle: '50-Period Exponential Moving Average',
    category: 'Trend',
    description: 'Tracks the medium-term trend over ~10 weeks of trading. Acts as a support/resistance level that institutions frequently reference. Price distance shows how extended a move is.',
    levels: [
      { range: 'Price > EMA',  label: 'Above',    color: C.green,  desc: 'Bullish — medium-term trend is up. EMA50 acts as dynamic support on pullbacks.' },
      { range: '< 5% below',   label: 'Near',     color: C.amber,  desc: 'Testing the EMA — critical level. Watch for bounce confirmation or breakdown.' },
      { range: 'Price < EMA',  label: 'Below',    color: C.red,    desc: 'Bearish — medium-term trend is down. EMA50 acts as resistance on rallies.' },
      { range: '> 10% above',  label: 'Extended', color: C.amber,  desc: 'Price stretched above EMA — elevated mean-reversion pullback risk.' },
    ],
    why: 'The 50 EMA is watched by every institutional trader. When price tests and respects it as support through multiple touches, that confirms a real uptrend structure.',
  },

  ema200: {
    title: 'EMA(200)',
    subtitle: '200-Period Exponential Moving Average',
    category: 'Trend',
    description: 'The master long-term trend filter. Separates bull from bear market regimes. Institutions use it to determine whether to run long or short book on a stock.',
    levels: [
      { range: 'Price > EMA',  label: 'Bull zone',  color: C.green,  desc: 'Long-term uptrend intact. Dip buyers are active. Bias stays long until proven otherwise.' },
      { range: '±3% of EMA',   label: 'At key level', color: C.amber,  desc: 'Riding the critical threshold — golden cross or death cross may be imminent.' },
      { range: 'Price < EMA',  label: 'Bear zone',  color: C.red,    desc: 'Long-term downtrend. Rallies face stiff resistance. Institutional money is underweight.' },
    ],
    why: 'The single most-watched level on any chart. A stock under EMA200 typically underperforms the market. Golden/death cross crossovers trigger massive institutional rebalancing.',
  },

  bb: {
    title: 'Bollinger Band Position',
    subtitle: '20-Period Bands, ±2 Std Deviations',
    category: 'Volatility',
    description: 'Shows where price sits within its statistical envelope. Bands expand during volatile periods and contract during quiet ones. Position % = how far from the lower band to upper band.',
    levels: [
      { range: '0–15%',   label: 'Near lower',  color: C.green,  desc: 'Statistically stretched to downside. Mean reversion toward midline is high probability.' },
      { range: '15–40%',  label: 'Lower half',  color: C.amber,  desc: 'Below midline — mild weakness but no extreme.' },
      { range: '40–60%',  label: 'Mid-band',    color: C.dim,    desc: 'At the 20-EMA midline — neutral. Trend continuation zone.' },
      { range: '60–85%',  label: 'Upper half',  color: C.amber,  desc: 'Above midline — mild strength.' },
      { range: '85–100%', label: 'Near upper',  color: C.red,    desc: 'Statistically stretched to upside. Pullback or consolidation likely.' },
    ],
    why: 'A consistent, purely statistical way to identify stretched prices. Best combined with RSI: near lower band + RSI oversold = strong mean-reversion setup.',
  },

  volume: {
    title: 'Volume Ratio',
    subtitle: "Today's Volume vs 30-Day Average",
    category: 'Confirmation',
    description: 'Compares current session volume to the 30-day average. High relative volume validates a price move — it means institutional money is participating. Low volume moves are suspect.',
    levels: [
      { range: '< 0.5×',  label: 'Very low',   color: C.muted,  desc: 'Quiet session — moves lack conviction. Breakouts on this volume have low follow-through.' },
      { range: '0.5–1×',  label: 'Below avg',  color: C.dim,    desc: 'Subdued participation. Treat signals with caution.' },
      { range: '1–1.5×',  label: 'Normal',     color: C.dim,    desc: 'Standard volume — normal conviction level.' },
      { range: '1.5–2×',  label: 'Above avg',  color: C.amber,  desc: 'Above-average interest — elevated conviction. Signals more reliable.' },
      { range: '> 2×',    label: 'Surge',      color: C.green,  desc: 'Volume surge — institutional activity likely. Breakouts at 2×+ have 3× the follow-through probability.' },
    ],
    why: 'Price moves on high volume are far more reliable than low-volume moves. Volume is the lie detector of technical analysis — it tells you if institutional money believes the move.',
  },

  vix: {
    title: 'VIX — Volatility Index',
    subtitle: 'CBOE Fear Gauge',
    category: 'Market Context',
    description: "Measures the market's expected 30-day volatility derived from S&P 500 options pricing. High VIX = fear and uncertainty. Low VIX = complacency and calm conditions.",
    levels: [
      { range: '< 15',  label: 'Calm',     color: C.green,  desc: 'Market is complacent — low vol environment ideal for trend-following strategies.' },
      { range: '15–20', label: 'Normal',   color: C.dim,    desc: 'Standard volatility — trade your normal plan without size adjustment.' },
      { range: '20–25', label: 'Elevated', color: C.amber,  desc: 'Uncertainty rising — consider reducing position size 10–20%, tighten stops.' },
      { range: '25–35', label: 'High',     color: C.orange, desc: 'High fear — wide stops needed, many setups fail. Consider 30–50% smaller sizing.' },
      { range: '> 35',  label: 'Extreme',  color: C.red,    desc: 'Panic conditions — cash is a position. Historically signals capitulation and reversal within weeks.' },
    ],
    why: "The market's fear thermometer. Above VIX 30, standard momentum signals break down. Below 15, mean-reversion strategies underperform trend-following. Adjust your strategy to the regime.",
  },

  spyTrend: {
    title: 'SPY Trend',
    subtitle: 'S&P 500 ETF Daily Change',
    category: 'Market Context',
    description: '80% of stocks move with the market — trading against the SPY trend is swimming upstream. The broad market tide determines how much tailwind or headwind your setups face.',
    levels: [
      { range: '> +0.5%', label: 'Bullish', color: C.green,  desc: 'Market tailwind — long positions have systemic support. Good day for new entries.' },
      { range: '±0.5%',   label: 'Neutral', color: C.dim,    desc: 'No directional conviction from market. Stock-specific factors dominate.' },
      { range: '< -0.5%', label: 'Bearish', color: C.red,    desc: 'Market headwind — long entries face systemic selling pressure. Wait or trade short side.' },
    ],
    why: 'The single biggest factor in daily stock movement is broad market direction. Even the best fundamental setup can get dragged down 2% in a 1.5% down market day.',
  },

  fearGreed: {
    title: 'Fear & Greed Index',
    subtitle: 'CNN Market Sentiment Score (0–100)',
    category: 'Market Context',
    description: 'Composite of 7 market indicators: price momentum, breadth, put/call ratio, junk bond demand, safe haven demand, volatility, and stock strength. A contrarian indicator — extreme readings precede reversals.',
    levels: [
      { range: '0–25',   label: 'Extreme Fear',  color: C.red,    desc: 'Capitulation zone — historically a contrarian buy signal. Market pricing in too much bad news.' },
      { range: '25–40',  label: 'Fear',          color: C.orange, desc: 'Cautious sentiment — market pricing risk premium. Good backdrop for bottom-fishing.' },
      { range: '40–60',  label: 'Neutral',       color: C.dim,    desc: 'Balanced sentiment — no extreme signal. Trade individual setups on their merits.' },
      { range: '60–75',  label: 'Greed',         color: C.amber,  desc: 'Optimism rising — late-cycle thinking. Be selective, reduce broad beta exposure.' },
      { range: '75–100', label: 'Extreme Greed', color: C.red,    desc: 'Euphoria — historically precedes corrections. Contrarian sell signal for broad exposure.' },
    ],
    why: 'Be fearful when others are greedy; greedy when others are fearful. Extreme Fear readings below 20 have historically delivered above-average 6-month forward returns.',
  },

  conviction: {
    title: 'Conviction Score',
    subtitle: 'Signal Agreement %',
    category: 'Composite',
    description: 'Measures what percentage of all scored signals agree with the overall directional bias. HIGH means signals are strongly aligned; MIXED means signals are contradicting each other.',
    levels: [
      { range: '> 75%',  label: 'HIGH',     color: C.green,  desc: 'Strong signal agreement — trade the thesis with full intended position size.' },
      { range: '55–75%', label: 'MODERATE', color: C.amber,  desc: 'Most signals agree — solid setup but not unanimous. Size 60–80% of normal.' },
      { range: '40–55%', label: 'LOW',      color: C.orange, desc: 'Weak agreement — fragile thesis. Consider 50% position or wait for clarity.' },
      { range: '< 40%',  label: 'MIXED',    color: C.red,    desc: 'Conflicting signals — no reliable edge. Best to stay out or hedge existing position.' },
    ],
    why: "A high-scoring stock with MIXED conviction is dangerous — signals don't agree on direction. A moderate-scoring stock with HIGH conviction may be safer than it looks numerically.",
  },

  scoreZ: {
    title: 'Score Z-Score',
    subtitle: 'Current Score vs 90-Day History',
    category: 'Composite',
    description: 'How many standard deviations the current composite score sits above or below its own 90-day average. Tells you if this stock is unusually strong or weak relative to its recent baseline.',
    levels: [
      { range: '> +2',    label: 'Extended',    color: C.amber,  desc: 'Score unusually high vs recent history — may be priced for perfection, risk of mean-reversion.' },
      { range: '+1 to +2',label: 'Above avg',   color: C.green,  desc: 'Score above its own average — improving setup, accelerating thesis.' },
      { range: '±1',      label: 'In range',    color: C.dim,    desc: 'Score within normal variance — nothing unusual about the current reading.' },
      { range: '-1 to -2',label: 'Below avg',   color: C.orange, desc: 'Score deteriorating vs its own history — thesis weakening.' },
      { range: '< -2',    label: 'Depressed',   color: C.red,    desc: 'Score at a historical low — strongly underperforming its own baseline.' },
    ],
    why: "Context-aware scoring. A score of 65 is good in isolation, but if this stock normally scores 72, it's actually deteriorating. Z-score detects that drift before it becomes obvious.",
  },

  rsiZ: {
    title: 'RSI Z-Score',
    subtitle: 'RSI vs Its 90-Day Baseline',
    category: 'Momentum',
    description: "Normalizes RSI against the stock's own recent RSI history. A stock that normally trades at RSI 60 showing RSI 40 is far more oversold than a stock that always trades at 40.",
    levels: [
      { range: '> +2',    label: 'Unusually High',   color: C.red,    desc: "RSI far above its own baseline — momentum extended vs this stock's norm." },
      { range: '+1 to +2',label: 'Above baseline',   color: C.amber,  desc: "RSI above average for this stock — bullish momentum vs its own history." },
      { range: '±1',      label: 'Normal',            color: C.dim,    desc: "RSI within normal range for this stock. No unusual signal." },
      { range: '-1 to -2',label: 'Below baseline',   color: C.amber,  desc: "RSI below average — approaching oversold vs this stock's own history." },
      { range: '< -2',    label: 'Deeply Depressed', color: C.green,  desc: "RSI historically low for this stock — strong relative oversold signal." },
    ],
    why: 'Stock-relative RSI is more accurate than absolute RSI. A defensive stock like JNJ normally trades at RSI 45 — seeing it at 38 is significant oversold. Absolute RSI would miss this.',
  },

  weeklyTrend: {
    title: 'Weekly Trend',
    subtitle: 'Multi-Timeframe Higher-TF Bias',
    category: 'Multi-Timeframe',
    description: 'Aggregates weekly candle signals — EMA10 position, EMA slope, RSI, and MACD — to determine the higher-timeframe trend. Aligning daily setups with weekly trend dramatically improves win rate.',
    levels: [
      { range: 'UP',      label: 'Uptrend',   color: C.green, desc: 'Price above W.EMA10, EMA rising, W.RSI > 55, W.MACD positive — weekly tailwind.' },
      { range: 'NEUTRAL', label: 'Neutral',   color: C.dim,   desc: 'Mixed weekly signals — no clear higher-timeframe bias.' },
      { range: 'DOWN',    label: 'Downtrend', color: C.red,   desc: 'Price below W.EMA10, EMA declining, W.RSI < 45 — weekly headwind on longs.' },
    ],
    why: 'The weekly timeframe filters out daily noise. A bearish daily setup in a weekly uptrend should be sized down. A bullish daily setup with weekly downtrend is swimming upstream — high-risk.',
  },

  tfsScore: {
    title: 'T / F / S Sub-Scores',
    subtitle: 'Technical · Fundamental · Sentiment',
    category: 'Composite',
    description: 'The three pillars of the composite score. T scores price action and momentum signals. F scores valuation and earnings quality. S scores insider activity, analyst targets, and positioning. Weights shown are regime-adjusted when VIX is elevated.',
    levels: [
      { range: '> 60',  label: 'Bullish',  color: C.green, desc: 'This pillar is sending a bullish signal — contributes positively to overall score.' },
      { range: '40–60', label: 'Neutral',  color: C.dim,   desc: 'Neutral pillar — neither confirming nor contradicting the thesis.' },
      { range: '< 40',  label: 'Bearish',  color: C.red,   desc: 'Pillar is signaling caution — drag on overall score.' },
    ],
    why: 'Pillar breakdown tells you WHY the score is what it is. T=70/F=40/S=30 is momentum-only speculation. T=55/F=65/S=60 is a fundamentally sound setup. Know the difference.',
  },

  pe: {
    title: 'P/E Ratio',
    subtitle: 'Price-to-Earnings (Normalized TTM)',
    category: 'Valuation',
    description: 'How much investors pay for each $1 of earnings. Lower P/E may indicate undervaluation; higher P/E implies strong growth expectations are priced in. Always compare to sector peers.',
    levels: [
      { range: '< 10',  label: 'Deep Value', color: C.green,  desc: 'Deeply discounted vs earnings — possible value trap or genuine bargain. Investigate catalyst.' },
      { range: '10–25', label: 'Fair',       color: C.green,  desc: 'Reasonable valuation for most sectors. Neither cheap nor expensive.' },
      { range: '25–40', label: 'Premium',    color: C.amber,  desc: 'Market paying up for growth. Justified if EPS growth > 15%.' },
      { range: '40–60', label: 'Expensive',  color: C.orange, desc: 'High expectations priced in — vulnerable to any earnings miss or guidance cut.' },
      { range: '> 60',  label: 'Extreme',    color: C.red,    desc: 'Valuation stretched — needs exceptional sustained growth. Maximum downside if thesis breaks.' },
    ],
    why: 'Valuation matters for sizing downside risk. The same momentum setup in a P/E 60 stock vs a P/E 15 stock has dramatically different downside if the thesis breaks.',
  },

  epsGrowth: {
    title: 'EPS Growth',
    subtitle: 'Earnings Per Share YoY Growth Rate',
    category: 'Fundamental',
    description: 'Year-over-year EPS growth rate. Measures whether the company is actually expanding earnings. The most important single fundamental driver of stock price over multi-year periods.',
    levels: [
      { range: '> 25%',  label: 'Hyper-growth',  color: C.green,  desc: 'Exceptional earnings expansion — justifies premium valuation and strong price momentum.' },
      { range: '10–25%', label: 'Strong',         color: C.green,  desc: 'Healthy double-digit growth — solid fundamental backdrop for long positions.' },
      { range: '5–10%',  label: 'Moderate',       color: C.amber,  desc: 'Growing but modestly — needs reasonable valuation to be attractive.' },
      { range: '0–5%',   label: 'Weak',           color: C.orange, desc: 'Barely growing — fundamental driver absent. Setup relies purely on price action.' },
      { range: '< 0%',   label: 'Declining',      color: C.red,    desc: 'EPS shrinking — fundamental headwind for price appreciation.' },
    ],
    why: 'Companies that grow EPS consistently outperform over time. RSI 70 + 30% EPS growth is fundamentally justified. The same RSI with -5% EPS growth is momentum speculation — size accordingly.',
  },

  mktCap: {
    title: 'Market Cap',
    subtitle: 'Total Equity Valuation',
    category: 'Fundamental',
    description: "Total market value of all outstanding shares. Size matters for liquidity, volatility profile, and how much institutional participation is driving price action.",
    levels: [
      { range: '< $2B',    label: 'Small Cap',  color: C.amber, desc: 'Higher volatility, less analyst coverage, thinner liquidity. Higher risk and reward.' },
      { range: '$2–10B',   label: 'Mid Cap',    color: C.green, desc: 'Sweet spot of growth potential + institutional participation. Often best risk/reward ratio.' },
      { range: '$10–100B', label: 'Large Cap',  color: C.dim,   desc: 'Institutional heavyweight — slower-moving, high liquidity, more reliable technical signals.' },
      { range: '> $100B',  label: 'Mega Cap',   color: C.dim,   desc: 'Market-moving stocks. Highly liquid and covered. Index-level risk in a single name.' },
    ],
    why: 'Small caps move faster with more upside but also more fake-outs. Large caps have cleaner technicals due to institutional positioning and higher analyst scrutiny.',
  },

  analystTarget: {
    title: 'Analyst Price Target',
    subtitle: 'Consensus Mean Target (12-Month)',
    category: 'Sentiment',
    description: 'Average analyst price target for the next 12 months. Premium to current price = expected upside per Wall Street consensus. Meaningful when there are 3+ analysts covering the stock.',
    levels: [
      { range: '> +20%',  label: 'Strong upside',    color: C.green,  desc: 'Analysts see significant runway — strong buy-side backdrop for the thesis.' },
      { range: '+5–20%',  label: 'Moderate upside',  color: C.amber,  desc: 'Analysts expect moderate gains. Consistent with a reasonable long thesis.' },
      { range: '±5%',     label: 'Near target',      color: C.dim,    desc: 'Price approaching analyst targets — upside limited per consensus.' },
      { range: '< -5%',   label: 'Above target',     color: C.red,    desc: 'Priced above consensus — market more bullish than analysts. Contrarian risk.' },
    ],
    why: 'Analyst targets are backward-looking and slow to update, but extreme deviations signal sentiment extremes. Being 30%+ above consensus has historically predicted underperformance.',
  },

  insider: {
    title: 'Insider Activity (90d)',
    subtitle: 'Net Share Buys vs Sells',
    category: 'Sentiment',
    description: 'Net shares bought minus sold by corporate insiders over 90 days. Insider buying is highly informative — executives risk their own capital. Selling is less meaningful (diversification, taxes).',
    levels: [
      { range: 'Net buy (large)',  label: 'Bullish',  color: C.green,  desc: 'Insiders aggressively buying — the people who know the company best are backing it with their money.' },
      { range: 'Net buy (small)',  label: 'Mild buy', color: C.amber,  desc: 'Some insider buying — modest positive signal.' },
      { range: 'Neutral',          label: 'Flat',     color: C.dim,    desc: 'No meaningful activity. Neutral signal.' },
      { range: 'Net sell (small)', label: 'Routine',  color: C.dim,    desc: 'Modest selling — often diversification or tax-driven. Not necessarily bearish.' },
      { range: 'Net sell (large)', label: 'Bearish',  color: C.red,    desc: 'Heavy insider selling across multiple executives — take it seriously.' },
    ],
    why: 'Insider buying is one of the strongest forward-looking signals in finance. Academic research consistently shows stocks with high insider buying outperform over 6–12 months.',
  },

  score: {
    title: 'Composite Score',
    subtitle: 'Weighted Technical + Fundamental + Sentiment',
    category: 'Composite',
    description: 'Combines technical (momentum, trend), fundamental (valuation, earnings), and sentiment (insider, analyst) signals into a single 0–100 score. Weights shift in high-VIX regimes to reduce technical exposure.',
    levels: [
      { range: '70–100', label: 'Bullish',  color: C.green,  desc: 'Strong directional thesis with broad signal support. Size up with conviction.' },
      { range: '58–70',  label: 'Positive', color: C.amber,  desc: 'More bullish signals than bearish — favorable setup, not unanimous.' },
      { range: '42–58',  label: 'Neutral',  color: C.dim,    desc: 'No clear edge. Mixed signals. Best to wait for a cleaner setup or catalyst.' },
      { range: '30–42',  label: 'Negative', color: C.orange, desc: 'More bearish signals — unfavorable backdrop for longs.' },
      { range: '0–30',   label: 'Bearish',  color: C.red,    desc: 'Broad signal weakness — high probability of continued underperformance.' },
    ],
    why: 'A single number to cut through the noise. Use it for screening and sorting, not as a standalone trade signal. Always combine with conviction %, pillar breakdown, and market context.',
  },

};

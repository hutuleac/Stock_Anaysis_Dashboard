// 9-signal scoring engine — Technical 35% / Fundamental 45% / Sentiment 20%
// Missing data → signal neutral (0.5), not penalised. Factor count tracks completeness.
// Regime-aware: VIX > 25 shifts weight toward fundamentals.
// Market-context penalties: SPY downtrend (-20% pull toward neutral) + F&G adjustments.

// ─── MARKET CONTEXT (module-level, set once per refresh) ──────────────────────
// Consumed by computeScore() so all callers get regime-aware scores automatically.

let _marketContext = null;

export function setMarketContext(ctx) { _marketContext = ctx; }
export function getMarketContext()    { return _marketContext; }

// ─── NEWS SENTIMENT ────────────────────────────────────────────────────────────

const BULLISH_WORDS = ['beat', 'beats', 'raised', 'upgrade', 'upgraded', 'buy', 'strong', 'record', 'growth', 'profit', 'surge', 'rally', 'bullish', 'outperform', 'exceed', 'exceeded', 'positive', 'boost'];
const BEARISH_WORDS = ['miss', 'misses', 'missed', 'cut', 'downgrade', 'downgraded', 'sell', 'weak', 'loss', 'decline', 'fall', 'drop', 'bearish', 'underperform', 'concern', 'warning', 'risk', 'negative', 'layoff', 'layoffs'];

export function scoreNewsHeadlines(newsData) {
  const headlines = newsData?.data?.slice?.(0, 5) || [];
  if (!headlines.length) return null;

  let score = 0;
  for (const item of headlines) {
    const text = ((item.headline || '') + ' ' + (item.summary || '')).toLowerCase();
    const bull = BULLISH_WORDS.filter(w => text.includes(w)).length;
    const bear = BEARISH_WORDS.filter(w => text.includes(w)).length;
    score += (bull - bear);
  }

  // Normalise to 0–1 (clamp ±3 total swing)
  return Math.max(0, Math.min(1, (score + 3) / 6));
}

// ─── MAIN SCORING ENGINE ───────────────────────────────────────────────────────
// marketContext: { vixPrice, spyDowntrend, fearGreedValue } — all optional.
// Defaults to module-level _marketContext (set via setMarketContext on each refresh).

export function computeScore(tickerData, marketContext = _marketContext) {
  if (!tickerData?.quote?.data) {
    return { score: null, badge: 'NEUTRAL', factors: 0, total: 10, technical: null, fundamental: null, sentiment: null, conviction: null, convictionLabel: null, regimeNote: null, spyPenaltyApplied: false, rsiZScore: null, scoreZScore: null };
  }

  const quote   = tickerData.quote.data;
  const metrics = tickerData.metrics?.data?.metric || {};
  const pt      = tickerData.priceTarget?.data;
  const news    = tickerData.news;

  const ind = tickerData.indicators || null;
  let techScore = 0, techFactors = 0, techTotal = 4;
  if (ind?.rsi    != null) techTotal++;
  if (ind?.macd   != null) techTotal++;
  if (ind?.adx    != null) techTotal++;
  if (ind?.stochK != null) techTotal++;
  let fundScore = 0, fundFactors = 0, fundTotal = 3;
  let sentScore = 0, sentFactors = 0, sentTotal = 3;

  // Collect individual signal values for conviction scoring (only when data present)
  const signals = [];

  // ── TECHNICAL (35%) ─────────────────────────────────────────────────────────

  // T1: Price vs EMA50
  const ema50 = metrics['50DayMovingAverage'] ?? ind?.ema50;
  if (ema50 && quote.c) {
    const pct = ((quote.c - ema50) / ema50) * 100;
    const v = pct > 5 ? 1 : pct > 0 ? 0.65 : pct > -5 ? 0.35 : 0;
    techScore += v; techFactors++; signals.push(v);
  } else techScore += 0.5;

  // T2: Price vs EMA200 (long-term regime)
  const ma200 = metrics['200DayMovingAverage'] ?? ind?.ema200;
  if (ma200 && quote.c) {
    const pct = ((quote.c - ma200) / ma200) * 100;
    const v = pct > 5 ? 1 : pct > 0 ? 0.7 : pct > -10 ? 0.3 : 0;
    techScore += v; techFactors++; signals.push(v);
  } else techScore += 0.5;

  // T3: 52-week position (price vs high/low range)
  const high52 = metrics['52WeekHigh'];
  const low52  = metrics['52WeekLow'];
  if (high52 && low52 && quote.c && high52 > low52) {
    const pos = (quote.c - low52) / (high52 - low52);
    const v = pos >= 0.4 && pos <= 0.7 ? 0.9
            : pos > 0.7 && pos <= 0.85 ? 0.7
            : pos > 0.85               ? 0.5
            : pos >= 0.2               ? 0.4
            :                            0.1;
    techScore += v; techFactors++; signals.push(v);
  } else techScore += 0.5;

  // T4: Daily momentum
  if (quote.dp !== undefined && quote.dp !== null) {
    const v = quote.dp > 2 ? 1 : quote.dp > 0 ? 0.65 : quote.dp > -2 ? 0.35 : 0;
    techScore += v; techFactors++; signals.push(v);
  } else techScore += 0.5;

  // T5: RSI(14) — oversold = buying opportunity for swing traders
  if (ind?.rsi != null) {
    const rsi = ind.rsi;
    const v = rsi < 30 ? 1.0 : rsi < 40 ? 0.8 : rsi < 55 ? 0.55 : rsi < 70 ? 0.75 : 0.25;
    techScore += v; techFactors++; signals.push(v);
  }

  // T6: MACD — histogram direction + line vs signal
  if (ind?.macd != null) {
    const { histogram, macd, signal } = ind.macd;
    const cross = ind.macdCrossover;
    let v;
    if (cross === 'bullish_cross')                   v = 1.0;
    else if (cross === 'bearish_cross')              v = 0.0;
    else if (histogram > 0 && macd > signal)         v = 0.75;
    else if (histogram > 0)                          v = 0.55;
    else if (histogram < 0 && macd < signal)         v = 0.2;
    else                                             v = 0.4;
    techScore += v; techFactors++; signals.push(v);
  }

  // T7: ADX trend strength (>25 = trending, <20 = ranging)
  if (ind?.adx != null) {
    const adx = ind.adx;
    const histPos = ind?.macd?.histogram != null ? ind.macd.histogram > 0 : null;
    let v;
    if (adx > 30)       v = histPos === true ? 1.0 : histPos === false ? 0.0 : 0.5;
    else if (adx > 25)  v = histPos === true ? 0.8 : histPos === false ? 0.2 : 0.5;
    else if (adx > 20)  v = 0.5;
    else                v = 0.45;
    techScore += v; techFactors++; signals.push(v);
  }

  // T8: Stochastic %K momentum (oversold/overbought zones + crossover)
  if (ind?.stochK != null) {
    const k = ind.stochK;
    const cross = ind.stochCross;
    let v;
    if (cross === 'bullish_cross' && k < 30)    v = 1.0;
    else if (cross === 'bullish_cross')          v = 0.75;
    else if (cross === 'bearish_cross' && k > 70) v = 0.0;
    else if (cross === 'bearish_cross')          v = 0.25;
    else if (k < 20)  v = 0.85;
    else if (k < 35)  v = 0.65;
    else if (k < 60)  v = 0.5;
    else if (k < 75)  v = 0.4;
    else              v = 0.2;
    techScore += v; techFactors++; signals.push(v);
  }

  const techNorm = techScore / techTotal;

  // ── FUNDAMENTAL (45%) ────────────────────────────────────────────────────────

  const pe = metrics['peNormalizedAnnual'] ?? metrics['peBasicExclExtraTTM'];
  if (pe != null && pe > 0) {
    let v;
    if (pe >= 10 && pe <= 25)      v = 1;
    else if (pe > 25 && pe <= 40)  v = 0.65;
    else if (pe > 40 && pe <= 60)  v = 0.4;
    else if (pe > 60)              v = 0.15;
    else                           v = 0.8; // pe < 10 — cheap
    fundScore += v; fundFactors++; signals.push(v);
  } else fundScore += 0.5;

  const epsGrowth = metrics['epsGrowthTTMYoy'] ?? metrics['epsGrowth3Y'];
  if (epsGrowth != null) {
    const v = epsGrowth > 20 ? 1 : epsGrowth > 5 ? 0.75 : epsGrowth > 0 ? 0.55 : epsGrowth > -10 ? 0.3 : 0;
    fundScore += v; fundFactors++; signals.push(v);
  } else fundScore += 0.5;

  const targetMid = pt?.targetMean ?? pt?.targetHigh;
  if (targetMid && quote.c) {
    const premium = (targetMid - quote.c) / quote.c;
    const v = premium > 0.20 ? 1 : premium > 0.10 ? 0.75 : premium > 0 ? 0.55 : premium > -0.05 ? 0.35 : 0.1;
    fundScore += v; fundFactors++; signals.push(v);
  } else fundScore += 0.5;

  const fundNorm = fundScore / fundTotal;

  // ── SENTIMENT (20%) ──────────────────────────────────────────────────────────

  const newsSent = scoreNewsHeadlines(news);
  if (newsSent !== null) {
    sentScore += newsSent; sentFactors++; signals.push(newsSent);
  } else sentScore += 0.5;

  if (tickerData.sectorTrend !== undefined && tickerData.sectorTrend !== null) {
    const v = tickerData.sectorTrend ? 0.2 : 0.8;
    sentScore += v; sentFactors++; signals.push(v);
  } else sentScore += 0.5;

  const insiderTxns = tickerData.insider?.data?.data;
  if (Array.isArray(insiderTxns) && insiderTxns.length > 0) {
    let netShares = 0;
    for (const txn of insiderTxns) {
      const t = (txn.transactionType || '').toUpperCase();
      if (t === 'P-PURCHASE' || t === 'BUY') netShares += txn.share ?? 0;
      else if (t === 'S-SALE' || t === 'SELL') netShares -= txn.share ?? 0;
    }
    const v = netShares > 50000 ? 1 : netShares > 0 ? 0.7 : netShares > -50000 ? 0.45 : 0.15;
    sentScore += v; sentFactors++; signals.push(v);
  } else sentScore += 0.5;

  const sentNorm = sentScore / sentTotal;

  // ── REGIME-AWARE WEIGHTS ─────────────────────────────────────────────────────
  // When VIX is elevated, fundamentals are more reliable than technical noise.

  const vixPrice = marketContext?.vixPrice ?? null;
  let techWeight = 0.35, fundWeight = 0.45, sentWeight = 0.20;
  let regimeNote = null;

  if (vixPrice !== null && vixPrice > 35) {
    techWeight = 0.20; fundWeight = 0.60; sentWeight = 0.20;
    regimeNote = `VIX ${vixPrice.toFixed(0)} extreme — fundamentals heavily weighted (60%)`;
  } else if (vixPrice !== null && vixPrice > 25) {
    techWeight = 0.25; fundWeight = 0.55; sentWeight = 0.20;
    regimeNote = `VIX ${vixPrice.toFixed(0)} elevated — fundamentals weighted higher (55%)`;
  }

  // ── COMPOSITE ────────────────────────────────────────────────────────────────

  let score = Math.max(0, Math.min(100, Math.round(
    ((techNorm * techWeight) + (fundNorm * fundWeight) + (sentNorm * sentWeight)) * 100
  )));

  // ── SPY DOWNTREND PENALTY ────────────────────────────────────────────────────
  // In a market downtrend, pull LONG scores 20% toward neutral (50).

  let spyPenaltyApplied = false;
  if ((marketContext?.spyDowntrend ?? false) && score > 50) {
    score = Math.round(score - (score - 50) * 0.20);
    spyPenaltyApplied = true;
  }

  // ── FEAR & GREED MODIFIER ────────────────────────────────────────────────────
  // Extreme Fear: LONG setups face additional market headwind.
  // Extreme Greed: contrarian caution — market likely extended.

  const fg = marketContext?.fearGreedValue ?? null;
  if (fg !== null && score > 50) {
    if (fg < 25)      score = Math.max(50, score - 3); // Extreme Fear
    else if (fg > 75) score = Math.max(50, score - 2); // Extreme Greed (contrarian)
    else if (fg < 35) score = Math.max(50, score - 1); // Fear
  }

  // ── CONVICTION SCORE ────────────────────────────────────────────────────────
  // Measures signal agreement, independent of directional strength.
  // "How bullish" (score) vs "how many signals agree" (conviction).

  let conviction = null;
  let convictionLabel = null;
  if (signals.length > 0) {
    const isBullish = score > 50;
    const aligned = signals.filter(v => isBullish ? v > 0.6 : v < 0.4).length;
    conviction = Math.round((aligned / signals.length) * 100);
    convictionLabel = conviction >= 75 ? 'HIGH'
                    : conviction >= 55 ? 'MODERATE'
                    : conviction >= 35 ? 'LOW'
                    :                    'MIXED';
  }

  // ── BADGE ────────────────────────────────────────────────────────────────────

  const factors = techFactors + fundFactors + sentFactors;
  const total   = techTotal + fundTotal + sentTotal;

  let badge;
  if (score >= 72)      badge = 'STRONG_LONG';
  else if (score >= 58) badge = 'LEAN_LONG';
  else if (score >= 42) badge = 'NEUTRAL';
  else if (score >= 28) badge = 'LEAN_SHORT';
  else                  badge = 'STRONG_SHORT';

  return {
    score,
    badge,
    factors,
    total,
    technical:   Math.round(techNorm * 100),
    fundamental: Math.round(fundNorm * 100),
    sentiment:   Math.round(sentNorm * 100),
    weights:     { tech: techWeight, fund: fundWeight, sent: sentWeight },
    conviction,
    convictionLabel,
    regimeNote,
    spyPenaltyApplied,
    rsiZScore:   ind?.rsiZScore ?? null,
    scoreZScore: null, // computed separately via computeScoreZScore(symbol)
  };
}

// Keep legacy export for any components still referencing it
export const computeSimpleScore = computeScore;

// ─── SCORE VELOCITY ───────────────────────────────────────────────────────────
// Stores daily score snapshots in localStorage, returns delta vs ~3 days ago.

const VELOCITY_KEY = (symbol) => `sv_${symbol}`;
const THREE_DAYS_MS = 3 * 86400000;
const SEVEN_DAYS_MS = 7 * 86400000;

export function storeScoreSnapshot(symbol, score) {
  if (score === null) return;
  const key = VELOCITY_KEY(symbol);
  let history = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) history = JSON.parse(raw);
  } catch { /* noop */ }

  const now = Date.now();
  // Prune entries older than 7 days
  history = history.filter(e => now - e.ts < SEVEN_DAYS_MS);
  // Don't add a duplicate within 1 hour of the last entry
  const last = history[history.length - 1];
  if (!last || now - last.ts > 3600000) {
    history.push({ score, ts: now });
  }

  try {
    localStorage.setItem(key, JSON.stringify(history));
  } catch { /* noop */ }
}

export function getScoreHistory(symbol, maxPoints = 7) {
  const key = VELOCITY_KEY(symbol);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const history = JSON.parse(raw);
    const now = Date.now();
    return history
      .filter(e => now - e.ts < SEVEN_DAYS_MS)
      .slice(-maxPoints);
  } catch { return []; }
}

export function getScoreVelocity(symbol) {
  const key = VELOCITY_KEY(symbol);
  let history = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) history = JSON.parse(raw);
  } catch { return null; }

  if (history.length < 2) return null;

  const now = Date.now();
  const current = history[history.length - 1];

  // Find the entry closest to 3 days ago (accepting 1–5 day range)
  const target = now - THREE_DAYS_MS;
  let best = null;
  for (const entry of history.slice(0, -1)) {
    const age = now - entry.ts;
    if (age < 86400000) continue; // must be at least 1 day old
    if (!best || Math.abs(entry.ts - target) < Math.abs(best.ts - target)) {
      best = entry;
    }
  }

  // Fallback: oldest entry if nothing within range
  if (!best) best = history[0];
  if (!best || best.ts === current.ts) return null;

  const delta = current.score - best.score;
  return {
    delta,
    direction: delta > 2 ? 'up' : delta < -2 ? 'down' : 'flat',
  };
}

// ─── SCORE Z-SCORE ────────────────────────────────────────────────────────────
// Returns how many std-devs the current score sits above/below its 90-day mean.
// Requires storeScoreSnapshot to have been called on prior refreshes.

export function computeScoreZScore(symbol) {
  const history = getScoreHistory(symbol, 90);
  if (history.length < 5) return null;

  const values  = history.map(e => e.score);
  const current = values[values.length - 1];
  const mean     = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const stddev   = Math.sqrt(variance);

  if (stddev < 0.1) return 0;
  return Math.round(((current - mean) / stddev) * 10) / 10;
}

// ─── THESIS GENERATOR ─────────────────────────────────────────────────────────
// Produces 2–4 plain-English sentences explaining the score. Returns { bulls, bears, warnings }.

export function generateThesis(tickerData, scoreResult) {
  if (!tickerData?.quote?.data || !scoreResult) return null;

  const quote   = tickerData.quote.data;
  const metrics = tickerData.metrics?.data?.metric || {};
  const pt      = tickerData.priceTarget?.data;
  const bulls   = [];
  const bears   = [];
  const warnings = [];

  // ── TECHNICAL ──
  const ind = tickerData.indicators || null;
  const ema50 = metrics['50DayMovingAverage'] ?? ind?.ema50;
  if (ema50 && quote.c) {
    const pct = ((quote.c - ema50) / ema50) * 100;
    if (pct > 5)       bulls.push(`Price is ${pct.toFixed(1)}% above the EMA50 — momentum is intact.`);
    else if (pct > 0)  bulls.push(`Holding just above the EMA50 — a constructive setup.`);
    else if (pct > -5) bears.push(`Trading ${Math.abs(pct).toFixed(1)}% below the EMA50 — trend is weakening.`);
    else               bears.push(`Price is well below the EMA50 (${Math.abs(pct).toFixed(1)}%) — technical structure is broken.`);
  }

  const ma200 = metrics['200DayMovingAverage'] ?? ind?.ema200;
  if (ma200 && quote.c) {
    const pct = ((quote.c - ma200) / ma200) * 100;
    if (pct > 5)       bulls.push(`Above the EMA200 — long-term bull regime confirmed.`);
    else if (pct > 0)  bulls.push(`Just above the EMA200 — long-term trend borderline bullish.`);
    else if (pct > -10) bears.push(`Below the EMA200 — long-term trend is bearish.`);
    else               bears.push(`Deep below the EMA200 (${Math.abs(pct).toFixed(1)}%) — avoid until reclaimed.`);
  }

  const high52 = metrics['52WeekHigh'];
  const low52  = metrics['52WeekLow'];
  if (high52 && low52 && quote.c && high52 > low52) {
    const pos = Math.round(((quote.c - low52) / (high52 - low52)) * 100);
    if (pos >= 40 && pos <= 70) bulls.push(`At the ${pos}th percentile of its 52-week range — sweet spot for swing entries.`);
    else if (pos > 85)          bears.push(`Near 52-week highs (${pos}th percentile) — extended, limited upside buffer.`);
    else if (pos < 20)          bears.push(`Near 52-week lows (${pos}th percentile) — price discovery still ongoing.`);
  }

  if (quote.dp !== undefined && quote.dp !== null) {
    if (quote.dp > 3)       bulls.push(`Strong session today (+${quote.dp.toFixed(1)}%) — institutional buying likely.`);
    else if (quote.dp < -3) bears.push(`Down ${Math.abs(quote.dp).toFixed(1)}% today — selling pressure is elevated.`);
  }

  // ── FUNDAMENTAL ──
  const pe = metrics['peNormalizedAnnual'] ?? metrics['peBasicExclExtraTTM'];
  if (pe != null && pe > 0) {
    if (pe >= 10 && pe <= 25)     bulls.push(`P/E of ${pe.toFixed(1)}× — reasonable valuation for a swing trade.`);
    else if (pe > 40)             bears.push(`P/E of ${pe.toFixed(1)}× — premium multiple, needs earnings upside to justify.`);
    else if (pe > 0 && pe < 10)   bulls.push(`Cheap valuation at ${pe.toFixed(1)}× earnings.`);
  }

  const epsGrowth = metrics['epsGrowthTTMYoy'] ?? metrics['epsGrowth3Y'];
  if (epsGrowth != null) {
    if (epsGrowth > 20)       bulls.push(`Earnings growing ${epsGrowth.toFixed(0)}% YoY — strong fundamental tailwind.`);
    else if (epsGrowth > 5)   bulls.push(`EPS up ${epsGrowth.toFixed(0)}% YoY — fundamentals trending in the right direction.`);
    else if (epsGrowth < -10) bears.push(`Earnings declining ${Math.abs(epsGrowth).toFixed(0)}% YoY — fundamental headwind.`);
  }

  const targetMid = pt?.targetMean ?? pt?.targetHigh;
  if (targetMid && quote.c) {
    const premium = Math.round(((targetMid - quote.c) / quote.c) * 100);
    if (premium > 20)      bulls.push(`Analyst consensus sees ${premium}% upside to $${targetMid.toFixed(2)}.`);
    else if (premium > 5)  bulls.push(`Analyst target at $${targetMid.toFixed(2)} (+${premium}%) — modest upside confirmed.`);
    else if (premium < -5) bears.push(`Trading above analyst consensus — current price is already stretched.`);
  }

  // ── SENTIMENT ──
  if (tickerData.sectorTrend === true)  bears.push(`Sector ETF is in a downtrend — headwind for individual names.`);
  if (tickerData.sectorTrend === false) bulls.push(`Sector ETF trending up — tailwind for this setup.`);

  const insiderTxns = tickerData.insider?.data?.data;
  if (Array.isArray(insiderTxns) && insiderTxns.length > 0) {
    let netShares = 0;
    for (const txn of insiderTxns) {
      const t = (txn.transactionType || '').toUpperCase();
      if (t === 'P-PURCHASE' || t === 'BUY') netShares += txn.share ?? 0;
      else if (t === 'S-SALE' || t === 'SELL') netShares -= txn.share ?? 0;
    }
    if (netShares > 50000)
      bulls.push(`Insiders net bought ${(netShares / 1000).toFixed(0)}k shares in the last 90 days — strong conviction signal.`);
    else if (netShares > 0)
      bulls.push(`Modest net insider buying (${(netShares / 1000).toFixed(0)}k shares, 90d).`);
    else if (netShares < -50000)
      bears.push(`Insiders net sold ${(Math.abs(netShares) / 1000).toFixed(0)}k shares in the last 90 days.`);
  }

  // ── WARNINGS ──
  const daysToEarnings = getDaysToEarnings(tickerData.earnings);
  if (daysToEarnings !== null && daysToEarnings <= 14)
    warnings.push(`Earnings in ${daysToEarnings} day${daysToEarnings === 1 ? '' : 's'} — binary event risk, size down or wait.`);
  else if (daysToEarnings !== null && daysToEarnings <= 30)
    warnings.push(`Trade window: ~${daysToEarnings} days before earnings — factor into your hold time.`);

  if (scoreResult.regimeNote)
    warnings.push(scoreResult.regimeNote + ' — weight technicals lightly.');
  if (scoreResult.spyPenaltyApplied)
    warnings.push('SPY in downtrend — score penalised; new longs face market headwind.');

  return { bulls: bulls.slice(0, 3), bears: bears.slice(0, 2), warnings };
}

// ─── BADGE STYLES ─────────────────────────────────────────────────────────────

export function getBadgeStyle(badge) {
  switch (badge) {
    case 'STRONG_LONG':  return { bg: 'bg-bull-strong', text: 'text-surface-900', label: 'STRONG' };
    case 'LEAN_LONG':    return { bg: 'bg-transparent border border-bull-strong', text: 'text-bull-strong', label: 'LEAN LONG' };
    case 'NEUTRAL':      return { bg: 'bg-surface-600', text: 'text-neutral', label: 'NEUTRAL' };
    case 'LEAN_SHORT':   return { bg: 'bg-transparent border border-bear-weak', text: 'text-bear-weak', label: 'LEAN SHORT' };
    case 'STRONG_SHORT': return { bg: 'bg-bear-strong', text: 'text-surface-900', label: 'STRONG SHORT' };
    case 'BLOCKED':      return { bg: 'bg-danger', text: 'text-white', label: 'BLOCKED' };
    default:             return { bg: 'bg-surface-600', text: 'text-neutral', label: '—' };
  }
}

// ─── EARNINGS HELPER ──────────────────────────────────────────────────────────

export function getDaysToEarnings(earningsData) {
  if (!earningsData?.data?.earningsCalendar?.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const e of earningsData.data.earningsCalendar) {
    const d = new Date(e.date);
    const diff = Math.ceil((d - today) / 86400000);
    if (diff >= 0) return diff;
  }
  return null;
}

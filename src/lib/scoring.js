// 9-signal scoring engine — Technical 35% / Fundamental 45% / Sentiment 20%
// Missing data → signal neutral (0.5), not penalised. Factor count tracks completeness.

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

export function computeScore(tickerData) {
  if (!tickerData?.quote?.data) {
    return { score: null, badge: 'NEUTRAL', factors: 0, total: 10, technical: null, fundamental: null, sentiment: null };
  }

  const quote   = tickerData.quote.data;
  const metrics = tickerData.metrics?.data?.metric || {};
  const pt      = tickerData.priceTarget?.data;
  const news    = tickerData.news;

  const ind = tickerData.indicators || null;
  let techScore = 0, techFactors = 0, techTotal = 4;
  if (ind?.rsi  != null) techTotal++;
  if (ind?.macd != null) techTotal++;
  let fundScore = 0, fundFactors = 0, fundTotal = 3;
  let sentScore = 0, sentFactors = 0, sentTotal = 3;

  // ── TECHNICAL (35%) ─────────────────────────────────────────────────────────

  // T1: Price vs EMA50
  const ema50 = metrics['50DayMovingAverage'];
  if (ema50 && quote.c) {
    const pct = ((quote.c - ema50) / ema50) * 100;
    if (pct > 5)       techScore += 1;
    else if (pct > 0)  techScore += 0.65;
    else if (pct > -5) techScore += 0.35;
    else               techScore += 0;
    techFactors++;
  } else techScore += 0.5;

  // T2: Price vs MA200 (long-term regime)
  const ma200 = metrics['200DayMovingAverage'];
  if (ma200 && quote.c) {
    const pct = ((quote.c - ma200) / ma200) * 100;
    if (pct > 5)      techScore += 1;
    else if (pct > 0) techScore += 0.7;
    else if (pct > -10) techScore += 0.3;
    else              techScore += 0;
    techFactors++;
  } else techScore += 0.5;

  // T3: 52-week position (price vs high/low range)
  const high52 = metrics['52WeekHigh'];
  const low52  = metrics['52WeekLow'];
  if (high52 && low52 && quote.c && high52 > low52) {
    const pos = (quote.c - low52) / (high52 - low52); // 0=at low, 1=at high
    // Sweet spot for swing: 0.4–0.7 (not extended, not broken)
    if (pos >= 0.4 && pos <= 0.7)       techScore += 0.9;
    else if (pos > 0.7 && pos <= 0.85)  techScore += 0.7;
    else if (pos > 0.85)                techScore += 0.5; // extended
    else if (pos >= 0.2)                techScore += 0.4;
    else                                techScore += 0.1; // near 52w low
    techFactors++;
  } else techScore += 0.5;

  // T4: Daily momentum
  if (quote.dp !== undefined && quote.dp !== null) {
    if (quote.dp > 2)       techScore += 1;
    else if (quote.dp > 0)  techScore += 0.65;
    else if (quote.dp > -2) techScore += 0.35;
    else                    techScore += 0;
    techFactors++;
  } else techScore += 0.5;

  // T5: RSI(14) — oversold = buying opportunity for swing traders
  if (ind?.rsi != null) {
    const rsi = ind.rsi;
    if (rsi < 30)                  techScore += 1.0;  // oversold
    else if (rsi < 40)             techScore += 0.8;  // mild oversold
    else if (rsi < 55)             techScore += 0.55; // neutral
    else if (rsi < 70)             techScore += 0.75; // momentum (not yet extended)
    else                           techScore += 0.25; // overbought — caution
    techFactors++;
  }

  // T6: MACD — histogram direction + line vs signal
  if (ind?.macd != null) {
    const { histogram, macd, signal } = ind.macd;
    const cross = ind.macdCrossover;
    if (cross === 'bullish_cross')       techScore += 1.0; // fresh crossover — strongest signal
    else if (cross === 'bearish_cross')  techScore += 0.0;
    else if (histogram > 0 && macd > signal) techScore += 0.75;
    else if (histogram > 0)              techScore += 0.55;
    else if (histogram < 0 && macd < signal) techScore += 0.2;
    else                                 techScore += 0.4;
    techFactors++;
  }

  // Normalise technical to 0–1
  const techNorm = techScore / techTotal;

  // ── FUNDAMENTAL (45%) ────────────────────────────────────────────────────────

  // F1: P/E ratio (prefer 10–30 for swing traders; penalise negative or >60)
  const pe = metrics['peNormalizedAnnual'] ?? metrics['peBasicExclExtraTTM'];
  if (pe != null && pe > 0) {
    if (pe >= 10 && pe <= 25)      fundScore += 1;
    else if (pe > 25 && pe <= 40)  fundScore += 0.65;
    else if (pe > 40 && pe <= 60)  fundScore += 0.4;
    else if (pe > 60)              fundScore += 0.15;
    else if (pe > 0 && pe < 10)    fundScore += 0.8; // cheap
    fundFactors++;
  } else fundScore += 0.5;

  // F2: EPS trend (last reported growth)
  const epsGrowth = metrics['epsGrowthTTMYoy'] ?? metrics['epsGrowth3Y'];
  if (epsGrowth != null) {
    if (epsGrowth > 20)       fundScore += 1;
    else if (epsGrowth > 5)   fundScore += 0.75;
    else if (epsGrowth > 0)   fundScore += 0.55;
    else if (epsGrowth > -10) fundScore += 0.3;
    else                      fundScore += 0;
    fundFactors++;
  } else fundScore += 0.5;

  // F3: Analyst price target premium
  const targetMid = pt?.targetMean ?? pt?.targetHigh;
  if (targetMid && quote.c) {
    const premium = (targetMid - quote.c) / quote.c;
    if (premium > 0.20)       fundScore += 1;
    else if (premium > 0.10)  fundScore += 0.75;
    else if (premium > 0)     fundScore += 0.55;
    else if (premium > -0.05) fundScore += 0.35;
    else                      fundScore += 0.1;
    fundFactors++;
  } else fundScore += 0.5;

  // Normalise fundamental to 0–1
  const fundNorm = fundScore / fundTotal;

  // ── SENTIMENT (20%) ──────────────────────────────────────────────────────────

  // S1: News headline sentiment (last 5 headlines)
  const newsSent = scoreNewsHeadlines(news);
  if (newsSent !== null) {
    sentScore += newsSent;
    sentFactors++;
  } else sentScore += 0.5;

  // S2: Sector ETF trend (passed in via tickerData.sectorTrend: true=downtrend)
  if (tickerData.sectorTrend !== undefined && tickerData.sectorTrend !== null) {
    sentScore += tickerData.sectorTrend ? 0.2 : 0.8; // downtrend=bad, uptrend=good
    sentFactors++;
  } else sentScore += 0.5;

  // S3: Insider net buying (last 90 days)
  const insiderTxns = tickerData.insider?.data?.data;
  if (Array.isArray(insiderTxns) && insiderTxns.length > 0) {
    let netShares = 0;
    for (const txn of insiderTxns) {
      const t = (txn.transactionType || '').toUpperCase();
      if (t === 'P-PURCHASE' || t === 'BUY') netShares += txn.share ?? 0;
      else if (t === 'S-SALE' || t === 'SELL') netShares -= txn.share ?? 0;
    }
    if (netShares > 50000)       sentScore += 1;
    else if (netShares > 0)      sentScore += 0.7;
    else if (netShares > -50000) sentScore += 0.45;
    else                         sentScore += 0.15;
    sentFactors++;
  } else sentScore += 0.5;

  // Normalise sentiment to 0–1
  const sentNorm = sentScore / sentTotal;

  // ── COMPOSITE ────────────────────────────────────────────────────────────────

  const composite = (techNorm * 0.35) + (fundNorm * 0.45) + (sentNorm * 0.20);
  const score = Math.max(0, Math.min(100, Math.round(composite * 100)));
  const factors = techFactors + fundFactors + sentFactors;
  const total = techTotal + fundTotal + sentTotal;

  let badge;
  if (score >= 72) badge = 'STRONG_LONG';
  else if (score >= 58) badge = 'LEAN_LONG';
  else if (score >= 42) badge = 'NEUTRAL';
  else if (score >= 28) badge = 'LEAN_SHORT';
  else badge = 'STRONG_SHORT';

  return {
    score,
    badge,
    factors,
    total,
    technical:   Math.round(techNorm * 100),
    fundamental: Math.round(fundNorm * 100),
    sentiment:   Math.round(sentNorm * 100),
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
  const ema50 = metrics['50DayMovingAverage'];
  if (ema50 && quote.c) {
    const pct = ((quote.c - ema50) / ema50) * 100;
    if (pct > 5)       bulls.push(`Price is ${pct.toFixed(1)}% above the 50-day MA — momentum is intact.`);
    else if (pct > 0)  bulls.push(`Holding just above the 50-day MA — a constructive setup.`);
    else if (pct > -5) bears.push(`Trading ${Math.abs(pct).toFixed(1)}% below the 50-day MA — trend is weakening.`);
    else               bears.push(`Price is well below the 50-day MA (${Math.abs(pct).toFixed(1)}%) — technical structure is broken.`);
  }

  const ma200 = metrics['200DayMovingAverage'];
  if (ma200 && quote.c) {
    const pct = ((quote.c - ma200) / ma200) * 100;
    if (pct > 5)       bulls.push(`Above the 200-day MA — long-term bull regime confirmed.`);
    else if (pct > 0)  bulls.push(`Just above the 200-day MA — long-term trend borderline bullish.`);
    else if (pct > -10) bears.push(`Below the 200-day MA — long-term trend is bearish.`);
    else               bears.push(`Deep below the 200-day MA (${Math.abs(pct).toFixed(1)}%) — avoid until reclaimed.`);
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

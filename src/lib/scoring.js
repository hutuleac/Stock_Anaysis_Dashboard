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
    return { score: null, badge: 'NEUTRAL', factors: 0, total: 9, technical: null, fundamental: null, sentiment: null };
  }

  const quote   = tickerData.quote.data;
  const metrics = tickerData.metrics?.data?.metric || {};
  const pt      = tickerData.priceTarget?.data;
  const news    = tickerData.news;

  let techScore = 0, techFactors = 0, techTotal = 4;
  let fundScore = 0, fundFactors = 0, fundTotal = 3;
  let sentScore = 0, sentFactors = 0, sentTotal = 2;

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

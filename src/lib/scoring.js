// Wave 1 simplified scoring: EMA position + earnings proximity
// Full 9-signal scoring engine comes in Wave 2

export function computeSimpleScore(tickerData) {
  if (!tickerData?.quote?.data) return { score: null, badge: 'NEUTRAL', factors: 0, total: 3 };

  const quote = tickerData.quote.data;
  const metrics = tickerData.metrics?.data?.metric || {};
  let score = 50;
  let factors = 0;
  const total = 3;

  // Factor 1: Price vs 50-day EMA (from metrics)
  const ema50 = metrics['50DayMovingAverage'];
  if (ema50 && quote.c) {
    const pctAbove = ((quote.c - ema50) / ema50) * 100;
    if (pctAbove > 5) score += 15;
    else if (pctAbove > 0) score += 8;
    else if (pctAbove > -5) score -= 5;
    else score -= 15;
    factors++;
  }

  // Factor 2: Price vs 200-day MA
  const ma200 = metrics['200DayMovingAverage'];
  if (ma200 && quote.c) {
    const pctAbove = ((quote.c - ma200) / ma200) * 100;
    if (pctAbove > 0) score += 10;
    else score -= 10;
    factors++;
  }

  // Factor 3: Daily change momentum
  if (quote.dp !== undefined) {
    if (quote.dp > 2) score += 8;
    else if (quote.dp > 0) score += 3;
    else if (quote.dp > -2) score -= 3;
    else score -= 8;
    factors++;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  let badge;
  if (score >= 75) badge = 'STRONG_LONG';
  else if (score >= 60) badge = 'LEAN_LONG';
  else if (score >= 40) badge = 'NEUTRAL';
  else if (score >= 25) badge = 'LEAN_SHORT';
  else badge = 'STRONG_SHORT';

  return { score, badge, factors, total };
}

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

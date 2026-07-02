// Dip Hunter — early entries when quality stocks go on sale.
// Pure logic, display-only: quality-gates each watchlist name on fundamentals,
// then scores the dip 0–10 (market fear / oversold / drawdown / smart money).
// Reads data already on the ticker object — no API calls, no scoring changes.
import { computeScore } from './scoring.js';
import { computePEG } from './valuation.js';

const READINESS_RANK = { ACT: 3, SOON: 2, WATCH: 1 };

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function round1(v) { return Math.round(v * 10) / 10; }

// ALL checks must pass — the card only ever suggests dips in quality names.
function passesQualityGate(data) {
  const m = data?.metrics?.data?.metric ?? {};
  const eps = num(m.epsGrowthTTMYoy) ?? num(m.epsGrowth3Y);
  if (eps === null || eps <= 0) return false;
  const rev = num(m.revenueGrowthTTMYoy);
  if (rev === null || rev <= 0) return false;
  const margin = num(m.netProfitMarginTTM) ?? num(m.netMargin);
  if (margin === null || margin <= 0) return false;
  const peg = computePEG(m.peNormalizedAnnual ?? m.peBasicExclExtraTTM ?? null, eps);
  if (peg !== null && !(peg < 3)) return false;
  const fund = computeScore(data).fundamental;
  return fund !== null && fund >= 60;
}

function fearComponent(ctx) {
  const fg = num(ctx?.fearGreedValue);
  let s = fg === null ? 0 : fg < 25 ? 1.6 : fg < 35 ? 1.2 : fg < 45 ? 0.6 : 0;
  if (ctx?.spyBelowEma50 === true) s += 0.4;
  s = Math.min(2.0, s);
  const detail = fg === null ? 'n/a' : `F&G ${fg}${ctx?.spyBelowEma50 ? ', SPY < EMA50' : ''}`;
  return { label: 'Market Fear', score: s, max: 2.0, detail };
}

function oversoldComponent(ind) {
  const rsi = num(ind?.rsi);
  let s = rsi === null ? 0 : rsi < 30 ? 1.25 : rsi < 35 ? 0.85 : rsi < 40 ? 0.4 : 0;
  if (ind?.oversoldConfluence === true) s += 0.6;
  const z = num(ind?.rsiZScore);
  if (z !== null && z <= -1.5) s += 0.6;
  s = Math.min(2.5, s);
  return { label: 'Oversold', score: s, max: 2.5, detail: rsi === null ? 'n/a' : `RSI ${rsi}${z !== null ? `, z ${z}` : ''}` };
}

function drawdownComponent(ind, data) {
  const roc60 = num(ind?.roc60), roc20 = num(ind?.roc20);
  let s = roc60 === null ? 0 : roc60 <= -15 ? 1.0 : roc60 <= -8 ? 0.6 : 0;
  if (roc20 !== null && roc20 <= -5) s += 0.4;
  const m = data?.metrics?.data?.metric ?? {};
  const price = num(data?.quote?.data?.c);
  const hi = num(m['52WeekHigh']), lo = num(m['52WeekLow']);
  if (price !== null && hi !== null && lo !== null && hi > lo) {
    if ((price - lo) / (hi - lo) < 0.4) s += 0.6;
  }
  s = Math.min(2.0, s);
  return { label: 'Drawdown', score: s, max: 2.0, detail: roc60 === null ? 'n/a' : `60d ${roc60}%` };
}

// Leading reversal signal — MACD histogram just flipped positive, ie momentum is
// already turning up rather than still falling. Complements Oversold (coincident).
function turnComponent(ind) {
  const cross = ind?.macdCrossover ?? null;
  const s = cross === 'bullish_cross' ? 1.5 : 0;
  return { label: 'Turn', score: s, max: 1.5, detail: cross === 'bullish_cross' ? 'MACD bull cross' : 'no turn yet' };
}

function smartMoneyComponent(sm) {
  const d = sm?.data ?? null;
  if (!d) return { label: 'Smart Money', score: 0, max: 2.0, detail: 'n/a' };
  let s = 0;
  const parts = [];
  if (num(d.mspr3m) !== null && d.mspr3m > 0) { s += 1; parts.push('insiders buying'); }
  if (d.rec && d.rec.buyRatio >= 0.6 && !d.rec.deteriorating) { s += 1; parts.push(`${Math.round(d.rec.buyRatio * 100)}% buy`); }
  return { label: 'Smart Money', score: s, max: 2.0, detail: parts.length ? parts.join(', ') : 'no confirmation' };
}

export function computeDipRadar(list, marketCtx) {
  if (!Array.isArray(list) || !list.length) return [];
  const hits = [];
  for (const item of list) {
    const data = item?.data;
    if (!data?.quote?.data?.c || !passesQualityGate(data)) continue;

    const components = [
      fearComponent(marketCtx),
      oversoldComponent(data.indicators),
      drawdownComponent(data.indicators, data),
      turnComponent(data.indicators),
      smartMoneyComponent(data.smartMoney),
    ];
    components.forEach(c => { c.score = Math.round(c.score * 100) / 100; }); // quarter-point tiers
    const score = round1(components.reduce((s, c) => s + c.score, 0));
    if (score < 3) continue;

    const hasFear = components[0].score > 0;
    const readiness = score >= 7 && hasFear ? 'ACT' : score >= 5 ? 'SOON' : 'WATCH';

    hits.push({
      symbol: item.symbol,
      score,
      readiness,
      components,
      rsi: num(data.indicators?.rsi),
      roc60: num(data.indicators?.roc60),
      smartMoney: data.smartMoney?.data ?? null,
    });
  }
  hits.sort((a, b) => (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score));
  return hits;
}

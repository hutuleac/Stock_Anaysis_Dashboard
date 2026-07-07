// Dip Hunter — early entries when quality stocks go on sale.
// Pure logic, display-only: quality-gates each watchlist name on fundamentals,
// then scores the dip 0–10 across fear / oversold / drawdown / 52w-low / turn /
// relative strength / value / smart money / OBV accumulation.
// Reads data already on the ticker object — no API calls, no scoring changes.
import { computeScore } from './scoring.js';
import { computePEG } from './valuation.js';

const READINESS_RANK = { ACT: 3, SOON: 2, WATCH: 1 };

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function round1(v) { return Math.round(v * 10) / 10; }

// Shared gate + value inputs — computed once per ticker so PEG isn't derived twice.
function gateMetrics(data) {
  const m = data?.metrics?.data?.metric ?? {};
  const eps = num(m.epsGrowthTTMYoy) ?? num(m.epsGrowth3Y);
  const rev = num(m.revenueGrowthTTMYoy);
  const margin = num(m.netProfitMarginTTM) ?? num(m.netMargin);
  const peg = eps !== null ? computePEG(m.peNormalizedAnnual ?? m.peBasicExclExtraTTM ?? null, eps) : null;
  const fund = computeScore(data).fundamental;
  const pass = eps !== null && eps > 0 && rev !== null && rev > 0 && margin !== null && margin > 0 &&
    (peg === null || peg < 3) && fund !== null && fund >= 60;
  return { peg, pass };
}

function fearComponent(ctx) {
  const fg = num(ctx?.fearGreedValue);
  let s = fg === null ? 0 : fg < 25 ? 1.2 : fg < 35 ? 0.9 : fg < 45 ? 0.45 : 0;
  if (ctx?.spyBelowEma50 === true) s += 0.3;
  s = Math.min(1.5, s);
  const detail = fg === null ? 'n/a' : `F&G ${fg}${ctx?.spyBelowEma50 ? ', SPY < EMA50' : ''}`;
  return { label: 'Market Fear', score: s, max: 1.5, detail };
}

function oversoldComponent(ind) {
  const rsi = num(ind?.rsi);
  let s = rsi === null ? 0 : rsi < 30 ? 0.75 : rsi < 35 ? 0.5 : rsi < 40 ? 0.25 : 0;
  if (ind?.oversoldConfluence === true) s += 0.375;
  const z = num(ind?.rsiZScore);
  if (z !== null && z <= -1.5) s += 0.375;
  s = Math.min(1.5, s);
  return { label: 'Oversold', score: s, max: 1.5, detail: rsi === null ? 'n/a' : `RSI ${rsi}${z !== null ? `, z ${z}` : ''}` };
}

function drawdownComponent(ind) {
  const roc60 = num(ind?.roc60), roc20 = num(ind?.roc20);
  let s = roc60 === null ? 0 : roc60 <= -15 ? 0.6 : roc60 <= -8 ? 0.3 : 0;
  if (roc20 !== null && roc20 <= -5) s += 0.4;
  s = Math.min(1.0, s);
  return { label: 'Drawdown', score: s, max: 1.0, detail: roc60 === null ? 'n/a' : `60d ${roc60}%` };
}

// Proximity to the 52-week low, split out from Drawdown so a deep-range position
// scores on its own graduated tiers instead of a flat bonus.
function lowComponent(data) {
  const m = data?.metrics?.data?.metric ?? {};
  const price = num(data?.quote?.data?.c);
  const hi = num(m['52WeekHigh']), lo = num(m['52WeekLow']);
  if (price === null || hi === null || lo === null || hi <= lo) return { label: '52w Low', score: 0, max: 1.0, detail: 'n/a' };
  const pos = (price - lo) / (hi - lo);
  const s = pos < 0.15 ? 1.0 : pos < 0.25 ? 0.7 : pos < 0.4 ? 0.4 : 0;
  return { label: '52w Low', score: s, max: 1.0, detail: `${Math.round(pos * 100)}% of range` };
}

// Leading reversal signal — MACD histogram just flipped positive, ie momentum is
// already turning up rather than still falling. Complements Oversold (coincident).
function turnComponent(ind) {
  const cross = ind?.macdCrossover ?? null;
  const s = cross === 'bullish_cross' ? 1.0 : 0;
  return { label: 'Turn', score: s, max: 1.0, detail: cross === 'bullish_cross' ? 'MACD bull cross' : 'no turn yet' };
}

// Mild relative-strength underperformance vs SPY in a quality name reads as a
// market overreaction worth buying. Extreme underperformance (< -15%) is a flag,
// not a discount, so it scores zero — same as outperformance (no dip signal).
function rsComponent(rs) {
  const r = num(rs?.rs3m);
  const s = r === null ? 0 : (r >= -15 && r <= -5) ? 1.0 : (r < 0 && r > -5) ? 0.4 : 0;
  return { label: 'Rel. Strength', score: s, max: 1.0, detail: r === null ? 'n/a' : `RS3m ${r > 0 ? '+' : ''}${r}%` };
}

// Value-on-top-of-the-gate: PEG < 3 already qualifies a name, but cheaper growth
// within that band is a stronger value dip.
function valueComponent(peg) {
  const s = peg === null ? 0 : peg < 1 ? 1.0 : peg < 1.5 ? 0.7 : peg < 2 ? 0.4 : 0;
  return { label: 'Value', score: s, max: 1.0, detail: peg === null ? 'n/a' : `PEG ${peg}` };
}

// Volume-based accumulation tell: OBV rising while price is still declining
// means buyers are absorbing supply ahead of the turn — a more real-time
// "smart money" signal than the 7d-cached insider/analyst data below.
function obvComponent(ind) {
  const trend = ind?.obv?.trend ?? null;
  if (trend === null) return { label: 'OBV', score: 0, max: 1.0, detail: 'n/a' };
  const roc60 = num(ind?.roc60);
  const declining = roc60 !== null && roc60 <= -8;
  const s = trend === 'rising' && declining ? 1.0 : trend === 'rising' ? 0.3 : 0;
  const detail = trend === 'rising'
    ? (declining ? 'OBV rising, price down — accumulation' : 'OBV rising')
    : trend === 'falling' ? 'OBV falling' : 'OBV flat';
  return { label: 'OBV', score: s, max: 1.0, detail };
}

function smartMoneyComponent(sm) {
  const d = sm?.data ?? null;
  if (!d) return { label: 'Smart Money', score: 0, max: 1.0, detail: 'n/a' };
  let s = 0;
  const parts = [];
  if (num(d.mspr3m) !== null && d.mspr3m > 0) { s += 0.5; parts.push('insiders buying'); }
  if (d.rec && d.rec.buyRatio >= 0.6 && !d.rec.deteriorating) { s += 0.5; parts.push(`${Math.round(d.rec.buyRatio * 100)}% buy`); }
  return { label: 'Smart Money', score: s, max: 1.0, detail: parts.length ? parts.join(', ') : 'no confirmation' };
}

// High ADX + still-declining price = a real, accelerating downtrend, not a
// mean-reversion setup. Caps readiness rather than excluding — the name can
// still be quality-gated and worth watching, just not actionable yet.
function riskFlags(ind) {
  const adx = num(ind?.adx);
  const roc60 = num(ind?.roc60);
  const strongDowntrend = adx !== null && adx > 35 && roc60 !== null && roc60 <= -8;
  return { strongDowntrend, adx };
}

export function computeDipRadar(list, marketCtx) {
  if (!Array.isArray(list) || !list.length) return [];
  const hits = [];
  for (const item of list) {
    const data = item?.data;
    if (!data?.quote?.data?.c) continue;
    const gate = gateMetrics(data);
    if (!gate.pass) continue;

    const components = [
      fearComponent(marketCtx),
      oversoldComponent(data.indicators),
      drawdownComponent(data.indicators),
      lowComponent(data),
      turnComponent(data.indicators),
      rsComponent(data.rs),
      valueComponent(gate.peg),
      smartMoneyComponent(data.smartMoney),
      obvComponent(data.indicators),
    ];
    components.forEach(c => { c.score = Math.round(c.score * 100) / 100; }); // quarter-point tiers
    const score = round1(components.reduce((s, c) => s + c.score, 0));
    if (score < 3) continue;

    const hasFear = components[0].score > 0;
    const risk = riskFlags(data.indicators);
    const readiness = risk.strongDowntrend ? 'WATCH'
      : score >= 7 && hasFear ? 'ACT'
      : score >= 5 ? 'SOON' : 'WATCH';

    hits.push({
      symbol: item.symbol,
      score,
      readiness,
      components,
      risk,
      rsi: num(data.indicators?.rsi),
      roc60: num(data.indicators?.roc60),
      smartMoney: data.smartMoney?.data ?? null,
    });
  }
  hits.sort((a, b) => (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score));
  return hits;
}

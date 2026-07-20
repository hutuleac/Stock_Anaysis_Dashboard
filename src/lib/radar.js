// Setup Radar — early entries, split into two honest buckets.
// ACCUMULATION (Pullback setup): buy weakness before the wave — laggards welcome,
//   the leaders (rs3m>0) gate is deliberately NOT applied here.
// BREAKOUT (Momentum setup): confirmation as a leader's trend starts — leaders gate kept.
// Both still require real revenue growth + PEG<3. Display-only; reads data already
// on the ticker object — no API calls, no scoring changes.
import { computePEG } from './valuation.js';

const READINESS_RANK = { ACT: 3, SOON: 2, WATCH: 1 };

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Same rule as Dip Hunter's supportStatus (src/lib/dip.js) — most recent
// swing-low pivot as the support level a Pullback setup is betting on.
function supportStatus(data) {
  const price = isFiniteNum(data?.quote?.data?.c) ? data.quote.data.c : null;
  const swingLows = data?.indicators?.swingLows ?? [];
  if (price === null || !swingLows.length) return { belowSupport: false, nearestSupport: null };
  const nearest = swingLows[0].price;
  return { belowSupport: price < nearest, nearestSupport: nearest };
}

// Stronger of pullback/momentum whose readiness is WATCH/SOON/ACT, else null.
function activeSetup(setups) {
  if (!setups) return null;
  const candidates = [];
  for (const [type, key] of [['PULLBACK', 'pullback'], ['MOMENTUM', 'momentum']]) {
    const s = setups[key];
    if (s && READINESS_RANK[s.readiness]) {
      candidates.push({
        type,
        readiness: s.readiness,
        score: isFiniteNum(s.score) ? s.score : 0,
        etaWeeks: s.etaWeeks ?? null,
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score)
  );
  return candidates[0];
}

const NUDGE_UP = { WATCH: 'SOON', SOON: 'ACT', ACT: 'ACT' };

// AVWAP reclaimed + POC not below → bump readiness one tier. Never demotes.
function nudgeReadiness(readiness, anchors) {
  if (!anchors) return readiness;
  const avwapOk = anchors.avwap?.reclaimed === true;
  const pocOk = !!anchors.poc && anchors.poc.position !== 'below';
  return avwapOk && pocOk ? (NUDGE_UP[readiness] ?? readiness) : readiness;
}

export function computeRadar(list) {
  if (!Array.isArray(list) || !list.length) return [];

  // Whole-watchlist RS rank by rs3m (strongest = 1).
  const ranked = list
    .filter(x => isFiniteNum(x?.data?.rs?.rs3m))
    .map(x => ({ symbol: x.symbol, rs3m: x.data.rs.rs3m }))
    .sort((a, b) => b.rs3m - a.rs3m);
  const rsTotal = ranked.length;
  const rankMap = new Map(ranked.map((x, i) => [x.symbol, i + 1]));

  const hits = [];
  for (const item of list) {
    const data = item?.data;
    if (!data) continue;

    const setup = activeSetup(data.setups);
    if (!setup) continue;

    const category = setup.type === 'MOMENTUM' ? 'BREAKOUT' : 'ACCUMULATION';
    const readiness = nudgeReadiness(setup.readiness, data.anchors);

    const metric = data?.metrics?.data?.metric ?? {};
    const revGrowth = metric.revenueGrowthTTMYoy;
    const rs3m = data?.rs?.rs3m;
    if (!isFiniteNum(revGrowth) || revGrowth <= 0) continue;
    // Leaders gate applies only to BREAKOUT confirmation. ACCUMULATION (buy-weakness
    // Pullback) deliberately admits laggards — that's the whole point of the bucket.
    if (category === 'BREAKOUT' && (!isFiniteNum(rs3m) || rs3m <= 0)) continue;

    const peg = computePEG(
      metric.peNormalizedAnnual ?? metric.peBasicExclExtraTTM ?? null,
      metric.epsGrowthTTMYoy ?? metric.epsGrowth3Y ?? null,
    );
    if (peg !== null && !(peg < 3)) continue;

    hits.push({
      symbol: item.symbol,
      category,
      setupType: setup.type,
      readiness,
      setupScore: setup.score,
      etaWeeks: setup.etaWeeks,
      rs3m,
      rsRank: rankMap.get(item.symbol) ?? null,
      rsTotal,
      revGrowth,
      peg,
      adx: isFiniteNum(data?.indicators?.adx) ? data.indicators.adx : null,
      wRsi: data?.setups?.meta?.wRsi ?? null,
      support: supportStatus(data),
    });
  }

  hits.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) ||
    (b.setupScore - a.setupScore) ||
    (b.rs3m - a.rs3m)
  );
  return hits;
}

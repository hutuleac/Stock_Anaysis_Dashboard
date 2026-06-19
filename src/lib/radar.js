// Setup Radar — early entries in great stocks.
// Pure logic: gates each watchlist name on (a) an early weekly setup and
// (b) a fundamental quality screen, then ranks the survivors. Display-only;
// reads data already on the ticker object — no API calls, no scoring changes.
import { computePEG } from './valuation.js';

const READINESS_RANK = { ACT: 3, SOON: 2, WATCH: 1 };

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
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

    const readiness = nudgeReadiness(setup.readiness, data.anchors);

    const metric = data?.metrics?.data?.metric ?? {};
    const revGrowth = metric.revenueGrowthTTMYoy;
    const rs3m = data?.rs?.rs3m;
    if (!isFiniteNum(revGrowth) || revGrowth <= 0) continue;
    if (!isFiniteNum(rs3m) || rs3m <= 0) continue;

    const peg = computePEG(
      metric.peNormalizedAnnual ?? metric.peBasicExclExtraTTM ?? null,
      metric.epsGrowthTTMYoy ?? metric.epsGrowth3Y ?? null,
    );
    if (peg !== null && !(peg < 3)) continue;

    hits.push({
      symbol: item.symbol,
      setupType: setup.type,
      readiness,
      setupScore: setup.score,
      etaWeeks: setup.etaWeeks,
      rs3m,
      rsRank: rankMap.get(item.symbol) ?? null,
      rsTotal,
      revGrowth,
      peg,
    });
  }

  hits.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) ||
    (b.setupScore - a.setupScore) ||
    (b.rs3m - a.rs3m)
  );
  return hits;
}

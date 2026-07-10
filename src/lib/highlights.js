// Cross-view digest + notification diffing — pure functions, display-only.
// Consumes hits already computed by radar.js / dip.js / etf.js; no API calls.

const READINESS_RANK = { SOON: 1, ACT: 2 };

// radarHits: computeRadar() output · dipHits: computeDipRadar() output
// etfRows: [{ ucits, sig }] — etflist store rows joined with computeEtfSignals
export function computeHighlights({ radarHits = [], dipHits = [], etfRows = [] }) {
  const items = [];

  for (const h of radarHits) {
    if (READINESS_RANK[h.readiness]) {
      items.push({ kind: 'setup', symbol: h.symbol, view: 'stocks',
        score: h.setupScore, readiness: h.readiness,
        label: `${h.symbol} ${h.setupType.toLowerCase()} setup ${h.setupScore.toFixed(1)}` });
    }
  }
  for (const h of dipHits) {
    if (READINESS_RANK[h.readiness]) {
      items.push({ kind: 'dip', symbol: h.symbol, view: 'stocks',
        score: h.score, readiness: h.readiness,
        label: `${h.symbol} dip ${h.score.toFixed(1)}` });
    }
  }
  for (const row of etfRows) {
    const sig = row.sig;
    if (!sig) continue;
    if (READINESS_RANK[sig.entry.readiness]) {
      items.push({ kind: 'etf-entry', symbol: row.ucits, view: 'etfs',
        score: sig.entry.score, readiness: sig.entry.readiness,
        label: `${row.ucits} entry ${sig.entry.score.toFixed(1)}` });
    }
    if (READINESS_RANK[sig.exit.readiness]) {
      items.push({ kind: 'etf-exit', symbol: row.ucits, view: 'etfs',
        score: sig.exit.score, readiness: sig.exit.readiness,
        label: `${row.ucits} exit ${sig.exit.score.toFixed(1)}` });
    }
  }

  items.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score));
  return items;
}

// prevKeys: "kind:symbol:readiness" strings persisted from the previous refresh.
// New = first appearance or readiness upgrade; repeats and downgrades stay silent.
export function computeNotifications(prevKeys, items) {
  const prev = new Map();
  for (const k of prevKeys ?? []) {
    const [kind, symbol, readiness] = k.split(':');
    const id = `${kind}:${symbol}`;
    prev.set(id, Math.max(prev.get(id) ?? 0, READINESS_RANK[readiness] ?? 0));
  }
  const newItems = items.filter(it =>
    (READINESS_RANK[it.readiness] ?? 0) > (prev.get(`${it.kind}:${it.symbol}`) ?? 0));
  const keys = items.map(it => `${it.kind}:${it.symbol}:${it.readiness}`);
  return { newItems, keys };
}

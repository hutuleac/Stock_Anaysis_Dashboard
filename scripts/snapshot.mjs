// Scheduled snapshot → public/snapshot.json, seeded into the browser cache by
// src/lib/snapshot.js. Runs the app's own fetchers (Vite ssrLoadModule) against
// an in-memory localStorage, so every entry is byte-identical to what the
// browser would cache — no second copy of the fetch/trim logic to drift.
//
// SNAPSHOT_MODE:
//   close  — fresh run: everything for watchlist.json + ETF proxies + SPY
//   open   — start from the live snapshot; only expired entries refetch
//            (quotes, Fear & Greed, BTC — the rest is still inside its TTL)
//   reuse  — push deploys: republish the live snapshot, zero API calls
// LIVE_URL is the deployed snapshot.json. Keys come from repo secrets; a
// missing key or failed call never fails the deploy.
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const OUT = new URL('../public/snapshot.json', import.meta.url);
const { FINNHUB_API_KEY: fhKey, TWELVEDATA_API_KEY: tdKey, LIVE_URL } = process.env;
let mode = process.env.SNAPSHOT_MODE || 'close';

let live = null;
if (LIVE_URL) {
  try { live = await (await fetch(LIVE_URL)).json(); } catch { /* first deploy */ }
  if (!live?.entries) live = null;
}
const publish = (snap) => writeFileSync(OUT, JSON.stringify(snap));

if (mode === 'reuse' || !fhKey) {
  if (live) { publish(live); console.log(`snapshot.json: republished ${live.mode} snapshot`); }
  else console.warn(mode === 'reuse' ? 'no live snapshot to reuse' : 'FINNHUB_API_KEY not set — skipping snapshot');
  process.exit(0);
}
if (mode === 'open' && !live) mode = 'close'; // nothing to start from

const store = new Map(mode === 'open' ? Object.entries(live.entries) : []);
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
const fh = await server.ssrLoadModule('/src/lib/api/finnhub.svelte.js');
const td = await server.ssrLoadModule('/src/lib/api/twelvedata.svelte.js');
const { HARDCODED_DEFAULTS, HARDCODED_ETFS } = await import('../src/lib/defaultLists.js');
const { TD_DAILY_BARS } = await import('../src/lib/candles.js');

fh.setApiKey(fhKey);
if (tdKey) td.setTDApiKey(tdKey);

const symbols = HARDCODED_DEFAULTS.map(t => t.symbol);
const candleSymbols = [...new Set([...symbols, ...HARDCODED_ETFS.map(e => e.proxy), 'SPY'])];
const generatedAt = Date.now();

// Finnhub (60/min, paced in the module) and TwelveData (8/min, queued in the
// module) have separate budgets — run both lanes side by side.
await Promise.all([
  (async () => {
    await fh.fetchMarketContext();
    await fh.refreshAll(symbols);
    for (const s of symbols) {
      await fh.fetchProfile(s);
      await fh.fetchSmartMoney(s);
      await fh.fetchFinancialsReported(s);
      await fh.fetchHistoricalEarnings(s);
    }
  })(),
  tdKey && Promise.all(candleSymbols.map(s => td.fetchTimeSeries(s, '1day', TD_DAILY_BARS))),
]);
await server.close();

// Cache entries only — the shim also holds the API keys setApiKey persisted.
const entries = Object.fromEntries([...store].filter(([k]) => /^(fh|td)_/.test(k)));
const json = JSON.stringify({ generatedAt, mode, entries });
if (json.includes(fhKey) || (tdKey && json.includes(tdKey))) throw new Error('API key leaked into snapshot — aborting');
writeFileSync(OUT, json);
console.log(`snapshot.json: ${mode}, ${Object.keys(entries).length} entries, ${Math.round(json.length / 1024)} KB`);

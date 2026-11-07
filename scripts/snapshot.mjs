// Scheduled snapshot → public/snapshot.json, seeded into the browser cache by
// src/lib/snapshot.js. Runs the app's own fetchers (Vite ssrLoadModule) against
// an in-memory localStorage, so every entry is byte-identical to what the
// browser would cache — no second copy of the fetch/trim logic to drift.
//
// SNAPSHOT_MODE (picked by deploy.yml's gate from the New York time the run starts):
//   close  — fresh run: everything for watchlist.json + ETF proxies + SPY
//   open   — intraday; start from the live snapshot, only expired entries refetch
//            (quotes, Fear & Greed, BTC — the rest is still inside its TTL)
//   reuse  — push deploys: republish the live snapshot, zero API calls
// LIVE_URL is the deployed snapshot.json. Keys come from repo secrets; a
// missing key or a failed call never fails the deploy — a run where no quote
// at all came back does (see the check before publishing).
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

// Each slot has two crons and both now run: the second scheduled close of the
// same New York day republishes instead of spending a second fresh run.
const nyDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
if (mode === 'close' && process.env.GITHUB_EVENT_NAME === 'schedule'
    && live?.mode === 'close' && nyDate(live.generatedAt) === nyDate(Date.now())) mode = 'reuse';

if (mode === 'reuse' || !fhKey) {
  if (live) { publish(live); console.log(`snapshot.json: republished ${live.mode} snapshot`); }
  else console.warn(mode === 'reuse' ? 'no live snapshot to reuse' : 'FINNHUB_API_KEY not set — skipping snapshot');
  process.exit(0);
}
if (mode === 'open' && !live) mode = 'close'; // nothing to start from

// CNN answers a bare Node fetch with "418 I'm a teapot. You're a bot." —
// browsers send a User-Agent, this run has to as well or the snapshot never
// carries Fear & Greed (the app fetcher itself stays untouched).
const nodeFetch = globalThis.fetch;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
globalThis.fetch = (url, opts = {}) => String(url).includes('dataviz.cnn.io')
  ? nodeFetch(url, { ...opts, headers: { ...opts.headers, 'User-Agent': BROWSER_UA } })
  : nodeFetch(url, opts);

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

// Fail loudly when nothing was fetched (revoked key, API down): publishing would
// stamp old prices with a fresh generatedAt. The failed run keeps the live site.
if (!symbols.some(s => JSON.parse(store.get(`fh_quote_${s}`) ?? '{}').ts >= generatedAt)) {
  throw new Error('No quote fetched this run — snapshot not published');
}

// Cache entries only — the shim also holds the API keys setApiKey persisted.
const entries = Object.fromEntries([...store].filter(([k]) => /^(fh|td)_/.test(k)));
const json = JSON.stringify({ generatedAt, mode, entries });
if (json.includes(fhKey) || (tdKey && json.includes(tdKey))) throw new Error('API key leaked into snapshot — aborting');
writeFileSync(OUT, json);
console.log(`snapshot.json: ${mode}, ${Object.keys(entries).length} entries, ${Math.round(json.length / 1024)} KB`);

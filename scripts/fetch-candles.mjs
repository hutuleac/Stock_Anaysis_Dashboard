// Deploy-time daily-candle snapshot → public/candles.json. The app seeds its
// TwelveData cache from it (src/lib/api/twelvedata.svelte.js), so a cold load
// skips ~30 rate-limited calls (8/min free tier ≈ 4 min). Covers the built-in
// watchlist + ETF proxies + SPY; tickers added in the browser still fetch live.
//
// REUSE_URL (set on push deploys): reuse the deployed snapshot when it's under
// 24h old and covers every symbol, so a push doesn't burn ~30 credits + 4 min.
// Missing key or a failed symbol never fails the deploy.
import { writeFileSync } from 'node:fs';
import { HARDCODED_DEFAULTS, HARDCODED_ETFS } from '../src/lib/defaultLists.js';
import { TD_DAILY_BARS } from '../src/lib/candles.js';

const OUT = new URL('../public/candles.json', import.meta.url);
const symbols = [...new Set([...HARDCODED_DEFAULTS.map(t => t.symbol), ...HARDCODED_ETFS.map(e => e.proxy), 'SPY'])];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (process.env.REUSE_URL) {
  try {
    const prev = await (await fetch(process.env.REUSE_URL)).json();
    if (Date.now() - prev.generatedAt < 86_400_000 && symbols.every(s => prev.bars?.[s])) {
      writeFileSync(OUT, JSON.stringify(prev));
      console.log(`candles.json: reused deployed snapshot (${symbols.length} symbols)`);
      process.exit(0);
    }
  } catch { /* first deploy or unreachable — fetch fresh */ }
}

const key = process.env.TWELVEDATA_API_KEY;
if (!key) { console.warn('TWELVEDATA_API_KEY not set — skipping candles.json'); process.exit(0); }

async function fetchSeries(symbol) {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${TD_DAILY_BARS}&order=ASC&apikey=${key}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const json = await (await fetch(url)).json();
    if (json.code === 429) { await sleep(61_000); continue; }
    if (json.status === 'error' || !json.values?.length) throw new Error(json.message || 'no values');
    // compact rows — the app rebuilds TD's { datetime, open, … } objects
    return json.values.map(v => [v.datetime, v.open, v.high, v.low, v.close, v.volume]);
  }
  throw new Error('rate limited twice');
}

const generatedAt = Date.now();
const bars = {};
for (const [i, symbol] of symbols.entries()) {
  if (i) await sleep(7_600); // 8 calls/min
  try { bars[symbol] = await fetchSeries(symbol); }
  catch (err) { console.warn(`${symbol}: ${err.message}`); }
}
writeFileSync(OUT, JSON.stringify({ generatedAt, bars }));
console.log(`candles.json: ${Object.keys(bars).length}/${symbols.length} symbols`);

// Deploy-time FRED snapshot → public/macro.json (read by src/lib/api/fred.js in
// production). FRED has no CORS, so the browser can't call it; fetching here
// keeps the key in a repo secret. Missing key or a failed series never fails
// the deploy — the Macro tile just degrades to cache/empty like before.
import { writeFileSync } from 'node:fs';
import { FRED_SERIES, SERIES_LIMIT } from '../src/lib/macro.js';

const key = process.env.FRED_API_KEY;
if (!key) { console.warn('FRED_API_KEY not set — skipping macro.json'); process.exit(0); }

const out = {};
for (const id of FRED_SERIES) {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&sort_order=desc&limit=${SERIES_LIMIT[id] ?? 13}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { observations } = await res.json();
    out[id] = { observations: observations.map(({ date, value }) => ({ date, value })) };
  } catch (err) {
    console.warn(`${id}: ${err.message}`);
  }
}
writeFileSync(new URL('../public/macro.json', import.meta.url), JSON.stringify(out));
console.log(`macro.json: ${Object.keys(out).length}/${FRED_SERIES.length} series`);

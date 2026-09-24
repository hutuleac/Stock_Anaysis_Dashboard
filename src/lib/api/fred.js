// FRED macroeconomic series — CPI, Fed Funds rate, unemployment, 10Y-2Y spread.
// FRED's API sends no CORS headers, so the browser cannot call it directly:
// dev goes through the Vite proxy (/fred-api → api.stlouisfed.org); production
// reads macro.json, a same-origin snapshot the deploy workflow fetches daily
// (scripts/fetch-macro.mjs) — no third-party proxy, no key in the browser.
// Failures degrade to stale cache, then null — same pattern as the CNN Fear &
// Greed fetch.

import { parseFredObservations, deriveMacroRegime, FRED_SERIES, SERIES_LIMIT } from '../macro.js';

const FRED_TTL = 86400; // 24h — these series update monthly (T10Y2Y daily)

// API key — localStorage-backed, entered in Settings (same pattern as Finnhub/TwelveData)
let apiKey = '';
export function getFredApiKey() { return apiKey; }
export function setFredApiKey(key) {
  apiKey = key;
  try { localStorage.setItem('fred_api_key', key); }
  catch (e) { console.warn('localStorage full:', e); }
}
try { apiKey = localStorage.getItem('fred_api_key') || ''; } catch { /* noop */ }

function cacheKey(seriesId) {
  return `fred_${seriesId}`;
}

function readCache(key, ttl) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < ttl * 1000) return data;
    return null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

function fredUrl(seriesId) {
  // default limit=13: thirteen monthly observations span a full year → real CPI YoY
  const limit = SERIES_LIMIT[seriesId] ?? 13;
  return `/fred-api/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=${limit}`;
}

let snapshot = null; // one macro.json request per page load
async function fetchSeriesJson(seriesId) {
  if (import.meta.env.DEV) {
    if (!apiKey) throw new Error('No FRED API key');
    const res = await fetch(fredUrl(seriesId));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  snapshot ??= fetch(`${import.meta.env.BASE_URL}macro.json`, { cache: 'no-cache' })
    .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
    .catch(err => { snapshot = null; throw err; });
  const json = (await snapshot)[seriesId];
  if (!json) throw new Error(`${seriesId} missing from macro.json`);
  return json;
}

// Returns { data: [{date, value}] newest-first | null, stale, error? }
export async function fetchFredSeries(seriesId) {
  const key = cacheKey(seriesId);
  const cached = readCache(key, FRED_TTL);
  if (cached) return { data: cached, stale: false };

  try {
    const data = parseFredObservations(await fetchSeriesJson(seriesId));
    if (!data.length) throw new Error('Unexpected FRED shape');
    writeCache(key, data);
    return { data, stale: false };
  } catch (err) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return { data: JSON.parse(raw).data, stale: true, error: err.message };
    } catch { /* noop */ }
    return { data: null, stale: true, error: err.message };
  }
}

// Fetches all four series (cache-first, parallel — FRED is a separate host,
// no Finnhub/TwelveData rate budget consumed) and derives the macro regime.
export async function fetchMacroContext() {
  const series = {};
  await Promise.all(FRED_SERIES.map(async (id) => {
    series[id] = (await fetchFredSeries(id)).data;
  }));
  return { series, regime: deriveMacroRegime(series) };
}

// Sync, startup hydrate — reads whatever is cached regardless of TTL,
// mirroring hydrateFromCache in finnhub.svelte.js. No network.
export function readMacroFromCache() {
  const series = {};
  for (const id of FRED_SERIES) {
    try {
      const raw = localStorage.getItem(cacheKey(id));
      series[id] = raw ? JSON.parse(raw).data : null;
    } catch {
      series[id] = null;
    }
  }
  return { series, regime: deriveMacroRegime(series) };
}

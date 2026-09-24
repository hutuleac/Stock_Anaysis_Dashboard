// TwelveData API — OHLCV candle series (quotes come from Finnhub)
// Indicators are computed locally from candles (see indicators.js).
// Free tier: 8 credits/min, 800/day.

import { evictStaleCache } from './finnhub.svelte.js';

const BASE = 'https://api.twelvedata.com';

const CACHE_TTL = {
  ts_1day: 86400,  // daily candles — 24h
  ts_1h:   900,    // intraday candles — 15 min
};

let tdApiKey = $state('');

export function getTDApiKey() { return tdApiKey; }
export function setTDApiKey(key) {
  tdApiKey = key;
  try { localStorage.setItem('twelvedata_api_key', key); } catch { /* noop */ }
}
export function hasTDApiKey() { return tdApiKey.length > 0; }

try {
  tdApiKey = localStorage.getItem('twelvedata_api_key') || '';
} catch { /* noop */ }

function tdCacheKey(type, symbol) {
  return `td_${type}_${symbol}`;
}

function readCache(key, ttl) {
  if (ttl === 0) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < ttl * 1000) return data;
    return null;
  } catch { return null; }
}

function writeCache(key, data) {
  // The td_ts_* series are the largest cache entries, so a quota failure here is
  // the likeliest. Self-heal via the shared eviction and retry once (the banner
  // is owned by the Finnhub module, which will also trip if space is truly gone).
  const payload = JSON.stringify({ data, ts: Date.now() });
  try {
    localStorage.setItem(key, payload);
  } catch (e) {
    if (e?.name === 'QuotaExceededError' && evictStaleCache() > 0) {
      try { localStorage.setItem(key, payload); } catch { /* still full */ }
    }
  }
}

// ── Rate limiter: sliding-window, max 8 calls per 60 s ───────────────────────
const RL_MAX    = 8;
const RL_WIN_MS = 60_000;
const _rlStamps = [];   // timestamps of calls inside the current window
const _rlQueue  = [];   // { fn, resolve, reject }
let   _rlBusy   = false;

async function _drainQueue() {
  if (_rlBusy) return;
  _rlBusy = true;
  while (_rlQueue.length) {
    const now = Date.now();
    while (_rlStamps.length && now - _rlStamps[0] >= RL_WIN_MS) _rlStamps.shift();
    if (_rlStamps.length < RL_MAX) {
      _rlStamps.push(Date.now());
      const { fn, resolve, reject } = _rlQueue.shift();
      try { resolve(await fn()); } catch (e) { reject(e); }
    } else {
      const delay = RL_WIN_MS - (Date.now() - _rlStamps[0]) + 150;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  _rlBusy = false;
}

// priority: true jumps the queue — for user-initiated requests (e.g. opening
// a chart) that shouldn't wait behind a background bulk-refresh backlog.
function enqueueRequest(fn, priority = false) {
  return new Promise((resolve, reject) => {
    const entry = { fn, resolve, reject };
    if (priority) _rlQueue.unshift(entry); else _rlQueue.push(entry);
    _drainQueue();
  });
}

async function fetchTD(path, { priority = false } = {}) {
  if (!tdApiKey) throw new Error('No TwelveData API key');
  return enqueueRequest(async () => {
    const url = `${BASE}${path}&apikey=${tdApiKey}`;
    const res = await fetch(url);
    const json = res.ok ? await res.json() : null;
    // TD can report the rate limit as HTTP 200 + { code: 429 } in the body
    if (res.status === 429 || json?.code === 429) {
      // Server-side rate limit hit — wait a full window and retry once
      await new Promise(r => setTimeout(r, 61_000));
      const r2  = await fetch(url);
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
      const j2  = await r2.json();
      if (j2.status === 'error') throw new Error(j2.message || 'TwelveData error');
      return j2;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (json.status === 'error') throw new Error(json.message || 'TwelveData error');
    return json;
  }, priority);
}

async function fetchWithCache(type, symbol, fetcher) {
  const key = tdCacheKey(type, symbol);
  const ttl = CACHE_TTL[type] || 0;
  const cached = readCache(key, ttl);
  if (cached) return { data: cached, stale: false };

  try {
    const data = await fetcher();
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

// ── OHLCV candle series ───────────────────────────────────────────────────────
// interval: '1day' | '1week' | '1h' | '4h' etc.
// outputsize: number of bars (max 5000 on free tier)
// Returns values array sorted ascending (oldest first), ready for lightweight-charts
export async function fetchTimeSeries(symbol, interval, outputsize, { priority = false } = {}) {
  const cacheType = interval === '1h' ? 'ts_1h' : 'ts_1day';
  if (interval === '1day') await seedFromSnapshot(tdCacheKey(cacheType, `${symbol}_${interval}_${outputsize}`), symbol, outputsize);
  return fetchWithCache(cacheType, `${symbol}_${interval}_${outputsize}`, async () => {
    const json = await fetchTD(
      `/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&order=ASC`,
      { priority }
    );
    if (!json.values?.length) throw new Error('No candle data');
    return json.values;
  });
}


// ── Deploy-time snapshot (scripts/fetch-candles.mjs → candles.json) ──────────
// Writes the snapshot into the cache stamped with its generation time, so the
// normal 24h TTL decides freshness: a stale or missing snapshot just falls
// through to the live fetch. Never overwrites a newer cache entry.
let snapshot = null; // one candles.json request per page load
async function seedFromSnapshot(key, symbol, outputsize) {
  if (!import.meta.env.PROD) return;
  snapshot ??= fetch(`${import.meta.env.BASE_URL}candles.json`, { cache: 'no-cache' })
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null);
  const snap = await snapshot;
  const rows = snap?.bars?.[symbol];
  if (!rows?.length) return;
  try {
    const cachedTs = JSON.parse(localStorage.getItem(key) ?? 'null')?.ts ?? 0;
    if (cachedTs >= snap.generatedAt) return;
    const data = rows.slice(-outputsize).map(([datetime, open, high, low, close, volume]) =>
      ({ datetime, open, high, low, close, volume }));
    localStorage.setItem(key, JSON.stringify({ data, ts: snap.generatedAt }));
  } catch { /* quota — the live fetch path handles eviction */ }
}

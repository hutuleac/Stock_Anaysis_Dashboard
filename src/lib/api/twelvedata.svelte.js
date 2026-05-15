// TwelveData API — real-time quote + OHLCV candle series
// Indicators are computed locally from candles (see indicators.js).
// Free tier: 8 credits/min, 800/day.

const BASE = 'https://api.twelvedata.com';

const CACHE_TTL = {
  tdquote: 60,     // 1-minute cache — prevents hammering on each refresh
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
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* quota — non-critical */ }
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

function enqueueRequest(fn) {
  return new Promise((resolve, reject) => {
    _rlQueue.push({ fn, resolve, reject });
    _drainQueue();
  });
}

async function fetchTD(path) {
  if (!tdApiKey) throw new Error('No TwelveData API key');
  return enqueueRequest(async () => {
    const url = `${BASE}${path}&apikey=${tdApiKey}`;
    const res = await fetch(url);
    if (res.status === 429) {
      // Server-side rate limit hit — wait a full window and retry once
      await new Promise(r => setTimeout(r, 61_000));
      const r2  = await fetch(url);
      if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
      const j2  = await r2.json();
      if (j2.status === 'error') throw new Error(j2.message || 'TwelveData error');
      return j2;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status === 'error') throw new Error(json.message || 'TwelveData error');
    return json;
  });
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

// ── Real-time quote ───────────────────────────────────────────────────────────
// TTL=60s — short cache prevents duplicate calls within a single refresh cycle.
export async function fetchTDQuote(symbol) {
  return fetchWithCache('tdquote', symbol, async () => {
    const json = await fetchTD(`/quote?symbol=${encodeURIComponent(symbol)}`);
    return {
      price:        parseFloat(json.close),
      change:       parseFloat(json.change),
      changePct:    parseFloat(json.percent_change),
      prevClose:    parseFloat(json.previous_close),
      volume:       parseInt(json.volume, 10),
      avgVolume:    parseInt(json.average_volume, 10),
      volumeRatio:  json.average_volume > 0
                      ? parseInt(json.volume, 10) / parseInt(json.average_volume, 10)
                      : null,
      isMarketOpen: json.is_market_open ?? null,
      high52w:      parseFloat(json.fifty_two_week?.high),
      low52w:       parseFloat(json.fifty_two_week?.low),
    };
  });
}

// ── OHLCV candle series ───────────────────────────────────────────────────────
// interval: '1day' | '1week' | '1h' | '4h' etc.
// outputsize: number of bars (max 5000 on free tier)
// Returns values array sorted ascending (oldest first), ready for lightweight-charts
export async function fetchTimeSeries(symbol, interval, outputsize) {
  const cacheType = interval === '1h' ? 'ts_1h' : 'ts_1day';
  return fetchWithCache(cacheType, `${symbol}_${interval}_${outputsize}`, async () => {
    const json = await fetchTD(
      `/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&order=ASC`
    );
    if (!json.values?.length) throw new Error('No candle data');
    return json.values;
  });
}


// TwelveData API — technical indicators layer
// Supplements Finnhub; used for RSI(14), MACD, Bollinger Bands.
// Free tier: 8 credits/min, 800/day. Each indicator call = 1 credit.

const BASE = 'https://api.twelvedata.com';

const CACHE_TTL = {
  rsi:     3600,
  macd:    3600,
  bbands:  3600,
  adx:     3600,
  stoch:   3600,
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

// ── RSI(14) ──────────────────────────────────────────────────────────────────
export async function fetchRSI(symbol) {
  return fetchWithCache('rsi', symbol, async () => {
    const json = await fetchTD(
      `/rsi?symbol=${encodeURIComponent(symbol)}&interval=1day&time_period=14&outputsize=2`
    );
    // Return last 2 values so we can detect direction
    return (json.values || []).slice(0, 2).map(v => ({
      datetime: v.datetime,
      rsi: parseFloat(v.rsi),
    }));
  });
}

// ── MACD(12,26,9) ────────────────────────────────────────────────────────────
export async function fetchMACD(symbol) {
  return fetchWithCache('macd', symbol, async () => {
    const json = await fetchTD(
      `/macd?symbol=${encodeURIComponent(symbol)}&interval=1day&fast_period=12&slow_period=26&signal_period=9&outputsize=2`
    );
    return (json.values || []).slice(0, 2).map(v => ({
      datetime: v.datetime,
      macd:       parseFloat(v.macd),
      signal:     parseFloat(v.macd_signal),
      histogram:  parseFloat(v.macd_hist),
    }));
  });
}

// ── Bollinger Bands(20,2) ────────────────────────────────────────────────────
export async function fetchBBands(symbol) {
  return fetchWithCache('bbands', symbol, async () => {
    const json = await fetchTD(
      `/bbands?symbol=${encodeURIComponent(symbol)}&interval=1day&time_period=20&sd=2&outputsize=1`
    );
    const v = json.values?.[0];
    if (!v) return null;
    return {
      datetime:   v.datetime,
      upper:      parseFloat(v.upper_band),
      middle:     parseFloat(v.middle_band),
      lower:      parseFloat(v.lower_band),
    };
  });
}

// ── ADX(14) ──────────────────────────────────────────────────────────────────
export async function fetchADX(symbol) {
  return fetchWithCache('adx', symbol, async () => {
    const json = await fetchTD(
      `/adx?symbol=${encodeURIComponent(symbol)}&interval=1day&time_period=14&outputsize=1`
    );
    const v = json.values?.[0];
    if (!v) return null;
    return { datetime: v.datetime, adx: parseFloat(v.adx) };
  });
}

// ── Stochastic(14,3,3) ───────────────────────────────────────────────────────
export async function fetchStoch(symbol) {
  return fetchWithCache('stoch', symbol, async () => {
    const json = await fetchTD(
      `/stoch?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=2`
    );
    return (json.values || []).slice(0, 2).map(v => ({
      datetime: v.datetime,
      slowK: parseFloat(v.slow_k),
      slowD: parseFloat(v.slow_d),
    }));
  });
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

// ── Fetch all indicators for one symbol ──────────────────────────────────────
// Free tier: 8 credits/min, 800/day. Each indicator call = 1 credit.
// Per ticker: RSI + MACD + BBands + ADX + Stoch = 5 credits. 6 tickers = 30 credits/refresh.
export async function fetchIndicators(symbol) {
  if (!hasTDApiKey()) return null;
  const [rsiRes, macdRes, bbRes, adxRes, stochRes, quoteRes] = await Promise.all([
    fetchRSI(symbol),
    fetchMACD(symbol),
    fetchBBands(symbol),
    fetchADX(symbol),
    fetchStoch(symbol),
    fetchTDQuote(symbol),
  ]);
  const quote = quoteRes?.data ?? null;

  const rsiCurrent  = rsiRes.data?.[0]?.rsi ?? null;
  const rsiPrev     = rsiRes.data?.[1]?.rsi ?? null;
  const macdCurrent = macdRes.data?.[0] ?? null;
  const macdPrev    = macdRes.data?.[1] ?? null;
  const bb          = bbRes.data ?? null;
  const adx         = adxRes.data?.adx ?? null;
  const stochCurr   = stochRes.data?.[0] ?? null;
  const stochPrev   = stochRes.data?.[1] ?? null;

  const stochCross = (stochCurr && stochPrev)
    ? (stochCurr.slowK > stochCurr.slowD && stochPrev.slowK <= stochPrev.slowD ? 'bullish_cross'
      : stochCurr.slowK < stochCurr.slowD && stochPrev.slowK >= stochPrev.slowD ? 'bearish_cross'
      : null)
    : null;

  return {
    rsi:  rsiCurrent,
    rsiDirection: (rsiCurrent !== null && rsiPrev !== null)
      ? (rsiCurrent > rsiPrev ? 'rising' : rsiCurrent < rsiPrev ? 'falling' : 'flat')
      : null,
    macd: macdCurrent,
    macdCrossover: (macdCurrent && macdPrev)
      ? (macdCurrent.histogram > 0 && macdPrev.histogram <= 0 ? 'bullish_cross'
        : macdCurrent.histogram < 0 && macdPrev.histogram >= 0 ? 'bearish_cross'
        : null)
      : null,
    bb,
    adx,
    stochK: stochCurr?.slowK ?? null,
    stochD: stochCurr?.slowD ?? null,
    stochCross,
    quote,
  };
}

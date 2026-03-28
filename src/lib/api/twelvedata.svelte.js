// TwelveData API — technical indicators layer
// Supplements Finnhub; used for RSI(14), MACD, Bollinger Bands.
// Free tier: 8 credits/min, 800/day. Each indicator call = 1 credit.

const BASE = 'https://api.twelvedata.com';

const CACHE_TTL = {
  rsi:   3600,   // 1 hour
  macd:  3600,
  bbands: 3600,
  tdquote: 0,    // never cache real-time quote
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

async function fetchTD(path) {
  if (!tdApiKey) throw new Error('No TwelveData API key');
  const url = `${BASE}${path}&apikey=${tdApiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.message || 'TwelveData error');
  return json;
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

// ── Real-time quote ───────────────────────────────────────────────────────────
// TTL=0 — never cached; always fresh on each refresh.
export async function fetchTDQuote(symbol) {
  try {
    const json = await fetchTD(`/quote?symbol=${encodeURIComponent(symbol)}`);
    return {
      price:         parseFloat(json.close),
      change:        parseFloat(json.change),
      changePct:     parseFloat(json.percent_change),
      prevClose:     parseFloat(json.previous_close),
      volume:        parseInt(json.volume, 10),
      avgVolume:     parseInt(json.average_volume, 10),
      volumeRatio:   json.average_volume > 0
                       ? parseInt(json.volume, 10) / parseInt(json.average_volume, 10)
                       : null,
      isMarketOpen:  json.is_market_open ?? null,
      high52w:       parseFloat(json.fifty_two_week?.high),
      low52w:        parseFloat(json.fifty_two_week?.low),
    };
  } catch {
    return null;
  }
}

// ── Fetch all indicators for one symbol ──────────────────────────────────────
export async function fetchIndicators(symbol) {
  if (!hasTDApiKey()) return null;
  const [rsiRes, macdRes, bbRes, quote] = await Promise.all([
    fetchRSI(symbol),
    fetchMACD(symbol),
    fetchBBands(symbol),
    fetchTDQuote(symbol),
  ]);

  const rsiCurrent  = rsiRes.data?.[0]?.rsi ?? null;
  const rsiPrev     = rsiRes.data?.[1]?.rsi ?? null;
  const macdCurrent = macdRes.data?.[0] ?? null;
  const macdPrev    = macdRes.data?.[1] ?? null;
  const bb          = bbRes.data ?? null;

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
    quote,
  };
}

const CACHE_TTL = {
  quote: 0,
  earnings: 86400,
  fundamentals: 604800,
  profile: 604800,
  search: 3600,
  news: 86400,
  candles: 86400,
  candles_intraday: 900, // 15 min — intraday data refreshes frequently
  feargreed:    3600,       // CNN Fear & Greed — 1 hour
  earnings_hist: 86400,    // historical earnings surprises — 24h
  smart_money: 604800,     // analyst recs + insider sentiment — 7d cache
  btc: 900,                // BTC risk-appetite proxy (Binance public API) — 15 min
};

// Prefix → max age (seconds) used ONLY to reclaim space under quota pressure.
// Mirrors the read TTLs; quote gets a 1h grace so genuinely old quotes are freed
// without churning the ones hydrateFromCache relies on at startup.
const EVICT_TTL = {
  'fh_quote_':        3600,
  'fh_earnings_':     CACHE_TTL.earnings,
  'fh_fundamentals_': CACHE_TTL.fundamentals,
  'fh_profile_':      CACHE_TTL.profile,
  'fh_news_':         CACHE_TTL.news,
  'fh_smart_money_':  CACHE_TTL.smart_money,
  'fh_candles_':      CACHE_TTL.candles,
  'td_tdquote_':      60,
  'td_ts_1day_':      86400,
  'td_ts_1h_':        900,
};

const CALL_DELAY_MS = 100;
const FH_MIN_INTERVAL = 1100; // Finnhub free: 60 calls/min → enforce 1.1s between live calls
let _fhLastCall = 0;

let apiKey = $state('');
let refreshing = $state(false);
let refreshProgress = $state({ current: 0, total: 0 });

export function getApiKey() { return apiKey; }
export function setApiKey(key) {
  apiKey = key;
  try { localStorage.setItem('finnhub_api_key', key); }
  catch (e) { console.warn('localStorage full:', e); }
}
export function isRefreshing() { return refreshing; }
export function getRefreshProgress() { return refreshProgress; }

// Initialize from localStorage
try {
  apiKey = localStorage.getItem('finnhub_api_key') || '';
} catch { /* noop */ }

function cacheKey(type, symbol) {
  return `fh_${type}_${symbol}`;
}

function readCache(key, ttl) {
  if (ttl === 0) return null;
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

let storageFullFlag = $state(false);
export function isStorageFull() { return storageFullFlag; }
export function clearStorageFullFlag() { storageFullFlag = false; }

function writeCache(key, data) {
  const payload = JSON.stringify({ data, ts: Date.now() });
  try {
    localStorage.setItem(key, payload);
  } catch (e) {
    if (e?.name === 'QuotaExceededError') {
      // Self-heal: drop expired entries and retry once before warning the user.
      if (evictStaleCache() > 0) {
        try { localStorage.setItem(key, payload); return; }
        catch { /* still full even after eviction */ }
      }
      storageFullFlag = true;
    } else {
      console.warn('localStorage write failed:', e);
    }
  }
}

// Reclaims space by deleting cache entries already past their TTL. Called on
// QuotaExceededError before surfacing the storage-full banner, so a full store
// self-heals instead of silently dropping fresh writes. Shared by the TwelveData
// module's writeCache too. Entries that are unparseable or lack a numeric ts are
// treated as junk and removed. Returns the number of keys freed.
export function evictStaleCache() {
  const now = Date.now();
  const prefixes = Object.keys(EVICT_TTL);
  const toDelete = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const prefix = prefixes.find(p => key.startsWith(p));
      if (!prefix) continue;
      let ts;
      try { ts = JSON.parse(localStorage.getItem(key))?.ts; }
      catch { toDelete.push(key); continue; }
      if (typeof ts !== 'number' || now - ts >= EVICT_TTL[prefix] * 1000) toDelete.push(key);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }
  return toDelete.length;
}

// Per-symbol cache key prefixes across Finnhub + TwelveData + score history.
// Anything after the prefix that isn't one of these tickers is orphaned — left
// over from a symbol that used to be in the watchlist or ETF proxy list and was
// later removed. 'sv_' (score-velocity history) is included because its 7-day
// self-trim only runs on write, which stops the moment a ticker is removed —
// leaving the entry to linger forever otherwise.
const PRUNE_PREFIXES = [
  'fh_quote_', 'fh_earnings_', 'fh_fundamentals_', 'fh_news_', 'fh_smart_money_', 'fh_candles_',
  'td_tdquote_', 'td_ts_1day_', 'td_ts_1h_', 'sv_',
];

// Deletes cached quotes/candles/fundamentals/news + frozen score history for
// symbols no longer tracked. Called once per app load so localStorage doesn't
// grow unbounded as tickers get added and removed over time — the actual cause
// of "storage full" recurring. Never touches macro data (fh_feargreed, fh_btc,
// fred_*), notes, watchlist, portfolio, or API keys — those aren't per-symbol.
export function pruneOrphanedCache(validSymbols) {
  const keep = new Set(validSymbols.map(s => s.toUpperCase()));
  let removed = 0;
  try {
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const prefix = PRUNE_PREFIXES.find(p => key.startsWith(p));
      if (!prefix) continue;
      const symbol = key.slice(prefix.length).match(/^([A-Z0-9.]+)/)?.[1];
      if (symbol && !keep.has(symbol)) toDelete.push(key);
    }
    toDelete.forEach(k => localStorage.removeItem(k));
    removed = toDelete.length;
  } catch { /* noop */ }
  return removed;
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFinnhub(path) {
  if (!apiKey) throw new Error('No API key configured');
  const wait = Math.max(0, FH_MIN_INTERVAL - (Date.now() - _fhLastCall));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _fhLastCall = Date.now();
  const url = `https://finnhub.io/api/v1${path}&token=${apiKey}`;
  const res = await fetch(url);
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (res.status === 403) throw new Error('FORBIDDEN'); // endpoint not available on current plan
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchWithCache(type, symbol, fetcher) {
  const key = cacheKey(type, symbol);
  const ttl = CACHE_TTL[type] || 0;
  const cached = readCache(key, ttl);
  if (cached !== null) return { data: cached, stale: false };

  // Also respect a 403 tombstone (null stored with 24h TTL)
  const tombstoneKey = `${key}_403`;
  if (readCache(tombstoneKey, 86400) === false) {
    return { data: null, stale: false, error: 'FORBIDDEN' };
  }

  try {
    const data = await fetcher();
    writeCache(key, data);
    return { data, stale: false };
  } catch (err) {
    if (err.message === 'FORBIDDEN') {
      // Cache the 403 for 24h to avoid hammering a restricted endpoint
      try { localStorage.setItem(tombstoneKey, JSON.stringify({ data: false, ts: Date.now() })); } catch { /* noop */ }
      return { data: null, stale: false, error: 'FORBIDDEN' };
    }
    // On other failures, try to return stale cache
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const { data } = JSON.parse(raw);
        return { data, stale: true, error: err.message };
      }
    } catch { /* noop */ }
    return { data: null, stale: true, error: err.message };
  }
}

async function fetchQuote(symbol) {
  return fetchWithCache('quote', symbol, () =>
    fetchFinnhub(`/quote?symbol=${encodeURIComponent(symbol)}`)
  );
}

export async function fetchProfile(symbol) {
  return fetchWithCache('profile', symbol, () =>
    fetchFinnhub(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`)
  );
}

async function fetchMetrics(symbol) {
  return fetchWithCache('fundamentals', symbol, () =>
    fetchFinnhub(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`)
  );
}

async function fetchEarnings(symbol) {
  const now = new Date();
  const from = now.toISOString().split('T')[0];
  const to = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0];
  return fetchWithCache('earnings', symbol, () =>
    fetchFinnhub(`/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}`)
  );
}


async function fetchNews(symbol) {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  const from = new Date(now - 7 * 86400000).toISOString().split('T')[0];
  return fetchWithCache('news', symbol, () =>
    fetchFinnhub(`/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`)
  );
}

export async function fetchCandles(symbol, resolution = 'D', fromTs, toTs) {
  if (!fromTs) fromTs = Math.floor((Date.now() - 180 * 86400000) / 1000);
  if (!toTs) toTs = Math.floor(Date.now() / 1000);
  const isIntraday = resolution !== 'D' && resolution !== 'W' && resolution !== 'M';
  const cacheType = isIntraday ? 'candles_intraday' : 'candles';
  return fetchWithCache(cacheType, `${symbol}_${resolution}`, () =>
    fetchFinnhub(`/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&from=${fromTs}&to=${toTs}`)
  );
}

// ── Smart money: analyst recommendations + insider sentiment ─────────────────
// Two free endpoints, one cache entry (7d). rec.buyRatio = (strongBuy+buy)/total
// for the latest month; deteriorating = ratio dropped >5pts vs prior month.
// mspr3m = mean insider MSPR over the 3 most recent months (>0 = net buying).
export async function fetchSmartMoney(symbol) {
  return fetchWithCache('smart_money', symbol, async () => {
    const rec = await fetchFinnhub(`/stock/recommendation?symbol=${encodeURIComponent(symbol)}`)
      .catch(() => null);
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 200 * 86400000).toISOString().split('T')[0];
    const ins = await fetchFinnhub(`/stock/insider-sentiment?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`)
      .catch(() => null);

    let recOut = null;
    if (Array.isArray(rec) && rec.length) {
      const ratio = (r) => {
        const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
        return total > 0 ? (r.strongBuy + r.buy) / total : null;
      };
      const curr = ratio(rec[0]);
      const prev = rec.length > 1 ? ratio(rec[1]) : null;
      if (curr !== null) {
        recOut = {
          buyRatio: Math.round(curr * 100) / 100,
          deteriorating: prev !== null && curr < prev - 0.05,
        };
      }
    }

    let mspr3m = null;
    const months = ins?.data;
    if (Array.isArray(months) && months.length) {
      const last3 = months.slice(-3).map(m => m.mspr).filter(v => typeof v === 'number');
      if (last3.length) mspr3m = Math.round((last3.reduce((s, v) => s + v, 0) / last3.length) * 10) / 10;
    }

    return (recOut || mspr3m !== null) ? { rec: recOut, mspr3m } : null;
  });
}

export async function searchTicker(query) {
  if (!query || query.length < 1) return [];
  return fetchWithCache('search', query, async () => {
    const result = await fetchFinnhub(`/search?q=${encodeURIComponent(query)}`);
    // Filter to common stocks + ADRs on US exchanges (no dot = no foreign suffixes)
    return (result.result || []).filter(r =>
      (r.type === 'Common Stock' || r.type === 'ADR') && !r.symbol.includes('.')
    ).slice(0, 10);
  });
}

// Hydrate all cached data for symbols without TTL checks (startup, no API calls)
export function hydrateFromCache(symbols) {
  const results = {};
  for (const symbol of symbols) {
    const readStale = (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw).data;
      } catch { return null; }
    };
    results[symbol] = {
      quote:          { data: readStale(cacheKey('quote', symbol)),                stale: true },
      earnings:       { data: readStale(cacheKey('earnings', symbol)),             stale: true },
      metrics:        { data: readStale(cacheKey('fundamentals', symbol)),         stale: true },
      smartMoney:     { data: readStale(cacheKey('smart_money', symbol)),          stale: true },
      news:           { data: readStale(cacheKey('news', symbol)),                 stale: true },
      _candlesDaily:  readStale(cacheKey('candles', `${symbol}_D`)),
      _candlesWeekly: readStale(cacheKey('candles', `${symbol}_W`)),
    };
  }
  return results;
}

export async function refreshAll(symbols, onProgress) {
  refreshing = true;
  refreshProgress = { current: 0, total: symbols.length };
  const results = {};

  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    refreshProgress = { current: i + 1, total: symbols.length };
    onProgress?.(refreshProgress);

    const quote         = await fetchQuote(symbol);        await delay(CALL_DELAY_MS);
    const earnings      = await fetchEarnings(symbol);     await delay(CALL_DELAY_MS);
    const metrics       = await fetchMetrics(symbol);      await delay(CALL_DELAY_MS);
    const news          = await fetchNews(symbol);

    results[symbol] = { quote, earnings, metrics, news };

    if (i < symbols.length - 1) await delay(CALL_DELAY_MS);
  }

  refreshing = false;
  refreshProgress = { current: 0, total: 0 };
  return results;
}

// Sector → ETF mapping
const SECTOR_ETF_MAP = {
  'Technology': 'XLK',
  'Financial Services': 'XLF',
  'Financials': 'XLF',
  'Healthcare': 'XLV',
  'Consumer Cyclical': 'XLY',
  'Consumer Discretionary': 'XLY',
  'Consumer Defensive': 'XLP',
  'Consumer Staples': 'XLP',
  'Energy': 'XLE',
  'Industrials': 'XLI',
  'Basic Materials': 'XLB',
  'Materials': 'XLB',
  'Utilities': 'XLU',
  'Real Estate': 'XLRE',
  'Communication Services': 'XLC',
};

export function getSectorETF(sector) {
  return SECTOR_ETF_MAP[sector] || 'SPY';
}

export async function fetchSectorETFQuote(sector) {
  const etf = getSectorETF(sector);
  return fetchQuote(etf);
}

// ── Historical Earnings Surprises ────────────────────────────────────────────
// Returns array of { period, actual, estimate, surprisePercent, ... } for chart markers.
export async function fetchHistoricalEarnings(symbol, limit = 8) {
  return fetchWithCache('earnings_hist', symbol, async () => {
    const data = await fetchFinnhub(`/stock/earnings?symbol=${encodeURIComponent(symbol)}&limit=${limit}`);
    return Array.isArray(data) ? data : [];
  });
}

// ── CNN Fear & Greed Index ────────────────────────────────────────────────────
// Returns { score: 0–100, rating: string } or null on failure.
async function fetchFearAndGreed() {
  const key = 'fh_feargreed_market';
  const ttl = CACHE_TTL.feargreed;
  const cached = readCache(key, ttl);
  if (cached) return { data: cached, stale: false };

  try {
    const res  = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const fg   = json.fear_and_greed;
    if (!fg?.score) throw new Error('Unexpected F&G shape');
    const data = { score: Math.round(fg.score), rating: fg.rating ?? 'Unknown' };
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

// ── BTC risk-appetite proxy ───────────────────────────────────────────────────
// Binance public REST — keyless, CORS-enabled, no Finnhub budget consumed.
// Crypto reacts to risk sentiment faster than equities; a sharp BTC move is an
// early canary. Returns { price, dp } (dp = 24h % change) or null on failure.
async function fetchBtcQuote() {
  const key = 'fh_btc_market';
  const cached = readCache(key, CACHE_TTL.btc);
  if (cached) return { data: cached, stale: false };

  try {
    const res  = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const price = parseFloat(json.lastPrice);
    const dp    = parseFloat(json.priceChangePercent);
    if (!Number.isFinite(price) || !Number.isFinite(dp)) throw new Error('Unexpected Binance shape');
    const data = { price, dp };
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

// All unique sector ETFs for market context
const ALL_SECTOR_ETFS = ['XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLE', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC'];

export async function fetchMarketContext() {
  // No VIX quote here — Finnhub free tier returns zeros for VIX and errors for
  // ^GSPC. The volatility regime is computed from SPY closes (realizedVol).
  const spyQuote = await fetchQuote('SPY');
  await delay(CALL_DELAY_MS);

  // Fear & Greed (non-blocking — CORS may fail on some networks)
  const fearGreed = await fetchFearAndGreed().catch(() => ({ data: null, stale: true }));
  await delay(CALL_DELAY_MS);

  // BTC risk-appetite proxy (non-blocking, keyless — Binance public API)
  const btc = await fetchBtcQuote().catch(() => ({ data: null, stale: true }));

  // Fetch all sector ETFs
  const sectorResults = {};
  for (const etf of ALL_SECTOR_ETFS) {
    sectorResults[etf] = await fetchQuote(etf);
    await delay(CALL_DELAY_MS);
  }

  return { spy: spyQuote, fearGreed, btc, sectors: sectorResults };
}

const CACHE_TTL = {
  quote: 0,
  earnings: 86400,
  fundamentals: 604800,
  profile: 604800,
  search: 3600,
  news: 86400,
  candles: 86400,
  candles_intraday: 900, // 15 min — intraday data refreshes frequently
  insider: 604800,
  feargreed:    3600,       // CNN Fear & Greed — 1 hour
  earnings_hist: 86400,    // historical earnings surprises — 24h
};

const CALL_DELAY_MS = 100;

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
  try {
    localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    if (e.name === 'QuotaExceededError') storageFullFlag = true;
    else console.warn('localStorage write failed:', e);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchFinnhub(path) {
  if (!apiKey) throw new Error('No API key configured');
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

export async function fetchQuote(symbol) {
  return fetchWithCache('quote', symbol, () =>
    fetchFinnhub(`/quote?symbol=${encodeURIComponent(symbol)}`)
  );
}

export async function fetchProfile(symbol) {
  return fetchWithCache('profile', symbol, () =>
    fetchFinnhub(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`)
  );
}

export async function fetchMetrics(symbol) {
  return fetchWithCache('fundamentals', symbol, () =>
    fetchFinnhub(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`)
  );
}

export async function fetchEarnings(symbol) {
  const now = new Date();
  const from = now.toISOString().split('T')[0];
  const to = new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0];
  return fetchWithCache('earnings', symbol, () =>
    fetchFinnhub(`/calendar/earnings?from=${from}&to=${to}&symbol=${encodeURIComponent(symbol)}`)
  );
}

export async function fetchPriceTarget(symbol) {
  return fetchWithCache('fundamentals', `pt_${symbol}`, () =>
    fetchFinnhub(`/stock/price-target?symbol=${encodeURIComponent(symbol)}`)
  );
}

export async function fetchNews(symbol) {
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

export async function fetchInsiderTransactions(symbol) {
  const now = new Date();
  const to = now.toISOString().split('T')[0];
  const from = new Date(now - 90 * 86400000).toISOString().split('T')[0];
  return fetchWithCache('insider', symbol, () =>
    fetchFinnhub(`/stock/insider-transactions?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`)
  );
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
      priceTarget:    { data: readStale(cacheKey('fundamentals', `pt_${symbol}`)), stale: true },
      news:           { data: readStale(cacheKey('news', symbol)),                 stale: true },
      insider:        { data: readStale(cacheKey('insider', symbol)),              stale: true },
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

    const [quote, earnings, metrics, priceTarget, news, insider] = await Promise.all([
      fetchQuote(symbol),
      fetchEarnings(symbol),
      fetchMetrics(symbol),
      fetchPriceTarget(symbol),
      fetchNews(symbol),
      fetchInsiderTransactions(symbol),
    ]);

    results[symbol] = { quote, earnings, metrics, priceTarget, news, insider };

    if (i < symbols.length - 1) await delay(CALL_DELAY_MS);
  }

  refreshing = false;
  refreshProgress = { current: 0, total: 0 };
  return results;
}

// Sector → ETF mapping
export const SECTOR_ETF_MAP = {
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
export async function fetchFearAndGreed() {
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

// All unique sector ETFs for market context
const ALL_SECTOR_ETFS = ['XLK', 'XLF', 'XLV', 'XLY', 'XLP', 'XLE', 'XLI', 'XLB', 'XLU', 'XLRE', 'XLC'];

export async function fetchMarketContext() {
  const [vixQuote, spyQuote] = await Promise.all([
    fetchQuote('^GSPC').catch(() => fetchQuote('SPY')), // VIX via SPY fallback
    fetchQuote('SPY'),
  ]);
  await delay(CALL_DELAY_MS);

  const vixResult = await fetchQuote('VIX').catch(() => ({ data: null, stale: true }));
  await delay(CALL_DELAY_MS);

  // Fear & Greed (non-blocking — CORS may fail on some networks)
  const fearGreed = await fetchFearAndGreed().catch(() => ({ data: null, stale: true }));
  await delay(CALL_DELAY_MS);

  // Fetch all sector ETFs
  const sectorResults = {};
  for (const etf of ALL_SECTOR_ETFS) {
    sectorResults[etf] = await fetchQuote(etf);
    await delay(CALL_DELAY_MS);
  }

  return { vix: vixResult, spy: spyQuote, fearGreed, sectors: sectorResults };
}

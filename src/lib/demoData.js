// Hardcoded demo data shown on first open when no API keys are configured.
// All values are realistic but fictional — for illustration only.

export const DEMO_TICKERS = [
  { symbol: 'AAPL', name: 'Apple Inc.',        sector: 'Technology',            sectorETF: 'XLK' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',       sector: 'Technology',            sectorETF: 'XLK' },
  { symbol: 'TSLA', name: 'Tesla Inc.',         sector: 'Consumer Cyclical',     sectorETF: 'XLY' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.',    sector: 'Consumer Cyclical',     sectorETF: 'XLY' },
  { symbol: 'MSFT', name: 'Microsoft Corp.',    sector: 'Technology',            sectorETF: 'XLK' },
];

export const DEMO_MARKET_DATA = {
  AAPL: {
    quote:       { data: { c: 214.50, d: -2.61, dp: -1.2,  pc: 217.11 }, stale: true },
    earnings:    { data: { earningsCalendar: [{ date: '2026-07-24', symbol: 'AAPL' }] }, stale: true },
    metrics:     { data: { metric: { revenueGrowthTTMYoy: 6.4, netProfitMarginTTM: 26.3,  marketCapitalization: 3200, peNormalizedAnnual: 31.2, peBasicExclExtraTTM: 31.2, epsGrowthTTMYoy: 7.8, epsGrowth3Y: 12.4, '50DayMovingAverage': 221.80, '200DayMovingAverage': 206.40, '52WeekHigh': 237.49, '52WeekLow': 164.08, beta: 1.24, dividendYieldIndicatedAnnual: 0.44 } }, stale: true },
    news:          { data: [], stale: true },
    indicators:    { rsi: 47.3, rsiDirection: 'falling', rsiZScore: -0.7, macd: { macd: -0.42, signal: -0.18, histogram: -0.24 }, macdCrossover: null, adx: 24.1, stochK: 34.2, stochD: 38.5, stochCross: null, bb: { upper: 228.5, middle: 214.0, lower: 199.5 }, ema20: 216.8, ema50: 221.80, ema200: 206.40, source: 'demo' },
    tdQuote:       { volume: 58_200_000, avgVolume: 62_000_000, volumeRatio: 0.94 },
    weekly:        { trend: 'down', rsi: 44.2, ema10: 218.5, aboveEma: false, atr: 4.2, macd: { macd: -1.2, signal: -0.8, histogram: -0.4 } },
    sectorMomentum: 1.4,
  },
  NVDA: {
    quote:         { data: { c: 875.40, d: 20.62, dp: 2.4,   pc: 854.78 }, stale: true },
    earnings:      { data: { earningsCalendar: [{ date: '2026-05-28', symbol: 'NVDA' }] }, stale: true },
    metrics:       { data: { metric: { revenueGrowthTTMYoy: 44.2, netProfitMarginTTM: 51.8,  marketCapitalization: 2150, peNormalizedAnnual: 68.4, peBasicExclExtraTTM: 68.4, epsGrowthTTMYoy: 112.5, epsGrowth3Y: 84.2, '50DayMovingAverage': 845.20, '200DayMovingAverage': 712.80, '52WeekHigh': 974.00, '52WeekLow': 460.30, beta: 1.93 } }, stale: true },
    news:          { data: [], stale: true },
    indicators:    { rsi: 62.1, rsiDirection: 'rising', rsiZScore: 1.2, macd: { macd: 1.82, signal: 1.24, histogram: 0.58 }, macdCrossover: null, adx: 31.5, stochK: 71.3, stochD: 65.2, stochCross: 'bullish_cross', bb: { upper: 910.0, middle: 850.0, lower: 790.0 }, ema20: 862.0, ema50: 845.20, ema200: 712.80, source: 'demo' },
    tdQuote:       { volume: 45_800_000, avgVolume: 38_500_000, volumeRatio: 1.19 },
    weekly:        { trend: 'up', rsi: 65.4, ema10: 840.0, aboveEma: true, atr: 18.4, macd: { macd: 3.8, signal: 2.1, histogram: 1.7 } },
    sectorMomentum: 1.4,
  },
  TSLA: {
    quote:         { data: { c: 248.80, d: -2.01, dp: -0.8,  pc: 250.81 }, stale: true },
    earnings:      { data: { earningsCalendar: [{ date: '2026-04-22', symbol: 'TSLA' }] }, stale: true },
    metrics:       { data: { metric: { revenueGrowthTTMYoy: 4.0, netProfitMarginTTM: 6.4,  marketCapitalization: 795, peNormalizedAnnual: 58.7, peBasicExclExtraTTM: 58.7, epsGrowthTTMYoy: 14.2, epsGrowth3Y: 62.1, '50DayMovingAverage': 255.40, '200DayMovingAverage': 231.10, '52WeekHigh': 299.29, '52WeekLow': 138.80, beta: 2.31 } }, stale: true },
    news:          { data: [], stale: true },
    indicators:    { rsi: 51.4, rsiDirection: 'flat', rsiZScore: 0.1, macd: { macd: 0.08, signal: 0.02, histogram: 0.06 }, macdCrossover: null, adx: 18.9, stochK: 52.4, stochD: 54.1, stochCross: null, bb: { upper: 268.0, middle: 248.5, lower: 229.0 }, ema20: 251.2, ema50: 255.40, ema200: 231.10, source: 'demo' },
    tdQuote:       { volume: 89_400_000, avgVolume: 95_000_000, volumeRatio: 0.94 },
    weekly:        { trend: 'neutral', rsi: 51.0, ema10: 252.0, aboveEma: false, atr: 7.8, macd: { macd: 0.4, signal: 0.6, histogram: -0.2 } },
    sectorMomentum: -0.6,
  },
  AMZN: {
    quote:         { data: { c: 196.40, d: 0.59,  dp: 0.3,   pc: 195.81 }, stale: true },
    earnings:      { data: { earningsCalendar: [{ date: '2026-04-30', symbol: 'AMZN' }] }, stale: true },
    metrics:       { data: { metric: { marketCapitalization: 2100, peNormalizedAnnual: 42.8, peBasicExclExtraTTM: 42.8, epsGrowthTTMYoy: 58.4, epsGrowth3Y: 38.7, revenueGrowthTTMYoy: 12.5, netProfitMarginTTM: 8.1, '50DayMovingAverage': 190.50, '200DayMovingAverage': 178.20, '52WeekHigh': 218.71, '52WeekLow': 151.61, beta: 1.14 } }, stale: true },
    news:          { data: [], stale: true },
    smartMoney:    { data: { rec: { buyRatio: 0.72, deteriorating: false }, mspr3m: 8.4 }, stale: true },
    indicators:    { rsi: 54.8, rsiDirection: 'rising', rsiZScore: 0.4, macd: { macd: 0.42, signal: 0.18, histogram: 0.24 }, macdCrossover: null, adx: 27.3, stochK: 58.2, stochD: 52.1, stochCross: 'bullish_cross', bb: { upper: 210.0, middle: 193.5, lower: 177.0 }, ema20: 194.8, ema50: 190.50, ema200: 178.20, source: 'demo' },
    tdQuote:       { volume: 32_100_000, avgVolume: 35_800_000, volumeRatio: 0.90 },
    weekly:        { trend: 'up', rsi: 57.2, ema10: 191.0, aboveEma: true, atr: 5.1, macd: { macd: 0.9, signal: 0.5, histogram: 0.4 } },
    sectorMomentum: -0.6,
  },
  MSFT: {
    quote:         { data: { c: 378.90, d: -1.91, dp: -0.5,  pc: 380.81 }, stale: true },
    earnings:      { data: { earningsCalendar: [{ date: '2026-04-29', symbol: 'MSFT' }] }, stale: true },
    metrics:       { data: { metric: { marketCapitalization: 2815, peNormalizedAnnual: 34.1, peBasicExclExtraTTM: 34.1, epsGrowthTTMYoy: 21.3, epsGrowth3Y: 18.9, revenueGrowthTTMYoy: 14.8, netProfitMarginTTM: 35.6, '50DayMovingAverage': 373.80, '200DayMovingAverage': 352.40, '52WeekHigh': 420.82, '52WeekLow': 309.45, beta: 0.91, dividendYieldIndicatedAnnual: 0.68 } }, stale: true },
    news:          { data: [], stale: true },
    smartMoney:    { data: { rec: { buyRatio: 0.81, deteriorating: false }, mspr3m: 15.2 }, stale: true },
    indicators:    { rsi: 53.2, rsiDirection: 'flat', rsiZScore: 0.2, roc20: -5.5, roc60: -9.2, macd: { macd: 0.68, signal: 0.42, histogram: 0.26 }, macdCrossover: null, adx: 29.4, stochK: 61.4, stochD: 58.7, stochCross: null, bb: { upper: 395.0, middle: 375.0, lower: 355.0 }, ema20: 377.4, ema50: 373.80, ema200: 352.40, source: 'demo' },
    tdQuote:       { volume: 18_700_000, avgVolume: 22_400_000, volumeRatio: 0.83 },
    weekly:        { trend: 'up', rsi: 56.1, ema10: 374.0, aboveEma: true, atr: 6.8, macd: { macd: 1.4, signal: 0.9, histogram: 0.5 } },
    sectorMomentum: 1.4,
  },
};

export const DEMO_MARKET_CONTEXT = {
  volProxy:  22.4,
  spyBelowEma50: true,
  spy:       { data: { c: 534.20, dp: -0.8 } },
  fearGreed: { data: { score: 38, rating: 'Fear' } },
  btc:       { data: { price: 61840, dp: -2.3 } },
  macro:     { curveInverted: false, fedRising: false, t10y2y: 0.35, fedFunds: 3.63, fedFundsPrev: 3.63, cpi: 320.6, cpiYoY: 2.4, unemployment: 4.1 },
  sectors: {
    XLK:  { data: { dp: -1.1 } },
    XLF:  { data: { dp:  0.4 } },
    XLV:  { data: { dp:  0.2 , end: 145 } },
    XLY:  { data: { dp: -0.9 } },
    XLP:  { data: { dp:  0.6 } },
    XLE:  { data: { dp: -0.3 , end: 92 } },
    XLI:  { data: { dp: -0.5 } },
    XLB:  { data: { dp: -0.2 } },
    XLU:  { data: { dp:  0.8 } },
    XLRE: { data: { dp:  0.1 } },
    XLC:  { data: { dp: -0.7 } },
  },
  breadth: {
    ema50:  { above: 3, total: 5 },
    ema200: { above: 5, total: 5 },
  },
};

// ─── Synthetic price history ────────────────────────────────────────────────
// The scoring engines need real candle series to produce anything: without them
// demo mode showed empty Setup Radar / Dip Hunter / Long-Term / ETF panels, so a
// visitor without API keys saw about a third of the dashboard. Rather than
// hardcode thousands of OHLCV literals, generate them from a seeded PRNG — the
// series are deterministic (same every load, so screenshots and tests are
// stable) and are fed through the *real* engines, not faked outputs.

// mulberry32 — small, deterministic, good enough for fixtures.
function prng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Drift per bar across the series, as a function of progress 0→1. These shapes are
// what make the panels show different states: a 'dip' name reaches the Long-Term
// ACCUMULATE gate, an 'uptrend' name triggers the Momentum setup, and so on.
const SHAPES = {
  uptrend:   (p) => 0.0011,
  pullback:  (p) => (p < 0.75 ? 0.0015 : -0.0022),          // rally, then a shallow fade
  dip:       (p) => (p < 0.45 ? 0.0016 : p < 0.85 ? -0.0032 : 0.0009), // top, slide, turn
  downtrend: (p) => -0.0018,
  range:     (p) => Math.sin(p * Math.PI * 4) * 0.0016,      // chop, no net trend
};

const DAY = 86400;

// A random walk never produces the confluence the setup engine looks for, so the
// last ~40 bars of two shapes are scripted: 'dip' ends in a lower low on lighter
// volume (bullish divergence + dry-up), 'uptrend' ends in a tight range that
// breaks out on expanding volume (squeeze resolution + structure breakout). Without
// this every demo ticker reads WAIT 0.0 and Setup Radar stays empty.
function overwriteTail(c, bars, fn) {
  const n = c.c.length;
  for (let i = 0; i < bars; i++) {
    const k = n - bars + i;
    const { close, volume } = fn(i / (bars - 1), c.c[n - bars - 1]);
    const prev = c.c[k - 1];
    c.o[k] = +prev.toFixed(2);
    c.c[k] = +close.toFixed(2);
    c.h[k] = +(Math.max(prev, close) * 1.006).toFixed(2);
    c.l[k] = +(Math.min(prev, close) * 0.994).toFixed(2);
    c.v[k] = Math.round(volume);
  }
}

const TAILS = {
  // Bounce, then a deeper retest that RSI doesn't confirm, on drying volume.
  dip: (c, rand) => overwriteTail(c, 120, (p, base) => {
    const path = p < 0.40 ? 1 + p * 0.50             // relief bounce off the low
               : p < 0.93 ? 1.20 - (p - 0.40) * 0.79  // retest, to a lower low
               : 0.78 + (p - 0.93) * 0.30;            // first tick up — not a trend yet
    return { close: base * path * (1 + (rand() - 0.5) * 0.012), volume: (3.6 - p * 2.2) * 1e7 };
  }),
  // Tight range, then a breakout above it on expanding volume.
  uptrend: (c, rand) => overwriteTail(c, 120, (p, base) => {
    const path = p < 0.82
      ? 1 + Math.sin(p * Math.PI * 3) * 0.012        // squeeze: ±1.2% for ~18 weeks
      : 1 + (p - 0.82) * 1.4;                        // breakout over ~5 weeks
    return { close: base * path * (1 + (rand() - 0.5) * 0.004), volume: (p < 0.82 ? 1.5 : 4.6) * 1e7 };
  }),
};

// Daily OHLCV in the Finnhub candle shape, oldest→newest, ending today.
// `end` rescales the finished series so its last close lands exactly on the price
// in DEMO_MARKET_DATA — otherwise the chart would disagree with the quote above it.
function demoCandles(symbol, { bars = 260, start, vol = 0.014, shape = 'range', end = null, noTail = false }) {
  const rand = prng([...symbol].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7) >>> 0);
  const drift = SHAPES[shape] ?? SHAPES.range;
  const out = { s: 'ok', t: [], o: [], h: [], l: [], c: [], v: [] };
  const t0 = Math.floor(Date.now() / 1000 / DAY) * DAY - bars * DAY;
  let price = start;
  for (let i = 0; i < bars; i++) {
    const open = price;
    price = Math.max(1, price * (1 + drift(i / bars) + (rand() - 0.5) * 2 * vol));
    const hi = Math.max(open, price) * (1 + rand() * vol * 0.6);
    const lo = Math.min(open, price) * (1 - rand() * vol * 0.6);
    out.t.push(t0 + i * DAY);
    out.o.push(+open.toFixed(2));
    out.h.push(+hi.toFixed(2));
    out.l.push(+lo.toFixed(2));
    out.c.push(+price.toFixed(2));
    // Volume rises as price falls — gives the capitulation/dry-up components something to read.
    out.v.push(Math.round((2 + rand() * 1.5 + (price < open ? 0.8 : 0)) * 1e7));
  }
  if (TAILS[shape] && !noTail) TAILS[shape](out, rand);
  if (end) {
    const k = end / out.c[out.c.length - 1];
    for (const key of ['o', 'h', 'l', 'c']) out[key] = out[key].map(v => +(v * k).toFixed(2));
  }
  return out;
}

// Shape per symbol chosen so the panels demonstrate different states side by side:
// MSFT trends, NVDA is the deep dip, TSLA is the falling knife, AMZN is pulling
// back, AAPL is going nowhere.
const DEMO_SHAPES = {
  AAPL: { start: 205, shape: 'range',     vol: 0.013 , end: 214.5 },
  NVDA: { start: 1180, shape: 'dip',      vol: 0.026 , end: 875.4 },
  TSLA: { start: 330, shape: 'downtrend', vol: 0.028 , end: 248.8 },
  AMZN: { start: 175, shape: 'pullback',  vol: 0.015 , end: 196.4 },
  MSFT: { start: 330, shape: 'uptrend',   vol: 0.012 , end: 378.9 },
  // ETF proxies (etflist.svelte.js HARDCODED_ETFS)
  SPY:  { start: 505, shape: 'uptrend',   vol: 0.009, noTail: true , end: 505 }, // the RS benchmark — a breakout here would cancel every ticker's RS
  QQQ:  { start: 430, shape: 'uptrend',   vol: 0.012 , end: 430 },
  RSP:  { start: 165, shape: 'range',     vol: 0.009 , end: 165 },
  SMH:  { start: 245, shape: 'dip',       vol: 0.022 , end: 245 },
  THNQ: { start: 38,  shape: 'pullback',  vol: 0.018 , end: 38 },
  BOTZ: { start: 31,  shape: 'range',     vol: 0.016 , end: 31 },
  XLE:  { start: 92,  shape: 'dip',       vol: 0.015 },
  ICLN: { start: 14,  shape: 'downtrend', vol: 0.019 , end: 14 },
  XLV:  { start: 145, shape: 'range',     vol: 0.010 },
  IGV:  { start: 82,  shape: 'uptrend',   vol: 0.017 , end: 82 },
  SOXL: { start: 42,  shape: 'dip',       vol: 0.055 , end: 42 },
  TQQQ: { start: 58,  shape: 'uptrend',   vol: 0.035 , end: 58 },
};

export const DEMO_CANDLES = Object.fromEntries(
  Object.entries(DEMO_SHAPES).map(([sym, cfg]) => [sym, demoCandles(sym, cfg)])
);

// Quality Score and revenue history normally arrive from the financials-reported
// endpoint on row expand. Faking that raw payload would be a page of XBRL-ish
// noise, so the computed results are hardcoded — the shape computeQualityScore
// and parseRevenueHistory return.
export const DEMO_QUALITY = {
  AAPL: { total: 82, label: 'HIGH',     components: { profitability: 26, cashFlow: 22, balanceSheet: 20, shareholderReturn: 9, earningsQuality: 5 } },
  NVDA: { total: 71, label: 'GOOD',     components: { profitability: 28, cashFlow: 20, balanceSheet: 16, shareholderReturn: 4, earningsQuality: 3 } },
  TSLA: { total: 48, label: 'MODERATE', components: { profitability: 14, cashFlow: 11, balanceSheet: 17, shareholderReturn: 1, earningsQuality: 5 } },
  AMZN: { total: 66, label: 'GOOD',     components: { profitability: 18, cashFlow: 21, balanceSheet: 18, shareholderReturn: 2, earningsQuality: 7 } },
  MSFT: { total: 88, label: 'HIGH',     components: { profitability: 28, cashFlow: 24, balanceSheet: 22, shareholderReturn: 9, earningsQuality: 5 } },
};

export const DEMO_REVENUE_HISTORY = {
  AAPL: [{ year: 2022, revenue: 394.3e9, growthPct: null }, { year: 2023, revenue: 383.3e9, growthPct: -2.8 }, { year: 2024, revenue: 391.0e9, growthPct: 2.0 }, { year: 2025, revenue: 416.2e9, growthPct: 6.4 }, { year: 2026, revenue: 438.7e9, growthPct: 5.4 }],
  NVDA: [{ year: 2022, revenue: 26.9e9, growthPct: null }, { year: 2023, revenue: 27.0e9, growthPct: 0.4 }, { year: 2024, revenue: 60.9e9, growthPct: 125.6 }, { year: 2025, revenue: 130.5e9, growthPct: 114.3 }, { year: 2026, revenue: 188.2e9, growthPct: 44.2 }],
  TSLA: [{ year: 2022, revenue: 81.5e9, growthPct: null }, { year: 2023, revenue: 96.8e9, growthPct: 18.8 }, { year: 2024, revenue: 97.7e9, growthPct: 0.9 }, { year: 2025, revenue: 95.3e9, growthPct: -2.5 }, { year: 2026, revenue: 99.1e9, growthPct: 4.0 }],
  AMZN: [{ year: 2022, revenue: 514.0e9, growthPct: null }, { year: 2023, revenue: 574.8e9, growthPct: 11.8 }, { year: 2024, revenue: 638.0e9, growthPct: 11.0 }, { year: 2025, revenue: 706.1e9, growthPct: 10.7 }, { year: 2026, revenue: 775.4e9, growthPct: 9.8 }],
  MSFT: [{ year: 2022, revenue: 198.3e9, growthPct: null }, { year: 2023, revenue: 211.9e9, growthPct: 6.9 }, { year: 2024, revenue: 245.1e9, growthPct: 15.7 }, { year: 2025, revenue: 281.7e9, growthPct: 14.9 }, { year: 2026, revenue: 319.0e9, growthPct: 13.2 }],
};

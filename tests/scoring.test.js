import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeScore,
  scoreNewsHeadlines,
  setMarketContext,
  generateThesis,
  getDaysToEarnings,
  getBadgeStyle,
  computeScoreZScore,
  storeScoreSnapshot,
  getScoreHistory,
  getScoreVelocity,
} from '../src/lib/scoring.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTicker({
  price = 100,
  dp = 1,
  ema50 = null,
  ema200 = null,
  pe = null,
  epsGrowth = null,
  rsi = null,
  macd = null,
  macdCrossover = null,
  adx = null,
  stochK = null,
  stochCross = null,
  high52 = null,
  low52 = null,
  sectorTrend = null,
  insider = null,
  news = null,
} = {}) {
  return {
    quote: { data: { c: price, dp } },
    metrics: {
      data: {
        metric: {
          ...(ema50   != null && { '50DayMovingAverage':  ema50 }),
          ...(ema200  != null && { '200DayMovingAverage': ema200 }),
          ...(pe      != null && { peNormalizedAnnual: pe }),
          ...(epsGrowth != null && { epsGrowthTTMYoy: epsGrowth }),
          ...(high52  != null && { '52WeekHigh': high52 }),
          ...(low52   != null && { '52WeekLow':  low52 }),
        },
      },
    },
    news: news ?? null,
    sectorTrend,
    insider: insider ?? null,
    indicators: {
      rsi,
      macd: macd ? { histogram: macd.histogram, macd: macd.macd, signal: macd.signal } : null,
      macdCrossover,
      adx,
      stochK,
      stochCross,
    },
  };
}

// localStorage mock
const store = {};
const localStorageMock = {
  getItem: vi.fn(k => store[k] ?? null),
  setItem: vi.fn((k, v) => { store[k] = v; }),
  removeItem: vi.fn(k => { delete store[k]; }),
  clear: vi.fn(() => { Object.keys(store).forEach(k => delete store[k]); }),
};
vi.stubGlobal('localStorage', localStorageMock);

beforeEach(() => {
  localStorageMock.clear();
  setMarketContext(null);
});

// ─── scoreNewsHeadlines ───────────────────────────────────────────────────────

describe('scoreNewsHeadlines', () => {
  it('returns null with no news', () => {
    expect(scoreNewsHeadlines(null)).toBeNull();
    expect(scoreNewsHeadlines({ data: [] })).toBeNull();
  });

  it('returns 0.5 for neutral headlines', () => {
    const news = { data: [{ headline: 'Company holds annual meeting', summary: '' }] };
    const result = scoreNewsHeadlines(news);
    expect(result).toBeCloseTo(0.5, 5); // score=0, (0+3)/6 = 0.5
  });

  it('returns a high value for bullish headlines', () => {
    const news = {
      data: [
        { headline: 'Company beats earnings, raises guidance, record profit', summary: 'strong growth rally' },
        { headline: 'Stock upgrade by analysts, outperform rating', summary: 'positive boost' },
      ],
    };
    const result = scoreNewsHeadlines(news);
    expect(result).toBeGreaterThan(0.5);
  });

  it('returns a low value for bearish headlines', () => {
    const news = {
      data: [
        { headline: 'Company misses earnings, cuts forecast', summary: 'warning layoffs' },
        { headline: 'Downgraded to sell on weak growth concerns', summary: 'negative risk' },
      ],
    };
    const result = scoreNewsHeadlines(news);
    expect(result).toBeLessThan(0.5);
  });

  it('clamps output to [0, 1]', () => {
    // Six items of extreme bullish/bearish words
    const bullish = { data: Array(5).fill({ headline: 'beat raised upgrade buy strong record growth profit surge rally bullish outperform exceed positive boost', summary: '' }) };
    const bearish = { data: Array(5).fill({ headline: 'miss cut downgrade sell weak loss decline fall drop bearish underperform warning risk negative layoffs', summary: '' }) };
    expect(scoreNewsHeadlines(bullish)).toBeLessThanOrEqual(1);
    expect(scoreNewsHeadlines(bearish)).toBeGreaterThanOrEqual(0);
  });

  it('only reads the first 5 headlines', () => {
    const news = {
      data: [
        ...Array(5).fill({ headline: 'beat strong growth', summary: '' }),
        { headline: 'miss cut sell weak', summary: '' }, // 6th — should be ignored
      ],
    };
    const resultWith6    = scoreNewsHeadlines(news);
    const resultWith5    = scoreNewsHeadlines({ data: news.data.slice(0, 5) });
    expect(resultWith6).toBe(resultWith5);
  });
});

// ─── computeScore — basic ────────────────────────────────────────────────────

describe('computeScore', () => {
  it('returns null score with no quote data', () => {
    const result = computeScore({});
    expect(result.score).toBeNull();
    expect(result.badge).toBe('NEUTRAL');
  });

  it('score is always in [0, 100]', () => {
    const ticker = makeTicker({ price: 100, dp: 5, ema50: 80, pe: 20, epsGrowth: 25, rsi: 45 });
    const { score } = computeScore(ticker);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('counts factors correctly', () => {
    // Provide: EMA50 (T1), MA200 (T2), 52w (T3), dp (T4), RSI (T5), PE, epsGrowth → data points
    const ticker = makeTicker({
      price: 100, dp: 1, ema50: 90, ema200: 80, high52: 120, low52: 60,
      pe: 20, epsGrowth: 15, rsi: 50,
    });
    const { factors, total } = computeScore(ticker);
    expect(factors).toBeGreaterThan(0);
    expect(total).toBeGreaterThan(factors); // total includes signals without data
  });

  // ── T1: EMA50 ──
  it('T1 — price well above EMA50 scores 1', () => {
    // price 100 vs ema50 90 → pct = 11.1% > 5 → v = 1
    const hi = computeScore(makeTicker({ price: 100, ema50: 90 }));
    const lo = computeScore(makeTicker({ price: 100, ema50: 115 }));
    expect(hi.technical).toBeGreaterThan(lo.technical);
  });

  // ── T5: RSI ──
  it('T5 — RSI < 30 (oversold) scores 1.0', () => {
    const oversold = makeTicker({ rsi: 25 });
    const overbought = makeTicker({ rsi: 75 });
    expect(computeScore(oversold).technical).toBeGreaterThan(computeScore(overbought).technical);
  });

  // ── T6: MACD ──
  it('T6 — bullish_cross scores 1.0, bearish_cross scores 0.0', () => {
    const bull = makeTicker({ macd: { histogram: 0.1, macd: 1, signal: 0.9 }, macdCrossover: 'bullish_cross' });
    const bear = makeTicker({ macd: { histogram: -0.1, macd: -1, signal: -0.9 }, macdCrossover: 'bearish_cross' });
    expect(computeScore(bull).technical).toBeGreaterThan(computeScore(bear).technical);
  });

  // ── T3: 52-week range ──
  it('T3 — 40–70th percentile of 52w range scores highest', () => {
    // price=160, range 100–200 → pos = (160-100)/(200-100) = 0.6 → sweet spot (0.9)
    const sweet = makeTicker({ price: 160, high52: 200, low52: 100 });
    // price=198 → pos=0.98 → near highs (0.5)
    const extended = makeTicker({ price: 198, high52: 200, low52: 100 });
    expect(computeScore(sweet).technical).toBeGreaterThan(computeScore(extended).technical);
  });

  // ── F1: P/E ──
  it('F1 — P/E 10–25 scores 1; P/E > 60 scores 0.15', () => {
    const fair = makeTicker({ pe: 20 });
    const expensive = makeTicker({ pe: 80 });
    expect(computeScore(fair).fundamental).toBeGreaterThan(computeScore(expensive).fundamental);
  });

  // ── F2: EPS growth ──
  it('F2 — EPS growth > 20% scores 1', () => {
    const high = makeTicker({ epsGrowth: 30 });
    const neg = makeTicker({ epsGrowth: -15 });
    expect(computeScore(high).fundamental).toBeGreaterThan(computeScore(neg).fundamental);
  });

  // ── Composite weights sum to 1 ──
  it('weights sum to 1.0 in normal regime', () => {
    const { weights } = computeScore(makeTicker());
    expect(weights.tech + weights.fund + weights.sent).toBeCloseTo(1.0, 5);
  });

  // ── Badge thresholds ──
  it('badge reflects score thresholds', () => {
    // Override by injecting predictable full-data ticker
    const highTicker = makeTicker({ price: 100, dp: 5, ema50: 80, ema200: 70, rsi: 35, pe: 20, epsGrowth: 30, high52: 110, low52: 70 });
    const { badge, score } = computeScore(highTicker);
    if (score >= 72) expect(badge).toBe('STRONG_LONG');
    else if (score >= 58) expect(badge).toBe('LEAN_LONG');
    else if (score >= 42) expect(badge).toBe('NEUTRAL');
    else if (score >= 28) expect(badge).toBe('LEAN_SHORT');
    else expect(badge).toBe('STRONG_SHORT');
  });

  // ── Regime weights ──
  it('VIX > 35 shifts fund weight to 60%', () => {
    const ticker = makeTicker({ price: 100 });
    const { weights } = computeScore(ticker, { vixPrice: 40 });
    expect(weights.fund).toBeCloseTo(0.60, 5);
    expect(weights.tech).toBeCloseTo(0.20, 5);
  });

  it('VIX > 25 shifts fund weight to 55%', () => {
    const { weights } = computeScore(makeTicker(), { vixPrice: 30 });
    expect(weights.fund).toBeCloseTo(0.55, 5);
  });

  it('normal VIX uses default 35/45/20 weights', () => {
    const { weights } = computeScore(makeTicker(), { vixPrice: 15 });
    expect(weights.tech).toBeCloseTo(0.35, 5);
    expect(weights.fund).toBeCloseTo(0.45, 5);
    expect(weights.sent).toBeCloseTo(0.20, 5);
  });

  // ── SPY downtrend penalty ──
  it('SPY downtrend pulls LONG score 20% toward 50', () => {
    // Use a ticker that will give a score > 50 without penalty
    const ticker = makeTicker({ price: 100, dp: 3, ema50: 80, ema200: 75, pe: 20, epsGrowth: 25 });
    const noFear  = computeScore(ticker, { spyDowntrend: false });
    const penalty = computeScore(ticker, { spyDowntrend: true });

    if (noFear.score > 50) {
      const expected = Math.round(noFear.score - (noFear.score - 50) * 0.20);
      expect(penalty.score).toBe(expected);
      expect(penalty.spyPenaltyApplied).toBe(true);
    } else {
      // Score <= 50 — penalty doesn't apply
      expect(penalty.score).toBe(noFear.score);
    }
  });

  it('SPY downtrend does NOT penalise SHORT scores (<= 50)', () => {
    const ticker = makeTicker({ price: 100, dp: -5, ema50: 120, pe: 80, epsGrowth: -20 });
    const result = computeScore(ticker, { spyDowntrend: true });
    expect(result.spyPenaltyApplied).toBe(false);
  });

  // ── Fear & Greed modifier ──
  it('extreme fear (F&G < 25) reduces LONG scores by up to 3', () => {
    const ticker = makeTicker({ price: 100, dp: 3, ema50: 80, pe: 20, epsGrowth: 25 });
    const noFG    = computeScore(ticker, { fearGreedValue: 50 });
    const fearFG  = computeScore(ticker, { fearGreedValue: 20 });
    if (noFG.score > 50) {
      expect(fearFG.score).toBeLessThanOrEqual(noFG.score);
    }
  });

  // ── Conviction ──
  it('conviction is 0–100 when signals are present', () => {
    const ticker = makeTicker({ price: 100, ema50: 90, rsi: 35, pe: 20 });
    const { conviction } = computeScore(ticker);
    expect(conviction).toBeGreaterThanOrEqual(0);
    expect(conviction).toBeLessThanOrEqual(100);
  });

  it('conviction label matches conviction value', () => {
    const ticker = makeTicker({ price: 100, ema50: 90, rsi: 35, pe: 20 });
    const { conviction, convictionLabel } = computeScore(ticker);
    if (conviction >= 75) expect(convictionLabel).toBe('HIGH');
    else if (conviction >= 55) expect(convictionLabel).toBe('MODERATE');
    else if (conviction >= 35) expect(convictionLabel).toBe('LOW');
    else expect(convictionLabel).toBe('MIXED');
  });
});

// ─── getBadgeStyle ────────────────────────────────────────────────────────────

describe('getBadgeStyle', () => {
  it('returns correct labels', () => {
    expect(getBadgeStyle('STRONG_LONG').label).toBe('STRONG');
    expect(getBadgeStyle('LEAN_LONG').label).toBe('LEAN LONG');
    expect(getBadgeStyle('NEUTRAL').label).toBe('NEUTRAL');
    expect(getBadgeStyle('LEAN_SHORT').label).toBe('LEAN SHORT');
    expect(getBadgeStyle('STRONG_SHORT').label).toBe('STRONG SHORT');
    expect(getBadgeStyle('BLOCKED').label).toBe('BLOCKED');
  });

  it('returns fallback for unknown badge', () => {
    expect(getBadgeStyle('UNKNOWN').label).toBe('—');
  });
});

// ─── getDaysToEarnings ───────────────────────────────────────────────────────

describe('getDaysToEarnings', () => {
  it('returns null when no data', () => {
    expect(getDaysToEarnings(null)).toBeNull();
    expect(getDaysToEarnings({ data: { earningsCalendar: [] } })).toBeNull();
  });

  it('returns correct days for a future date', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const dateStr = future.toISOString().split('T')[0];
    const result = getDaysToEarnings({ data: { earningsCalendar: [{ date: dateStr }] } });
    expect(result).toBeGreaterThanOrEqual(9);
    expect(result).toBeLessThanOrEqual(11);
  });

  it('returns 0 or 1 for today (UTC vs local timezone offset)', () => {
    // Date strings are parsed as UTC midnight; local midnight may be behind UTC,
    // causing Math.ceil to return 1 instead of 0. Both are valid.
    const today = new Date().toISOString().split('T')[0];
    const result = getDaysToEarnings({ data: { earningsCalendar: [{ date: today }] } });
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it('skips past dates', () => {
    const past   = new Date(); past.setDate(past.getDate() - 5);
    const future = new Date(); future.setDate(future.getDate() + 7);
    const earnings = {
      data: {
        earningsCalendar: [
          { date: past.toISOString().split('T')[0] },
          { date: future.toISOString().split('T')[0] },
        ],
      },
    };
    const result = getDaysToEarnings(earnings);
    expect(result).toBeGreaterThanOrEqual(6);
    expect(result).toBeLessThanOrEqual(8);
  });
});

// ─── Score history (localStorage-backed) ────────────────────────────────────

describe('storeScoreSnapshot / getScoreHistory / getScoreVelocity', () => {
  it('stores and retrieves a score', () => {
    storeScoreSnapshot('AAPL', 65);
    const history = getScoreHistory('AAPL');
    expect(history.length).toBe(1);
    expect(history[0].score).toBe(65);
  });

  it('does not store null score', () => {
    storeScoreSnapshot('AAPL', null);
    expect(getScoreHistory('AAPL').length).toBe(0);
  });

  it('does not add duplicate within 1 hour', () => {
    storeScoreSnapshot('AAPL', 60);
    storeScoreSnapshot('AAPL', 61); // within 1h of last
    const history = getScoreHistory('AAPL');
    expect(history.length).toBe(1);
  });

  it('getScoreVelocity returns null with no history', () => {
    expect(getScoreVelocity('MSFT')).toBeNull();
  });

  it('getScoreVelocity returns flat with 1 snapshot', () => {
    storeScoreSnapshot('TSLA', 55);
    expect(getScoreVelocity('TSLA')).toEqual({ delta: 0, direction: 'flat' });
  });

  it('computeScoreZScore returns null with fewer than 5 snapshots', () => {
    storeScoreSnapshot('NVDA', 60);
    storeScoreSnapshot('NVDA', 62);
    expect(computeScoreZScore('NVDA')).toBeNull();
  });
});

// ─── generateThesis ──────────────────────────────────────────────────────────

describe('generateThesis', () => {
  it('returns null with no quote data', () => {
    expect(generateThesis({}, null)).toBeNull();
    expect(generateThesis(null, null)).toBeNull();
  });

  it('returns { bulls, bears, warnings } structure', () => {
    const ticker = makeTicker({ price: 100, ema50: 90, ema200: 80, pe: 20, epsGrowth: 25 });
    const score  = computeScore(ticker);
    const thesis = generateThesis(ticker, score);
    expect(thesis).toHaveProperty('bulls');
    expect(thesis).toHaveProperty('bears');
    expect(thesis).toHaveProperty('warnings');
    expect(Array.isArray(thesis.bulls)).toBe(true);
    expect(Array.isArray(thesis.bears)).toBe(true);
  });

  it('bulls has a positive EMA50 note when price is above', () => {
    const ticker = makeTicker({ price: 110, ema50: 100 }); // 10% above
    const thesis = generateThesis(ticker, computeScore(ticker));
    const hasBull = thesis.bulls.some(b => b.includes('EMA50'));
    expect(hasBull).toBe(true);
  });

  it('bears has a negative EMA50 note when price is below', () => {
    const ticker = makeTicker({ price: 90, ema50: 100 }); // 10% below
    const thesis = generateThesis(ticker, computeScore(ticker));
    const hasBear = thesis.bears.some(b => b.includes('EMA50'));
    expect(hasBear).toBe(true);
  });

  it('adds earnings warning when within 14 days', () => {
    const soon = new Date(); soon.setDate(soon.getDate() + 7);
    const ticker = {
      ...makeTicker({ price: 100 }),
      earnings: { data: { earningsCalendar: [{ date: soon.toISOString().split('T')[0] }] } },
    };
    const thesis = generateThesis(ticker, computeScore(ticker));
    expect(thesis.warnings.some(w => w.includes('Earnings'))).toBe(true);
  });
});

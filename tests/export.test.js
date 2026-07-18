import { describe, it, expect } from 'vitest';
import { buildStockSnapshot, buildPrompt, DEFAULT_TEMPLATES } from '../src/lib/export.js';

// Rich ticker data object, mirroring tests/dip.test.js conventions.
function makeData(overrides = {}) {
  return {
    quote: { data: { c: 228.4, dp: 1.2 } },
    metrics: { data: { metric: {
      epsGrowthTTMYoy: 21, revenueGrowthTTMYoy: 12, netProfitMarginTTM: 9.8,
      peNormalizedAnnual: 34, psTTM: 3.1, '52WeekHigh': 240, '52WeekLow': 150,
      dividendYieldIndicatedAnnual: 0.52,
    } } },
    indicators: {
      rsi: 61, rsiDirection: 'rising', rsiZScore: 0.4,
      macd: { macd: 2.1, signal: 1.8, histogram: 0.3 }, macdCrossover: 'bullish_cross',
      adx: 27, stochK: 72, stochD: 68, stochCross: null,
      bb: { upper: 235, lower: 210 }, atr: 4.2,
      ema20: 224, ema50: 218, ema200: 200, emaStack: 'BULL STACK',
      roc20: 6.2, roc60: 11.8, oversoldConfluence: false,
      obv: { obv: 500000, trend: 'rising' }, swingLows: [212, 205],
    },
    weekly: { atr: 8.4 },
    setups: {
      pullback: { score: 2, label: 'WEAK', readiness: 'WAIT', etaWeeks: null },
      momentum: { score: 7, label: 'STRONG', readiness: 'ACT', etaWeeks: 2 },
      meta: { wRsi: 58 },
    },
    rs: { rs1m: 2.1, rs3m: 5.4 },
    smartMoney: { data: { rec: { buyRatio: 0.78, deteriorating: false }, mspr3m: 12 } },
    earnings: null,
    ...overrides,
  };
}
const TICKER = { symbol: 'AMZN', name: 'Amazon.com', sector: 'Technology' };
const CTX = { vixPrice: 16, spyDowntrend: false, fearGreedValue: 62 };

describe('buildStockSnapshot', () => {
  it('renders all sections with full data', () => {
    const snap = buildStockSnapshot(TICKER, makeData(), CTX);
    for (const header of ['PRICE', 'DASHBOARD SCORE', 'TECHNICALS', 'SETUPS',
      'FUNDAMENTALS', 'REL. STRENGTH', 'SMART MONEY', 'DIP', 'MARKET CONTEXT', 'EARNINGS']) {
      expect(snap).toContain(header);
    }
    expect(snap).toContain('AMZN');
    expect(snap).toContain('Amazon.com');
    expect(snap).toContain('Technology');
  });

  it('labels RSI with the dashboard band names', () => {
    const bands = [[25, 'Oversold'], [35, 'Mild Oversold'], [50, 'Neutral'], [65, 'Extended'], [75, 'Overbought']];
    for (const [rsi, label] of bands) {
      const snap = buildStockSnapshot(TICKER, makeData({ indicators: { rsi } }), CTX);
      expect(snap).toContain(`RSI ${rsi} (${label},`); // direction follows the band label
    }
  });

  it('shows 52w range position from pct52wRange', () => {
    const snap = buildStockSnapshot(TICKER, makeData(), CTX);
    expect(snap).toContain('52w range position: 87%'); // (228.4-150)/(240-150) = 87.1 → 87
  });

  it('shows dividend yield in the FUNDAMENTALS line', () => {
    const snap = buildStockSnapshot(TICKER, makeData(), CTX);
    expect(snap).toContain('Div yield 0.52%');
  });

  it('shows n/a for dividend yield when the field is absent', () => {
    const snap = buildStockSnapshot(TICKER, makeData({
      metrics: { data: { metric: { peNormalizedAnnual: 34 } } },
    }), CTX);
    expect(snap).toContain('Div yield n/a');
  });

  it('labels Fear & Greed zone', () => {
    expect(buildStockSnapshot(TICKER, makeData(), CTX)).toContain('Fear&Greed 62 (Greed)');
    expect(buildStockSnapshot(TICKER, makeData(), { ...CTX, fearGreedValue: 20 })).toContain('Fear&Greed 20 (Extreme Fear)');
  });

  it('reports SPY trend direction', () => {
    expect(buildStockSnapshot(TICKER, makeData(), CTX)).toContain('SPY uptrend');
    expect(buildStockSnapshot(TICKER, makeData(), { ...CTX, spyDowntrend: true })).toContain('SPY downtrend');
  });

  it('never throws and prints n/a on empty data', () => {
    const snap = buildStockSnapshot({ symbol: 'X' }, {}, null);
    expect(snap).toContain('X');
    expect(snap).toContain('n/a');
    expect(snap).not.toContain('undefined');
    expect(snap).not.toContain('NaN');
  });

  it('never throws on null data object', () => {
    const snap = buildStockSnapshot({ symbol: 'X' }, null, null);
    expect(snap).toContain('n/a');
  });

  it('includes earnings days when present', () => {
    // getDaysToEarnings parses earnings data; shape from Finnhub: { data: { earningsCalendar: [{date}] } }
    const future = new Date(Date.now() + 19 * 86400000).toISOString().slice(0, 10);
    const snap = buildStockSnapshot(TICKER, makeData({ earnings: { data: { earningsCalendar: [{ date: future }] } } }), CTX);
    expect(snap).toMatch(/EARNINGS: in \d+ days/);
  });

  it('includes both setup scores with readiness', () => {
    const snap = buildStockSnapshot(TICKER, makeData(), CTX);
    expect(snap).toContain('Pullback 2/10 (WAIT)');
    expect(snap).toContain('Momentum 7/10 (ACT, ~2w)'); // etaWeeks 2 renders as ", ~2w"
  });
});

describe('buildPrompt', () => {
  it('substitutes all three placeholders', () => {
    const out = buildPrompt('T {{TICKER}} on {{DATE}}:\n{{DATA}}', 'SNAP', 'AMZN');
    expect(out).toContain('T AMZN on');
    expect(out).toContain('SNAP');
    expect(out).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(out).not.toContain('{{');
  });

  it('substitutes repeated placeholders and leaves unknown ones', () => {
    const out = buildPrompt('{{TICKER}} {{TICKER}} {{UNKNOWN}}', 'S', 'NVDA');
    expect(out).toBe(`NVDA NVDA {{UNKNOWN}}`);
  });
});

describe('DEFAULT_TEMPLATES', () => {
  it('ships 4 templates, each with a {{DATA}} placeholder and unique id', () => {
    expect(DEFAULT_TEMPLATES.length).toBe(4);
    const ids = DEFAULT_TEMPLATES.map(t => t.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(['deep-dive', 'trade-setup', 'risk-check', 'news-scan']);
    for (const t of DEFAULT_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.body).toContain('{{DATA}}');
    }
  });
});

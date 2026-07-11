# AI Export Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-click "Copy for AI" button per stock that merges a full dashboard data snapshot into a user-editable prompt template and copies it to the clipboard.

**Architecture:** Pure formatting logic in a new `src/lib/export.js` (same pattern as `dip.js`: reads fields already on the ticker data object, calls `computeScore` itself, zero API calls). Templates persist in a thin Svelte-runes store `src/lib/stores/prompts.svelte.js` (clone of `alerts.svelte.js` pattern, localStorage keys `promptTemplates` + `promptDefault`). UI: button + template dropdown in WatchlistTable's expanded row, editing section in SettingsPanel.

**Tech Stack:** Svelte 5 runes, Vitest, localStorage. Spec: `docs/superpowers/specs/2026-07-11-ai-export-prompt-design.md`.

## Global Constraints

- Display-only: nothing here feeds `computeScore` or the setup engines.
- Zero new API calls.
- All persistence in localStorage (`promptTemplates`, `promptDefault`).
- Placeholders: `{{DATA}}`, `{{TICKER}}`, `{{DATE}}`. Unknown placeholders left as-is.
- Missing/null values print `n/a`; snapshot never throws on partial data.
- Stocks view only (no ETF view changes).
- Work on branch `feat/ai-export-prompt`. Run `npm test` (294 existing tests) before starting; all must stay green.
- Version bump to `0.18.0` happens in the final task only (badge derives from package.json).

## Codebase facts the implementer needs

- `getTickerData(symbol)` (from `stores/watchlist.svelte.js`) returns the ticker **data object** `d` with: `quote.data.{c,dp}`, `metrics.data.metric.{...}` (Finnhub keys like `epsGrowthTTMYoy`, `revenueGrowthTTMYoy`, `netProfitMarginTTM`, `peNormalizedAnnual`, `peBasicExclExtraTTM`, `psTTM`, `'52WeekHigh'`, `'52WeekLow'`), `indicators` (see below), `rs.{rs1m,rs3m}`, `smartMoney.data.{rec:{buyRatio,deteriorating},mspr3m}`, `setups.{pullback,momentum,meta}`, `earnings`, `profile`.
- `d.indicators` keys: `rsi, rsiDirection, rsiZScore, macd:{macd,signal,histogram}, macdCrossover, adx, stochK, stochD, stochCross, bb:{upper,middle?,lower}, atr, ema20, ema50, ema200, emaStack, roc20, roc60, oversoldConfluence, obv:{obv,trend}, volConfirmation, swingLows`.
- `computeScore(d)` (from `scoring.js`) returns `{score,badge,technical,fundamental,sentiment,conviction,convictionLabel,regimeNote,...}` and is null-safe (early return of nulls).
- `computeDipRadar(list, ctx)` (from `dip.js`) takes `[{symbol, data}]` and ctx `{fearGreedValue, spyBelowEma50}`; returns array of hits `{score, readiness, ...}` (empty if below WATCH or gate fails).
- `getDaysToEarnings(d?.earnings)` from `scoring.js` returns int or null.
- `pct52wRange(price, low, high)` from `indicators.js` returns 0–100 or null.
- `computePEG(pe, epsGrowth)` from `valuation.js` returns number or null.
- Market context lives module-private in `scoring.js` (`_marketContext`, shape `{vixPrice, spyDowntrend, fearGreedValue}`, set via `setMarketContext`). Task 3 adds a `getMarketContext()` export.
- Watchlist entries (`getTickers()`) are `{symbol, name, sector, sectorETF}`.
- RSI label bands (must match FundamentalsBar): `<30 Oversold`, `30–40 Mild Oversold`, `40–60 Neutral`, `60–70 Extended`, `>70 Overbought`.
- Test conventions: see `tests/dip.test.js` — vitest `describe/it/expect`, factory `makeTicker(overrides)`.

## File Structure

- Create: `src/lib/export.js` — snapshot builder, prompt merge, `DEFAULT_TEMPLATES` (pure, fully unit-tested)
- Create: `src/lib/stores/prompts.svelte.js` — thin runes store (persistence only; untested like `alerts.svelte.js`, all logic lives in export.js)
- Create: `tests/export.test.js`
- Modify: `src/lib/scoring.js` — add `getMarketContext()` (1 line)
- Modify: `src/lib/components/WatchlistTable.svelte` — Copy for AI button + dropdown in expanded row
- Modify: `src/lib/components/SettingsPanel.svelte` — AI Prompts editing section
- Modify: `package.json`, `CLAUDE.md`, `BACKLOG.md` — final task

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b feat/ai-export-prompt` and run `npm test` — expect 294 passing.

---

### Task 1: `export.js` — snapshot builder + prompt merge + default templates

**Files:**
- Create: `src/lib/export.js`
- Test: `tests/export.test.js`

**Interfaces:**
- Produces: `buildStockSnapshot(ticker, d, marketCtx) → string` (ticker = `{symbol,name,sector}`, d = ticker data object, marketCtx = `{vixPrice,spyDowntrend,fearGreedValue}` or null)
- Produces: `buildPrompt(templateBody, snapshot, symbol) → string`
- Produces: `DEFAULT_TEMPLATES: [{id, name, body}]` (4 entries, ids: `deep-dive`, `trade-setup`, `risk-check`, `news-scan`; `deep-dive` is the default)

- [ ] **Step 1: Write the failing tests** — `tests/export.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildStockSnapshot, buildPrompt, DEFAULT_TEMPLATES } from '../src/lib/export.js';

// Rich ticker data object, mirroring tests/dip.test.js conventions.
function makeData(overrides = {}) {
  return {
    quote: { data: { c: 228.4, dp: 1.2 } },
    metrics: { data: { metric: {
      epsGrowthTTMYoy: 21, revenueGrowthTTMYoy: 12, netProfitMarginTTM: 9.8,
      peNormalizedAnnual: 34, psTTM: 3.1, '52WeekHigh': 240, '52WeekLow': 150,
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
```

Note on the earnings test: check `getDaysToEarnings` in `src/lib/scoring.js:503` for the exact `earningsData` shape it parses before finalizing the fixture; adjust the fixture (not the production code) if it differs from `{ data: { earningsCalendar: [{ date }] } }`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/export.test.js`
Expected: FAIL — cannot resolve `../src/lib/export.js`.

- [ ] **Step 3: Implement `src/lib/export.js`**

```js
// AI export — formats a ticker's full dashboard reading as a plain-text
// snapshot and merges it into a prompt template for external LLMs.
// Pure logic, display-only: reads data already on the ticker object,
// no API calls, nothing here feeds computeScore or the setup engines.
import { computeScore, getDaysToEarnings } from './scoring.js';
import { computePEG } from './valuation.js';
import { pct52wRange } from './indicators.js';
import { computeDipRadar } from './dip.js';

const NA = 'n/a';
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function fmt(v, suffix = '') { const n = num(v); return n === null ? NA : `${n}${suffix}`; }
function fmtSigned(v, suffix = '%') { const n = num(v); return n === null ? NA : `${n > 0 ? '+' : ''}${n}${suffix}`; }

// Same 5 bands as FundamentalsBar's rsiLabel — keep in sync.
function rsiLabel(rsi) {
  if (rsi < 30) return 'Oversold';
  if (rsi < 40) return 'Mild Oversold';
  if (rsi <= 60) return 'Neutral';
  if (rsi <= 70) return 'Extended';
  return 'Overbought';
}

function fgZone(fg) {
  if (fg < 25) return 'Extreme Fear';
  if (fg < 45) return 'Fear';
  if (fg < 55) return 'Neutral';
  if (fg < 75) return 'Greed';
  return 'Extreme Greed';
}

function setupLine(name, su) {
  if (!su) return `${name} ${NA}`;
  const eta = su.etaWeeks != null ? `, ~${su.etaWeeks}w` : '';
  return `${name} ${fmt(su.score)}/10 (${su.readiness ?? NA}${eta})`;
}

export function buildStockSnapshot(ticker, d, marketCtx) {
  const symbol = ticker?.symbol ?? '?';
  const q = d?.quote?.data ?? {};
  const m = d?.metrics?.data?.metric ?? {};
  const ind = d?.indicators ?? {};
  const s = computeScore(d ?? {});

  const price = num(q.c);
  const rangePos = pct52wRange(price, num(m['52WeekLow']), num(m['52WeekHigh']));
  const rsi = num(ind.rsi);
  const macdLine = ind.macdCrossover
    ? `${ind.macdCrossover}${num(ind.macd?.histogram) !== null ? `, hist ${ind.macd.histogram > 0 ? '+' : ''}${ind.macd.histogram}` : ''}`
    : NA;
  const bbLine = num(ind.bb?.upper) !== null && price !== null
    ? (price > ind.bb.upper ? 'above upper band' : num(ind.bb?.lower) !== null && price < ind.bb.lower ? 'below lower band' : 'inside bands')
    : NA;
  const pe = num(m.peNormalizedAnnual) ?? num(m.peBasicExclExtraTTM);
  const eps = num(m.epsGrowthTTMYoy);
  const peg = eps !== null && pe !== null ? computePEG(pe, eps) : null;
  const sm = d?.smartMoney?.data;
  const buyPct = num(sm?.rec?.buyRatio) !== null ? Math.round(sm.rec.buyRatio * 100) : null;
  const dipHit = d ? (computeDipRadar(
    [{ symbol, data: d }],
    { fearGreedValue: marketCtx?.fearGreedValue ?? null, spyBelowEma50: marketCtx?.spyDowntrend === true }
  )[0] ?? null) : null;
  const fg = num(marketCtx?.fearGreedValue);
  const days = getDaysToEarnings(d?.earnings);

  const lines = [
    `=== ${symbol}${ticker?.name ? ` — ${ticker.name}` : ''}${ticker?.sector ? ` (${ticker.sector})` : ''} ===`,
    `Snapshot date: ${new Date().toISOString().slice(0, 10)} (data from my offline dashboard — verify anything time-sensitive)`,
    '',
    `PRICE: ${price !== null ? `$${price}` : NA} (${fmtSigned(q.dp)} today) · 52w range position: ${fmt(rangePos, '%')} · 20d ROC ${fmtSigned(ind.roc20)} · 60d ROC ${fmtSigned(ind.roc60)}`,
    `DASHBOARD SCORE: ${fmt(s.score)}/100 — ${s.badge ?? NA}, conviction ${s.convictionLabel ?? NA}` +
      ` (technical ${fmt(s.technical)}, fundamental ${fmt(s.fundamental)}, sentiment ${fmt(s.sentiment)})` +
      (s.regimeNote ? ` · note: ${s.regimeNote}` : ''),
    `TECHNICALS (daily): RSI ${rsi !== null ? `${rsi} (${rsiLabel(rsi)}, ${ind.rsiDirection ?? NA})` : NA} · MACD ${macdLine} · ADX ${fmt(ind.adx)} · Stoch %K ${fmt(ind.stochK)} · EMA stack: ${ind.emaStack ?? NA} · Bollinger: ${bbLine} · ATR ${fmt(ind.atr)} (weekly ${fmt(d?.weekly?.atr)})`,
    `SETUPS (weekly): ${setupLine('Pullback', d?.setups?.pullback)} · ${setupLine('Momentum', d?.setups?.momentum)} · weekly RSI ${fmt(d?.setups?.meta?.wRsi)}`,
    `FUNDAMENTALS: P/E ${fmt(pe)} · PEG ${peg !== null ? Math.round(peg * 10) / 10 : NA} · EPS growth ${fmtSigned(eps)} · Rev growth ${fmtSigned(m.revenueGrowthTTMYoy)} · Net margin ${fmt(m.netProfitMarginTTM, '%')} · P/S ${fmt(m.psTTM)}`,
    `REL. STRENGTH vs SPY: 1M ${fmtSigned(d?.rs?.rs1m)} · 3M ${fmtSigned(d?.rs?.rs3m)}`,
    `SMART MONEY: insider MSPR ${fmtSigned(sm?.mspr3m, '')} · analysts ${fmt(buyPct, '% buy')}${sm?.rec?.deteriorating === true ? ' (deteriorating)' : ''}`,
    `DIP SCORE: ${dipHit ? `${dipHit.score}/10 (${dipHit.readiness})` : 'none (no qualifying dip)'}`,
    `MARKET CONTEXT: vol proxy ${fmt(marketCtx?.vixPrice)} · Fear&Greed ${fg !== null ? `${fg} (${fgZone(fg)})` : NA} · ${marketCtx?.spyDowntrend === true ? 'SPY downtrend' : marketCtx?.spyDowntrend === false ? 'SPY uptrend' : `SPY trend ${NA}`}`,
    `EARNINGS: ${days !== null ? `in ${days} days` : NA}`,
  ];
  return lines.join('\n');
}

export function buildPrompt(templateBody, snapshot, symbol) {
  return String(templateBody ?? '')
    .replaceAll('{{DATA}}', snapshot ?? '')
    .replaceAll('{{TICKER}}', symbol ?? '')
    .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10));
}

export const DEFAULT_TEMPLATES = [
  {
    id: 'deep-dive',
    name: 'Deep Dive',
    body: `You are an experienced equity analyst. Below is a technical + fundamental snapshot of {{TICKER}} from my personal analysis dashboard, taken on {{DATE}}.

{{DATA}}

Using this snapshot PLUS current web research (recent news, analyst updates, sector developments):
1. Summarize the current investment thesis for {{TICKER}} — bull case and bear case.
2. Cross-check my dashboard's reading: does the score/badge match what fresh data says? Flag any disagreement.
3. Identify near-term catalysts (next 4-8 weeks) and their likely direction.
4. Give a swing-trade oriented verdict: buy / wait / avoid, with the key level or event that would change your view.
Be specific and cite recent sources where you can.`,
  },
  {
    id: 'trade-setup',
    name: 'Trade Setup Review',
    body: `You are a swing-trading mentor. Here is my dashboard's snapshot of {{TICKER}} as of {{DATE}}:

{{DATA}}

I'm considering a long swing trade (weeks to a few months). Combine this with current web data and:
1. Validate or challenge the setup: is this a good entry zone right now?
2. Propose a concrete plan: entry zone, stop-loss (respecting the ATR shown), first target, risk:reward.
3. List anything happening in the next 2-4 weeks that could invalidate the trade (earnings, macro events, sector news).
4. Verdict in one line: enter now / wait for a specific trigger / skip.`,
  },
  {
    id: 'risk-check',
    name: 'Risk Check',
    body: `Act as a skeptical risk manager. My dashboard snapshot of {{TICKER}} from {{DATE}}:

{{DATA}}

Your job is to find what could go WRONG with a long position here. Using current web research:
1. List the top 3-5 risks (company-specific, sector, macro), each with likelihood and potential impact.
2. Check recent news for red flags my offline dashboard cannot see (guidance cuts, legal issues, insider selling, competitive threats).
3. Assess earnings risk if a report is near.
4. Conclusion: what position size (full / half / none) does this risk profile justify, and what early-warning signal should I watch?`,
  },
  {
    id: 'news-scan',
    name: 'News Catalyst Scan',
    body: `Here is my dashboard's data snapshot of {{TICKER}} from {{DATE}}:

{{DATA}}

Search the web for everything relevant from the last 2 weeks: news, analyst rating changes, insider transactions, sector moves, social sentiment.
1. Summarize the news flow — bullish, bearish, or mixed?
2. Did anything happen that my snapshot (price/indicator data only) would not reflect yet?
3. Does the fresh information confirm or contradict the dashboard score above?
4. One-line takeaway: has the story changed, and in which direction?`,
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/export.test.js`
Expected: PASS (all ~13). If the 52w-range or RSI-band assertions fail on exact strings, fix the **test expectation only if** the computed value is genuinely different (e.g. rounding) — the format `label value (interpretation)` itself is the contract.

- [ ] **Step 5: Run the full suite** — `npm test`, expect 294 + new all passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/export.js tests/export.test.js
git commit -m "feat: AI export snapshot builder + prompt templates (export.js)"
```

---

### Task 2: `prompts.svelte.js` template store

**Files:**
- Create: `src/lib/stores/prompts.svelte.js`

**Interfaces:**
- Consumes: `DEFAULT_TEMPLATES` from `../export.js`
- Produces: `getTemplates() → [{id,name,body}]`, `getDefaultId() → string`, `setDefaultId(id)`, `updateTemplate(id, body)`, `resetTemplate(id)`, `getTemplate(id) → {id,name,body}|null`

No dedicated test file — this store is pure persistence glue with all logic (template content, merging) already tested in Task 1; matches the untested-`alerts.svelte.js` convention.

- [ ] **Step 1: Implement `src/lib/stores/prompts.svelte.js`**

```js
// AI prompt templates — user-editable, seeded from DEFAULT_TEMPLATES.
import { DEFAULT_TEMPLATES } from '../export.js';

let templates = $state([]);
let defaultId = $state(DEFAULT_TEMPLATES[0].id);

try {
  const saved = localStorage.getItem('promptTemplates');
  const parsed = saved ? JSON.parse(saved) : null;
  templates = Array.isArray(parsed) && parsed.length
    ? parsed
    : DEFAULT_TEMPLATES.map(t => ({ ...t }));
} catch { templates = DEFAULT_TEMPLATES.map(t => ({ ...t })); }

try {
  const savedDefault = localStorage.getItem('promptDefault');
  if (savedDefault && templates.some(t => t.id === savedDefault)) defaultId = savedDefault;
} catch { /* noop */ }

function persist() {
  try { localStorage.setItem('promptTemplates', JSON.stringify(templates)); } catch { /* noop */ }
}

export function getTemplates() { return templates; }
export function getDefaultId() { return defaultId; }
export function getTemplate(id) { return templates.find(t => t.id === id) ?? null; }

export function setDefaultId(id) {
  if (!templates.some(t => t.id === id)) return;
  defaultId = id;
  try { localStorage.setItem('promptDefault', id); } catch { /* noop */ }
}

export function updateTemplate(id, body) {
  const t = templates.find(t => t.id === id);
  if (!t) return;
  t.body = body;
  persist();
}

export function resetTemplate(id) {
  const shipped = DEFAULT_TEMPLATES.find(t => t.id === id);
  const idx = templates.findIndex(t => t.id === id);
  if (!shipped || idx === -1) return;
  templates[idx] = { ...shipped };
  persist();
}
```

- [ ] **Step 2: Verify** — `npm test` still green, `npm run build` succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/prompts.svelte.js
git commit -m "feat: prompt template store (localStorage, seeded presets)"
```

---

### Task 3: Copy for AI button in WatchlistTable + `getMarketContext()`

**Files:**
- Modify: `src/lib/scoring.js` (after line 11, next to `setMarketContext`)
- Modify: `src/lib/components/WatchlistTable.svelte`

**Interfaces:**
- Consumes: `buildStockSnapshot`, `buildPrompt` from `../export.js`; `getTemplates`, `getDefaultId`, `getTemplate` from `../stores/prompts.svelte.js`
- Produces: `getMarketContext()` export in `scoring.js` (used here and available for future ETF export)

- [ ] **Step 1: Add getter to scoring.js** — directly below `export function setMarketContext(ctx) { _marketContext = ctx; }` (line 11):

```js
export function getMarketContext() { return _marketContext; }
```

- [ ] **Step 2: Wire the button into WatchlistTable.svelte**

Script section — add imports and state:

```js
import { buildStockSnapshot, buildPrompt } from '../export.js';
import { getTemplates, getDefaultId, getTemplate } from '../stores/prompts.svelte.js';
// add getMarketContext to the existing scoring.js import list
```

```js
let copyState = $state(null);      // symbol that just copied ('ok') or failed ('fail')
let copyMenuSymbol = $state(null); // symbol whose template dropdown is open

async function copyForAI(ticker, templateId) {
  const tpl = getTemplate(templateId ?? getDefaultId());
  if (!tpl) return;
  const d = getTickerData(ticker.symbol);
  const snapshot = buildStockSnapshot(ticker, d, getMarketContext());
  const text = buildPrompt(tpl.body, snapshot, ticker.symbol);
  let ok = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for non-secure contexts / older browsers
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    } catch { ok = false; }
  }
  copyState = { symbol: ticker.symbol, ok };
  copyMenuSymbol = null;
  setTimeout(() => { copyState = null; }, 1500);
}
```

Markup — inside the expanded row (`{#if isSelected}` block, WatchlistTable.svelte ~line 690), insert a toolbar row at the very top of the expanded `<div class="bg-surface-800 ...">`, before the PriceChart/NewsPanel grid:

```svelte
<!-- AI export toolbar -->
<div class="flex items-center justify-end gap-1 mb-3 relative">
  <button
    class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 border border-border text-text-secondary hover:text-text-primary transition-colors"
    onclick={() => copyForAI(ticker)}
  >{copyState?.symbol === ticker.symbol ? (copyState.ok ? 'Copied ✓' : 'Copy failed') : '🤖 Copy for AI'}</button>
  <button
    class="text-xs px-2 py-1.5 rounded-lg bg-surface-700 border border-border text-text-muted hover:text-text-secondary transition-colors"
    title="Choose prompt template"
    onclick={() => { copyMenuSymbol = copyMenuSymbol === ticker.symbol ? null : ticker.symbol; }}
  >▾</button>
  {#if copyMenuSymbol === ticker.symbol}
    <div class="absolute right-0 top-full mt-1 z-30 bg-surface-700 border border-border rounded-lg shadow-lg py-1 min-w-44">
      {#each getTemplates() as tpl (tpl.id)}
        <button
          class="block w-full text-left text-xs px-3 py-1.5 hover:bg-surface-600 transition-colors {tpl.id === getDefaultId() ? 'text-text-primary font-semibold' : 'text-text-secondary'}"
          onclick={() => copyForAI(ticker, tpl.id)}
        >{tpl.name}{tpl.id === getDefaultId() ? ' ·' : ''}</button>
      {/each}
    </div>
  {/if}
</div>
```

Match surrounding class conventions exactly (surface/border/text tokens already used in that block).

- [ ] **Step 3: Verify manually** — `npm run dev`, expand a ticker, click Copy for AI, paste into a text editor: full prompt with data block appears; dropdown picks other templates; button flashes Copied ✓. With no data fetched (demo/blank state) the copy still works and shows `n/a` rows.

- [ ] **Step 4: Run tests + build** — `npm test` and `npm run build`, both green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring.js src/lib/components/WatchlistTable.svelte
git commit -m "feat: Copy for AI button with template picker in expanded row"
```

---

### Task 4: AI Prompts section in SettingsPanel

**Files:**
- Modify: `src/lib/components/SettingsPanel.svelte`

**Interfaces:**
- Consumes: `getTemplates`, `getDefaultId`, `setDefaultId`, `updateTemplate`, `resetTemplate` from `../stores/prompts.svelte.js`

- [ ] **Step 1: Add the section**

Script:

```js
import { getTemplates, getDefaultId, setDefaultId, updateTemplate, resetTemplate } from '../stores/prompts.svelte.js';
let editingPromptId = $state(null);
let promptDraft = $state('');
```

Markup — new section after the Notifications block (~line 355), following the panel's existing section markup conventions (same heading/border classes as neighboring sections):

```svelte
<!-- AI Prompts -->
<div class="mt-6">
  <h3 class="text-sm font-semibold text-text-primary mb-1">AI Prompts</h3>
  <p class="text-xs text-text-muted mb-3">
    Templates for the "Copy for AI" button. Placeholders: <code>{'{{DATA}}'}</code> (snapshot), <code>{'{{TICKER}}'}</code>, <code>{'{{DATE}}'}</code>.
  </p>
  {#each getTemplates() as tpl (tpl.id)}
    <div class="mb-2 bg-surface-700/50 border border-border/40 rounded-lg px-3 py-2">
      <div class="flex items-center gap-2">
        <input type="radio" name="promptDefault" checked={tpl.id === getDefaultId()}
          onchange={() => setDefaultId(tpl.id)} class="accent-current" />
        <span class="text-xs font-semibold text-text-secondary flex-1">{tpl.name}</span>
        <button class="text-xs text-text-muted hover:text-text-secondary"
          onclick={() => {
            if (editingPromptId === tpl.id) { editingPromptId = null; }
            else { editingPromptId = tpl.id; promptDraft = tpl.body; }
          }}
        >{editingPromptId === tpl.id ? 'Close' : 'Edit'}</button>
        <button class="text-xs text-text-muted hover:text-warning"
          onclick={() => { resetTemplate(tpl.id); if (editingPromptId === tpl.id) promptDraft = getTemplates().find(t => t.id === tpl.id).body; }}
        >Reset</button>
      </div>
      {#if editingPromptId === tpl.id}
        <textarea
          class="w-full mt-2 text-xs bg-surface-800 border border-border rounded p-2 text-text-primary font-mono"
          rows="10"
          bind:value={promptDraft}
          onblur={() => updateTemplate(tpl.id, promptDraft)}
        ></textarea>
        <p class="text-[11px] text-text-muted mt-1">Saved automatically when you click away.</p>
      {/if}
    </div>
  {/each}
</div>
```

Default marker: the radio selects which template the main button uses.

- [ ] **Step 2: Verify manually** — open Settings: edit a template, close settings, reopen → edit persisted. Reset restores shipped text. Changing the default radio changes which template the Copy button uses.

- [ ] **Step 3: Run tests + build** — `npm test`, `npm run build` green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/SettingsPanel.svelte
git commit -m "feat: AI prompt template editor in Settings"
```

---

### Task 5: Version bump, docs, PR

**Files:**
- Modify: `package.json` (version `0.17.0` → `0.18.0`)
- Modify: `CLAUDE.md` (key-files list + new "AI export" section; test count)
- Modify: `BACKLOG.md` (add phase 2: Gemini API integration as a queued item)

- [ ] **Step 1:** Bump `package.json` version to `0.18.0` (badge auto-derives — do not touch App.svelte).
- [ ] **Step 2:** Update CLAUDE.md: add `export.js` and `prompts.svelte.js` to the key-files tree, add `tests/export.test.js` with its test count and the new total, and add a short "AI export (export.js)" section describing the snapshot format, placeholders, localStorage keys, and the display-only/zero-API-calls constraints. Update BACKLOG.md with the parked Gemini phase-2 item.
- [ ] **Step 3:** Full verification: `npm test` (all green, note new total) and `npm run build`.
- [ ] **Step 4:** Commit docs + bump, push branch, open PR:

```bash
git add package.json CLAUDE.md BACKLOG.md
git commit -m "chore: bump v0.18, document AI export feature"
git push -u origin feat/ai-export-prompt
gh pr create --title "feat: Copy-for-AI export with editable prompt templates (v0.18)" --body "..."
```

PR body: summary of the feature, spec + plan links, test delta. Per user's PR style memory: **no Claude Code footer, no speculative manual-verify checkboxes.**

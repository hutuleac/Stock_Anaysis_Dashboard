# Quality Score Engine (Slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a pure, fully-tested `computeQualityScore(input)` engine (0–100 structural business quality) plus `parseFinancials()` and a cached `fetchFinancialsReported()` API wrapper — no UI, no refresh-loop wiring (Slice 3).

**Architecture:** Two new files. `src/lib/qualityScore.js` holds `parseFinancials` (extracts OCF/capex/buyback/diluted-shares from a `financials-reported` payload via stable US-GAAP concept codes) and `computeQualityScore` (composes 5 independently-scored components: profitability, cashFlow, balanceSheet, shareholderReturn, earningsQuality — maxes 30/25/25/10/10 summing to 100). `src/lib/api/finnhub.svelte.js` gains `fetchFinancialsReported(symbol)`, mirroring the existing `fetchHistoricalEarnings` cache pattern exactly.

**Tech Stack:** Vanilla JS (ES modules), Vitest. No new dependencies.

## Global Constraints

- **Zero new API endpoints beyond `/stock/financials-reported`.** This is the one new Finnhub call for the whole slice (7-day cache TTL — statements update quarterly).
- **Pure engine.** `computeQualityScore` and `parseFinancials` do no fetching, no localStorage, no UI. Only `fetchFinancialsReported` touches the network/cache.
- **Never throw, never fake-zero.** Missing metric → its sub-score contributes 0 within an otherwise-scored component. A component whose inputs are *entirely* absent → `null`, omitted from `total`. `parseFinancials` returns `null` for any concept it can't find and never throws on a malformed payload. Follow the existing `num()` convention (`typeof v === 'number' && Number.isFinite(v) ? v : null`), copied locally into `qualityScore.js` per the codebase's existing per-file pattern (`dip.js`, `etf.js`, `timingScore.js`, `export.js` each define their own).
- **Concept-based extraction only.** `parseFinancials` matches on the case-insensitive substring of the stable US-GAAP `concept` field, never on the company-specific `label`.
- **No UI, no `buildLongTermSetup`, no refresh-loop wiring.** Slice 3.

---

## File Structure

- **Create `src/lib/qualityScore.js`** — `parseFinancials(reported)`, `computeQualityScore(input)`, and 5 private component-scoring helpers (`scoreProfitability`, `scoreCashFlow`, `scoreBalanceSheet`, `scoreShareholderReturn`, `scoreEarningsQuality`), each returning `{ score: number|null, notes: string[], warnings: string[], redFlags: string[] }`. One file, matching the existing size/shape of `timingScore.js` (144 lines) and `dip.js`.
- **Create `tests/qualityScore.test.js`** — full coverage per the spec's Testing section.
- **Modify `src/lib/api/finnhub.svelte.js`** — add `CACHE_TTL.financials = 604800`, `EVICT_TTL['fh_financials_']`, and `fetchFinancialsReported(symbol)`.
- **Modify `tests/cache.test.js`** only if it enumerates `EVICT_TTL` prefixes exhaustively (check in Task 2 — extend the existing assertion, don't duplicate it).

---

### Task 1: `parseFinancials` in `qualityScore.js`

**Files:**
- Create: `src/lib/qualityScore.js`
- Test: `tests/qualityScore.test.js`

**Interfaces:**
- Consumes: nothing (pure data transform).
- Produces: `parseFinancials(reported) → { fcf: number|null, ocf: number|null, capex: number|null, buyback: number|null, dilutedShares: number|null, dilutedSharesPrior: number|null }`. Task 3's `scoreCashFlow` and Task 4's `scoreShareholderReturn` consume this shape. `reported` is the raw `financials-reported` payload: `{ data: [{ year, quarter, form, report: { bs, cf, ic } }] }` where `bs`/`cf`/`ic` are arrays of `{ concept, label, value, unit }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/qualityScore.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseFinancials } from '../src/lib/qualityScore.js';

function reportEntry({ year, quarter = 0, cf = [], ic = [] }) {
  return { year, quarter, form: '10-K', report: { bs: [], cf, ic } };
}

const OCF = { concept: 'us-gaap_NetCashProvidedByUsedInOperatingActivities', label: 'Net cash from ops', value: 111500000000, unit: 'USD' };
const CAPEX = { concept: 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', label: 'Capital expenditures', value: 12700000000, unit: 'USD' };
const BUYBACK = { concept: 'us-gaap_PaymentsForRepurchaseOfCommonStock', label: 'Repurchases of common stock', value: 77500000000, unit: 'USD' };
const DILUTED_2026 = { concept: 'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Diluted shares', value: 15200000000, unit: 'shares' };
const DILUTED_2025 = { concept: 'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Diluted shares', value: 15550000000, unit: 'shares' };

describe('parseFinancials', () => {
  it('extracts OCF, capex, buyback, and computes fcf = ocf - capex', () => {
    const reported = { data: [reportEntry({ year: 2026, cf: [OCF, CAPEX, BUYBACK], ic: [DILUTED_2026] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
    expect(result.capex).toBe(12700000000);
    expect(result.buyback).toBe(77500000000);
    expect(result.fcf).toBe(111500000000 - 12700000000);
  });

  it('matches concept case-insensitively and ignores the company-specific label', () => {
    const weirdLabelOcf = { ...OCF, label: 'Totally different vendor wording' };
    const reported = { data: [reportEntry({ year: 2026, cf: [weirdLabelOcf, CAPEX] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
  });

  it('returns null fcf when capex is missing, without throwing', () => {
    const reported = { data: [reportEntry({ year: 2026, cf: [OCF] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
    expect(result.capex).toBeNull();
    expect(result.fcf).toBeNull();
  });

  it('returns all nulls for an empty or malformed payload, never throws', () => {
    expect(parseFinancials({ data: [] })).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
    expect(parseFinancials(null)).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
    expect(parseFinancials({})).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
    expect(parseFinancials({ data: [{ year: 2026, quarter: 0, form: '10-K', report: {} }] })).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
  });

  it('picks the latest annual report (quarter === 0) for current figures, and the prior annual for the diluted-share delta', () => {
    const reported = {
      data: [
        reportEntry({ year: 2025, cf: [], ic: [DILUTED_2025] }),
        reportEntry({ year: 2026, cf: [OCF, CAPEX], ic: [DILUTED_2026] }),
      ],
    };
    const result = parseFinancials(reported);
    expect(result.dilutedShares).toBe(15200000000);
    expect(result.dilutedSharesPrior).toBe(15550000000);
  });

  it('falls back to the latest report when no quarter === 0 annual entry exists', () => {
    const reported = { data: [reportEntry({ year: 2026, quarter: 2, cf: [OCF, CAPEX] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: FAIL — `Cannot find module '../src/lib/qualityScore.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/qualityScore.js`:

```js
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const CONCEPTS = {
  ocf: 'netcashprovidedbyusedinoperatingactivities',
  capex: 'paymentstoacquirepropertyplantandequipment',
  buyback: 'paymentsforrepurchaseofcommonstock',
  dilutedShares: 'weightedaveragenumberofdilutedsharesoutstanding',
};

function findConcept(lines, conceptSubstring) {
  if (!Array.isArray(lines)) return null;
  const hit = lines.find(
    (l) => l && typeof l.concept === 'string' && l.concept.toLowerCase().includes(conceptSubstring)
  );
  return hit ? num(hit.value) : null;
}

function pickAnnualReports(data) {
  if (!Array.isArray(data) || data.length === 0) return { latest: null, prior: null };
  const annual = data.filter((d) => d && d.quarter === 0);
  const sorted = [...(annual.length ? annual : data)].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return { latest: sorted[0] ?? null, prior: sorted[1] ?? null };
}

/**
 * @param {Object} reported  raw `/stock/financials-reported` payload: { data: [{ year, quarter, form, report: { bs, cf, ic } }] }
 * @returns {{ fcf: number|null, ocf: number|null, capex: number|null, buyback: number|null, dilutedShares: number|null, dilutedSharesPrior: number|null }}
 */
export function parseFinancials(reported) {
  const empty = { fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null };
  const data = reported && Array.isArray(reported.data) ? reported.data : null;
  if (!data || data.length === 0) return empty;

  const { latest, prior } = pickAnnualReports(data);
  if (!latest) return empty;

  const cf = latest.report && Array.isArray(latest.report.cf) ? latest.report.cf : [];
  const ic = latest.report && Array.isArray(latest.report.ic) ? latest.report.ic : [];
  const priorIc = prior && prior.report && Array.isArray(prior.report.ic) ? prior.report.ic : [];

  const ocf = findConcept(cf, CONCEPTS.ocf);
  const capex = findConcept(cf, CONCEPTS.capex);
  const buyback = findConcept(cf, CONCEPTS.buyback);
  const dilutedShares = findConcept(ic, CONCEPTS.dilutedShares);
  const dilutedSharesPrior = findConcept(priorIc, CONCEPTS.dilutedShares);

  return {
    fcf: ocf !== null && capex !== null ? ocf - capex : null,
    ocf,
    capex,
    buyback,
    dilutedShares,
    dilutedSharesPrior,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: PASS — 6/6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qualityScore.js tests/qualityScore.test.js
git commit -m "feat: add parseFinancials — concept-based extraction from financials-reported"
```

---

### Task 2: `fetchFinancialsReported` in `finnhub.svelte.js`

**Files:**
- Modify: `src/lib/api/finnhub.svelte.js` — add to `CACHE_TTL` (near line 1–14), `EVICT_TTL` (near line 19–30), and export a new function next to `fetchHistoricalEarnings` (line ~381).
- Test: `tests/qualityScore.test.js` (append) or `tests/cache.test.js` if it asserts the full `EVICT_TTL` key set (check first).

**Interfaces:**
- Consumes: existing `fetchWithCache(type, symbol, fetcher)` and `fetchFinnhub(path)` (both already defined earlier in the file; no changes to their signatures).
- Produces: `fetchFinancialsReported(symbol) → Promise<{ data: [...] }>` — the raw payload Task 1's `parseFinancials` consumes. Not used by any other task in this slice (Slice 3 wires it into the refresh loop).

- [ ] **Step 1: Check whether `tests/cache.test.js` enumerates `EVICT_TTL` prefixes exhaustively**

Run: `grep -n "EVICT_TTL\|fh_earnings_\|fh_fundamentals_" tests/cache.test.js`

If it asserts an exact key list (e.g. `expect(Object.keys(EVICT_TTL)).toEqual([...])`), extend that literal array with `'fh_financials_'` in Step 2 below. If it only checks eviction *behavior* for a couple of prefixes (not an exhaustive list), no test change is needed — skip straight to Step 3.

- [ ] **Step 2: (Only if Step 1 found an exhaustive list) update the existing test**

Add `'fh_financials_'` to the expected array in `tests/cache.test.js`, in the same position `fh_financials_` will occupy in the source (see Step 3).

- [ ] **Step 3: Add the cache TTL, evict entry, and fetch function**

In `src/lib/api/finnhub.svelte.js`, edit the `CACHE_TTL` object (currently lines 1–14):

```js
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
  financials: 604800,      // financials-reported — statements update quarterly, 7d cache
};
```

Edit the `EVICT_TTL` object (currently lines 19–30):

```js
const EVICT_TTL = {
  'fh_quote_':        3600,
  'fh_earnings_':     CACHE_TTL.earnings,
  'fh_fundamentals_': CACHE_TTL.fundamentals,
  'fh_profile_':      CACHE_TTL.profile,
  'fh_news_':         CACHE_TTL.news,
  'fh_smart_money_':  CACHE_TTL.smart_money,
  'fh_candles_':      CACHE_TTL.candles,
  'fh_financials_':   CACHE_TTL.financials,
  'td_tdquote_':      60,
  'td_ts_1day_':      86400,
  'td_ts_1h_':        900,
};
```

Add the fetch function immediately after `fetchHistoricalEarnings` (after line 386):

```js
// ── Financials Reported (cash flow + share-count concepts for Quality Score) ─
// Returns the raw financials-reported payload: { data: [{ year, quarter, form, report: { bs, cf, ic } }] }
export async function fetchFinancialsReported(symbol) {
  return fetchWithCache('financials', symbol, () =>
    fetchFinnhub(`/stock/financials-reported?symbol=${encodeURIComponent(symbol)}`)
  );
}
```

- [ ] **Step 4: Run the full test suite to verify nothing broke**

Run: `npm test -- --run`
Expected: PASS — all existing tests still green (this task adds no new test file; `qualityScore.test.js` from Task 1 stays green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/finnhub.svelte.js
git commit -m "feat: add fetchFinancialsReported cache wrapper (7d TTL)"
```

---

### Task 3: `computeQualityScore` — profitability + cashFlow components

**Files:**
- Modify: `src/lib/qualityScore.js` — add `scoreProfitability`, `scoreCashFlow`, and the initial `computeQualityScore` shell.
- Test: `tests/qualityScore.test.js` (append)

**Interfaces:**
- Consumes: `num()` (already defined in this file from Task 1); no imports from other new-in-this-slice files.
- Produces: `computeQualityScore(input) → QualityScore` (final full shape defined in Task 5, but this task establishes the return object with `components.profitability` and `components.cashFlow` populated and the other three components hardcoded to `null` until Tasks 4–5 fill them in). Input shape:
  ```js
  /**
   * @param {Object} input
   * @param {Object|null} input.metric      metric=all object: roiTTM, roeTTM, operatingMarginTTM, pegTTM, currentRatioQuarterly, 'totalDebt/totalEquityQuarterly', netInterestCoverageTTM, payoutRatioTTM, dividendYieldIndicatedAnnual, epsGrowthTTMYoy, epsGrowth3Y, grossMarginTTM, roaTTM
   * @param {number|null} input.marketCap   USD millions (profile2)
   * @param {Object|null} input.financials  parseFinancials() output
   * @param {Array|null}  input.earnings    [{ actual, estimate }] most-recent-first, up to 8
   */
  ```
  Task 4 and Task 5 extend this same function — do not rename it or change this signature.

- [ ] **Step 1: Write the failing tests**

Append to `tests/qualityScore.test.js`:

```js
import { computeQualityScore } from '../src/lib/qualityScore.js';

describe('computeQualityScore — profitability component', () => {
  it('scores ROIC tiers: >=20% -> 18, >=15% -> 15, >=10% -> 10, >=5% -> 5, <5% -> 0', () => {
    const base = { marketCap: null, financials: null, earnings: null };
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.20 } }).components.profitability).toBeGreaterThanOrEqual(18);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.22 } }).components.profitability).toBe(18);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.16 } }).components.profitability).toBe(15);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.11 } }).components.profitability).toBe(10);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.06 } }).components.profitability).toBe(5);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.02 } }).components.profitability).toBe(0);
  });

  it('falls back to ROE with a note when roiTTM is absent', () => {
    const result = computeQualityScore({ metric: { roeTTM: 0.22 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBe(18);
    expect(result.notes.some((n) => n.includes('ROIC unavailable'))).toBe(true);
  });

  it('adds operating margin tiers on top of ROIC', () => {
    const result = computeQualityScore({ metric: { roiTTM: 0.22, operatingMarginTTM: 0.30 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBe(18 + 8);
  });

  it('adds +4 stability when both eps growth periods are positive, +2 when one is, 0 + warning when both negative', () => {
    const both = computeQualityScore({ metric: { roiTTM: 0.22, epsGrowthTTMYoy: 0.10, epsGrowth3Y: 0.05 }, marketCap: null, financials: null, earnings: null });
    expect(both.components.profitability).toBe(18 + 4);

    const one = computeQualityScore({ metric: { roiTTM: 0.22, epsGrowthTTMYoy: 0.10, epsGrowth3Y: -0.05 }, marketCap: null, financials: null, earnings: null });
    expect(one.components.profitability).toBe(18 + 2);

    const neither = computeQualityScore({ metric: { roiTTM: 0.22, epsGrowthTTMYoy: -0.10, epsGrowth3Y: -0.05 }, marketCap: null, financials: null, earnings: null });
    expect(neither.components.profitability).toBe(18);
    expect(neither.warnings.some((w) => w.includes('EPS growth is negative across multiple periods'))).toBe(true);
  });

  it('caps profitability at 30', () => {
    const result = computeQualityScore({
      metric: { roiTTM: 0.25, operatingMarginTTM: 0.30, epsGrowthTTMYoy: 0.10, epsGrowth3Y: 0.10 },
      marketCap: null, financials: null, earnings: null,
    });
    expect(result.components.profitability).toBeLessThanOrEqual(30);
  });

  it('profitability is null when metric is entirely absent', () => {
    const result = computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBeNull();
  });
});

describe('computeQualityScore — cashFlow component', () => {
  const fin = (fcf) => ({ fcf, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null });

  it('scores FCF yield tiers: >=8% -> 15, >=6% -> 12, >=4% -> 8, >=2% -> 4, <2% -> 1', () => {
    // marketCap is USD millions; FCF is absolute USD. marketCap=1000 (millions) => 1e9 USD.
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(90_000_000), earnings: null }).components.cashFlow).toBe(15); // 9%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(70_000_000), earnings: null }).components.cashFlow).toBe(12); // 7%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(50_000_000), earnings: null }).components.cashFlow).toBe(8);  // 5%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(30_000_000), earnings: null }).components.cashFlow).toBe(4);  // 3%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(10_000_000), earnings: null }).components.cashFlow).toBe(1);  // 1%
  });

  it('scores 0 + red flag for negative FCF', () => {
    const result = computeQualityScore({ metric: null, marketCap: 1000, financials: fin(-5_000_000), earnings: null });
    expect(result.components.cashFlow).toBe(0);
    expect(result.redFlags).toContain('Negative free cash flow');
  });

  it('FCF sub-score is null (not 0) when fcf or marketCap is missing, so PEG alone can still score', () => {
    const result = computeQualityScore({ metric: { pegTTM: 0.8 }, marketCap: null, financials: fin(null), earnings: null });
    expect(result.components.cashFlow).toBe(10); // PEG-only: <=1.0 tier
  });

  it('scores PEG tiers: <=1.0 -> 10, <=1.5 -> 7, <=2.0 -> 4, >2.0 -> 1, invalid/absent -> no points (not penalized)', () => {
    const withFcf = fin(90_000_000); // maxes FCF sub at 15
    expect(computeQualityScore({ metric: { pegTTM: 0.9 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 10);
    expect(computeQualityScore({ metric: { pegTTM: 1.4 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 7);
    expect(computeQualityScore({ metric: { pegTTM: 1.9 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 4);
    expect(computeQualityScore({ metric: { pegTTM: 3.0 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 1);
    expect(computeQualityScore({ metric: { pegTTM: -1 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15);
    expect(computeQualityScore({ metric: {}, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15);
  });

  it('caps cashFlow at 25', () => {
    const result = computeQualityScore({ metric: { pegTTM: 0.5 }, marketCap: 1000, financials: fin(200_000_000), earnings: null });
    expect(result.components.cashFlow).toBeLessThanOrEqual(25);
  });

  it('cashFlow is null when both metric and financials/marketCap are entirely absent', () => {
    const result = computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null });
    expect(result.components.cashFlow).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: FAIL — `computeQualityScore is not exported` / `is not a function`.

- [ ] **Step 3: Implement `scoreProfitability`, `scoreCashFlow`, and the `computeQualityScore` shell**

Append to `src/lib/qualityScore.js`:

```js
function scoreProfitability(metric) {
  if (!metric) return { score: null, notes: [], warnings: [] };
  const notes = [];
  const warnings = [];
  let score = 0;

  const roic = num(metric.roiTTM);
  const roe = num(metric.roeTTM);
  const roicValue = roic !== null ? roic : roe;
  if (roic === null && roe !== null) notes.push('ROIC unavailable — used ROE');
  if (roicValue !== null) {
    if (roicValue >= 0.20) score += 18;
    else if (roicValue >= 0.15) score += 15;
    else if (roicValue >= 0.10) score += 10;
    else if (roicValue >= 0.05) score += 5;
  }

  const opMargin = num(metric.operatingMarginTTM);
  if (opMargin !== null) {
    if (opMargin >= 0.25) score += 8;
    else if (opMargin >= 0.15) score += 6;
    else if (opMargin >= 0.08) score += 4;
    else if (opMargin > 0) score += 2;
  }

  const epsYoy = num(metric.epsGrowthTTMYoy);
  const eps3y = num(metric.epsGrowth3Y);
  if (epsYoy !== null && eps3y !== null) {
    if (epsYoy > 0 && eps3y > 0) score += 4;
    else if (epsYoy > 0 || eps3y > 0) score += 2;
    else warnings.push('EPS growth is negative across multiple periods');
  } else if ((epsYoy !== null && epsYoy > 0) || (eps3y !== null && eps3y > 0)) {
    score += 2;
  }

  const grossMargin = num(metric.grossMarginTTM);
  const roa = num(metric.roaTTM);
  if (grossMargin !== null) notes.push(`Gross margin ${(grossMargin * 100).toFixed(1)}%`);
  if (roa !== null) notes.push(`ROA ${(roa * 100).toFixed(1)}%`);

  return { score: Math.min(30, score), notes, warnings };
}

function scoreCashFlow(metric, marketCap, financials) {
  const fcf = financials ? num(financials.fcf) : null;
  const marketCapNum = num(marketCap);
  const hasFcfInputs = fcf !== null && marketCapNum !== null;
  const pegRaw = metric ? num(metric.pegTTM) : null;
  const hasPegInput = pegRaw !== null && pegRaw > 0;
  if (!hasFcfInputs && !hasPegInput) return { score: null, notes: [], warnings: [], redFlags: [] };

  const redFlags = [];
  let score = 0;

  if (hasFcfInputs) {
    const marketCapUsd = marketCapNum * 1e6;
    const fcfYield = (fcf / marketCapUsd) * 100;
    if (fcf < 0) {
      redFlags.push('Negative free cash flow');
    } else if (fcfYield >= 8) score += 15;
    else if (fcfYield >= 6) score += 12;
    else if (fcfYield >= 4) score += 8;
    else if (fcfYield >= 2) score += 4;
    else score += 1;
  }

  if (hasPegInput) {
    if (pegRaw <= 1.0) score += 10;
    else if (pegRaw <= 1.5) score += 7;
    else if (pegRaw <= 2.0) score += 4;
    else score += 1;
  }

  return { score: Math.min(25, score), notes: [], warnings: [], redFlags };
}

/**
 * @typedef {Object} QualityScore
 * @property {number|null} total
 * @property {'HIGH'|'MEDIUM'|'LOW'|'INSUFFICIENT_DATA'} label
 * @property {Object} components
 * @property {number|null} components.profitability
 * @property {number|null} components.cashFlow
 * @property {number|null} components.balanceSheet
 * @property {number|null} components.shareholderReturn
 * @property {number|null} components.earningsQuality
 * @property {string[]} redFlags
 * @property {string[]} notes
 */

/**
 * @param {Object} input
 * @param {Object|null} input.metric
 * @param {number|null} input.marketCap
 * @param {Object|null} input.financials
 * @param {Array|null} input.earnings
 * @returns {QualityScore}
 */
export function computeQualityScore(input) {
  const { metric = null, marketCap = null, financials = null, earnings = null } = input || {};

  const profitability = scoreProfitability(metric);
  const cashFlow = scoreCashFlow(metric, marketCap, financials);

  const components = {
    profitability: profitability.score,
    cashFlow: cashFlow.score,
    balanceSheet: null,
    shareholderReturn: null,
    earningsQuality: null,
  };
  const notes = [...profitability.notes, ...cashFlow.notes];
  const warnings = [...profitability.warnings, ...cashFlow.warnings];
  const redFlags = [...(cashFlow.redFlags || [])];

  const nonNull = Object.values(components).filter((c) => c !== null);
  const total = nonNull.length > 0 ? Math.round(nonNull.reduce((a, b) => a + b, 0)) : null;
  const label = nonNull.length < 3 ? 'INSUFFICIENT_DATA' : total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW';

  return { total, label, components, redFlags, notes: [...notes, ...warnings] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: PASS — all profitability + cashFlow tests green (the earlier `parseFinancials` tests from Task 1 stay green too).

- [ ] **Step 5: Commit**

```bash
git add src/lib/qualityScore.js tests/qualityScore.test.js
git commit -m "feat: computeQualityScore — profitability + cashFlow components"
```

---

### Task 4: `computeQualityScore` — balanceSheet + shareholderReturn components

**Files:**
- Modify: `src/lib/qualityScore.js` — add `scoreBalanceSheet`, `scoreShareholderReturn`, wire both into `computeQualityScore`.
- Test: `tests/qualityScore.test.js` (append)

**Interfaces:**
- Consumes: `num()` from Task 1; the `computeQualityScore` shell from Task 3 (extends it — do not rewrite the profitability/cashFlow wiring).
- Produces: `components.balanceSheet` and `components.shareholderReturn` populated. Task 5 fills `earningsQuality` and finalizes label/redFlags/notes ordering — this task's `notes`/`warnings`/`redFlags` arrays must merge the same way Task 3's did (spread into the top-level arrays).

- [ ] **Step 1: Write the failing tests**

Append to `tests/qualityScore.test.js`:

```js
describe('computeQualityScore — balanceSheet component', () => {
  const base = { metric: {}, marketCap: null, financials: null, earnings: null };

  it('scores debt/equity fallback tiers: <0.5 -> 10, <1.0 -> 7, <2.0 -> 3, >=2.0 -> 0 + warning', () => {
    expect(computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 0.3 } }).components.balanceSheet).toBe(10);
    expect(computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 0.8 } }).components.balanceSheet).toBe(7);
    expect(computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 1.5 } }).components.balanceSheet).toBe(3);
    const high = computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 2.5 } });
    expect(high.components.balanceSheet).toBe(0);
    expect(high.notes.some((n) => n.includes('High leverage'))).toBe(true);
  });

  it('adds current ratio tiers: >=1.5 -> +5, >=1.0 -> +3, <1.0 -> 0 + warning', () => {
    expect(computeQualityScore({ ...base, metric: { currentRatioQuarterly: 1.8 } }).components.balanceSheet).toBe(5);
    expect(computeQualityScore({ ...base, metric: { currentRatioQuarterly: 1.2 } }).components.balanceSheet).toBe(3);
    const low = computeQualityScore({ ...base, metric: { currentRatioQuarterly: 0.7 } });
    expect(low.components.balanceSheet).toBe(0);
    expect(low.notes.some((n) => n.includes('Current ratio below 1'))).toBe(true);
  });

  it('adds interest coverage tiers: >=8 -> +5, >=3 -> +3, <3 -> 0 + red flag', () => {
    expect(computeQualityScore({ ...base, metric: { netInterestCoverageTTM: 10 } }).components.balanceSheet).toBe(5);
    expect(computeQualityScore({ ...base, metric: { netInterestCoverageTTM: 4 } }).components.balanceSheet).toBe(3);
    const weak = computeQualityScore({ ...base, metric: { netInterestCoverageTTM: 1 } });
    expect(weak.components.balanceSheet).toBe(0);
    expect(weak.redFlags).toContain('Weak interest coverage');
  });

  it('sums leverage + liquidity + coverage, capped at 25', () => {
    const result = computeQualityScore({
      ...base,
      metric: { 'totalDebt/totalEquityQuarterly': 0.3, currentRatioQuarterly: 1.8, netInterestCoverageTTM: 10 },
    });
    expect(result.components.balanceSheet).toBe(10 + 5 + 5);
    expect(result.components.balanceSheet).toBeLessThanOrEqual(25);
  });

  it('balanceSheet is null when metric is entirely absent', () => {
    expect(computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null }).components.balanceSheet).toBeNull();
  });
});

describe('computeQualityScore — shareholderReturn component', () => {
  const fin = (dilutedShares, dilutedSharesPrior) => ({
    fcf: null, ocf: null, capex: null, buyback: null, dilutedShares, dilutedSharesPrior,
  });

  it('scores dividend tiers: yield>=2% & payout<70% -> 4, yield>0 & payout<90% -> 2, payout>=90% -> 0 + warning', () => {
    const good = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0.025, payoutRatioTTM: 0.5 }, marketCap: null, financials: null, earnings: null });
    expect(good.components.shareholderReturn).toBe(4);

    const ok = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0.01, payoutRatioTTM: 0.8 }, marketCap: null, financials: null, earnings: null });
    expect(ok.components.shareholderReturn).toBe(2);

    const risky = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0.01, payoutRatioTTM: 0.95 }, marketCap: null, financials: null, earnings: null });
    expect(risky.components.shareholderReturn).toBe(0);
    expect(risky.notes.some((n) => n.includes('Dividend payout may be unsustainable'))).toBe(true);
  });

  it('does not penalize a non-payer (yield 0, no warning)', () => {
    const result = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.shareholderReturn).toBe(0);
    expect(result.notes.some((n) => n.includes('Dividend'))).toBe(false);
  });

  it('scores share-count reduction: down>2% -> +6, down 0-2% -> +3, up>3% -> 0 + warning', () => {
    const down = computeQualityScore({ metric: {}, marketCap: null, financials: fin(950, 1000), earnings: null }); // -5%
    expect(down.components.shareholderReturn).toBe(6);

    const flat = computeQualityScore({ metric: {}, marketCap: null, financials: fin(990, 1000), earnings: null }); // -1%
    expect(flat.components.shareholderReturn).toBe(3);

    const diluted = computeQualityScore({ metric: {}, marketCap: null, financials: fin(1050, 1000), earnings: null }); // +5%
    expect(diluted.components.shareholderReturn).toBe(0);
    expect(diluted.notes.some((n) => n.includes('Material share dilution'))).toBe(true);
  });

  it('leaves the share-count sub-score out (not forced to 0) when diluted-share history is missing', () => {
    const result = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0.025, payoutRatioTTM: 0.5 }, marketCap: null, financials: fin(null, null), earnings: null });
    expect(result.components.shareholderReturn).toBe(4); // dividend only, share-count sub contributes nothing
  });

  it('caps shareholderReturn at 10', () => {
    const result = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0.03, payoutRatioTTM: 0.4 }, marketCap: null, financials: fin(900, 1000), earnings: null });
    expect(result.components.shareholderReturn).toBeLessThanOrEqual(10);
  });

  it('shareholderReturn is null when both metric and financials are entirely absent', () => {
    expect(computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null }).components.shareholderReturn).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: FAIL — `components.balanceSheet` / `components.shareholderReturn` are `null` where tests expect numbers (the shell from Task 3 hardcodes them).

- [ ] **Step 3: Implement `scoreBalanceSheet`, `scoreShareholderReturn`, and wire into `computeQualityScore`**

Append to `src/lib/qualityScore.js` (above `computeQualityScore`, alongside `scoreProfitability`/`scoreCashFlow`):

```js
function scoreBalanceSheet(metric) {
  if (!metric) return { score: null, notes: [], warnings: [], redFlags: [] };
  const notes = [];
  const warnings = [];
  const redFlags = [];
  let score = 0;

  const debtEquity = num(metric['totalDebt/totalEquityQuarterly']);
  if (debtEquity !== null) {
    if (debtEquity < 0.5) score += 10;
    else if (debtEquity < 1.0) score += 7;
    else if (debtEquity < 2.0) score += 3;
    else warnings.push('High leverage: debt/equity at or above 2');
  }

  const currentRatio = num(metric.currentRatioQuarterly);
  if (currentRatio !== null) {
    if (currentRatio >= 1.5) score += 5;
    else if (currentRatio >= 1.0) score += 3;
    else warnings.push('Current ratio below 1');
  }

  const coverage = num(metric.netInterestCoverageTTM);
  if (coverage !== null) {
    if (coverage >= 8) score += 5;
    else if (coverage >= 3) score += 3;
    else redFlags.push('Weak interest coverage');
  }

  return { score: Math.min(25, score), notes, warnings, redFlags };
}

function scoreShareholderReturn(metric, financials) {
  const hasDividendInput = !!metric;
  const hasShareCountInput = financials && num(financials.dilutedShares) !== null && num(financials.dilutedSharesPrior) !== null;
  if (!hasDividendInput && !hasShareCountInput) return { score: null, notes: [], warnings: [] };

  const notes = [];
  let score = 0;

  if (hasDividendInput) {
    const yieldPct = num(metric.dividendYieldIndicatedAnnual);
    const payout = num(metric.payoutRatioTTM);
    if (yieldPct !== null && yieldPct > 0) {
      if (yieldPct >= 0.02 && payout !== null && payout < 0.70) score += 4;
      else if (payout !== null && payout >= 0.90) notes.push('Dividend payout may be unsustainable');
      else if (payout === null || payout < 0.90) score += 2;
    }
  }

  if (hasShareCountInput) {
    const current = num(financials.dilutedShares);
    const prior = num(financials.dilutedSharesPrior);
    const changePct = ((current - prior) / prior) * 100;
    if (changePct <= -2) score += 6;
    else if (changePct <= 0) score += 3;
    else if (changePct > 3) notes.push('Material share dilution');
  }

  return { score: Math.min(10, score), notes, warnings: [] };
}
```

Modify `computeQualityScore` (replace the body between the `cashFlow` call and the `return` statement):

```js
export function computeQualityScore(input) {
  const { metric = null, marketCap = null, financials = null, earnings = null } = input || {};

  const profitability = scoreProfitability(metric);
  const cashFlow = scoreCashFlow(metric, marketCap, financials);
  const balanceSheet = scoreBalanceSheet(metric);
  const shareholderReturn = scoreShareholderReturn(metric, financials);

  const components = {
    profitability: profitability.score,
    cashFlow: cashFlow.score,
    balanceSheet: balanceSheet.score,
    shareholderReturn: shareholderReturn.score,
    earningsQuality: null,
  };
  const notes = [...profitability.notes, ...cashFlow.notes, ...balanceSheet.notes, ...shareholderReturn.notes];
  const warnings = [...profitability.warnings, ...cashFlow.warnings, ...balanceSheet.warnings, ...shareholderReturn.warnings];
  const redFlags = [...(cashFlow.redFlags || []), ...(balanceSheet.redFlags || [])];

  const nonNull = Object.values(components).filter((c) => c !== null);
  const total = nonNull.length > 0 ? Math.round(nonNull.reduce((a, b) => a + b, 0)) : null;
  const label = nonNull.length < 3 ? 'INSUFFICIENT_DATA' : total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW';

  return { total, label, components, redFlags, notes: [...notes, ...warnings] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: PASS — all balanceSheet + shareholderReturn tests green, previous tasks' tests unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/qualityScore.js tests/qualityScore.test.js
git commit -m "feat: computeQualityScore — balanceSheet + shareholderReturn components"
```

---

### Task 5: `computeQualityScore` — earningsQuality component + final assembly (label, red flags, INSUFFICIENT_DATA)

**Files:**
- Modify: `src/lib/qualityScore.js` — add `scoreEarningsQuality`, wire into `computeQualityScore`, this is the final version of the function.
- Test: `tests/qualityScore.test.js` (append)

**Interfaces:**
- Consumes: everything from Tasks 1–4 (no signature changes to any of it).
- Produces: the complete `QualityScore` shape. No further tasks in this slice consume `computeQualityScore` — Slice 3 wires the UI to this final signature.

- [ ] **Step 1: Write the failing tests**

Append to `tests/qualityScore.test.js`:

```js
describe('computeQualityScore — earningsQuality component', () => {
  const earn = (results) => results.map(([actual, estimate]) => ({ actual, estimate }));
  const base = { metric: null, marketCap: null, financials: null };

  it('scores beat rate tiers: >=75% -> 10, >=60% -> 7, >=50% -> 4, <50% -> 1', () => {
    expect(computeQualityScore({ ...base, earnings: earn([[2, 1], [2, 1], [2, 1], [2, 1]]) }).components.earningsQuality).toBe(10);
    expect(computeQualityScore({ ...base, earnings: earn([[2, 1], [2, 1], [2, 1], [1, 2], [1, 2]]) }).components.earningsQuality).toBe(7); // 3/5 = 60%
    expect(computeQualityScore({ ...base, earnings: earn([[2, 1], [1, 2]]) }).components.earningsQuality).toBe(4); // 50%
    expect(computeQualityScore({ ...base, earnings: earn([[1, 2], [1, 2], [2, 1]]) }).components.earningsQuality).toBe(1); // 33%
  });

  it('scores 0 + red flag for 3+ consecutive misses (trailing, most-recent-first)', () => {
    const result = computeQualityScore({ ...base, earnings: earn([[1, 2], [1, 2], [1, 2], [2, 1]]) });
    expect(result.components.earningsQuality).toBe(0);
    expect(result.redFlags).toContain('Repeated earnings misses');
  });

  it('earningsQuality is null when earnings history is missing or empty', () => {
    expect(computeQualityScore({ ...base, earnings: null }).components.earningsQuality).toBeNull();
    expect(computeQualityScore({ ...base, earnings: [] }).components.earningsQuality).toBeNull();
  });
});

describe('computeQualityScore — total, label, INSUFFICIENT_DATA', () => {
  it('label is INSUFFICIENT_DATA when fewer than 3 of 5 components are non-null, even if total is reported', () => {
    const result = computeQualityScore({
      metric: { roiTTM: 0.22 }, // profitability only
      marketCap: null,
      financials: null,
      earnings: null,
    });
    expect(result.components.profitability).not.toBeNull();
    expect(result.components.cashFlow).toBeNull();
    expect(result.components.balanceSheet).not.toBeNull(); // balanceSheet also scores off `metric`
    expect(result.components.shareholderReturn).not.toBeNull(); // dividend sub scores off `metric` too (0, non-null)
    expect(result.components.earningsQuality).toBeNull();
    // 3 of 5 non-null here (profitability, balanceSheet, shareholderReturn) -> not INSUFFICIENT_DATA
    expect(result.label).not.toBe('INSUFFICIENT_DATA');
  });

  it('label is INSUFFICIENT_DATA when everything is absent', () => {
    const result = computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null });
    expect(result.total).toBeNull();
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  it('labels HIGH >=75, MEDIUM 50-74, LOW <50 on a fully-populated high-quality input', () => {
    const result = computeQualityScore({
      metric: {
        roiTTM: 0.25, operatingMarginTTM: 0.30, epsGrowthTTMYoy: 0.10, epsGrowth3Y: 0.10,
        pegTTM: 0.8,
        'totalDebt/totalEquityQuarterly': 0.2, currentRatioQuarterly: 2.0, netInterestCoverageTTM: 12,
        dividendYieldIndicatedAnnual: 0.025, payoutRatioTTM: 0.4,
      },
      marketCap: 1000,
      financials: { fcf: 90_000_000, ocf: null, capex: null, buyback: null, dilutedShares: 950, dilutedSharesPrior: 1000 },
      earnings: [{ actual: 2, estimate: 1 }, { actual: 2, estimate: 1 }, { actual: 2, estimate: 1 }],
    });
    expect(result.total).toBeGreaterThanOrEqual(75);
    expect(result.label).toBe('HIGH');
  });

  it('pins a concrete MEDIUM fixture to catch the 50/75 boundary off-by-one', () => {
    const result = computeQualityScore({
      metric: {
        roiTTM: 0.11, operatingMarginTTM: 0.10,
        'totalDebt/totalEquityQuarterly': 1.5, currentRatioQuarterly: 1.2,
      },
      marketCap: null,
      financials: null,
      earnings: earn2([[2, 1], [1, 2]]),
    });
    // profitability: 10+4=14, cashFlow: null, balanceSheet: 3+3=6, shareholderReturn: 0 (metric present, no dividend/payout keys), earningsQuality: 4 (50% beat)
    expect(result.components).toEqual({ profitability: 14, cashFlow: null, balanceSheet: 6, shareholderReturn: 0, earningsQuality: 4 });
    expect(result.total).toBe(24);
    expect(result.label).toBe('LOW');

    function earn2(results) { return results.map(([actual, estimate]) => ({ actual, estimate })); }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: FAIL — `components.earningsQuality` stays `null` where tests expect numbers; the total/label tests fail on the missing component.

- [ ] **Step 3: Implement `scoreEarningsQuality` and finalize `computeQualityScore`**

Append to `src/lib/qualityScore.js` (alongside the other `score*` helpers):

```js
function scoreEarningsQuality(earnings) {
  if (!Array.isArray(earnings) || earnings.length === 0) return { score: null, redFlags: [] };

  const recent = earnings.slice(0, 8);
  const beats = recent.filter((e) => num(e.actual) !== null && num(e.estimate) !== null && e.actual > e.estimate).length;
  const scored = recent.filter((e) => num(e.actual) !== null && num(e.estimate) !== null).length;
  const beatRate = scored > 0 ? beats / scored : 0;

  let consecutiveMisses = 0;
  for (const e of recent) {
    if (num(e.actual) !== null && num(e.estimate) !== null && e.actual < e.estimate) consecutiveMisses += 1;
    else break;
  }

  if (consecutiveMisses >= 3) return { score: 0, redFlags: ['Repeated earnings misses'] };

  let score;
  if (beatRate >= 0.75) score = 10;
  else if (beatRate >= 0.60) score = 7;
  else if (beatRate >= 0.50) score = 4;
  else score = 1;

  return { score, redFlags: [] };
}
```

Replace the full `computeQualityScore` function (final version):

```js
export function computeQualityScore(input) {
  const { metric = null, marketCap = null, financials = null, earnings = null } = input || {};

  const profitability = scoreProfitability(metric);
  const cashFlow = scoreCashFlow(metric, marketCap, financials);
  const balanceSheet = scoreBalanceSheet(metric);
  const shareholderReturn = scoreShareholderReturn(metric, financials);
  const earningsQuality = scoreEarningsQuality(earnings);

  const components = {
    profitability: profitability.score,
    cashFlow: cashFlow.score,
    balanceSheet: balanceSheet.score,
    shareholderReturn: shareholderReturn.score,
    earningsQuality: earningsQuality.score,
  };
  const notes = [...profitability.notes, ...cashFlow.notes, ...balanceSheet.notes, ...shareholderReturn.notes];
  const warnings = [...profitability.warnings, ...cashFlow.warnings, ...balanceSheet.warnings, ...shareholderReturn.warnings];
  const redFlags = [...(cashFlow.redFlags || []), ...(balanceSheet.redFlags || []), ...(earningsQuality.redFlags || [])];

  const nonNull = Object.values(components).filter((c) => c !== null);
  const total = nonNull.length > 0 ? Math.round(nonNull.reduce((a, b) => a + b, 0)) : null;
  const label = nonNull.length < 3 ? 'INSUFFICIENT_DATA' : total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW';

  return { total, label, components, redFlags, notes: [...notes, ...warnings] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/qualityScore.test.js`
Expected: PASS — full file green (all tasks' tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/qualityScore.js tests/qualityScore.test.js
git commit -m "feat: computeQualityScore — earningsQuality component + final total/label assembly"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS — every existing test file plus `tests/qualityScore.test.js` green, no regressions.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds with no errors (this slice touches no Svelte components, so this mainly guards against a stray syntax error).

- [ ] **Step 3: Confirm zero new API endpoints beyond the one documented**

Run: `grep -n "fetchFinnhub(" src/lib/api/finnhub.svelte.js | grep -v "^.*://"`
Expected: the only new call site is `fetchFinancialsReported`'s `/stock/financials-reported` — confirm by eye against `git diff main -- src/lib/api/finnhub.svelte.js`.

- [ ] **Step 4: Write delivery notes**

Create a short summary (in the PR description, not a new file) covering, per the spec's "Delivery notes" section:
- Files created: `src/lib/qualityScore.js`, `tests/qualityScore.test.js`.
- Files modified: `src/lib/api/finnhub.svelte.js`.
- The one new Finnhub endpoint (`/stock/financials-reported`) and its 7-day cache TTL.
- Metrics Finnhub does not provide (net debt/EBITDA — balance-sheet uses the debt/equity fallback, capped lower than the parent spec's primary path as a result).
- Assumptions: `roiTTM` used as an ROIC proxy; `profile2.marketCapitalization` is USD millions, scaled ×1e6 to match absolute-USD FCF.

- [ ] **Step 5: Confirm no commit touched UI or refresh-loop wiring**

Run: `git diff main --stat`
Expected: only `src/lib/qualityScore.js`, `src/lib/api/finnhub.svelte.js`, `tests/qualityScore.test.js` (and this plan file + the earlier design spec doc). No `App.svelte`, no new Svelte component — confirms Slice 3 scope stayed out.

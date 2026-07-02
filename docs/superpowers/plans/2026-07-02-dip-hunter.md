# Audit Fixes + Dip Hunter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the three data defects from `docs/audit-2026-07-02.md` (fake weekly candles, dead VIX, one-day "SPY downtrend"), remove the 403'd short-interest feature, then build the Dip Hunter card per `docs/superpowers/specs/2026-07-02-dip-hunter-design.md`.

**Architecture:** Phase 1 corrects the data layer (indicators.js gains `resampleWeekly` + `realizedVol`; App.svelte wiring; finnhub.svelte.js cleanup). Phase 2 adds one combined smart-money fetcher, a pure `dip.js` scoring module, and a `DipRadar.svelte` card. Display-only throughout — `computeScore` internals untouched (it only receives a differently-sourced `vixPrice`).

**Tech Stack:** Svelte 5 runes, Vitest, Finnhub free tier, TwelveData free tier, localStorage.

## Global Constraints

- One feature = one branch = one PR; never commit to `main` (BACKLOG.md rules).
- Display-only: nothing new feeds `computeScore` signal list or `signals.js`.
- `npm test` green before every commit; new math gets unit tests in `tests/`.
- PR bodies: no Claude Code footer, no speculative manual-verify checkboxes.
- On ship: README changelog entry + version bump (v0.16 in Phase 2), BACKLOG.md updated.
- All Finnhub calls go through `fetchFinnhub`/`fetchWithCache`; all TD calls through the existing queue.

---

## Phase 1 — branch `fix/audit-f1-f2-f4`

### Task 1: Branch + commit audit/spec docs

- [ ] `git checkout -b fix/audit-f1-f2-f4`
- [ ] `git add docs/ && git commit -m "docs: platform audit 2026-07-02 + dip hunter spec/plan"`

### Task 2: `resampleWeekly` (F1)

**Files:**
- Modify: `src/lib/indicators.js` (new export at end of file)
- Modify: `src/App.svelte:219-228` (refresh path) and `src/App.svelte:413-415` (hydrate path)
- Test: `tests/indicators.test.js` (append describe block)

**Interfaces:**
- Produces: `resampleWeekly(raw)` → `{ s:'ok', t[], o[], h[], l[], c[], v[] } | null`. Input is a Finnhub-style raw object with epoch-second `t`.

- [ ] **Step 1: failing tests** — append to `tests/indicators.test.js`:

```js
import { resampleWeekly } from '../src/lib/indicators.js';

describe('resampleWeekly', () => {
  // Mon 2026-06-01 = 1780272000 UTC. day = 86400.
  const D = 86400;
  const MON = 1780272000;
  function bars(ts) {
    return {
      s: 'ok',
      t: ts,
      o: ts.map((_, i) => 10 + i),
      h: ts.map((_, i) => 20 + i),
      l: ts.map((_, i) => 5 + i),
      c: ts.map((_, i) => 15 + i),
      v: ts.map(() => 100),
    };
  }

  it('aggregates a full Mon–Fri week into one bar', () => {
    const w = resampleWeekly(bars([MON, MON + D, MON + 2 * D, MON + 3 * D, MON + 4 * D]));
    expect(w.c.length).toBe(1);
    expect(w.o[0]).toBe(10);        // first open
    expect(w.h[0]).toBe(24);        // max high
    expect(w.l[0]).toBe(5);         // min low
    expect(w.c[0]).toBe(19);        // last close
    expect(w.v[0]).toBe(500);       // summed volume
    expect(w.t[0]).toBe(MON);       // week's first bar ts
  });

  it('splits across the weekend and keeps the partial current week', () => {
    // Thu+Fri, then Mon+Tue of next week
    const w = resampleWeekly(bars([MON + 3 * D, MON + 4 * D, MON + 7 * D, MON + 8 * D]));
    expect(w.c.length).toBe(2);
    expect(w.v[0]).toBe(200);
    expect(w.v[1]).toBe(200);
    expect(w.c[1]).toBe(18);        // latest daily close survives
  });

  it('handles a holiday-short week (4 bars) as one week', () => {
    const w = resampleWeekly(bars([MON + D, MON + 2 * D, MON + 3 * D, MON + 4 * D]));
    expect(w.c.length).toBe(1);
    expect(w.o[0]).toBe(10);
  });

  it('returns null on invalid input', () => {
    expect(resampleWeekly(null)).toBeNull();
    expect(resampleWeekly({ s: 'no_data' })).toBeNull();
    expect(resampleWeekly({ s: 'ok', c: [1], t: [] })).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL (`resampleWeekly` not exported)
- [ ] **Step 3: implement** — append to `src/lib/indicators.js`:

```js
// ── Daily → weekly OHLCV resampling ──────────────────────────────────────────
// Groups daily bars into ISO weeks (Mon-start): open = first, high = max,
// low = min, close = last, volume = sum. Includes the current partial week,
// so weekly signals always reflect the latest trading day.
export function resampleWeekly(raw) {
  if (!raw?.c?.length || raw.s !== 'ok' || !raw.t || raw.t.length !== raw.c.length) return null;
  // Epoch day 0 (1970-01-01) was a Thursday; +3 aligns week boundaries to Monday.
  const weekKey = (ts) => Math.floor((Math.floor(ts / 86400) + 3) / 7);
  const out = { s: 'ok', t: [], o: [], h: [], l: [], c: [], v: [] };
  let key = null;
  for (let i = 0; i < raw.c.length; i++) {
    const k = weekKey(raw.t[i]);
    if (k !== key) {
      key = k;
      out.t.push(raw.t[i]);
      out.o.push(raw.o?.[i] ?? raw.c[i]);
      out.h.push(raw.h?.[i] ?? raw.c[i]);
      out.l.push(raw.l?.[i] ?? raw.c[i]);
      out.c.push(raw.c[i]);
      out.v.push(raw.v?.[i] ?? 0);
    } else {
      const j = out.c.length - 1;
      out.h[j] = Math.max(out.h[j], raw.h?.[i] ?? raw.c[i]);
      out.l[j] = Math.min(out.l[j], raw.l?.[i] ?? raw.c[i]);
      out.c[j] = raw.c[i];
      out.v[j] += raw.v?.[i] ?? 0;
    }
  }
  return out;
}
```

- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: wire into App.svelte** — both places. Refresh path (~line 219): replace

```js
              const wIdx = synthetic.c.map((_, i) => i).filter(i => i % 5 === 0);
              const weeklyRaw = { ... };
```

with

```js
              const weeklyRaw = resampleWeekly(synthetic);
```

Hydrate path (~line 414): replace the `wIdx`/`weeklyRaw` pair with `const weeklyRaw = resampleWeekly(synthetic);` and guard `if (weeklyRaw) { ... }` around the two compute calls (resampleWeekly can't return null here since synthetic is valid, but keep the existing `if (wt)`/`if (st)` guards). Add `resampleWeekly` to the indicators import on line 4.

- [ ] **Step 6:** `npm test` && `npm run build` → PASS
- [ ] **Step 7:** `git commit -m "fix: aggregate daily candles into real weekly bars (audit F1)"`

### Task 3: VIX proxy + SPY trend (F2 + F4)

**Files:**
- Modify: `src/lib/indicators.js` (new `realizedVol` export)
- Modify: `src/lib/api/finnhub.svelte.js:307-329` (`fetchMarketContext`)
- Modify: `src/App.svelte` (market context wiring, hydrate)
- Modify: `src/lib/components/MarketContextBar.svelte` (VIX → VOL display)
- Modify: `src/lib/tooltipDefs.js:134-148` (`vix` def text)
- Modify: `src/lib/demoData.js:71` (demo context)
- Test: `tests/indicators.test.js`

**Interfaces:**
- Produces: `realizedVol(closes, window = 20)` → annualized % number or null. `marketContextData` gains `volProxy: number|null` and `spyBelowEma50: boolean|null`; loses `vix`.

- [ ] **Step 1: failing tests:**

```js
import { realizedVol } from '../src/lib/indicators.js';

describe('realizedVol', () => {
  it('is ~0 for a flat series', () => {
    expect(realizedVol(Array(30).fill(100))).toBeCloseTo(0, 5);
  });
  it('matches hand-computed annualized stdev of log returns', () => {
    // alternating ±1% daily moves → per-bar log-return stdev ≈ 0.0100003
    const closes = [100];
    for (let i = 0; i < 25; i++) closes.push(closes[i] * (i % 2 ? 0.99 : 1.01));
    const v = realizedVol(closes, 20);
    expect(v).toBeGreaterThan(14);  // ≈ 0.01 * sqrt(252) * 100 ≈ 15.9
    expect(v).toBeLessThan(18);
  });
  it('returns null with insufficient data', () => {
    expect(realizedVol([1, 2, 3], 20)).toBeNull();
    expect(realizedVol(null)).toBeNull();
  });
});
```

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3: implement** in `indicators.js`:

```js
// ── Realized volatility (VIX proxy) ──────────────────────────────────────────
// Annualized stdev of the last `window` daily log returns, in % points —
// comparable to VIX levels. Finnhub free returns zeros for the real VIX,
// so the regime logic runs on SPY realized vol instead.
export function realizedVol(closes, window = 20) {
  if (!closes || closes.length < window + 1) return null;
  const rets = [];
  for (let i = closes.length - window; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  if (rets.length < window) return null;
  const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / rets.length;
  return Math.round(Math.sqrt(variance) * Math.sqrt(252) * 1000) / 10;
}
```

- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5: finnhub.svelte.js** — `fetchMarketContext` drops the two dead calls:

```js
export async function fetchMarketContext() {
  const spyQuote = await fetchQuote('SPY');
  await delay(CALL_DELAY_MS);

  // Fear & Greed (non-blocking — CORS may fail on some networks)
  const fearGreed = await fetchFearAndGreed().catch(() => ({ data: null, stale: true }));
  await delay(CALL_DELAY_MS);

  const sectorResults = {};
  for (const etf of ALL_SECTOR_ETFS) {
    sectorResults[etf] = await fetchQuote(etf);
    await delay(CALL_DELAY_MS);
  }

  return { spy: spyQuote, fearGreed, sectors: sectorResults };
}
```

- [ ] **Step 6: App.svelte wiring.** In `handleRefresh`, initial `setMarketContext` becomes a fallback (no VIX):

```js
        setMarketContext({
          vixPrice:       null, // refined below from SPY realized vol
          spyDowntrend:   (marketContextData.spy?.data?.dp ?? 0) < -0.5, // refined below
          fearGreedValue: marketContextData.fearGreed?.data?.score ?? null,
        });
```

After the `spyCloses` fetch succeeds (existing try block), refine:

```js
      if (spyCloses?.length) {
        const volProxy = realizedVol(spyCloses);
        const ema50arr = emaArray(spyCloses, 50);
        const spyBelowEma50 = ema50arr.length
          ? spyCloses[spyCloses.length - 1] < ema50arr[ema50arr.length - 1] : null;
        if (marketContextData) {
          marketContextData.volProxy = volProxy;
          marketContextData.spyBelowEma50 = spyBelowEma50;
        }
        setMarketContext({
          vixPrice:       volProxy,
          spyDowntrend:   spyBelowEma50 ?? ((marketContextData?.spy?.data?.dp ?? 0) < -0.5),
          fearGreedValue: marketContextData?.fearGreed?.data?.score ?? null,
        });
      }
```

Import `realizedVol, emaArray` from indicators.js. In `hydrateStartup`, the supplement block replaces `vix?.data?.c` with:

```js
            setMarketContext({
              vixPrice:       sup.marketContextData.volProxy ?? null,
              spyDowntrend:   sup.marketContextData.spyBelowEma50
                                ?? ((sup.marketContextData.spy?.data?.dp ?? 0) < -0.5),
              fearGreedValue: sup.marketContextData.fearGreed?.data?.score ?? null,
            });
```

(`marketContextData` is persisted in the supplement already — `volProxy`/`spyBelowEma50` ride along for free.)

- [ ] **Step 7: MarketContextBar** — `vixPrice` derived becomes `marketData?.volProxy ?? null`; drop `vixChange` (no dp for a computed value); label "VIX" → "VOL", keep `getVixLevel` thresholds (proxy is VIX-comparable). Tooltip: retitle `TIPS.vix` to "Volatility — SPY 20d realized (annualized)" and add one sentence: "Computed from SPY price history because free API tiers don't serve the real VIX; levels are comparable."
- [ ] **Step 8: demoData** — `DEMO_MARKET_CONTEXT`: replace `vix: { data: { c: 22.4, dp: 3.1 } }` with `volProxy: 22.4, spyBelowEma50: true`.
- [ ] **Step 9:** `npm test` && `npm run build` → PASS. `git commit -m "fix: SPY realized-vol regime proxy + EMA50 SPY trend, drop dead VIX calls (audit F2+F4)"`

### Task 4: Remove short interest (F3)

**Files:**
- Modify: `src/lib/api/finnhub.svelte.js` (delete `fetchShortInterest` lines 165-178, `short_interest` TTL line 12, hydrate entry line 206, refreshAll call+field lines 229-231)
- Modify: `src/lib/components/FundamentalsBar.svelte:423-~440` (delete the short-interest block; check surrounding markup stays balanced)
- Modify: `src/lib/tooltipDefs.js:273-286` (delete `shortInterest` def)
- Modify: `src/lib/demoData.js` (delete 5 `shortInterest:` lines)

- [ ] **Step 1:** delete all listed code. `grep -rn shortInterest src/` → no hits.
- [ ] **Step 2:** `npm test` && `npm run build` → PASS
- [ ] **Step 3:** `git commit -m "chore: remove short interest — endpoint regressed to 403 on free tier (audit F3)"`

### Task 5: Phase 1 ship

- [ ] README changelog entries (weekly bars fix, VOL proxy, SPY trend, short interest removed). BACKLOG.md: item 5 annotated "endpoint regressed to premium 2026-07 — feature removed".
- [ ] `npm test` (all green) → commit `docs: changelog + backlog for audit fixes`
- [ ] Push branch, open PR "fix: audit 2026-07 — real weekly bars, volatility regime proxy, SPY trend, short-interest removal" (body: summary + link to `docs/audit-2026-07-02.md`; no footer).
- [ ] After merge: `git checkout main && git pull`.

---

## Phase 2 — branch `feat/dip-hunter` (off updated main)

### Task 6: Smart-money fetcher

**Files:**
- Modify: `src/lib/api/finnhub.svelte.js` (new export + TTL + hydrate entry)
- Modify: `src/App.svelte` (enrichment loop call + supplement field)

**Interfaces:**
- Produces: `fetchSmartMoney(symbol)` → `{ data: { rec: { buyRatio, deteriorating } | null, mspr3m: number | null } | null, stale }`. Attached as `results[symbol].smartMoney`.

- [ ] **Step 1:** add `smart_money: 604800,` to `CACHE_TTL`. Implement:

```js
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
```

- [ ] **Step 2:** hydrate: add `smartMoney: { data: readStale(cacheKey('smart_money', symbol)), stale: true },` to `hydrateFromCache` results.
- [ ] **Step 3:** App.svelte enrichment loop (after the profile fetch block):

```js
        // Smart money (analyst recs + insider sentiment) — 7d cache, free tier
        try {
          const sm = await fetchSmartMoney(ticker.symbol);
          if (sm?.data) results[ticker.symbol].smartMoney = sm;
        } catch { /* non-blocking */ }
        await delay(100);
```

Supplement: add `smartMoney: d.smartMoney ?? p?.smartMoney ?? null,` to the persisted fields and `if (s.smartMoney != null) results[sym].smartMoney = s.smartMoney;` to the hydrate patch loop.

- [ ] **Step 4:** `npm test` && `npm run build` → PASS. `git commit -m "feat: smart-money fetcher (analyst recs + insider sentiment, 7d cache)"`

### Task 7: `dip.js` scoring module

**Files:**
- Create: `src/lib/dip.js`
- Test: `tests/dip.test.js`

**Interfaces:**
- Consumes: ticker objects `{ symbol, data }` with `data.quote.data.c`, `data.metrics.data.metric`, `data.indicators` (rsi, rsiZScore, roc20, roc60, oversoldConfluence), `data.smartMoney.data`; `computeScore(data).fundamental` (scoring.js); `computePEG` (valuation.js).
- Produces: `computeDipRadar(list, marketCtx)` → sorted array of `{ symbol, score, readiness, components[], fearGreed, rsi, roc60, smartMoney }` where `marketCtx = { fearGreedValue, spyBelowEma50 }` and `components[] = { label, score, max, detail }`.

- [ ] **Step 1: failing tests** — `tests/dip.test.js`. Build a helper that returns a fully-qualifying ticker, then knock out one dimension per test:

```js
import { describe, it, expect } from 'vitest';
import { computeDipRadar } from '../src/lib/dip.js';

function makeTicker(overrides = {}) {
  return {
    symbol: 'TEST',
    data: {
      quote: { data: { c: 80 } },
      metrics: { data: { metric: {
        epsGrowthTTMYoy: 15, revenueGrowthTTMYoy: 10, netProfitMarginTTM: 12,
        peNormalizedAnnual: 20, '52WeekHigh': 120, '52WeekLow': 70,
        '50DayMovingAverage': 90, '200DayMovingAverage': 95,
      } } },
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true },
      smartMoney: { data: { rec: { buyRatio: 0.7, deteriorating: false }, mspr3m: 12 } },
      ...overrides,
    },
  };
}
const FEAR = { fearGreedValue: 20, spyBelowEma50: true };
const GREED = { fearGreedValue: 80, spyBelowEma50: false };

describe('computeDipRadar quality gate', () => {
  it('includes a qualifying deep dip', () => {
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(hits.length).toBe(1);
    expect(hits[0].readiness).toBe('ACT');
  });
  for (const [name, patch] of [
    ['negative EPS growth', { epsGrowthTTMYoy: -5, epsGrowth3Y: null }],
    ['negative revenue growth', { revenueGrowthTTMYoy: -2 }],
    ['unprofitable', { netProfitMarginTTM: -3 }],
    ['PEG too high', { peNormalizedAnnual: 90, epsGrowthTTMYoy: 25 }],
  ]) {
    it(`excludes: ${name}`, () => {
      const t = makeTicker();
      Object.assign(t.data.metrics.data.metric, patch);
      expect(computeDipRadar([t], FEAR).length).toBe(0);
    });
  }
});

describe('dip score components', () => {
  it('never returns ACT without a fear component', () => {
    const hits = computeDipRadar([makeTicker()], GREED);
    if (hits.length) expect(hits[0].readiness).not.toBe('ACT');
  });
  it('degrades gracefully with F&G and smart money missing', () => {
    const t = makeTicker({ smartMoney: null });
    const hits = computeDipRadar([t], { fearGreedValue: null, spyBelowEma50: null });
    expect(hits.length).toBe(1); // oversold + drawdown alone ≥ WATCH
    const sm = hits[0].components.find(c => c.label === 'Smart Money');
    expect(sm.score).toBe(0);
    expect(sm.detail).toBe('n/a');
  });
  it('hides shallow dips (score < 3)', () => {
    const t = makeTicker({
      indicators: { rsi: 55, rsiZScore: 0.2, roc20: 1, roc60: 4, oversoldConfluence: false },
      smartMoney: null,
    });
    expect(computeDipRadar([t], GREED).length).toBe(0);
  });
  it('sorts by readiness then score', () => {
    const deep = makeTicker();
    const mild = makeTicker({ indicators: { rsi: 38, rsiZScore: -0.5, roc20: -3, roc60: -9, oversoldConfluence: false } });
    mild.symbol = 'MILD';
    const hits = computeDipRadar([mild, deep], FEAR);
    expect(hits[0].symbol).toBe('TEST');
  });
});
```

Plus tier-boundary its (RSI 30/35/40; roc60 −15/−8; F&G 25/35/45) asserting the component score values from the spec table.

- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3: implement `src/lib/dip.js`:**

```js
// Dip Hunter — early entries when quality stocks go on sale.
// Pure logic, display-only: quality-gates each watchlist name on fundamentals,
// then scores the dip 0–10 (market fear / oversold / drawdown / smart money).
// Reads data already on the ticker object — no API calls, no scoring changes.
import { computeScore } from './scoring.js';
import { computePEG } from './valuation.js';

const READINESS_RANK = { ACT: 3, SOON: 2, WATCH: 1 };

function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }

// ALL checks must pass — the card only ever suggests dips in quality names.
function passesQualityGate(data) {
  const m = data?.metrics?.data?.metric ?? {};
  const eps = num(m.epsGrowthTTMYoy) ?? num(m.epsGrowth3Y);
  if (eps === null || eps <= 0) return false;
  const rev = num(m.revenueGrowthTTMYoy);
  if (rev === null || rev <= 0) return false;
  const margin = num(m.netProfitMarginTTM) ?? num(m.netMargin);
  if (margin === null || margin <= 0) return false;
  const peg = computePEG(m.peNormalizedAnnual ?? m.peBasicExclExtraTTM ?? null, eps);
  if (peg !== null && !(peg < 3)) return false;
  const fund = computeScore(data).fundamental;
  return fund !== null && fund >= 60;
}

function fearComponent(ctx) {
  const fg = num(ctx?.fearGreedValue);
  let s = fg === null ? 0 : fg < 25 ? 2 : fg < 35 ? 1.5 : fg < 45 ? 0.75 : 0;
  if (ctx?.spyBelowEma50 === true) s += 0.5;
  s = Math.min(2.5, s);
  const detail = fg === null ? 'n/a' : `F&G ${fg}${ctx?.spyBelowEma50 ? ', SPY < EMA50' : ''}`;
  return { label: 'Market Fear', score: s, max: 2.5, detail };
}

function oversoldComponent(ind) {
  const rsi = num(ind?.rsi);
  let s = rsi === null ? 0 : rsi < 30 ? 1.5 : rsi < 35 ? 1.0 : rsi < 40 ? 0.5 : 0;
  if (ind?.oversoldConfluence === true) s += 0.75;
  const z = num(ind?.rsiZScore);
  if (z !== null && z <= -1.5) s += 0.75;
  s = Math.min(3.0, s);
  return { label: 'Oversold', score: s, max: 3.0, detail: rsi === null ? 'n/a' : `RSI ${rsi}${z !== null ? `, z ${z}` : ''}` };
}

function drawdownComponent(ind, data) {
  const roc60 = num(ind?.roc60), roc20 = num(ind?.roc20);
  let s = roc60 === null ? 0 : roc60 <= -15 ? 1.25 : roc60 <= -8 ? 0.75 : 0;
  if (roc20 !== null && roc20 <= -5) s += 0.5;
  const m = data?.metrics?.data?.metric ?? {};
  const price = num(data?.quote?.data?.c);
  const hi = num(m['52WeekHigh']), lo = num(m['52WeekLow']);
  if (price !== null && hi !== null && lo !== null && hi > lo) {
    if ((price - lo) / (hi - lo) < 0.4) s += 0.75;
  }
  s = Math.min(2.5, s);
  return { label: 'Drawdown', score: s, max: 2.5, detail: roc60 === null ? 'n/a' : `60d ${roc60}%` };
}

function smartMoneyComponent(sm) {
  const d = sm?.data ?? null;
  if (!d) return { label: 'Smart Money', score: 0, max: 2.0, detail: 'n/a' };
  let s = 0;
  const parts = [];
  if (num(d.mspr3m) !== null && d.mspr3m > 0) { s += 1; parts.push('insiders buying'); }
  if (d.rec && d.rec.buyRatio >= 0.6 && !d.rec.deteriorating) { s += 1; parts.push(`${Math.round(d.rec.buyRatio * 100)}% buy`); }
  return { label: 'Smart Money', score: s, max: 2.0, detail: parts.length ? parts.join(', ') : 'no confirmation' };
}

function round1(v) { return Math.round(v * 10) / 10; }

export function computeDipRadar(list, marketCtx) {
  if (!Array.isArray(list) || !list.length) return [];
  const hits = [];
  for (const item of list) {
    const data = item?.data;
    if (!data?.quote?.data || !passesQualityGate(data)) continue;

    const components = [
      fearComponent(marketCtx),
      oversoldComponent(data.indicators),
      drawdownComponent(data.indicators, data),
      smartMoneyComponent(data.smartMoney),
    ];
    components.forEach(c => { c.score = round1(c.score); });
    const score = round1(components.reduce((s, c) => s + c.score, 0));
    if (score < 3) continue;

    const hasFear = components[0].score > 0;
    const readiness = score >= 7 && hasFear ? 'ACT' : score >= 5 ? 'SOON' : 'WATCH';

    hits.push({
      symbol: item.symbol,
      score,
      readiness,
      components,
      fearGreed: num(marketCtx?.fearGreedValue),
      rsi: num(data.indicators?.rsi),
      roc60: num(data.indicators?.roc60),
      smartMoney: data.smartMoney?.data ?? null,
    });
  }
  hits.sort((a, b) => (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score));
  return hits;
}
```

- [ ] **Step 4:** `npm test` → PASS (note: `computeScore` reads module-level market context; tests run without it set — fundamental sub-score is context-independent, so this is safe).
- [ ] **Step 5:** `git commit -m "feat: dip.js — quality-gated dip scoring engine"`

### Task 8: DipRadar card UI

**Files:**
- Create: `src/lib/components/DipRadar.svelte`
- Modify: `src/lib/tooltipDefs.js` (add `dipRadar`, `dipScore`, `dipSmartMoney` defs following the existing shape: `{ title, subtitle, description, zones?, why }`)
- Modify: `src/App.svelte` (render below `<SetupRadar />`, pass `marketData={marketContextData}`)

**Interfaces:**
- Consumes: `computeDipRadar(getTickers(), { fearGreedValue, spyBelowEma50 })`; `getTickers`/`selectTicker` from watchlist store; `tipAction`/`TIPS` pattern from SetupRadar.svelte.

- [ ] **Step 1:** read `src/lib/components/SetupRadar.svelte` and mirror its card markup exactly (header, table, readiness pill styling, empty state, tooltip wiring). Columns: SYMBOL · DIP SCORE (`n/10`) · READINESS pill (ACT green / SOON amber / WATCH muted) · FEAR (F&G value or —) · RSI · 60D % · SMART MONEY (detail string). Row click → `selectTicker(symbol)`. `$derived` recompute:

```js
  import { computeDipRadar } from '../dip.js';
  import { getTickers, selectTicker } from '../stores/watchlist.svelte.js';
  let { marketData = null } = $props();
  let hits = $derived(computeDipRadar(getTickers(), {
    fearGreedValue: marketData?.fearGreed?.data?.score ?? null,
    spyBelowEma50:  marketData?.spyBelowEma50 ?? null,
  }));
```

Card title: "DIP HUNTER — quality stocks on sale". Empty state: "No quality dips right now — patience is a position." Hidden entirely only when watchlist is empty (match SetupRadar's convention — verify at implementation).

- [ ] **Step 2:** App.svelte: `import DipRadar from './lib/components/DipRadar.svelte';` and render `<DipRadar marketData={marketContextData} />` directly below `<SetupRadar />`.
- [ ] **Step 3:** `npm test` && `npm run build` → PASS. Visual check via `npm run dev` (demo mode shows the card with demo data — add `smartMoney` samples to 2 demo tickers so the demo shows a populated card).
- [ ] **Step 4:** `git commit -m "feat: Dip Hunter card — early entries in quality names"`

### Task 9: Phase 2 ship

- [ ] Version: App.svelte badge `v0.15` → `v0.16`; README version header + changelog entry (Dip Hunter card, smart-money endpoints, what the quality gate means). BACKLOG: add note that dip card shipped.
- [ ] `npm test` full run → green. `git commit -m "chore: bump to v0.16, changelog"`
- [ ] Push, open PR "feat: Dip Hunter — quality-gated dip entry card" (body: what/why, spec link, endpoint cost note: +2 free calls/ticker/week; no footer).

## Self-review notes
- Spec coverage: F1→Task 2, F2/F4→Task 3, F3→Task 4, endpoints→Task 6, dip logic→Task 7, UI→Task 8, ship reqs→Tasks 5/9. `netMargin` fallback and ACT-requires-fear both in Task 7 code. ✓
- Type consistency: `smartMoney.data = { rec: { buyRatio, deteriorating }, mspr3m }` used identically in Tasks 6, 7, 8. `marketCtx = { fearGreedValue, spyBelowEma50 }` consistent in Tasks 7, 8 (App passes via component). ✓

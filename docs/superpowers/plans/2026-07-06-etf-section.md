# ETF Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated ETF view (header toggle `Stocks | ETFs`) tracking Ireland-domiciled UCITS ETFs via US-listed proxies, with a weekly-cadence Entry score, Exit score, and rotation ranking. Spec: `docs/superpowers/specs/2026-07-06-etf-section-design.md`.

**Architecture:** New pure-math engine `src/lib/etf.js` (reuses `indicators.js` + `signals.js` primitives), new store `src/lib/stores/etflist.svelte.js` (catalog + proxy candle data), new view `src/lib/components/EtfDashboard.svelte`, wired into `App.svelte` (view toggle + proxy candle fetch in the existing refresh pipeline + startup hydrate from TwelveData cache).

**Tech Stack:** Svelte 5 runes, Vitest, existing Finnhub/TwelveData API layer. Zero new APIs, zero new dependencies.

## Global Constraints

- Display-only: nothing here touches `computeScore`, `signals.js` internals, or the stock watchlist.
- All persistent state in localStorage. New key: `etfList`. Proxy candles reuse the existing TwelveData cache keys (`td_ts_1day_<SYM>_1day_250`) — no new cache layer.
- Component maxes within each score must sum to exactly 10 (dip.js convention).
- No raw fetch calls outside the existing API modules (`finnhub.svelte.js`, `twelvedata.svelte.js`).
- Existing 214 tests must keep passing (`npm test`).
- Work on branch `feat/etf-section` off `main`.

---

### Task 1: Signal engine `etf.js` (TDD)

**Files:**
- Create: `src/lib/etf.js`
- Test: `tests/etf.test.js`

**Interfaces:**
- Consumes: from `src/lib/indicators.js`: `computeRSI(closes, period=14)`, `emaArray(values, period)`, `computeMACD(closes)` (returns `{ histogram, crossover }` among others; `crossover === 'bullish_cross'` on bull flip), `computeRelativeStrength(stockCloses, benchCloses)` → `{ rs1m, rs3m }` (percent, e.g. `-10` = −10%), `resampleWeekly(raw)`. From `src/lib/signals.js`: `detectDivergence(closes, highs, lows)` → `{ type: 'BULL'|'BEAR', strength, barsAgo }` or null.
- Produces (used by Task 3):
  - `scoreEtfEntry({ rsiW, belowLowerBB, rs3m, groupMedianRs3m, macdCross, divergence, drawdownPct })` → `{ score, components: [{label, score, max, detail}], readiness }`
  - `scoreEtfExit({ rsiW, extensionPct, rs1m, rs3m, volumeRatio })` → same shape
  - `computeEtfSignals(list, spyCloses)` where `list = [{ proxy, weeklyRaw, dailyCloses }]` (`weeklyRaw` is Finnhub-style `{ s:'ok', t,o,h,l,c,v }` weekly bars) → `{ [proxy]: { price, rs: {rs1m, rs3m}, groupMedianRs3m, entry, exit } }`; a proxy with `< 20` weekly bars or missing data maps to `null`.
  - Readiness for both scores: `ACT ≥ 7`, `SOON ≥ 5`, `WATCH ≥ 3`, else `WAIT` (no filtering — the table shows every ETF).

**Score definitions (maxes sum to 10 each):**

Entry — "buy weakness in a quality index":
| Component | Max | Rule |
|---|---|---|
| Oversold | 3.0 | weekly RSI < 30 → 2.0, < 35 → 1.5, < 40 → 0.75; `belowLowerBB` (weekly close ≤ lower BB(20,2), population σ) → +1.0; capped at 3.0 |
| Rotation | 3.0 | vs SPY: rs3m ≤ −10 → 1.5, ≤ −5 → 1.0, ≤ −3 → 0.5; vs group: (groupMedianRs3m − rs3m) ≥ 8 → +1.5, ≥ 4 → +1.0, ≥ 2 → +0.5. **Whole component = 0 if rs3m < −25** (falling knife, not a discount — same philosophy as dip.js RS) |
| Turn | 2.0 | weekly `macdCross === 'bullish_cross'` → 1.0; `divergence?.type === 'BULL'` → 1.0 |
| Drawdown | 2.0 | drawdown from max of dailyCloses (≈52w high): ≥ 20% → 2.0, ≥ 12% → 1.5, ≥ 8% → 1.0, ≥ 5% → 0.5 |

Exit — "sell strength into exhaustion / rotation out":
| Component | Max | Rule |
|---|---|---|
| Overbought | 3.0 | weekly RSI ≥ 75 → 3.0, ≥ 70 → 2.0, ≥ 65 → 1.0 |
| Extension | 3.0 | price above weekly EMA30 by ≥ 25% → 3.0, ≥ 18% → 2.0, ≥ 12% → 1.0 |
| Rotation Loss | 2.0 | rs1m ≤ −2 while rs3m ≥ +5 (led, now lagging = capital rotating out) → 2.0; else rs1m < 0 while rs3m > 0 → 1.0 |
| Climax Vol | 2.0 | only when weekly RSI ≥ 60: last weekly volume ≥ 2× avg of prior 20 weeks → 2.0, ≥ 1.5× → 1.0 |

All null inputs score that component 0 with detail `'n/a'`. Round final scores to 1 decimal (`Math.round(s*10)/10`).

- [ ] **Step 1: Create branch**

```bash
git checkout main && git pull && git checkout -b feat/etf-section
```

- [ ] **Step 2: Write the failing tests**

Create `tests/etf.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scoreEtfEntry, scoreEtfExit, computeEtfSignals } from '../src/lib/etf.js';

const comp = (res, label) => res.components.find(c => c.label === label);

// Fully-loaded entry inputs; tests knock out one dimension at a time.
const ENTRY_MAX = {
  rsiW: 28, belowLowerBB: true,
  rs3m: -12, groupMedianRs3m: 0,
  macdCross: 'bullish_cross', divergence: { type: 'BULL', strength: 1, barsAgo: 2 },
  drawdownPct: 22,
};

describe('scoreEtfEntry', () => {
  it('maxes at 10 with all signals firing', () => {
    const r = scoreEtfEntry(ENTRY_MAX);
    expect(r.score).toBe(10);
    expect(r.readiness).toBe('ACT');
  });

  it('component maxes sum to 10', () => {
    const r = scoreEtfEntry(ENTRY_MAX);
    expect(r.components.reduce((s, c) => s + c.max, 0)).toBe(10);
  });

  it('oversold caps at 3 even with RSI<30 plus BB touch', () => {
    expect(comp(scoreEtfEntry(ENTRY_MAX), 'Oversold').score).toBe(3);
  });

  it('mid oversold: RSI 33 without BB touch scores 1.5', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, rsiW: 33, belowLowerBB: false });
    expect(comp(r, 'Oversold').score).toBe(1.5);
  });

  it('rotation: extreme underperformance (rs3m < -25) zeroes the component', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, rs3m: -30 });
    expect(comp(r, 'Rotation').score).toBe(0);
  });

  it('rotation: mild lag vs SPY and group scores partial', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, rs3m: -4, groupMedianRs3m: 1 });
    // vs SPY -4 → 0.5; median gap 5 → 1.0
    expect(comp(r, 'Rotation').score).toBe(1.5);
  });

  it('turn: divergence alone scores 1', () => {
    const r = scoreEtfEntry({ ...ENTRY_MAX, macdCross: null });
    expect(comp(r, 'Turn').score).toBe(1);
  });

  it('null inputs degrade to WAIT, not crash', () => {
    const r = scoreEtfEntry({ rsiW: null, belowLowerBB: null, rs3m: null,
      groupMedianRs3m: null, macdCross: null, divergence: null, drawdownPct: null });
    expect(r.score).toBe(0);
    expect(r.readiness).toBe('WAIT');
  });
});

const EXIT_MAX = { rsiW: 76, extensionPct: 26, rs1m: -3, rs3m: 8, volumeRatio: 2.2 };

describe('scoreEtfExit', () => {
  it('maxes at 10 with all signals firing', () => {
    const r = scoreEtfExit(EXIT_MAX);
    expect(r.score).toBe(10);
    expect(r.readiness).toBe('ACT');
  });

  it('component maxes sum to 10', () => {
    expect(scoreEtfExit(EXIT_MAX).components.reduce((s, c) => s + c.max, 0)).toBe(10);
  });

  it('overbought tiers: RSI 68 scores 1', () => {
    expect(comp(scoreEtfExit({ ...EXIT_MAX, rsiW: 68 }), 'Overbought').score).toBe(1);
  });

  it('rotation loss: mild fade (rs1m<0, rs3m>0 but rs1m>-2) scores 1', () => {
    expect(comp(scoreEtfExit({ ...EXIT_MAX, rs1m: -1 }), 'Rotation Loss').score).toBe(1);
  });

  it('climax volume ignored when weekly RSI < 60', () => {
    expect(comp(scoreEtfExit({ ...EXIT_MAX, rsiW: 55 }), 'Climax Vol').score).toBe(0);
  });

  it('calm market scores near zero → WAIT', () => {
    const r = scoreEtfExit({ rsiW: 50, extensionPct: 3, rs1m: 1, rs3m: 2, volumeRatio: 1 });
    expect(r.score).toBe(0);
    expect(r.readiness).toBe('WAIT');
  });
});

// ── Integration through computeEtfSignals ────────────────────────────────
// Synthetic weekly raw builder (Finnhub-style, oldest-first)
function makeWeekly(closes, volumes = null) {
  return {
    s: 'ok',
    t: closes.map((_, i) => 1600000000 + i * 604800),
    o: closes.map(c => c),
    h: closes.map(c => c * 1.01),
    l: closes.map(c => c * 0.99),
    c: [...closes],
    v: volumes ?? closes.map(() => 1000),
  };
}
// Daily closes: n bars ending at `end`, linear from `start`
function ramp(start, end, n) {
  return Array.from({ length: n }, (_, i) => start + (end - start) * (i / (n - 1)));
}

describe('computeEtfSignals', () => {
  it('returns null for a proxy with <20 weekly bars', () => {
    const out = computeEtfSignals(
      [{ proxy: 'SMH', weeklyRaw: makeWeekly(ramp(100, 90, 10)), dailyCloses: ramp(100, 90, 100) }],
      ramp(100, 100, 100),
    );
    expect(out.SMH).toBeNull();
  });

  it('downtrending ETF vs flat SPY gets a higher entry than exit score', () => {
    const daily = ramp(100, 70, 252);           // −30% over a year, oversold
    const weekly = makeWeekly(ramp(100, 70, 52));
    const spy = ramp(100, 100, 252);            // flat benchmark
    const out = computeEtfSignals([{ proxy: 'XLE', weeklyRaw: weekly, dailyCloses: daily }], spy);
    expect(out.XLE).not.toBeNull();
    expect(out.XLE.entry.score).toBeGreaterThan(out.XLE.exit.score);
    expect(out.XLE.rs.rs3m).toBeLessThan(0);
  });

  it('parabolic ETF vs flat SPY gets a higher exit than entry score', () => {
    const daily = [...ramp(100, 110, 192), ...ramp(110, 180, 60)]; // late vertical run
    const weekly = makeWeekly([...ramp(100, 110, 40), ...ramp(110, 180, 12)]);
    const spy = ramp(100, 100, 252);
    const out = computeEtfSignals([{ proxy: 'SMH', weeklyRaw: weekly, dailyCloses: daily }], spy);
    expect(out.SMH.exit.score).toBeGreaterThan(out.SMH.entry.score);
  });

  it('computes group median rs3m across proxies', () => {
    const spy = ramp(100, 100, 252);
    const mk = (endVal) => ({
      weeklyRaw: makeWeekly(ramp(100, endVal, 52)),
      dailyCloses: ramp(100, endVal, 252),
    });
    const out = computeEtfSignals([
      { proxy: 'A', ...mk(120) }, { proxy: 'B', ...mk(100) }, { proxy: 'C', ...mk(80) },
    ], spy);
    expect(out.B.groupMedianRs3m).toBeCloseTo(out.B.rs.rs3m, 0);
  });

  it('handles missing spyCloses (rs null, rotation components 0)', () => {
    const out = computeEtfSignals(
      [{ proxy: 'QQQ', weeklyRaw: makeWeekly(ramp(100, 90, 52)), dailyCloses: ramp(100, 90, 252) }],
      null,
    );
    expect(out.QQQ.rs.rs3m).toBeNull();
    expect(comp(out.QQQ.entry, 'Rotation').score).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/etf.test.js`
Expected: FAIL — `Cannot find module '../src/lib/etf.js'` (or equivalent resolve error).

- [ ] **Step 4: Implement `src/lib/etf.js`**

```js
// ETF entry/exit signal engine — display-only, weekly cadence (months-to-a-year horizon).
// Signals run on the US-listed proxy of each UCITS ETF (see etflist store).
import { computeRSI, emaArray, computeMACD, computeRelativeStrength } from './indicators.js';
import { detectDivergence } from './signals.js';

const round1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readinessFor(score) {
  if (score >= 7) return 'ACT';
  if (score >= 5) return 'SOON';
  if (score >= 3) return 'WATCH';
  return 'WAIT';
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreEtfEntry({ rsiW, belowLowerBB, rs3m, groupMedianRs3m, macdCross, divergence, drawdownPct }) {
  const components = [];

  const rsi = num(rsiW);
  let oversold = rsi === null ? 0 : rsi < 30 ? 2.0 : rsi < 35 ? 1.5 : rsi < 40 ? 0.75 : 0;
  if (belowLowerBB === true) oversold += 1.0;
  oversold = Math.min(oversold, 3.0);
  components.push({ label: 'Oversold', score: oversold, max: 3.0,
    detail: rsi === null ? 'n/a' : `wRSI ${Math.round(rsi)}${belowLowerBB ? ', ≤ lower BB' : ''}` });

  const r3 = num(rs3m);
  let rotation = 0;
  let rotDetail = 'n/a';
  if (r3 !== null) {
    if (r3 < -25) {
      rotDetail = `RS3m ${r3}% — falling knife`;
    } else {
      rotation += r3 <= -10 ? 1.5 : r3 <= -5 ? 1.0 : r3 <= -3 ? 0.5 : 0;
      const med = num(groupMedianRs3m);
      if (med !== null) {
        const gap = med - r3;
        rotation += gap >= 8 ? 1.5 : gap >= 4 ? 1.0 : gap >= 2 ? 0.5 : 0;
      }
      rotDetail = `RS3m ${r3 > 0 ? '+' : ''}${r3}% vs SPY`;
    }
  }
  components.push({ label: 'Rotation', score: rotation, max: 3.0, detail: rotDetail });

  let turn = 0;
  const turnParts = [];
  if (macdCross === 'bullish_cross') { turn += 1.0; turnParts.push('MACD bull cross'); }
  if (divergence?.type === 'BULL') { turn += 1.0; turnParts.push('bull divergence'); }
  components.push({ label: 'Turn', score: turn, max: 2.0,
    detail: turnParts.length ? turnParts.join(', ') : 'no turn yet' });

  const dd = num(drawdownPct);
  const drawdown = dd === null ? 0 : dd >= 20 ? 2.0 : dd >= 12 ? 1.5 : dd >= 8 ? 1.0 : dd >= 5 ? 0.5 : 0;
  components.push({ label: 'Drawdown', score: drawdown, max: 2.0,
    detail: dd === null ? 'n/a' : `−${Math.round(dd)}% off 52w high` });

  const score = round1(components.reduce((s, c) => s + c.score, 0));
  return { score, components, readiness: readinessFor(score) };
}

export function scoreEtfExit({ rsiW, extensionPct, rs1m, rs3m, volumeRatio }) {
  const components = [];

  const rsi = num(rsiW);
  const overbought = rsi === null ? 0 : rsi >= 75 ? 3.0 : rsi >= 70 ? 2.0 : rsi >= 65 ? 1.0 : 0;
  components.push({ label: 'Overbought', score: overbought, max: 3.0,
    detail: rsi === null ? 'n/a' : `wRSI ${Math.round(rsi)}` });

  const ext = num(extensionPct);
  const extension = ext === null ? 0 : ext >= 25 ? 3.0 : ext >= 18 ? 2.0 : ext >= 12 ? 1.0 : 0;
  components.push({ label: 'Extension', score: extension, max: 3.0,
    detail: ext === null ? 'n/a' : `${ext > 0 ? '+' : ''}${Math.round(ext)}% vs wEMA30` });

  const r1 = num(rs1m), r3 = num(rs3m);
  let rotLoss = 0;
  if (r1 !== null && r3 !== null) {
    if (r1 <= -2 && r3 >= 5) rotLoss = 2.0;
    else if (r1 < 0 && r3 > 0) rotLoss = 1.0;
  }
  components.push({ label: 'Rotation Loss', score: rotLoss, max: 2.0,
    detail: r1 === null ? 'n/a' : `RS1m ${r1 > 0 ? '+' : ''}${r1}%, RS3m ${r3 > 0 ? '+' : ''}${r3}%` });

  const vr = num(volumeRatio);
  const climax = (rsi !== null && rsi >= 60 && vr !== null)
    ? (vr >= 2 ? 2.0 : vr >= 1.5 ? 1.0 : 0) : 0;
  components.push({ label: 'Climax Vol', score: climax, max: 2.0,
    detail: vr === null ? 'n/a' : `${vr.toFixed(1)}× avg wVol` });

  const score = round1(components.reduce((s, c) => s + c.score, 0));
  return { score, components, readiness: readinessFor(score) };
}

// list: [{ proxy, weeklyRaw: {s,t,o,h,l,c,v}, dailyCloses: number[] }]
// spyCloses: daily SPY closes (ascending) or null
export function computeEtfSignals(list, spyCloses) {
  const out = {};

  // Pass 1: relative strength per proxy (needed for the group median)
  const rsMap = {};
  for (const { proxy, dailyCloses } of list) {
    rsMap[proxy] = (spyCloses?.length && dailyCloses?.length)
      ? computeRelativeStrength(dailyCloses, spyCloses)
      : { rs1m: null, rs3m: null };
  }
  const groupMedianRs3m = median(
    Object.values(rsMap).map(r => r.rs3m).filter(v => v !== null)
  );

  // Pass 2: score each proxy
  for (const { proxy, weeklyRaw, dailyCloses } of list) {
    if (!weeklyRaw?.c || weeklyRaw.s !== 'ok' || weeklyRaw.c.length < 20 || !dailyCloses?.length) {
      out[proxy] = null;
      continue;
    }
    const wc = weeklyRaw.c;
    const wh = weeklyRaw.h ?? wc;
    const wl = weeklyRaw.l ?? wc;
    const wv = weeklyRaw.v ?? [];
    const price = dailyCloses[dailyCloses.length - 1];

    const rsiW = computeRSI(wc);
    const macd = computeMACD(wc);
    const divergence = detectDivergence(wc, wh, wl);

    // Weekly BB(20,2) lower band — population σ, same convention as indicators.js
    const last20 = wc.slice(-20);
    const mean = last20.reduce((s, v) => s + v, 0) / 20;
    const sd = Math.sqrt(last20.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
    const belowLowerBB = wc[wc.length - 1] <= mean - 2 * sd;

    // Drawdown from ~52w daily high
    const hi52 = Math.max(...dailyCloses.slice(-252));
    const drawdownPct = hi52 > 0 ? ((hi52 - price) / hi52) * 100 : null;

    // Extension above weekly EMA30
    const ema30arr = emaArray(wc, 30);
    const ema30 = ema30arr.length ? ema30arr[ema30arr.length - 1] : null;
    const extensionPct = ema30 ? ((wc[wc.length - 1] - ema30) / ema30) * 100 : null;

    // Weekly volume ratio: last bar vs avg of prior 20
    let volumeRatio = null;
    if (wv.length >= 21) {
      const prior = wv.slice(-21, -1);
      const avg = prior.reduce((s, v) => s + v, 0) / prior.length;
      if (avg > 0) volumeRatio = wv[wv.length - 1] / avg;
    }

    const rs = rsMap[proxy];
    out[proxy] = {
      price,
      rs,
      groupMedianRs3m,
      entry: scoreEtfEntry({
        rsiW, belowLowerBB, rs3m: rs.rs3m, groupMedianRs3m,
        macdCross: macd?.crossover ?? null, divergence, drawdownPct,
      }),
      exit: scoreEtfExit({
        rsiW, extensionPct, rs1m: rs.rs1m, rs3m: rs.rs3m, volumeRatio,
      }),
    };
  }
  return out;
}
```

Note for the implementer: `computeMACD` and `computeRSI` come from `src/lib/indicators.js` — check their exact return shapes before wiring (`computeRSI` returns a number or null; `computeMACD` returns an object whose `crossover` field is `'bullish_cross' | 'bearish_cross' | null`). If a fixture in Step 2 doesn't hit the intended tier (e.g. the ramp isn't oversold enough for RSI < 30), adjust the fixture, not the tier.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/etf.test.js`
Expected: PASS (all ~18 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: 214 existing + new etf tests, all passing.

- [ ] **Step 7: Commit**

```bash
git add src/lib/etf.js tests/etf.test.js
git commit -m "feat: ETF entry/exit signal engine (weekly cadence, rotation-aware)"
```

---

### Task 2: ETF catalog store `etflist.svelte.js`

**Files:**
- Create: `src/lib/stores/etflist.svelte.js`

**Interfaces:**
- Consumes: nothing from other tasks (pure store).
- Produces (used by Tasks 3–4):
  - `getEtfs()` → `[{ ucits, isin, name, ter, category, proxy }]`
  - `addEtf(etf)` → boolean (false if `ucits` already present); `removeEtf(ucits)`
  - `getUniqueProxies()` → `string[]` (deduped, e.g. `['SPY','QQQ','THNQ','BOTZ','SMH','XLE','ICLN']`)
  - `setEtfProxyData(proxy, data)` / `getEtfProxyData(proxy)` — `data = { weeklyRaw, dailyCloses }`
  - `setEtfSpyCloses(closes)` / `getEtfSpyCloses()`

No unit tests: Svelte-runes stores aren't unit-testable in this repo's setup (matches `watchlist.svelte.js` convention). Verified via build + the component task.

- [ ] **Step 1: Implement the store**

```js
// UCITS ETF catalog + proxy candle data. Signals run on the US proxy (see etf.js);
// the UCITS ticker/ISIN/TER are display metadata for what the user actually buys.
const HARDCODED_ETFS = [
  { ucits: 'VUAA', isin: 'IE00BFMXXD54', name: 'Vanguard S&P 500 (Acc)',        ter: '0.07%', category: 'Core US',       proxy: 'SPY'  },
  { ucits: 'CSPX', isin: 'IE00B5BMR087', name: 'iShares Core S&P 500 (Acc)',    ter: '0.07%', category: 'Core US',       proxy: 'SPY'  },
  { ucits: 'CNDX', isin: 'IE00B53SZB19', name: 'iShares Nasdaq 100',            ter: '0.33%', category: 'Tech',          proxy: 'QQQ'  },
  { ucits: 'EQQQ', isin: 'IE00BFZXGZ54', name: 'Invesco EQQQ Nasdaq-100',       ter: '0.30%', category: 'Tech',          proxy: 'QQQ'  },
  { ucits: 'AIAI', isin: 'IE00BK5BCD43', name: 'L&G Artificial Intelligence',   ter: '0.49%', category: 'AI thematic',   proxy: 'THNQ' },
  { ucits: 'AIRO', isin: 'IE00BYZK4552', name: 'Global X Robotics & AI',        ter: '0.50%', category: 'AI/Robotics',   proxy: 'BOTZ' },
  { ucits: 'SMGB', isin: 'IE00BMC38736', name: 'VanEck Semiconductor',          ter: '0.35%', category: 'Semis',         proxy: 'SMH'  },
  { ucits: 'IUES', isin: 'IE00B42Z5J44', name: 'iShares S&P 500 Energy',        ter: '0.15%', category: 'Energy',        proxy: 'XLE'  },
  { ucits: 'INRG', isin: 'IE00B1XNHC34', name: 'iShares Global Clean Energy',   ter: '0.65%', category: 'Clean Energy',  proxy: 'ICLN' },
];

let etfs = $state([]);
try {
  const saved = localStorage.getItem('etfList');
  etfs = saved ? JSON.parse(saved) : [...HARDCODED_ETFS];
} catch { etfs = [...HARDCODED_ETFS]; }

function persist() {
  try { localStorage.setItem('etfList', JSON.stringify(etfs)); } catch { /* noop */ }
}

// Proxy candle data, keyed by proxy symbol — NOT persisted here (TwelveData's
// own localStorage cache is the persistence layer; App.svelte re-hydrates from it).
let proxyData = $state({});
let spyCloses = $state(null);

export function getEtfs() { return etfs; }

export function addEtf({ ucits, isin = '', name = '', ter = '', category = '', proxy }) {
  const u = ucits?.trim().toUpperCase();
  const p = proxy?.trim().toUpperCase();
  if (!u || !p || etfs.some(e => e.ucits === u)) return false;
  etfs.push({ ucits: u, isin, name, ter, category, proxy: p });
  persist();
  return true;
}

export function removeEtf(ucits) {
  const idx = etfs.findIndex(e => e.ucits === ucits);
  if (idx !== -1) etfs.splice(idx, 1);
  persist();
}

export function resetEtfs() {
  etfs = [...HARDCODED_ETFS];
  persist();
}

export function getUniqueProxies() {
  return [...new Set(etfs.map(e => e.proxy))];
}

export function setEtfProxyData(proxy, data) {
  proxyData = { ...proxyData, [proxy]: data };
}
export function getEtfProxyData(proxy) { return proxyData[proxy] ?? null; }

export function setEtfSpyCloses(closes) { spyCloses = closes; }
export function getEtfSpyCloses() { return spyCloses; }
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: build succeeds, no warnings referencing etflist.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/etflist.svelte.js
git commit -m "feat: UCITS ETF catalog store with proxy mapping"
```

---

### Task 3: `EtfDashboard.svelte` view

**Files:**
- Create: `src/lib/components/EtfDashboard.svelte`

**Interfaces:**
- Consumes: `computeEtfSignals` (Task 1); store functions from Task 2; `PriceChart.svelte` (existing — takes only `symbol`, fetches its own candles with caching, so `<PriceChart symbol={etf.proxy} />` just works).
- Produces: default-export Svelte component with no props, rendered by App.svelte (Task 4).

Follow the visual conventions of `DipRadar.svelte` / `WatchlistTable.svelte`: `bg-surface-800/60`, `border-border/60`, `text-text-primary/secondary/muted`, mono font for tickers, green `#22c55e` / amber `#f59e0b` / gray `#6b7280` score colors.

- [ ] **Step 1: Implement the component**

```svelte
<script>
  import { getEtfs, addEtf, removeEtf, getEtfProxyData, getEtfSpyCloses, getUniqueProxies } from '../stores/etflist.svelte.js';
  import { computeEtfSignals } from '../etf.js';
  import PriceChart from './PriceChart.svelte';

  let sortBy = $state('rs3m');          // 'rs3m' | 'entry' | 'exit'
  let expanded = $state(null);           // ucits ticker of the expanded row
  let showAdd = $state(false);
  let newEtf = $state({ ucits: '', proxy: '', name: '', isin: '', ter: '', category: '' });
  let addError = $state('');

  const signals = $derived.by(() => {
    const list = getUniqueProxies()
      .map(proxy => ({ proxy, ...(getEtfProxyData(proxy) ?? {}) }))
      .filter(p => p.weeklyRaw && p.dailyCloses);
    return computeEtfSignals(list, getEtfSpyCloses());
  });

  const rows = $derived.by(() => {
    const list = getEtfs().map(e => ({ ...e, sig: signals[e.proxy] ?? null }));
    const key = sortBy;
    return [...list].sort((a, b) => {
      const va = key === 'rs3m' ? (a.sig?.rs?.rs3m ?? -Infinity)
        : key === 'entry' ? (a.sig?.entry?.score ?? -1) : (a.sig?.exit?.score ?? -1);
      const vb = key === 'rs3m' ? (b.sig?.rs?.rs3m ?? -Infinity)
        : key === 'entry' ? (b.sig?.entry?.score ?? -1) : (b.sig?.exit?.score ?? -1);
      return vb - va;
    });
  });

  const scoreColor = (s) => s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#6b7280';
  const rsColor = (v) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#6b7280';
  function readinessClass(r) {
    if (r === 'ACT')  return 'bg-bull-strong/20 text-bull-strong';
    if (r === 'SOON') return 'bg-uncertain/20 text-uncertain';
    if (r === 'WATCH') return 'bg-surface-600 text-text-secondary';
    return 'text-text-muted';
  }
  const fmtRs = (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`;

  function handleAdd() {
    addError = '';
    if (!newEtf.ucits.trim() || !newEtf.proxy.trim()) { addError = 'UCITS ticker and US proxy are required'; return; }
    if (!addEtf(newEtf)) { addError = 'Already in the list'; return; }
    newEtf = { ucits: '', proxy: '', name: '', isin: '', ter: '', category: '' };
    showAdd = false;
  }
</script>

<div class="border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">UCITS ETFs</span>
      <span class="text-[10px] text-text-muted hidden sm:inline">signals run on US proxy · you buy the UCITS ticker</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-[10px] text-text-muted">sort:</span>
      {#each [['rs3m', 'RS 3M'], ['entry', 'Entry'], ['exit', 'Exit']] as [key, label]}
        <button
          class="text-[10px] px-1.5 py-0.5 rounded {sortBy === key ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
          onclick={() => sortBy = key}
        >{label}</button>
      {/each}
      <button class="text-[10px] px-1.5 py-0.5 rounded bg-surface-600 text-text-secondary hover:text-text-primary"
        onclick={() => showAdd = !showAdd}>+ Add</button>
    </div>
  </div>

  {#if showAdd}
    <div class="px-4 py-2 border-b border-border/40 flex flex-wrap items-center gap-2">
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-20" placeholder="UCITS *" bind:value={newEtf.ucits} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-20" placeholder="US proxy *" bind:value={newEtf.proxy} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-40" placeholder="Name" bind:value={newEtf.name} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-28" placeholder="ISIN" bind:value={newEtf.isin} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-16" placeholder="TER" bind:value={newEtf.ter} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-24" placeholder="Category" bind:value={newEtf.category} />
      <button class="text-xs px-2 py-1 rounded bg-bull-strong/20 text-bull-strong" onclick={handleAdd}>Add</button>
      {#if addError}<span class="text-xs text-danger">{addError}</span>{/if}
    </div>
  {/if}

  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-[10px] uppercase tracking-wider text-text-muted border-b border-border/40">
          <th class="text-left px-4 py-2">ETF</th>
          <th class="text-left px-2 py-2 hidden md:table-cell">Category</th>
          <th class="text-right px-2 py-2">Proxy · Price</th>
          <th class="text-right px-2 py-2">RS 1M</th>
          <th class="text-right px-2 py-2">RS 3M</th>
          <th class="text-right px-2 py-2">Entry</th>
          <th class="text-right px-2 py-2">Exit</th>
          <th class="text-center px-2 py-2">Signal</th>
          <th class="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as etf (etf.ucits)}
          <tr
            class="border-b border-border/20 hover:bg-surface-700/30 cursor-pointer transition-colors"
            onclick={() => expanded = expanded === etf.ucits ? null : etf.ucits}
          >
            <td class="px-4 py-2">
              <span class="font-mono font-semibold text-text-primary">{etf.ucits}</span>
              <span class="text-[10px] text-text-muted block">{etf.name}{etf.ter ? ` · TER ${etf.ter}` : ''}</span>
            </td>
            <td class="px-2 py-2 text-xs text-text-secondary hidden md:table-cell">{etf.category}</td>
            <td class="px-2 py-2 text-right">
              <span class="font-mono text-xs text-text-muted">{etf.proxy}</span>
              <span class="font-mono text-text-primary ml-1">{etf.sig ? `$${etf.sig.price.toFixed(2)}` : '—'}</span>
            </td>
            <td class="px-2 py-2 text-right font-mono text-xs" style="color:{rsColor(etf.sig?.rs?.rs1m ?? 0)}">{fmtRs(etf.sig?.rs?.rs1m)}</td>
            <td class="px-2 py-2 text-right font-mono text-xs" style="color:{rsColor(etf.sig?.rs?.rs3m ?? 0)}">{fmtRs(etf.sig?.rs?.rs3m)}</td>
            <td class="px-2 py-2 text-right font-mono" style="color:{scoreColor(etf.sig?.entry?.score ?? 0)}">{etf.sig ? etf.sig.entry.score.toFixed(1) : '—'}</td>
            <td class="px-2 py-2 text-right font-mono" style="color:{scoreColor(etf.sig?.exit?.score ?? 0)}">{etf.sig ? etf.sig.exit.score.toFixed(1) : '—'}</td>
            <td class="px-2 py-2 text-center">
              {#if etf.sig}
                {@const buySig = etf.sig.entry.score >= etf.sig.exit.score ? etf.sig.entry : null}
                {@const sig = buySig ?? etf.sig.exit}
                <span class="text-[10px] px-1.5 py-0.5 rounded {readinessClass(sig.readiness)}">
                  {buySig ? 'BUY' : 'SELL'} {sig.readiness}
                </span>
              {:else}
                <span class="text-[10px] text-text-muted">no data</span>
              {/if}
            </td>
            <td class="px-2 py-2 text-right">
              <button class="text-xs text-text-muted hover:text-danger" title="Remove"
                onclick={(e) => { e.stopPropagation(); removeEtf(etf.ucits); }}>✕</button>
            </td>
          </tr>
          {#if expanded === etf.ucits}
            <tr class="border-b border-border/20 bg-surface-900/40">
              <td colspan="9" class="px-4 py-4">
                {#if etf.sig}
                  <div class="grid md:grid-cols-2 gap-4 mb-4 text-xs">
                    <div>
                      <div class="text-text-muted uppercase tracking-wider mb-1.5">Entry {etf.sig.entry.score.toFixed(1)}/10 · {etf.sig.entry.readiness}</div>
                      {#each etf.sig.entry.components as c}
                        <div class="flex justify-between py-0.5">
                          <span class="text-text-secondary">{c.label}</span>
                          <span class="font-mono" style="color:{c.score > 0 ? '#22c55e' : '#6b7280'}">{c.score}/{c.max} <span class="text-text-muted">· {c.detail}</span></span>
                        </div>
                      {/each}
                    </div>
                    <div>
                      <div class="text-text-muted uppercase tracking-wider mb-1.5">Exit {etf.sig.exit.score.toFixed(1)}/10 · {etf.sig.exit.readiness}</div>
                      {#each etf.sig.exit.components as c}
                        <div class="flex justify-between py-0.5">
                          <span class="text-text-secondary">{c.label}</span>
                          <span class="font-mono" style="color:{c.score > 0 ? '#ef4444' : '#6b7280'}">{c.score}/{c.max} <span class="text-text-muted">· {c.detail}</span></span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
                <PriceChart symbol={etf.proxy} />
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>
```

Note: `PriceChart` reads `getTickerData(symbol)` from the watchlist store internally for optional overlays — for a proxy not in the stock watchlist that returns null; verify it degrades gracefully (it should: chart fetches its own candles). If it throws on null ticker data, guard the chart render with `{#if expanded}` try/catch equivalent or fix the null-guard in PriceChart (minimal change).

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/EtfDashboard.svelte
git commit -m "feat: ETF dashboard view with rotation ranking and entry/exit breakdown"
```

---

### Task 4: App.svelte integration — toggle, fetch, hydrate

**Files:**
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `EtfDashboard.svelte` (Task 3); `getUniqueProxies`, `setEtfProxyData`, `setEtfSpyCloses` (Task 2); existing `fetchTimeSeries`, `fetchCandles`, `resampleWeekly`, `hasTDApiKey`, `delay`.
- Produces: `activeView` toggle; proxy candles flow into the etflist store on refresh and on startup hydrate.

- [ ] **Step 1: Add imports and view state**

In the `<script>` block of `src/App.svelte`, add to the existing imports:

```js
import EtfDashboard from './lib/components/EtfDashboard.svelte';
import { getUniqueProxies, setEtfProxyData, setEtfSpyCloses } from './lib/stores/etflist.svelte.js';
```

Near the other `$state` declarations (e.g. next to `let settingsOpen = $state(false);`):

```js
let activeView = $state('stocks'); // 'stocks' | 'etfs'
```

- [ ] **Step 2: Add the header toggle**

In the header markup (next to the app title / before the refresh controls — match existing header layout), add:

```svelte
<div class="flex items-center gap-0.5 bg-surface-700/60 rounded-lg p-0.5">
  <button
    class="text-xs px-3 py-1 rounded-md transition-colors {activeView === 'stocks' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
    onclick={() => activeView = 'stocks'}
  >Stocks</button>
  <button
    class="text-xs px-3 py-1 rounded-md transition-colors {activeView === 'etfs' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
    onclick={() => activeView = 'etfs'}
  >ETFs</button>
</div>
```

- [ ] **Step 3: Branch the main content on activeView**

Wrap the existing stock content inside `<main>`:

```svelte
<main class="max-w-[1800px] mx-auto px-4 py-6">
  {#if activeView === 'stocks'}
    <SetupRadar />
    <DipRadar marketData={marketContextData} />
    <WatchlistTable onTickerAdded={handleRefresh} />
  {:else}
    <EtfDashboard />
  {/if}
  <!-- shortcuts footer stays outside the branch -->
```

`MarketContextBar` stays above `<main>`, visible in both views.

- [ ] **Step 4: Fetch proxy candles in handleRefresh**

In `handleRefresh()`, right after the SPY closes fetch block (`let spyCloses = ...`), publish SPY closes to the ETF store:

```js
if (spyCloses) setEtfSpyCloses(spyCloses);
```

Then after the per-ticker enrichment loop (after the `setMarketData` commit loop ends, before the TD quote enrichment block), add:

```js
// ETF proxies — daily candles per unique proxy → weekly resample → etf store.
// TD path: SPY/QQQ often already cached from RS/watchlist fetches (cache hit = free).
for (const proxy of getUniqueProxies()) {
  try {
    let synthetic = null;
    if (hasTDApiKey()) {
      const r = await fetchTimeSeries(proxy, '1day', 250);
      if (r?.data?.length) {
        const vals = r.data;
        synthetic = {
          s: 'ok',
          t: vals.map(v => Math.floor(new Date(v.datetime + 'T00:00:00Z').getTime() / 1000)),
          o: vals.map(v => parseFloat(v.open)),
          h: vals.map(v => parseFloat(v.high)),
          l: vals.map(v => parseFloat(v.low)),
          c: vals.map(v => parseFloat(v.close)),
          v: vals.map(v => parseInt(v.volume, 10)),
        };
      }
    } else {
      const r = await fetchCandles(proxy, 'D', fromTs, toTs);
      if (r?.data?.c?.length) synthetic = r.data;
    }
    if (synthetic) {
      setEtfProxyData(proxy, {
        weeklyRaw: resampleWeekly(synthetic),
        dailyCloses: synthetic.c,
      });
    }
  } catch { /* non-blocking — ETF row shows 'no data' */ }
  await delay(100);
}
```

(The `vals → synthetic` conversion appears three times in App.svelte already; if a `tdToSynthetic(vals)` helper is trivial to extract, do it and use it in all four places — otherwise inline is acceptable.)

- [ ] **Step 5: Hydrate ETF proxies on startup**

In `hydrateStartup()` (after the stock hydrate loop, before the demo-mode early-return path is NOT affected — skip ETF hydrate entirely in demo mode), add:

```js
// ETF proxy candles from the TwelveData localStorage cache
for (const proxy of getUniqueProxies()) {
  try {
    const tdRaw = localStorage.getItem(`td_ts_1day_${proxy}_1day_250`);
    if (!tdRaw) continue;
    const vals = JSON.parse(tdRaw)?.data;
    if (!vals?.length) continue;
    const synthetic = {
      s: 'ok',
      t: vals.map(v => Math.floor(new Date(v.datetime + 'T00:00:00Z').getTime() / 1000)),
      o: vals.map(v => parseFloat(v.open)),
      h: vals.map(v => parseFloat(v.high)),
      l: vals.map(v => parseFloat(v.low)),
      c: vals.map(v => parseFloat(v.close)),
      v: vals.map(v => parseInt(v.volume, 10)),
    };
    setEtfProxyData(proxy, { weeklyRaw: resampleWeekly(synthetic), dailyCloses: synthetic.c });
    if (proxy === 'SPY') setEtfSpyCloses(synthetic.c);
  } catch { /* noop */ }
}
```

Check the exact shape of the cached TD value first (the stock hydrate path a few lines above reads the same key — mirror whatever parse it uses, e.g. whether the payload is `{data: vals}` or `vals` directly).

- [ ] **Step 6: Verify build + tests**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds.

- [ ] **Step 7: Manual smoke test**

Run: `npm run dev`, open http://localhost:5173:
- Toggle `Stocks | ETFs` switches views; stock view unchanged.
- ETF table renders 9 rows; after a refresh (R), proxies get prices + scores; VUAA and CSPX show identical signals (same proxy).
- Sort buttons reorder; expanding a row shows component breakdowns + the proxy chart; add/remove works and survives reload.

- [ ] **Step 8: Commit**

```bash
git add src/App.svelte
git commit -m "feat: Stocks|ETFs view toggle + proxy candle fetch/hydrate"
```

---

### Task 5: Docs + wrap-up

**Files:**
- Modify: `CLAUDE.md` (project) — key-files tree + a short "ETF section (etf.js)" block mirroring the Dip Hunter block; update test count.
- Modify: `BACKLOG.md` — mark/record the ETF section item if present.

- [ ] **Step 1: Update CLAUDE.md**

Add to the key-files tree: `etf.js`, `stores/etflist.svelte.js`, `components/EtfDashboard.svelte`, `tests/etf.test.js`. Add a section documenting: proxy-data decision (UCITS signals run on US proxies, zero new APIs), entry/exit component tables (copy from this plan), readiness thresholds (ACT ≥ 7 / SOON ≥ 5 / WATCH ≥ 3 / WAIT), display-only status, `etfList` localStorage key. Update the total test count to the new number from `npm test`.

- [ ] **Step 2: Final verification**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md BACKLOG.md
git commit -m "docs: ETF section — engine rules, proxy decision, key files"
```

- [ ] **Step 4: Push and open PR** (per repo workflow: one feature = one branch = one PR; PR body style: no Claude Code footer, no speculative manual-verify checkbox)

```bash
git push -u origin feat/etf-section
gh pr create --title "feat: UCITS ETF section — entry/exit signals via US proxies" --body "..."
```

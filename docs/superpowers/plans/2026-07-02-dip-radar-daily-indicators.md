# Dip Hunter + Setup Radar Daily-Indicator Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire three already-computed-but-unused daily indicators (OBV divergence, ADX trend strength, swing-low support) into Dip Hunter (`dip.js`/`DipRadar.svelte`) and Setup Radar (`radar.js`/`SetupRadar.svelte`) to sharpen entry/risk clarity, with zero new API calls.

**Architecture:** All three inputs already exist on `data.indicators` (computed once per ticker in `computeIndicatorsFromCandles`, `src/lib/indicators.js`). This plan only adds consumption logic in the two aggregator files (`dip.js`, `radar.js`) and display wiring in the two Svelte cards. OBV is a **scored** Dip Hunter component (quality-gated dips get credit for volume-based accumulation during the decline). ADX and swing-low are **display-only risk context** — ADX caps Dip Hunter readiness at WATCH when a strong downtrend is still accelerating (never scored, never gates); swing-low support is shown as a chip on both cards, never scored, never gates.

**Tech Stack:** Svelte 5, Vitest. No new dependencies.

## Global Constraints

- Zero new API calls — every input used here (`data.indicators.obv`, `.adx`, `.swingLows`) is already computed and stored on the ticker object.
- Display-only unless this plan says otherwise. OBV is the only scored addition; it must be folded into Dip Hunter's existing 10-point scale (rebalance, don't just add).
- After this batch, stop adding scored Dip Hunter components (explicit user direction from the prior session) — ADX and swing-low must ship as non-scored risk/context info, not new score components.
- Tests gate the merge. Run `npm test` (must stay 100% passing) and `npm run build` (must stay clean) before considering any task done.
- One feature = one branch = one PR (repo convention, see `BACKLOG.md`).

---

### Task 1: OBV divergence component in Dip Hunter, rebalanced to 10pt scale

**Files:**
- Modify: `src/lib/dip.js`
- Test: `tests/dip.test.js`

**Interfaces:**
- Consumes: `data.indicators.obv` — shape `{ obv: number, trend: 'rising'|'falling'|'flat'|null } | null` (from `computeOBV`, `src/lib/indicators.js:248`). Also reads `data.indicators.roc60` (already used elsewhere in `dip.js`).
- Produces: `obvComponent(ind)` — new function, same shape as every other component function in `dip.js`: `{ label: string, score: number, max: number, detail: string }`. Wired into the `components` array in `computeDipRadar`.

Current weights (must change): Fear 1.5, Oversold 2.0, Drawdown 1.0, 52w Low 1.0, Turn 1.0, Rel. Strength 1.0, Value 1.0, Smart Money 1.5 = 10.0 across 8 components.

New weights (9 components, still 10.0 total): Fear 1.5, **Oversold 1.5** (was 2.0), Drawdown 1.0, 52w Low 1.0, Turn 1.0, Rel. Strength 1.0, Value 1.0, **Smart Money 1.0** (was 1.5), **OBV 1.0** (new).

- [ ] **Step 1: Write the failing tests**

Open `tests/dip.test.js`. The `makeTicker` fixture already builds a full-qualifying ticker; add an `obv` override point and rebalance the existing Oversold/Smart Money expectations, then add OBV-specific tests. Replace the fixture's `indicators` line and add the `obv` field:

```js
      indicators: {
        rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true,
        macdCrossover: 'bullish_cross', obv: { obv: 500000, trend: 'rising' },
      },
```

Update the "includes a qualifying deep dip at ACT" test — it still expects `score` to be `10` (the max-everything fixture), which still holds once the rebalance lands (verify with the by-hand sum below; if OBV's fixture value doesn't hit the max tier, adjust the fixture's `obv.trend`/`roc60` until it does — `trend: 'rising'` + `roc60: -18` should hit the top tier per Step 3's design).

Replace the existing RSI-tier test (values are for the old 2.0-max Oversold) with the rebalanced version:

```js
  it('scores RSI tiers: <30 → 0.75, <35 → 0.5, <40 → 0.25', () => {
    for (const [rsi, expected] of [[29, 0.75], [34, 0.5], [39, 0.25], [45, 0]]) {
      const t = makeTicker({
        indicators: { rsi, rsiZScore: 0, roc20: 0, roc60: 0, oversoldConfluence: false, obv: null },
        smartMoney: null,
      });
      const hits = computeDipRadar([t], FEAR);
      if (hits.length) expect(comp(hits, 'Oversold').score).toBe(expected);
    }
  });
```

Replace the existing "smart money" test (values are for the old 1.5-max Smart Money) with:

```js
  it('smart money: insider buying + analyst buys = 1.0; deteriorating recs drop 0.5', () => {
    const hits = computeDipRadar([makeTicker()], FEAR);
    expect(comp(hits, 'Smart Money').score).toBe(1.0);
    const det = makeTicker({
      smartMoney: { data: { rec: { buyRatio: 0.7, deteriorating: true }, mspr3m: 12 } },
    });
    expect(comp(computeDipRadar([det], FEAR), 'Smart Money').score).toBe(0.5);
  });
```

Add the new OBV test (insert it near the other component tests, e.g. after the Turn test):

```js
  it('OBV: rising + declining price = 1.0 (accumulation), rising alone = 0.3, else 0', () => {
    const accumulating = makeTicker(); // roc60 -18, obv rising by default
    expect(comp(computeDipRadar([accumulating], FEAR), 'OBV').score).toBe(1.0);

    const risingNoDecline = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -3, oversoldConfluence: true,
        macdCrossover: 'bullish_cross', obv: { obv: 500000, trend: 'rising' } },
    });
    expect(comp(computeDipRadar([risingNoDecline], FEAR), 'OBV').score).toBe(0.3);

    const falling = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true,
        macdCrossover: 'bullish_cross', obv: { obv: 500000, trend: 'falling' } },
    });
    expect(comp(computeDipRadar([falling], FEAR), 'OBV').score).toBe(0);

    const missing = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true,
        macdCrossover: 'bullish_cross', obv: null },
    });
    expect(comp(computeDipRadar([missing], FEAR), 'OBV').score).toBe(0);
    expect(comp(computeDipRadar([missing], FEAR), 'OBV').detail).toBe('n/a');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- dip.test.js`
Expected: FAIL — `comp(hits, 'OBV')` is `undefined` (no such component yet), and the RSI-tier / Smart Money tests fail on the old (un-rebalanced) numbers.

- [ ] **Step 3: Implement the rebalance + OBV component**

In `src/lib/dip.js`, replace `oversoldComponent`:

```js
function oversoldComponent(ind) {
  const rsi = num(ind?.rsi);
  let s = rsi === null ? 0 : rsi < 30 ? 0.75 : rsi < 35 ? 0.5 : rsi < 40 ? 0.25 : 0;
  if (ind?.oversoldConfluence === true) s += 0.375;
  const z = num(ind?.rsiZScore);
  if (z !== null && z <= -1.5) s += 0.375;
  s = Math.min(1.5, s);
  return { label: 'Oversold', score: s, max: 1.5, detail: rsi === null ? 'n/a' : `RSI ${rsi}${z !== null ? `, z ${z}` : ''}` };
}
```

Replace `smartMoneyComponent`:

```js
function smartMoneyComponent(sm) {
  const d = sm?.data ?? null;
  if (!d) return { label: 'Smart Money', score: 0, max: 1.0, detail: 'n/a' };
  let s = 0;
  const parts = [];
  if (num(d.mspr3m) !== null && d.mspr3m > 0) { s += 0.5; parts.push('insiders buying'); }
  if (d.rec && d.rec.buyRatio >= 0.6 && !d.rec.deteriorating) { s += 0.5; parts.push(`${Math.round(d.rec.buyRatio * 100)}% buy`); }
  return { label: 'Smart Money', score: s, max: 1.0, detail: parts.length ? parts.join(', ') : 'no confirmation' };
}
```

Add a new `obvComponent` function directly above `smartMoneyComponent`:

```js
// Volume-based accumulation tell: OBV rising while price is still declining
// means buyers are absorbing supply ahead of the turn — a more real-time
// "smart money" signal than the 7d-cached insider/analyst data below.
function obvComponent(ind) {
  const trend = ind?.obv?.trend ?? null;
  if (trend === null) return { label: 'OBV', score: 0, max: 1.0, detail: 'n/a' };
  const roc60 = num(ind?.roc60);
  const declining = roc60 !== null && roc60 <= -8;
  const s = trend === 'rising' && declining ? 1.0 : trend === 'rising' ? 0.3 : 0;
  const detail = trend === 'rising'
    ? (declining ? 'OBV rising, price down — accumulation' : 'OBV rising')
    : trend === 'falling' ? 'OBV falling' : 'OBV flat';
  return { label: 'OBV', score: s, max: 1.0, detail };
}
```

In `computeDipRadar`, add `obvComponent(data.indicators)` to the `components` array (after `smartMoneyComponent`, order doesn't matter functionally but keep it last since it's the newest addition):

```js
    const components = [
      fearComponent(marketCtx),
      oversoldComponent(data.indicators),
      drawdownComponent(data.indicators),
      lowComponent(data),
      turnComponent(data.indicators),
      rsComponent(data.rs),
      valueComponent(gate.peg),
      smartMoneyComponent(data.smartMoney),
      obvComponent(data.indicators),
    ];
```

Update the file's top-of-file comment to mention OBV in the component list.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dip.test.js`
Expected: PASS, all tests including the new OBV test.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all test files pass, build succeeds with no new warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dip.js tests/dip.test.js
git commit -m "feat: OBV divergence component for Dip Hunter, rebalance to 9 components"
```

---

### Task 2: ADX risk flag caps Dip Hunter readiness (non-scored)

**Files:**
- Modify: `src/lib/dip.js`
- Test: `tests/dip.test.js`

**Interfaces:**
- Consumes: `data.indicators.adx` — `number | null` (from `computeADXLocal`, wired into `computeIndicatorsFromCandles`). Also reads `data.indicators.roc60` (already available).
- Produces: adds a `risk: { strongDowntrend: boolean, adx: number | null }` field to each hit object returned by `computeDipRadar`. This does **not** change `score` or the `components` array — it only caps `readiness`.

Rule: if `adx > 35` AND `roc60 <= -8`, the stock is in a strong, still-accelerating downtrend — not a mean-reversion setup. Cap `readiness` at `'WATCH'` even if the score would otherwise reach `'ACT'`/`'SOON'`.

- [ ] **Step 1: Write the failing test**

Add to `tests/dip.test.js`, in the `describe('dip score components', ...)` block:

```js
  it('caps readiness at WATCH when ADX shows a strong, still-accelerating downtrend', () => {
    const strongDowntrend = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -18, oversoldConfluence: true,
        macdCrossover: 'bullish_cross', obv: { obv: 500000, trend: 'rising' }, adx: 40 },
    });
    const hits = computeDipRadar([strongDowntrend], FEAR);
    expect(hits.length).toBe(1);
    expect(hits[0].readiness).toBe('WATCH');
    expect(hits[0].risk.strongDowntrend).toBe(true);
    expect(hits[0].risk.adx).toBe(40);
  });

  it('does not cap readiness when ADX is high but the decline has stalled', () => {
    const stalled = makeTicker({
      indicators: { rsi: 28, rsiZScore: -1.8, roc20: -7, roc60: -3, oversoldConfluence: true,
        macdCrossover: 'bullish_cross', obv: { obv: 500000, trend: 'rising' }, adx: 40 },
    });
    const hits = computeDipRadar([stalled], FEAR);
    expect(hits[0].risk.strongDowntrend).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dip.test.js`
Expected: FAIL — `hits[0].risk` is `undefined`.

- [ ] **Step 3: Implement the risk flag**

In `src/lib/dip.js`, add a small helper above `computeDipRadar`:

```js
// High ADX + still-declining price = a real, accelerating downtrend, not a
// mean-reversion setup. Caps readiness rather than excluding — the name can
// still be quality-gated and worth watching, just not actionable yet.
function riskFlags(ind) {
  const adx = num(ind?.adx);
  const roc60 = num(ind?.roc60);
  const strongDowntrend = adx !== null && adx > 35 && roc60 !== null && roc60 <= -8;
  return { strongDowntrend, adx };
}
```

In `computeDipRadar`, compute the risk flags and use them to cap readiness:

```js
    const hasFear = components[0].score > 0;
    const risk = riskFlags(data.indicators);
    const readiness = risk.strongDowntrend ? 'WATCH'
      : score >= 7 && hasFear ? 'ACT'
      : score >= 5 ? 'SOON' : 'WATCH';

    hits.push({
      symbol: item.symbol,
      score,
      readiness,
      components,
      risk,
      rsi: num(data.indicators?.rsi),
      roc60: num(data.indicators?.roc60),
      smartMoney: data.smartMoney?.data ?? null,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dip.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dip.js tests/dip.test.js
git commit -m "feat: ADX risk flag caps Dip Hunter readiness on accelerating downtrends"
```

---

### Task 3: Swing-low support flag on Dip Hunter (display-only)

**Files:**
- Modify: `src/lib/dip.js`
- Test: `tests/dip.test.js`

**Interfaces:**
- Consumes: `data.indicators.swingLows` — `Array<{ price: number, barsAgo: number }>`, most-recent-first (from `computeSwingLows`). Also reads `data.quote.data.c` (already used elsewhere in `dip.js`).
- Produces: adds a `support: { belowSupport: boolean, nearestSupport: number | null }` field to each hit. Non-scored, does not affect `score` or `readiness`.

Rule: compare current price to the most recent (index 0) swing low. If price is below it, the last support level has already broken — a caution flag, not a gate (the ticker may still be a valid dip candidate on other components; this is context for the trader, not the model).

- [ ] **Step 1: Write the failing test**

Add to `tests/dip.test.js`:

```js
  it('flags when price has broken the most recent swing-low support', () => {
    const t = makeTicker({ quote: { data: { c: 60 } } }); // below any swing low
    t.data.indicators.swingLows = [{ price: 65, barsAgo: 10 }, { price: 50, barsAgo: 40 }];
    const hits = computeDipRadar([t], FEAR);
    expect(hits[0].support.belowSupport).toBe(true);
    expect(hits[0].support.nearestSupport).toBe(65);
  });

  it('does not flag when price is holding above the most recent swing low', () => {
    const t = makeTicker(); // default price 80
    t.data.indicators.swingLows = [{ price: 65, barsAgo: 10 }];
    const hits = computeDipRadar([t], FEAR);
    expect(hits[0].support.belowSupport).toBe(false);
    expect(hits[0].support.nearestSupport).toBe(65);
  });

  it('degrades gracefully with no swing lows', () => {
    const hits = computeDipRadar([makeTicker()], FEAR); // default fixture has no swingLows
    expect(hits[0].support).toEqual({ belowSupport: false, nearestSupport: null });
  });
```

Note: the first test overrides `quote` at the top level (via `makeTicker`'s spread), which also changes the price the quality gate and every other component reads — 60 is still consistent with the fixture's `52WeekHigh`/`52WeekLow` (78/120), so it will still qualify (52w-Low component just scores differently, which is fine, the test only asserts on `support`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- dip.test.js`
Expected: FAIL — `hits[0].support` is `undefined`.

- [ ] **Step 3: Implement the support flag**

In `src/lib/dip.js`, add a helper above `computeDipRadar`:

```js
// Most recent swing-low support (daily pivot lows, computeSwingLows). Not a
// gate or a score — just tells the trader whether the last line of defence
// has already broken.
function supportStatus(data) {
  const price = num(data?.quote?.data?.c);
  const swingLows = data?.indicators?.swingLows ?? [];
  if (price === null || !swingLows.length) return { belowSupport: false, nearestSupport: null };
  const nearest = swingLows[0].price;
  return { belowSupport: price < nearest, nearestSupport: nearest };
}
```

Wire it into the hit object:

```js
    hits.push({
      symbol: item.symbol,
      score,
      readiness,
      components,
      risk,
      support: supportStatus(data),
      rsi: num(data.indicators?.rsi),
      roc60: num(data.indicators?.roc60),
      smartMoney: data.smartMoney?.data ?? null,
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- dip.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/dip.js tests/dip.test.js
git commit -m "feat: swing-low support flag for Dip Hunter (display-only)"
```

---

### Task 4: Wire OBV, ADX-risk, and support chips into DipRadar.svelte

**Files:**
- Modify: `src/lib/components/DipRadar.svelte`
- Modify: `src/lib/tooltipDefs.js`

**Interfaces:**
- Consumes: `h.risk` (`{ strongDowntrend, adx }`), `h.support` (`{ belowSupport, nearestSupport }`) from Task 2/3, plus the `comp(h, 'OBV')` lookup already possible via the existing `comp` helper in `DipRadar.svelte` (added in the prior session for `Turn`/`Value`/`Smart Money`). Reuses existing tooltip entries `TIPS.obv`, `TIPS.adx`, `TIPS.swingLows` (all already defined in `tooltipDefs.js` — verified present at the time this plan was written).
- Produces: three new chips in the Dip Hunter row.

- [ ] **Step 1: Add an OBV chip**

In `src/lib/components/DipRadar.svelte`, insert directly after the existing "Value (PEG)" chip block (search for `<!-- Value (PEG) -->` and its closing `</span>`):

```svelte
                <!-- OBV divergence -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded shrink-0 cursor-default {comp(h, 'OBV').score > 0 ? 'bg-bull-strong/20 text-bull-strong' : 'bg-surface-600 text-text-muted'}"
                  use:tipAction={() => ({
                    ...TIPS.obv,
                    current: { value: comp(h, 'OBV').detail, label: '', color: comp(h, 'OBV').score > 0 ? '#22c55e' : '#6b7280' },
                  })}
                >{comp(h, 'OBV').detail}</span>
```

- [ ] **Step 2: Add a strong-downtrend risk chip**

Insert after the OBV chip:

```svelte
                <!-- ADX risk flag -->
                {#if h.risk.strongDowntrend}
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded bg-bear-strong/20 text-bear-strong shrink-0 cursor-default"
                    use:tipAction={() => ({
                      ...TIPS.adx,
                      current: { value: `ADX ${h.risk.adx}`, label: 'Strong, still-accelerating downtrend — capped at WATCH', color: '#ef4444' },
                    })}
                  >⚠ trend {h.risk.adx}</span>
                {/if}
```

`bear-strong` is a verified existing token (`src/app.css:13`, `--color-bear-strong: #ef4444`), already used for bearish badges in `scoring.js` and `FundamentalsBar.svelte` — no fallback needed.

- [ ] **Step 3: Add a support-broken risk chip**

Insert after the ADX risk chip:

```svelte
                <!-- Support broken flag -->
                {#if h.support.belowSupport}
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded bg-bear-strong/20 text-bear-strong shrink-0 cursor-default"
                    use:tipAction={() => ({
                      ...TIPS.swingLows,
                      current: { value: `below $${h.support.nearestSupport}`, label: 'Last swing-low support already broken', color: '#ef4444' },
                    })}
                  >⚠ support broken</span>
                {/if}
```

- [ ] **Step 4: Update the Dip Score tooltip copy**

In `src/lib/tooltipDefs.js`, update the `dipScore` entry's `subtitle` and `description` to reflect 9 components and the new weights:

```js
  dipScore: {
    title: 'Dip Score',
    subtitle: '0–10 across nine components',
    category: 'Signals',
    description: 'Market Fear (max 1.5): F&G in fear zone + SPY below EMA50. Oversold (max 1.5): RSI tiers, RSI z-score ≤ −1.5, price at lower Bollinger band. Drawdown (max 1): 60d/20d decline. 52w Low (max 1): proximity to the 52-week low. Turn (max 1): MACD histogram just crossed bullish. Rel. Strength (max 1): mild underperformance vs SPY (−5% to −15%) reads as overreaction; beyond −15% scores zero, it’s a flag not a discount. Value (max 1): PEG within the quality gate — cheaper growth scores higher. Smart Money (max 1): insiders net-buying + ≥60% analyst buy ratings. OBV (max 1): rising OBV while price declines signals accumulation. ADX and swing-low support are shown separately as risk context — they cap readiness or flag caution, they never add or subtract points.',
```

Also update the top-level `dipRadar` entry's `description` (search for `Scans the watchlist for beaten-down entries`) to mention the two risk flags:

```js
    description: 'Scans the watchlist for beaten-down entries in fundamentally solid names. A strict quality gate (EPS growth, revenue growth, profitability, PEG < 3, fundamental score ≥ 60) must pass first — then the dip is scored 0–10 across market fear, oversold readings, drawdown depth, 52w-low proximity, a MACD turn signal, relative strength vs SPY, PEG-based value, OBV accumulation, and smart-money confirmation. A strong-ADX downtrend or a broken swing-low support level caps readiness rather than excluding the name — context for the trader, not a gate.',
```

- [ ] **Step 5: Manual check in the running app**

Run: `npm run dev`, open the dashboard, expand Dip Hunter, and confirm: the OBV chip renders with the expected color/text, no risk chips render for names that don't trigger them, and hovering each new chip shows the tooltip without console errors.

- [ ] **Step 6: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all green (this task touches no scoring logic, only display — the existing 214+ tests should be unaffected).

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/DipRadar.svelte src/lib/tooltipDefs.js
git commit -m "feat: OBV/ADX-risk/support chips in Dip Hunter row"
```

---

### Task 5: ADX + swing-low support context on Setup Radar (radar.js + SetupRadar.svelte)

**Files:**
- Modify: `src/lib/radar.js`
- Modify: `src/lib/components/SetupRadar.svelte`
- Test: `tests/radar.test.js`

**Interfaces:**
- Consumes: `data.indicators.adx` (`number | null`), `data.indicators.swingLows` (`Array<{price, barsAgo}>`), `data.quote.data.c` (may be absent in existing `radar.test.js` fixtures — handle null-safely, matching the pattern already used in `dip.js`'s `supportStatus`).
- Produces: adds `adx: number | null` and `support: { belowSupport: boolean, nearestSupport: number | null }` fields to each hit returned by `computeRadar`. Purely additive — does not change gating (`activeSetup`, `revGrowth`, `rs3m`, `peg` checks are untouched) or the sort order.

This mirrors Task 3's `supportStatus` exactly (same shape, same rule) — Setup Radar is a Pullback/Momentum entry finder, so "has price already broken the support the Pullback setup is betting on" is exactly as relevant here as it is for Dip Hunter.

- [ ] **Step 1: Write the failing tests**

In `tests/radar.test.js`, extend the `ticker()` fixture builder to accept `adx` and `swingLows` overrides and set `data.quote`:

```js
function ticker(symbol, o = {}) {
  const {
    readiness = 'SOON', setupType = 'pullback', setupScore = 6, etaWeeks = 2,
    rs3m = 5, revGrowth = 20, pe = 20, epsGrowth = 30,
    hasMetrics = true, hasRs = true, hasSetups = true, anchors = undefined,
    price = 80, adx = null, swingLows = [],
  } = o;
  const data = { quote: { data: { c: price } }, indicators: { adx, swingLows } };
  if (hasSetups) {
    const active = { score: setupScore, readiness, etaWeeks };
    const idle = { score: 0, readiness: 'WAIT', etaWeeks: null };
    data.setups = {
      pullback: setupType === 'pullback' ? active : idle,
      momentum: setupType === 'momentum' ? active : idle,
    };
  }
  if (hasRs) data.rs = { rs1m: rs3m, rs3m };
  if (hasMetrics) {
    data.metrics = { data: { metric: {
      revenueGrowthTTMYoy: revGrowth,
      peNormalizedAnnual: pe,
      epsGrowthTTMYoy: epsGrowth,
    } } };
  }
  if (anchors) data.anchors = anchors;
  return { symbol, data };
}
```

(Note: this changes the fixture's default shape by adding `quote`/`indicators` — read the rest of the existing test file first with `Read` to confirm no other test asserts on the *absence* of `data.quote` or `data.indicators`; if one does, adjust that test's expectations, don't skip this step.)

Add new tests at the end of the `describe('computeRadar', ...)` block:

```js
  it('passes through ADX', () => {
    const out = computeRadar([ticker('AAA', { adx: 28 })]);
    expect(out[0].adx).toBe(28);
  });

  it('flags when price has broken the most recent swing-low support', () => {
    const out = computeRadar([ticker('AAA', { price: 60, swingLows: [{ price: 65, barsAgo: 10 }] })]);
    expect(out[0].support.belowSupport).toBe(true);
    expect(out[0].support.nearestSupport).toBe(65);
  });

  it('does not flag when price holds above the most recent swing low', () => {
    const out = computeRadar([ticker('AAA', { price: 80, swingLows: [{ price: 65, barsAgo: 10 }] })]);
    expect(out[0].support.belowSupport).toBe(false);
  });

  it('degrades gracefully with no swing lows or ADX', () => {
    const out = computeRadar([ticker('AAA')]);
    expect(out[0].adx).toBe(null);
    expect(out[0].support).toEqual({ belowSupport: false, nearestSupport: null });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- radar.test.js`
Expected: FAIL — `out[0].adx` and `out[0].support` are `undefined`.

- [ ] **Step 3: Implement in radar.js**

In `src/lib/radar.js`, add the same `num`/`supportStatus` pattern used in `dip.js` (top of file, after the existing imports):

```js
function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
```
(already present — do not duplicate; just add the new helper below it)

```js
// Same rule as Dip Hunter's supportStatus (src/lib/dip.js) — most recent
// swing-low pivot as the support level a Pullback setup is betting on.
function supportStatus(data) {
  const price = isFiniteNum(data?.quote?.data?.c) ? data.quote.data.c : null;
  const swingLows = data?.indicators?.swingLows ?? [];
  if (price === null || !swingLows.length) return { belowSupport: false, nearestSupport: null };
  const nearest = swingLows[0].price;
  return { belowSupport: price < nearest, nearestSupport: nearest };
}
```

In `computeRadar`'s hit-building block, add the two fields:

```js
    hits.push({
      symbol: item.symbol,
      setupType: setup.type,
      readiness,
      setupScore: setup.score,
      etaWeeks: setup.etaWeeks,
      rs3m,
      rsRank: rankMap.get(item.symbol) ?? null,
      rsTotal,
      revGrowth,
      peg,
      adx: isFiniteNum(data?.indicators?.adx) ? data.indicators.adx : null,
      support: supportStatus(data),
    });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- radar.test.js`
Expected: PASS.

- [ ] **Step 5: Add display chips to SetupRadar.svelte**

In `src/lib/components/SetupRadar.svelte`, insert after the existing PEG chip (the last `<span>...</span>` in the row, right before the closing `</button>`):

```svelte
                <!-- Trend strength (ADX) -->
                {#if h.adx != null}
                  <span
                    class="font-mono text-xs w-16 shrink-0 cursor-default"
                    style="color:{h.adx >= 25 ? '#22c55e' : '#6b7280'}"
                    use:tipAction={() => ({
                      ...TIPS.adx,
                      current: { value: `ADX ${h.adx}`, label: h.adx >= 25 ? 'Real trend in place' : 'No trend yet — signals less reliable', color: h.adx >= 25 ? '#22c55e' : '#6b7280' },
                    })}
                  >ADX {h.adx}</span>
                {/if}

                <!-- Support broken flag -->
                {#if h.support.belowSupport}
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded bg-bear-strong/20 text-bear-strong shrink-0 cursor-default"
                    use:tipAction={() => ({
                      ...TIPS.swingLows,
                      current: { value: `below $${h.support.nearestSupport}`, label: 'Last swing-low support already broken', color: '#ef4444' },
                    })}
                  >⚠ support broken</span>
                {/if}
```

Same `bear-strong` token as Task 4 Step 2 — already verified to exist.

- [ ] **Step 6: Manual check in the running app**

Run: `npm run dev`, expand Setup Radar, confirm the ADX and support chips render correctly and tooltips work with no console errors.

- [ ] **Step 7: Run the full suite and build**

Run: `npm test && npm run build`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/radar.js src/lib/components/SetupRadar.svelte tests/radar.test.js
git commit -m "feat: ADX + swing-low support context on Setup Radar"
```

---

### Task 6: Update CLAUDE.md Dip Hunter section

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing (docs-only task).
- Produces: an accurate weight table and a note about the two non-scored risk flags, so a future session doesn't have to re-derive the current state from the diff.

- [ ] **Step 1: Update the Dip Hunter component table**

In `CLAUDE.md`, find the `## Dip Hunter (dip.js)` section's weight table and replace it with:

```markdown
| Component | Max | Signal |
|---|---|---|
| Market Fear | 1.5 | F&G in fear zone + SPY below EMA50 |
| Oversold | 1.5 | RSI tiers + z-score ≤ −1.5 + BB confluence |
| Drawdown | 1.0 | 60d/20d ROC decline |
| 52w Low | 1.0 | proximity to 52-week low (own tiers, not folded into Drawdown) |
| Turn | 1.0 | MACD histogram just crossed bullish — leading reversal, complements the coincident Oversold reading |
| Rel. Strength | 1.0 | mild RS underperformance vs SPY (−5% to −15%) reads as overreaction; beyond −15% or positive RS scores 0 — extreme weakness is a flag, not a discount |
| Value | 1.0 | grades PEG *within* the gate's <3 band — PEG<1 scores higher than PEG 2–3 |
| Smart Money | 1.0 | insider net-buying (MSPR) + ≥60% analyst buy ratio, not deteriorating |
| OBV | 1.0 | OBV rising while price is still declining (60d ROC ≤ −8%) signals accumulation — a more real-time smart-money tell than the 7d-cached insider/analyst data |

**Risk context (not scored, never gates):** a strong-ADX (>35) downtrend that hasn't stalled (60d ROC ≤ −8%) caps readiness at WATCH. A broken most-recent swing-low support level (`data.indicators.swingLows`) is flagged in the UI. Both surface as warnings only — they never add or remove score points.
```

- [ ] **Step 2: Update the "What's next" backlog note**

Replace the current `## What's next (BACKLOG.md)` paragraph (which references PR #16) with:

```markdown
## What's next (BACKLOG.md)

Dip Hunter's scored-component list is intentionally frozen after the OBV addition — any further ideas (Stochastic cross, EMA stack, volume-confirmation) go into `BACKLOG.md` as risk-context candidates, not new score components, unless a future session decides otherwise. See `BACKLOG.md` for the full queue and the per-iteration workflow rules (one feature = one branch = one PR, zero new API calls by default, display-only unless agreed, tests gate the merge).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md — Dip Hunter 9-component table + risk-context notes"
```

---

## Self-Review Notes (for the plan author — already applied above)

- **Spec coverage:** OBV divergence (Task 1) ✓, ADX risk filter (Task 2, Dip Hunter) + ADX context (Task 5, Setup Radar) ✓, swing-low support flag on both cards (Task 3 + Task 5) ✓, UI wiring for both cards (Task 4 + Task 5) ✓, docs (Task 6) ✓.
- **Placeholder scan:** no TBD/TODO — every step has literal code.
- **Type consistency:** `risk: { strongDowntrend, adx }` and `support: { belowSupport, nearestSupport }` shapes are identical between `dip.js` (Tasks 2–3) and `radar.js` (Task 5) by design, so the two Svelte components can share the same chip markup pattern.

# Long-Term Setup (Slice 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the merged Slice 1 (`computeTimingScore`) and Slice 2 (`computeQualityScore`) engines into one actionable `buildLongTermSetup` status, wire both into `App.svelte`, and ship the UI (watchlist-wide scan panel + per-ticker card).

**Architecture:** One new pure file (`src/lib/longTermSetup.js`) combines the two engines' outputs via a fixed gate matrix. `computeTimingScore` is wired eagerly into every candle-fetch path already in `App.svelte` (zero new API calls). `computeQualityScore`'s inputs are wired lazily, fetched only when a ticker's row is expanded, mirroring `PriceChart.svelte`'s existing lazy-fetch pattern. Two UI additions follow the codebase's established component conventions (`DipRadar.svelte` for the scan panel, the shared `expandedPanel` snippet in `WatchlistTable.svelte` for the per-ticker card).

**Tech Stack:** Vanilla JS (ES modules), Svelte 5 runes, Vitest. No new dependencies.

## Global Constraints

- **Zero new Finnhub endpoints.** `fetchFinancialsReported` (Slice 2) and `fetchHistoricalEarnings` (pre-existing, previously only called from `PriceChart.svelte`) are the only network calls this slice adds call *sites* for — both already exist and are already cached.
- **`timingScore` is eager, zero new calls** — computed from candle data already fetched in the existing refresh/hydration paths.
- **`qualityScore` is lazy** — fetched only on row-expand, not in the batch refresh loop, to avoid 2 extra Finnhub calls per ticker on every refresh.
- **Never throw, never fake data.** `buildLongTermSetup` treats `timingScore == null` / `qualityScore == null` as the weakest band, never as an error.
- **No changes to `computeScore`/conviction engine.** This feature is entirely additive and display-only in the sense that it doesn't feed the existing score.
- **Follow existing UI conventions exactly:** `DipRadar.svelte`'s collapsible-panel structure for the scan panel; `WatchlistTable.svelte`'s shared `{#snippet expandedPanel}` (used by both mobile and desktop) for the per-ticker card; Tailwind color classes matching the existing `bg-bull-strong/20 text-bull-strong` / `bg-uncertain/20 text-uncertain` / `bg-surface-600 text-text-secondary` triad already used by `DipRadar`/`EtfDashboard` readiness badges.

---

## File Structure

- **Create `src/lib/longTermSetup.js`** — `buildLongTermSetup(timingScore, qualityScore, marketContext)`, pure, ~90 lines.
- **Create `tests/longTermSetup.test.js`** — full gate-matrix + override + boost coverage.
- **Create `src/lib/components/LongTermScanPanel.svelte`** — watchlist-wide scan panel, mirrors `DipRadar.svelte`.
- **Modify `src/App.svelte`** — wire `computeTimingScore` into all 4 existing candle paths (TD live-refresh, Finnhub live-refresh, TD cache-hydration, Finnhub cache-hydration); add a lazy `loadQualityScoreForTicker(symbol)` function; persist/restore `timingScore`/`qualityScore` via the existing `dashboard_supplement` mechanism; mount `LongTermScanPanel`; pass an `onTickerExpand` callback into `WatchlistTable`.
- **Modify `src/lib/components/WatchlistTable.svelte`** — call `onTickerExpand` from `toggleTicker`; add the Long-Term Setup card to the shared `expandedPanel` snippet.

---

### Task 1: `buildLongTermSetup` — gate matrix + INSUFFICIENT_DATA override

**Files:**
- Create: `src/lib/longTermSetup.js`
- Test: `tests/longTermSetup.test.js`

**Interfaces:**
- Consumes: `TimingScore` shape from `src/lib/timingScore.js` (`{ total, label, components, signals, warnings }`, always an object, `total` may be `null`) and `QualityScore` shape from `src/lib/qualityScore.js` (`{ total, label, components, redFlags, notes }`, always an object, `total` may be `null`, `label` may be `'INSUFFICIENT_DATA'`). Both arguments may also be `null` themselves (engine not yet run).
- Produces: `buildLongTermSetup(timingScore, qualityScore, marketContext) → LongTermSetup` — `{ status, timingScore, qualityScore, reasons: string[] }`. Task 2 extends this same function (adds the extreme-panic boost) — do not rename it or change this signature. Task 5's `LongTermScanPanel.svelte` and Task 6's per-ticker card both call this function directly (no stored intermediate).

- [ ] **Step 1: Write the failing tests**

Create `tests/longTermSetup.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildLongTermSetup } from '../src/lib/longTermSetup.js';

function timing(total) {
  if (total === null) return { total: null, label: 'WAIT', components: {}, signals: [], warnings: [] };
  const label = total >= 70 ? 'STRONG_ACCUMULATION_ZONE' : total >= 50 ? 'WATCHLIST' : total >= 30 ? 'NEUTRAL' : 'WAIT';
  return { total, label, components: {}, signals: [], warnings: [] };
}

function quality(total, label) {
  if (total === null) return { total: null, label: label ?? 'INSUFFICIENT_DATA', components: {}, redFlags: [], notes: [] };
  return { total, label: label ?? (total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW'), components: {}, redFlags: [], notes: [] };
}

describe('buildLongTermSetup — gate matrix', () => {
  it('STRONG timing + HIGH/GOOD/OK quality -> ACCUMULATE', () => {
    expect(buildLongTermSetup(timing(75), quality(80), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(75), quality(68), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(75), quality(62), null).status).toBe('ACCUMULATE');
  });

  it('STRONG timing + WEAK/UNKNOWN quality -> OVERSOLD_BUT_CAUTION', () => {
    expect(buildLongTermSetup(timing(75), quality(40), null).status).toBe('OVERSOLD_BUT_CAUTION');
    expect(buildLongTermSetup(timing(75), null, null).status).toBe('OVERSOLD_BUT_CAUTION');
  });

  it('WATCH timing + HIGH/GOOD quality -> WATCHLIST', () => {
    expect(buildLongTermSetup(timing(55), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(68), null).status).toBe('WATCHLIST');
  });

  it('WATCH timing + OK/WEAK quality -> NEUTRAL', () => {
    expect(buildLongTermSetup(timing(55), quality(62), null).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(timing(55), quality(40), null).status).toBe('NEUTRAL');
  });

  it('WEAK timing (any quality) -> WAIT', () => {
    expect(buildLongTermSetup(timing(49), quality(80), null).status).toBe('WAIT');
    expect(buildLongTermSetup(timing(20), quality(40), null).status).toBe('WAIT');
    expect(buildLongTermSetup(timing(null), quality(80), null).status).toBe('WAIT');
  });

  it('band boundaries: t=70 is STRONG, t=69 is WATCH; t=50 is WATCH, t=49 is WEAK', () => {
    expect(buildLongTermSetup(timing(70), quality(62), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(69), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(50), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(49), quality(80), null).status).toBe('WAIT');
  });

  it('band boundaries: q=75 is HIGH, q=74 is GOOD; q=65 is GOOD, q=64 is OK; q=60 is OK, q=59 is WEAK', () => {
    expect(buildLongTermSetup(timing(75), quality(75), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(55), quality(74), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(65), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(64), null).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(timing(75), quality(60), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(75), quality(59), null).status).toBe('OVERSOLD_BUT_CAUTION');
  });

  it('quality.label INSUFFICIENT_DATA is treated as WEAK/UNKNOWN even if total happens to be non-null', () => {
    const q = quality(65, 'INSUFFICIENT_DATA');
    expect(buildLongTermSetup(timing(75), q, null).status).toBe('OVERSOLD_BUT_CAUTION');
  });
});

describe('buildLongTermSetup — INSUFFICIENT_DATA override', () => {
  it('both engines empty -> INSUFFICIENT_DATA, not WAIT', () => {
    const result = buildLongTermSetup(timing(null), quality(null), null);
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('both args entirely null (engines never run) -> INSUFFICIENT_DATA', () => {
    expect(buildLongTermSetup(null, null, null).status).toBe('INSUFFICIENT_DATA');
  });

  it('does NOT fire when only timing is null but quality has real data', () => {
    const result = buildLongTermSetup(timing(null), quality(80), null);
    expect(result.status).toBe('WAIT'); // falls through to the matrix: WEAK timing -> WAIT
  });

  it('does NOT fire when only quality is null but timing has real data', () => {
    const result = buildLongTermSetup(timing(55), null, null);
    expect(result.status).toBe('NEUTRAL'); // WATCH timing x WEAK/UNKNOWN quality -> NEUTRAL
  });
});

describe('buildLongTermSetup — return shape', () => {
  it('always includes the raw timingScore and qualityScore on the result', () => {
    const t = timing(75);
    const q = quality(80);
    const result = buildLongTermSetup(t, q, null);
    expect(result.timingScore).toBe(t);
    expect(result.qualityScore).toBe(q);
  });

  it('reasons is a non-empty array of strings for every status', () => {
    for (const s of [
      buildLongTermSetup(timing(75), quality(80), null),
      buildLongTermSetup(timing(75), quality(40), null),
      buildLongTermSetup(timing(55), quality(80), null),
      buildLongTermSetup(timing(55), quality(40), null),
      buildLongTermSetup(timing(20), quality(40), null),
      buildLongTermSetup(null, null, null),
    ]) {
      expect(Array.isArray(s.reasons)).toBe(true);
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(typeof s.reasons[0]).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/longTermSetup.test.js`
Expected: FAIL — `Cannot find module '../src/lib/longTermSetup.js'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/longTermSetup.js`:

```js
// Long-Term Setup (Slice 3) — combines the independent Timing Score (Slice 1)
// and Quality Score (Slice 2) engines into one actionable status via a fixed
// gate matrix. Never blends the two totals into one number: a high-timing
// low-quality "falling knife" must stay visibly distinct from a genuine
// accumulation zone (OVERSOLD_BUT_CAUTION vs ACCUMULATE), which a blended
// score would erase.

function timingBand(timingScore) {
  const t = timingScore?.total ?? null;
  if (t !== null && t >= 70) return 'STRONG';
  if (t !== null && t >= 50) return 'WATCH';
  return 'WEAK';
}

function qualityBand(qualityScore) {
  const q = qualityScore?.total ?? null;
  const label = qualityScore?.label ?? null;
  if (label === 'INSUFFICIENT_DATA') return 'WEAK_OR_UNKNOWN';
  if (q !== null && q >= 75) return 'HIGH';
  if (q !== null && q >= 65) return 'GOOD';
  if (q !== null && q >= 60) return 'OK';
  return 'WEAK_OR_UNKNOWN';
}

const MATRIX = {
  STRONG: { HIGH: 'ACCUMULATE', GOOD: 'ACCUMULATE', OK: 'ACCUMULATE', WEAK_OR_UNKNOWN: 'OVERSOLD_BUT_CAUTION' },
  WATCH:  { HIGH: 'WATCHLIST',  GOOD: 'WATCHLIST',  OK: 'NEUTRAL',    WEAK_OR_UNKNOWN: 'NEUTRAL' },
  WEAK:   { HIGH: 'WAIT',       GOOD: 'WAIT',       OK: 'WAIT',       WEAK_OR_UNKNOWN: 'WAIT' },
};

function buildReasons(status, timingScore, qualityScore) {
  const t = timingScore?.total ?? null;
  const q = qualityScore?.total ?? null;
  const qLabel = qualityScore?.label ?? null;
  const qualityUnchecked = qualityScore == null;

  switch (status) {
    case 'ACCUMULATE':
      return [`Strong timing (${t}) + ${qLabel ?? 'confirmed'} quality (${q}) — accumulation zone`];
    case 'OVERSOLD_BUT_CAUTION':
      return qualityUnchecked || qLabel === 'INSUFFICIENT_DATA'
        ? [`Timing looks attractive but quality hasn't been checked yet — expand this ticker to fetch fundamentals`]
        : [`Deep drawdown/oversold but quality score ${q} is below the ≥60 gate — could be a value trap`];
    case 'WATCHLIST':
      return [`Good quality (${q}), timing not yet ripe (${t}) — watch for a better entry`];
    case 'NEUTRAL':
      return [`Timing and quality signals are mixed — no clear edge either way`];
    case 'WAIT':
      return [`Timing score too low (${t ?? 'n/a'}) — not yet an attractive entry moment`];
    case 'INSUFFICIENT_DATA':
      return [`Not enough data for either score yet — needs more price history and/or fundamentals`];
    default:
      return [];
  }
}

/**
 * @typedef {Object} LongTermSetup
 * @property {'ACCUMULATE'|'WATCHLIST'|'OVERSOLD_BUT_CAUTION'|'NEUTRAL'|'WAIT'|'INSUFFICIENT_DATA'} status
 * @property {Object|null} timingScore
 * @property {Object|null} qualityScore
 * @property {string[]} reasons
 */

/**
 * @param {Object|null} timingScore   computeTimingScore() output, or null if not yet run
 * @param {Object|null} qualityScore  computeQualityScore() output, or null if not yet fetched
 * @param {Object|null} marketContext currently unused here (Task 2 adds fearGreed)
 * @returns {LongTermSetup}
 */
export function buildLongTermSetup(timingScore, qualityScore, marketContext) {
  const tTotal = timingScore?.total ?? null;
  const qLabel = qualityScore?.label ?? null;
  const qMissing = qualityScore == null || qLabel === 'INSUFFICIENT_DATA';

  if (tTotal === null && qMissing) {
    return { status: 'INSUFFICIENT_DATA', timingScore: timingScore ?? null, qualityScore: qualityScore ?? null, reasons: buildReasons('INSUFFICIENT_DATA', timingScore, qualityScore) };
  }

  const status = MATRIX[timingBand(timingScore)][qualityBand(qualityScore)];
  return { status, timingScore: timingScore ?? null, qualityScore: qualityScore ?? null, reasons: buildReasons(status, timingScore, qualityScore) };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/longTermSetup.test.js`
Expected: PASS — all matrix/override/shape tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/longTermSetup.js tests/longTermSetup.test.js
git commit -m "feat: add buildLongTermSetup — gate matrix combining timing + quality scores"
```

---

### Task 2: Extreme-panic boost

**Files:**
- Modify: `src/lib/longTermSetup.js`
- Test: `tests/longTermSetup.test.js` (append)

**Interfaces:**
- Consumes: the `buildLongTermSetup` shell from Task 1 (extends it — same signature, `marketContext.fearGreed` now used).
- Produces: the final version of `buildLongTermSetup`. No further tasks change this function.

- [ ] **Step 1: Write the failing tests**

Append to `tests/longTermSetup.test.js`:

```js
describe('buildLongTermSetup — extreme-panic boost', () => {
  it('WATCHLIST + fearGreed<30 + HIGH/GOOD quality -> boosted to ACCUMULATE', () => {
    const high = buildLongTermSetup(timing(55), quality(80), { fearGreed: 22 });
    expect(high.status).toBe('ACCUMULATE');
    expect(high.reasons.some(r => r.includes('Extreme market panic'))).toBe(true);

    const good = buildLongTermSetup(timing(55), quality(68), { fearGreed: 29 });
    expect(good.status).toBe('ACCUMULATE');
  });

  it('does not fire when fearGreed >= 30', () => {
    const result = buildLongTermSetup(timing(55), quality(80), { fearGreed: 30 });
    expect(result.status).toBe('WATCHLIST');
  });

  it('does not fire when quality band is OK or WEAK_OR_UNKNOWN', () => {
    expect(buildLongTermSetup(timing(55), quality(62), { fearGreed: 10 }).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(timing(55), quality(40), { fearGreed: 10 }).status).toBe('NEUTRAL');
  });

  it('does not fire on WAIT, OVERSOLD_BUT_CAUTION, NEUTRAL, or INSUFFICIENT_DATA', () => {
    expect(buildLongTermSetup(timing(20), quality(80), { fearGreed: 5 }).status).toBe('WAIT');
    expect(buildLongTermSetup(timing(75), quality(40), { fearGreed: 5 }).status).toBe('OVERSOLD_BUT_CAUTION');
    expect(buildLongTermSetup(timing(55), quality(62), { fearGreed: 5 }).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(null, null, { fearGreed: 5 }).status).toBe('INSUFFICIENT_DATA');
  });

  it('handles a null/missing marketContext gracefully (no boost, no throw)', () => {
    expect(buildLongTermSetup(timing(55), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(80), {}).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(80), undefined).status).toBe('WATCHLIST');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/longTermSetup.test.js`
Expected: FAIL — the 3 boost-should-fire assertions fail (status stays `WATCHLIST` instead of `ACCUMULATE`); the "does not fire" tests already pass by coincidence (no boost logic exists yet).

- [ ] **Step 3: Add the boost**

In `src/lib/longTermSetup.js`, replace the final block of `buildLongTermSetup`:

```js
  const status = MATRIX[timingBand(timingScore)][qualityBand(qualityScore)];
  return { status, timingScore: timingScore ?? null, qualityScore: qualityScore ?? null, reasons: buildReasons(status, timingScore, qualityScore) };
}
```

with:

```js
  let status = MATRIX[timingBand(timingScore)][qualityBand(qualityScore)];

  const fg = marketContext?.fearGreed ?? null;
  const qBand = qualityBand(qualityScore);
  const boosted = status === 'WATCHLIST' && fg !== null && fg < 30 && (qBand === 'HIGH' || qBand === 'GOOD');
  if (boosted) status = 'ACCUMULATE';

  const reasons = buildReasons(status, timingScore, qualityScore);
  if (boosted) reasons.push('Extreme market panic (F&G < 30) + confirmed quality — accelerated to ACCUMULATE');

  return { status, timingScore: timingScore ?? null, qualityScore: qualityScore ?? null, reasons };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/longTermSetup.test.js`
Expected: PASS — all tests from Tasks 1–2 green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/longTermSetup.js tests/longTermSetup.test.js
git commit -m "feat: buildLongTermSetup — extreme-panic (F&G<30) boost to ACCUMULATE"
```

---

### Task 3: Wire `computeTimingScore` eagerly into App.svelte

**Files:**
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: `computeTimingScore` from `src/lib/timingScore.js` (Slice 1, unchanged signature: `computeTimingScore({ dailyCandles, weeklyCandles, marketContext })`).
- Produces: `results[symbol].timingScore` (live refresh) and `data.timingScore` (cache hydration) on every ticker, in all 4 existing candle paths. Task 5 reads this via `getTickerData(symbol).timingScore`.

- [ ] **Step 1: Add the import**

In `src/App.svelte`, find the existing indicators import (near the top of the `<script>` block):

```js
  import { computeIndicatorsFromCandles, computeWeeklyTrend, computeRelativeStrength, computeBreadth, resampleWeekly, realizedVol, emaArray } from './lib/indicators.js';
  import { computeSetupSignals } from './lib/signals.js';
```

Add a new import line directly after it:

```js
  import { computeIndicatorsFromCandles, computeWeeklyTrend, computeRelativeStrength, computeBreadth, resampleWeekly, realizedVol, emaArray } from './lib/indicators.js';
  import { computeSetupSignals } from './lib/signals.js';
  import { computeTimingScore } from './lib/timingScore.js';
```

- [ ] **Step 2: Wire the TD live-refresh path**

Find this block (the TD path inside the main per-ticker refresh loop, where `setups`/`anchors` are computed from `weeklyRaw`/`synthetic`):

```js
              const weeklyRaw = resampleWeekly(synthetic);
              const weeklyTrend = computeWeeklyTrend(weeklyRaw);
              if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
              const setups = computeSetupSignals(weeklyRaw);
              if (setups) results[ticker.symbol].setups = setups;

              const anchors = computeChartAnchors(synthetic);
              if (anchors) results[ticker.symbol].anchors = anchors;
```

Add the timing-score call right after the anchors line:

```js
              const weeklyRaw = resampleWeekly(synthetic);
              const weeklyTrend = computeWeeklyTrend(weeklyRaw);
              if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
              const setups = computeSetupSignals(weeklyRaw);
              if (setups) results[ticker.symbol].setups = setups;

              const anchors = computeChartAnchors(synthetic);
              if (anchors) results[ticker.symbol].anchors = anchors;

              results[ticker.symbol].timingScore = computeTimingScore({
                dailyCandles: synthetic,
                weeklyCandles: weeklyRaw,
                marketContext: { fearGreed: marketContextData?.fearGreed?.data?.score ?? null },
              });
```

- [ ] **Step 3: Wire the Finnhub live-refresh path**

Find this block (the Finnhub path, same loop, a bit further down):

```js
            const weeklyFromTs = toTs - 52 * 7 * 86400;
            const weeklyRes = await fetchCandles(ticker.symbol, 'W', weeklyFromTs, toTs);
            await delay(100);
            const weeklyTrend = computeWeeklyTrend(weeklyRes?.data);
            if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
            const setups = computeSetupSignals(weeklyRes?.data);
            if (setups) results[ticker.symbol].setups = setups;

            const anchors = computeChartAnchors(candleRes?.data);
            if (anchors) results[ticker.symbol].anchors = anchors;
```

Add the timing-score call right after the anchors line:

```js
            const weeklyFromTs = toTs - 52 * 7 * 86400;
            const weeklyRes = await fetchCandles(ticker.symbol, 'W', weeklyFromTs, toTs);
            await delay(100);
            const weeklyTrend = computeWeeklyTrend(weeklyRes?.data);
            if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
            const setups = computeSetupSignals(weeklyRes?.data);
            if (setups) results[ticker.symbol].setups = setups;

            const anchors = computeChartAnchors(candleRes?.data);
            if (anchors) results[ticker.symbol].anchors = anchors;

            results[ticker.symbol].timingScore = computeTimingScore({
              dailyCandles: candleRes?.data,
              weeklyCandles: weeklyRes?.data,
              marketContext: { fearGreed: marketContextData?.fearGreed?.data?.score ?? null },
            });
```

- [ ] **Step 4: Wire the Finnhub cache-hydration path**

Find this block (inside `hydrateStartup()`):

```js
      if (data._candlesDaily)  { const ind = computeIndicatorsFromCandles(data._candlesDaily);  if (ind) data.indicators = ind; }
      if (data._candlesWeekly) { const wt  = computeWeeklyTrend(data._candlesWeekly);           if (wt)  data.weekly    = wt;  }
      if (data._candlesWeekly) { const st  = computeSetupSignals(data._candlesWeekly);          if (st)  data.setups    = st;  }
      if (data._candlesDaily)  { const an  = computeChartAnchors(data._candlesDaily);           if (an)  data.anchors   = an;  }
      delete data._candlesDaily;
      delete data._candlesWeekly;
```

This path deletes the raw candle fields immediately after use, so the timing-score call must happen before the `delete` lines:

```js
      if (data._candlesDaily)  { const ind = computeIndicatorsFromCandles(data._candlesDaily);  if (ind) data.indicators = ind; }
      if (data._candlesWeekly) { const wt  = computeWeeklyTrend(data._candlesWeekly);           if (wt)  data.weekly    = wt;  }
      if (data._candlesWeekly) { const st  = computeSetupSignals(data._candlesWeekly);          if (st)  data.setups    = st;  }
      if (data._candlesDaily)  { const an  = computeChartAnchors(data._candlesDaily);           if (an)  data.anchors   = an;  }
      if (data._candlesDaily || data._candlesWeekly) {
        data.timingScore = computeTimingScore({
          dailyCandles: data._candlesDaily,
          weeklyCandles: data._candlesWeekly,
          marketContext: { fearGreed: null }, // market context not yet loaded this early in startup
        });
      }
      delete data._candlesDaily;
      delete data._candlesWeekly;
```

- [ ] **Step 5: Wire the TD cache-hydration path**

Find this block (also inside `hydrateStartup()`, the TD fallback):

```js
                // Aggregate daily→weekly (true OHLCV bars) for weekly trend + setups
                const weeklyRaw = resampleWeekly(synthetic);
                const wt = computeWeeklyTrend(weeklyRaw); if (wt) data.weekly = wt;
                const st = computeSetupSignals(weeklyRaw); if (st) data.setups = st;
                const an = computeChartAnchors(synthetic); if (an) data.anchors = an;
```

Add the timing-score call:

```js
                // Aggregate daily→weekly (true OHLCV bars) for weekly trend + setups
                const weeklyRaw = resampleWeekly(synthetic);
                const wt = computeWeeklyTrend(weeklyRaw); if (wt) data.weekly = wt;
                const st = computeSetupSignals(weeklyRaw); if (st) data.setups = st;
                const an = computeChartAnchors(synthetic); if (an) data.anchors = an;
                data.timingScore = computeTimingScore({
                  dailyCandles: synthetic,
                  weeklyCandles: weeklyRaw,
                  marketContext: { fearGreed: null },
                });
```

- [ ] **Step 6: Persist `timingScore` in the dashboard_supplement write**

Find the supplement-write block:

```js
          supplement[sym] = {
            quote:       d.quote       ?? null,
            earnings:    d.earnings    ?? null,
            metrics:     d.metrics     ?? null,
            indicators:  d.indicators  ?? p?.indicators  ?? null,
            tdQuote:     d.tdQuote     ?? p?.tdQuote     ?? null,
            weekly:      d.weekly      ?? p?.weekly      ?? null,
            setups:      d.setups      ?? p?.setups      ?? null,
            profile:     d.profile     ?? p?.profile     ?? null,
            rs:          d.rs          ?? p?.rs          ?? null,
            smartMoney:  d.smartMoney  ?? p?.smartMoney  ?? null,
            sectorMomentum: d.sectorMomentum ?? null,
          };
```

Add `timingScore` and `qualityScore` (the latter for Task 4, added now so both land in one supplement-schema change):

```js
          supplement[sym] = {
            quote:       d.quote       ?? null,
            earnings:    d.earnings    ?? null,
            metrics:     d.metrics     ?? null,
            indicators:  d.indicators  ?? p?.indicators  ?? null,
            tdQuote:     d.tdQuote     ?? p?.tdQuote     ?? null,
            weekly:      d.weekly      ?? p?.weekly      ?? null,
            setups:      d.setups      ?? p?.setups      ?? null,
            profile:     d.profile     ?? p?.profile     ?? null,
            rs:          d.rs          ?? p?.rs          ?? null,
            smartMoney:  d.smartMoney  ?? p?.smartMoney  ?? null,
            sectorMomentum: d.sectorMomentum ?? null,
            timingScore:  d.timingScore  ?? p?.timingScore  ?? null,
            qualityScore: d.qualityScore ?? p?.qualityScore ?? null,
          };
```

- [ ] **Step 7: Restore `timingScore`/`qualityScore` on startup**

Find the supplement-restore loop:

```js
            if (s.sectorMomentum != null) results[sym].sectorMomentum = s.sectorMomentum;
          }
```

Add two lines directly above the closing brace:

```js
            if (s.sectorMomentum != null) results[sym].sectorMomentum = s.sectorMomentum;
            if (s.timingScore  != null) results[sym].timingScore  = s.timingScore;
            if (s.qualityScore != null) results[sym].qualityScore = s.qualityScore;
          }
```

- [ ] **Step 8: Run the full test suite and build**

Run: `npm test -- --run`
Expected: PASS — no test in the suite exercises `App.svelte` directly (it's a Svelte component, not unit-tested), so this step confirms no regression in the pure-logic test files that import from `src/lib/`.

Run: `npm run build`
Expected: succeeds with no new errors (confirms no syntax mistakes in the edits above).

- [ ] **Step 9: Commit**

```bash
git add src/App.svelte
git commit -m "feat: wire computeTimingScore into all 4 candle paths (zero new API calls)"
```

---

### Task 4: Lazy `qualityScore` loader wired to row-expand

**Files:**
- Modify: `src/App.svelte` — add `loadQualityScoreForTicker`, pass it to `WatchlistTable`.
- Modify: `src/lib/components/WatchlistTable.svelte` — accept the callback prop, call it from `toggleTicker`.

**Interfaces:**
- Consumes: `fetchFinancialsReported` (Slice 2, `src/lib/api/finnhub.svelte.js`), `fetchHistoricalEarnings` (pre-existing, same file), `parseFinancials` + `computeQualityScore` (Slice 2, `src/lib/qualityScore.js`), `getTickerData`/`setMarketData` (`src/lib/stores/watchlist.svelte.js`).
- Produces: `getTickerData(symbol).qualityScore` populated after first expand. Task 5's scan panel and Task 6's per-ticker card both read this via `getTickerData`.

- [ ] **Step 1: Add imports to App.svelte**

Find:

```js
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, getSectorETF, fetchMarketContext, isStorageFull, clearStorageFullFlag, fetchCandles, fetchProfile, fetchSmartMoney, hydrateFromCache, pruneOrphanedCache, delay } from './lib/api/finnhub.svelte.js';
```

Replace with (adds the two new imports to the existing named-import list):

```js
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, getSectorETF, fetchMarketContext, isStorageFull, clearStorageFullFlag, fetchCandles, fetchProfile, fetchSmartMoney, hydrateFromCache, pruneOrphanedCache, delay, fetchFinancialsReported, fetchHistoricalEarnings } from './lib/api/finnhub.svelte.js';
```

Find:

```js
  import { computeTimingScore } from './lib/timingScore.js';
```

Add directly after it:

```js
  import { computeTimingScore } from './lib/timingScore.js';
  import { parseFinancials, computeQualityScore } from './lib/qualityScore.js';
```

- [ ] **Step 2: Add `loadQualityScoreForTicker` to App.svelte**

Find the `hydrateStartup` function definition:

```js
  // On startup: merge Finnhub cache + supplement into one object, then set once.
```

Add a new function directly above it:

```js
  // Lazy Quality Score fetch — called when a ticker's row is expanded (Slice 3
  // design decision: avoid 2 extra Finnhub calls/ticker on every batch refresh).
  // Both underlying calls are already cached (7d financials, 24h earnings), so
  // re-expanding within the cache window costs nothing.
  async function loadQualityScoreForTicker(symbol) {
    const data = getTickerData(symbol);
    if (!data || data.qualityScore) return;
    try {
      const [finRes, earnRes] = await Promise.all([
        fetchFinancialsReported(symbol).catch(() => null),
        fetchHistoricalEarnings(symbol, 8).catch(() => null),
      ]);
      const financials = finRes?.data ? parseFinancials(finRes.data) : null;
      const earnings = Array.isArray(earnRes?.data) ? earnRes.data : null;
      const marketCap = data.profile?.marketCapitalization ?? null;
      const metric = data.metrics?.data ?? null;
      const quality = computeQualityScore({ metric, marketCap, financials, earnings });
      setMarketData({ [symbol]: { ...data, qualityScore: quality } });
    } catch { /* non-blocking — Long-Term Setup shows "not yet checked" */ }
  }

  // On startup: merge Finnhub cache + supplement into one object, then set once.
```

- [ ] **Step 3: Pass the callback into WatchlistTable**

Find:

```js
      <WatchlistTable onTickerAdded={handleRefresh} />
```

Replace with:

```js
      <WatchlistTable onTickerAdded={handleRefresh} onTickerExpand={loadQualityScoreForTicker} />
```

- [ ] **Step 4: Accept the prop in WatchlistTable.svelte and call it on expand**

Find:

```js
  let { onTickerAdded = () => {} } = $props();
```

Replace with:

```js
  let { onTickerAdded = () => {}, onTickerExpand = () => {} } = $props();
```

Find the `toggleTicker` function:

```js
  async function toggleTicker(symbol) {
    const opening = getSelectedSymbol() !== symbol;
    selectTicker(symbol);
    if (opening && typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
```

Replace with:

```js
  async function toggleTicker(symbol) {
    const opening = getSelectedSymbol() !== symbol;
    selectTicker(symbol);
    if (opening) onTickerExpand(symbol);
    if (opening && typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
```

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test -- --run`
Expected: PASS — no regressions (this task adds a prop with a default no-op, so any test harness that renders `WatchlistTable` without the new prop is unaffected).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/App.svelte src/lib/components/WatchlistTable.svelte
git commit -m "feat: lazy-fetch qualityScore on ticker row expand"
```

---

### Task 5: `LongTermScanPanel.svelte`

**Files:**
- Create: `src/lib/components/LongTermScanPanel.svelte`
- Modify: `src/App.svelte` — mount it.

**Interfaces:**
- Consumes: `buildLongTermSetup` (Task 2), `getTickers`/`getTickerData` (`src/lib/stores/watchlist.svelte.js`), `selectTicker` (same file, to jump to a ticker on click — mirrors `DipRadar.svelte`'s row-click behavior).
- Produces: nothing consumed by later tasks — this is the scan-panel half of the UI; Task 6 is the independent per-ticker-card half.

- [ ] **Step 1: Create the component**

Create `src/lib/components/LongTermScanPanel.svelte`:

```svelte
<script>
  import { getTickers, getTickerData, selectTicker } from '../stores/watchlist.svelte.js';
  import { buildLongTermSetup } from '../longTermSetup.js';

  let { marketContextData = null } = $props();
  let collapsed = $state(false);

  const STATUS_ORDER = ['ACCUMULATE', 'OVERSOLD_BUT_CAUTION', 'WATCHLIST', 'NEUTRAL', 'WAIT', 'INSUFFICIENT_DATA'];

  const rows = $derived.by(() => {
    const fearGreed = marketContextData?.fearGreed?.data?.score ?? null;
    return getTickers()
      .map(t => {
        const data = getTickerData(t.symbol);
        if (!data?.timingScore) return null; // no candle data yet — nothing to show
        const setup = buildLongTermSetup(data.timingScore, data.qualityScore ?? null, { fearGreed });
        return { symbol: t.symbol, setup };
      })
      .filter(Boolean)
      .sort((a, b) => STATUS_ORDER.indexOf(a.setup.status) - STATUS_ORDER.indexOf(b.setup.status));
  });

  const primaryRows = $derived(rows.filter(r => r.setup.status === 'ACCUMULATE' || r.setup.status === 'OVERSOLD_BUT_CAUTION'));
  let showAll = $state(false);

  function statusStyle(status) {
    if (status === 'ACCUMULATE') return 'bg-bull-strong/20 text-bull-strong';
    if (status === 'OVERSOLD_BUT_CAUTION') return 'bg-uncertain/20 text-uncertain';
    if (status === 'WATCHLIST') return 'bg-uncertain/20 text-uncertain';
    return 'bg-surface-600 text-text-secondary'; // NEUTRAL / WAIT / INSUFFICIENT_DATA
  }

  function statusLabel(status) {
    if (status === 'OVERSOLD_BUT_CAUTION') return 'CHECK QUALITY';
    return status;
  }
</script>

{#if getTickers().length}
  <div class="mb-4 border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
    <button
      class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-700/30 transition-colors"
      onclick={() => collapsed = !collapsed}
    >
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-default">▼ Long-Term Setup</span>
        <span class="text-[10px] text-text-muted hidden sm:inline">quality + timing accumulation scan</span>
        {#if primaryRows.length}
          <span class="text-[10px] bg-bull-strong/20 text-bull-strong px-1.5 py-0.5 rounded font-semibold">{primaryRows.length}</span>
        {/if}
      </div>
      <span class="text-text-muted text-xs">{collapsed ? '▸' : '▾'}</span>
    </button>

    {#if !collapsed}
      <div class="px-4 pb-3 border-t border-border/40 pt-3">
        {#if !rows.length}
          <p class="text-xs text-text-muted">No timing data yet — refresh your watchlist.</p>
        {:else}
          <div class="space-y-1.5">
            {#each (showAll ? rows : primaryRows.length ? primaryRows : rows.slice(0, 3)) as row (row.symbol)}
              <button
                class="w-full flex items-center justify-between px-2.5 py-1.5 rounded bg-surface-700/50 hover:bg-surface-700 transition-colors text-left"
                onclick={() => selectTicker(row.symbol)}
              >
                <span class="text-xs font-mono font-semibold text-text-primary">{row.symbol}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold {statusStyle(row.setup.status)}">{statusLabel(row.setup.status)}</span>
              </button>
            {/each}
          </div>
          {#if !showAll && rows.length > (primaryRows.length || 3)}
            <button class="text-[10px] text-text-muted hover:text-text-secondary mt-2" onclick={() => showAll = true}>
              Show all {rows.length} tickers ▾
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 2: Mount it in App.svelte**

Find:

```svelte
      <DipRadar marketData={marketContextData} />
```

Add directly after it:

```svelte
      <DipRadar marketData={marketContextData} />
      <LongTermScanPanel marketContextData={marketContextData} />
```

Find the `DipRadar` import:

```js
  import DipRadar from './lib/components/DipRadar.svelte';
```

Add directly after it:

```js
  import DipRadar from './lib/components/DipRadar.svelte';
  import LongTermScanPanel from './lib/components/LongTermScanPanel.svelte';
```

- [ ] **Step 3: Run the full test suite and build**

Run: `npm test -- --run`
Expected: PASS.

Run: `npm run build`
Expected: succeeds — confirms `LongTermScanPanel.svelte` compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/LongTermScanPanel.svelte src/App.svelte
git commit -m "feat: add LongTermScanPanel — watchlist-wide accumulation scan"
```

---

### Task 6: Per-ticker Long-Term Setup card in WatchlistTable's expanded row

**Files:**
- Modify: `src/lib/components/WatchlistTable.svelte`

**Interfaces:**
- Consumes: `buildLongTermSetup` (Task 2), `data.timingScore`/`data.qualityScore` (Tasks 3–4, available on the `data` object already passed into `{#snippet expandedPanel(ticker, data, score, variant)}`).
- Produces: nothing consumed elsewhere — this is the final UI piece.

- [ ] **Step 1: Add the import**

Find:

```js
  import { buildStockSnapshot, buildPrompt } from '../export.js';
```

Add directly after it:

```js
  import { buildStockSnapshot, buildPrompt } from '../export.js';
  import { buildLongTermSetup } from '../longTermSetup.js';
```

- [ ] **Step 2: Add a status-style helper**

Find the existing `scoreStyle` helper (used by both layouts per the v0.19 dedup round) — search for its definition (`function scoreStyle` or `const scoreStyle`). Add a sibling helper directly after it:

```js
  function longTermStatusStyle(status) {
    if (status === 'ACCUMULATE') return 'bg-bull-strong/20 text-bull-strong';
    if (status === 'OVERSOLD_BUT_CAUTION' || status === 'WATCHLIST') return 'bg-uncertain/20 text-uncertain';
    if (status === 'INSUFFICIENT_DATA') return 'bg-surface-600 text-text-muted';
    return 'bg-surface-600 text-text-secondary'; // NEUTRAL / WAIT
  }
```

- [ ] **Step 3: Add the card to the shared expandedPanel snippet**

Find the exact start of the snippet:

```js
  {#snippet expandedPanel(ticker, data, score, variant)}
    {#if variant === 'desktop'}
      <!-- AI export toolbar -->
```

Insert the Long-Term Setup card as the first thing inside the snippet, directly between the `{#snippet expandedPanel(ticker, data, score, variant)}` line and the existing `{#if variant === 'desktop'}` line — do NOT remove or modify `{#if variant === 'desktop'}` or anything after it, only insert new lines before it:

```svelte
    {@const setup = (data.timingScore || data.qualityScore) ? buildLongTermSetup(data.timingScore ?? null, data.qualityScore ?? null, { fearGreed: getMarketContext()?.fearGreedValue ?? null }) : null}
    {#if setup}
      <div class="mb-3 px-3 py-2 rounded-lg bg-surface-800/60 border border-border/40">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Long-Term Setup</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold {longTermStatusStyle(setup.status)}">{setup.status.replace(/_/g, ' ')}</span>
        </div>
        <div class="flex gap-3 text-[11px] text-text-secondary mb-1">
          <span>Timing: {data.timingScore?.total ?? 'n/a'} ({data.timingScore?.label ?? 'n/a'})</span>
          <span>Quality: {data.qualityScore?.total ?? 'not checked'} {data.qualityScore ? `(${data.qualityScore.label})` : ''}</span>
        </div>
        {#each setup.reasons as reason}
          <p class="text-[11px] text-text-muted">{reason}</p>
        {/each}
      </div>
    {/if}
```

Result — the top of the snippet now reads:

```svelte
  {#snippet expandedPanel(ticker, data, score, variant)}
    {@const setup = (data.timingScore || data.qualityScore) ? buildLongTermSetup(data.timingScore ?? null, data.qualityScore ?? null, { fearGreed: getMarketContext()?.fearGreedValue ?? null }) : null}
    {#if setup}
      <div class="mb-3 px-3 py-2 rounded-lg bg-surface-800/60 border border-border/40">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Long-Term Setup</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold {longTermStatusStyle(setup.status)}">{setup.status.replace(/_/g, ' ')}</span>
        </div>
        <div class="flex gap-3 text-[11px] text-text-secondary mb-1">
          <span>Timing: {data.timingScore?.total ?? 'n/a'} ({data.timingScore?.label ?? 'n/a'})</span>
          <span>Quality: {data.qualityScore?.total ?? 'not checked'} {data.qualityScore ? `(${data.qualityScore.label})` : ''}</span>
        </div>
        {#each setup.reasons as reason}
          <p class="text-[11px] text-text-muted">{reason}</p>
        {/each}
      </div>
    {/if}
    {#if variant === 'desktop'}
      <!-- AI export toolbar -->
```

- [ ] **Step 4: Verify `getMarketContext` is already imported**

Run: `grep -n "getMarketContext" src/lib/components/WatchlistTable.svelte`
Expected: it's already imported (see the existing `import { computeScore, computeScoreZScore, getBadgeStyle, getDaysToEarnings, getScoreVelocity, getScoreHistory, getMarketContext } from '../scoring.js';` line). If for any reason it's missing, add `getMarketContext` to that import list.

- [ ] **Step 5: Run the full test suite and build**

Run: `npm test -- --run`
Expected: PASS.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/WatchlistTable.svelte
git commit -m "feat: add Long-Term Setup card to per-ticker expanded row"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test -- --run`
Expected: PASS — every existing test plus `tests/longTermSetup.test.js` green, no regressions.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 3: Confirm zero new Finnhub endpoints**

Run: `git diff main -- src/lib/api/finnhub.svelte.js`
Expected: no output — this slice adds no changes to `finnhub.svelte.js` itself (it only adds new *call sites* for `fetchFinancialsReported`/`fetchHistoricalEarnings` in `App.svelte`, both of which already existed from Slices 1–2).

- [ ] **Step 4: Manual verification in the dev server**

Run: `npm run dev`, then in a browser:
1. Confirm `LongTermScanPanel` renders above `WatchlistTable` in the Stocks view (collapsed/expandable like Dip Hunter).
2. Refresh the watchlist; confirm rows appear in the scan panel with a status badge once refresh completes (timing-only, since quality hasn't been checked yet).
3. Expand a ticker; confirm the Long-Term Setup card appears in the row with both scores, and that after a moment the Quality score fills in (lazy fetch).
4. Re-collapse and re-expand the same ticker; confirm no new network calls fire for financials/earnings (check browser Network tab — cache hit).
5. Reload the page; confirm both the scan panel and the previously-expanded ticker's card still show data (supplement persistence from Task 3 Steps 6–7).

- [ ] **Step 5: Write delivery notes**

Summarize (in the PR description, not a new file):
- Files created: `src/lib/longTermSetup.js`, `tests/longTermSetup.test.js`, `src/lib/components/LongTermScanPanel.svelte`.
- Files modified: `src/App.svelte`, `src/lib/components/WatchlistTable.svelte`.
- No new Finnhub endpoints; `timingScore` is fully eager (zero new calls), `qualityScore` is lazy (2 calls per ticker, once per cache window, only for expanded tickers).
- Confirms the 3-slice "Long-Term Dip Buying & Quality Framework" is complete.

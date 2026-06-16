# Setup Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Setup Radar" panel that surfaces watchlist names with an early weekly entry forming in a fundamentally great company.

**Architecture:** A pure logic module (`radar.js`) computes the gated, ranked hit list from data already on each ticker object; a thin Svelte component (`SetupRadar.svelte`, modeled on `MorningBrief.svelte`) renders it below the Morning Brief. No new API calls, no scoring changes.

**Tech Stack:** Svelte 5 runes, Vitest, Tailwind v4. Spec: `docs/superpowers/specs/2026-06-17-setup-radar-design.md`.

## Global Constraints

- Zero new API calls — read only data already on the ticker object (`data.setups`, `data.rs`, `data.metrics.data.metric`).
- Display-only — do not modify `computeScore`, `signals.js`, or the setup math.
- Pure logic lives in `src/lib/radar.js`; the Svelte component holds no gate/rank math.
- Quality gate (verbatim): `revenueGrowthTTMYoy > 0` AND `rs.rs3m > 0` AND (`PEG < 3` OR `PEG === null`). Missing rev growth or rs3m → fails the gate.
- Early-entry gate (verbatim): an active setup is `pullback`/`momentum` with `readiness ∈ {WATCH, SOON, ACT}`; pick the higher readiness (ACT > SOON > WATCH), tie-broken by higher `score`.
- Output ranking: readiness priority desc, then `setupScore` desc, then `rs3m` desc.
- Branch: `feat/setup-radar` (already checked out). Commit after each task.

---

### Task 1: `radar.js` pure logic + tests

**Files:**
- Create: `src/lib/radar.js`
- Test: `tests/radar.test.js`

**Interfaces:**
- Consumes: `computePEG(pe, epsGrowthPct)` from `src/lib/valuation.js` (returns `null` when growth ≤ 0 or P/E ≤ 0).
- Produces: `computeRadar(list)` where `list` is `Array<{ symbol: string, data: object|null }>`, returning `Array<{ symbol, setupType:'PULLBACK'|'MOMENTUM', readiness:'WATCH'|'SOON'|'ACT', setupScore:number, etaWeeks:number|null, rs3m:number, rsRank:number|null, rsTotal:number, revGrowth:number, peg:number|null }>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/radar.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeRadar } from '../src/lib/radar.js';

// Fixture builder. Defaults pass BOTH gates with a SOON pullback.
function ticker(symbol, o = {}) {
  const {
    readiness = 'SOON', setupType = 'pullback', setupScore = 6, etaWeeks = 2,
    rs3m = 5, revGrowth = 20, pe = 20, epsGrowth = 30,
    hasMetrics = true, hasRs = true, hasSetups = true,
  } = o;
  const data = {};
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
  return { symbol, data };
}

describe('computeRadar', () => {
  it('includes a name passing both gates', () => {
    const out = computeRadar([ticker('AAA')]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe('AAA');
    expect(out[0].setupType).toBe('PULLBACK');
    expect(out[0].readiness).toBe('SOON');
    expect(out[0].peg).toBeCloseTo(20 / 30, 5);
    expect(out[0].rsRank).toBe(1);
    expect(out[0].rsTotal).toBe(1);
  });

  it('excludes an active setup that fails the quality gate (rs3m <= 0)', () => {
    expect(computeRadar([ticker('AAA', { rs3m: -2 })])).toHaveLength(0);
  });

  it('excludes a great company with only WAIT readiness', () => {
    const t = ticker('AAA');
    t.data.setups.pullback.readiness = 'WAIT';
    expect(computeRadar([t])).toHaveLength(0);
  });

  it('includes when PEG is null (non-positive eps growth) but rev+rs pass', () => {
    const out = computeRadar([ticker('AAA', { epsGrowth: -5 })]);
    expect(out).toHaveLength(1);
    expect(out[0].peg).toBeNull();
  });

  it('excludes when PEG >= 3', () => {
    expect(computeRadar([ticker('AAA', { pe: 60, epsGrowth: 10 })])).toHaveLength(0);
  });

  it('excludes when rs or metrics are missing', () => {
    expect(computeRadar([ticker('AAA', { hasRs: false })])).toHaveLength(0);
    expect(computeRadar([ticker('AAA', { hasMetrics: false })])).toHaveLength(0);
  });

  it('ranks ACT before SOON, then by setupScore', () => {
    const out = computeRadar([
      ticker('SOONLOW', { readiness: 'SOON', setupScore: 9, rs3m: 4 }),
      ticker('ACTONE',  { readiness: 'ACT',  setupScore: 5, rs3m: 4 }),
      ticker('SOONHI',  { readiness: 'SOON', setupScore: 8, rs3m: 4 }),
    ]);
    expect(out.map(h => h.symbol)).toEqual(['ACTONE', 'SOONLOW', 'SOONHI']);
  });

  it('returns [] for empty input', () => {
    expect(computeRadar([])).toEqual([]);
  });

  it('computes whole-watchlist RS rank by rs3m', () => {
    const out = computeRadar([
      ticker('LOW',  { rs3m: 2 }),
      ticker('HIGH', { rs3m: 9 }),
    ]);
    const bySym = Object.fromEntries(out.map(h => [h.symbol, h]));
    expect(bySym.HIGH.rsRank).toBe(1);
    expect(bySym.LOW.rsRank).toBe(2);
    expect(bySym.HIGH.rsTotal).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- radar`
Expected: FAIL — `Failed to resolve import "../src/lib/radar.js"` (module not yet created).

- [ ] **Step 3: Write the implementation**

Create `src/lib/radar.js`:

```js
// Setup Radar — early entries in great stocks.
// Pure logic: gates each watchlist name on (a) an early weekly setup and
// (b) a fundamental quality screen, then ranks the survivors. Display-only;
// reads data already on the ticker object — no API calls, no scoring changes.
import { computePEG } from './valuation.js';

const READINESS_RANK = { ACT: 3, SOON: 2, WATCH: 1 };

function isFiniteNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Stronger of pullback/momentum whose readiness is WATCH/SOON/ACT, else null.
function activeSetup(setups) {
  if (!setups) return null;
  const candidates = [];
  for (const [type, key] of [['PULLBACK', 'pullback'], ['MOMENTUM', 'momentum']]) {
    const s = setups[key];
    if (s && READINESS_RANK[s.readiness]) {
      candidates.push({
        type,
        readiness: s.readiness,
        score: isFiniteNum(s.score) ? s.score : 0,
        etaWeeks: s.etaWeeks ?? null,
      });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score)
  );
  return candidates[0];
}

export function computeRadar(list) {
  if (!Array.isArray(list) || !list.length) return [];

  // Whole-watchlist RS rank by rs3m (strongest = 1).
  const ranked = list
    .filter(x => isFiniteNum(x?.data?.rs?.rs3m))
    .map(x => ({ symbol: x.symbol, rs3m: x.data.rs.rs3m }))
    .sort((a, b) => b.rs3m - a.rs3m);
  const rsTotal = ranked.length;
  const rankMap = new Map(ranked.map((x, i) => [x.symbol, i + 1]));

  const hits = [];
  for (const item of list) {
    const data = item?.data;
    if (!data) continue;

    const setup = activeSetup(data.setups);
    if (!setup) continue;

    const metric = data?.metrics?.data?.metric ?? {};
    const revGrowth = metric.revenueGrowthTTMYoy;
    const rs3m = data?.rs?.rs3m;
    if (!isFiniteNum(revGrowth) || revGrowth <= 0) continue;
    if (!isFiniteNum(rs3m) || rs3m <= 0) continue;

    const peg = computePEG(
      metric.peNormalizedAnnual ?? metric.peBasicExclExtraTTM ?? null,
      metric.epsGrowthTTMYoy ?? metric.epsGrowth3Y ?? null,
    );
    if (peg !== null && !(peg < 3)) continue;

    hits.push({
      symbol: item.symbol,
      setupType: setup.type,
      readiness: setup.readiness,
      setupScore: setup.score,
      etaWeeks: setup.etaWeeks,
      rs3m,
      rsRank: rankMap.get(item.symbol) ?? null,
      rsTotal,
      revGrowth,
      peg,
    });
  }

  hits.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) ||
    (b.setupScore - a.setupScore) ||
    (b.rs3m - a.rs3m)
  );
  return hits;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- radar`
Expected: PASS — 9 tests in `tests/radar.test.js`.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS — 145 tests (136 prior + 9 new).

- [ ] **Step 6: Commit**

```bash
git add src/lib/radar.js tests/radar.test.js
git commit -m "feat(radar): computeRadar gate + rank logic with tests"
```

---

### Task 2: `SetupRadar.svelte` component

**Files:**
- Create: `src/lib/components/SetupRadar.svelte`

**Interfaces:**
- Consumes: `computeRadar(list)` (Task 1); `getTickers()`, `getTickerData(symbol)`, `selectTicker(symbol)` from `src/lib/stores/watchlist.svelte.js`; `tooltip` action from `src/lib/actions/tooltip.js`; `TIPS` from `src/lib/tooltipDefs.js` (the `TIPS.setupRadar` key is added in Task 3 — until then the tooltip is simply inert).
- Produces: default-exported Svelte component `<SetupRadar />` (no props).

- [ ] **Step 1: Create the component**

Create `src/lib/components/SetupRadar.svelte`:

```svelte
<script>
  import { getTickers, getTickerData, selectTicker } from '../stores/watchlist.svelte.js';
  import { computeRadar } from '../radar.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';

  let collapsed = $state(false);

  const hits = $derived.by(() => {
    const list = getTickers().map(t => ({ symbol: t.symbol, data: getTickerData(t.symbol) }));
    return computeRadar(list);
  });

  function readinessColor(r) {
    if (r === 'ACT')  return 'bg-bull-strong/20 text-bull-strong';
    if (r === 'SOON') return 'bg-uncertain/20 text-uncertain';
    return 'bg-surface-600 text-text-secondary'; // WATCH
  }
  const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const fmtPeg = (v) => (v === null ? '—' : `${v.toFixed(2)}x`);
</script>

{#if getTickers().length}
  <div class="mb-4 border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
    <button
      class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-700/30 transition-colors"
      onclick={() => collapsed = !collapsed}
    >
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-default" use:tipAction={TIPS.setupRadar}>★ Setup Radar</span>
        <span class="text-[10px] text-text-muted hidden sm:inline">early entries in great stocks</span>
        {#if hits.length}
          <span class="text-[10px] bg-bull-strong/20 text-bull-strong px-1.5 py-0.5 rounded font-semibold">{hits.length}</span>
        {/if}
      </div>
      <span class="text-text-muted text-xs">{collapsed ? '▸' : '▾'}</span>
    </button>

    {#if !collapsed}
      <div class="px-4 pb-3 border-t border-border/40 pt-3">
        {#if hits.length}
          <div class="space-y-1.5">
            {#each hits as h}
              <button
                class="w-full flex items-center gap-3 hover:bg-surface-700/40 rounded px-1.5 py-1.5 transition-colors text-left overflow-x-auto"
                onclick={() => selectTicker(h.symbol)}
              >
                <span class="font-mono font-semibold text-sm text-text-primary w-16 shrink-0">{h.symbol}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-600 text-text-secondary w-20 shrink-0 text-center">{h.setupType}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded {readinessColor(h.readiness)} w-14 shrink-0 text-center">{h.readiness}</span>
                <span class="text-[10px] text-text-muted w-12 shrink-0">{h.etaWeeks != null ? `~${h.etaWeeks}w` : ''}</span>
                <span class="text-xs text-text-secondary w-16 shrink-0">RS {h.rsRank}/{h.rsTotal}</span>
                <span class="font-mono text-xs text-bull-strong w-16 shrink-0">{fmtPct(h.rs3m)}</span>
                <span class="font-mono text-xs text-bull-strong w-24 shrink-0">rev {fmtPct(h.revGrowth)}</span>
                <span class="font-mono text-xs text-text-muted w-20 shrink-0">PEG {fmtPeg(h.peg)}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-text-muted italic">No great-stock entries today — the gate is intentionally strict.</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds with no Svelte/Vite errors (the `TIPS.setupRadar` reference resolves to `undefined` for now — the tooltip action no-ops on undefined; Task 3 adds the entry).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/SetupRadar.svelte
git commit -m "feat(radar): SetupRadar panel component"
```

---

### Task 3: Wire into App + tooltip + final verification

**Files:**
- Modify: `src/lib/tooltipDefs.js` (add `TIPS.setupRadar` after the `topSetups` block, ~line 449)
- Modify: `src/App.svelte` (import ~line 19; render after `<MorningBrief />` ~line 552)

**Interfaces:**
- Consumes: `<SetupRadar />` (Task 2); the existing `TIPS` object and `C` color map in `tooltipDefs.js`.
- Produces: the panel rendered live between Morning Brief and the watchlist table.

- [ ] **Step 1: Add the tooltip definition**

In `src/lib/tooltipDefs.js`, immediately after the `topSetups: { ... },` block (the closing `},` near line 449), insert:

```js
  setupRadar: {
    title: 'Setup Radar',
    subtitle: 'Early Entries in Great Stocks',
    category: 'Morning Brief',
    description: 'Watchlist names with an early weekly entry forming that also pass a quality gate. A name appears only when BOTH are true; the rest are hidden.',
    levels: [
      { range: 'Early entry', label: 'Setup',   color: C.green, desc: 'Pullback or Momentum setup at WATCH / SOON / ACT readiness — the turn is forming before it is obvious.' },
      { range: 'Great stock', label: 'Quality', color: C.green, desc: 'Revenue growing YoY, outperforming SPY over 3M, and PEG < 3 (or not computable).' },
    ],
    why: 'Pairs timing with quality: catch the early entry, but only in companies that are growing and already leading the market. Ranked ACT → SOON → WATCH, strongest setup first.',
  },
```

- [ ] **Step 2: Import the component in App.svelte**

In `src/App.svelte`, after the line `import MorningBrief from './lib/components/MorningBrief.svelte';` add:

```js
  import SetupRadar from './lib/components/SetupRadar.svelte';
```

- [ ] **Step 3: Render the panel**

In `src/App.svelte`, change the block that currently reads:

```svelte
    <MorningBrief />
    <WatchlistTable onTickerAdded={handleRefresh} />
```

to:

```svelte
    <MorningBrief />
    <SetupRadar />
    <WatchlistTable onTickerAdded={handleRefresh} />
```

- [ ] **Step 4: Verify build + full test suite**

Run: `npm run build && npm test`
Expected: build succeeds; 145 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tooltipDefs.js src/App.svelte
git commit -m "feat(radar): wire SetupRadar into dashboard + gate tooltip"
```

---

## Self-Review

**Spec coverage:**
- `radar.js` pure `computeRadar` → Task 1. ✓
- `SetupRadar.svelte` panel below Morning Brief → Tasks 2–3. ✓
- `tests/radar.test.js` covering both-gates / quality-fail / WAIT-only / PEG-null / PEG≥3 / missing-data / ranking / empty / RS-rank → Task 1 (9 tests). ✓
- App.svelte wiring → Task 3. ✓
- Both gates, ranking, RS rank, output contract → Task 1 matches spec verbatim. ✓
- Zero API calls / display-only / no scoring change → no API or scoring files touched. ✓
- Empty state + collapsible + click-to-select → Task 2. ✓

**Placeholder scan:** none — all steps have real code/commands. ✓

**Type consistency:** `computeRadar(list)` shape, field names (`setupType`, `readiness`, `setupScore`, `etaWeeks`, `rs3m`, `rsRank`, `rsTotal`, `revGrowth`, `peg`), and `READINESS_RANK` are identical across module, tests, and component. `computePEG(pe, epsGrowthPct)` matches `valuation.js`. ✓

# ETF Refinement Round (v0.17) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the six approved v0.17 improvements (spec: `docs/superpowers/specs/2026-07-10-etf-refinement-v017-design.md`) as four sequential PRs: tooltip viewport clamp, Setup Radar RSI + ETF decision indicators, ETF thesis + highlights strip + in-browser notifications, UCITS catalog search.

**Architecture:** All new math is display-only and computed from candles/metrics already in memory — zero new API calls, zero changes to any scoring engine's inputs. New pure logic lives in `src/lib/` with unit tests; UI renders in existing components plus one new `HighlightsStrip.svelte`.

**Tech Stack:** Svelte 5 (runes), Vite 8, Tailwind v4, Vitest.

## Global Constraints

- **Zero new API calls.** Everything computes from data already fetched.
- **Display-only.** Nothing here feeds `computeScore`, the weekly setups' scores, the dip score, or the ETF entry/exit scores.
- **One PR at a time, sequentially.** Before starting each PR group: `git checkout main && git pull --ff-only origin main && git checkout -b <branch>`. Never commit to `main`.
- **Tests gate each merge:** `npm test` green (263 tests at baseline start of plan: 246 + additions accumulate) and `npm run build` clean before each PR.
- **PR bodies:** no "Generated with Claude Code" footer, no speculative manual-verification checkboxes (user preference).
- **Svelte 5 runes only** (`$state`, `$derived`, `$props`, `$effect`) — no legacy stores/`$:` syntax.
- Baseline: `main` at commit `6e173fd` or later. Branch `fix/tooltip-viewport-clamp` already exists and carries the spec commit — PR 1 starts there, do NOT recreate it.

---

# PR 1 — `fix/tooltip-viewport-clamp`

The branch already exists (contains the spec commit `cb4a73c`). `git checkout fix/tooltip-viewport-clamp`.

### Task 1: Viewport-aware tooltip positioning

**Files:**
- Modify: `src/lib/components/TooltipOverlay.svelte` (whole `<script>` positioning block + desktop wrapper markup)

**Interfaces:**
- Consumes: `getTooltip()`, `hideTooltip()` from `src/lib/stores/tooltip.svelte.js` (unchanged).
- Produces: no API change — pure rendering fix. All `use:tooltip` consumers benefit automatically.

**Why:** current code guesses tooltip height (`max_y = innerHeight − 420`, flip by fixed `320px`). Real tooltips vary in height, so content clips at the viewport top/bottom. Fix: measure the rendered element (`bind:clientHeight`), flip/clamp with the real height, close on scroll (a cursor-anchored position is stale after scrolling).

- [ ] **Step 1: Replace the positioning logic in `TooltipOverlay.svelte`**

Replace lines 4–21 (`const TOOLTIP_WIDTH` … end of the `pos` derived) with:

```js
  const TOOLTIP_WIDTH = 374;
  const OFFSET_X = 18;
  const OFFSET_Y = 12;

  const tip = $derived(getTooltip());
  let tipHeight = $state(0); // measured height of the desktop popover

  // Desktop: viewport-aware anchored popover — flip and clamp using the
  // measured height (content varies), never a hardcoded estimate.
  const pos = $derived(() => {
    if (!tip.visible || typeof window === 'undefined') return { x: 0, y: 0 };
    const safeWidth = Math.min(TOOLTIP_WIDTH, window.innerWidth - 16);
    const h = tipHeight || 320; // pre-measurement fallback for the first frame
    let x = tip.x + OFFSET_X;
    if (x + safeWidth > window.innerWidth - 8) x = tip.x - safeWidth - OFFSET_X;
    let y = tip.y + OFFSET_Y;
    if (y + h > window.innerHeight - 8) y = tip.y - h - OFFSET_Y; // flip above cursor
    return { x: Math.max(8, x), y: Math.max(8, y) };
  });

  // Scrolling invalidates a cursor-anchored position — just close.
  // Capture phase also catches scrolls inside nested overflow containers.
  $effect(() => {
    if (!tip.visible || typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 639px)').matches) return; // bottom sheet handles itself
    window.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', hideTooltip, { capture: true });
  });
```

Keep the existing mobile body-scroll-lock `$effect` unchanged below it.

- [ ] **Step 2: Measure the desktop popover and cap its height**

In the markup, change the desktop wrapper (currently lines 98–105) to:

```svelte
  <!-- Desktop: cursor-anchored popover -->
  <div
    class="hidden sm:block fixed z-[9999] pointer-events-none"
    style="left:{p.x}px; top:{p.y}px; width:min({TOOLTIP_WIDTH}px, calc(100vw - 16px));"
    bind:clientHeight={tipHeight}
  >
    <div class="bg-surface-800 border border-border/70 rounded-xl shadow-2xl overflow-hidden text-xs max-h-[calc(100vh-16px)]">
      {@render body(c)}
    </div>
  </div>
```

(Only two changes: `bind:clientHeight={tipHeight}` on the wrapper, `max-h-[calc(100vh-16px)]` on the card. Mobile bottom-sheet markup untouched.)

- [ ] **Step 3: Verify build + tests**

Run: `npm test && npm run build`
Expected: all tests pass (none touch this component), build clean.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open http://localhost:5173:
1. Hover an indicator on a row at the very **bottom** of the visible viewport (scroll so a watchlist/ETF row sits at the bottom edge) → tooltip flips **above** the cursor, fully visible.
2. Hover a row at the very **top** → tooltip renders below, fully visible.
3. Hover, then scroll → tooltip closes instead of floating detached.
4. Narrow the window <640px, tap an indicator → bottom sheet unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/TooltipOverlay.svelte
git commit -m "fix: tooltip clamps to viewport using measured height, closes on scroll"
```

### Task 2: Open PR 1

- [ ] **Step 1: Push and create PR**

```bash
git push -u origin fix/tooltip-viewport-clamp
gh pr create --title "fix: tooltip viewport clamp (measured height + close on scroll)" --body "$(cat <<'EOF'
Tooltips clipped off-screen top/bottom depending on scroll position because TooltipOverlay guessed a fixed height (420/320px). Now it measures the rendered popover (bind:clientHeight), flips above the cursor when the bottom would overflow, clamps to an 8px viewport margin, caps max-height, and closes on scroll (capture phase, so nested scroll containers count too). Mobile bottom sheet unchanged.

Also carries the v0.17 spec: docs/superpowers/specs/2026-07-10-etf-refinement-v017-design.md
EOF
)"
```

- [ ] **Step 2: Wait for CI green, merge, verify**

Merge via `gh pr merge --squash` once checks pass (or user merges). Then `git checkout main && git pull --ff-only origin main`.

---

# PR 2 — `feat/etf-indicators`

Setup: `git checkout main && git pull --ff-only origin main && git checkout -b feat/etf-indicators`

### Task 3: Expose weekly RSI from `computeSetupSignals`

**Files:**
- Modify: `src/lib/signals.js:344-348` (return of `computeSetupSignals`)
- Test: `tests/signals.test.js`

**Interfaces:**
- Produces: `computeSetupSignals(weeklyRaw)` now returns `{ pullback, momentum, meta: { wRsi: number|null } }`. `wRsi` is `Math.round(computeRSI(closes))`. Existing `pullback`/`momentum` shapes unchanged — consumers reading only those keys are unaffected.

- [ ] **Step 1: Write the failing test**

Append to `tests/signals.test.js` (ensure `computeRSI` is imported at the top: `import { computeRSI } from '../src/lib/indicators.js';` — add if absent):

```js
describe('computeSetupSignals meta (display-only weekly RSI)', () => {
  it('exposes rounded weekly RSI as meta.wRsi', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + i); // steady rise → high RSI
    const raw = { s: 'ok', c: closes, h: [...closes], l: [...closes], v: closes.map(() => 1000) };
    const out = computeSetupSignals(raw);
    expect(out.meta.wRsi).toBe(Math.round(computeRSI(closes)));
    expect(out.meta.wRsi).toBeGreaterThan(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/signals.test.js -t "meta"`
Expected: FAIL — `out.meta` is undefined.

- [ ] **Step 3: Implement**

In `src/lib/signals.js`, replace the last lines of `computeSetupSignals`:

```js
  const pullback = scorePullbackSetup({ divergence, structure, volume, rangePos });
  const momentum = scoreMomentumSetup({ squeeze, structure, volume, emaReclaim });

  // Display-only: raw weekly RSI for the radar UI — not consumed by either setup score.
  const wRsi = computeRSI(closes);

  return { pullback, momentum, meta: { wRsi: wRsi == null ? null : Math.round(wRsi) } };
```

- [ ] **Step 4: Run full test file**

Run: `npx vitest run tests/signals.test.js`
Expected: PASS (all, including pre-existing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/signals.js tests/signals.test.js
git commit -m "feat: expose weekly RSI as meta.wRsi from computeSetupSignals (display-only)"
```

### Task 4: Weekly RSI readout in Setup Radar

**Files:**
- Modify: `src/lib/radar.js:88-101` (hit object)
- Modify: `src/lib/components/SetupRadar.svelte` (row chips)
- Test: `tests/radar.test.js`

**Interfaces:**
- Consumes: `data.setups.meta.wRsi` from Task 3.
- Produces: radar hits gain `wRsi: number|null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/radar.test.js`:

```js
describe('radar wRsi passthrough', () => {
  it('passes meta.wRsi from setups through to hits', () => {
    const data = {
      setups: {
        pullback: { score: 6, readiness: 'SOON', etaWeeks: 2 },
        momentum: { score: 2, readiness: 'WAIT', etaWeeks: null },
        meta: { wRsi: 41 },
      },
      metrics: { data: { metric: { revenueGrowthTTMYoy: 12, peNormalizedAnnual: 20, epsGrowthTTMYoy: 15 } } },
      rs: { rs3m: 4 },
      quote: { data: { c: 100 } },
      indicators: { adx: 20, swingLows: [] },
    };
    const hits = computeRadar([{ symbol: 'TEST', data }]);
    expect(hits).toHaveLength(1);
    expect(hits[0].wRsi).toBe(41);
  });

  it('wRsi is null when setups carry no meta (older cache shape)', () => {
    const data = {
      setups: { pullback: { score: 6, readiness: 'SOON', etaWeeks: 2 }, momentum: null },
      metrics: { data: { metric: { revenueGrowthTTMYoy: 12, peNormalizedAnnual: 20, epsGrowthTTMYoy: 15 } } },
      rs: { rs3m: 4 },
      quote: { data: { c: 100 } },
      indicators: {},
    };
    expect(computeRadar([{ symbol: 'TEST', data }])[0].wRsi).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/radar.test.js -t "wRsi"`
Expected: FAIL — `hits[0].wRsi` is undefined.

- [ ] **Step 3: Implement in radar.js**

In the `hits.push({...})` object (after `adx:` line), add:

```js
      wRsi: data?.setups?.meta?.wRsi ?? null,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/radar.test.js`
Expected: PASS.

- [ ] **Step 5: Render in SetupRadar.svelte**

In `src/lib/components/SetupRadar.svelte`, insert after the "Eta weeks" span (after line 81's closing `</span>`, before the RS-rank span):

```svelte
                <!-- Weekly RSI (display-only, not scored) -->
                {#if h.wRsi != null}
                  <span
                    class="font-mono text-xs w-16 shrink-0 cursor-default text-text-secondary"
                    use:tipAction={() => ({
                      ...TIPS.rsi,
                      title: 'Weekly RSI(14)',
                      subtitle: 'Informational — not part of the setup score',
                      current: {
                        value: String(h.wRsi),
                        label: h.wRsi < 30 ? 'Oversold' : h.wRsi > 70 ? 'Overbought' : 'Neutral',
                        color: h.wRsi < 30 ? '#22c55e' : h.wRsi > 70 ? '#ef4444' : '#9ca3af',
                      },
                    })}
                  >wRSI {h.wRsi}</span>
                {/if}
```

- [ ] **Step 6: Verify + commit**

Run: `npm test && npm run build` → all green.
Manual: `npm run dev`, stocks view → Setup Radar rows show `wRSI 47`-style readout with tooltip.

```bash
git add src/lib/radar.js src/lib/components/SetupRadar.svelte tests/radar.test.js
git commit -m "feat: weekly RSI readout in Setup Radar (display-only)"
```

### Task 5: ETF decision indicators in `computeEtfSignals`

**Files:**
- Modify: `src/lib/etf.js:137-166` (pass 2 of `computeEtfSignals`)
- Test: `tests/etf.test.js`

**Interfaces:**
- Produces: `out[proxy]` gains `indicators: { trendState: 'UPTREND'|'PULLBACK'|'DOWNTREND'|'BASING'|null, wRsi: number|null, rangePos52w: number|null (0–100), roc13w: number|null }`. Existing keys unchanged. Task 6 (UI) and Task 8 (thesis) consume this.

- [ ] **Step 1: Write the failing tests**

Append to `tests/etf.test.js` (reuses the existing `makeWeekly` and `ramp` helpers):

```js
describe('computeEtfSignals display indicators (v0.17)', () => {
  const spy = ramp(100, 100, 252);

  it('uptrending ETF: UPTREND, high range position, positive roc13w, wRsi > 50', () => {
    const out = computeEtfSignals(
      [{ proxy: 'QQQ', weeklyRaw: makeWeekly(ramp(100, 150, 52)), dailyCloses: ramp(100, 150, 252) }], spy);
    const ind = out.QQQ.indicators;
    expect(ind.trendState).toBe('UPTREND');
    expect(ind.rangePos52w).toBeGreaterThan(90);
    expect(ind.roc13w).toBeGreaterThan(0);
    expect(ind.wRsi).toBeGreaterThan(50);
  });

  it('downtrending ETF: DOWNTREND near its 52w low with negative roc13w', () => {
    const out = computeEtfSignals(
      [{ proxy: 'XLE', weeklyRaw: makeWeekly(ramp(100, 70, 52)), dailyCloses: ramp(100, 70, 252) }], spy);
    const ind = out.XLE.indicators;
    expect(ind.trendState).toBe('DOWNTREND');
    expect(ind.rangePos52w).toBeLessThan(10);
    expect(ind.roc13w).toBeLessThan(0);
  });

  it('flat series: no 52w range → rangePos52w null, trendState BASING', () => {
    const out = computeEtfSignals(
      [{ proxy: 'SPY', weeklyRaw: makeWeekly(ramp(100, 100, 52)), dailyCloses: ramp(100, 100, 252) }], spy);
    expect(out.SPY.indicators.rangePos52w).toBeNull();
    expect(out.SPY.indicators.trendState).toBe('BASING');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/etf.test.js -t "display indicators"`
Expected: FAIL — `indicators` is undefined.

- [ ] **Step 3: Implement in etf.js**

In pass 2 of `computeEtfSignals`, after the `volumeRatio` block (line ~152) and before `const rs = rsMap[proxy];`, insert:

```js
    // ── Display-only indicators (v0.17) — rendered in the expanded row, never scored
    const ema10arrW = emaArray(wc, 10);
    const ema10 = ema10arrW.length ? ema10arrW[ema10arrW.length - 1] : null;
    const wClose = wc[wc.length - 1];
    let trendState = null;
    if (ema10 != null && ema30 != null) {
      if (wClose > ema10 && wClose > ema30 && ema10 > ema30) trendState = 'UPTREND';
      else if (wClose < ema10 && wClose < ema30) trendState = 'DOWNTREND';
      else if (wClose < ema10 && wClose >= ema30) trendState = 'PULLBACK';
      else trendState = 'BASING';
    }

    const win52 = dailyCloses.slice(-252);
    const lo52 = Math.min(...win52);
    const rangePos52w = hi52 > lo52 ? Math.round(((price - lo52) / (hi52 - lo52)) * 100) : null;

    const roc13w = wc.length >= 14 && wc[wc.length - 14] > 0
      ? round1((wClose / wc[wc.length - 14] - 1) * 100)
      : null;
```

Then extend the `out[proxy] = { ... }` object with one key after `groupMedianRs3m,`:

```js
      indicators: {
        trendState,
        wRsi: rsiW == null ? null : Math.round(rsiW),
        rangePos52w,
        roc13w,
      },
```

Note: `ema30`, `hi52`, `price`, `rsiW`, `round1` already exist in this scope — reuse them, do not recompute.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/etf.test.js`
Expected: PASS (all, including pre-existing 19).

- [ ] **Step 5: Commit**

```bash
git add src/lib/etf.js tests/etf.test.js
git commit -m "feat: trend state, wRSI, 52w range position, ROC13w on ETF signals (display-only)"
```

### Task 6: Render ETF indicators in the expanded row

**Files:**
- Modify: `src/lib/tooltipDefs.js` (three new TIPS entries)
- Modify: `src/lib/components/EtfDashboard.svelte` (expanded-row chips)

**Interfaces:**
- Consumes: `etf.sig.indicators` from Task 5; `TIPS.rsi` (existing).
- Produces: `TIPS.etfTrendState`, `TIPS.etfRangePos`, `TIPS.etfRoc13w`.

- [ ] **Step 1: Add tooltip definitions**

In `src/lib/tooltipDefs.js`, after the existing `etfSignal` entry (keep ETF defs together), add:

```js
  etfTrendState: {
    title: 'Trend State',
    subtitle: 'Weekly close vs EMA10 / EMA30',
    category: 'ETF · Context',
    description: 'Locates price against the two weekly EMAs to answer the entry score\'s key context question: is current weakness a dip in an uptrend, or a falling knife?',
    levels: [
      { range: 'UPTREND',   label: 'Healthy',   color: C.green, desc: 'Above both EMAs, fast above slow — weakness here is usually a buyable dip.' },
      { range: 'PULLBACK',  label: 'Dip zone',  color: C.amber, desc: 'Below EMA10 but holding EMA30 — the classic add-on-weakness spot.' },
      { range: 'BASING',    label: 'Undecided', color: C.dim,   desc: 'EMAs entangled — no established trend either way.' },
      { range: 'DOWNTREND', label: 'Knife',     color: C.red,   desc: 'Below both EMAs — high entry scores need extra confirmation (Turn).' },
    ],
    why: 'The same entry score means different things in different trends. Display-only — it does not feed the score.',
  },

  etfRangePos: {
    title: '52-Week Range Position',
    subtitle: '0% = at the low · 100% = at the high',
    category: 'ETF · Context',
    description: 'Where the proxy trades inside its 52-week range. Complements Drawdown, which only measures distance off the high.',
    levels: [
      { range: '< 25%',  label: 'Near lows',  color: C.amber, desc: 'Deep discount — check trend state before assuming it\'s cheap.' },
      { range: '25–75%', label: 'Mid range',  color: C.dim,   desc: 'No positional edge either way.' },
      { range: '> 75%',  label: 'Near highs', color: C.green, desc: 'Strength — breakouts start here, but so do exhaustion tops.' },
    ],
    why: 'Anchors the entry/exit scores to where price actually sits in its yearly journey.',
  },

  etfRoc13w: {
    title: 'Momentum (ROC 13w)',
    subtitle: '13-week rate of change',
    category: 'ETF · Momentum',
    description: 'Quarterly price momentum — the standard lens for a months-to-a-year holding horizon.',
    levels: [
      { range: '> +10%', label: 'Strong',   color: C.green, desc: 'Established quarterly momentum.' },
      { range: '0–10%',  label: 'Mild',     color: C.dim,   desc: 'Drifting up — no strong signal.' },
      { range: '< 0%',   label: 'Negative', color: C.red,   desc: 'Falling quarter — value-trap risk if buying only on "cheap".' },
    ],
    why: 'A high entry score with deeply negative quarterly momentum deserves patience; with recovering momentum it deserves attention.',
  },
```

- [ ] **Step 2: Render chips in EtfDashboard.svelte**

Add a helper to the `<script>` block (near `scoreColor`):

```js
  const trendColor = (t) => t === 'UPTREND' ? '#22c55e' : t === 'PULLBACK' ? '#f59e0b' : t === 'DOWNTREND' ? '#ef4444' : '#6b7280';
```

In the expanded row, inside `{#if etf.sig}` and **above** the existing `grid md:grid-cols-2` div, insert:

```svelte
                  {#if etf.sig.indicators}
                    {@const ind = etf.sig.indicators}
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs">
                      {#if ind.trendState}
                        <span class="px-1.5 py-0.5 rounded font-semibold text-[10px] cursor-default
                          {ind.trendState === 'UPTREND' ? 'bg-bull-strong/20 text-bull-strong'
                            : ind.trendState === 'PULLBACK' ? 'bg-uncertain/20 text-uncertain'
                            : ind.trendState === 'DOWNTREND' ? 'bg-bear-strong/20 text-bear-strong'
                            : 'bg-surface-600 text-text-secondary'}"
                          use:tipAction={() => ({ ...TIPS.etfTrendState, current: { value: ind.trendState, label: '', color: trendColor(ind.trendState) } })}
                        >{ind.trendState}</span>
                      {/if}
                      {#if ind.wRsi != null}
                        <span class="font-mono text-text-secondary cursor-default"
                          use:tipAction={() => ({ ...TIPS.rsi, title: 'Weekly RSI(14)', current: { value: String(ind.wRsi), label: ind.wRsi < 30 ? 'Oversold' : ind.wRsi > 70 ? 'Overbought' : 'Neutral', color: ind.wRsi < 30 ? '#22c55e' : ind.wRsi > 70 ? '#ef4444' : '#9ca3af' } })}
                        >wRSI {ind.wRsi}</span>
                      {/if}
                      {#if ind.rangePos52w != null}
                        <span class="flex items-center gap-1.5 cursor-default"
                          use:tipAction={() => ({ ...TIPS.etfRangePos, current: { value: `${ind.rangePos52w}%`, label: 'of 52w range', color: '#9ca3af' } })}
                        >
                          <span class="text-text-muted">52w</span>
                          <span class="relative w-16 h-1.5 rounded bg-surface-600 overflow-hidden">
                            <span class="absolute inset-y-0 left-0 rounded bg-text-secondary" style="width:{ind.rangePos52w}%"></span>
                          </span>
                          <span class="font-mono text-text-secondary">{ind.rangePos52w}%</span>
                        </span>
                      {/if}
                      {#if ind.roc13w != null}
                        <span class="font-mono cursor-default" style="color:{ind.roc13w > 0 ? '#22c55e' : '#ef4444'}"
                          use:tipAction={() => ({ ...TIPS.etfRoc13w, current: { value: `${ind.roc13w > 0 ? '+' : ''}${ind.roc13w}%`, label: '13-week change', color: ind.roc13w > 0 ? '#22c55e' : '#ef4444' } })}
                        >13w {ind.roc13w > 0 ? '+' : ''}{ind.roc13w}%</span>
                      {/if}
                    </div>
                  {/if}
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run build` → green.
Manual: `npm run dev` → ETFs view → expand a row → chip strip renders with working tooltips (and, post-PR-1, tooltips never clip).

- [ ] **Step 4: Commit**

```bash
git add src/lib/tooltipDefs.js src/lib/components/EtfDashboard.svelte
git commit -m "feat: trend/wRSI/52w-range/ROC13w chips in ETF expanded row"
```

### Task 7: README changelog + open PR 2

- [ ] **Step 1: Changelog entry**

In `README.md`, add at the top of the changelog section, following the existing entry format (create the `v0.17` heading if this is its first entry):

```
- Setup Radar shows weekly RSI (display-only); ETF expanded row gains trend state, weekly RSI, 52-week range position, and 13-week momentum — all computed from candles already fetched, none feed any score.
```

- [ ] **Step 2: Full verify, push, PR**

Run: `npm test && npm run build` → green.

```bash
git add README.md
git commit -m "docs: changelog for ETF indicators"
git push -u origin feat/etf-indicators
gh pr create --title "feat: Setup Radar wRSI + ETF decision indicators (display-only)" --body "$(cat <<'EOF'
Per spec docs/superpowers/specs/2026-07-10-etf-refinement-v017-design.md (items 2–3):

- computeSetupSignals now returns meta.wRsi (rounded weekly RSI); Setup Radar rows show it with a tooltip. Not part of either setup score.
- computeEtfSignals gains indicators { trendState, wRsi, rangePos52w, roc13w }; rendered as a chip strip in the ETF expanded row with new tooltip defs.
- Zero new API calls; no scoring engine touched. New unit tests in signals/radar/etf test files.
EOF
)"
```

- [ ] **Step 3: Merge when green, refresh main.**

---

# PR 3 — `feat/etf-thesis-highlights`

Setup: `git checkout main && git pull --ff-only origin main && git checkout -b feat/etf-thesis-highlights`

### Task 8: `generateEtfThesis`

**Files:**
- Modify: `src/lib/etf.js` (new exported function at the end)
- Test: `tests/etf.test.js`

**Interfaces:**
- Consumes: an `out[proxy]` signal object (`{ entry, exit, indicators }`) from Task 5.
- Produces: `generateEtfThesis(sig) → string | null`. Task 9 renders it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/etf.test.js` (add `generateEtfThesis` to the import at the top):

```js
describe('generateEtfThesis', () => {
  it('entry-led: names firing components, adds trend context and missing-turn caveat', () => {
    const sig = {
      entry: scoreEtfEntry({ ...ENTRY_MAX, macdCross: null, divergence: null }), // Turn = 0
      exit: scoreEtfExit({ rsiW: 28, extensionPct: -5, rs1m: 1, rs3m: -12, volumeRatio: 1 }),
      indicators: { trendState: 'DOWNTREND', wRsi: 28, rangePos52w: 5, roc13w: -12 },
    };
    const t = generateEtfThesis(sig);
    expect(t).toMatch(/^Entry case/);
    expect(t.toLowerCase()).toContain('oversold');
    expect(t).toContain('weekly downtrend');
    expect(t).toContain("MACD hasn't turned");
    expect(t).not.toContain('no turn yet'); // zero-scoring component detail omitted
  });

  it('exit-led: leads with the exit case', () => {
    const sig = {
      entry: scoreEtfEntry({ rsiW: 55, belowLowerBB: false, rs3m: 10, groupMedianRs3m: 2, macdCross: null, divergence: null, drawdownPct: 1 }),
      exit: scoreEtfExit(EXIT_MAX),
      indicators: { trendState: 'UPTREND', wRsi: 76, rangePos52w: 99, roc13w: 30 },
    };
    const t = generateEtfThesis(sig);
    expect(t).toMatch(/^Exit case/);
    expect(t.toLowerCase()).toContain('overbought');
  });

  it('quiet ETF: says nothing is firing', () => {
    const sig = {
      entry: scoreEtfEntry({ rsiW: 50, belowLowerBB: false, rs3m: 2, groupMedianRs3m: 1, macdCross: null, divergence: null, drawdownPct: 1 }),
      exit: scoreEtfExit({ rsiW: 50, extensionPct: 3, rs1m: 1, rs3m: 2, volumeRatio: 1 }),
      indicators: { trendState: 'BASING', wRsi: 50, rangePos52w: 50, roc13w: 1 },
    };
    expect(generateEtfThesis(sig)).toContain('No entry signals firing');
  });

  it('null-safe', () => {
    expect(generateEtfThesis(null)).toBeNull();
    expect(generateEtfThesis({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/etf.test.js -t "generateEtfThesis"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement at the end of `src/lib/etf.js`**

```js
// Plain-English explanation of the entry/exit picture — display-only,
// built strictly from component scores already computed above.
const TREND_PHRASE = {
  UPTREND: 'uptrend intact',
  PULLBACK: 'pulling back within an uptrend',
  BASING: 'basing — no established trend',
  DOWNTREND: 'in a weekly downtrend',
};

export function generateEtfThesis(sig) {
  if (!sig?.entry || !sig?.exit) return null;
  const { entry, exit } = sig;
  const ind = sig.indicators ?? {};
  const entryLed = entry.score >= exit.score;
  const lead = entryLed ? entry : exit;
  const firing = lead.components.filter(c => c.score > 0);

  let first;
  if (!firing.length) {
    first = entryLed
      ? 'No entry signals firing — nothing to buy into here yet.'
      : 'No exit signals firing — no exhaustion pressure visible.';
  } else {
    const parts = firing.map(c => `${c.label.toLowerCase()} (${c.detail})`).join(', ');
    first = `${entryLed ? 'Entry' : 'Exit'} case ${lead.score}/10 (${lead.readiness}): ${parts}.`;
  }

  const trendPhrase = TREND_PHRASE[ind.trendState] ?? null;
  let second = trendPhrase ? `Trend: ${trendPhrase}.` : '';
  if (entryLed && entry.score >= 3) {
    const turn = entry.components.find(c => c.label === 'Turn');
    if (turn && turn.score === 0) second += ` No reversal confirmation yet — MACD hasn't turned.`;
  }
  return second ? `${first} ${second}` : first;
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/etf.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/etf.js tests/etf.test.js
git commit -m "feat: generateEtfThesis — plain-English entry/exit explanation"
```

### Task 9: Render the thesis in the expanded row

**Files:**
- Modify: `src/lib/components/EtfDashboard.svelte`

- [ ] **Step 1: Import and render**

Add `generateEtfThesis` to the etf.js import:

```js
  import { computeEtfSignals, generateEtfThesis } from '../etf.js';
```

Inside the expanded row's `{#if etf.sig}`, directly above the indicator chip strip from Task 6, insert:

```svelte
                  {@const thesis = generateEtfThesis(etf.sig)}
                  {#if thesis}
                    <p class="text-xs text-text-secondary leading-relaxed mb-3 max-w-3xl">{thesis}</p>
                  {/if}
```

- [ ] **Step 2: Verify + commit**

Run: `npm test && npm run build` → green. Manual: expand an ETF row → thesis sentence renders above the chips.

```bash
git add src/lib/components/EtfDashboard.svelte
git commit -m "feat: ETF thesis sentence in expanded row"
```

### Task 10: Highlights + notification diff logic (pure)

**Files:**
- Create: `src/lib/highlights.js`
- Test: `tests/highlights.test.js` (new)

**Interfaces:**
- Consumes: `computeRadar()` hits (`{ symbol, setupType, setupScore, readiness }`), `computeDipRadar()` hits (`{ symbol, score, readiness }`), etf rows (`[{ ucits, sig }]`).
- Produces:
  - `computeHighlights({ radarHits, dipHits, etfRows }) → [{ kind: 'setup'|'dip'|'etf-entry'|'etf-exit', symbol, view: 'stocks'|'etfs', score, readiness, label }]` — ACT/SOON only, ACT first then score desc.
  - `computeNotifications(prevKeys: string[], items) → { newItems, keys }` — key format `kind:symbol:readiness`; new = first appearance or readiness upgrade.

- [ ] **Step 1: Create `src/lib/highlights.js`**

```js
// Cross-view digest + notification diffing — pure functions, display-only.
// Consumes hits already computed by radar.js / dip.js / etf.js; no API calls.

const READINESS_RANK = { SOON: 1, ACT: 2 };

// radarHits: computeRadar() output · dipHits: computeDipRadar() output
// etfRows: [{ ucits, sig }] — etflist store rows joined with computeEtfSignals
export function computeHighlights({ radarHits = [], dipHits = [], etfRows = [] }) {
  const items = [];

  for (const h of radarHits) {
    if (READINESS_RANK[h.readiness]) {
      items.push({ kind: 'setup', symbol: h.symbol, view: 'stocks',
        score: h.setupScore, readiness: h.readiness,
        label: `${h.symbol} ${h.setupType.toLowerCase()} setup ${h.setupScore.toFixed(1)}` });
    }
  }
  for (const h of dipHits) {
    if (READINESS_RANK[h.readiness]) {
      items.push({ kind: 'dip', symbol: h.symbol, view: 'stocks',
        score: h.score, readiness: h.readiness,
        label: `${h.symbol} dip ${h.score.toFixed(1)}` });
    }
  }
  for (const row of etfRows) {
    const sig = row.sig;
    if (!sig) continue;
    if (READINESS_RANK[sig.entry.readiness]) {
      items.push({ kind: 'etf-entry', symbol: row.ucits, view: 'etfs',
        score: sig.entry.score, readiness: sig.entry.readiness,
        label: `${row.ucits} entry ${sig.entry.score.toFixed(1)}` });
    }
    if (READINESS_RANK[sig.exit.readiness]) {
      items.push({ kind: 'etf-exit', symbol: row.ucits, view: 'etfs',
        score: sig.exit.score, readiness: sig.exit.readiness,
        label: `${row.ucits} exit ${sig.exit.score.toFixed(1)}` });
    }
  }

  items.sort((a, b) =>
    (READINESS_RANK[b.readiness] - READINESS_RANK[a.readiness]) || (b.score - a.score));
  return items;
}

// prevKeys: "kind:symbol:readiness" strings persisted from the previous refresh.
// New = first appearance or readiness upgrade; repeats and downgrades stay silent.
export function computeNotifications(prevKeys, items) {
  const prev = new Map();
  for (const k of prevKeys ?? []) {
    const [kind, symbol, readiness] = k.split(':');
    const id = `${kind}:${symbol}`;
    prev.set(id, Math.max(prev.get(id) ?? 0, READINESS_RANK[readiness] ?? 0));
  }
  const newItems = items.filter(it =>
    (READINESS_RANK[it.readiness] ?? 0) > (prev.get(`${it.kind}:${it.symbol}`) ?? 0));
  const keys = items.map(it => `${it.kind}:${it.symbol}:${it.readiness}`);
  return { newItems, keys };
}
```

- [ ] **Step 2: Write tests `tests/highlights.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { computeHighlights, computeNotifications } from '../src/lib/highlights.js';

const etfRow = (ucits, entryScore, entryReadiness, exitScore = 0, exitReadiness = 'WAIT') => ({
  ucits,
  sig: {
    entry: { score: entryScore, readiness: entryReadiness, components: [] },
    exit: { score: exitScore, readiness: exitReadiness, components: [] },
  },
});

describe('computeHighlights', () => {
  it('collects ACT/SOON from all three sources, ACT first then score desc', () => {
    const items = computeHighlights({
      radarHits: [{ symbol: 'NVDA', setupType: 'PULLBACK', setupScore: 6.2, readiness: 'SOON' }],
      dipHits: [{ symbol: 'AAPL', score: 7.5, readiness: 'ACT' }],
      etfRows: [etfRow('CSPX', 7.8, 'ACT'), etfRow('CNDX', 5.1, 'SOON')],
    });
    expect(items.map(i => i.symbol)).toEqual(['CSPX', 'AAPL', 'NVDA', 'CNDX']);
    expect(items[0]).toMatchObject({ kind: 'etf-entry', view: 'etfs', readiness: 'ACT' });
  });

  it('excludes WATCH/WAIT and null sigs', () => {
    const items = computeHighlights({
      radarHits: [{ symbol: 'MSFT', setupType: 'MOMENTUM', setupScore: 4, readiness: 'WATCH' }],
      dipHits: [],
      etfRows: [{ ucits: 'VUAA', sig: null }, etfRow('EQQQ', 2, 'WAIT')],
    });
    expect(items).toEqual([]);
  });

  it('an ETF can appear for both entry and exit', () => {
    const items = computeHighlights({ etfRows: [etfRow('SMGB', 5.5, 'SOON', 7.2, 'ACT')] });
    expect(items.map(i => i.kind)).toEqual(['etf-exit', 'etf-entry']);
  });
});

describe('computeNotifications', () => {
  const soon = { kind: 'dip', symbol: 'AAPL', view: 'stocks', score: 5.5, readiness: 'SOON', label: 'AAPL dip 5.5' };
  const act = { ...soon, score: 7.1, readiness: 'ACT', label: 'AAPL dip 7.1' };

  it('first appearance notifies', () => {
    const { newItems, keys } = computeNotifications([], [soon]);
    expect(newItems).toHaveLength(1);
    expect(keys).toEqual(['dip:AAPL:SOON']);
  });

  it('repeat stays silent', () => {
    expect(computeNotifications(['dip:AAPL:SOON'], [soon]).newItems).toHaveLength(0);
  });

  it('upgrade SOON→ACT notifies; downgrade ACT→SOON stays silent', () => {
    expect(computeNotifications(['dip:AAPL:SOON'], [act]).newItems).toHaveLength(1);
    expect(computeNotifications(['dip:AAPL:ACT'], [soon]).newItems).toHaveLength(0);
  });

  it('handles null prevKeys', () => {
    expect(computeNotifications(null, [soon]).newItems).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/highlights.test.js`
Expected: PASS (write the module first per Step 1; if you prefer strict TDD, swap Steps 1–2).

- [ ] **Step 4: Commit**

```bash
git add src/lib/highlights.js tests/highlights.test.js
git commit -m "feat: highlights digest + notification diff logic (pure)"
```

### Task 11: HighlightsStrip component + App wiring

**Files:**
- Create: `src/lib/components/HighlightsStrip.svelte`
- Modify: `src/lib/stores/etflist.svelte.js` (expand-request handshake)
- Modify: `src/lib/components/EtfDashboard.svelte` (consume expand request)
- Modify: `src/App.svelte` (render strip, navigation callback)

**Interfaces:**
- Consumes: Task 10 functions; existing store getters; `computeRadar`/`computeDipRadar`/`computeEtfSignals`.
- Produces: `<HighlightsStrip marketData onNavigate />`; store functions `requestEtfExpand(ucits)`, `getEtfExpandRequest()`, `clearEtfExpandRequest()`.

- [ ] **Step 1: Expand-request handshake in `etflist.svelte.js`**

Append:

```js
// One-shot expand request from outside the ETF view (e.g. highlights strip).
let expandRequest = $state(null);
export function requestEtfExpand(ucits) { expandRequest = ucits; }
export function getEtfExpandRequest() { return expandRequest; }
export function clearEtfExpandRequest() { expandRequest = null; }
```

- [ ] **Step 2: Consume it in `EtfDashboard.svelte`**

Extend the store import with `getEtfExpandRequest, clearEtfExpandRequest`, then add to the `<script>`:

```js
  $effect(() => {
    const req = getEtfExpandRequest();
    if (req) { expanded = req; clearEtfExpandRequest(); }
  });
```

- [ ] **Step 3: Create `src/lib/components/HighlightsStrip.svelte`**

```svelte
<script>
  import { getTickers, getTickerData } from '../stores/watchlist.svelte.js';
  import { getEtfs, getEtfProxyData, getEtfSpyCloses, getUniqueProxies } from '../stores/etflist.svelte.js';
  import { computeRadar } from '../radar.js';
  import { computeDipRadar } from '../dip.js';
  import { computeEtfSignals } from '../etf.js';
  import { computeHighlights, computeNotifications } from '../highlights.js';

  let { marketData = null, onNavigate } = $props();

  const items = $derived.by(() => {
    const stockList = getTickers().map(t => ({ symbol: t.symbol, data: getTickerData(t.symbol) }));
    const proxyList = getUniqueProxies()
      .map(proxy => ({ proxy, ...(getEtfProxyData(proxy) ?? {}) }))
      .filter(p => p.weeklyRaw && p.dailyCloses);
    const signals = computeEtfSignals(proxyList, getEtfSpyCloses());
    return computeHighlights({
      radarHits: computeRadar(stockList),
      dipHits: computeDipRadar(stockList, marketData),
      etfRows: getEtfs().map(e => ({ ucits: e.ucits, sig: signals[e.proxy] ?? null })),
    });
  });

  // Opt-in browser notifications for newly arrived ACT/SOON items.
  // Diff/dedupe is pure (highlights.js); this effect is the thin Notification wrapper.
  $effect(() => {
    const current = items;
    if (typeof Notification === 'undefined') return;
    if (localStorage.getItem('notifyEnabled') !== 'true') return;
    if (Notification.permission !== 'granted') return;
    let prevKeys = [];
    try { prevKeys = JSON.parse(localStorage.getItem('notifySeen') || '[]'); } catch { /* noop */ }
    const { newItems, keys } = computeNotifications(prevKeys, current);
    for (const it of newItems.slice(0, 5)) {
      new Notification(`${it.readiness}: ${it.label}`, { body: 'Stock Analysis Dashboard' });
    }
    try { localStorage.setItem('notifySeen', JSON.stringify(keys)); } catch { /* noop */ }
  });

  function chipClass(it) {
    if (it.kind === 'etf-exit') return 'border-bear-strong/40 bg-bear-strong/10 text-bear-strong hover:bg-bear-strong/20';
    if (it.readiness === 'ACT') return 'border-bull-strong/40 bg-bull-strong/10 text-bull-strong hover:bg-bull-strong/20';
    return 'border-uncertain/40 bg-uncertain/10 text-uncertain hover:bg-uncertain/20';
  }
</script>

{#if items.length}
  <div class="mb-4 flex flex-wrap items-center gap-1.5">
    <span class="text-[10px] uppercase tracking-wider text-text-muted mr-1">Today</span>
    {#each items as it (it.kind + ':' + it.symbol)}
      <button
        class="text-[11px] px-2 py-1 rounded-md border transition-colors {chipClass(it)}"
        onclick={() => onNavigate?.(it)}
      >{it.label} · {it.readiness}</button>
    {/each}
  </div>
{/if}
```

- [ ] **Step 4: Wire into `App.svelte`**

Add imports (the watchlist store import already exists — extend it with `selectTicker` if not imported; add the two new ones):

```js
  import HighlightsStrip from './lib/components/HighlightsStrip.svelte';
  import { requestEtfExpand } from './lib/stores/etflist.svelte.js'; // extend existing etflist import instead if one exists
```

Add the navigation handler in the script:

```js
  function handleHighlightNav(item) {
    activeView = item.view;
    if (item.view === 'stocks') selectTicker(item.symbol);
    else requestEtfExpand(item.symbol);
  }
```

Render at the top of `<main>`, before the `{#if activeView === 'stocks'}` block:

```svelte
    <HighlightsStrip marketData={marketContextData} onNavigate={handleHighlightNav} />
```

Note: App.svelte already imports from both stores — merge into the existing import lines rather than duplicating them. `selectTicker` is exported by `watchlist.svelte.js` (SetupRadar already uses it).

- [ ] **Step 5: Verify + commit**

Run: `npm test && npm run build` → green.
Manual: strip appears above both views when any ACT/SOON exists; clicking an ETF chip switches to ETFs view with the row expanded; clicking a stock chip switches to stocks and opens the ticker.

```bash
git add src/lib/components/HighlightsStrip.svelte src/lib/stores/etflist.svelte.js src/lib/components/EtfDashboard.svelte src/App.svelte
git commit -m "feat: cross-view highlights strip with click-through navigation"
```

### Task 12: Notification opt-in toggle in Settings

**Files:**
- Modify: `src/lib/components/SettingsPanel.svelte`

- [ ] **Step 1: Add state + handler** (follow the `autoRefreshInterval` localStorage pattern at line ~49):

```js
  let notifyEnabled = $state(localStorage.getItem('notifyEnabled') === 'true');
  async function toggleNotify() {
    if (!notifyEnabled) {
      if (typeof Notification === 'undefined') return;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    notifyEnabled = !notifyEnabled;
    localStorage.setItem('notifyEnabled', String(notifyEnabled));
  }
```

- [ ] **Step 2: Add the control** — place directly after the auto-refresh interval setting block, matching its surrounding container classes:

```svelte
  <div class="flex items-center justify-between gap-4">
    <div>
      <p class="text-sm text-text-primary">Browser notifications</p>
      <p class="text-xs text-text-muted">New ACT/SOON signals after a refresh — fires only while a dashboard tab is open.</p>
    </div>
    <button
      class="text-xs px-3 py-1.5 rounded-lg shrink-0 {notifyEnabled ? 'bg-bull-strong/20 text-bull-strong' : 'bg-surface-600 text-text-secondary'}"
      onclick={toggleNotify}
    >{notifyEnabled ? 'On' : 'Off'}</button>
  </div>
```

- [ ] **Step 3: Verify + commit**

Run: `npm test && npm run build` → green.
Manual: toggle On → browser permission prompt appears; deny → stays Off; grant → shows On and persists across reload.

```bash
git add src/lib/components/SettingsPanel.svelte
git commit -m "feat: opt-in browser-notification toggle in settings"
```

### Task 13: README changelog + open PR 3

- [ ] **Step 1:** Add changelog line under the v0.17 heading:

```
- ETF thesis sentences, cross-view "Today" highlights strip (ACT/SOON digest with click-through), and opt-in in-browser notifications for newly arrived signals.
```

- [ ] **Step 2: Verify, push, PR**

```bash
npm test && npm run build
git add README.md
git commit -m "docs: changelog for thesis + highlights + notifications"
git push -u origin feat/etf-thesis-highlights
gh pr create --title "feat: ETF thesis, highlights strip, in-browser notifications" --body "$(cat <<'EOF'
Per spec docs/superpowers/specs/2026-07-10-etf-refinement-v017-design.md (items 4–5):

- generateEtfThesis(): 1–2 plain-English sentences per ETF from the already-computed entry/exit components + trend state; shown in the expanded row.
- HighlightsStrip: cross-view ACT/SOON digest (setups, dips, ETF entry/exit) above both views; chips navigate and expand the target.
- Opt-in Web Notifications (Settings toggle, permission requested on enable): fired per newly-arrived or readiness-upgraded item; diff/dedupe is a pure tested helper (computeNotifications) persisted in localStorage notifySeen, deliberately reusable by a future push channel.
- Zero new API calls; display-only.
EOF
)"
```

- [ ] **Step 3: Merge when green, refresh main.**

---

# PR 4 — `feat/etf-catalog-search`

Setup: `git checkout main && git pull --ff-only origin main && git checkout -b feat/etf-catalog-search`

### Task 14: Catalog data + search function

**Files:**
- Create: `src/lib/etfCatalog.js`
- Test: `tests/etfCatalog.test.js` (new)

**Interfaces:**
- Produces: `ETF_CATALOG` (array of `{ ucits, name, ter, category, proxy }`) and `searchCatalog(query, existingUcits) → [{ ...entry, added: boolean }]` (max 12 results). Task 15 consumes both. Entries deliberately omit ISIN (`addEtf` defaults it to `''`) — curated tickers/proxies, TERs approximate; the catalog is a starting set the user can extend via manual add.

- [ ] **Step 1: Create `src/lib/etfCatalog.js`**

```js
// Curated UCITS ETF catalog for one-click add — Ireland/EU-domiciled funds,
// each pre-mapped to a US-listed proxy tracking the same (or nearest) index.
// Display metadata only; TERs approximate. Proxy mapping is the load-bearing field.
export const ETF_CATALOG = [
  // Global
  { ucits: 'VWCE', name: 'Vanguard FTSE All-World (Acc)', ter: '0.22%', category: 'Global', proxy: 'VT' },
  { ucits: 'FWRA', name: 'Invesco FTSE All-World (Acc)', ter: '0.15%', category: 'Global', proxy: 'VT' },
  { ucits: 'SSAC', name: 'iShares MSCI ACWI (Acc)', ter: '0.20%', category: 'Global', proxy: 'ACWI' },
  { ucits: 'IWDA', name: 'iShares Core MSCI World (Acc)', ter: '0.20%', category: 'Global Dev', proxy: 'URTH' },
  { ucits: 'SWRD', name: 'SPDR MSCI World (Acc)', ter: '0.12%', category: 'Global Dev', proxy: 'URTH' },
  { ucits: 'XDWD', name: 'Xtrackers MSCI World (Acc)', ter: '0.19%', category: 'Global Dev', proxy: 'URTH' },
  { ucits: 'VHVG', name: 'Vanguard FTSE Developed World (Acc)', ter: '0.12%', category: 'Global Dev', proxy: 'VEA' },
  { ucits: 'WSML', name: 'iShares MSCI World Small Cap (Acc)', ter: '0.35%', category: 'Global Small Cap', proxy: 'IWM' },
  // Factors
  { ucits: 'IWMO', name: 'iShares Edge MSCI World Momentum (Acc)', ter: '0.30%', category: 'Momentum Factor', proxy: 'MTUM' },
  { ucits: 'IWQU', name: 'iShares Edge MSCI World Quality (Acc)', ter: '0.30%', category: 'Quality Factor', proxy: 'QUAL' },
  { ucits: 'IWVL', name: 'iShares Edge MSCI World Value (Acc)', ter: '0.30%', category: 'Value Factor', proxy: 'VLUE' },
  { ucits: 'MVOL', name: 'iShares Edge MSCI World Min Vol (Acc)', ter: '0.30%', category: 'Low Volatility', proxy: 'USMV' },
  // US
  { ucits: 'CSPX', name: 'iShares Core S&P 500 (Acc)', ter: '0.07%', category: 'Core US', proxy: 'SPY' },
  { ucits: 'VUAA', name: 'Vanguard S&P 500 (Acc)', ter: '0.07%', category: 'Core US', proxy: 'SPY' },
  { ucits: 'XDEW', name: 'Xtrackers S&P 500 Equal Weight (Acc)', ter: '0.20%', category: 'US Equal Weight', proxy: 'RSP' },
  { ucits: 'VNRT', name: 'Vanguard FTSE North America (Acc)', ter: '0.10%', category: 'North America', proxy: 'VTI' },
  { ucits: 'CNDX', name: 'iShares Nasdaq 100 (Acc)', ter: '0.33%', category: 'Tech', proxy: 'QQQ' },
  { ucits: 'EQAC', name: 'Invesco EQQQ Nasdaq-100 (Acc)', ter: '0.30%', category: 'Tech', proxy: 'QQQ' },
  { ucits: 'XNAS', name: 'Xtrackers Nasdaq 100 (Acc)', ter: '0.20%', category: 'Tech', proxy: 'QQQ' },
  // Regions
  { ucits: 'EIMI', name: 'iShares Core MSCI EM IMI (Acc)', ter: '0.18%', category: 'Emerging Markets', proxy: 'EEM' },
  { ucits: 'VFEG', name: 'Vanguard FTSE Emerging Markets (Acc)', ter: '0.22%', category: 'Emerging Markets', proxy: 'VWO' },
  { ucits: 'MEUD', name: 'Amundi Stoxx Europe 600 (Acc)', ter: '0.07%', category: 'Europe', proxy: 'VGK' },
  { ucits: 'SMEA', name: 'iShares Core MSCI Europe (Acc)', ter: '0.12%', category: 'Europe', proxy: 'IEUR' },
  { ucits: 'CSX5', name: 'iShares Core EURO STOXX 50 (Acc)', ter: '0.10%', category: 'Eurozone', proxy: 'FEZ' },
  { ucits: 'CUKX', name: 'iShares Core FTSE 100 (Acc)', ter: '0.07%', category: 'UK', proxy: 'EWU' },
  { ucits: 'SJPA', name: 'iShares Core MSCI Japan IMI (Acc)', ter: '0.12%', category: 'Japan', proxy: 'EWJ' },
  { ucits: 'NDIA', name: 'iShares MSCI India (Acc)', ter: '0.65%', category: 'India', proxy: 'INDA' },
  { ucits: 'FLXI', name: 'Franklin FTSE India (Acc)', ter: '0.19%', category: 'India', proxy: 'FLIN' },
  // US sectors
  { ucits: 'IITU', name: 'iShares S&P 500 Information Technology', ter: '0.15%', category: 'Tech Sector', proxy: 'XLK' },
  { ucits: 'IUFS', name: 'iShares S&P 500 Financials', ter: '0.15%', category: 'Financials', proxy: 'XLF' },
  { ucits: 'IUHC', name: 'iShares S&P 500 Health Care', ter: '0.15%', category: 'Healthcare', proxy: 'XLV' },
  { ucits: 'IUES', name: 'iShares S&P 500 Energy', ter: '0.15%', category: 'Energy', proxy: 'XLE' },
  { ucits: 'IUCD', name: 'iShares S&P 500 Consumer Discretionary', ter: '0.15%', category: 'Consumer Disc.', proxy: 'XLY' },
  { ucits: 'IUCS', name: 'iShares S&P 500 Consumer Staples', ter: '0.15%', category: 'Consumer Staples', proxy: 'XLP' },
  { ucits: 'XDWH', name: 'Xtrackers MSCI World Health Care (Acc)', ter: '0.25%', category: 'Healthcare', proxy: 'IXJ' },
  { ucits: 'XDWT', name: 'Xtrackers MSCI World Information Tech (Acc)', ter: '0.25%', category: 'Tech Sector', proxy: 'IXN' },
  // Thematic
  { ucits: 'SMGB', name: 'VanEck Semiconductor (Acc)', ter: '0.35%', category: 'Semis', proxy: 'SMH' },
  { ucits: 'AIAI', name: 'L&G Artificial Intelligence', ter: '0.49%', category: 'AI thematic', proxy: 'THNQ' },
  { ucits: 'XAIX', name: 'Xtrackers AI & Big Data (Acc)', ter: '0.35%', category: 'AI thematic', proxy: 'AIQ' },
  { ucits: 'RBOT', name: 'iShares Automation & Robotics (Acc)', ter: '0.40%', category: 'AI/Robotics', proxy: 'BOTZ' },
  { ucits: 'AIRO', name: 'Global X Robotics & AI', ter: '0.50%', category: 'AI/Robotics', proxy: 'BOTZ' },
  { ucits: 'ISPY', name: 'L&G Cyber Security', ter: '0.69%', category: 'Cybersecurity', proxy: 'HACK' },
  { ucits: 'LOCK', name: 'iShares Digital Security (Acc)', ter: '0.40%', category: 'Cybersecurity', proxy: 'CIBR' },
  { ucits: 'WCLD', name: 'WisdomTree Cloud Computing (Acc)', ter: '0.40%', category: 'Cloud', proxy: 'WCLD' },
  { ucits: 'BTEC', name: 'iShares Nasdaq US Biotechnology (Acc)', ter: '0.35%', category: 'Biotech', proxy: 'IBB' },
  { ucits: 'ECAR', name: 'iShares Electric Vehicles & Driving Tech (Acc)', ter: '0.40%', category: 'EV/Mobility', proxy: 'DRIV' },
  { ucits: 'INRG', name: 'iShares Global Clean Energy', ter: '0.65%', category: 'Clean Energy', proxy: 'ICLN' },
  { ucits: 'URNU', name: 'Global X Uranium (Acc)', ter: '0.65%', category: 'Uranium', proxy: 'URA' },
  { ucits: 'NUCL', name: 'VanEck Uranium & Nuclear (Acc)', ter: '0.55%', category: 'Nuclear', proxy: 'NLR' },
  { ucits: 'NATO', name: 'HANetf Future of Defence (Acc)', ter: '0.69%', category: 'Defense', proxy: 'ITA' },
  { ucits: 'DFNS', name: 'VanEck Defense (Acc)', ter: '0.55%', category: 'Defense', proxy: 'PPA' },
  { ucits: 'ESPO', name: 'VanEck Video Gaming & eSports (Acc)', ter: '0.55%', category: 'Gaming', proxy: 'ESPO' },
  { ucits: 'GDX',  name: 'VanEck Gold Miners', ter: '0.53%', category: 'Gold Miners', proxy: 'GDX' },
  { ucits: 'IH2O', name: 'iShares Global Water (Acc)', ter: '0.65%', category: 'Water', proxy: 'CGW' },
  { ucits: 'INFR', name: 'iShares Global Infrastructure', ter: '0.65%', category: 'Infrastructure', proxy: 'IGF' },
];

// Case-insensitive substring match on ticker, name, or category.
export function searchCatalog(query, existingUcits = []) {
  const q = query?.trim().toLowerCase();
  if (!q) return [];
  const existing = new Set(existingUcits.map(u => u.toUpperCase()));
  return ETF_CATALOG
    .filter(e =>
      e.ucits.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q))
    .map(e => ({ ...e, added: existing.has(e.ucits) }))
    .slice(0, 12);
}
```

- [ ] **Step 2: Write tests `tests/etfCatalog.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { ETF_CATALOG, searchCatalog } from '../src/lib/etfCatalog.js';

describe('ETF_CATALOG sanity', () => {
  it('every entry has ucits, name, category, and a proxy', () => {
    for (const e of ETF_CATALOG) {
      expect(e.ucits).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.category).toBeTruthy();
      expect(e.proxy).toBeTruthy();
    }
  });

  it('has no duplicate UCITS tickers', () => {
    const tickers = ETF_CATALOG.map(e => e.ucits);
    expect(new Set(tickers).size).toBe(tickers.length);
  });
});

describe('searchCatalog', () => {
  it('matches ticker case-insensitively', () => {
    expect(searchCatalog('vwce').map(r => r.ucits)).toContain('VWCE');
  });

  it('matches on name and category', () => {
    expect(searchCatalog('world').length).toBeGreaterThan(2);
    expect(searchCatalog('defense').map(r => r.ucits)).toEqual(expect.arrayContaining(['NATO', 'DFNS']));
  });

  it('empty or whitespace query returns nothing', () => {
    expect(searchCatalog('')).toEqual([]);
    expect(searchCatalog('   ')).toEqual([]);
  });

  it('flags already-added ETFs and caps at 12 results', () => {
    const res = searchCatalog('iwda', ['IWDA']);
    expect(res[0].added).toBe(true);
    expect(searchCatalog('i').length).toBeLessThanOrEqual(12);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/etfCatalog.test.js`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/etfCatalog.js tests/etfCatalog.test.js
git commit -m "feat: curated UCITS ETF catalog with client-side search"
```

### Task 15: Search UI in the ETF add bar

**Files:**
- Modify: `src/lib/components/EtfDashboard.svelte` (add panel)

- [ ] **Step 1: Wire the search into the add panel**

Add to the imports/`<script>`:

```js
  import { searchCatalog } from '../etfCatalog.js';

  let catalogQuery = $state('');
  const catalogResults = $derived(searchCatalog(catalogQuery, getEtfs().map(e => e.ucits)));

  function addFromCatalog(entry) {
    if (addEtf(entry)) {
      catalogQuery = '';
      showAdd = false;
    }
  }
```

Inside the `{#if showAdd}` panel, insert **above** the existing manual-input row:

```svelte
      <div class="mb-2">
        <input
          class="w-full bg-surface-700 rounded-lg px-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none"
          placeholder="Search catalog — name, ticker, or theme (e.g. 'world', 'defense', 'semis')…"
          bind:value={catalogQuery}
        />
        {#if catalogResults.length}
          <div class="mt-1.5 space-y-0.5 max-h-56 overflow-y-auto">
            {#each catalogResults as r (r.ucits)}
              <button
                class="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded hover:bg-surface-700/40 disabled:opacity-40 disabled:cursor-default"
                disabled={r.added}
                onclick={() => addFromCatalog(r)}
              >
                <span class="min-w-0 truncate">
                  <span class="font-mono font-semibold text-xs text-text-primary">{r.ucits}</span>
                  <span class="text-xs text-text-muted ml-1.5">{r.name}</span>
                </span>
                <span class="text-[10px] text-text-muted shrink-0">{r.category} · proxy {r.proxy}{r.added ? ' · added' : ''}</span>
              </button>
            {/each}
          </div>
        {:else if catalogQuery.trim()}
          <p class="text-xs text-text-muted mt-1.5">Not in catalog — add manually below with its US proxy.</p>
        {/if}
      </div>
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run build` → green.
Manual: `+ Add` → type "world" → dropdown lists global funds; click one → added to table (signals appear after next Refresh, when its proxy candles are fetched — existing behavior); already-added entries appear disabled with "· added"; typing an uncatalogued ticker shows the manual-add hint.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/EtfDashboard.svelte
git commit -m "feat: catalog search in ETF add bar"
```

### Task 16: Version bump, docs, open PR 4

- [ ] **Step 1: README** — add the changelog line under v0.17 and bump the README version header to **v0.17**:

```
- Searchable curated UCITS catalog (~55 funds pre-mapped to US proxies) in the ETF add bar — one-click add, manual entry stays as fallback.
```

- [ ] **Step 2: CLAUDE.md** — update the Project State header to v0.17; add `etfCatalog.js` and `highlights.js` + `HighlightsStrip.svelte` to the key-files tree; update the test-count line (`tests/` additions: highlights, etfCatalog, plus new cases in signals/radar/etf — state the new `npm test` total from the actual run output).

- [ ] **Step 3: Verify, push, PR**

```bash
npm test && npm run build
git add README.md CLAUDE.md
git commit -m "docs: v0.17 version bump + architecture notes"
git push -u origin feat/etf-catalog-search
gh pr create --title "feat: UCITS catalog search in ETF add bar" --body "$(cat <<'EOF'
Per spec docs/superpowers/specs/2026-07-10-etf-refinement-v017-design.md (item 6):

- ~55-entry curated UCITS catalog (etfCatalog.js), each pre-mapped to a US proxy at authoring time — search never asks the user to pick a proxy.
- Client-side substring search (ticker/name/theme) in the ETF add bar, one-click add, already-added entries disabled, manual add kept as fallback for uncatalogued funds.
- Zero API calls. Closes out the v0.17 round; bumps version.
EOF
)"
```

- [ ] **Step 4: Merge when green.** v0.17 complete.

---

## Self-review (done at plan-writing time)

- **Spec coverage:** item 1 → Task 1; item 2 → Tasks 3–4; item 3 → Tasks 5–6; item 4 → Tasks 8–9; item 5 → Tasks 10–12; item 6 → Tasks 14–15. Ship steps (README/CLAUDE.md) → Tasks 7, 13, 16. No gaps.
- **Type consistency:** `meta.wRsi` (Task 3) consumed as `data.setups.meta.wRsi` (Task 4); `indicators` shape (Task 5) matches Task 6 chips and Task 8 `TREND_PHRASE` keys; `computeHighlights` item shape matches `HighlightsStrip` usage and `computeNotifications` keys; `searchCatalog` result shape (`added`) matches Task 15 UI; `requestEtfExpand`/`getEtfExpandRequest`/`clearEtfExpandRequest` names match across Tasks 11 steps 1/2/4.
- **Catalog accuracy caveat (known):** tickers/proxies curated from general knowledge; TERs approximate; ISINs deliberately omitted. Display metadata only — flagged in the file header comment.

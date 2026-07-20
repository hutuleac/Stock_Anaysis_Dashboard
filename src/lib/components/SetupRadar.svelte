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
  const accumulation = $derived(hits.filter(h => h.category === 'ACCUMULATION'));
  const breakout = $derived(hits.filter(h => h.category === 'BREAKOUT'));

  function readinessColor(r) {
    if (r === 'ACT')  return 'bg-bull-strong/20 text-bull-strong';
    if (r === 'SOON') return 'bg-uncertain/20 text-uncertain';
    return 'bg-surface-600 text-text-secondary'; // WATCH
  }
  function readinessCssColor(r) {
    if (r === 'ACT')  return '#22c55e';
    if (r === 'SOON') return '#f59e0b';
    return '#6b7280';
  }
  const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  const fmtRs = (v) => (v == null ? '—' : fmtPct(v)); // laggards in Accumulation may have null/negative RS
  const rsCssColor = (v) => (v == null ? '#6b7280' : v > 5 ? '#22c55e' : v > 0 ? '#86efac' : '#ef4444');
  const fmtPeg = (v) => (v === null ? '—' : `${v.toFixed(2)}x`);
  const scoreColor = (s) => s >= 7 ? '#22c55e' : s >= 4.5 ? '#f59e0b' : '#6b7280';
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
        {#snippet row(h)}
              <button
                class="w-full flex items-center gap-3 hover:bg-surface-700/40 rounded px-1.5 py-1.5 transition-colors text-left overflow-x-auto"
                onclick={() => selectTicker(h.symbol)}
              >
                <span class="font-mono font-semibold text-sm text-text-primary w-16 shrink-0">{h.symbol}</span>

                <!-- Setup type + score -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded bg-surface-600 text-text-secondary w-24 shrink-0 text-center cursor-default"
                  use:tipAction={() => ({
                    ...(h.setupType === 'PULLBACK' ? TIPS.setupPullback : TIPS.setupMomentum),
                    current: { value: `${h.setupScore.toFixed(1)}/10`, label: h.setupType, color: scoreColor(h.setupScore) },
                  })}
                >{h.setupType} <span style="color:{scoreColor(h.setupScore)}">{h.setupScore.toFixed(1)}</span></span>

                <!-- Readiness -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded {readinessColor(h.readiness)} w-14 shrink-0 text-center cursor-default"
                  use:tipAction={() => ({
                    ...TIPS.radarReadiness,
                    current: { value: h.readiness, label: h.etaWeeks != null ? `~${h.etaWeeks}w to full setup` : '', color: readinessCssColor(h.readiness) },
                  })}
                >{h.readiness}</span>

                <!-- Eta weeks -->
                <span
                  class="text-[10px] text-text-muted w-12 shrink-0 cursor-default"
                  use:tipAction={() => ({
                    ...TIPS.radarReadiness,
                    current: { value: h.etaWeeks != null ? `~${h.etaWeeks}w` : '—', label: 'estimated weeks to full setup', color: '#9ca3af' },
                  })}
                >{h.etaWeeks != null ? `~${h.etaWeeks}w` : ''}</span>

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

                <!-- RS rank -->
                <span
                  class="text-xs text-text-secondary w-16 shrink-0 cursor-default"
                  use:tipAction={() => ({
                    ...TIPS.radarRsRank,
                    current: {
                      value: h.rsRank != null ? `#${h.rsRank} of ${h.rsTotal}` : 'unranked',
                      label: h.rsRank == null ? 'No RS data' : h.rsRank <= 3 ? 'Top tier' : h.rsRank <= 7 ? 'Mid tier' : 'Lower',
                      color: h.rsRank == null ? '#6b7280' : h.rsRank <= 3 ? '#22c55e' : h.rsRank <= 7 ? '#6b7280' : '#f59e0b',
                    },
                  })}
                >RS {h.rsRank != null ? `${h.rsRank}/${h.rsTotal}` : '—'}</span>

                <!-- 3M RS % -->
                <span
                  class="font-mono text-xs w-16 shrink-0 cursor-default"
                  style="color:{rsCssColor(h.rs3m)}"
                  use:tipAction={() => ({
                    ...TIPS.relativeStrength,
                    current: {
                      value: fmtRs(h.rs3m),
                      label: h.rs3m == null ? 'No RS data' : h.rs3m > 5 ? 'Strong leader' : h.rs3m > 0 ? 'Ahead of SPY' : 'Lagging SPY',
                      color: rsCssColor(h.rs3m),
                    },
                  })}
                >{fmtRs(h.rs3m)}</span>

                <!-- Revenue growth -->
                <span
                  class="font-mono text-xs w-24 shrink-0 cursor-default"
                  style="color:{h.revGrowth > 10 ? '#22c55e' : h.revGrowth > 0 ? '#86efac' : '#ef4444'}"
                  use:tipAction={() => ({
                    ...TIPS.revenueGrowth,
                    current: {
                      value: fmtPct(h.revGrowth),
                      label: h.revGrowth > 10 ? 'Growing' : h.revGrowth > 0 ? 'Slow growth' : 'Contracting',
                      color: h.revGrowth > 10 ? '#22c55e' : h.revGrowth > 0 ? '#86efac' : '#ef4444',
                    },
                  })}
                >rev {fmtPct(h.revGrowth)}</span>

                <!-- PEG -->
                <span
                  class="font-mono text-xs w-20 shrink-0 cursor-default"
                  style="color:{h.peg === null ? '#6b7280' : h.peg < 1 ? '#22c55e' : h.peg < 2 ? '#6b7280' : '#ef4444'}"
                  use:tipAction={() => ({
                    ...TIPS.peg,
                    current: h.peg !== null
                      ? { value: fmtPeg(h.peg), label: h.peg < 1 ? 'Undervalued' : h.peg < 2 ? 'Fair' : 'Expensive', color: h.peg < 1 ? '#22c55e' : h.peg < 2 ? '#6b7280' : '#ef4444' }
                      : { value: '—', label: 'growth ≤ 0', color: '#6b7280' },
                  })}
                >PEG {fmtPeg(h.peg)}</span>

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
              </button>
        {/snippet}

        {#if hits.length}
          {#if accumulation.length}
            <div class="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Early Accumulation · buy weakness before the wave</div>
            <div class="space-y-1.5">{#each accumulation as h}{@render row(h)}{/each}</div>
          {/if}
          {#if breakout.length}
            <div class="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5 {accumulation.length ? 'mt-3' : ''}">Breakout Confirmation · leaders only</div>
            <div class="space-y-1.5">{#each breakout as h}{@render row(h)}{/each}</div>
          {/if}
        {:else}
          <p class="text-xs text-text-muted italic">No entries today — the gate is intentionally strict.</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

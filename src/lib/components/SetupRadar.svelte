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

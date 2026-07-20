<script>
  import { getTickers, getTickerData, selectTicker } from '../stores/watchlist.svelte.js';
  import { buildLongTermSetup } from '../longTermSetup.js';
  import { timingChips, chipColor } from '../longTermIndicators.js';

  let { marketContextData = null } = $props();
  let collapsed = $state(false);

  const STATUS_ORDER = ['ACCUMULATE', 'OVERSOLD_BUT_CAUTION', 'WATCHLIST', 'NEUTRAL', 'WAIT', 'INSUFFICIENT_DATA'];

  const rows = $derived.by(() => {
    const fearGreed = marketContextData?.fearGreed?.data?.score ?? null;
    const creditStress = marketContextData?.macro?.creditStress ?? null;
    return getTickers()
      .map(t => {
        const data = getTickerData(t.symbol);
        if (!data?.timingScore) return null; // no candle data yet — nothing to show
        const setup = buildLongTermSetup(data.timingScore, data.qualityScore ?? null, { fearGreed, creditStress });
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
                class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded bg-surface-700/50 hover:bg-surface-700 transition-colors text-left overflow-x-auto"
                onclick={() => selectTicker(row.symbol)}
              >
                <span class="text-xs font-mono font-semibold text-text-primary w-14 shrink-0">{row.symbol}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 {statusStyle(row.setup.status)}">{statusLabel(row.setup.status)}</span>
                <span class="text-[10px] font-mono shrink-0" style="color:{chipColor(row.setup.timingScore?.total, 100)}"
                  title="Timing score 0–100">T {row.setup.timingScore?.total ?? '–'}</span>
                <span class="text-[10px] font-mono shrink-0 text-text-muted"
                  title="Quality score 0–100 (fetched when you expand the ticker)">Q {row.setup.qualityScore?.total ?? '–'}</span>
                {#if row.setup.timingScore?.components}
                  {#each timingChips(row.setup.timingScore.components) as c}
                    <span class="text-[10px] px-1 py-0.5 rounded bg-surface-600 font-mono shrink-0"
                      style="color:{chipColor(c.score, c.max)}"
                      title="{c.label}: {c.score == null ? 'no data' : `${c.score} of ${c.max}`}"
                    >{c.label} {c.score ?? '–'}</span>
                  {/each}
                {/if}
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

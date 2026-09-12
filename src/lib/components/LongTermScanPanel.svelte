<script>
  import { getTickers, getTickerData, selectTicker } from '../stores/watchlist.svelte.js';
  import { buildLongTermSetup } from '../longTermSetup.js';
  import { timingChips, chipStyle, statusStyle, timingTone, qualityTone, toneColor, timingHint } from '../longTermIndicators.js';

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
        <span class="text-[13px] text-text-muted hidden sm:inline">is this a good moment to start buying a quality name?</span>
        {#if primaryRows.length}
          <span class="text-[12px] bg-bull-strong/20 text-bull-strong px-1.5 py-0.5 rounded font-semibold">{primaryRows.length}</span>
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
                class="w-full flex flex-col gap-1.5 px-3 py-2.5 rounded bg-surface-700/50 hover:bg-surface-700 transition-colors text-left"
                onclick={() => selectTicker(row.symbol)}
              >
                <!-- Line 1: ticker + status + the two totals -->
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="text-sm font-mono font-semibold text-text-primary">{row.symbol}</span>
                  <span class="text-[13px] px-1.5 py-0.5 rounded font-semibold" style={statusStyle(row.setup.status)}>{statusLabel(row.setup.status)}</span>
                  <span class="text-[13px] font-mono" style="color:{toneColor(timingTone(row.setup.timingScore?.total ?? null))}">
                    Timing {row.setup.timingScore?.total ?? '–'}/100
                  </span>
                  <span class="text-[13px] font-mono" style="color:{row.setup.qualityScore?.total == null ? '#6b7280' : toneColor(qualityTone(row.setup.qualityScore.total))}">
                    {#if row.setup.qualityScore?.total != null}
                      Quality {row.setup.qualityScore.total}/100
                    {:else}
                      Quality — expand ticker to load
                    {/if}
                  </span>
                  {#if timingHint(row.setup.timingScore?.total ?? null)}
                    <span class="text-[12px] text-text-muted">{timingHint(row.setup.timingScore.total)}</span>
                  {/if}
                </div>

                <!-- Line 2: plain-English verdict, straight from buildLongTermSetup -->
                {#if row.setup.reasons?.[0]}
                  <p class="text-xs text-text-secondary leading-snug">{row.setup.reasons[0]}</p>
                {/if}

                <!-- Line 3: timing breakdown, wraps instead of scrolling sideways -->
                {#if row.setup.timingScore?.components}
                  <div class="flex flex-wrap gap-1">
                    {#each timingChips(row.setup.timingScore.components) as c}
                      <span class="text-[12px] px-1.5 py-0.5 rounded font-mono"
                        style={chipStyle(c.score, c.max)}
                        title={c.score == null ? `${c.label}: no data` : `${c.label}: ${c.score} of ${c.max}`}
                      >{c.label} {c.score ?? '–'}/{c.max}</span>
                    {/each}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
          {#if !showAll && rows.length > (primaryRows.length || 3)}
            <button class="text-[12px] text-text-muted hover:text-text-secondary mt-2" onclick={() => showAll = true}>
              Show all {rows.length} tickers ▾
            </button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{/if}

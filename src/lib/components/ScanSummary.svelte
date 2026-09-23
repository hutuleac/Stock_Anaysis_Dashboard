<script>
  // One line in place of three open scan panels. Same engines and inputs as
  // SetupRadar / DipRadar / LongTermScanPanel, so the counts match the panels.
  // Clicking an item opens that panel and filters the table to its tickers.
  import { getTickers, getTickerData } from '../stores/watchlist.svelte.js';
  import { computeRadar } from '../radar.js';
  import { computeDipRadar } from '../dip.js';
  import { buildLongTermSetup } from '../longTermSetup.js';
  import { readinessColor } from '../readiness.js';

  let { marketData = null, active = null, onSelect = () => {} } = $props();

  const list = $derived(getTickers().map(t => ({ symbol: t.symbol, data: getTickerData(t.symbol) })));
  const setups = $derived(computeRadar(list));
  const dips = $derived(computeDipRadar(list, {
    fearGreedValue: marketData?.fearGreed?.data?.score ?? null,
    spyBelowEma50:  marketData?.spyBelowEma50 ?? null,
  }));
  const longTerm = $derived.by(() => {
    const ctx = { fearGreed: marketData?.fearGreed?.data?.score ?? null, creditStress: marketData?.macro?.creditStress ?? null };
    const rows = list.filter(x => x.data?.timingScore && x.data.quote?.data?.c)
      .map(x => ({ symbol: x.symbol, status: buildLongTermSetup(x.data.timingScore, x.data.qualityScore ?? null, ctx).status }));
    return { total: rows.length, ready: rows.filter(r => r.status === 'ACCUMULATE' || r.status === 'OVERSOLD_BUT_CAUTION') };
  });

  // "1 SOON · 2 WATCH" — non-zero tiers, strongest first.
  const tiers = (hits) => ['ACT', 'SOON', 'WATCH']
    .map(r => [r, hits.filter(h => h.readiness === r).length]).filter(([, n]) => n);

  const items = $derived([
    { key: 'setups',   label: 'Setups',    tiers: tiers(setups), symbols: setups.map(h => h.symbol) },
    { key: 'dips',     label: 'Dips',      tiers: tiers(dips),   symbols: dips.map(h => h.symbol) },
    { key: 'longterm', label: 'Long-term', text: `${longTerm.ready.length} ready of ${longTerm.total}`, symbols: longTerm.ready.map(r => r.symbol) },
  ]);
</script>

{#if getTickers().length}
  <div class="flex flex-wrap items-center gap-x-1 gap-y-1 mb-4 text-[13px]">
    <span class="text-text-muted uppercase tracking-wider text-[12px] mr-1">Scans</span>
    {#each items as it, i}
      {#if i}<span class="text-text-muted">·</span>{/if}
      <button
        class="px-2 py-1 rounded-md transition-colors {active === it.key ? 'bg-surface-600 text-text-primary' : 'text-text-secondary hover:bg-surface-700'}"
        onclick={() => onSelect(it.key, it.symbols)}
      >
        {it.label}
        {#if it.text}
          <span class="font-mono {it.symbols.length ? 'text-bull-strong' : 'text-text-muted'}">{it.text}</span>
        {:else if it.tiers.length}
          {#each it.tiers as [r, n]}<span class="font-mono ml-1" style="color:{readinessColor(r)}">{n} {r}</span>{/each}
        {:else}
          <span class="font-mono text-text-muted">0</span>
        {/if}
        <span class="text-text-muted text-xs">{active === it.key ? '▾' : '▸'}</span>
      </button>
    {/each}
  </div>
{/if}

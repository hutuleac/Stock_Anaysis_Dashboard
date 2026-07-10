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

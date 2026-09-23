<script>
  import { getTickers, getTickerData } from '../stores/watchlist.svelte.js';
  import { getEtfs, getEtfProxyData, getEtfSpyCloses, getUniqueProxies } from '../stores/etflist.svelte.js';
  import { computeRadar } from '../radar.js';
  import { computeDipRadar } from '../dip.js';
  import { computeEtfSignals } from '../etf.js';
  import { computeHighlights, computeNotifications } from '../highlights.js';
  import { signalStyle } from '../readiness.js';

  let { marketData = null, onNavigate } = $props();

  const items = $derived.by(() => {
    const stockList = getTickers().map(t => ({ symbol: t.symbol, data: getTickerData(t.symbol) }));
    const proxyList = getUniqueProxies()
      .map(proxy => ({ proxy, ...(getEtfProxyData(proxy) ?? {}) }))
      .filter(p => p.weeklyRaw && p.dailyCloses);
    const signals = computeEtfSignals(proxyList, getEtfSpyCloses());
    const dipCtx = {
      fearGreedValue: marketData?.fearGreed?.data?.score ?? null,
      spyBelowEma50:  marketData?.spyBelowEma50 ?? null,
    };
    return computeHighlights({
      radarHits: computeRadar(stockList),
      dipHits: computeDipRadar(stockList, dipCtx),
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
    const currentIds = new Set(items.map(it => `${it.kind}:${it.symbol}`));
    const carried = prevKeys.filter(k => {
      const [kind, symbol] = k.split(':');
      return !currentIds.has(`${kind}:${symbol}`);
    });
    try { localStorage.setItem('notifySeen', JSON.stringify([...keys, ...carried])); } catch { /* noop */ }
  });

</script>

{#if items.length}
  <!-- One scrollable line on phones (the watchlist must stay above the fold); wraps on desktop. -->
  <div class="mb-4 flex flex-nowrap sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    <span class="text-[12px] uppercase tracking-wider text-text-muted mr-1 shrink-0">Today</span>
    {#each items as it (it.kind + ':' + it.symbol)}
      <button
        class="text-[13px] px-2 py-1 rounded-md shrink-0 transition-[filter] hover:brightness-125"
        style={signalStyle(it.readiness, it.kind !== 'etf-exit')}
        onclick={() => onNavigate?.(it)}
      >{it.label} · {it.readiness}</button>
    {/each}
  </div>
{/if}

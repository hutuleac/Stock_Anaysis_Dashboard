<script>
  import { getEtfs, addEtf, removeEtf, getEtfProxyData, getEtfSpyCloses, getUniqueProxies } from '../stores/etflist.svelte.js';
  import { computeEtfSignals } from '../etf.js';
  import PriceChart from './PriceChart.svelte';

  let sortBy = $state('rs3m');          // 'rs3m' | 'entry' | 'exit'
  let expanded = $state(null);           // ucits ticker of the expanded row
  let showAdd = $state(false);
  let newEtf = $state({ ucits: '', proxy: '', name: '', isin: '', ter: '', category: '' });
  let addError = $state('');

  const signals = $derived.by(() => {
    const list = getUniqueProxies()
      .map(proxy => ({ proxy, ...(getEtfProxyData(proxy) ?? {}) }))
      .filter(p => p.weeklyRaw && p.dailyCloses);
    return computeEtfSignals(list, getEtfSpyCloses());
  });

  const rows = $derived.by(() => {
    const list = getEtfs().map(e => ({ ...e, sig: signals[e.proxy] ?? null }));
    const key = sortBy;
    return [...list].sort((a, b) => {
      const va = key === 'rs3m' ? (a.sig?.rs?.rs3m ?? -Infinity)
        : key === 'entry' ? (a.sig?.entry?.score ?? -1) : (a.sig?.exit?.score ?? -1);
      const vb = key === 'rs3m' ? (b.sig?.rs?.rs3m ?? -Infinity)
        : key === 'entry' ? (b.sig?.entry?.score ?? -1) : (b.sig?.exit?.score ?? -1);
      return vb - va;
    });
  });

  const scoreColor = (s) => s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#6b7280';
  const rsColor = (v) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#6b7280';
  function readinessClass(r) {
    if (r === 'ACT')  return 'bg-bull-strong/20 text-bull-strong';
    if (r === 'SOON') return 'bg-uncertain/20 text-uncertain';
    if (r === 'WATCH') return 'bg-surface-600 text-text-secondary';
    return 'text-text-muted';
  }
  const fmtRs = (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`;

  function handleAdd() {
    addError = '';
    if (!newEtf.ucits.trim() || !newEtf.proxy.trim()) { addError = 'UCITS ticker and US proxy are required'; return; }
    if (!addEtf(newEtf)) { addError = 'Already in the list'; return; }
    newEtf = { ucits: '', proxy: '', name: '', isin: '', ter: '', category: '' };
    showAdd = false;
  }
</script>

<div class="border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">UCITS ETFs</span>
      <span class="text-[10px] text-text-muted hidden sm:inline">signals run on US proxy · you buy the UCITS ticker</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-[10px] text-text-muted">sort:</span>
      {#each [['rs3m', 'RS 3M'], ['entry', 'Entry'], ['exit', 'Exit']] as [key, label]}
        <button
          class="text-[10px] px-1.5 py-0.5 rounded {sortBy === key ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
          onclick={() => sortBy = key}
        >{label}</button>
      {/each}
      <button class="text-[10px] px-1.5 py-0.5 rounded bg-surface-600 text-text-secondary hover:text-text-primary"
        onclick={() => showAdd = !showAdd}>+ Add</button>
    </div>
  </div>

  {#if showAdd}
    <div class="px-4 py-2 border-b border-border/40 flex flex-wrap items-center gap-2">
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-20" placeholder="UCITS *" bind:value={newEtf.ucits} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-20" placeholder="US proxy *" bind:value={newEtf.proxy} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-40" placeholder="Name" bind:value={newEtf.name} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-28" placeholder="ISIN" bind:value={newEtf.isin} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-16" placeholder="TER" bind:value={newEtf.ter} />
      <input class="bg-surface-700 rounded px-2 py-1 text-xs w-24" placeholder="Category" bind:value={newEtf.category} />
      <button class="text-xs px-2 py-1 rounded bg-bull-strong/20 text-bull-strong" onclick={handleAdd}>Add</button>
      {#if addError}<span class="text-xs text-danger">{addError}</span>{/if}
    </div>
  {/if}

  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-[10px] uppercase tracking-wider text-text-muted border-b border-border/40">
          <th class="text-left px-4 py-2">ETF</th>
          <th class="text-left px-2 py-2 hidden md:table-cell">Category</th>
          <th class="text-right px-2 py-2">Proxy · Price</th>
          <th class="text-right px-2 py-2">RS 1M</th>
          <th class="text-right px-2 py-2">RS 3M</th>
          <th class="text-right px-2 py-2">Entry</th>
          <th class="text-right px-2 py-2">Exit</th>
          <th class="text-center px-2 py-2">Signal</th>
          <th class="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as etf (etf.ucits)}
          <tr
            class="border-b border-border/20 hover:bg-surface-700/30 cursor-pointer transition-colors"
            onclick={() => expanded = expanded === etf.ucits ? null : etf.ucits}
          >
            <td class="px-4 py-2">
              <span class="font-mono font-semibold text-text-primary">{etf.ucits}</span>
              <span class="text-[10px] text-text-muted block">{etf.name}{etf.ter ? ` · TER ${etf.ter}` : ''}</span>
            </td>
            <td class="px-2 py-2 text-xs text-text-secondary hidden md:table-cell">{etf.category}</td>
            <td class="px-2 py-2 text-right whitespace-nowrap">
              <span class="font-mono text-xs text-text-muted">{etf.proxy}</span>
              <span class="font-mono text-text-primary ml-1">{etf.sig ? `$${etf.sig.price.toFixed(2)}` : '—'}</span>
            </td>
            <td class="px-2 py-2 text-right font-mono text-xs" style="color:{rsColor(etf.sig?.rs?.rs1m ?? 0)}">{fmtRs(etf.sig?.rs?.rs1m)}</td>
            <td class="px-2 py-2 text-right font-mono text-xs" style="color:{rsColor(etf.sig?.rs?.rs3m ?? 0)}">{fmtRs(etf.sig?.rs?.rs3m)}</td>
            <td class="px-2 py-2 text-right font-mono" style="color:{scoreColor(etf.sig?.entry?.score ?? 0)}">{etf.sig ? etf.sig.entry.score.toFixed(1) : '—'}</td>
            <td class="px-2 py-2 text-right font-mono" style="color:{scoreColor(etf.sig?.exit?.score ?? 0)}">{etf.sig ? etf.sig.exit.score.toFixed(1) : '—'}</td>
            <td class="px-2 py-2 text-center whitespace-nowrap">
              {#if etf.sig}
                {@const isBuy = etf.sig.entry.score >= etf.sig.exit.score}
                {@const sig = isBuy ? etf.sig.entry : etf.sig.exit}
                <span class="text-[10px] px-1.5 py-0.5 rounded {readinessClass(sig.readiness)}">
                  {isBuy ? 'BUY' : 'SELL'} {sig.readiness}
                </span>
              {:else}
                <span class="text-[10px] text-text-muted">no data</span>
              {/if}
            </td>
            <td class="px-2 py-2 text-right">
              <button class="text-xs text-text-muted hover:text-danger" title="Remove"
                onclick={(e) => { e.stopPropagation(); removeEtf(etf.ucits); }}>✕</button>
            </td>
          </tr>
          {#if expanded === etf.ucits}
            <tr class="border-b border-border/20 bg-surface-900/40">
              <td colspan="9" class="px-4 py-4">
                {#if etf.sig}
                  <div class="grid md:grid-cols-2 gap-4 mb-4 text-xs">
                    <div>
                      <div class="text-text-muted uppercase tracking-wider mb-1.5">Entry {etf.sig.entry.score.toFixed(1)}/10 · {etf.sig.entry.readiness}</div>
                      {#each etf.sig.entry.components as c}
                        <div class="flex justify-between py-0.5">
                          <span class="text-text-secondary">{c.label}</span>
                          <span class="font-mono" style="color:{c.score > 0 ? '#22c55e' : '#6b7280'}">{c.score}/{c.max} <span class="text-text-muted">· {c.detail}</span></span>
                        </div>
                      {/each}
                    </div>
                    <div>
                      <div class="text-text-muted uppercase tracking-wider mb-1.5">Exit {etf.sig.exit.score.toFixed(1)}/10 · {etf.sig.exit.readiness}</div>
                      {#each etf.sig.exit.components as c}
                        <div class="flex justify-between py-0.5">
                          <span class="text-text-secondary">{c.label}</span>
                          <span class="font-mono" style="color:{c.score > 0 ? '#ef4444' : '#6b7280'}">{c.score}/{c.max} <span class="text-text-muted">· {c.detail}</span></span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
                <PriceChart symbol={etf.proxy} />
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

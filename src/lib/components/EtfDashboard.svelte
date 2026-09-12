<script>
  import { scoreColor, signalStyle, signalColor } from '../readiness.js';
  import { onMount } from 'svelte';
  import { getEtfs, addEtf, removeEtf, getEtfProxyData, getEtfSpyCloses, getUniqueProxies, getEtfExpandRequest, clearEtfExpandRequest } from '../stores/etflist.svelte.js';
  import { computeEtfSignals, generateEtfThesis } from '../etf.js';
  import { searchCatalog } from '../etfCatalog.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';
  import PriceChart from './PriceChart.svelte';

  // Gates mobile card vs desktop table so the expanded row's PriceChart only mounts once.
  let isMobile = $state(false);
  onMount(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    isMobile = mq.matches;
    const update = (e) => (isMobile = e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

  let sortBy = $state('rs3m');          // 'rs3m' | 'entry' | 'exit'
  let expanded = $state(null);           // ucits ticker of the expanded row
  let showAdd = $state(false);
  let newEtf = $state({ ucits: '', proxy: '', name: '', isin: '', ter: '', category: '' });
  let addError = $state('');
  let showAddDetails = $state(false);
  let catalogQuery = $state('');
  const catalogResults = $derived(searchCatalog(catalogQuery, getEtfs().map(e => e.ucits)));

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

  // Entry and exit are scored on the same 0–10 tiers but mean opposite things:
  // a high exit score is sell pressure, so it must not render green.
  const entryColor = (v) => scoreColor(v, 'entry');
  const exitColor  = (v) => scoreColor(v, 'exit');
  const rsColor = (v) => v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#6b7280';
  const trendColor = (t) => t === 'UPTREND' ? '#22c55e' : t === 'PULLBACK' ? '#f59e0b' : t === 'DOWNTREND' ? '#ef4444' : '#6b7280';
  const fmtRs = (v) => v == null ? '—' : `${v > 0 ? '+' : ''}${v}%`;
  const compSummary = (score) => score.components.map(c => `${c.label} ${c.score}/${c.max}`).join(' · ');
  const COMPONENT_TIPS = {
    Oversold: 'etfOversoldComp', Rotation: 'etfRotationComp', Turn: 'etfTurnComp', Drawdown: 'etfDrawdownComp',
    Overbought: 'etfOverboughtComp', Extension: 'etfExtensionComp', 'Rotation Loss': 'etfRotationLossComp', 'Climax Vol': 'etfClimaxVolComp',
  };

  function buildEtfBriefing(etf) {
    const isDirect = etf.ucits === etf.proxy;
    const trackingLine = isDirect
      ? 'Held directly — US-listed, no UCITS wrapper.'
      : `You buy ${etf.ucits}; signals run on its US-listed proxy ${etf.proxy}.`;
    return {
      title: etf.ucits,
      subtitle: etf.name,
      category: etf.category,
      current: {
        value: etf.sig ? `$${etf.sig.price.toFixed(2)}` : 'n/a',
        label: isDirect ? 'price' : `proxy ${etf.proxy}`,
        color: '#9ca3af',
      },
      description: `${trackingLine} TER ${etf.ter || 'n/a'}.${etf.isin ? ` ISIN ${etf.isin}.` : ''}`,
      why: etf.category?.startsWith('Leveraged')
        ? '3x daily-reset leverage compounds against you in choppy, range-bound markets — meant for short, high-conviction trades, not a buy-and-hold core position.'
        : `Category: ${etf.category}. Entry/Exit scores (hover the columns to the right) run on the proxy's price history.`,
    };
  }

  $effect(() => {
    const req = getEtfExpandRequest();
    if (req) { expanded = req; clearEtfExpandRequest(); }
  });

  function handleAdd() {
    addError = '';
    if (!newEtf.ucits.trim() || !newEtf.proxy.trim()) { addError = 'UCITS ticker and US proxy are required'; return; }
    if (!addEtf(newEtf)) { addError = 'Already in the list'; return; }
    newEtf = { ucits: '', proxy: '', name: '', isin: '', ter: '', category: '' };
    showAdd = false;
    showAddDetails = false;
  }

  function addFromCatalog(entry) {
    if (addEtf(entry)) {
      catalogQuery = '';
      showAdd = false;
    }
  }
</script>

<div class="border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">UCITS ETFs</span>
      <span class="text-[12px] text-text-muted hidden sm:inline">signals run on US proxy · you buy the UCITS ticker</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-[12px] text-text-muted">sort:</span>
      {#each [['rs3m', 'RS 3M'], ['entry', 'Entry'], ['exit', 'Exit']] as [key, label]}
        <button
          class="text-[12px] px-1.5 py-0.5 rounded {sortBy === key ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
          onclick={() => sortBy = key}
        >{label}</button>
      {/each}
      <button class="text-[12px] px-1.5 py-0.5 rounded bg-surface-600 text-text-secondary hover:text-text-primary"
        onclick={() => showAdd = !showAdd}>+ Add</button>
    </div>
  </div>

  {#if showAdd}
    <div class="px-4 py-2.5 border-b border-border/40">
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
                <span class="text-[12px] text-text-muted shrink-0">{r.category} · proxy {r.proxy}{r.added ? ' · added' : ''}</span>
              </button>
            {/each}
          </div>
        {:else if catalogQuery.trim()}
          <p class="text-xs text-text-muted mt-1.5">Not in catalog — add manually below with its US proxy.</p>
        {/if}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input class="flex-1 min-w-[110px] bg-surface-700 rounded-lg px-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none"
          placeholder="UCITS ticker (e.g. IUHC)" bind:value={newEtf.ucits} onkeydown={(e) => e.key === 'Enter' && handleAdd()} />
        <input class="flex-1 min-w-[110px] bg-surface-700 rounded-lg px-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none"
          placeholder="US proxy (e.g. XLV)" bind:value={newEtf.proxy} onkeydown={(e) => e.key === 'Enter' && handleAdd()} />
        <input class="flex-[2] min-w-[140px] bg-surface-700 rounded-lg px-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none"
          placeholder="Name (optional)" bind:value={newEtf.name} onkeydown={(e) => e.key === 'Enter' && handleAdd()} />
        <button class="text-xs px-3 py-1.5 rounded-lg bg-bull-strong/20 text-bull-strong hover:bg-bull-strong/30 shrink-0" onclick={handleAdd}>Add</button>
        <button class="text-[12px] text-text-muted hover:text-text-secondary shrink-0" onclick={() => showAddDetails = !showAddDetails}>
          {showAddDetails ? '− fewer fields' : '+ ISIN / TER / category'}
        </button>
      </div>
      {#if showAddDetails}
        <div class="flex flex-wrap items-center gap-2 mt-2">
          <input class="bg-surface-700 rounded-lg px-3 py-1.5 text-xs w-32 placeholder:text-text-muted focus:outline-none" placeholder="ISIN" bind:value={newEtf.isin} />
          <input class="bg-surface-700 rounded-lg px-3 py-1.5 text-xs w-20 placeholder:text-text-muted focus:outline-none" placeholder="TER" bind:value={newEtf.ter} />
          <input class="bg-surface-700 rounded-lg px-3 py-1.5 text-xs w-28 placeholder:text-text-muted focus:outline-none" placeholder="Category" bind:value={newEtf.category} />
        </div>
      {/if}
      {#if addError}<p class="text-xs text-danger mt-1.5">{addError}</p>{/if}
    </div>
  {/if}

  {#snippet expandedContent(etf)}
    {#if etf.sig}
      {@const thesis = generateEtfThesis(etf.sig)}
      {#if thesis}
        <p class="text-xs text-text-secondary leading-relaxed mb-3 max-w-3xl">{thesis}</p>
      {/if}
      {#if etf.sig.indicators}
        {@const ind = etf.sig.indicators}
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs">
          {#if ind.trendState}
            <span class="px-1.5 py-0.5 rounded font-semibold text-[12px] cursor-default
              {ind.trendState === 'UPTREND' ? 'bg-bull-strong/20 text-bull-strong'
                : ind.trendState === 'PULLBACK' ? 'bg-warning/20 text-warning'
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
      <div class="grid md:grid-cols-2 gap-4 mb-4 text-xs">
        <div>
          <div class="text-text-muted uppercase tracking-wider mb-1.5 cursor-default"
            use:tipAction={() => ({ ...TIPS.etfEntry, current: { value: etf.sig.entry.score.toFixed(1) + '/10', label: etf.sig.entry.readiness, color: entryColor(etf.sig.entry.score) } })}
          >Entry {etf.sig.entry.score.toFixed(1)}/10 · {etf.sig.entry.readiness}</div>
          {#each etf.sig.entry.components as c}
            <div class="flex justify-between py-0.5 cursor-default"
              use:tipAction={() => ({ ...TIPS[COMPONENT_TIPS[c.label]], current: { value: `${c.score}/${c.max}`, label: '', color: c.score > 0 ? '#22c55e' : '#6b7280' } })}
            >
              <span class="text-text-secondary">{c.label}</span>
              <span class="font-mono" style="color:{c.score > 0 ? '#22c55e' : '#6b7280'}">{c.score}/{c.max} <span class="text-text-muted">· {c.detail}</span></span>
            </div>
          {/each}
        </div>
        <div>
          <div class="text-text-muted uppercase tracking-wider mb-1.5 cursor-default"
            use:tipAction={() => ({ ...TIPS.etfExit, current: { value: etf.sig.exit.score.toFixed(1) + '/10', label: etf.sig.exit.readiness, color: exitColor(etf.sig.exit.score) } })}
          >Exit {etf.sig.exit.score.toFixed(1)}/10 · {etf.sig.exit.readiness}</div>
          {#each etf.sig.exit.components as c}
            <div class="flex justify-between py-0.5 cursor-default"
              use:tipAction={() => ({ ...TIPS[COMPONENT_TIPS[c.label]], current: { value: `${c.score}/${c.max}`, label: '', color: c.score > 0 ? '#ef4444' : '#6b7280' } })}
            >
              <span class="text-text-secondary">{c.label}</span>
              <span class="font-mono" style="color:{c.score > 0 ? '#ef4444' : '#6b7280'}">{c.score}/{c.max} <span class="text-text-muted">· {c.detail}</span></span>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <PriceChart symbol={etf.proxy} />
  {/snippet}

  {#if isMobile}
    <div class="space-y-2 p-2">
      {#each rows as etf (etf.ucits)}
        {@const isExpanded = expanded === etf.ucits}
        {@const isBuy = etf.sig ? etf.sig.entry.score >= etf.sig.exit.score : true}
        {@const sig = etf.sig ? (isBuy ? etf.sig.entry : etf.sig.exit) : null}
        <div
          class="bg-surface-800 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors {isExpanded ? 'border-bull-strong/40 bg-surface-700' : 'border-border hover:bg-surface-750'}"
          onclick={() => expanded = isExpanded ? null : etf.ucits}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && (expanded = isExpanded ? null : etf.ucits)}
        >
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <span class="font-mono font-bold text-text-primary">{etf.ucits}</span>
              <span class="text-[12px] text-text-muted ml-1.5 truncate">{etf.name}</span>
              <div class="text-[12px] text-text-secondary truncate">{etf.category}</div>
            </div>
            <button class="text-text-muted hover:text-danger shrink-0" title="Remove"
              onclick={(e) => { e.stopPropagation(); removeEtf(etf.ucits); }}>✕</button>
          </div>
          <div class="flex items-center justify-between mt-2">
            <div class="flex items-center gap-2 text-xs">
              <span class="font-mono text-text-muted">{etf.proxy}</span>
              <span class="font-mono text-text-primary">{etf.sig ? `$${etf.sig.price.toFixed(2)}` : '—'}</span>
              <span class="font-mono" style="color:{rsColor(etf.sig?.rs?.rs3m ?? 0)}">{fmtRs(etf.sig?.rs?.rs3m)} 3M</span>
            </div>
            {#if sig}
              <span class="text-[12px] px-1.5 py-0.5 rounded shrink-0" style={signalStyle(sig.readiness, isBuy)}>{isBuy ? 'BUY' : 'SELL'} {sig.readiness}</span>
            {:else}
              <span class="text-[12px] text-text-muted shrink-0">no data</span>
            {/if}
          </div>
          <div class="flex items-center gap-3 mt-1.5 text-[12px]">
            <span class="text-text-muted">Entry <span class="font-mono" style="color:{entryColor(etf.sig?.entry?.score ?? null)}">{etf.sig ? etf.sig.entry.score.toFixed(1) : '—'}</span></span>
            <span class="text-text-muted">Exit <span class="font-mono" style="color:{exitColor(etf.sig?.exit?.score ?? null)}">{etf.sig ? etf.sig.exit.score.toFixed(1) : '—'}</span></span>
          </div>
        </div>
        {#if isExpanded}
          <div class="bg-surface-800 border border-border/50 rounded-lg px-3 py-3 -mt-1">
            {@render expandedContent(etf)}
          </div>
        {/if}
      {/each}
    </div>
  {:else}
  <div class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-[12px] uppercase tracking-wider text-text-muted border-b border-border/40">
          <th class="text-left px-2 sm:px-4 py-2">ETF</th>
          <th class="text-left px-2 py-2 hidden md:table-cell">Category</th>
          <th class="text-right px-1.5 sm:px-2 py-2 cursor-default" use:tipAction={TIPS.etfProxy}>Proxy · Price</th>
          <th class="text-right px-2 py-2 hidden sm:table-cell cursor-default" use:tipAction={TIPS.relativeStrength}>RS 1M</th>
          <th class="text-right px-1.5 sm:px-2 py-2 cursor-default" use:tipAction={TIPS.relativeStrength}>RS 3M</th>
          <th class="text-right px-1.5 sm:px-2 py-2 cursor-default" use:tipAction={TIPS.etfEntry}>Entry</th>
          <th class="text-right px-1.5 sm:px-2 py-2 cursor-default" use:tipAction={TIPS.etfExit}>Exit</th>
          <th class="text-center px-1.5 sm:px-2 py-2 cursor-default" use:tipAction={TIPS.etfSignal}>Signal</th>
          <th class="px-1.5 sm:px-2 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as etf (etf.ucits)}
          <tr
            class="border-b border-border/20 hover:bg-surface-700/30 cursor-pointer transition-colors"
            onclick={() => expanded = expanded === etf.ucits ? null : etf.ucits}
          >
            <td class="px-2 sm:px-4 py-2">
              <span class="font-mono font-semibold text-text-primary cursor-help" use:tipAction={() => buildEtfBriefing(etf)}>{etf.ucits}</span>
              <span class="text-[12px] text-text-muted block">{etf.name}{etf.ter ? ` · TER ${etf.ter}` : ''}</span>
            </td>
            <td class="px-2 py-2 text-xs text-text-secondary hidden md:table-cell">{etf.category}</td>
            <td class="px-1.5 sm:px-2 py-2 text-right whitespace-nowrap cursor-default"
              use:tipAction={() => ({ ...TIPS.etfProxy, current: { value: etf.proxy, label: etf.sig ? `$${etf.sig.price.toFixed(2)}` : 'no data', color: '#9ca3af' } })}
            >
              <span class="font-mono text-xs text-text-muted">{etf.proxy}</span>
              <span class="font-mono text-text-primary ml-1">{etf.sig ? `$${etf.sig.price.toFixed(2)}` : '—'}</span>
            </td>
            <td class="px-2 py-2 text-right font-mono text-xs hidden sm:table-cell cursor-default" style="color:{rsColor(etf.sig?.rs?.rs1m ?? 0)}"
              use:tipAction={() => ({ ...TIPS.relativeStrength, current: { value: fmtRs(etf.sig?.rs?.rs1m), label: '1M vs SPY', color: rsColor(etf.sig?.rs?.rs1m ?? 0) } })}
            >{fmtRs(etf.sig?.rs?.rs1m)}</td>
            <td class="px-1.5 sm:px-2 py-2 text-right font-mono text-xs cursor-default" style="color:{rsColor(etf.sig?.rs?.rs3m ?? 0)}"
              use:tipAction={() => ({ ...TIPS.relativeStrength, current: { value: fmtRs(etf.sig?.rs?.rs3m), label: '3M vs SPY', color: rsColor(etf.sig?.rs?.rs3m ?? 0) } })}
            >{fmtRs(etf.sig?.rs?.rs3m)}</td>
            <td class="px-1.5 sm:px-2 py-2 text-right font-mono cursor-default" style="color:{entryColor(etf.sig?.entry?.score ?? null)}"
              use:tipAction={etf.sig ? () => ({ ...TIPS.etfEntry, current: { value: String(etf.sig.entry.score), label: etf.sig.entry.readiness, color: entryColor(etf.sig.entry.score) }, description: compSummary(etf.sig.entry) }) : undefined}
            >{etf.sig ? etf.sig.entry.score.toFixed(1) : '—'}</td>
            <td class="px-1.5 sm:px-2 py-2 text-right font-mono cursor-default" style="color:{exitColor(etf.sig?.exit?.score ?? null)}"
              use:tipAction={etf.sig ? () => ({ ...TIPS.etfExit, current: { value: String(etf.sig.exit.score), label: etf.sig.exit.readiness, color: exitColor(etf.sig.exit.score) }, description: compSummary(etf.sig.exit) }) : undefined}
            >{etf.sig ? etf.sig.exit.score.toFixed(1) : '—'}</td>
            <td class="px-1.5 sm:px-2 py-2 text-center whitespace-nowrap cursor-default"
              use:tipAction={etf.sig ? () => { const isBuy = etf.sig.entry.score >= etf.sig.exit.score; const sig = isBuy ? etf.sig.entry : etf.sig.exit; return { ...TIPS.etfSignal, current: { value: `${isBuy ? 'BUY' : 'SELL'} ${sig.readiness}`, label: '', color: signalColor(sig.readiness, isBuy) } }; } : undefined}
            >
              {#if etf.sig}
                {@const isBuy = etf.sig.entry.score >= etf.sig.exit.score}
                {@const sig = isBuy ? etf.sig.entry : etf.sig.exit}
                <span class="text-[12px] px-1.5 py-0.5 rounded" style={signalStyle(sig.readiness, isBuy)}>
                  {isBuy ? 'BUY' : 'SELL'} {sig.readiness}
                </span>
              {:else}
                <span class="text-[12px] text-text-muted">no data</span>
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
                {@render expandedContent(etf)}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
  {/if}
</div>

<script>
  import { tick } from 'svelte';
  import { getTickers, getSelectedSymbol, selectTicker, removeTicker, getTickerData, addTicker, reorderTickers } from '../stores/watchlist.svelte.js';
  import { searchTicker } from '../api/finnhub.svelte.js';
  import { computeScore, computeScoreZScore, getBadgeStyle, getDaysToEarnings, getScoreVelocity, getScoreHistory, getMarketContext } from '../scoring.js';
  import { proximityTo52wHigh } from '../indicators.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';
  import { buildStockSnapshot, buildPrompt } from '../export.js';
  import { getTemplates, getDefaultId, getTemplate } from '../stores/prompts.svelte.js';
  import EntryPanel from './EntryPanel.svelte';
  import PriceChart from './PriceChart.svelte';
  import FundamentalsBar from './FundamentalsBar.svelte';

  let { onTickerAdded = () => {}, onTickerExpand = () => {} } = $props();

  // Open a ticker and, on phones, scroll its header just under the sticky top
  // bar so every stock opens the same way and reads top-to-bottom. Tapping the
  // open stock again collapses it (selectTicker toggles); tapping another
  // switches. Desktop keeps the table in place (no auto-scroll).
  async function toggleTicker(symbol) {
    const opening = getSelectedSymbol() !== symbol;
    selectTicker(symbol);
    if (opening) onTickerExpand(symbol);
    if (opening && typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
      await tick();
      const el = document.getElementById(`wl-m-${symbol}`);
      if (el) {
        const headerH = document.querySelector('header')?.offsetHeight ?? 0;
        const top = el.getBoundingClientRect().top + window.scrollY - headerH - 8;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }

  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let searchOpen = $state(false);
  let searchError = $state(false);
  let sortBy = $state('score');
  let sortDir = $state('desc');
  let bulkOpen = $state(false);
  let bulkText = $state('');
  let bulkAdding = $state(false);
  let bulkStatus = $state('');
  let copyState = $state(null);      // symbol that just copied ('ok') or failed ('fail')
  let copyMenuSymbol = $state(null); // symbol whose template dropdown is open

  // Mobile expansion sections — per-session; state carries across ticker opens.
  let openSections = $state({ chart: true, indicators: true, entry: false });
  function toggleSection(k) { openSections[k] = !openSections[k]; }

  async function copyForAI(ticker, templateId) {
    const tpl = getTemplate(templateId ?? getDefaultId());
    if (!tpl) return;
    const d = getTickerData(ticker.symbol);
    const snapshot = buildStockSnapshot(ticker, d, getMarketContext());
    const text = buildPrompt(tpl.body, snapshot, ticker.symbol);
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for non-secure contexts / older browsers
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { ok = false; }
    }
    copyState = { symbol: ticker.symbol, ok };
    copyMenuSymbol = null;
    setTimeout(() => { copyState = null; }, 1500);
  }

  async function handleBulkAdd() {
    const symbols = bulkText.toUpperCase().split(/[\s,;\n]+/).map(s => s.trim()).filter(s => /^[A-Z]{1,5}$/.test(s));
    if (!symbols.length) { bulkStatus = 'No valid tickers found'; return; }
    bulkAdding = true;
    bulkStatus = '';
    let added = 0;
    for (const sym of symbols) {
      await addTicker(sym, sym);
      added++;
      bulkStatus = `Adding... ${added}/${symbols.length}`;
    }
    bulkStatus = `Added ${added} ticker${added > 1 ? 's' : ''}`;
    bulkText = '';
    bulkAdding = false;
    onTickerAdded();
    setTimeout(() => { bulkOpen = false; bulkStatus = ''; }, 1500);
  }
  let searchTimeout;
  let dragIndex = $state(null);

  async function handleSearch() {
    if (searchQuery.length < 2) {
      searchResults = [];
      searchError = false;
      return;
    }
    searching = true;
    searchError = false;
    try {
      const result = await searchTicker(searchQuery);
      searchResults = result.data || result || [];
    } catch {
      searchResults = [];
      searchError = true;
    }
    searching = false;
  }

  function debounceSearch() {
    clearTimeout(searchTimeout);
    if (searchQuery.length < 2) { searchResults = []; searchError = false; return; }
    searchTimeout = setTimeout(handleSearch, 300);
  }

  async function handleAddTicker(result) {
    await addTicker(result.symbol, result.description);
    searchQuery = '';
    searchResults = [];
    searchOpen = false;
    onTickerAdded();
  }

  function exportCSV() {
    const rows = [['Symbol', 'Sector', 'Price', 'Change%', 'Score', 'Badge', 'Technical', 'Fundamental', 'Sentiment', 'EarningsDays']];
    for (const t of getTickers()) {
      const d = getTickerData(t.symbol);
      const s = computeScore(d);
      const q = d?.quote?.data;
      rows.push([
        t.symbol,
        t.sector || '',
        q?.c ?? '',
        q?.dp ?? '',
        s.score ?? '',
        s.badge,
        s.technical ?? '',
        s.fundamental ?? '',
        s.sentiment ?? '',
        getDaysToEarnings(d?.earnings) ?? '',
      ]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `watchlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  function handleSort(field) {
    if (sortBy === field) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortBy = field;
      sortDir = 'desc';
    }
  }

  function getSortedTickers() {
    const list = [...getTickers()];
    list.sort((a, b) => {
      let aVal, bVal;
      const aData = getTickerData(a.symbol);
      const bData = getTickerData(b.symbol);

      if (sortBy === 'score') {
        aVal = computeScore(aData).score ?? -1;
        bVal = computeScore(bData).score ?? -1;
      } else if (sortBy === 'symbol') {
        aVal = a.symbol;
        bVal = b.symbol;
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      } else if (sortBy === 'price') {
        aVal = aData?.quote?.data?.c ?? 0;
        bVal = bData?.quote?.data?.c ?? 0;
      } else if (sortBy === 'change') {
        aVal = aData?.quote?.data?.dp ?? 0;
        bVal = bData?.quote?.data?.dp ?? 0;
      } else if (sortBy === 'earnings') {
        aVal = getDaysToEarnings(aData?.earnings) ?? 999;
        bVal = getDaysToEarnings(bData?.earnings) ?? 999;
      } else if (sortBy === 'sector') {
        aVal = a.sector || '';
        bVal = b.sector || '';
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return list;
  }

  function formatPrice(val) {
    if (val == null) return '—';
    return '$' + val.toFixed(2);
  }

  // Pick the stronger of the two weekly setups; hide low-signal noise.
  function topSetup(setups) {
    if (!setups) return null;
    const p = setups.pullback, m = setups.momentum;
    const best = m.score > p.score ? { ...m, kind: 'BREAKOUT' } : { ...p, kind: 'PULLBACK' };
    if (best.readiness === 'WAIT' || best.score < 4.5) return null;
    return best;
  }

  function setupBadgeClass(readiness) {
    return readiness === 'ACT'  ? 'bg-bull-strong/20 text-bull-strong'
         : readiness === 'SOON' ? 'bg-uncertain/20 text-uncertain'
         :                        'bg-surface-600 text-text-secondary';
  }

  // RS-vs-SPY chip — only when 1M outperformance is meaningful (|RS| >= 3%).
  function rsChip(rs) {
    if (!rs || rs.rs1m == null || Math.abs(rs.rs1m) < 3) return null;
    const out = rs.rs1m > 0;
    return {
      label: `RS ${out ? '+' : ''}${rs.rs1m.toFixed(0)}%`,
      cls: out ? 'bg-bull-strong/15 text-bull-strong' : 'bg-bear-strong/15 text-bear-strong',
      title: `Relative strength vs SPY: ${rs.rs1m > 0 ? '+' : ''}${rs.rs1m.toFixed(1)}% (1M)${rs.rs3m != null ? `, ${rs.rs3m > 0 ? '+' : ''}${rs.rs3m.toFixed(1)}% (3M)` : ''}`,
    };
  }

  // EMA-stack chip — full bull alignment (price > EMA20 > EMA50 > EMA200).
  // Only surfaced when stacked or broken; PARTIAL is the noisy default, so hidden.
  function emaStackChip(indicators) {
    const s = indicators?.emaStack;
    if (s !== 'BULL_STACK' && s !== 'BROKEN') return null;
    const bull = s === 'BULL_STACK';
    return {
      label: bull ? 'BULL STACK' : 'BROKEN',
      cls: bull ? 'bg-bull-strong/15 text-bull-strong' : 'bg-bear-strong/15 text-bear-strong',
      title: bull
        ? 'EMA stack: price > EMA20 > EMA50 > EMA200 — full bull alignment'
        : 'EMA stack broken: price < EMA20 < EMA50 < EMA200 — bearish alignment',
    };
  }

  // 52w-high proximity chip — within 3% of the 52-week high = breakout watch.
  // Volume confirmation flag added when recent volume (5d avg) ≥ 1.2× the 20d avg.
  function high52wChip(data) {
    const price = data?.quote?.data?.c;
    const high = data?.metrics?.data?.metric?.['52WeekHigh'];
    const prox = proximityTo52wHigh(price, high);
    if (!prox || !prox.near) return null;
    const atHigh = prox.pctFromHigh <= 0;
    const volConf = data?.indicators?.volConfirmation;
    const volSuffix = volConf?.confirmed ? ' · ↑ vol' : volConf ? ' · low vol' : '';
    const baseLabel = atHigh ? 'AT HIGH' : `${prox.pctFromHigh.toFixed(1)}% ↓ 52wH`;
    const baseTitle = atHigh
      ? 'At or above its 52-week high — breakout territory'
      : `${prox.pctFromHigh.toFixed(1)}% below the 52-week high — breakout watch`;
    const volTitle = volConf?.confirmed
      ? ` Recent volume ${volConf.ratio}× the 20-day avg — breakout has volume behind it.`
      : volConf
        ? ` Recent volume only ${volConf.ratio}× the 20-day avg — breakout lacks conviction.`
        : '';
    return {
      label: baseLabel + volSuffix,
      cls: volConf?.confirmed
        ? 'bg-bull-strong/25 text-bull-strong font-semibold'
        : 'bg-bull-strong/15 text-bull-strong',
      title: baseTitle + volTitle,
    };
  }

  function formatPct(val) {
    if (val == null) return '—';
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(2) + '%';
  }

  // One source for the score chip color/label (was duplicated per layout).
  function scoreStyle(s) {
    return s >= 70 ? { color: '#22c55e', label: 'Bullish' }
      : s >= 58 ? { color: '#f59e0b', label: 'Positive' }
      : s <= 30 ? { color: '#ef4444', label: 'Bearish' }
      : s <= 42 ? { color: '#f97316', label: 'Negative' }
      : { color: '#9ca3af', label: 'Neutral' };
  }

  function handleDragStart(e, index) {
    dragIndex = index;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, toIndex) {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== toIndex) {
      reorderTickers(dragIndex, toIndex);
    }
    dragIndex = null;
  }
</script>

<div class="w-full">
  <!-- Search Bar -->
  <div class="relative mb-4">
    <div class="flex gap-2">
      <div class="relative flex-1">
        <input
          type="text"
          placeholder="Search ticker to add (e.g. NVDA, AAPL)..."
          class="w-full bg-surface-700 border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50 transition-colors"
          bind:value={searchQuery}
          oninput={debounceSearch}
          onfocus={() => searchOpen = true}
        />
        {#if searching}
          <div class="absolute right-3 top-3 w-4 h-4 border-2 border-neutral border-t-transparent rounded-full animate-spin"></div>
        {/if}
      </div>
      <button
        class="px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 text-text-muted hover:text-text-secondary rounded-lg border border-border transition-colors whitespace-nowrap"
        onclick={() => { bulkOpen = !bulkOpen; searchOpen = false; }}
        title="Bulk add tickers"
      >+ Bulk</button>
      {#if getTickers().length > 0}
        <button
          class="px-3 py-2 text-xs bg-surface-700 hover:bg-surface-600 text-text-muted hover:text-text-secondary rounded-lg border border-border transition-colors whitespace-nowrap"
          onclick={exportCSV}
          title="Export watchlist to CSV"
        >↓ CSV</button>
      {/if}
    </div>

    <!-- Bulk add panel -->
    {#if bulkOpen}
      <div class="mt-2 bg-surface-700 border border-border rounded-lg p-3 space-y-2">
        <p class="text-xs text-text-muted">Paste tickers separated by commas, spaces, or newlines:</p>
        <textarea
          placeholder="NVDA, AAPL, MSFT, TSLA"
          class="w-full bg-surface-600 border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50 h-20 resize-none"
          bind:value={bulkText}
        ></textarea>
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-1.5 text-sm bg-bull-strong text-surface-900 font-semibold rounded hover:brightness-110 transition disabled:opacity-40"
            onclick={handleBulkAdd}
            disabled={bulkAdding || !bulkText.trim()}
          >{bulkAdding ? 'Adding...' : 'Add All'}</button>
          {#if bulkStatus}
            <span class="text-xs text-text-muted">{bulkStatus}</span>
          {/if}
        </div>
      </div>
    {/if}


    {#if searchOpen && searchResults.length > 0}
      <div class="absolute z-50 w-full mt-1 bg-surface-700 border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
        {#each searchResults as result}
          {@const alreadyAdded = getTickers().some(t => t.symbol === result.symbol)}
          <button
            class="w-full px-4 py-2.5 text-left flex justify-between items-center transition-colors first:rounded-t-lg last:rounded-b-lg {alreadyAdded ? 'opacity-40 cursor-default' : 'hover:bg-surface-600'}"
            onclick={() => { if (!alreadyAdded) handleAddTicker(result); }}
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-mono font-semibold text-text-primary">{result.symbol}</span>
              {#if alreadyAdded}
                <span class="text-xs text-text-muted">in watchlist</span>
              {/if}
            </div>
            <span class="text-sm text-text-secondary truncate ml-4">{result.description}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if searchOpen && searchError}
      <div class="absolute z-50 w-full mt-1 bg-surface-700 border border-border rounded-lg shadow-xl px-4 py-3 text-sm">
        <span class="text-bear-strong">Search unavailable</span>
        <span class="text-text-muted ml-1">— check your connection or API key and try again.</span>
      </div>
    {/if}

    {#if searchOpen && searchQuery.length >= 2 && !searching && !searchError && searchResults.length === 0}
      <div class="absolute z-50 w-full mt-1 bg-surface-700 border border-border rounded-lg shadow-xl px-4 py-3 text-text-muted text-sm">
        No US-listed results for "<span class="text-text-secondary">{searchQuery}</span>" — try the full ticker symbol.
      </div>
    {/if}
  </div>

  <!-- Click outside to close search -->
  {#if searchOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={() => { searchOpen = false; searchResults = []; }}></div>
  {/if}

  <!-- Setup/RS/EMA-stack/52w chip row — shared between mobile card and desktop ticker cell.
       size 'sm' = mobile (11px, always visible, eta suffix shown); 'xs' = desktop (10px,
       setup chip hidden below md, other chips hidden below lg — matches pre-dedup gates). -->
  {#snippet tickerChips(data, size)}
    {@const px = size === 'sm' ? 'text-[11px]' : 'text-[10px]'}
    {@const setupVis = size === 'sm' ? 'inline-block' : 'hidden md:inline-block'}
    {@const chipVis = size === 'sm' ? 'inline-block' : 'hidden lg:inline-block'}
    {#if topSetup(data?.setups)}
      {@const su = topSetup(data?.setups)}
      <span class="{setupVis} px-1.5 py-0.5 rounded {px} font-semibold {setupBadgeClass(su.readiness)}" title="{su.kind} setup · {su.label} · {su.readiness}{su.etaWeeks ? ` · ~${su.etaWeeks}w` : ''}">
        {su.kind} {su.readiness}{size === 'sm' && su.etaWeeks ? ` ~${su.etaWeeks}w` : ''}
      </span>
    {/if}
    {#if rsChip(data?.rs)}
      {@const chip = rsChip(data?.rs)}
      <span class="{chipVis} px-1.5 py-0.5 rounded {px} font-semibold {chip.cls}" title={chip.title}>{chip.label}</span>
    {/if}
    {#if emaStackChip(data?.indicators)}
      {@const chip = emaStackChip(data?.indicators)}
      <span class="{chipVis} px-1.5 py-0.5 rounded {px} font-semibold {chip.cls}" title={chip.title}>{chip.label}</span>
    {/if}
    {#if high52wChip(data)}
      {@const chip = high52wChip(data)}
      <span class="{chipVis} px-1.5 py-0.5 rounded {px} font-semibold {chip.cls}" title={chip.title}>{chip.label}</span>
    {/if}
  {/snippet}

  {#snippet sectionHeader(key, label)}
    <button
      class="w-full flex items-center justify-between py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
      onclick={() => toggleSection(key)}
    >{label}<span class="text-text-muted">{openSections[key] ? '▾' : '▸'}</span></button>
  {/snippet}


  {#snippet expandedPanel(ticker, data, score, variant)}
    {#if variant === 'desktop'}
      <!-- AI export toolbar -->
      <div class="flex items-center justify-end gap-1 mb-3 relative">
        <button
          class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 border border-border text-text-secondary hover:text-text-primary transition-colors"
          onclick={() => copyForAI(ticker)}
        >{copyState?.symbol === ticker.symbol ? (copyState.ok ? 'Copied ✓' : 'Copy failed') : '🤖 Copy for AI'}</button>
        <button
          class="text-xs px-2 py-1.5 rounded-lg bg-surface-700 border border-border text-text-muted hover:text-text-secondary transition-colors"
          title="Choose prompt template"
          onclick={() => { copyMenuSymbol = copyMenuSymbol === ticker.symbol ? null : ticker.symbol; }}
        >▾</button>
        {#if copyMenuSymbol === ticker.symbol}
          <div class="absolute right-0 top-full mt-1 z-30 bg-surface-700 border border-border rounded-lg shadow-lg py-1 min-w-44">
            {#each getTemplates() as tpl (tpl.id)}
              <button
                class="block w-full text-left text-xs px-3 py-1.5 hover:bg-surface-600 transition-colors {tpl.id === getDefaultId() ? 'text-text-primary font-semibold' : 'text-text-secondary'}"
                onclick={() => copyForAI(ticker, tpl.id)}
              >{tpl.name}{tpl.id === getDefaultId() ? ' ·' : ''}</button>
            {/each}
          </div>
        {/if}
      </div>
      <!-- Click outside to close dropdown -->
      {#if copyMenuSymbol === ticker.symbol}
        <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
        <div class="fixed inset-0 z-20" onclick={() => { copyMenuSymbol = null; }}></div>
      {/if}
      <div class="mb-4">
        <FundamentalsBar symbol={ticker.symbol} />
      </div>
      <div class="mb-4">
        <PriceChart symbol={ticker.symbol} />
      </div>

      <EntryPanel symbol={ticker.symbol} />
    {:else}
      <!-- Mobile: collapsible sections -->
      <div class="border-t border-border/30">
        {@render sectionHeader('indicators', 'Indicators')}
        {#if openSections.indicators}
          <div class="pb-3"><FundamentalsBar symbol={ticker.symbol} /></div>
        {/if}
      </div>

      <div class="border-t border-border/30">
        {@render sectionHeader('chart', 'Chart')}
        {#if openSections.chart}
          <!-- Full-bleed: cancel the expansion card's px-4 so the chart uses the lateral space -->
          <div class="pb-3 -mx-4"><PriceChart symbol={ticker.symbol} /></div>
        {/if}
      </div>

      <div class="border-t border-border/30">
        {@render sectionHeader('entry', 'Entry Plan')}
        {#if openSections.entry}
          <div class="pb-3"><EntryPanel symbol={ticker.symbol} /></div>
        {/if}
      </div>

      <!-- Sticky action bar -->
      <div class="sticky bottom-0 -mx-4 -mb-4 mt-4 px-4 py-2.5 bg-surface-800 border-t border-border flex items-center gap-2">
        <button class="flex-1 text-xs px-3 py-2.5 rounded-lg bg-surface-700 border border-border text-text-secondary"
          onclick={() => copyForAI(ticker)}
        >{copyState?.symbol === ticker.symbol ? (copyState.ok ? 'Copied ✓' : 'Copy failed') : '🤖 Copy for AI'}</button>
        <button class="text-xs px-3 py-2.5 rounded-lg bg-surface-700 border border-border text-text-muted hover:text-danger"
          onclick={() => removeTicker(ticker.symbol)}
        >✕</button>
      </div>
    {/if}
  {/snippet}

  <!-- ── Mobile card layout (< sm) ─────────────────────────────────────────── -->
  {#if getTickers().length > 0}
    <div class="block sm:hidden space-y-2 mb-4">
      {#each getSortedTickers() as ticker}
        {@const data = getTickerData(ticker.symbol)}
        {@const score = computeScore(data)}
        {@const badge = getBadgeStyle(score.badge)}
        {@const quote = data?.quote?.data}
        {@const daysToEarnings = getDaysToEarnings(data?.earnings)}
        {@const isSelected = getSelectedSymbol() === ticker.symbol}
        {@const velocity = getScoreVelocity(ticker.symbol)}
        {@const scoreZ = computeScoreZScore(ticker.symbol)}

        <div
          id="wl-m-{ticker.symbol}"
          class="bg-surface-800 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors scroll-mt-24 {isSelected ? 'border-bull-strong/40 bg-surface-700' : 'border-border hover:bg-surface-750'}"
          onclick={() => toggleTicker(ticker.symbol)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && toggleTicker(ticker.symbol)}
        >
          <!-- Row 1: ticker + badge + earnings badge -->
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-2">
              <span class="font-mono font-bold text-text-primary">{ticker.symbol}</span>
              {#if daysToEarnings !== null && daysToEarnings <= 14}
                <span class="text-[13px] font-semibold text-warning bg-warning/10 px-1 rounded">E {daysToEarnings}d</span>
              {/if}
              {#if data?.quote?.stale}
                <span class="text-warning text-xs" title="Stale data">⚠</span>
              {/if}
            </div>
            <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badge.bg} {badge.text}">{badge.label}</span>
          </div>

          <!-- Row 1.5: scrollable chip rail -->
          {#if topSetup(data?.setups) || rsChip(data?.rs) || emaStackChip(data?.indicators) || high52wChip(data)}
            <div class="flex gap-1.5 overflow-x-auto whitespace-nowrap -mx-1 px-1 pb-0.5 mt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {@render tickerChips(data, 'sm')}
            </div>
          {/if}

          <!-- Row 2: price + change left; score anchor right -->
          <div class="flex items-center justify-between mt-1.5">
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm text-text-primary">{formatPrice(quote?.c)}</span>
              <span class="text-xs font-mono {(quote?.dp ?? 0) >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">{formatPct(quote?.dp)}</span>
            </div>
            {#if score.score !== null}
              {@const ss = scoreStyle(score.score)}
              <div class="flex items-center gap-1.5 cursor-default" use:tipAction={() => ({ ...TIPS.score, current: { value: String(score.score), label: ss.label, color: ss.color } })}>
                <span class="font-mono font-bold text-lg" style="color:{ss.color}">{score.score}</span>
                <div class="flex flex-col items-start leading-tight text-[11px]">
                  {#if velocity}
                    <span class="{velocity.direction === 'up' ? 'text-bull-strong' : velocity.direction === 'down' ? 'text-bear-strong' : 'text-text-muted'}">
                      {velocity.direction === 'up' ? '↑' : velocity.direction === 'down' ? '↓' : '→'}
                    </span>
                  {/if}
                  {#if score.convictionLabel}
                    <span class="text-text-muted">{score.convictionLabel}</span>
                  {/if}
                  {#if scoreZ != null}
                    <span class="font-mono text-text-muted" title="Score z-score vs 90-day history">z{scoreZ >= 0 ? '+' : ''}{scoreZ.toFixed(1)}</span>
                  {/if}
                </div>
              </div>
            {/if}
          </div>

          <!-- Row 3: T/F/S mini bars -->
          {#if score.score !== null}
            <div class="flex items-center gap-2 mt-1.5">
              {#each [['T', score.technical], ['F', score.fundamental], ['S', score.sentiment]] as [label, val]}
                {#if val !== null}
                  <div class="flex items-center gap-0.5">
                    <span class="text-[12px] text-text-muted">{label}</span>
                    <div class="w-10 h-1 bg-surface-600 rounded-full overflow-hidden">
                      <div class="h-full rounded-full {val >= 60 ? 'bg-bull-strong' : val >= 40 ? 'bg-neutral' : 'bg-bear-strong'}" style="width:{val}%"></div>
                    </div>
                    <span class="text-[12px] font-mono text-text-muted">{val}</span>
                  </div>
                {/if}
              {/each}
              {#if score.regimeNote || score.spyPenaltyApplied}
                <span class="text-[12px] text-warning ml-1">⚡</span>
              {/if}
            </div>
          {/if}
        </div>

        <!-- Mobile expansion (same detail panel) -->
        {#if isSelected}
          <div class="bg-surface-800 border border-border/50 rounded-lg px-4 py-4 -mt-1">
            {@render expandedPanel(ticker, data, score, 'mobile')}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Table -->
  {#if getTickers().length === 0}
    <div class="text-center py-16 text-text-muted">
      <div class="text-4xl mb-3 opacity-40">&#x1F4C8;</div>
      <p class="text-lg mb-1">No tickers in watchlist</p>
      <p class="text-sm">Search above to add your first ticker</p>
    </div>
  {:else}
    <div class="hidden sm:block overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <th class="w-8 px-2 py-3 hidden sm:table-cell"></th>
            <th class="px-3 py-3 text-left cursor-pointer hover:text-text-secondary" onclick={() => handleSort('symbol')}>
              Ticker {sortBy === 'symbol' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th class="px-3 py-3 text-left cursor-pointer hover:text-text-secondary hidden lg:table-cell" onclick={() => handleSort('sector')}>
              Sector {sortBy === 'sector' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th class="px-3 py-3 text-right cursor-pointer hover:text-text-secondary" onclick={() => handleSort('price')}>
              Price {sortBy === 'price' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th class="px-3 py-3 text-right cursor-pointer hover:text-text-secondary" onclick={() => handleSort('change')}>
              Change {sortBy === 'change' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th class="px-3 py-3 text-right cursor-pointer hover:text-text-secondary" onclick={() => handleSort('score')}>
              Score {sortBy === 'score' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th class="px-3 py-3 text-center hidden sm:table-cell cursor-default" use:tipAction={TIPS.setupBadge}>Setup</th>
            <th class="px-3 py-3 text-center hidden md:table-cell cursor-pointer hover:text-text-secondary" onclick={() => handleSort('earnings')}>
              Earnings {sortBy === 'earnings' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
            <th class="w-10 px-2 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {#each getSortedTickers() as ticker, i}
            {@const data = getTickerData(ticker.symbol)}
            {@const score = computeScore(data)}
            {@const badge = getBadgeStyle(score.badge)}
            {@const daysToEarnings = getDaysToEarnings(data?.earnings)}
            {@const isSelected = getSelectedSymbol() === ticker.symbol}
            {@const quote = data?.quote?.data}
            {@const isStale = data?.quote?.stale}
            {@const velocity = getScoreVelocity(ticker.symbol)}
            {@const scoreHistory = getScoreHistory(ticker.symbol)}
            {@const scoreZ = computeScoreZScore(ticker.symbol)}

            <tr
              class="border-b border-border/50 cursor-pointer transition-colors {isSelected ? 'bg-surface-700' : 'hover:bg-surface-800'}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, i)}
              ondragover={handleDragOver}
              ondrop={(e) => handleDrop(e, i)}
              onclick={() => toggleTicker(ticker.symbol)}
            >
              <td class="px-2 py-3 text-text-muted cursor-grab hidden sm:table-cell">⠿</td>
              <td class="px-3 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-semibold text-text-primary">{ticker.symbol}</span>
                  {#if isStale}
                    <span class="text-warning text-xs" title="Stale data">⚠</span>
                  {/if}
                  <span class="hidden md:inline-flex items-center gap-2">{@render tickerChips(data, 'xs')}</span>
                </div>
                <div class="text-xs text-text-muted truncate max-w-[140px] hidden sm:block lg:hidden">{ticker.sector}</div>
              </td>
              <td class="px-3 py-3 hidden lg:table-cell">
                <span class="text-xs text-text-muted truncate max-w-[160px] block">{ticker.sector || '—'}</span>
              </td>
              <td class="px-3 py-3 text-right font-mono">
                {formatPrice(quote?.c)}
              </td>
              <td class="px-3 py-3 text-right font-mono {quote?.dp >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">
                {formatPct(quote?.dp)}
              </td>
              <td class="px-3 py-3 text-right">
                {#if score.score !== null}
                  {@const ss = scoreStyle(score.score)}
                  <div class="flex items-center justify-end gap-2 cursor-default" use:tipAction={() => ({ ...TIPS.score, current: { value: String(score.score), label: ss.label, color: ss.color } })}>
                    <!-- Score sparkline: flex-shrink-0 prevents compression; padded y-range keeps line off edges -->
                    {#if scoreHistory.length >= 1}
                      {@const W = 32} {@const H = 14} {@const PAD = 2}
                      {@const pts = scoreHistory.length === 1
                        ? `0,${H / 2} ${W},${H / 2}`
                        : (() => {
                            const minS = Math.min(...scoreHistory.map(h => h.score));
                            const maxS = Math.max(...scoreHistory.map(h => h.score));
                            const range = Math.max(maxS - minS, 1);
                            return scoreHistory.map((h, i) => {
                              const x = (i / (scoreHistory.length - 1)) * W;
                              const y = range < 2
                                ? H / 2
                                : PAD + (H - 2 * PAD) - ((h.score - minS) / range) * (H - 2 * PAD);
                              return `${x},${y}`;
                            }).join(' ');
                          })()}
                      <svg width={W} height={H} class="hidden sm:block opacity-70 flex-shrink-0 self-center" title="Score trend">
                        <polyline points={pts} fill="none" stroke={velocity?.direction === 'down' ? '#ef4444' : '#22c55e'} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    {/if}
                    <!-- Score number + arrow + label + fraction on the same baseline -->
                    <div class="flex items-baseline gap-1">
                      <span
                        class="font-mono font-semibold tabular-nums"
                        title="{score.regimeNote ? score.regimeNote + '. ' : ''}{score.spyPenaltyApplied ? 'SPY downtrend penalty applied.' : ''}"
                      >{score.score}{score.regimeNote || score.spyPenaltyApplied ? '*' : ''}</span>
                      {#if velocity}
                        <span
                          class="text-xs font-mono {velocity.direction === 'up' ? 'text-bull-strong' : velocity.direction === 'down' ? 'text-bear-strong' : 'text-text-muted'}"
                          title="3-day delta: {velocity.delta > 0 ? '+' : ''}{velocity.delta}"
                        >{velocity.direction === 'up' ? '↑' : velocity.direction === 'down' ? '↓' : '→'}</span>
                      {/if}
                      {#if score.convictionLabel}
                        <span class="text-[13px] hidden md:inline w-[5rem] text-right {score.convictionLabel === 'HIGH' ? 'text-bull-strong' : score.convictionLabel === 'MIXED' ? 'text-bear-weak' : 'text-text-muted'}"
                          title="{score.conviction}% signal agreement"
                        >{score.convictionLabel}</span>
                      {/if}
                      {#if scoreZ != null}
                        <span class="text-[12px] font-mono text-text-muted hidden lg:inline" title="Score z-score vs 90-day history">z{scoreZ >= 0 ? '+' : ''}{scoreZ.toFixed(1)}</span>
                      {/if}
                      <span class="text-xs text-text-muted hidden sm:inline">({score.factors}/{score.total})</span>
                    </div>
                  </div>
                  <!-- T/F/S sub-score bars -->
                  <div class="hidden sm:flex items-center gap-1.5 mt-1 justify-end">
                    {#each [['T', score.technical], ['F', score.fundamental], ['S', score.sentiment]] as [label, val]}
                      {#if val !== null}
                        <div class="flex items-center gap-0.5" title="{label === 'T' ? `Technical (${Math.round((score.weights?.tech ?? 0.35)*100)}%)` : label === 'F' ? `Fundamental (${Math.round((score.weights?.fund ?? 0.45)*100)}%)` : `Sentiment (${Math.round((score.weights?.sent ?? 0.20)*100)}%)`}: {val}">
                          <span class="text-[11px] text-text-muted font-mono">{label}</span>
                          <div class="w-7 h-1 bg-surface-600 rounded-full overflow-hidden">
                            <div
                              class="h-full rounded-full {val >= 60 ? 'bg-bull-strong' : val >= 40 ? 'bg-neutral' : 'bg-bear-strong'}"
                              style="width:{val}%"
                            ></div>
                          </div>
                        </div>
                      {/if}
                    {/each}
                  </div>
                {:else}
                  <span class="text-text-muted">—</span>
                {/if}
              </td>
              <td class="px-3 py-3 text-center hidden sm:table-cell">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badge.bg} {badge.text}">
                  {badge.label}
                </span>
              </td>
              <td class="px-3 py-3 text-center hidden md:table-cell">
                {#if daysToEarnings !== null}
                  <span class="text-xs font-mono {daysToEarnings < 7 ? 'text-danger font-bold' : daysToEarnings < 14 ? 'text-warning' : 'text-text-secondary'}">
                    {daysToEarnings}d
                  </span>
                {:else}
                  <span class="text-text-muted text-xs">—</span>
                {/if}
              </td>
              <td class="px-2 py-3">
                <button
                  class="text-text-muted hover:text-danger transition-colors p-1"
                  title="Remove"
                  onclick={(e) => { e.stopPropagation(); removeTicker(ticker.symbol); }}
                >✕</button>
              </td>
            </tr>

            <!-- Inline expansion: Checklist + Entry Panel -->
            {#if isSelected}
              <tr>
                <td colspan="9" class="p-0">
                  <div class="bg-surface-800 border-b border-border px-6 py-5 transition-all">
                    {@render expandedPanel(ticker, data, score, 'desktop')}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

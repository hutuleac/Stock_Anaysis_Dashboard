<script>
  import { getTickers, getSelectedSymbol, selectTicker, removeTicker, getTickerData, addTicker, reorderTickers } from '../stores/watchlist.svelte.js';
  import { searchTicker } from '../api/finnhub.svelte.js';
  import { computeScore, getBadgeStyle, getDaysToEarnings, getScoreVelocity } from '../scoring.js';
  import { getChecklist } from '../stores/checklist.svelte.js';
  import PreBuyChecklist from './PreBuyChecklist.svelte';
  import EntryPanel from './EntryPanel.svelte';
  import PriceChart from './PriceChart.svelte';
  import TradeLog from './TradeLog.svelte';
  import NewsPanel from './NewsPanel.svelte';

  let { onTickerAdded = () => {} } = $props();

  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let searchOpen = $state(false);
  let sortBy = $state('score');
  let sortDir = $state('desc');
  let searchTimeout;
  let dragIndex = $state(null);

  async function handleSearch() {
    if (searchQuery.length < 1) {
      searchResults = [];
      return;
    }
    searching = true;
    try {
      const result = await searchTicker(searchQuery);
      searchResults = result.data || result || [];
    } catch {
      searchResults = [];
    }
    searching = false;
  }

  function debounceSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(handleSearch, 300);
  }

  async function handleAddTicker(result) {
    await addTicker(result.symbol, result.description);
    searchQuery = '';
    searchResults = [];
    searchOpen = false;
    onTickerAdded();
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
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return list;
  }

  function formatPrice(val) {
    if (val == null) return '—';
    return '$' + val.toFixed(2);
  }

  function formatPct(val) {
    if (val == null) return '—';
    const sign = val >= 0 ? '+' : '';
    return sign + val.toFixed(2) + '%';
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
    </div>

    {#if searchOpen && searchResults.length > 0}
      <div class="absolute z-50 w-full mt-1 bg-surface-700 border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto">
        {#each searchResults as result}
          <button
            class="w-full px-4 py-2.5 text-left hover:bg-surface-600 flex justify-between items-center transition-colors first:rounded-t-lg last:rounded-b-lg"
            onclick={() => handleAddTicker(result)}
          >
            <span class="font-mono font-semibold text-text-primary">{result.symbol}</span>
            <span class="text-sm text-text-secondary truncate ml-4">{result.description}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if searchOpen && searchQuery.length > 0 && !searching && searchResults.length === 0}
      <div class="absolute z-50 w-full mt-1 bg-surface-700 border border-border rounded-lg shadow-xl px-4 py-3 text-text-muted text-sm">
        No results for "{searchQuery}"
      </div>
    {/if}
  </div>

  <!-- Click outside to close search -->
  {#if searchOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="fixed inset-0 z-40" onclick={() => { searchOpen = false; searchResults = []; }}></div>
  {/if}

  <!-- Table -->
  {#if getTickers().length === 0}
    <div class="text-center py-16 text-text-muted">
      <div class="text-4xl mb-3 opacity-40">&#x1F4C8;</div>
      <p class="text-lg mb-1">No tickers in watchlist</p>
      <p class="text-sm">Search above to add your first ticker</p>
    </div>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <th class="w-8 px-2 py-3"></th>
            <th class="px-3 py-3 text-left cursor-pointer hover:text-text-secondary" onclick={() => handleSort('symbol')}>
              Ticker {sortBy === 'symbol' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
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
            <th class="px-3 py-3 text-center">Setup</th>
            <th class="px-3 py-3 text-center">Earnings</th>
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

            <tr
              class="border-b border-border/50 cursor-pointer transition-colors {isSelected ? 'bg-surface-700' : 'hover:bg-surface-800'}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, i)}
              ondragover={handleDragOver}
              ondrop={(e) => handleDrop(e, i)}
              onclick={() => selectTicker(ticker.symbol)}
            >
              <td class="px-2 py-3 text-text-muted cursor-grab">⠿</td>
              <td class="px-3 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-semibold text-text-primary">{ticker.symbol}</span>
                  {#if isStale}
                    <span class="text-warning text-xs" title="Stale data">⚠</span>
                  {/if}
                </div>
                <div class="text-xs text-text-muted truncate max-w-[140px]">{ticker.sector}</div>
              </td>
              <td class="px-3 py-3 text-right font-mono">
                {formatPrice(quote?.c)}
              </td>
              <td class="px-3 py-3 text-right font-mono {quote?.dp >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">
                {formatPct(quote?.dp)}
              </td>
              <td class="px-3 py-3 text-right">
                {#if score.score !== null}
                  <div class="flex items-center justify-end gap-2">
                    <span class="font-mono font-semibold">{score.score}</span>
                    {#if velocity}
                      <span
                        class="text-xs font-mono {velocity.direction === 'up' ? 'text-bull-strong' : velocity.direction === 'down' ? 'text-bear-strong' : 'text-text-muted'}"
                        title="3-day delta: {velocity.delta > 0 ? '+' : ''}{velocity.delta}"
                      >{velocity.direction === 'up' ? '↑' : velocity.direction === 'down' ? '↓' : '→'}</span>
                    {/if}
                    <span class="text-xs text-text-muted">({score.factors}/{score.total})</span>
                  </div>
                  <!-- T/F/S sub-score bars -->
                  <div class="flex items-center gap-1 mt-1 justify-end">
                    {#each [['T', score.technical], ['F', score.fundamental], ['S', score.sentiment]] as [label, val]}
                      {#if val !== null}
                        <div class="flex items-center gap-0.5" title="{label === 'T' ? 'Technical' : label === 'F' ? 'Fundamental' : 'Sentiment'}: {val}">
                          <span class="text-[9px] text-text-muted">{label}</span>
                          <div class="w-6 h-1 bg-surface-600 rounded-full overflow-hidden">
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
              <td class="px-3 py-3 text-center">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badge.bg} {badge.text}">
                  {badge.label}
                </span>
              </td>
              <td class="px-3 py-3 text-center">
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
                >
                  ✕
                </button>
              </td>
            </tr>

            <!-- Inline expansion: Checklist + Entry Panel -->
            {#if isSelected}
              <tr>
                <td colspan="8" class="p-0">
                  <div class="bg-surface-800 border-b border-border px-6 py-5 transition-all">
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
                      <PriceChart symbol={ticker.symbol} />
                      <NewsPanel symbol={ticker.symbol} />
                    </div>
                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <PreBuyChecklist symbol={ticker.symbol} />
                      <EntryPanel symbol={ticker.symbol} />
                      <TradeLog symbol={ticker.symbol} />
                    </div>
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

<script>
  import { getTickers, getSelectedSymbol, selectTicker, removeTicker, getTickerData, addTicker, reorderTickers } from '../stores/watchlist.svelte.js';
  import { searchTicker } from '../api/finnhub.svelte.js';
  import { computeScore, computeScoreZScore, getBadgeStyle, getDaysToEarnings, getScoreVelocity, getScoreHistory } from '../scoring.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';
  import { hasNotes, getNotes, setNotes } from '../stores/notes.svelte.js';
  import ReplayPanel from './ReplayPanel.svelte';
  import { getChecklist } from '../stores/checklist.svelte.js';
  import { getAlerts, addAlert, removeAlert } from '../stores/alerts.svelte.js';
  import PreBuyChecklist from './PreBuyChecklist.svelte';
  import EntryPanel from './EntryPanel.svelte';
  import PriceChart from './PriceChart.svelte';
  import TradeLog from './TradeLog.svelte';
  import NewsPanel from './NewsPanel.svelte';
  import FundamentalsBar from './FundamentalsBar.svelte';

  let { onTickerAdded = () => {} } = $props();

  let searchQuery = $state('');
  let searchResults = $state([]);
  let searching = $state(false);
  let searchOpen = $state(false);
  let sortBy = $state('score');
  let sortDir = $state('desc');
  let alertSymbol = $state(null);
  let alertPrice = $state('');
  let alertDir = $state('above');
  let bulkOpen = $state(false);
  let bulkText = $state('');
  let bulkAdding = $state(false);
  let bulkStatus = $state('');

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

  <!-- ── Mobile card layout (< sm) ─────────────────────────────────────────── -->
  {#if getTickers().length > 0}
    <div class="block sm:hidden space-y-2 mb-4">
      {#each getSortedTickers() as ticker}
        {@const data = getTickerData(ticker.symbol)}
        {@const score = computeScore(data)}
        {@const checklist = getChecklist(ticker.symbol)}
        {@const isBlocked = checklist.hardWarning && !checklist.hardWarningDismissed}
        {@const badge = getBadgeStyle(isBlocked ? 'BLOCKED' : score.badge)}
        {@const quote = data?.quote?.data}
        {@const daysToEarnings = getDaysToEarnings(data?.earnings)}
        {@const isSelected = getSelectedSymbol() === ticker.symbol}
        {@const velocity = getScoreVelocity(ticker.symbol)}
        {@const scoreZ = computeScoreZScore(ticker.symbol)}

        <div
          class="bg-surface-800 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors {isSelected ? 'border-bull-strong/40 bg-surface-700' : 'border-border hover:bg-surface-750'}"
          onclick={() => selectTicker(ticker.symbol)}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && selectTicker(ticker.symbol)}
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

          <!-- Row 2: price + change + score -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-mono text-sm text-text-primary">{formatPrice(quote?.c)}</span>
              <span class="text-xs font-mono {(quote?.dp ?? 0) >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">{formatPct(quote?.dp)}</span>
            </div>
            {#if score.score !== null}
              {@const scoreCssColorM = score.score >= 70 ? '#22c55e' : score.score >= 58 ? '#f59e0b' : score.score <= 30 ? '#ef4444' : score.score <= 42 ? '#f97316' : '#9ca3af'}
              {@const scoreLabelM = score.score >= 70 ? 'Bullish' : score.score >= 58 ? 'Positive' : score.score <= 30 ? 'Bearish' : score.score <= 42 ? 'Negative' : 'Neutral'}
              <div class="flex items-center gap-1.5 cursor-default" use:tipAction={() => ({ ...TIPS.score, current: { value: String(score.score), label: scoreLabelM, color: scoreCssColorM } })}>
                <span class="font-mono font-semibold text-sm">{score.score}</span>
                {#if velocity}
                  <span class="text-xs {velocity.direction === 'up' ? 'text-bull-strong' : velocity.direction === 'down' ? 'text-bear-strong' : 'text-text-muted'}">
                    {velocity.direction === 'up' ? '↑' : velocity.direction === 'down' ? '↓' : '→'}
                  </span>
                {/if}
                {#if score.convictionLabel}
                  <span class="text-[13px] text-text-muted">{score.convictionLabel}</span>
                {/if}
                {#if scoreZ != null}
                  <span class="text-[12px] font-mono text-text-muted" title="Score z-score vs 90-day history">z{scoreZ >= 0 ? '+' : ''}{scoreZ.toFixed(1)}</span>
                {/if}
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
            <PriceChart symbol={ticker.symbol} priceTarget={data?.priceTarget?.data ?? null} />
            <div class="mt-4"><FundamentalsBar symbol={ticker.symbol} /></div>
            <div class="mt-4 grid grid-cols-1 gap-4">
              <PreBuyChecklist symbol={ticker.symbol} />
              <EntryPanel symbol={ticker.symbol} />
            </div>
            <div class="mt-3 border-t border-border/30 pt-3">
              <textarea
                class="w-full bg-surface-700/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none resize-none font-mono"
                rows="2"
                placeholder="Notes…"
                value={getNotes(ticker.symbol)}
                oninput={(e) => setNotes(ticker.symbol, e.currentTarget.value)}
              ></textarea>
            </div>
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
            {@const checklist = getChecklist(ticker.symbol)}
            {@const isBlocked = checklist.hardWarning && !checklist.hardWarningDismissed}
            {@const badge = getBadgeStyle(isBlocked ? 'BLOCKED' : score.badge)}
            {@const daysToEarnings = getDaysToEarnings(data?.earnings)}
            {@const isSelected = getSelectedSymbol() === ticker.symbol}
            {@const quote = data?.quote?.data}
            {@const isStale = data?.quote?.stale}
            {@const velocity = getScoreVelocity(ticker.symbol)}
            {@const hasAlert = getAlerts().some(a => a.symbol === ticker.symbol)}
            {@const scoreHistory = getScoreHistory(ticker.symbol)}
            {@const scoreZ = computeScoreZScore(ticker.symbol)}

            <tr
              class="border-b border-border/50 cursor-pointer transition-colors {isSelected ? 'bg-surface-700' : 'hover:bg-surface-800'}"
              draggable="true"
              ondragstart={(e) => handleDragStart(e, i)}
              ondragover={handleDragOver}
              ondrop={(e) => handleDrop(e, i)}
              onclick={() => selectTicker(ticker.symbol)}
            >
              <td class="px-2 py-3 text-text-muted cursor-grab hidden sm:table-cell">⠿</td>
              <td class="px-3 py-3">
                <div class="flex items-center gap-2">
                  <span class="font-mono font-semibold text-text-primary">{ticker.symbol}</span>
                  {#if isStale}
                    <span class="text-warning text-xs" title="Stale data">⚠</span>
                  {/if}
                  {#if hasNotes(ticker.symbol)}
                    <span class="text-[13px] text-uncertain" title="Has notes">📝</span>
                  {/if}
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
                  {@const scoreCssColor = score.score >= 70 ? '#22c55e' : score.score >= 58 ? '#f59e0b' : score.score <= 30 ? '#ef4444' : score.score <= 42 ? '#f97316' : '#9ca3af'}
                  {@const scoreLabel = score.score >= 70 ? 'Bullish' : score.score >= 58 ? 'Positive' : score.score <= 30 ? 'Bearish' : score.score <= 42 ? 'Negative' : 'Neutral'}
                  <div class="flex items-center justify-end gap-2 cursor-default" use:tipAction={() => ({ ...TIPS.score, current: { value: String(score.score), label: scoreLabel, color: scoreCssColor } })}>
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
                <div class="flex items-center gap-0.5">
                  <button
                    class="p-1 transition-colors {hasAlert ? 'text-warning' : 'text-text-muted hover:text-warning'}"
                    title="{hasAlert ? 'Alert set' : 'Set price alert'}"
                    onclick={(e) => {
                      e.stopPropagation();
                      alertSymbol = alertSymbol === ticker.symbol ? null : ticker.symbol;
                      alertPrice = '';
                      alertDir = 'above';
                    }}
                  >🔔</button>
                  <button
                    class="text-text-muted hover:text-danger transition-colors p-1"
                    title="Remove"
                    onclick={(e) => { e.stopPropagation(); removeTicker(ticker.symbol); }}
                  >✕</button>
                </div>
              </td>
            </tr>

            <!-- Alert form row -->
            {#if alertSymbol === ticker.symbol}
              <tr onclick={(e) => e.stopPropagation()}>
                <td colspan="9" class="px-4 py-2 bg-surface-800/80 border-b border-border/30">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs text-text-muted">Alert when {ticker.symbol} goes</span>
                    <select
                      class="text-xs bg-surface-700 border border-border rounded px-2 py-1 text-text-primary"
                      bind:value={alertDir}
                    >
                      <option value="above">above</option>
                      <option value="below">below</option>
                    </select>
                    <input
                      type="number" step="0.01" placeholder="price"
                      class="w-24 text-xs bg-surface-700 border border-border rounded px-2 py-1 text-text-primary font-mono"
                      bind:value={alertPrice}
                    />
                    <button
                      class="text-xs px-3 py-1 bg-warning/20 text-warning rounded hover:bg-warning/30 transition-colors"
                      onclick={() => {
                        if (alertPrice) { addAlert(ticker.symbol, alertPrice, alertDir); alertSymbol = null; }
                      }}
                    >Set Alert</button>
                    {#each getAlerts().filter(a => a.symbol === ticker.symbol) as alert (alert.id)}
                      {@const distPct = quote?.c ? ((alert.targetPrice - quote.c) / quote.c * 100) : null}
                      <span class="text-xs bg-surface-700 rounded px-2 py-1 text-text-muted flex items-center gap-1">
                        {alert.direction} ${alert.targetPrice.toFixed(2)}
                        {#if distPct !== null}
                          <span class="font-mono {Math.abs(distPct) < 3 ? 'text-warning' : 'text-text-muted'}">({distPct > 0 ? '+' : ''}{distPct.toFixed(1)}%)</span>
                        {/if}
                        <button class="hover:text-danger ml-1" onclick={() => removeAlert(alert.id)}>✕</button>
                      </span>
                    {/each}
                    {#if typeof Notification !== 'undefined' && Notification.permission === 'default'}
                      <button
                        class="text-[13px] px-2 py-1 bg-surface-600 rounded text-text-muted hover:text-text-secondary transition-colors"
                        onclick={() => Notification.requestPermission()}
                      >Enable notifications</button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/if}

            <!-- Inline expansion: Checklist + Entry Panel -->
            {#if isSelected}
              <tr>
                <td colspan="9" class="p-0">
                  <div class="bg-surface-800 border-b border-border px-6 py-5 transition-all">
                  <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-4">
                      <PriceChart symbol={ticker.symbol} priceTarget={data?.priceTarget?.data ?? null} />
                      <NewsPanel symbol={ticker.symbol} />
                    </div>
                    <div class="mb-4">
                      <FundamentalsBar symbol={ticker.symbol} />
                    </div>
                    <!-- Score History Chart -->
                    {#if scoreHistory.length >= 2}
                      {@const SH = 48} {@const SW = 600}
                      {@const minH = Math.min(...scoreHistory.map(h => h.score))}
                      {@const maxH = Math.max(...scoreHistory.map(h => h.score))}
                      {@const rangeH = Math.max(maxH - minH, 15)}
                      {@const hPts = scoreHistory.map((h, i) => `${(i / (scoreHistory.length - 1)) * SW},${SH - ((h.score - minH) / rangeH) * (SH - 8) - 4}`).join(' ')}
                      {@const lastScore = scoreHistory[scoreHistory.length - 1]?.score}
                      {@const firstScore = scoreHistory[0]?.score}
                      {@const scoreDelta = lastScore - firstScore}
                      {@const refY = SH - ((50 - minH) / rangeH) * (SH - 8) - 4}
                      {@const lastPt = hPts.split(' ').pop()}
                      {@const lastPtCoords = lastPt ? lastPt.split(',').map(Number) : null}
                      <div class="mb-4 bg-surface-700/50 rounded-lg px-4 py-3 border border-border/40">
                        <div class="flex items-center justify-between mb-2">
                          <p class="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-default" use:tipAction={TIPS.scoreHistory}>Score History</p>
                          <div class="flex items-center gap-3 text-xs">
                            <span class="text-text-muted font-mono">{firstScore} → {lastScore}</span>
                            <span class="font-mono font-semibold {scoreDelta > 0 ? 'text-bull-strong' : scoreDelta < 0 ? 'text-bear-strong' : 'text-text-muted'}">
                              {scoreDelta > 0 ? '↑ +' : scoreDelta < 0 ? '↓ ' : '→ '}{scoreDelta}
                            </span>
                            <span class="text-text-muted">{scoreHistory.length} snapshots</span>
                          </div>
                        </div>
                        <svg viewBox="0 0 {SW} {SH}" class="w-full" style="height: {SH}px" preserveAspectRatio="none">
                          <!-- 50-point reference line -->
                          {#if refY > 0 && refY < SH}
                            <line x1="0" y1={refY} x2={SW} y2={refY} stroke="#ffffff18" stroke-width="1" stroke-dasharray="4,4"/>
                          {/if}
                          <!-- Fill area -->
                          <polygon
                            points="{hPts} {SW},{SH} 0,{SH}"
                            fill={scoreDelta >= 0 ? '#22c55e18' : '#ef444418'}
                          />
                          <!-- Line -->
                          <polyline
                            points={hPts}
                            fill="none"
                            stroke={scoreDelta >= 0 ? '#22c55e' : '#ef4444'}
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                          <!-- Latest dot -->
                          {#if lastPtCoords}
                            <circle cx={lastPtCoords[0]} cy={lastPtCoords[1]} r="3" fill={scoreDelta >= 0 ? '#22c55e' : '#ef4444'}/>
                          {/if}
                        </svg>
                      </div>
                    {/if}

                    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      <PreBuyChecklist symbol={ticker.symbol} />
                      <EntryPanel symbol={ticker.symbol} />
                      <TradeLog symbol={ticker.symbol} />
                    </div>

                    <!-- Replay / Backtest panel -->
                    <ReplayPanel symbol={ticker.symbol} />

                    <!-- Per-ticker notes -->
                    <div class="mt-4 border-t border-border/30 pt-4">
                      <label class="block">
                        <span class="text-[13px] text-text-muted uppercase tracking-wider mb-1.5 block">
                          Notes — {ticker.symbol}
                        </span>
                        <textarea
                          class="w-full bg-surface-700/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-uncertain/50 resize-none font-mono leading-relaxed"
                          rows="3"
                          placeholder="Thesis, key levels, catalysts, reminders…"
                          value={getNotes(ticker.symbol)}
                          oninput={(e) => setNotes(ticker.symbol, e.currentTarget.value)}
                        ></textarea>
                      </label>
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

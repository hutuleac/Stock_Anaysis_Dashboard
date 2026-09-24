<script>
  import { tick, onMount } from 'svelte';
  import { getTickers, getSelectedSymbol, selectTicker, removeTicker, getTickerData, addTicker, reorderTickers } from '../stores/watchlist.svelte.js';
  import { searchTicker } from '../api/finnhub.svelte.js';
  import { computeScore, computeScoreZScore, getBadgeStyle, getDaysToEarnings, getScoreVelocity, getScoreHistory, getMarketContext, BADGE_BANDS } from '../scoring.js';
  import { tickerSetups } from '../radar.js';
  import { reconcileVerdict, readinessStyle, signalChips } from '../readiness.js';
  import { proximityTo52wHigh } from '../indicators.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';
  import { buildStockSnapshot, buildPrompt } from '../export.js';
  import { buildLongTermSetup } from '../longTermSetup.js';
  import { chipColor, statusStyle as ltStatusStyle, statusColor, timingHint, qualityHint, timingTone, qualityTone, timingRows, qualityRows } from '../longTermIndicators.js';
  import { toneColor } from '../tone.js';
  import { getTemplates, getDefaultId, getTemplate } from '../stores/prompts.svelte.js';
  import EntryPanel from './EntryPanel.svelte';
  import ThesisSummary from './ThesisSummary.svelte';
  import PriceChart from './PriceChart.svelte';
  import FundamentalsBar from './FundamentalsBar.svelte';

  // filterSymbols: set by the scan summary (App) — show only these tickers.
  let { onTickerAdded = () => {}, onTickerExpand = () => {}, filterSymbols = null, onClearFilter = () => {} } = $props();

  // Shared by the Signals column and the expanded row, so both read the same engines.
  const dipCtx = () => {
    const mc = getMarketContext();
    return { fearGreedValue: mc?.fearGreedValue ?? null, spyBelowEma50: mc?.spyDowntrend ?? null };
  };
  const ltSetupFor = (data) => (data?.timingScore || data?.qualityScore)
    ? buildLongTermSetup(data.timingScore ?? null, data.qualityScore ?? null, { fearGreed: getMarketContext()?.fearGreedValue ?? null, creditStress: getMarketContext()?.macro?.creditStress ?? null })
    : null;
  const rowSignals = (symbol, data) => signalChips(tickerSetups(symbol, data, dipCtx()), ltSetupFor(data));
  const LT_CHIP = { ACCUMULATE: 'ACCUM', OVERSOLD_BUT_CAUTION: 'CHECK Q', WATCHLIST: 'WATCH' };

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

  // Gates which breakpoint's expandedPanel mounts, so PriceChart/NewsPanel
  // don't double-mount (one hidden via CSS, one visible) whenever a ticker is selected.
  let isMobile = $state(false);
  onMount(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    isMobile = mq.matches;
    const update = (e) => (isMobile = e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  });

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
  let copyFallback = $state(null);   // { symbol, text } — shown when clipboard write fails, so mobile users can still select+copy manually
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  // Mobile expansion sections — per-session; state carries across ticker opens.
  let openSections = $state({ chart: true, entry: true, indicators: false, longterm: false });
  function toggleSection(k) { openSections[k] = !openSections[k]; }

  function buildAiText(ticker, templateId) {
    const tpl = getTemplate(templateId ?? getDefaultId());
    if (!tpl) return null;
    const d = getTickerData(ticker.symbol);
    const snapshot = buildStockSnapshot(ticker, d, getMarketContext());
    return buildPrompt(tpl.body, snapshot, ticker.symbol);
  }

  async function copyForAI(ticker, templateId) {
    const text = buildAiText(ticker, templateId);
    if (text === null) return;
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
    // Clipboard permissions are commonly blocked in mobile in-app browsers (e.g. Instagram/FB
    // webviews) with no error surfaced beyond a rejected promise — give those users a manual
    // select-and-copy escape hatch instead of a dead-end "Copy failed" label.
    copyFallback = ok ? null : { symbol: ticker.symbol, text };
    setTimeout(() => { copyState = null; }, 1500);
  }

  // Native share sheet — on mobile this is more reliable than clipboard (works in webviews that
  // block clipboard access) and drops the prompt directly into the target AI app/Notes/Messages.
  async function shareForAI(ticker, templateId) {
    const text = buildAiText(ticker, templateId);
    if (text === null) return;
    copyMenuSymbol = null;
    try {
      await navigator.share({ title: `${ticker.symbol} — AI analysis prompt`, text });
    } catch (err) {
      if (err?.name !== 'AbortError') copyFallback = { symbol: ticker.symbol, text };
    }
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
  let searchToken = 0;
  let dragIndex = $state(null);

  async function handleSearch() {
    if (searchQuery.length < 2) {
      searchResults = [];
      searchError = false;
      return;
    }
    const token = ++searchToken;
    searching = true;
    searchError = false;
    try {
      const result = await searchTicker(searchQuery);
      if (token !== searchToken) return; // stale response — a newer search superseded this one
      searchResults = result.data || result || [];
    } catch {
      if (token !== searchToken) return;
      searchResults = [];
      searchError = true;
    }
    if (token === searchToken) searching = false;
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
    const list = filterSymbols ? getTickers().filter(t => filterSymbols.includes(t.symbol)) : [...getTickers()];
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
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return list;
  }

  function formatPrice(val) {
    if (!val) return '—'; // 0 = no quote for this symbol
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
  // Same bands as the badge (BADGE_BANDS) — number colour, bar and badge agree.
  function scoreStyle(s) {
    const b = BADGE_BANDS.find(b => s >= b.min);
    return { color: b.tone === 'none' ? '#9ca3af' : toneColor(b.tone), label: b.label };
  }
  // 0–100 bar segments, lowest band first: [0–28) [28–42) [42–58) [58–72) [72–100]
  const BAND_SEGMENTS = [...BADGE_BANDS].reverse()
    .map((b, i, arr) => ({ tone: b.tone, w: (arr[i + 1]?.min ?? 100) - b.min }));

  function fmtRevenue(val) {
    if (val == null) return '—';
    if (Math.abs(val) >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
    if (Math.abs(val) >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
    if (Math.abs(val) >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
    return `$${val.toFixed(0)}`;
  }

  const LT_CHIP_TIPS = {
    drawdown: 'ltDrawdown', oversold: 'ltOversold', reversal: 'ltReversal',
    consolidation: 'ltBase', volumeBehavior: 'ltVolume', marketContext: 'ltMarket',
    profitability: 'ltProfit', cashFlow: 'ltCash', balanceSheet: 'ltBalance',
    shareholderReturn: 'ltPayout', earningsQuality: 'ltEarnings',
  };

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
    {@const px = size === 'sm' ? 'text-[13px]' : 'text-[12px]'}
    {@const chipVis = size === 'sm' ? 'inline-block' : 'hidden lg:inline-block'}
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

  <!-- Readiness chips: the ticker's one home for what the scan panels say. -->
  {#snippet signalChipList(chips)}
    {#each chips as c}
      <span class="px-1.5 py-0.5 rounded text-[12px] font-semibold whitespace-nowrap" style={c.status ? ltStatusStyle(c.status) : readinessStyle(c.readiness)}>{c.label} {c.status ? LT_CHIP[c.status] : c.readiness}</span>
    {/each}
  {/snippet}

  {#snippet sectionHeader(key, label)}
    <button
      class="w-full flex items-center justify-between py-2.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wider"
      onclick={() => toggleSection(key)}
    >{label}<span class="text-text-muted">{openSections[key] ? '▾' : '▸'}</span></button>
  {/snippet}


  <!-- One 0–100 bar with the badge bands tinted and a marker at the score.
       T/F/S pillar scores live in its tooltip instead of three tiny bars. -->
  {#snippet scoreBar(score, cls)}
    {@const ss = scoreStyle(score.score)}
    <div class="relative h-1.5 shrink-0 cursor-default {cls}"
      use:tipAction={() => ({ ...TIPS.score, current: { value: String(score.score), label: `${ss.label} · T ${score.technical ?? '–'} · F ${score.fundamental ?? '–'} · S ${score.sentiment ?? '–'}`, color: ss.color } })}>
      <div class="absolute inset-0 flex rounded-full overflow-hidden">
        {#each BAND_SEGMENTS as seg}<div style="width:{seg.w}%; background:{toneColor(seg.tone)}; opacity:.35"></div>{/each}
      </div>
      <div class="absolute -top-1 w-1 h-3.5 rounded-sm -translate-x-1/2" style="left:{score.score}%; background:{ss.color}"></div>
    </div>
  {/snippet}

  <!-- `*` = the score was adjusted for the market regime; the tooltip says how. -->
  {#snippet adjustedMark(score)}
    {#if score.regimeNote || score.spyPenaltyApplied}
      <span class="text-warning cursor-default" use:tipAction={() => ({
        title: 'Score adjusted for market regime',
        description: [score.regimeNote, score.spyPenaltyApplied ? 'SPY is below its EMA50, so long scores are pulled 20% toward 50' : null].filter(Boolean).join('. ') + '.',
      })}>*</span>
    {/if}
  {/snippet}

  <!-- Long-Term Setup + thesis + trade window — the "why" card. -->
  <!-- One Long-Term score: total + distance to the next band, then one row per
       component (score bar · the reading behind it · points left), biggest gap
       first — so the top row is what the entry is waiting on. -->
  {#snippet ltSection(title, total, color, hint, tip, rows)}
    <div>
      <div class="flex flex-wrap items-baseline gap-x-2 mb-1 text-[13px]">
        <span class="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-default" use:tipAction={tip}>{title}</span>
        <span class="font-mono font-semibold" style="color:{color}">{total ?? 'n/a'}<span class="text-text-muted font-normal">/100</span></span>
        {#if hint}<span class="text-text-muted">· {hint}</span>{/if}
      </div>
      <div class="space-y-1">
        {#each rows as c}
          <div class="flex flex-wrap items-baseline gap-x-2 text-[13px] cursor-default"
            use:tipAction={() => ({ ...TIPS[LT_CHIP_TIPS[c.key]], current: { value: c.score == null ? 'no data' : `${c.score}/${c.max}`, label: '', color: chipColor(c.score, c.max) } })}>
            <span class="w-[4.5rem] sm:w-20 shrink-0 text-text-secondary">{c.label}</span>
            <span class="w-10 sm:w-16 h-1.5 shrink-0 self-center rounded-full bg-surface-700 overflow-hidden">
              <span class="block h-full rounded-full" style="width:{c.score == null ? 0 : (c.score / c.max) * 100}%; background:{chipColor(c.score, c.max)}"></span>
            </span>
            <span class="w-12 shrink-0 font-mono text-text-muted">{c.score ?? '–'}/{c.max}</span>
            <span class="sm:w-16 shrink-0 font-mono text-[12px]" style="color:{c.gap ? toneColor('partial') : 'var(--color-text-muted)'}">{c.gap ? `+${c.gap} left` : c.gap === 0 ? 'maxed' : ''}</span>
            <span class="basis-full min-w-0 pl-[5rem] sm:pl-[5.5rem] text-[12px] text-text-muted">
              {#each c.notes as n, i}{i ? ' · ' : ''}<span class={n.warn ? 'text-bear-strong/80' : ''}>{n.warn ? '⚠ ' : ''}{n.text}</span>{/each}
              {#if c.score == null}no data{/if}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/snippet}

  {#snippet ltCard(ticker, data, setup, daysToEarnings)}
    <div class="mb-3 px-3 py-3 rounded-lg bg-surface-800/60 border border-border/40 space-y-3">
      {#if setup}
        {@const tTotal = data.timingScore?.total ?? null}
        {@const qTotal = data.qualityScore?.total ?? null}
        <!-- Verdict first, once: badge + the matrix's own sentence. -->
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-default" use:tipAction={TIPS.ltStatus}>Long-Term Setup</span>
            <span class="text-xs px-1.5 py-0.5 rounded font-semibold cursor-default" style={ltStatusStyle(setup.status)}
              use:tipAction={() => ({ ...TIPS.ltStatus, current: { value: setup.status.replace(/_/g, ' '), label: '', color: 'inherit' } })}
            >{setup.status === 'OVERSOLD_BUT_CAUTION' ? 'CHECK QUALITY' : setup.status.replace(/_/g, ' ')}</span>
          </div>
          {#each setup.reasons as reason, i}
            <p class="text-sm" style={i === 0 ? `color:${statusColor(setup.status)}` : 'color:var(--color-text-muted)'}>{reason}</p>
          {/each}
        </div>

        <!-- Timing | Quality side by side. -->
        <div class="grid lg:grid-cols-2 gap-x-8 gap-y-3">
          {@render ltSection('Timing', tTotal, toneColor(timingTone(tTotal)), timingHint(tTotal), TIPS.ltTiming, data.timingScore ? timingRows(data.timingScore) : [])}

          <div class="space-y-3">
            {#if data.qualityScore}
              {@render ltSection('Quality', qTotal, toneColor(qualityTone(qTotal)), qualityHint(qTotal), TIPS.ltQuality, qualityRows(data.qualityScore))}
            {:else}
              <p class="text-[13px] text-text-muted"><span class="uppercase tracking-wider">Quality</span> · not checked yet</p>
            {/if}

          </div>
        </div>
      {/if}

      <!-- Why this score + trade window | Revenue (5y) on the right. -->
      <div class="grid {data.revenueHistory?.length ? 'lg:grid-cols-2' : ''} gap-x-8 gap-y-3 {setup ? 'pt-2.5 border-t border-border/30' : ''}">
        <div class="space-y-2.5">
          <ThesisSummary symbol={ticker.symbol} />

          {#if daysToEarnings !== null}
            <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg border {daysToEarnings <= 7 ? 'bg-danger/10 border-danger/40' : daysToEarnings <= 14 ? 'bg-warning/10 border-warning/40' : 'bg-surface-700/50 border-border/40'}">
              <span class="text-lg shrink-0">{daysToEarnings <= 7 ? '🚨' : daysToEarnings <= 14 ? '⚠️' : '📅'}</span>
              <div class="min-w-0">
                <p class="text-sm font-semibold leading-tight {daysToEarnings <= 7 ? 'text-danger' : daysToEarnings <= 14 ? 'text-warning' : 'text-text-secondary'}">
                  Trade window: {daysToEarnings === 0 ? 'Earnings today' : daysToEarnings === 1 ? '1 day left' : `${daysToEarnings} days left`}
                </p>
                <p class="text-xs text-text-muted leading-snug">
                  {daysToEarnings <= 7 ? 'Binary event risk — size down or wait for post-earnings.' : daysToEarnings <= 14 ? 'Factor earnings into hold time and size.' : 'Earnings not imminent — window is open.'}
                </p>
              </div>
            </div>
          {/if}
        </div>

        <!-- Revenue history (lazy — same financials-reported fetch as Quality Score).
             Bars scale from zero in a fixed-height plot; labels sit outside it so
             the tallest bar is never squeezed to the same height as the next. -->
        {#if data.revenueHistory?.length}
          {@const maxRev = Math.max(...data.revenueHistory.map(r => r.revenue))}
          <div>
            <div class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1 cursor-default" use:tipAction={TIPS.revenueHistory}>Revenue (5y)</div>
            <div class="grid grid-cols-5 gap-2 max-w-sm text-center">
              {#each data.revenueHistory as r}
                {@const barColor = r.growthPct == null ? '#6b7280' : r.growthPct >= 0 ? '#22c55e' : '#ef4444'}
                <div class="cursor-default"
                  use:tipAction={() => ({ ...TIPS.revenueGrowth, current: { value: fmtRevenue(r.revenue), label: r.growthPct == null ? `FY${r.year}` : `${r.growthPct > 0 ? '+' : ''}${r.growthPct.toFixed(1)}% · FY${r.year}`, color: barColor } })}>
                  <div class="h-20 flex flex-col justify-end">
                    <div class="text-[12px] font-mono text-text-secondary">{fmtRevenue(r.revenue).replace('.0', '')}</div>
                    <div class="w-full rounded-t shrink-0" style="height:{maxRev > 0 ? Math.max(0.15, (r.revenue / maxRev) * 3) : 0.1}rem; background:{barColor}; opacity:.8"></div>
                  </div>
                  <div class="text-[12px] font-mono pt-0.5" style="color:{barColor}">{r.growthPct == null ? '—' : `${r.growthPct > 0 ? '+' : ''}${Math.round(r.growthPct)}%`}</div>
                  <div class="text-[12px] text-text-muted">FY{String(r.year).slice(2)}</div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/snippet}

  <!-- Four setup engines, one row each, with the readiness their panels show. -->
  {#snippet setupRows(rows, setup)}
    {@const gapText = (w) => w?.length ? w.map(g => `${g.label} +${g.gap}`).join(' · ') : ''}
    <div class="space-y-1">
      <div class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">Setups</div>
      {#each [['Pullback', rows.pullback], ['Breakout', rows.momentum]] as [label, r]}
        <div class="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 text-[13px]">
          <span class="w-20 shrink-0 text-text-secondary">{label}</span>
          <span class="w-14 text-center rounded text-[12px] font-semibold shrink-0" style={readinessStyle(r.readiness)}>{r.readiness}</span>
          <span class="font-mono text-text-muted w-12 shrink-0">{r.score != null ? `${r.score}/10` : '—'}</span>
          {#if r.readiness !== 'WAIT' && !r.inRadar}
            <span class="text-text-muted basis-full sm:basis-auto sm:flex-1 min-w-0 pl-[5.5rem] sm:pl-0">filtered out by the {label === 'Breakout' ? 'leaders / quality' : 'quality'} gate</span>
          {:else if r.waitingOn.length}
            <span class="text-text-muted basis-full sm:basis-auto sm:flex-1 min-w-0 pl-[5.5rem] sm:pl-0">waiting on {gapText(r.waitingOn)}</span>
          {/if}
        </div>
      {/each}
      <div class="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 text-[13px]">
        <span class="w-20 shrink-0 text-text-secondary">Dip</span>
        <span class="w-14 text-center rounded text-[12px] font-semibold shrink-0" style={readinessStyle(rows.dip?.readiness ?? 'WAIT')}>{rows.dip?.readiness ?? 'WAIT'}</span>
        <span class="font-mono text-text-muted w-12 shrink-0">{rows.dip ? `${rows.dip.score}/10` : '—'}</span>
        <span class="text-text-muted basis-full sm:basis-auto sm:flex-1 min-w-0 pl-[5.5rem] sm:pl-0">{rows.dip ? [rows.dip.tierHint, gapText(rows.dip.waitingOn) && `waiting on ${gapText(rows.dip.waitingOn)}`].filter(Boolean).join(' · ') : 'not a quality dip right now'}</span>
      </div>
      <div class="flex flex-wrap sm:flex-nowrap items-baseline gap-x-2 text-[13px]">
        <span class="w-20 shrink-0 text-text-secondary">Long-term</span>
        {#if setup}
          <span class="px-1.5 rounded text-[12px] font-semibold shrink-0" style={ltStatusStyle(setup.status)}>{setup.status === 'OVERSOLD_BUT_CAUTION' ? 'CHECK QUALITY' : setup.status.replace(/_/g, ' ')}</span>
          <span class="text-text-muted basis-full sm:basis-auto sm:flex-1 min-w-0 pl-[5.5rem] sm:pl-0">{setup.reasons?.[0] ?? ''}</span>
        {:else}
          <span class="text-text-muted basis-full sm:basis-auto sm:flex-1 min-w-0 pl-[5.5rem] sm:pl-0">no timing data yet</span>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet expandedPanel(ticker, data, score, variant)}
    {@const setup = ltSetupFor(data)}
    {@const daysToEarnings = getDaysToEarnings(data?.earnings)}
    {@const rows = tickerSetups(ticker.symbol, data, dipCtx())}
    {@const verdict = reconcileVerdict(score.badge, { ...rows, longTerm: setup })}
    {@const su = topSetup(data?.setups)}
    {@const playbook = su?.kind === 'BREAKOUT' ? 'trend' : su ? 'pullback' : 'all'}
    {#if variant === 'desktop'}
      {#if verdict}<p class="text-sm font-medium mb-3" style="color:{toneColor(verdict.tone)}">{verdict.text}</p>{/if}
      <div class="mb-4">
        <PriceChart symbol={ticker.symbol} />
      </div>
      <div class="mb-4 grid lg:grid-cols-2 gap-x-6 gap-y-4">
        <EntryPanel symbol={ticker.symbol} />
        {@render setupRows(rows, setup)}
      </div>
      <div class="mb-4">
        <FundamentalsBar symbol={ticker.symbol} defaultView={playbook} />
      </div>
      {@render ltCard(ticker, data, setup, daysToEarnings)}
      <!-- AI export toolbar -->
      <div class="flex items-center justify-end gap-1 mb-3 relative">
        <button
          class="text-xs px-3 py-1.5 rounded-lg bg-surface-700 border border-border text-text-secondary hover:text-text-primary transition-colors"
          onclick={() => copyForAI(ticker)}
        >{copyState?.symbol === ticker.symbol ? (copyState.ok ? 'Copied ✓' : 'Copy failed') : '🤖 Copy for AI'}</button>
        {#if canShare}
          <button
            class="text-xs px-2.5 py-1.5 rounded-lg bg-surface-700 border border-border text-text-muted hover:text-text-secondary transition-colors"
            title="Share prompt"
            onclick={() => shareForAI(ticker)}
          >📤</button>
        {/if}
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
    {:else}
      <!-- The mobile card above already shows badge + score bar; only the sentence is new. -->
      {#if verdict}<p class="text-sm font-medium mb-2" style="color:{toneColor(verdict.tone)}">{verdict.text}</p>{/if}
      <div class="mb-2">{@render setupRows(rows, setup)}</div>

      <!-- Mobile: collapsible sections -->
      <div class="border-t border-border/30">
        {@render sectionHeader('chart', 'Chart')}
        {#if openSections.chart}
          <!-- Full-bleed: cancel the expansion card's px-4 so the chart uses the lateral space -->
          <div class="pb-3 -mx-4"><PriceChart symbol={ticker.symbol} /></div>
        {/if}
      </div>

      <div class="border-t border-border/30">
        {@render sectionHeader('entry', 'Entry & Risk')}
        {#if openSections.entry}
          <div class="pb-3"><EntryPanel symbol={ticker.symbol} /></div>
        {/if}
      </div>

      <div class="border-t border-border/30">
        {@render sectionHeader('indicators', 'Indicators')}
        {#if openSections.indicators}
          <div class="pb-3"><FundamentalsBar symbol={ticker.symbol} defaultView={playbook} /></div>
        {/if}
      </div>

      <div class="border-t border-border/30">
        {@render sectionHeader('longterm', 'Long-term & thesis')}
        {#if openSections.longterm}
          <div class="pb-3">{@render ltCard(ticker, data, setup, daysToEarnings)}</div>
        {/if}
      </div>

      <!-- Sticky action bar -->
      <div class="sticky bottom-0 -mx-4 -mb-4 mt-4 px-4 py-2.5 bg-surface-800 border-t border-border flex items-center gap-2">
        <button class="flex-1 text-xs px-3 py-2.5 rounded-lg bg-surface-700 border border-border text-text-secondary"
          onclick={() => copyForAI(ticker)}
        >{copyState?.symbol === ticker.symbol ? (copyState.ok ? 'Copied ✓' : 'Copy failed') : '🤖 Copy for AI'}</button>
        {#if canShare}
          <button class="text-xs px-3 py-2.5 rounded-lg bg-surface-700 border border-border text-text-muted"
            title="Share prompt"
            onclick={() => shareForAI(ticker)}
          >📤</button>
        {/if}
        <button class="text-xs px-3 py-2.5 rounded-lg bg-surface-700 border border-border text-text-muted hover:text-danger"
          onclick={() => removeTicker(ticker.symbol)}
        >✕</button>
      </div>
    {/if}
  {/snippet}

  {#if filterSymbols}
    <div class="flex items-center gap-2 mb-2 text-xs text-text-muted">
      <span>Showing {getSortedTickers().length} of {getTickers().length}</span>
      <button class="px-2 py-0.5 rounded bg-surface-700 text-text-secondary hover:text-text-primary" onclick={onClearFilter}>clear filter ✕</button>
    </div>
  {/if}

  <!-- ── Mobile card layout (< sm) ─────────────────────────────────────────── -->
  {#if isMobile && getTickers().length > 0}
    <div class="space-y-2 mb-4">
      {#each getSortedTickers() as ticker}
        {@const data = getTickerData(ticker.symbol)}
        {@const chips = rowSignals(ticker.symbol, data)}
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
          <!-- Row 1: ticker + sector + badge + earnings badge -->
          <div class="flex items-start justify-between mb-1.5">
            <div class="flex items-center gap-2 flex-wrap min-w-0">
              <span class="font-mono font-bold text-text-primary">{ticker.symbol}</span>
              {#if daysToEarnings !== null && daysToEarnings <= 14}
                <span class="text-[13px] font-semibold text-warning bg-warning/10 px-1 rounded">E {daysToEarnings}d</span>
              {/if}
              <span class="text-[13px] text-text-secondary truncate">{ticker.sector || '—'}</span>
            </div>
            <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold shrink-0 {badge.bg} {badge.text}">{badge.label}</span>
          </div>

          <!-- Row 1.5: signal chips first, then context chips — wrap under the ticker -->
          {#if chips.length || rsChip(data?.rs) || emaStackChip(data?.indicators) || high52wChip(data)}
            <div class="flex flex-wrap gap-1.5 mt-1">
              {@render signalChipList(chips)}
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
                <div class="flex flex-col items-start leading-tight text-[13px]">
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

          <!-- Row 3: banded score bar (T/F/S in its tooltip) -->
          {#if score.score !== null}
            <div class="flex items-center gap-2 mt-2">{@render scoreBar(score, 'flex-1')}{@render adjustedMark(score)}</div>
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
  {:else if !isMobile}
    <div class="overflow-x-auto">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border text-xs text-text-muted uppercase tracking-wider">
            <th class="w-8 px-2 py-3 hidden sm:table-cell"></th>
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
            <th class="px-3 py-3 text-center hidden sm:table-cell cursor-default" use:tipAction={TIPS.setupBadge}>Setup</th>
            <th class="px-3 py-3 text-left hidden md:table-cell">Signals</th>
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
            {@const velocity = getScoreVelocity(ticker.symbol)}
            {@const scoreHistory = getScoreHistory(ticker.symbol)}
            {@const scoreZ = computeScoreZScore(ticker.symbol)}
            {@const chips = rowSignals(ticker.symbol, data)}

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
                  <span class="hidden md:inline-flex items-center gap-2">{@render tickerChips(data, 'xs')}</span>
                </div>
                <div class="text-xs text-text-secondary truncate max-w-[180px]">{ticker.sector || '—'}</div>
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
                      <span class="font-mono font-semibold tabular-nums">{score.score}</span>{@render adjustedMark(score)}
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
                  <div class="hidden sm:flex justify-end mt-1.5">{@render scoreBar(score, 'w-24')}</div>
                {:else}
                  <span class="text-text-muted">—</span>
                {/if}
              </td>
              <td class="px-3 py-3 text-center hidden sm:table-cell">
                <span class="inline-block px-2 py-0.5 rounded text-xs font-semibold {badge.bg} {badge.text}">
                  {badge.label}
                </span>
              </td>
              <td class="px-3 py-3 hidden md:table-cell">
                <div class="flex flex-wrap gap-1">{#if chips.length}{@render signalChipList(chips)}{:else}<span class="text-text-muted text-xs">—</span>{/if}</div>
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

  <!-- Manual copy fallback — clipboard writes are silently blocked in some mobile in-app
       browsers (Instagram/FB webviews etc). Shows the prompt in a selectable textarea so the
       user can still long-press → Copy even when the Clipboard API is unavailable. -->
  {#if copyFallback}
    <div class="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4" onclick={() => { copyFallback = null; }}>
      <div class="bg-surface-800 border border-border rounded-lg w-full max-w-lg p-4" onclick={(e) => e.stopPropagation()}>
        <div class="flex items-center justify-between mb-2">
          <p class="text-sm font-semibold text-text-primary">Copy prompt for {copyFallback.symbol}</p>
          <button class="text-text-muted hover:text-text-primary p-1" onclick={() => { copyFallback = null; }}>✕</button>
        </div>
        <p class="text-xs text-text-muted mb-2">Automatic copy didn't work here — tap the text below to select it, then copy.</p>
        <textarea
          readonly
          class="w-full h-56 text-xs font-mono bg-surface-900 border border-border rounded p-2 text-text-secondary"
          onclick={(e) => e.target.select()}
          value={copyFallback.text}
        ></textarea>
      </div>
    </div>
  {/if}
</div>

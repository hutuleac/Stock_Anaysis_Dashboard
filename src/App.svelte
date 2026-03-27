<script>
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, fetchMarketContext, isStorageFull, clearStorageFullFlag } from './lib/api/finnhub.svelte.js';
  import { getTickers, getSymbols, setMarketData, getTickerData, selectTicker, getSelectedSymbol } from './lib/stores/watchlist.svelte.js';
  import { getTrades, getRealizedPnL } from './lib/stores/tradelog.svelte.js';
  import { getPositions } from './lib/stores/portfolio.svelte.js';
  import { checkAlerts, getTriggered, dismissTriggered } from './lib/stores/alerts.svelte.js';
  import { setEarningsAnswer, setSectorAnswer } from './lib/stores/checklist.svelte.js';
  import { getDaysToEarnings, computeScore, storeScoreSnapshot } from './lib/scoring.js';
  import WatchlistTable from './lib/components/WatchlistTable.svelte';
  import PortfolioStats from './lib/components/PortfolioStats.svelte';
  import MarketContextBar from './lib/components/MarketContextBar.svelte';
  import SettingsPanel from './lib/components/SettingsPanel.svelte';
  import OnboardingModal from './lib/components/OnboardingModal.svelte';

  let settingsOpen = $state(false);
  let showOnboarding = $state(!getApiKey());
  let lastRefreshed = $state(null);
  let offline = $state(!navigator.onLine);
  let refreshError = $state('');
  let marketContextData = $state(null);
  let marketBarCollapsed = $state(false);
  let marketStatus = $state(getMarketStatus());

  function getMarketStatus() {
    const now = new Date();
    // Convert to US Eastern time
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay(); // 0=Sun, 6=Sat
    const h = et.getHours(), min = et.getMinutes();
    const mins = h * 60 + min;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && mins >= 570 && mins < 960; // 9:30–16:00

    let nextEvent = null;
    if (isOpen) {
      const closeMin = 960 - mins;
      nextEvent = `Closes in ${Math.floor(closeMin / 60)}h ${closeMin % 60}m`;
    } else {
      // Next open: find next weekday 9:30
      let minsToOpen = (570 - mins + 1440) % 1440;
      if (!isWeekday) {
        const daysToMon = day === 0 ? 1 : 7 - day + 1;
        minsToOpen = daysToMon * 1440 - mins + 570;
      } else if (mins >= 960) {
        const daysToNext = day === 5 ? 3 : 1;
        minsToOpen = daysToNext * 1440 - mins + 570;
      }
      const h2 = Math.floor(minsToOpen / 60), m2 = minsToOpen % 60;
      nextEvent = h2 > 23 ? `Opens ${Math.floor(h2/24)}d ${h2%24}h` : `Opens in ${h2}h ${m2}m`;
    }
    return { isOpen, nextEvent };
  }

  // Refresh market status every minute
  if (typeof window !== 'undefined') {
    setInterval(() => { marketStatus = getMarketStatus(); }, 60000);
  }

  // Load last refresh timestamp
  try {
    const saved = localStorage.getItem('lastRefreshed');
    if (saved) lastRefreshed = new Date(parseInt(saved));
  } catch { /* noop */ }

  // Online/offline detection
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => offline = false);
    window.addEventListener('offline', () => offline = true);

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        selectTicker(null);
      } else if (e.key === 'r' && !isInput && !e.ctrlKey && !e.metaKey) {
        handleRefresh();
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        document.querySelector('input[placeholder*="Search ticker"]')?.focus();
      } else if ((e.key === 'j' || e.key === 'k') && !isInput) {
        e.preventDefault();
        const symbols = getSymbols();
        if (!symbols.length) return;
        const currentIdx = symbols.indexOf(getSelectedSymbol() ?? '');
        const nextIdx = e.key === 'j'
          ? (currentIdx + 1) % symbols.length
          : (currentIdx <= 0 ? symbols.length - 1 : currentIdx - 1);
        selectTicker(symbols[nextIdx]);
      }
    });
  }

  function handleOnboardingComplete() {
    showOnboarding = false;
    handleRefresh();
  }

  async function handleRefresh() {
    if (!getApiKey() || isRefreshing()) return;
    refreshError = '';

    const symbols = getSymbols();
    if (symbols.length === 0) return;

    try {
      // Fetch market context first (VIX, SPY, sectors)
      try {
        marketContextData = await fetchMarketContext();
      } catch { /* non-blocking — market context is informational */ }

      const results = await refreshAll(symbols);
      setMarketData(results);

      // Process auto-answers for checklist
      const tickers = getTickers();
      for (const ticker of tickers) {
        const data = results[ticker.symbol];
        if (!data) continue;

        // Earnings auto-answer (Q2)
        const daysToEarnings = getDaysToEarnings(data.earnings);
        if (data.earnings.stale && !data.earnings.data) {
          setEarningsAnswer(ticker.symbol, null); // API failed
        } else {
          setEarningsAnswer(ticker.symbol, daysToEarnings ?? 999); // no earnings = safe
        }

        // Sector trend auto-answer (Q3) + store for scoring engine
        try {
          const etfQuote = await fetchSectorETFQuote(ticker.sector);
          if (etfQuote.stale && !etfQuote.data) {
            setSectorAnswer(ticker.symbol, null);
            results[ticker.symbol].sectorTrend = null;
          } else if (etfQuote.data) {
            const isDowntrend = etfQuote.data.dp < -1;
            setSectorAnswer(ticker.symbol, isDowntrend);
            results[ticker.symbol].sectorTrend = isDowntrend;
          }
        } catch {
          setSectorAnswer(ticker.symbol, null);
        }
      }

      // Check price alerts
      checkAlerts(results);

      // Store score snapshots for velocity tracking
      for (const ticker of tickers) {
        const data = results[ticker.symbol];
        if (data) storeScoreSnapshot(ticker.symbol, computeScore(data).score);
      }

      lastRefreshed = new Date();
      try { localStorage.setItem('lastRefreshed', String(lastRefreshed.getTime())); } catch { /* noop */ }
    } catch (err) {
      refreshError = err.message;
    }
  }

  function formatTime(date) {
    if (!date) return 'Never';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<!-- Onboarding -->
{#if showOnboarding}
  <OnboardingModal onComplete={handleOnboardingComplete} />
{/if}

<div class="min-h-screen bg-surface-900">
  <!-- Header -->
  <header class="border-b border-border bg-surface-800/50 backdrop-blur-sm sticky top-0 z-30">
    <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-bold text-text-primary tracking-tight">
          <span class="hidden sm:inline">Stock Dashboard</span>
          <span class="sm:hidden">StockDash</span>
        </h1>
        <span class="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded">v0.2</span>
      </div>

      <div class="flex items-center gap-3">
        <!-- Market status -->
        <div class="hidden sm:flex items-center gap-1.5 text-xs">
          <span class="w-1.5 h-1.5 rounded-full {marketStatus.isOpen ? 'bg-bull-strong animate-pulse' : 'bg-surface-500'}"></span>
          <span class="{marketStatus.isOpen ? 'text-bull-strong' : 'text-text-muted'}">{marketStatus.isOpen ? 'OPEN' : 'CLOSED'}</span>
          <span class="text-text-muted">{marketStatus.nextEvent}</span>
        </div>

        <!-- Refresh button + progress -->
        {#if isRefreshing()}
          <div class="flex items-center gap-2 text-sm text-text-secondary">
            <div class="w-3.5 h-3.5 border-2 border-bull-strong border-t-transparent rounded-full animate-spin"></div>
            <span class="font-mono text-xs">
              {getRefreshProgress().current}/{getRefreshProgress().total}
            </span>
          </div>
        {:else}
          <button
            class="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-surface-700 hover:bg-surface-600 text-text-secondary hover:text-text-primary rounded-lg transition-colors disabled:opacity-40"
            onclick={handleRefresh}
            disabled={!getApiKey() || getTickers().length === 0}
          >
            <span>↻</span> Refresh
          </button>
        {/if}

        <!-- Last refreshed -->
        <span class="text-xs text-text-muted hidden sm:inline">
          {lastRefreshed ? formatTime(lastRefreshed) : ''}
        </span>

        <!-- Settings gear -->
        <button
          class="p-2 text-text-muted hover:text-text-primary transition-colors"
          onclick={() => settingsOpen = true}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    {#if isRefreshing()}
      <div class="h-0.5 bg-surface-700">
        <div
          class="h-full bg-bull-strong transition-all duration-300"
          style="width: {(getRefreshProgress().current / Math.max(getRefreshProgress().total, 1)) * 100}%"
        ></div>
      </div>
    {/if}
  </header>

  <!-- Offline banner -->
  {#if offline}
    <div class="bg-warning/10 border-b border-warning/30 px-4 py-2 text-center">
      <span class="text-sm text-warning">
        Offline — showing cached data {lastRefreshed ? `from ${formatTime(lastRefreshed)}` : ''}
      </span>
    </div>
  {/if}

  <!-- Storage full warning -->
  {#if isStorageFull()}
    <div class="bg-warning/10 border-b border-warning/30 px-4 py-2 text-center">
      <span class="text-sm text-warning">Storage full — old cache data may not be saving. Clear cache in Settings.</span>
      <button class="text-xs text-text-muted ml-2 hover:text-text-secondary" onclick={clearStorageFullFlag}>dismiss</button>
    </div>
  {/if}

  <!-- Price alert notifications -->
  {#each getTriggered() as alert (alert.id)}
    <div class="bg-bull-strong/10 border-b border-bull-strong/30 px-4 py-2 flex items-center justify-between">
      <span class="text-sm text-bull-strong font-semibold">
        🔔 {alert.symbol} hit ${alert.targetPrice.toFixed(2)} — now at ${alert.currentPrice.toFixed(2)}
      </span>
      <button class="text-xs text-text-muted hover:text-text-secondary ml-4" onclick={() => dismissTriggered(alert.id)}>dismiss</button>
    </div>
  {/each}

  <!-- Refresh error -->
  {#if refreshError}
    <div class="bg-danger/10 border-b border-danger/30 px-4 py-2 text-center">
      <span class="text-sm text-danger">Refresh failed: {refreshError}</span>
      <button class="text-xs text-text-muted ml-2 hover:text-text-secondary" onclick={() => refreshError = ''}>dismiss</button>
    </div>
  {/if}

  <!-- Market Context Bar -->
  <MarketContextBar marketData={marketContextData} bind:collapsed={marketBarCollapsed} />

  <!-- Main content -->
  <main class="max-w-6xl mx-auto px-4 py-6">
    <WatchlistTable onTickerAdded={handleRefresh} />

    <PortfolioStats />

    <!-- Portfolio summary strip -->
    {#if getTrades().length > 0 || getPositions().length > 0}
      {@const tradeSymbols = [...new Set(getTrades().map(t => t.symbol))]}
      {@const totalRealized = tradeSymbols.reduce((sum, s) => sum + getRealizedPnL(s), 0)}
      {@const openPositions = getPositions().length}
      {@const totalTrades = getTrades().length}
      <div class="mt-6 border-t border-border/50 pt-4 flex flex-wrap gap-6 text-xs text-text-muted">
        <span class="flex items-center gap-1.5">
          <span>Realized P&L:</span>
          <span class="font-mono font-semibold {totalRealized >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">
            {totalRealized >= 0 ? '+' : ''}${Math.abs(totalRealized).toFixed(2)}
          </span>
        </span>
        {#if openPositions > 0}
          <span>{openPositions} open position{openPositions > 1 ? 's' : ''}</span>
        {/if}
        <span>{totalTrades} trade{totalTrades > 1 ? 's' : ''} logged</span>
        <span class="ml-auto hidden sm:block text-[10px]">
          Shortcuts: <kbd class="bg-surface-700 px-1 rounded">R</kbd> refresh &nbsp;
          <kbd class="bg-surface-700 px-1 rounded">Esc</kbd> close &nbsp;
          <kbd class="bg-surface-700 px-1 rounded">/</kbd> search &nbsp;
          <kbd class="bg-surface-700 px-1 rounded">J</kbd><kbd class="bg-surface-700 px-1 rounded">K</kbd> navigate
        </span>
      </div>
    {:else}
      <div class="mt-6 border-t border-border/50 pt-3 flex justify-end">
        <span class="text-[10px] text-text-muted hidden sm:block">
          Shortcuts: <kbd class="bg-surface-700 px-1 rounded">R</kbd> refresh &nbsp;
          <kbd class="bg-surface-700 px-1 rounded">Esc</kbd> close &nbsp;
          <kbd class="bg-surface-700 px-1 rounded">/</kbd> search &nbsp;
          <kbd class="bg-surface-700 px-1 rounded">J</kbd><kbd class="bg-surface-700 px-1 rounded">K</kbd> navigate
        </span>
      </div>
    {/if}
  </main>
</div>

<!-- Settings Panel -->
<SettingsPanel bind:open={settingsOpen} />

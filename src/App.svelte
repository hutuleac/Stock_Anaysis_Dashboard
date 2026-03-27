<script>
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, fetchMarketContext } from './lib/api/finnhub.svelte.js';
  import { getTickers, getSymbols, setMarketData, getTickerData } from './lib/stores/watchlist.svelte.js';
  import { setEarningsAnswer, setSectorAnswer } from './lib/stores/checklist.svelte.js';
  import { getDaysToEarnings, computeScore, storeScoreSnapshot } from './lib/scoring.js';
  import WatchlistTable from './lib/components/WatchlistTable.svelte';
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

  // Load last refresh timestamp
  try {
    const saved = localStorage.getItem('lastRefreshed');
    if (saved) lastRefreshed = new Date(parseInt(saved));
  } catch { /* noop */ }

  // Online/offline detection
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => offline = false);
    window.addEventListener('offline', () => offline = true);
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
        <h1 class="text-lg font-bold text-text-primary tracking-tight">Stock Dashboard</h1>
        <span class="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded">v0.1</span>
      </div>

      <div class="flex items-center gap-3">
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
  </main>
</div>

<!-- Settings Panel -->
<SettingsPanel bind:open={settingsOpen} />

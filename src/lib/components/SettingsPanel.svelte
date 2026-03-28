<script>
  import { getApiKey, setApiKey } from '../api/finnhub.svelte.js';
  import { getTDApiKey, setTDApiKey } from '../api/twelvedata.svelte.js';
  import { getPositions, setPositions, getPortfolioValue, setPortfolioValue } from '../stores/portfolio.svelte.js';

  let { open = $bindable(false) } = $props();

  let apiKeyInput = $state(getApiKey());
  let tdApiKeyInput = $state(getTDApiKey());
  let portfolioText = $state('');
  let portfolioValueInput = $state(getPortfolioValue() > 0 ? String(getPortfolioValue()) : '');
  let saveMessage = $state('');
  let autoRefreshInterval = $state(parseInt(localStorage.getItem('autoRefreshInterval') || '0'));

  function saveAutoRefresh(val) {
    autoRefreshInterval = val;
    localStorage.setItem('autoRefreshInterval', String(val));
    saveMessage = val === 0 ? 'Auto-refresh off' : `Auto-refresh set to ${val} min`;
    setTimeout(() => saveMessage = '', 2000);
  }

  // Initialize portfolio text from current positions
  $effect(() => {
    const positions = getPositions();
    if (positions.length > 0 && !portfolioText) {
      portfolioText = positions.map(p => `${p.ticker} ${p.qty} shares @ $${p.avgCost}`).join('\n');
    }
  });

  function saveApiKey() {
    setApiKey(apiKeyInput.trim());
    saveMessage = 'API key saved';
    setTimeout(() => saveMessage = '', 2000);
  }

  function saveTDApiKey() {
    setTDApiKey(tdApiKeyInput.trim());
    saveMessage = 'TwelveData key saved — refresh to load indicators';
    setTimeout(() => saveMessage = '', 3000);
  }

  function savePortfolioValue() {
    const val = parseFloat(portfolioValueInput.replace(/[,$]/g, ''));
    if (!isNaN(val) && val > 0) {
      setPortfolioValue(val);
      saveMessage = `Portfolio value set to $${val.toLocaleString()}`;
    } else {
      saveMessage = 'Enter a valid dollar amount';
    }
    setTimeout(() => saveMessage = '', 2500);
  }

  function parsePortfolio() {
    const lines = portfolioText.trim().split('\n').filter(l => l.trim());
    const parsed = [];

    for (const line of lines) {
      // Match patterns like: NVDA 10 shares @ $800  or  NVDA 10 @ 800  or  NVDA 10 800
      const match = line.match(/^(\w+)\s+(\d+)\s*(?:shares?\s*)?(?:@\s*\$?)(\d+(?:\.\d+)?)/i);
      if (match) {
        parsed.push({ ticker: match[1].toUpperCase(), qty: parseInt(match[2]), avgCost: parseFloat(match[3]) });
      }
    }

    if (parsed.length > 0) {
      setPositions(parsed);
      saveMessage = `Saved ${parsed.length} position${parsed.length > 1 ? 's' : ''}`;
    } else {
      saveMessage = 'Could not parse any positions. Use format: NVDA 10 shares @ $800';
    }
    setTimeout(() => saveMessage = '', 3000);
  }
</script>

{#if open}
  <!-- Backdrop -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onclick={() => open = false}></div>

  <!-- Panel -->
  <div class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-surface-800 border-l border-border z-50 overflow-y-auto">
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-text-primary">Settings</h2>
        <button class="text-text-muted hover:text-text-primary transition-colors text-xl" onclick={() => open = false}>✕</button>
      </div>

      <!-- API Key -->
      <div class="space-y-2">
        <label class="block">
          <span class="text-sm font-medium text-text-secondary">Finnhub API Key</span>
          <div class="flex gap-2 mt-1">
            <input
              type="password"
              placeholder="Enter your Finnhub API key"
              class="flex-1 bg-surface-700 border border-border rounded px-3 py-2 text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
              bind:value={apiKeyInput}
            />
            <button
              class="px-4 py-2 bg-bull-strong text-surface-900 font-semibold text-sm rounded hover:brightness-110 transition"
              onclick={saveApiKey}
            >
              Save
            </button>
          </div>
        </label>
        <p class="text-xs text-text-muted">
          Free key from <a href="https://finnhub.io/register" target="_blank" rel="noopener" class="text-uncertain hover:underline">finnhub.io/register</a>
        </p>
      </div>

      <!-- TwelveData API Key -->
      <div class="space-y-2">
        <label class="block">
          <span class="text-sm font-medium text-text-secondary">TwelveData API Key</span>
          <span class="ml-2 text-xs text-uncertain bg-uncertain/10 px-1.5 py-0.5 rounded">optional</span>
          <div class="flex gap-2 mt-1">
            <input
              type="password"
              placeholder="Enables RSI, MACD, Bollinger Bands"
              class="flex-1 bg-surface-700 border border-border rounded px-3 py-2 text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
              bind:value={tdApiKeyInput}
            />
            <button
              class="px-4 py-2 bg-bull-strong text-surface-900 font-semibold text-sm rounded hover:brightness-110 transition"
              onclick={saveTDApiKey}
            >Save</button>
          </div>
        </label>
        <p class="text-xs text-text-muted">
          Adds RSI(14) + MACD to the scoring engine and shows indicators in the detail panel.
          Free key from <a href="https://twelvedata.com/register" target="_blank" rel="noopener" class="text-uncertain hover:underline">twelvedata.com/register</a>
        </p>
      </div>

      <!-- Portfolio Value (for position sizing) -->
      <div class="space-y-2">
        <label class="block">
          <span class="text-sm font-medium text-text-secondary">Total Portfolio Value</span>
          <div class="flex gap-2 mt-1">
            <input
              type="text"
              placeholder="e.g. 50000"
              class="flex-1 bg-surface-700 border border-border rounded px-3 py-2 text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
              bind:value={portfolioValueInput}
            />
            <button
              class="px-4 py-2 bg-bull-strong text-surface-900 font-semibold text-sm rounded hover:brightness-110 transition"
              onclick={savePortfolioValue}
            >
              Set
            </button>
          </div>
        </label>
        <p class="text-xs text-text-muted">Used to calculate recommended position size (2% risk rule).</p>
      </div>

      <!-- Portfolio Snapshot -->
      <div class="space-y-2">
        <label class="block">
          <span class="text-sm font-medium text-text-secondary">Portfolio Positions</span>
          <textarea
            placeholder="NVDA 10 shares @ $800&#10;AAPL 25 shares @ $175&#10;MSFT 15 @ 420"
            class="w-full mt-1 bg-surface-700 border border-border rounded px-3 py-2 text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50 h-32 resize-y"
            bind:value={portfolioText}
          ></textarea>
        </label>
        <div class="flex items-center gap-3">
          <button
            class="px-4 py-2 bg-uncertain text-white font-semibold text-sm rounded hover:brightness-110 transition"
            onclick={parsePortfolio}
          >
            Save Positions
          </button>
          {#if getPositions().length > 0}
            <span class="text-xs text-text-muted">{getPositions().length} positions saved</span>
          {/if}
        </div>
        <p class="text-xs text-text-muted">
          Format: TICKER QTY shares @ $PRICE (one per line)
        </p>
      </div>

      <!-- Auto-refresh -->
      <div class="space-y-2">
        <span class="text-sm font-medium text-text-secondary block">Auto-Refresh (market hours only)</span>
        <div class="flex gap-2 flex-wrap">
          {#each [[0, 'Off'], [5, '5 min'], [15, '15 min'], [30, '30 min']] as [val, label]}
            <button
              class="px-3 py-1.5 text-xs rounded border transition-colors {autoRefreshInterval === val ? 'bg-bull-strong/20 border-bull-strong text-bull-strong font-semibold' : 'bg-surface-700 border-border text-text-muted hover:text-text-secondary'}"
              onclick={() => saveAutoRefresh(val)}
            >{label}</button>
          {/each}
        </div>
        <p class="text-xs text-text-muted">Only triggers when market is open (Mon–Fri 9:30–16:00 ET).</p>
      </div>

      <!-- Save feedback -->
      {#if saveMessage}
        <div class="text-sm text-bull-strong bg-bull-strong/10 rounded px-3 py-2">{saveMessage}</div>
      {/if}

      <!-- Data management -->
      <div class="border-t border-border pt-4 space-y-3">
        <h3 class="text-sm font-medium text-text-secondary">Data</h3>
        <p class="text-xs text-text-muted">
          All data is stored in your browser's localStorage. Nothing is sent to any server except Finnhub API calls.
        </p>
        <button
          class="px-3 py-1.5 text-xs bg-surface-700 hover:bg-surface-600 text-text-secondary hover:text-danger rounded transition-colors border border-border"
          onclick={() => {
            const keep = ['watchlist', 'portfolio', 'portfolioValue', 'finnhub_api_key', 'twelvedata_api_key', 'lastRefreshed'];
            const toDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (!keep.includes(k)) toDelete.push(k);
            }
            toDelete.forEach(k => localStorage.removeItem(k));
            saveMessage = `Cleared ${toDelete.length} cached items`;
            setTimeout(() => saveMessage = '', 3000);
          }}
        >
          Clear API cache
        </button>
        <p class="text-xs text-text-muted">Removes cached quotes, charts, news, and fundamentals. Keeps your watchlist and positions.</p>
      </div>
    </div>
  </div>
{/if}

<script>
  import { getApiKey, setApiKey, clearStorageFullFlag } from '../api/finnhub.svelte.js';
  import { getTDApiKey, setTDApiKey } from '../api/twelvedata.svelte.js';
  import { getFredApiKey, setFredApiKey } from '../api/fred.js';
  import { getPositions, setPositions, getPortfolioValue, setPortfolioValue } from '../stores/portfolio.svelte.js';
  import { getDefaultTickers, addDefaultTicker, removeDefaultTicker, resetDefaultTickers, addTicker } from '../stores/watchlist.svelte.js';
  import { getTemplates, getDefaultId, setDefaultId, updateTemplate, resetTemplate } from '../stores/prompts.svelte.js';

  let { open = $bindable(false) } = $props();

  let editingPromptId = $state(null);
  let promptDraft = $state('');

  let apiKeyInput = $state(getApiKey());
  let tdApiKeyInput = $state(getTDApiKey());
  let fredApiKeyInput = $state(getFredApiKey());
  let notifPermission = $state(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  );

  async function requestNotifications() {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    notifPermission = result;
    saveMessage = result === 'granted' ? 'Notifications enabled' : 'Permission denied';
    setTimeout(() => saveMessage = '', 2500);
  }
  let defaultInput = $state('');

  async function addToDefaults() {
    const sym = defaultInput.trim().toUpperCase();
    if (!sym) return;
    addDefaultTicker(sym, sym);
    defaultInput = '';
    saveMessage = `${sym} added to defaults`;
    setTimeout(() => saveMessage = '', 2000);
  }

  async function loadDefaultsToWatchlist() {
    const defaults = getDefaultTickers();
    let added = 0;
    for (const t of defaults) {
      const ok = await addTicker(t.symbol, t.name);
      if (ok) added++;
    }
    saveMessage = added > 0 ? `Added ${added} ticker${added > 1 ? 's' : ''} to watchlist` : 'All defaults already in watchlist';
    setTimeout(() => saveMessage = '', 2500);
  }

  let portfolioText = $state('');
  let portfolioValueInput = $state(getPortfolioValue() > 0 ? String(getPortfolioValue()) : '');
  let saveMessage = $state('');
  let autoRefreshInterval = $state(parseInt(localStorage.getItem('autoRefreshInterval') || '0'));
  let notifyEnabled = $state(localStorage.getItem('notifyEnabled') === 'true');

  function saveAutoRefresh(val) {
    autoRefreshInterval = val;
    localStorage.setItem('autoRefreshInterval', String(val));
    saveMessage = val === 0 ? 'Auto-refresh off' : `Auto-refresh set to ${val} min`;
    setTimeout(() => saveMessage = '', 2000);
  }

  async function toggleNotify() {
    if (!notifyEnabled) {
      if (typeof Notification === 'undefined') return;
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
    }
    notifyEnabled = !notifyEnabled;
    localStorage.setItem('notifyEnabled', String(notifyEnabled));
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

  function saveFredApiKey() {
    setFredApiKey(fredApiKeyInput.trim());
    saveMessage = 'FRED key saved — refresh to load macro context';
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

      <!-- FRED API Key -->
      <div class="space-y-2">
        <label class="block">
          <span class="text-sm font-medium text-text-secondary">FRED API Key</span>
          <span class="ml-2 text-xs text-uncertain bg-uncertain/10 px-1.5 py-0.5 rounded">optional</span>
          <div class="flex gap-2 mt-1">
            <input
              type="password"
              placeholder="Enables macro regime (CPI, Fed funds, yield curve)"
              class="flex-1 bg-surface-700 border border-border rounded px-3 py-2 text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
              bind:value={fredApiKeyInput}
            />
            <button
              class="px-4 py-2 bg-bull-strong text-surface-900 font-semibold text-sm rounded hover:brightness-110 transition"
              onclick={saveFredApiKey}
            >Save</button>
          </div>
        </label>
        <p class="text-xs text-text-muted">
          Adds macroeconomic context to scoring: inverted yield curve pulls bullish scores toward neutral, rising Fed funds shifts weight to fundamentals.
          Free key from <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener" class="text-uncertain hover:underline">fred.stlouisfed.org</a>
        </p>
      </div>

      <!-- Default Watchlist -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-sm font-medium text-text-secondary">Default Watchlist</span>
          <button
            class="text-xs text-text-muted hover:text-text-secondary underline transition-colors"
            onclick={() => { resetDefaultTickers(); saveMessage = 'Reset to built-in defaults'; setTimeout(() => saveMessage = '', 2000); }}
          >Reset</button>
        </div>
        <!-- Chips -->
        <div class="flex flex-wrap gap-1.5 min-h-[2rem]">
          {#each getDefaultTickers() as t (t.symbol)}
            <span class="flex items-center gap-1 px-2 py-0.5 bg-surface-700 border border-border rounded-full text-xs text-text-primary">
              {t.symbol}
              <button
                class="text-text-muted hover:text-bear-strong transition-colors leading-none"
                onclick={() => removeDefaultTicker(t.symbol)}
                aria-label="Remove {t.symbol}"
              >×</button>
            </span>
          {/each}
          {#if getDefaultTickers().length === 0}
            <span class="text-xs text-text-muted italic">No defaults — add tickers below</span>
          {/if}
        </div>
        <!-- Add ticker -->
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="e.g. AAPL"
            maxlength="10"
            class="w-32 bg-surface-700 border border-border rounded px-3 py-1.5 text-text-primary font-mono text-sm uppercase placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
            bind:value={defaultInput}
            onkeydown={(e) => e.key === 'Enter' && addToDefaults()}
          />
          <button
            class="px-3 py-1.5 bg-surface-700 border border-border text-text-secondary text-sm rounded hover:text-text-primary hover:border-bull-strong/50 transition"
            onclick={addToDefaults}
          >Add</button>
          <button
            class="px-3 py-1.5 bg-bull-strong text-surface-900 font-semibold text-sm rounded hover:brightness-110 transition"
            onclick={loadDefaultsToWatchlist}
          >Load to Watchlist</button>
        </div>
        <p class="text-xs text-text-muted">These tickers are added automatically on first launch. "Load to Watchlist" adds any missing ones now.</p>
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

      <!-- Push Notifications -->
      <div class="space-y-2">
        <span class="text-sm font-medium text-text-secondary block">Price Alert Notifications</span>
        <div class="flex items-center gap-3">
          {#if notifPermission === 'unsupported'}
            <span class="text-xs text-text-muted">Not supported in this browser.</span>
          {:else if notifPermission === 'granted'}
            <span class="flex items-center gap-1.5 text-xs text-bull-strong">
              <span class="w-1.5 h-1.5 rounded-full bg-bull-strong inline-block"></span>
              Notifications enabled
            </span>
          {:else if notifPermission === 'denied'}
            <span class="text-xs text-bear-strong">Blocked by browser — allow in site settings.</span>
          {:else}
            <button
              class="px-4 py-1.5 bg-uncertain/20 text-uncertain border border-uncertain/30 font-semibold text-sm rounded hover:brightness-110 transition"
              onclick={requestNotifications}
            >Enable Notifications</button>
          {/if}
        </div>
        <p class="text-xs text-text-muted">Fires a browser notification when a price alert triggers, even if the tab is in the background.</p>
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

      <!-- Browser notifications -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <p class="text-sm text-text-primary">Browser notifications</p>
          <p class="text-xs text-text-muted">New ACT/SOON signals after a refresh — fires only while a dashboard tab is open.</p>
        </div>
        <button
          class="text-xs px-3 py-1.5 rounded-lg shrink-0 {notifyEnabled ? 'bg-bull-strong/20 text-bull-strong' : 'bg-surface-600 text-text-secondary'}"
          onclick={toggleNotify}
        >{notifyEnabled ? 'On' : 'Off'}</button>
      </div>

      <!-- AI Prompts -->
      <div>
        <h3 class="text-sm font-medium text-text-secondary mb-1">AI Prompts</h3>
        <p class="text-xs text-text-muted mb-3">
          Templates for the "Copy for AI" button. Placeholders: <code>{'{{DATA}}'}</code> (snapshot), <code>{'{{TICKER}}'}</code>, <code>{'{{DATE}}'}</code>.
        </p>
        {#each getTemplates() as tpl (tpl.id)}
          <div class="mb-2 bg-surface-700/50 border border-border/40 rounded-lg px-3 py-2">
            <div class="flex items-center gap-2">
              <input type="radio" name="promptDefault" checked={tpl.id === getDefaultId()}
                onchange={() => setDefaultId(tpl.id)} class="accent-current" />
              <span class="text-xs font-semibold text-text-secondary flex-1">{tpl.name}</span>
              <button class="text-xs text-text-muted hover:text-text-secondary"
                onclick={() => {
                  if (editingPromptId === tpl.id) { editingPromptId = null; }
                  else { editingPromptId = tpl.id; promptDraft = tpl.body; }
                }}
              >{editingPromptId === tpl.id ? 'Close' : 'Edit'}</button>
              <button class="text-xs text-text-muted hover:text-warning"
                onclick={() => { resetTemplate(tpl.id); if (editingPromptId === tpl.id) promptDraft = getTemplates().find(t => t.id === tpl.id).body; }}
              >Reset</button>
            </div>
            {#if editingPromptId === tpl.id}
              <textarea
                class="w-full mt-2 text-xs bg-surface-800 border border-border rounded p-2 text-text-primary font-mono"
                rows="10"
                aria-label="Prompt template body"
                bind:value={promptDraft}
                onblur={() => updateTemplate(tpl.id, promptDraft)}
              ></textarea>
              <p class="text-[11px] text-text-muted mt-1">Saved automatically when you click away.</p>
            {/if}
          </div>
        {/each}
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
            const keep = ['watchlist', 'watchlist_defaults', 'portfolio', 'portfolioValue', 'finnhub_api_key', 'twelvedata_api_key', 'fred_api_key', 'lastRefreshed'];
            // Preserve per-ticker notes and score velocity history
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k?.startsWith('note_') || k?.startsWith('sv_')) keep.push(k);
            }
            const toDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (!keep.includes(k)) toDelete.push(k);
            }
            toDelete.forEach(k => localStorage.removeItem(k));
            clearStorageFullFlag();
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

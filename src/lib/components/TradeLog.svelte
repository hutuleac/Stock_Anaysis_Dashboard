<script>
  import { getTrades, addTrade, removeTrade, getRealizedPnL } from '../stores/tradelog.svelte.js';
  import { getTickerData } from '../stores/watchlist.svelte.js';

  let { symbol } = $props();

  let showForm = $state(false);
  let side = $state('BUY');
  let shares = $state('');
  let price = $state('');
  let notes = $state('');
  let error = $state('');

  const trades = $derived(getTrades().filter(t => t.symbol === symbol));
  const currentPrice = $derived(getTickerData(symbol)?.quote?.data?.c ?? null);
  const realizedPnL = $derived(getRealizedPnL(symbol));

  // Unrealized: sum open BUY lots minus matching SELLs (simplified: net shares × (current - avg cost))
  const netShares = $derived(
    trades.reduce((sum, t) => sum + (t.side === 'BUY' ? t.shares : -t.shares), 0)
  );
  const avgCost = $derived(() => {
    const buys = trades.filter(t => t.side === 'BUY');
    const totalCost = buys.reduce((s, t) => s + t.shares * t.price, 0);
    const totalShares = buys.reduce((s, t) => s + t.shares, 0);
    return totalShares > 0 ? totalCost / totalShares : null;
  });
  const unrealizedPnL = $derived(
    netShares > 0 && currentPrice && avgCost() ? netShares * (currentPrice - avgCost()) : null
  );

  function submitTrade() {
    const s = parseFloat(shares);
    const p = parseFloat(price);
    if (!s || s <= 0 || !p || p <= 0) { error = 'Enter valid shares and price'; return; }
    addTrade({ symbol, side, shares: s, price: p, notes });
    shares = ''; price = ''; notes = ''; error = ''; showForm = false;
  }

  function prefillCurrentPrice() {
    if (currentPrice) price = currentPrice.toFixed(2);
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  function formatPnL(val) {
    if (val == null) return null;
    const sign = val >= 0 ? '+' : '';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Trade Log</h3>
    <button
      class="text-xs px-2.5 py-1 rounded bg-surface-600 hover:bg-surface-500 text-text-secondary hover:text-text-primary transition-colors"
      onclick={() => { showForm = !showForm; if (showForm) prefillCurrentPrice(); }}
    >
      {showForm ? '✕ Cancel' : '+ Log Trade'}
    </button>
  </div>

  <!-- Quick entry form -->
  {#if showForm}
    <div class="bg-surface-700 rounded-lg p-4 space-y-3 border border-border/50">
      <!-- BUY / SELL toggle -->
      <div class="flex rounded overflow-hidden border border-border text-xs font-semibold w-fit">
        <button
          class="px-4 py-1.5 transition-colors {side === 'BUY' ? 'bg-bull-strong text-surface-900' : 'text-text-muted hover:text-text-secondary'}"
          onclick={() => side = 'BUY'}
        >BUY</button>
        <button
          class="px-4 py-1.5 transition-colors {side === 'SELL' ? 'bg-bear-strong text-surface-900' : 'text-text-muted hover:text-text-secondary'}"
          onclick={() => side = 'SELL'}
        >SELL</button>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="text-xs text-text-muted block mb-1">Shares</label>
          <input
            type="number" min="0" step="1"
            placeholder="100"
            class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-bull-strong/50"
            bind:value={shares}
          />
        </div>
        <div>
          <label class="text-xs text-text-muted block mb-1">Price</label>
          <input
            type="number" min="0" step="0.01"
            placeholder={currentPrice?.toFixed(2) ?? '0.00'}
            class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-bull-strong/50"
            bind:value={price}
          />
        </div>
      </div>

      <input
        type="text"
        placeholder="Notes (optional)"
        class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
        bind:value={notes}
      />

      {#if error}
        <p class="text-xs text-danger">{error}</p>
      {/if}

      <button
        class="w-full py-1.5 text-sm font-semibold rounded transition-colors {side === 'BUY' ? 'bg-bull-strong text-surface-900 hover:brightness-110' : 'bg-bear-strong text-surface-900 hover:brightness-110'}"
        onclick={submitTrade}
      >
        Log {side}
      </button>
    </div>
  {/if}

  <!-- P&L summary -->
  {#if trades.length > 0}
    <div class="flex gap-4 text-xs">
      {#if realizedPnL !== 0}
        <span class="text-text-muted">Realized: <span class="{realizedPnL >= 0 ? 'text-bull-strong' : 'text-bear-strong'} font-mono">{formatPnL(realizedPnL)}</span></span>
      {/if}
      {#if unrealizedPnL !== null}
        <span class="text-text-muted">Unrealized: <span class="{unrealizedPnL >= 0 ? 'text-bull-strong' : 'text-bear-strong'} font-mono">{formatPnL(unrealizedPnL)}</span></span>
      {/if}
      {#if netShares > 0}
        <span class="text-text-muted">Open: <span class="text-text-primary font-mono">{netShares} shares</span></span>
      {/if}
    </div>

    <!-- Trade history -->
    <div class="space-y-1">
      {#each trades as trade (trade.id)}
        <div class="flex items-center gap-3 py-1.5 px-3 bg-surface-700/50 rounded text-xs group">
          <span class="font-semibold w-8 {trade.side === 'BUY' ? 'text-bull-strong' : 'text-bear-strong'}">{trade.side}</span>
          <span class="font-mono text-text-primary">{trade.shares} @ ${trade.price.toFixed(2)}</span>
          <span class="text-text-muted ml-auto">{formatDate(trade.date)}</span>
          {#if trade.notes}
            <span class="text-text-muted truncate max-w-[100px]" title={trade.notes}>{trade.notes}</span>
          {/if}
          <button
            class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all ml-1"
            onclick={() => removeTrade(trade.id)}
            title="Remove"
          >✕</button>
        </div>
      {/each}
    </div>
  {:else if !showForm}
    <p class="text-xs text-text-muted py-2">No trades logged yet.</p>
  {/if}
</div>

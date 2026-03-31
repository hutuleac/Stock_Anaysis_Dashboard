<script>
  import { getPaperTradesForSymbol, addPaperTrade, closePaperTrade, removePaperTrade, getPaperTradePnL } from '../stores/papertrades.svelte.js';
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { computeScore, generateThesis } from '../scoring.js';

  let { symbol } = $props();

  let showForm  = $state(false);
  let side      = $state('BUY');
  let shares    = $state('');
  let price     = $state('');
  let notes     = $state('');
  let error     = $state('');

  // Inline close form state
  let closingId    = $state(null);
  let exitPrice    = $state('');
  let exitNotes    = $state('');

  const trades       = $derived(getPaperTradesForSymbol(symbol));
  const openTrades   = $derived(trades.filter(t => t.status === 'OPEN'));
  const closedTrades = $derived(trades.filter(t => t.status === 'CLOSED'));
  const currentPrice = $derived(getTickerData(symbol)?.quote?.data?.c ?? null);
  const currentScore = $derived(() => {
    const data = getTickerData(symbol);
    return data ? computeScore(data).score : null;
  });

  function badgeColor(badge) {
    if (!badge) return 'text-text-muted';
    if (badge === 'STRONG_LONG')  return 'text-bull-strong';
    if (badge === 'LEAN_LONG')    return 'text-bull-weak';
    if (badge === 'LEAN_SHORT')   return 'text-bear-weak';
    if (badge === 'STRONG_SHORT') return 'text-bear-strong';
    return 'text-text-muted';
  }

  function badgeLabel(badge) {
    const map = { STRONG_LONG: 'Strong', LEAN_LONG: 'Lean Long', NEUTRAL: 'Neutral', LEAN_SHORT: 'Lean Short', STRONG_SHORT: 'Strong Short' };
    return map[badge] ?? badge ?? '—';
  }

  function captureSnapshot() {
    const data = getTickerData(symbol);
    if (!data) return null;
    const s = computeScore(data);
    const thesis = generateThesis(data, s) ?? { bulls: [], bears: [], warnings: [] };
    return {
      score: s.score, badge: s.badge,
      conviction: s.conviction, convictionLabel: s.convictionLabel,
      technical: s.technical, fundamental: s.fundamental, sentiment: s.sentiment,
      thesis,
    };
  }

  function submitTrade() {
    const s = parseFloat(shares);
    const p = parseFloat(price);
    if (!s || s <= 0 || !p || p <= 0) { error = 'Enter valid shares and price'; return; }
    addPaperTrade({ symbol, side, shares: s, entryPrice: p, notes, entrySnapshot: captureSnapshot() });
    shares = ''; price = ''; notes = ''; error = ''; showForm = false;
  }

  function startClose(trade) {
    closingId = trade.id;
    exitPrice = currentPrice ? currentPrice.toFixed(2) : trade.entryPrice.toFixed(2);
    exitNotes = '';
  }

  function confirmClose(id) {
    const p = parseFloat(exitPrice);
    if (!p || p <= 0) return;
    closePaperTrade(id, { exitPrice: p, exitSnapshot: captureSnapshot(), exitNotes });
    closingId = null;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  }

  function formatPnL(val) {
    if (val == null) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  }

  function formatPct(val) {
    if (val == null) return '';
    const sign = val >= 0 ? '+' : '';
    return `(${sign}${val.toFixed(1)}%)`;
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Paper Trades</h3>
    <button
      class="text-xs px-2.5 py-1 rounded bg-surface-600 hover:bg-surface-500 text-text-secondary hover:text-text-primary transition-colors"
      onclick={() => {
        showForm = !showForm;
        if (showForm && currentPrice) price = currentPrice.toFixed(2);
      }}
    >{showForm ? '✕ Cancel' : '+ Paper Trade'}</button>
  </div>

  <!-- Entry form -->
  {#if showForm}
    <div class="bg-surface-700 rounded-lg p-4 space-y-3 border border-border/50">
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
          <input type="number" min="0" step="1" placeholder="100"
            class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-bull-strong/50"
            bind:value={shares} />
        </div>
        <div>
          <label class="text-xs text-text-muted block mb-1">Price</label>
          <input type="number" min="0" step="0.01" placeholder={currentPrice?.toFixed(2) ?? '0.00'}
            class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-bull-strong/50"
            bind:value={price} />
        </div>
      </div>

      <input type="text" placeholder="Rationale (optional)"
        class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
        bind:value={notes} />

      {#if error}<p class="text-xs text-danger">{error}</p>{/if}

      <button
        class="w-full py-1.5 text-sm font-semibold rounded transition-colors {side === 'BUY' ? 'bg-bull-strong text-surface-900 hover:brightness-110' : 'bg-bear-strong text-surface-900 hover:brightness-110'}"
        onclick={submitTrade}
      >Record {side} Idea</button>

      {#if currentScore() !== null}
        <p class="text-xs text-text-muted text-center">Snapshot score <span class="text-text-primary font-mono">{currentScore()}</span> will be saved with this trade</p>
      {/if}
    </div>
  {/if}

  <!-- Open trades -->
  {#each openTrades as trade (trade.id)}
    {@const pnl = getPaperTradePnL(trade, currentPrice)}
    <div class="bg-surface-700/50 rounded-lg p-3 border border-border/40 space-y-2">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs">
          <span class="font-semibold px-1.5 py-0.5 rounded text-[11px] {trade.side === 'BUY' ? 'bg-bull-strong/20 text-bull-strong' : 'bg-bear-strong/20 text-bear-strong'}">{trade.side}</span>
          <span class="font-mono text-text-primary">{trade.shares} @ ${trade.entryPrice.toFixed(2)}</span>
          <span class="text-text-muted">{formatDate(trade.entryDate)}</span>
          {#if pnl}<span class="text-text-muted">· {pnl.daysHeld}d</span>{/if}
        </div>
        <div class="flex items-center gap-2">
          <button
            class="text-xs px-2 py-0.5 rounded bg-surface-600 hover:bg-surface-500 text-text-muted hover:text-text-primary transition-colors"
            onclick={() => closingId === trade.id ? closingId = null : startClose(trade)}
          >{closingId === trade.id ? 'Cancel' : 'Close'}</button>
          <button
            class="text-text-muted hover:text-danger transition-colors text-xs"
            onclick={() => removePaperTrade(trade.id)}
            title="Delete"
          >✕</button>
        </div>
      </div>

      <!-- P&L row -->
      {#if pnl}
        <div class="flex items-center gap-3 text-xs">
          <span class="{pnl.pnl >= 0 ? 'text-bull-strong' : 'text-bear-strong'} font-mono font-semibold">
            {formatPnL(pnl.pnl)} {formatPct(pnl.pnlPct)}
          </span>
          {#if pnl.verdict !== 'FLAT'}
            <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold {pnl.verdict === 'CONFIRMED' ? 'bg-bull-strong/15 text-bull-strong' : 'bg-bear-strong/15 text-bear-strong'}">{pnl.verdict}</span>
          {/if}
        </div>
      {:else}
        <p class="text-xs text-text-muted">Current price unavailable</p>
      {/if}

      <!-- Score comparison -->
      {#if trade.entrySnapshot}
        <div class="flex items-center gap-1.5 text-xs text-text-muted">
          <span>Score at entry:</span>
          <span class="font-mono {badgeColor(trade.entrySnapshot.badge)}">{trade.entrySnapshot.score} {badgeLabel(trade.entrySnapshot.badge)}</span>
          {#if currentScore() !== null}
            <span>→</span>
            <span class="font-mono text-text-primary">{currentScore()} now</span>
          {/if}
        </div>
      {/if}

      <!-- Inline close form -->
      {#if closingId === trade.id}
        <div class="pt-2 border-t border-border/30 grid grid-cols-2 gap-2">
          <div>
            <label class="text-xs text-text-muted block mb-1">Exit Price</label>
            <input type="number" min="0" step="0.01"
              class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-bull-strong/50"
              bind:value={exitPrice} />
          </div>
          <div>
            <label class="text-xs text-text-muted block mb-1">Exit Notes</label>
            <input type="text" placeholder="optional"
              class="w-full bg-surface-600 border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50"
              bind:value={exitNotes} />
          </div>
        </div>
        <button
          class="w-full py-1.5 text-sm font-semibold rounded bg-uncertain/80 text-white hover:brightness-110 transition-colors"
          onclick={() => confirmClose(trade.id)}
        >Confirm Close</button>
      {/if}
    </div>
  {/each}

  <!-- Closed trades -->
  {#if closedTrades.length > 0}
    <div class="space-y-1 border-t border-border/30 pt-2">
      <p class="text-[11px] text-text-muted uppercase tracking-wider">Closed</p>
      {#each closedTrades as trade (trade.id)}
        {@const pnl = getPaperTradePnL(trade, null)}
        <div class="flex items-center gap-3 py-1.5 px-3 bg-surface-700/30 rounded text-xs group">
          <span class="font-semibold w-8 {trade.side === 'BUY' ? 'text-bull-strong' : 'text-bear-strong'}">{trade.side}</span>
          <span class="font-mono text-text-muted">{trade.shares} @ ${trade.entryPrice.toFixed(2)} → ${trade.exitPrice?.toFixed(2)}</span>
          {#if pnl}
            <span class="{pnl.pnl >= 0 ? 'text-bull-strong' : 'text-bear-strong'} font-mono ml-auto">{formatPnL(pnl.pnl)}</span>
            {#if pnl.verdict !== 'FLAT'}
              <span class="text-[10px] px-1 py-0.5 rounded {pnl.verdict === 'CONFIRMED' ? 'text-bull-strong' : 'text-bear-strong'}">{pnl.verdict}</span>
            {/if}
          {/if}
          <button
            class="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all"
            onclick={() => removePaperTrade(trade.id)}
            title="Delete"
          >✕</button>
        </div>
      {/each}
    </div>
  {/if}

  {#if trades.length === 0 && !showForm}
    <p class="text-xs text-text-muted py-2">No paper trades yet. Record a hypothetical buy/sell and track its performance over time.</p>
  {/if}
</div>

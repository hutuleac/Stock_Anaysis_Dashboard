<script>
  import { getPaperTrades, getPaperTradePnL, removePaperTrade } from '../stores/papertrades.svelte.js';
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { computeScore } from '../scoring.js';

  let collapsed = $state(false);

  const allTrades    = $derived(getPaperTrades());
  const openTrades   = $derived(allTrades.filter(t => t.status === 'OPEN'));
  const closedTrades = $derived(allTrades.filter(t => t.status === 'CLOSED'));

  // Summary stats from closed trades
  const closedStats = $derived(() => {
    let wins = 0, losses = 0, totalPnl = 0, totalDays = 0;
    for (const t of closedTrades) {
      const pnl = getPaperTradePnL(t, null);
      if (!pnl) continue;
      totalPnl  += pnl.pnl;
      totalDays += pnl.daysHeld;
      if (pnl.verdict === 'CONFIRMED') wins++;
      else if (pnl.verdict === 'AGAINST') losses++;
    }
    return {
      wins, losses,
      totalPnl,
      avgDays: closedTrades.length > 0 ? Math.round(totalDays / closedTrades.length) : 0,
    };
  });

  function currentPrice(symbol) {
    return getTickerData(symbol)?.quote?.data?.c ?? null;
  }

  function currentScore(symbol) {
    const data = getTickerData(symbol);
    return data ? computeScore(data).score : null;
  }

  function badgeColor(badge) {
    if (badge === 'STRONG_LONG')  return 'text-bull-strong';
    if (badge === 'LEAN_LONG')    return 'text-bull-weak';
    if (badge === 'LEAN_SHORT')   return 'text-bear-weak';
    if (badge === 'STRONG_SHORT') return 'text-bear-strong';
    return 'text-text-muted';
  }

  function formatPnL(val) {
    if (val == null) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  }

  function formatPct(val) {
    if (val == null) return '';
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
</script>

{#if allTrades.length > 0}
  <div class="border border-border/50 rounded-xl bg-surface-800/60 overflow-hidden">
    <!-- Header -->
    <button
      class="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-700/30 transition-colors"
      onclick={() => collapsed = !collapsed}
    >
      <div class="flex items-center gap-3">
        <span class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Paper Trades</span>
        {#if openTrades.length > 0}
          <span class="text-xs px-2 py-0.5 rounded-full bg-uncertain/20 text-uncertain font-semibold">{openTrades.length} open</span>
        {/if}
        {#if closedTrades.length > 0}
          <span class="text-xs text-text-muted">{closedTrades.length} closed</span>
        {/if}
      </div>
      <span class="text-text-muted text-xs">{collapsed ? '▼' : '▲'}</span>
    </button>

    {#if !collapsed}
      <div class="border-t border-border/30">
        <!-- Open trades table -->
        {#if openTrades.length > 0}
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-text-muted border-b border-border/20">
                  <th class="text-left px-4 py-2 font-medium">Ticker</th>
                  <th class="text-left px-3 py-2 font-medium">Side</th>
                  <th class="text-right px-3 py-2 font-medium">Entry</th>
                  <th class="text-right px-3 py-2 font-medium">Current</th>
                  <th class="text-right px-3 py-2 font-medium">P&L</th>
                  <th class="text-right px-3 py-2 font-medium">%</th>
                  <th class="text-right px-3 py-2 font-medium">Days</th>
                  <th class="text-left px-3 py-2 font-medium">Score</th>
                  <th class="text-left px-3 py-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {#each openTrades as trade (trade.id)}
                  {@const cp = currentPrice(trade.symbol)}
                  {@const pnl = getPaperTradePnL(trade, cp)}
                  {@const cs = currentScore(trade.symbol)}
                  <tr class="border-b border-border/10 hover:bg-surface-700/20 transition-colors">
                    <td class="px-4 py-2.5 font-semibold text-text-primary">{trade.symbol}</td>
                    <td class="px-3 py-2.5">
                      <span class="font-semibold {trade.side === 'BUY' ? 'text-bull-strong' : 'text-bear-strong'}">{trade.side}</span>
                    </td>
                    <td class="px-3 py-2.5 text-right font-mono text-text-secondary">${trade.entryPrice.toFixed(2)}</td>
                    <td class="px-3 py-2.5 text-right font-mono {cp ? 'text-text-primary' : 'text-text-muted'}">{cp ? `$${cp.toFixed(2)}` : '—'}</td>
                    <td class="px-3 py-2.5 text-right font-mono font-semibold {pnl ? (pnl.pnl >= 0 ? 'text-bull-strong' : 'text-bear-strong') : 'text-text-muted'}">{pnl ? formatPnL(pnl.pnl) : '—'}</td>
                    <td class="px-3 py-2.5 text-right font-mono {pnl ? (pnl.pnlPct >= 0 ? 'text-bull-strong' : 'text-bear-strong') : 'text-text-muted'}">{pnl ? formatPct(pnl.pnlPct) : '—'}</td>
                    <td class="px-3 py-2.5 text-right text-text-muted">{pnl ? `${pnl.daysHeld}d` : '—'}</td>
                    <td class="px-3 py-2.5">
                      {#if trade.entrySnapshot}
                        <span class="font-mono {badgeColor(trade.entrySnapshot.badge)}">{trade.entrySnapshot.score}</span>
                        {#if cs !== null}
                          <span class="text-text-muted"> → </span>
                          <span class="font-mono text-text-primary">{cs}</span>
                        {/if}
                      {:else}
                        <span class="text-text-muted">—</span>
                      {/if}
                    </td>
                    <td class="px-3 py-2.5">
                      {#if pnl && pnl.verdict !== 'FLAT'}
                        <span class="text-[10px] px-1.5 py-0.5 rounded font-semibold {pnl.verdict === 'CONFIRMED' ? 'bg-bull-strong/15 text-bull-strong' : 'bg-bear-strong/15 text-bear-strong'}">{pnl.verdict}</span>
                      {:else if pnl}
                        <span class="text-text-muted">—</span>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}

        <!-- Closed trade summary footer -->
        {#if closedTrades.length > 0}
          {@const stats = closedStats()}
          <div class="flex items-center gap-6 px-4 py-2.5 bg-surface-700/30 text-xs text-text-muted border-t border-border/20">
            <span>Closed: <span class="text-bull-strong font-semibold">{stats.wins}W</span> / <span class="text-bear-strong font-semibold">{stats.losses}L</span></span>
            {#if stats.avgDays > 0}
              <span>Avg hold: <span class="text-text-secondary">{stats.avgDays}d</span></span>
            {/if}
            <span>Total P&L: <span class="font-mono font-semibold {stats.totalPnl >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">{formatPnL(stats.totalPnl)}</span></span>
          </div>
        {/if}

        {#if openTrades.length === 0}
          <p class="text-xs text-text-muted px-4 py-4">No open paper trades. Open a ticker and click "+ Paper Trade" to start tracking.</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

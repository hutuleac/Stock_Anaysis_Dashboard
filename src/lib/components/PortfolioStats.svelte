<script>
  import { getTrades, getRealizedPnL } from '../stores/tradelog.svelte.js';
  import { getPositions } from '../stores/portfolio.svelte.js';
  import { getTickers, getTickerData } from '../stores/watchlist.svelte.js';

  // Compute stats across all trades
  const stats = $derived(() => {
    const trades = getTrades();
    if (trades.length === 0) return null;

    // Group by symbol and compute realized P&L per symbol
    const symbols = [...new Set(trades.map(t => t.symbol))];
    const pnlBySymbol = symbols.map(s => ({
      symbol: s,
      pnl: getRealizedPnL(s),
    })).filter(s => s.pnl !== 0);

    if (pnlBySymbol.length === 0) return null;

    const winners = pnlBySymbol.filter(s => s.pnl > 0);
    const losers  = pnlBySymbol.filter(s => s.pnl < 0);
    const totalPnL = pnlBySymbol.reduce((sum, s) => sum + s.pnl, 0);
    const winRate = pnlBySymbol.length > 0 ? (winners.length / pnlBySymbol.length) * 100 : 0;

    const best  = pnlBySymbol.reduce((a, b) => a.pnl > b.pnl ? a : b, pnlBySymbol[0]);
    const worst = pnlBySymbol.reduce((a, b) => a.pnl < b.pnl ? a : b, pnlBySymbol[0]);
    const avgWin  = winners.length ? winners.reduce((s, x) => s + x.pnl, 0) / winners.length : 0;
    const avgLoss = losers.length  ? losers.reduce((s, x) => s + x.pnl, 0)  / losers.length  : 0;

    return { totalPnL, winRate, trades: trades.length, closed: pnlBySymbol.length, best, worst, avgWin, avgLoss };
  });

  // Portfolio beta — weighted average of position betas
  const portfolioBeta = $derived(() => {
    const positions = getPositions();
    if (!positions.length) return null;

    let totalValue = 0;
    const weighted = [];

    for (const pos of positions) {
      const data = getTickerData(pos.ticker);
      const price = data?.quote?.data?.c ?? pos.avgCost;
      const beta = data?.metrics?.data?.metric?.beta;
      const value = pos.qty * price;
      totalValue += value;
      if (beta != null && isFinite(beta)) {
        weighted.push({ beta, value });
      }
    }

    if (!weighted.length || totalValue === 0) return null;
    const weightedBeta = weighted.reduce((sum, w) => sum + w.beta * (w.value / totalValue), 0);
    return Math.round(weightedBeta * 100) / 100;
  });

  // Unrealized P&L across all open positions
  const unrealizedPnL = $derived(() => {
    const positions = getPositions();
    if (!positions.length) return null;
    let total = 0;
    for (const pos of positions) {
      const data = getTickerData(pos.ticker);
      const price = data?.quote?.data?.c;
      if (price != null) total += (price - pos.avgCost) * pos.qty;
    }
    return total;
  });

  // Sector concentration from open positions
  const concentration = $derived(() => {
    const positions = getPositions();
    if (!positions.length) return null;

    const tickers = getTickers();
    const sectorMap = Object.fromEntries(tickers.map(t => [t.symbol, t.sector || 'Unknown']));

    const sectors = {};
    let totalValue = 0;

    for (const pos of positions) {
      const data = getTickerData(pos.ticker);
      const price = data?.quote?.data?.c ?? pos.avgCost;
      const value = pos.qty * price;
      const sector = sectorMap[pos.ticker] || 'Unknown';
      sectors[sector] = (sectors[sector] || 0) + value;
      totalValue += value;
    }

    if (totalValue === 0) return null;

    return Object.entries(sectors)
      .map(([sector, value]) => ({ sector, value, pct: (value / totalValue) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  });

  function fmt(val) {
    if (val == null) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  }
</script>

{#if stats()}
  {@const s = stats()}
  {@const beta = portfolioBeta()}
  {@const upnl = unrealizedPnL()}
  <div class="mt-8 border-t border-border/50 pt-6">
    <h2 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Portfolio Performance</h2>

    <!-- Market sensitivity callout -->
    {#if beta !== null}
      <div class="mb-3 flex items-center gap-2 text-xs text-text-muted bg-surface-800 rounded-lg px-3 py-2 w-fit">
        <span class="font-semibold text-text-secondary">Market sensitivity:</span>
        <span class="font-mono font-bold {beta > 1.5 ? 'text-warning' : beta > 1 ? 'text-uncertain' : beta < 0 ? 'text-bear-weak' : 'text-bull-strong'}">{beta}×</span>
        <span>— your portfolio moves ~{beta}× what SPY moves</span>
        {#if beta > 1.5}<span class="text-warning">(high risk)</span>{/if}
        {#if beta < 0}<span class="text-bear-weak">(inverse to market)</span>{/if}
      </div>
    {/if}

    <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Realized P&L</p>
        <p class="text-sm font-mono font-bold {s.totalPnL >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">{fmt(s.totalPnL)}</p>
      </div>
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Win Rate</p>
        <p class="text-sm font-mono font-bold {s.winRate >= 50 ? 'text-bull-strong' : 'text-bear-strong'}">{s.winRate.toFixed(0)}%</p>
        <p class="text-[10px] text-text-muted">{s.closed} closed</p>
      </div>
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Avg Win</p>
        <p class="text-sm font-mono font-bold text-bull-strong">{fmt(s.avgWin)}</p>
      </div>
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Avg Loss</p>
        <p class="text-sm font-mono font-bold text-bear-strong">{fmt(s.avgLoss)}</p>
      </div>
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">R:R Ratio</p>
        <p class="text-sm font-mono font-bold {s.avgLoss !== 0 && Math.abs(s.avgWin / s.avgLoss) >= 1.5 ? 'text-bull-strong' : 'text-text-primary'}">
          {s.avgLoss !== 0 ? (Math.abs(s.avgWin / s.avgLoss)).toFixed(2) : '—'}
        </p>
      </div>
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Best Trade</p>
        <p class="text-sm font-mono font-bold text-bull-strong">{fmt(s.best?.pnl)}</p>
        <p class="text-[10px] text-text-muted font-mono">{s.best?.symbol}</p>
      </div>
      <div class="bg-surface-800 rounded-lg p-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Worst Trade</p>
        <p class="text-sm font-mono font-bold text-bear-strong">{fmt(s.worst?.pnl)}</p>
        <p class="text-[10px] text-text-muted font-mono">{s.worst?.symbol}</p>
      </div>
      {#if upnl !== null}
        <div class="bg-surface-800 rounded-lg p-3">
          <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Unrealized P&L</p>
          <p class="text-sm font-mono font-bold {upnl >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">{fmt(upnl)}</p>
          <p class="text-[10px] text-text-muted">open positions</p>
        </div>
      {/if}
    </div>

    <!-- Sector Concentration -->
    {#if concentration() && concentration().length > 0}
      {@const conc = concentration()}
      {@const overweight = conc.filter(c => c.pct > 40)}
      {#if overweight.length}
        <div class="mt-3 flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          <span class="text-warning mt-0.5 shrink-0">⚠</span>
          <p class="text-xs text-warning">
            Concentration risk: {overweight.map(c => `${c.sector} (${c.pct.toFixed(0)}%)`).join(', ')} exceeds 40% of open positions. Consider diversifying before adding more.
          </p>
        </div>
      {/if}
      <div class="mt-3">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-2">Sector Exposure</p>
        <div class="flex flex-wrap gap-2">
          {#each conc as c}
            <div class="flex items-center gap-1.5 bg-surface-700 rounded px-2 py-1">
              <span class="text-xs text-text-secondary">{c.sector}</span>
              <span class="text-xs font-mono font-semibold {c.pct > 40 ? 'text-warning' : 'text-text-primary'}">{c.pct.toFixed(0)}%</span>
              <div class="w-12 h-1 bg-surface-600 rounded-full overflow-hidden">
                <div class="h-full rounded-full {c.pct > 40 ? 'bg-warning' : 'bg-bull-strong/60'}" style="width:{Math.min(c.pct, 100)}%"></div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

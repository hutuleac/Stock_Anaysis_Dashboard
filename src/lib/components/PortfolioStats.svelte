<script>
  import { getTrades, getRealizedPnL } from '../stores/tradelog.svelte.js';

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

  function fmt(val) {
    if (val == null) return '—';
    const sign = val >= 0 ? '+' : '';
    return `${sign}$${Math.abs(val).toFixed(2)}`;
  }
</script>

{#if stats()}
  {@const s = stats()}
  <div class="mt-8 border-t border-border/50 pt-6">
    <h2 class="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">Portfolio Performance</h2>
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
    </div>
  </div>
{/if}

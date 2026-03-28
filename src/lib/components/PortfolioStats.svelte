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

    const W = winners.length / pnlBySymbol.length;
    const R = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : null;
    // Expectancy per trade in dollars
    const expectancy = W * avgWin + (1 - W) * avgLoss;
    // Kelly fraction (% of capital to risk per trade for max geometric growth)
    const kelly = R !== null ? (W - (1 - W) / R) * 100 : null;
    // Probability of N consecutive losses (ruin scenario at 2% risk = 10 losses = ~18% drawdown)
    const pLoss5  = Math.pow(1 - W, 5)  * 100;
    const pLoss10 = Math.pow(1 - W, 10) * 100;

    const profitFactor = losers.length && avgLoss !== 0
      ? Math.abs(winners.reduce((s, x) => s + x.pnl, 0) / losers.reduce((s, x) => s + x.pnl, 0))
      : null;

    // Max drawdown — run cumulative P&L across symbols sorted by last sell date
    const symbolLastSell = {};
    for (const t of trades) {
      if (t.side === 'SELL') {
        const d = new Date(t.date).getTime();
        if (!symbolLastSell[t.symbol] || d > symbolLastSell[t.symbol]) symbolLastSell[t.symbol] = d;
      }
    }
    const sortedByDate = [...pnlBySymbol].sort((a, b) => (symbolLastSell[a.symbol] ?? 0) - (symbolLastSell[b.symbol] ?? 0));
    let cum = 0, peak = 0, maxDrawdown = 0;
    for (const { pnl } of sortedByDate) {
      cum += pnl;
      if (cum > peak) peak = cum;
      const dd = peak - cum;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Current streak — consecutive W/L from most recent closed symbol
    const sortedRecent = [...pnlBySymbol].sort((a, b) => (symbolLastSell[b.symbol] ?? 0) - (symbolLastSell[a.symbol] ?? 0));
    let streakCount = 0, streakType = null;
    for (const { pnl } of sortedRecent) {
      const type = pnl > 0 ? 'W' : 'L';
      if (streakType === null) { streakType = type; streakCount = 1; }
      else if (type === streakType) streakCount++;
      else break;
    }

    return { totalPnL, winRate, trades: trades.length, closed: pnlBySymbol.length, best, worst, avgWin, avgLoss, expectancy, kelly, pLoss5, pLoss10, profitFactor, maxDrawdown, streakCount, streakType };
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

  // Correlation warning — same-sector positions held simultaneously
  const correlationWarnings = $derived(() => {
    const positions = getPositions();
    if (!positions.length) return [];
    const tickers = getTickers();
    const sectorMap = Object.fromEntries(tickers.map(t => [t.symbol, t.sector || 'Unknown']));
    const bySector = {};
    for (const pos of positions) {
      if ((pos.qty ?? 0) <= 0) continue;
      const sector = sectorMap[pos.ticker] || 'Unknown';
      if (sector === 'Unknown') continue;
      if (!bySector[sector]) bySector[sector] = [];
      bySector[sector].push(pos.ticker);
    }
    return Object.entries(bySector)
      .filter(([, syms]) => syms.length >= 2)
      .map(([sector, symbols]) => ({ sector, symbols }));
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
      {#if s.maxDrawdown > 0}
        <div class="bg-surface-800 rounded-lg p-3">
          <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Max Drawdown</p>
          <p class="text-sm font-mono font-bold text-bear-strong">-${s.maxDrawdown.toFixed(2)}</p>
          <p class="text-[10px] text-text-muted">peak → trough</p>
        </div>
      {/if}
      {#if s.streakType !== null}
        <div class="bg-surface-800 rounded-lg p-3">
          <p class="text-[10px] text-text-muted uppercase tracking-wider mb-1">Streak</p>
          <p class="text-sm font-mono font-bold {s.streakType === 'W' ? 'text-bull-strong' : 'text-bear-strong'}">{s.streakCount}{s.streakType}</p>
          <p class="text-[10px] text-text-muted">in a row</p>
        </div>
      {/if}
    </div>

    <!-- Edge Analysis (needs ≥5 closed trades to be meaningful) -->
    {#if s.closed >= 5}
      {@const hasEdge = s.expectancy > 0}
      {@const kellyOk = s.kelly !== null && s.kelly > 0}
      <div class="mt-4 bg-surface-800 rounded-lg px-4 py-3 border border-border/40">
        <p class="text-[10px] text-text-muted uppercase tracking-wider mb-3">Edge Analysis <span class="normal-case font-normal">({s.closed} closed trades)</span></p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <!-- Expectancy -->
          <div>
            <p class="text-[10px] text-text-muted mb-0.5">Expectancy / trade</p>
            <p class="text-sm font-mono font-bold {hasEdge ? 'text-bull-strong' : 'text-bear-strong'}">{fmt(s.expectancy)}</p>
            <p class="text-[10px] text-text-muted">{hasEdge ? 'Positive edge' : 'No edge yet'}</p>
          </div>
          <!-- Kelly -->
          <div>
            <p class="text-[10px] text-text-muted mb-0.5">Kelly fraction</p>
            <p class="text-sm font-mono font-bold {kellyOk ? 'text-bull-strong' : 'text-bear-strong'}">
              {s.kelly !== null ? s.kelly.toFixed(1) + '%' : '—'}
            </p>
            <p class="text-[10px] text-text-muted">
              {s.kelly === null ? '' : s.kelly <= 0 ? 'Reduce size' : s.kelly > 25 ? 'Use ½ Kelly max' : 'Optimal bet size'}
            </p>
          </div>
          <!-- Profit Factor -->
          <div>
            <p class="text-[10px] text-text-muted mb-0.5">Profit factor</p>
            <p class="text-sm font-mono font-bold {s.profitFactor != null && s.profitFactor >= 1.5 ? 'text-bull-strong' : s.profitFactor != null && s.profitFactor >= 1 ? 'text-uncertain' : 'text-bear-strong'}">
              {s.profitFactor != null ? s.profitFactor.toFixed(2) : '—'}
            </p>
            <p class="text-[10px] text-text-muted">
              {s.profitFactor == null ? '' : s.profitFactor >= 2 ? 'Excellent' : s.profitFactor >= 1.5 ? 'Good' : s.profitFactor >= 1 ? 'Break-even' : 'Losing'}
            </p>
          </div>
          <!-- 5-loss streak -->
          <div>
            <p class="text-[10px] text-text-muted mb-0.5">5 losses in a row</p>
            <p class="text-sm font-mono font-bold {s.pLoss5 > 10 ? 'text-warning' : 'text-text-primary'}">{s.pLoss5.toFixed(1)}%</p>
            <p class="text-[10px] text-text-muted">≈ −10% at 2% risk</p>
          </div>
          <!-- 10-loss streak -->
          <div>
            <p class="text-[10px] text-text-muted mb-0.5">10 losses in a row</p>
            <p class="text-sm font-mono font-bold {s.pLoss10 > 5 ? 'text-danger' : 'text-text-primary'}">{s.pLoss10.toFixed(2)}%</p>
            <p class="text-[10px] text-text-muted">≈ −18% at 2% risk</p>
          </div>
        </div>
        {#if !hasEdge || !kellyOk}
          <p class="mt-2 text-[10px] text-text-muted border-t border-border/30 pt-2">
            {!hasEdge ? 'Expectancy is negative — your system is losing money per trade on average. Review your exit discipline before adding new positions.' : 'Kelly is ≤ 0 — your R:R ratio does not compensate for your win rate. Either tighten losses or let winners run.'}
          </p>
        {/if}
      </div>
    {/if}

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
      {#each correlationWarnings() as warn}
        <div class="mt-2 flex items-start gap-2 bg-uncertain/10 border border-uncertain/30 rounded-lg px-3 py-2">
          <span class="text-uncertain mt-0.5 shrink-0">⚡</span>
          <p class="text-xs text-uncertain">
            Correlation risk: {warn.symbols.join(' + ')} are both {warn.sector} names — they tend to move together in a sector selloff. Consider sizing down or hedging one leg.
          </p>
        </div>
      {/each}
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

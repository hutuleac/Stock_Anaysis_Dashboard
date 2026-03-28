<script>
  import { isChecklistComplete, getChecklist } from '../stores/checklist.svelte.js';
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { getPosition, getPortfolioValue } from '../stores/portfolio.svelte.js';
  import ThesisSummary from './ThesisSummary.svelte';
  import { getDaysToEarnings } from '../scoring.js';
  import { fetchCandles } from '../api/finnhub.svelte.js';

  let { symbol } = $props();

  const complete = $derived(isChecklistComplete(symbol));
  const checklist = $derived(getChecklist(symbol));
  const data = $derived(getTickerData(symbol));
  const position = $derived(getPosition(symbol));

  // ATR(14) — loaded from cached candle data
  let atr = $state(null);

  function computeATR(raw, period = 14) {
    if (!raw?.h || raw.h.length < period + 1) return null;
    const n = raw.h.length;
    const trs = [];
    for (let i = 1; i < n; i++) {
      const tr = Math.max(
        raw.h[i] - raw.l[i],
        Math.abs(raw.h[i] - raw.c[i - 1]),
        Math.abs(raw.l[i] - raw.c[i - 1])
      );
      trs.push(tr);
    }
    const recent = trs.slice(-period);
    return recent.reduce((s, v) => s + v, 0) / recent.length;
  }

  async function loadATR(sym) {
    const toTs = Math.floor(Date.now() / 1000);
    const fromTs = toTs - 60 * 86400; // 60 days of daily candles
    const raw = await fetchCandles(sym, 'D', fromTs, toTs);
    atr = computeATR(raw);
  }

  $effect(() => {
    if (complete && symbol) loadATR(symbol);
  });

  const currentPrice = $derived(data?.quote?.data?.c ?? null);
  const stopLoss = $derived(parseFloat(checklist.stopLoss) || null);

  // Risk calculations
  const riskPerShare = $derived(
    currentPrice && stopLoss ? Math.abs(currentPrice - stopLoss) : null
  );
  const riskPct = $derived(
    currentPrice && riskPerShare ? ((riskPerShare / currentPrice) * 100) : null
  );

  // Position sizing: risk 2% of portfolio per trade
  const RISK_PCT_PER_TRADE = 2;
  const portfolioVal = $derived(getPortfolioValue());
  const maxRiskDollars = $derived(portfolioVal > 0 ? portfolioVal * (RISK_PCT_PER_TRADE / 100) : null);
  const recommendedShares = $derived(
    maxRiskDollars && riskPerShare ? Math.floor(maxRiskDollars / riskPerShare) : null
  );
  const positionCost = $derived(
    recommendedShares && currentPrice ? recommendedShares * currentPrice : null
  );
  const positionPct = $derived(
    positionCost && portfolioVal ? (positionCost / portfolioVal) * 100 : null
  );

  function getScenarios() {
    if (!currentPrice || !stopLoss) return null;
    const risk = Math.abs(currentPrice - stopLoss);
    const isLong = stopLoss < currentPrice;

    return {
      base: {
        label: 'Base case (1:2 R:R)',
        price: isLong ? currentPrice + risk * 2 : currentPrice - risk * 2,
        rr: '1:2',
        probability: 'Medium',
      },
      extended: {
        label: 'Extended (1:3 R:R)',
        price: isLong ? currentPrice + risk * 3 : currentPrice - risk * 3,
        rr: '1:3',
        probability: 'Low',
      },
      stopOut: {
        label: 'Stop-out',
        price: stopLoss,
        rr: '1:1',
        probability: 'Defined',
      },
    };
  }

  const scenarios = $derived(getScenarios());
  const daysToEarnings = $derived(getDaysToEarnings(data?.earnings));

  function formatUSD(val) {
    if (val == null) return '—';
    return '$' + val.toFixed(2);
  }
</script>

<div class="relative">
  {#if !complete}
    <!-- Locked state -->
    <div class="bg-surface-700/30 border border-border/50 rounded-lg p-6 text-center relative overflow-hidden">
      <div class="absolute inset-0 backdrop-blur-sm bg-surface-900/60 z-10 flex flex-col items-center justify-center">
        <div class="text-3xl mb-2 opacity-60">🔒</div>
        <p class="text-text-muted text-sm font-medium">Complete the checklist to unlock</p>
        <p class="text-text-muted text-xs mt-1">Risk before reward.</p>
      </div>
      <!-- Blurred preview -->
      <div class="opacity-20 pointer-events-none select-none">
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bg-surface-600 rounded p-3 h-16"></div>
          <div class="bg-surface-600 rounded p-3 h-16"></div>
        </div>
        <div class="bg-surface-600 rounded p-3 h-24"></div>
      </div>
    </div>
  {:else}
    <!-- Unlocked state with fade-in -->
    <div class="space-y-4 animate-[fadeIn_0.4s_ease-out]">
      <div class="flex items-center gap-2 mb-1">
        <span class="text-bull-strong">🔓</span>
        <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Entry Panel</h3>
      </div>

      <!-- Thesis Summary -->
      <div class="bg-surface-700/50 rounded-lg p-3 border border-border/40">
        <ThesisSummary {symbol} />
      </div>

      <!-- Trade Window -->
      {#if daysToEarnings !== null}
        <div class="flex items-center gap-3 px-3 py-2 rounded-lg border {daysToEarnings <= 7 ? 'bg-danger/10 border-danger/40' : daysToEarnings <= 14 ? 'bg-warning/10 border-warning/40' : 'bg-surface-700/50 border-border/40'}">
          <span class="text-lg">{daysToEarnings <= 7 ? '🚨' : daysToEarnings <= 14 ? '⚠️' : '📅'}</span>
          <div>
            <p class="text-xs font-semibold {daysToEarnings <= 7 ? 'text-danger' : daysToEarnings <= 14 ? 'text-warning' : 'text-text-secondary'}">
              Trade window: {daysToEarnings === 0 ? 'Earnings today' : daysToEarnings === 1 ? '1 day remaining' : `${daysToEarnings} days remaining`}
            </p>
            <p class="text-[10px] text-text-muted">
              {daysToEarnings <= 7 ? 'Binary event risk — size down or wait for post-earnings.' : daysToEarnings <= 14 ? 'Factor earnings into your hold time and position size.' : 'Earnings not imminent — trade window is open.'}
            </p>
          </div>
        </div>
      {/if}

      <!-- High-volatility day warning -->
      {@const dp = data?.quote?.data?.dp ?? null}
      {#if dp !== null && Math.abs(dp) >= 5}
        <div class="flex items-center gap-3 px-3 py-2 rounded-lg border {dp >= 5 ? 'bg-warning/10 border-warning/40' : 'bg-danger/10 border-danger/40'}">
          <span class="text-lg">🌊</span>
          <div>
            <p class="text-xs font-semibold {dp >= 5 ? 'text-warning' : 'text-danger'}">
              High-volatility day ({dp > 0 ? '+' : ''}{dp.toFixed(1)}%)
            </p>
            <p class="text-[10px] text-text-muted">
              {dp >= 5 ? 'Chasing a gap-up — consider waiting for the dust to settle.' : 'Entering into a sharp selloff — could bounce or accelerate lower.'}
            </p>
          </div>
        </div>
      {/if}

      <!-- Risk Snapshot -->
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-surface-700 rounded-lg p-3">
          <p class="text-xs text-text-muted mb-1">Current Price</p>
          <p class="font-mono font-semibold text-text-primary">{formatUSD(currentPrice)}</p>
        </div>
        <div class="bg-surface-700 rounded-lg p-3">
          <p class="text-xs text-text-muted mb-1">Stop Loss</p>
          <p class="font-mono font-semibold text-danger">{formatUSD(stopLoss)}</p>
        </div>
        <div class="bg-surface-700 rounded-lg p-3">
          <p class="text-xs text-text-muted mb-1">Risk / Share</p>
          <p class="font-mono font-semibold text-bear-weak">{formatUSD(riskPerShare)}</p>
        </div>
        <div class="bg-surface-700 rounded-lg p-3">
          <p class="text-xs text-text-muted mb-1">Risk %</p>
          <p class="font-mono font-semibold text-bear-weak">
            {riskPct !== null ? riskPct.toFixed(1) + '%' : '—'}
          </p>
        </div>
      </div>

      <!-- ATR Volatility Band -->
      {#if atr !== null && currentPrice}
        {@const atrPct = (atr / currentPrice) * 100}
        {@const stopTooTight = riskPerShare !== null && riskPerShare < atr * 0.5}
        {@const stopWithinATR = riskPerShare !== null && riskPerShare < atr}
        <div class="rounded-lg p-3 border {stopTooTight ? 'bg-danger/10 border-danger/40' : stopWithinATR ? 'bg-warning/10 border-warning/40' : 'bg-surface-700/50 border-border/40'}">
          <div class="flex items-center justify-between mb-1">
            <p class="text-xs font-semibold {stopTooTight ? 'text-danger' : stopWithinATR ? 'text-warning' : 'text-text-muted'}">
              {stopTooTight ? '⚠ Stop within noise range' : stopWithinATR ? '⚠ Stop within 1 ATR' : '📊 Intraday Volatility (ATR 14)'}
            </p>
            <span class="font-mono text-xs text-text-secondary">{formatUSD(atr)} / {atrPct.toFixed(1)}%</span>
          </div>
          <p class="text-[11px] text-text-muted">
            On a normal day, {symbol} moves ≈ {formatUSD(atr)} ({atrPct.toFixed(1)}%).
            {#if stopTooTight}
              Your stop is less than half an ATR — likely to be triggered by noise.
            {:else if stopWithinATR}
              Your stop is within one ATR — consider widening it or sizing down.
            {:else}
              Stop is beyond the daily noise range.
            {/if}
          </p>
        </div>
      {/if}

      <!-- Position size recommendation -->
      <div class="bg-surface-700 rounded-lg p-3 border-l-2 border-uncertain">
        <p class="text-xs text-text-muted mb-2">Position Size (2% risk rule)</p>
        {#if recommendedShares !== null}
          <div class="flex items-baseline gap-3 flex-wrap">
            <span class="font-mono font-semibold text-text-primary text-sm">{recommendedShares} shares</span>
            <span class="text-xs text-text-muted">≈ ${positionCost?.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({positionPct?.toFixed(1)}% of portfolio)</span>
          </div>
          <p class="text-xs text-text-muted mt-1">Max loss: ${maxRiskDollars?.toFixed(0)} ({RISK_PCT_PER_TRADE}% of ${portfolioVal?.toLocaleString()})</p>
        {:else}
          <p class="text-xs text-text-secondary">
            {#if !portfolioVal}Set portfolio value in Settings to see recommended shares.
            {:else if !riskPerShare}Set a stop loss above to calculate position size.
            {/if}
          </p>
        {/if}
      </div>

      <!-- Scenario Table -->
      {#if scenarios}
        <div class="bg-surface-700 rounded-lg overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-xs text-text-muted border-b border-border/50">
                <th class="px-3 py-2 text-left">Scenario</th>
                <th class="px-3 py-2 text-right">Price</th>
                <th class="px-3 py-2 text-right">P&L %</th>
                <th class="px-3 py-2 text-center">R:R</th>
              </tr>
            </thead>
            <tbody>
              <tr class="border-b border-border/30">
                <td class="px-3 py-2 text-text-secondary">{scenarios.base.label}</td>
                <td class="px-3 py-2 text-right font-mono text-bull-strong">{formatUSD(scenarios.base.price)}</td>
                <td class="px-3 py-2 text-right font-mono text-bull-strong">
                  +{((scenarios.base.price - currentPrice) / currentPrice * 100).toFixed(1)}%
                </td>
                <td class="px-3 py-2 text-center text-text-muted">{scenarios.base.rr}</td>
              </tr>
              <tr class="border-b border-border/30">
                <td class="px-3 py-2 text-text-secondary">{scenarios.extended.label}</td>
                <td class="px-3 py-2 text-right font-mono text-bull-strong">{formatUSD(scenarios.extended.price)}</td>
                <td class="px-3 py-2 text-right font-mono text-bull-strong">
                  +{((scenarios.extended.price - currentPrice) / currentPrice * 100).toFixed(1)}%
                </td>
                <td class="px-3 py-2 text-center text-text-muted">{scenarios.extended.rr}</td>
              </tr>
              <tr>
                <td class="px-3 py-2 text-text-secondary">{scenarios.stopOut.label}</td>
                <td class="px-3 py-2 text-right font-mono text-danger">{formatUSD(scenarios.stopOut.price)}</td>
                <td class="px-3 py-2 text-right font-mono text-danger">
                  -{riskPct?.toFixed(1)}%
                </td>
                <td class="px-3 py-2 text-center text-text-muted">{scenarios.stopOut.rr}</td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}

      {#if position}
        <div class="text-xs text-uncertain bg-uncertain/10 rounded px-3 py-2">
          Existing position: {position.qty} shares @ {formatUSD(position.avgCost)}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>

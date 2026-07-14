<script>
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { getPortfolioValue } from '../stores/portfolio.svelte.js';
  import ThesisSummary from './ThesisSummary.svelte';
  import { getDaysToEarnings, betaAdjustedRiskPct } from '../scoring.js';

  let { symbol } = $props();

  const data = $derived(getTickerData(symbol));

  // Daily ATR(14) — reuse the value computed from the candles App.svelte already
  // fetches (data.indicators.atr); no extra API call.
  const atr = $derived(data?.indicators?.atr ?? null);

  const currentPrice = $derived(data?.quote?.data?.c ?? null);
  const dp = $derived(data?.quote?.data?.dp ?? null);

  // Weekly ATR — horizon-appropriate for 2mo–1yr holds.
  const weeklyAtr = $derived(data?.weekly?.atr ?? null);
  // Upside target = most significant swing high (chartAnchors, computed free).
  const upsideTarget = $derived(data?.anchors?.fib?.swingHigh ?? null);
  // Suggested stop: entry − 2× weekly ATR.
  const suggestedStop = $derived(
    currentPrice && weeklyAtr ? currentPrice - 2 * weeklyAtr : null
  );

  // Risk based on suggested stop
  const riskPerShare = $derived(
    currentPrice && suggestedStop ? Math.abs(currentPrice - suggestedStop) : null
  );
  const riskPct = $derived(
    currentPrice && riskPerShare ? ((riskPerShare / currentPrice) * 100) : null
  );

  // R:R to swing-high target
  const rrToTarget = $derived(
    currentPrice && upsideTarget && suggestedStop &&
    upsideTarget > currentPrice && suggestedStop < currentPrice
      ? (upsideTarget - currentPrice) / (currentPrice - suggestedStop)
      : null
  );

  // Position sizing: beta-adjusted risk % of portfolio per trade
  const beta = $derived(data?.metrics?.data?.metric?.beta ?? null);
  const betaAdj = $derived(betaAdjustedRiskPct(beta));
  const portfolioVal = $derived(getPortfolioValue());
  const maxRiskDollars = $derived(portfolioVal > 0 ? portfolioVal * (betaAdj.riskPct / 100) : null);
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
    if (!currentPrice || !suggestedStop) return null;
    const risk = Math.abs(currentPrice - suggestedStop);
    const isLong = suggestedStop < currentPrice;

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
        price: suggestedStop,
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
    <div class="space-y-3">
      <div class="flex items-center gap-2 mb-1">
        <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Entry Panel</h3>
      </div>

      <!-- Thesis Summary -->
      <div class="bg-surface-700/50 rounded-lg p-2.5 border border-border/40">
        <ThesisSummary {symbol} />
      </div>

      <!-- Trade Window -->
      {#if daysToEarnings !== null}
        <div class="flex items-center gap-3 px-2.5 py-1.5 rounded-lg border {daysToEarnings <= 7 ? 'bg-danger/10 border-danger/40' : daysToEarnings <= 14 ? 'bg-warning/10 border-warning/40' : 'bg-surface-700/50 border-border/40'}">
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
      {#if dp !== null && Math.abs(dp) >= 5}
        <div class="flex items-center gap-3 px-2.5 py-1.5 rounded-lg border {dp >= 5 ? 'bg-warning/10 border-warning/40' : 'bg-danger/10 border-danger/40'}">
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

      <!-- Two-column trade layout: risk/position/scenarios left, ATR + R:R right -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <!-- Left column -->
        <div class="space-y-3">
          <!-- Risk Snapshot -->
          <div class="grid grid-cols-2 gap-2">
            <div class="bg-surface-700 rounded-lg p-2.5">
              <p class="text-xs text-text-muted mb-1">Current Price</p>
              <p class="font-mono font-semibold text-text-primary">{formatUSD(currentPrice)}</p>
            </div>
            <div class="bg-surface-700 rounded-lg p-2.5">
              <p class="text-xs text-text-muted mb-1">Suggested Stop (2× wk ATR)</p>
              <p class="font-mono font-semibold text-danger">{formatUSD(suggestedStop)}</p>
            </div>
            <div class="bg-surface-700 rounded-lg p-2.5">
              <p class="text-xs text-text-muted mb-1">Risk / Share</p>
              <p class="font-mono font-semibold text-bear-weak">{formatUSD(riskPerShare)}</p>
            </div>
            <div class="bg-surface-700 rounded-lg p-2.5">
              <p class="text-xs text-text-muted mb-1">Risk %</p>
              <p class="font-mono font-semibold text-bear-weak">
                {riskPct !== null ? riskPct.toFixed(1) + '%' : '—'}
              </p>
            </div>
          </div>

          <!-- Position size recommendation -->
          <div class="bg-surface-700 rounded-lg p-2.5 border-l-2 border-uncertain">
            <div class="flex items-center justify-between mb-1.5">
              <p class="text-xs text-text-muted">Position Size ({betaAdj.riskPct}% risk rule)</p>
              {#if beta !== null}
                {@const betaColor = betaAdj.tier === 'high' ? 'text-danger' : betaAdj.tier === 'elevated' ? 'text-uncertain' : betaAdj.tier === 'low' ? 'text-bull-strong' : 'text-text-muted'}
                <span class="text-[11px] font-mono {betaColor}" title="Beta {beta.toFixed(2)} → {betaAdj.riskPct}% risk allocation">β {beta.toFixed(2)}</span>
              {/if}
            </div>
            {#if recommendedShares !== null}
              <div class="flex items-baseline gap-3 flex-wrap">
                <span class="font-mono font-semibold text-text-primary text-sm">{recommendedShares} shares</span>
                <span class="text-xs text-text-muted">≈ ${positionCost?.toLocaleString('en-US', { maximumFractionDigits: 0 })} ({positionPct?.toFixed(1)}% of portfolio)</span>
              </div>
              <p class="text-xs text-text-muted mt-1">Max loss: ${maxRiskDollars?.toFixed(0)} ({betaAdj.riskPct}% of ${portfolioVal?.toLocaleString()})</p>
            {:else}
              <p class="text-xs text-text-secondary">
                {#if !portfolioVal}Set portfolio value in Settings to see recommended shares.
                {:else if !riskPerShare}Weekly ATR unavailable — load candle data to calculate position size.
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
                    <th class="px-2.5 py-1.5 text-left">Scenario</th>
                    <th class="px-2.5 py-1.5 text-right">Price</th>
                    <th class="px-2.5 py-1.5 text-right">P&L %</th>
                    <th class="px-2.5 py-1.5 text-center">R:R</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="border-b border-border/30">
                    <td class="px-2.5 py-1.5 text-text-secondary">{scenarios.base.label}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-bull-strong">{formatUSD(scenarios.base.price)}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-bull-strong">
                      +{((scenarios.base.price - currentPrice) / currentPrice * 100).toFixed(1)}%
                    </td>
                    <td class="px-2.5 py-1.5 text-center text-text-muted">{scenarios.base.rr}</td>
                  </tr>
                  <tr class="border-b border-border/30">
                    <td class="px-2.5 py-1.5 text-text-secondary">{scenarios.extended.label}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-bull-strong">{formatUSD(scenarios.extended.price)}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-bull-strong">
                      +{((scenarios.extended.price - currentPrice) / currentPrice * 100).toFixed(1)}%
                    </td>
                    <td class="px-2.5 py-1.5 text-center text-text-muted">{scenarios.extended.rr}</td>
                  </tr>
                  <tr>
                    <td class="px-2.5 py-1.5 text-text-secondary">{scenarios.stopOut.label}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-danger">{formatUSD(scenarios.stopOut.price)}</td>
                    <td class="px-2.5 py-1.5 text-right font-mono text-danger">
                      -{riskPct?.toFixed(1)}%
                    </td>
                    <td class="px-2.5 py-1.5 text-center text-text-muted">{scenarios.stopOut.rr}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          {/if}
        </div>

        <!-- Right column: ATR (upper) + R:R to target -->
        <div class="space-y-3">
          <!-- ATR Volatility Band -->
          {#if atr !== null && currentPrice}
            {@const atrPct = (atr / currentPrice) * 100}
            <div class="rounded-lg p-2.5 border bg-surface-700/50 border-border/40">
              <div class="flex items-center justify-between mb-1">
                <p class="text-xs font-semibold text-text-muted">📊 Intraday Volatility (ATR 14)</p>
                <span class="font-mono text-xs text-text-secondary">{formatUSD(atr)} / {atrPct.toFixed(1)}%</span>
              </div>
              <p class="text-[11px] text-text-muted">
                On a normal day, {symbol} moves ≈ {formatUSD(atr)} ({atrPct.toFixed(1)}%).
              </p>
            </div>
          {/if}

          <!-- R:R to swing-high target -->
          {#if rrToTarget !== null}
            <div class="bg-surface-700 rounded-lg p-2.5">
              <p class="text-xs text-text-muted mb-1">R:R to Target (swing high)</p>
              <p class="font-mono font-semibold {rrToTarget >= 2 ? 'text-bull-strong' : rrToTarget >= 1 ? 'text-uncertain' : 'text-bear-weak'}">
                1:{rrToTarget.toFixed(1)}
              </p>
              <p class="text-[10px] text-text-muted mt-0.5">target {formatUSD(upsideTarget)}</p>
            </div>
          {/if}
        </div>
      </div>

    </div>
</div>


<script>
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { computeScore, computeScoreZScore } from '../scoring.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';

  let { symbol } = $props();

  const data = $derived(getTickerData(symbol));
  const m = $derived(data?.metrics?.data?.metric ?? {});
  const pt = $derived(data?.priceTarget?.data ?? null);
  const price = $derived(data?.quote?.data?.c ?? null);

  const insiderNet = $derived(() => {
    const txns = data?.insider?.data?.data;
    if (!Array.isArray(txns) || txns.length === 0) return null;
    let net = 0;
    for (const t of txns) {
      const type = (t.transactionType || '').toUpperCase();
      if (type === 'P-PURCHASE' || type === 'BUY') net += t.share ?? 0;
      else if (type === 'S-SALE' || type === 'SELL') net -= t.share ?? 0;
    }
    return net;
  });

  function fmtInsider(net) {
    if (net === null) return '—';
    const abs = Math.abs(net);
    const str = abs >= 1000 ? `${(abs / 1000).toFixed(0)}K` : `${abs}`;
    return (net >= 0 ? '+' : '-') + str;
  }

  function fmt(val, prefix = '', suffix = '', decimals = 1) {
    if (val == null || isNaN(val)) return '—';
    return `${prefix}${Number(val).toFixed(decimals)}${suffix}`;
  }

  function fmtBig(val) {
    if (val == null) return '—';
    if (val >= 1e12) return `$${(val / 1e12).toFixed(1)}T`;
    if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
    if (val >= 1e6)  return `$${(val / 1e6).toFixed(1)}M`;
    return `$${val.toFixed(0)}`;
  }

  // 52-week position bar width %
  const pos52w = $derived(() => {
    const h = m['52WeekHigh'], l = m['52WeekLow'];
    if (!h || !l || !price || h <= l) return null;
    return Math.round(((price - l) / (h - l)) * 100);
  });

  // Analyst target premium %
  const targetPremium = $derived(() => {
    const t = pt?.targetMean ?? pt?.targetHigh;
    if (!t || !price) return null;
    return ((t - price) / price * 100).toFixed(1);
  });

  const tdQuote  = $derived(data?.tdQuote ?? null);
  const weekly   = $derived(data?.weekly ?? null);
  const score    = $derived(computeScore(data));
  const scoreZ   = $derived(computeScoreZScore(symbol));

  function fmtVol(v) {
    if (!v) return '—';
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(v);
  }

  const metrics = $derived([
    {
      label: 'Mkt Cap',
      value: fmtBig(m['marketCapitalization'] ? m['marketCapitalization'] * 1e6 : null),
      note: null,
    },
    {
      label: 'P/E',
      value: fmt(m['peNormalizedAnnual'] ?? m['peBasicExclExtraTTM'], '', 'x'),
      note: null,
      color: (() => {
        const pe = m['peNormalizedAnnual'] ?? m['peBasicExclExtraTTM'];
        if (!pe) return '';
        return pe >= 10 && pe <= 25 ? 'text-bull-strong' : pe > 60 ? 'text-bear-strong' : '';
      })(),
    },
    {
      label: 'EPS Growth',
      value: fmt(m['epsGrowthTTMYoy'] ?? m['epsGrowth3Y'], '', '%'),
      color: (() => {
        const g = m['epsGrowthTTMYoy'] ?? m['epsGrowth3Y'];
        if (g == null) return '';
        return g > 5 ? 'text-bull-strong' : g < 0 ? 'text-bear-strong' : '';
      })(),
    },
    {
      label: 'EMA50',
      value: fmt(m['50DayMovingAverage'] ?? data?.indicators?.ema50, '$'),
      note: (() => {
        const v = m['50DayMovingAverage'] ?? data?.indicators?.ema50;
        return (v && price) ? (((price - v) / v) * 100).toFixed(1) + '%' : null;
      })(),
      noteColor: (() => {
        const v = m['50DayMovingAverage'] ?? data?.indicators?.ema50;
        return (v && price) ? (price > v ? 'text-bull-strong' : 'text-bear-strong') : '';
      })(),
    },
    {
      label: 'EMA200',
      value: fmt(m['200DayMovingAverage'] ?? data?.indicators?.ema200, '$'),
      note: (() => {
        const v = m['200DayMovingAverage'] ?? data?.indicators?.ema200;
        return (v && price) ? (((price - v) / v) * 100).toFixed(1) + '%' : null;
      })(),
      noteColor: (() => {
        const v = m['200DayMovingAverage'] ?? data?.indicators?.ema200;
        return (v && price) ? (price > v ? 'text-bull-strong' : 'text-bear-strong') : '';
      })(),
    },
    {
      label: 'Analyst Target',
      value: pt?.targetMean ? `$${pt.targetMean.toFixed(2)}` : '—',
      note: targetPremium() ? (targetPremium() > 0 ? '+' : '') + targetPremium() + '%' : null,
      noteColor: targetPremium() ? (parseFloat(targetPremium()) > 0 ? 'text-bull-strong' : 'text-bear-strong') : '',
    },
  ]);
</script>

<div class="bg-surface-800/60 border border-border/50 rounded-lg px-4 py-3">
  <div class="flex flex-wrap gap-x-6 gap-y-2">
    {#each metrics as metric}
      {@const metricTip = metric.label === 'EMA50' ? TIPS.ema50 : metric.label === 'EMA200' ? TIPS.ema200 : metric.label === 'P/E' ? TIPS.pe : metric.label === 'EPS Growth' ? TIPS.epsGrowth : metric.label === 'Mkt Cap' ? TIPS.mktCap : metric.label === 'Analyst Target' ? TIPS.analystTarget : null}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={metricTip ?? undefined}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">{metric.label}</span>
        <div class="flex items-baseline gap-1.5 mt-0.5">
          <span class="text-sm font-mono font-semibold {metric.color ?? 'text-text-primary'}">{metric.value}</span>
          {#if metric.note}
            <span class="text-[13px] {metric.noteColor ?? 'text-text-muted'}">{metric.note}</span>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Insider net (90d) -->
    {#if insiderNet() !== null}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={TIPS.insider}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Insider 90d</span>
        <span class="text-sm font-mono font-semibold mt-0.5 {insiderNet() > 0 ? 'text-bull-strong' : insiderNet() < 0 ? 'text-bear-strong' : 'text-text-muted'}">
          {fmtInsider(insiderNet())} shares
        </span>
      </div>
    {:else}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={TIPS.insider}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Insider 90d</span>
        <span class="text-sm font-mono font-semibold text-text-muted mt-0.5">—</span>
      </div>
    {/if}

    <!-- RSI(14) — from TwelveData if available -->
    {#if data?.indicators?.rsi != null}
      {@const rsi = data.indicators.rsi}
      {@const rsiDir = data.indicators.rsiDirection}
      {@const rsiZ = data.indicators.rsiZScore}
      {@const rsiColor = rsi < 30 ? 'text-bull-strong' : rsi < 40 ? 'text-uncertain' : rsi > 70 ? 'text-danger' : rsi > 60 ? 'text-warning' : 'text-text-primary'}
      {@const rsiCssColor = rsi < 30 ? '#22c55e' : rsi < 40 ? '#f59e0b' : rsi > 70 ? '#ef4444' : rsi > 60 ? '#f59e0b' : '#9ca3af'}
      {@const rsiLabel = rsi < 30 ? 'Oversold' : rsi < 40 ? 'Mild Weak' : rsi > 70 ? 'Overbought' : rsi > 55 ? 'Healthy' : 'Neutral'}
      <div class="flex flex-col min-w-[70px] cursor-default" use:tipAction={() => ({ ...TIPS.rsi, current: { value: rsi.toFixed(1), label: rsiLabel, color: rsiCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">RSI 14</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {rsiColor}">{rsi.toFixed(1)}</span>
          <span class="text-[13px] text-text-muted">{rsiDir === 'rising' ? '↑' : rsiDir === 'falling' ? '↓' : '→'}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[12px] {rsiColor}">{rsi < 30 ? 'Oversold' : rsi < 40 ? 'Mild OS' : rsi > 70 ? 'Overbought' : rsi > 60 ? 'Extended' : 'Neutral'}</span>
          {#if rsiZ != null}
            {@const rsiZCssColor = rsiZ > 2 ? '#ef4444' : rsiZ < -2 ? '#22c55e' : rsiZ > 1 ? '#f59e0b' : rsiZ < -1 ? '#f59e0b' : '#6b7280'}
            {@const rsiZLabel = rsiZ > 2 ? 'Unusually High' : rsiZ < -2 ? 'Deeply Depressed' : rsiZ > 1 ? 'Above baseline' : rsiZ < -1 ? 'Below baseline' : 'Normal'}
            <span class="text-[12px] text-text-muted font-mono cursor-default" use:tipAction={() => ({ ...TIPS.rsiZ, current: { value: `z${rsiZ >= 0 ? '+' : ''}${rsiZ.toFixed(1)}`, label: rsiZLabel, color: rsiZCssColor } })}>z{rsiZ >= 0 ? '+' : ''}{rsiZ.toFixed(1)}</span>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex flex-col min-w-[70px] cursor-default" use:tipAction={TIPS.rsi}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">RSI 14</span>
        <span class="text-sm font-mono font-semibold text-text-muted">—</span>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- MACD — from TwelveData if available -->
    {#if data?.indicators?.macd != null}
      {@const macd = data.indicators.macd}
      {@const cross = data.indicators.macdCrossover}
      {@const histColor = macd.histogram > 0 ? 'text-bull-strong' : 'text-bear-strong'}
      {@const macdCssColor = macd.histogram > 0 ? '#22c55e' : '#ef4444'}
      {@const macdLabel = cross === 'bullish_cross' ? 'Bull cross' : cross === 'bearish_cross' ? 'Bear cross' : macd.histogram > 0 ? 'Bullish' : 'Bearish'}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={() => ({ ...TIPS.macd, current: { value: (macd.histogram > 0 ? '+' : '') + macd.histogram.toFixed(3), label: macdLabel, color: macdCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">MACD</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {histColor}">{macd.histogram > 0 ? '+' : ''}{macd.histogram.toFixed(2)}</span>
        </div>
        <span class="text-[12px] {cross === 'bullish_cross' ? 'text-bull-strong font-semibold' : cross === 'bearish_cross' ? 'text-danger font-semibold' : 'text-text-muted'}">
          {cross === 'bullish_cross' ? '⚡ Bull cross' : cross === 'bearish_cross' ? '⚡ Bear cross' : macd.histogram > 0 ? 'Bullish' : 'Bearish'}
        </span>
      </div>
    {:else}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={TIPS.macd}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">MACD</span>
        <span class="text-sm font-mono font-semibold text-text-muted">—</span>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- ADX — trend strength -->
    {#if data?.indicators?.adx != null}
      {@const adx = data.indicators.adx}
      {@const adxLabel = adx > 40 ? 'Strong' : adx > 25 ? 'Trending' : adx > 20 ? 'Emerging' : 'Ranging'}
      {@const adxColor = adx > 25 ? 'text-bull-strong' : adx > 20 ? 'text-uncertain' : 'text-text-muted'}
      {@const adxCssColor = adx > 25 ? '#22c55e' : adx > 20 ? '#f59e0b' : '#6b7280'}
      <div class="flex flex-col min-w-[70px] cursor-default" use:tipAction={() => ({ ...TIPS.adx, current: { value: adx.toFixed(1), label: adxLabel, color: adxCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">ADX 14</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {adxColor}">{adx.toFixed(1)}</span>
        </div>
        <span class="text-[12px] {adxColor}">{adxLabel}</span>
      </div>
    {:else}
      <div class="flex flex-col min-w-[70px] cursor-default" use:tipAction={TIPS.adx}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">ADX 14</span>
        <span class="text-sm font-mono font-semibold text-text-muted">—</span>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- Stochastic %K/%D -->
    {#if data?.indicators?.stochK != null}
      {@const k = data.indicators.stochK}
      {@const d = data.indicators.stochD}
      {@const cross = data.indicators.stochCross}
      {@const stochColor = k < 20 ? 'text-bull-strong' : k > 80 ? 'text-danger' : k < 35 ? 'text-uncertain' : 'text-text-primary'}
      {@const stochCssColor = k < 20 ? '#22c55e' : k > 80 ? '#ef4444' : k < 35 ? '#f59e0b' : '#f3f4f6'}
      {@const stochLabel = cross === 'bullish_cross' ? 'Bull cross' : cross === 'bearish_cross' ? 'Bear cross' : k < 20 ? 'Oversold' : k > 80 ? 'Overbought' : k < 35 ? 'Approaching' : 'Neutral'}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={() => ({ ...TIPS.stoch, current: { value: k.toFixed(1), label: stochLabel, color: stochCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Stoch %K</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {stochColor}">{k.toFixed(1)}</span>
          {#if d != null}
            <span class="text-[13px] text-text-muted">/ {d.toFixed(1)}</span>
          {/if}
        </div>
        <span class="text-[12px] {cross === 'bullish_cross' ? 'text-bull-strong font-semibold' : cross === 'bearish_cross' ? 'text-danger font-semibold' : stochColor}">
          {cross === 'bullish_cross' ? '⚡ Bull cross' : cross === 'bearish_cross' ? '⚡ Bear cross' : k < 20 ? 'Oversold' : k > 80 ? 'Overbought' : k < 35 ? 'Mild OS' : 'Neutral'}
        </span>
      </div>
    {:else}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={TIPS.stoch}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Stoch %K</span>
        <span class="text-sm font-mono font-semibold text-text-muted">—</span>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- T/F/S sub-scores + regime weights -->
    {#if score.score != null}
      {@const wT = Math.round((score.weights?.tech ?? 0.35) * 100)}
      {@const wF = Math.round((score.weights?.fund ?? 0.45) * 100)}
      {@const wS = Math.round((score.weights?.sent ?? 0.20) * 100)}
      {@const isRegime = score.regimeNote != null}
      <div class="flex flex-col min-w-[120px] cursor-default" use:tipAction={TIPS.tfsScore}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">T / F / S</span>
        <div class="flex items-center gap-2 mt-1">
          {#each [['T', score.technical, wT], ['F', score.fundamental, wF], ['S', score.sentiment, wS]] as [lbl, val, wt]}
            {#if val !== null}
              <div class="flex flex-col items-center gap-0.5" title="{lbl === 'T' ? 'Technical' : lbl === 'F' ? 'Fundamental' : 'Sentiment'}: {val} (weight {wt}%)">
                <span class="text-[12px] text-text-muted">{lbl}</span>
                <div class="w-6 h-8 bg-surface-600 rounded-sm overflow-hidden flex flex-col-reverse">
                  <div class="w-full rounded-sm {val >= 60 ? 'bg-bull-strong' : val >= 40 ? 'bg-neutral' : 'bg-bear-strong'}" style="height:{val}%"></div>
                </div>
                <span class="text-[12px] font-mono {isRegime ? 'text-warning' : 'text-text-muted'}">{wt}%</span>
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}

    <!-- Conviction — signal agreement score -->
    {#if score.conviction != null}
      {@const convColor = score.convictionLabel === 'HIGH' ? 'text-bull-strong' : score.convictionLabel === 'MODERATE' ? 'text-uncertain' : score.convictionLabel === 'MIXED' ? 'text-bear-weak' : 'text-text-muted'}
      {@const convCssColor = score.convictionLabel === 'HIGH' ? '#22c55e' : score.convictionLabel === 'MODERATE' ? '#f59e0b' : score.convictionLabel === 'MIXED' ? '#ef4444' : '#6b7280'}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={() => ({ ...TIPS.conviction, current: { value: score.conviction + '%', label: score.convictionLabel, color: convCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Conviction</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {convColor}">{score.conviction}%</span>
        </div>
        <span class="text-[12px] {convColor}">{score.convictionLabel}</span>
      </div>
    {/if}

    <!-- Score z-score vs 90-day history -->
    {#if scoreZ != null}
      {@const szColor = scoreZ > 1.5 ? 'text-bull-strong' : scoreZ < -1.5 ? 'text-bear-strong' : 'text-text-muted'}
      {@const szCssColor = scoreZ > 1.5 ? '#22c55e' : scoreZ < -1.5 ? '#ef4444' : '#6b7280'}
      {@const szLabel = scoreZ > 2 ? 'Extended' : scoreZ < -2 ? 'Depressed' : scoreZ > 1 ? 'Above avg' : scoreZ < -1 ? 'Below avg' : 'In range'}
      <div class="flex flex-col min-w-[60px] cursor-default" use:tipAction={() => ({ ...TIPS.scoreZ, current: { value: (scoreZ >= 0 ? '+' : '') + scoreZ.toFixed(1), label: szLabel, color: szCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Score Z</span>
        <span class="text-sm font-mono font-semibold mt-0.5 {szColor}">{scoreZ >= 0 ? '+' : ''}{scoreZ.toFixed(1)}</span>
        <span class="text-[12px] {szColor}">{scoreZ > 2 ? 'Extended' : scoreZ < -2 ? 'Depressed' : scoreZ > 1 ? 'Above avg' : scoreZ < -1 ? 'Below avg' : 'In range'}</span>
      </div>
    {/if}

    <!-- Weekly trend (multi-timeframe) -->
    {#if weekly}
      {@const trendColor = weekly.trend === 'up' ? 'text-bull-strong' : weekly.trend === 'down' ? 'text-bear-strong' : 'text-text-muted'}
      {@const trendIcon = weekly.trend === 'up' ? '↑' : weekly.trend === 'down' ? '↓' : '→'}
      {@const wTrendCssColor = weekly.trend === 'up' ? '#22c55e' : weekly.trend === 'down' ? '#ef4444' : '#6b7280'}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={() => ({ ...TIPS.weeklyTrend, current: { value: weekly.trend.toUpperCase(), label: weekly.trend === 'up' ? 'Uptrend' : weekly.trend === 'down' ? 'Downtrend' : 'Neutral', color: wTrendCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">W.Trend</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {trendColor}">{trendIcon} {weekly.trend.toUpperCase()}</span>
        </div>
        <div class="flex flex-col gap-0.5 mt-0.5">
          {#if weekly.rsi !== null}
            <span class="text-[12px] text-text-muted">W.RSI {weekly.rsi}</span>
          {/if}
          {#if weekly.ema10 !== null && price}
            {@const aboveW = price > weekly.ema10}
            <span class="text-[12px] {aboveW ? 'text-bull-strong' : 'text-bear-strong'}" title="Weekly EMA10: ${weekly.ema10.toFixed(2)}">
              {aboveW ? '▲' : '▼'} W.EMA10
            </span>
          {/if}
          {#if weekly.macd !== null}
            <span class="text-[12px] {weekly.macd.histogram > 0 ? 'text-bull-strong' : 'text-bear-strong'}">
              W.MACD {weekly.macd.histogram > 0 ? 'bull' : 'bear'}
            </span>
          {/if}
        </div>
      </div>
    {:else}
      <div class="flex flex-col min-w-[80px] cursor-default" use:tipAction={TIPS.weeklyTrend}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">W.Trend</span>
        <span class="text-sm font-mono font-semibold text-text-muted">—</span>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- Volume ratio — from TwelveData live quote -->
    {#if tdQuote?.volume && tdQuote?.avgVolume}
      {@const ratio = tdQuote.volumeRatio}
      {@const volColor = ratio >= 2 ? 'text-bull-strong' : ratio >= 1.5 ? 'text-uncertain' : ratio <= 0.4 ? 'text-text-muted' : 'text-text-primary'}
      {@const volCssColor = ratio >= 2 ? '#22c55e' : ratio >= 1.5 ? '#f59e0b' : '#9ca3af'}
      {@const volLabel = ratio >= 2 ? 'Surge' : ratio >= 1.5 ? 'Above avg' : ratio <= 0.5 ? 'Very low' : 'Normal'}
      <div class="flex flex-col min-w-[90px] cursor-default" use:tipAction={() => ({ ...TIPS.volume, current: { value: ratio.toFixed(2) + '×', label: volLabel, color: volCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Volume</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {volColor}">{fmtVol(tdQuote.volume)}</span>
        </div>
        <span class="text-[12px] {volColor}">
          {ratio !== null ? ratio.toFixed(2) + '× avg' : ''}
          {ratio >= 2 ? ' 🔥' : ratio <= 0.4 ? ' low' : ''}
        </span>
      </div>
    {:else}
      <div class="flex flex-col min-w-[90px] cursor-default" use:tipAction={TIPS.volume}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">Volume</span>
        <span class="text-sm font-mono font-semibold text-text-muted">—</span>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- BB position — from TwelveData if available -->
    {#if data?.indicators?.bb != null && price}
      {@const bb = data.indicators.bb}
      {@const bbPct = ((price - bb.lower) / (bb.upper - bb.lower) * 100)}
      {@const bbColor = bbPct < 15 ? 'text-bull-strong' : bbPct > 85 ? 'text-danger' : 'text-text-primary'}
      {@const bbCssColor = bbPct < 15 ? '#22c55e' : bbPct > 85 ? '#ef4444' : '#9ca3af'}
      {@const bbLabel = bbPct < 15 ? 'Near lower' : bbPct > 85 ? 'Near upper' : 'Mid-band'}
      <div class="flex flex-col min-w-[100px] cursor-default" use:tipAction={() => ({ ...TIPS.bb, current: { value: bbPct.toFixed(0) + '%', label: bbLabel, color: bbCssColor } })}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">BB Position</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <div class="flex-1 relative h-1 bg-surface-600 rounded-full min-w-[60px]">
            <div class="absolute h-2.5 w-0.5 rounded-full -top-[3px] {bbColor === 'text-bull-strong' ? 'bg-bull-strong' : bbColor === 'text-danger' ? 'bg-danger' : 'bg-text-secondary'}" style="left: {Math.max(0, Math.min(100, bbPct))}%"></div>
          </div>
          <span class="text-[13px] font-mono {bbColor}">{bbPct.toFixed(0)}%</span>
        </div>
        <span class="text-[12px] {bbColor}">{bbPct < 15 ? 'Near lower band' : bbPct > 85 ? 'Near upper band' : 'Mid-band'}</span>
      </div>
    {:else}
      <div class="flex flex-col min-w-[100px] cursor-default" use:tipAction={TIPS.bb}>
        <span class="text-[13px] text-text-muted uppercase tracking-wider">BB Position</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <div class="flex-1 h-1 bg-surface-600 rounded-full min-w-[60px]"></div>
          <span class="text-[13px] font-mono text-text-muted">—</span>
        </div>
        <span class="text-[12px] text-text-muted">—</span>
      </div>
    {/if}

    <!-- 52-week range bar -->
    {#if pos52w() !== null}
      <div class="flex flex-col min-w-[120px]">
        <span class="text-[13px] text-text-muted uppercase tracking-wider">52W Range</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <span class="text-[13px] text-text-muted font-mono">${m['52WeekLow']?.toFixed(0)}</span>
          <div class="flex-1 relative h-1 bg-surface-600 rounded-full min-w-[60px]">
            <div class="absolute h-2.5 w-0.5 bg-text-primary rounded-full -top-[3px]" style="left: {pos52w()}%"></div>
          </div>
          <span class="text-[13px] text-text-muted font-mono">${m['52WeekHigh']?.toFixed(0)}</span>
        </div>
      </div>
    {:else}
      <div class="flex flex-col min-w-[120px]">
        <span class="text-[13px] text-text-muted uppercase tracking-wider">52W Range</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <span class="text-[13px] text-text-muted font-mono">—</span>
          <div class="flex-1 h-1 bg-surface-600 rounded-full min-w-[60px]"></div>
          <span class="text-[13px] text-text-muted font-mono">—</span>
        </div>
      </div>
    {/if}
  </div>
</div>

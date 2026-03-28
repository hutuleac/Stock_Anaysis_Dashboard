<script>
  import { getTickerData } from '../stores/watchlist.svelte.js';

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
      value: fmt(m['50DayMovingAverage'], '$'),
      note: price && m['50DayMovingAverage']
        ? (((price - m['50DayMovingAverage']) / m['50DayMovingAverage']) * 100).toFixed(1) + '%'
        : null,
      noteColor: price && m['50DayMovingAverage']
        ? price > m['50DayMovingAverage'] ? 'text-bull-strong' : 'text-bear-strong'
        : '',
    },
    {
      label: 'MA200',
      value: fmt(m['200DayMovingAverage'], '$'),
      note: price && m['200DayMovingAverage']
        ? (((price - m['200DayMovingAverage']) / m['200DayMovingAverage']) * 100).toFixed(1) + '%'
        : null,
      noteColor: price && m['200DayMovingAverage']
        ? price > m['200DayMovingAverage'] ? 'text-bull-strong' : 'text-bear-strong'
        : '',
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
      <div class="flex flex-col min-w-[80px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">{metric.label}</span>
        <div class="flex items-baseline gap-1.5 mt-0.5">
          <span class="text-sm font-mono font-semibold {metric.color ?? 'text-text-primary'}">{metric.value}</span>
          {#if metric.note}
            <span class="text-[10px] {metric.noteColor ?? 'text-text-muted'}">{metric.note}</span>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Insider net (90d) -->
    {#if insiderNet() !== null}
      <div class="flex flex-col min-w-[80px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">Insider 90d</span>
        <span class="text-sm font-mono font-semibold mt-0.5 {insiderNet() > 0 ? 'text-bull-strong' : insiderNet() < 0 ? 'text-bear-strong' : 'text-text-muted'}">
          {fmtInsider(insiderNet())} shares
        </span>
      </div>
    {/if}

    <!-- RSI(14) — from TwelveData if available -->
    {#if data?.indicators?.rsi != null}
      {@const rsi = data.indicators.rsi}
      {@const rsiDir = data.indicators.rsiDirection}
      {@const rsiColor = rsi < 30 ? 'text-bull-strong' : rsi < 40 ? 'text-uncertain' : rsi > 70 ? 'text-danger' : rsi > 60 ? 'text-warning' : 'text-text-primary'}
      <div class="flex flex-col min-w-[70px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">RSI 14</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {rsiColor}">{rsi.toFixed(1)}</span>
          <span class="text-[10px] text-text-muted">{rsiDir === 'rising' ? '↑' : rsiDir === 'falling' ? '↓' : '→'}</span>
        </div>
        <span class="text-[9px] {rsiColor}">{rsi < 30 ? 'Oversold' : rsi < 40 ? 'Mild OS' : rsi > 70 ? 'Overbought' : rsi > 60 ? 'Extended' : 'Neutral'}</span>
      </div>
    {/if}

    <!-- MACD — from TwelveData if available -->
    {#if data?.indicators?.macd != null}
      {@const macd = data.indicators.macd}
      {@const cross = data.indicators.macdCrossover}
      {@const histColor = macd.histogram > 0 ? 'text-bull-strong' : 'text-bear-strong'}
      <div class="flex flex-col min-w-[80px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">MACD</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {histColor}">{macd.histogram > 0 ? '+' : ''}{macd.histogram.toFixed(2)}</span>
        </div>
        <span class="text-[9px] {cross === 'bullish_cross' ? 'text-bull-strong font-semibold' : cross === 'bearish_cross' ? 'text-danger font-semibold' : 'text-text-muted'}">
          {cross === 'bullish_cross' ? '⚡ Bull cross' : cross === 'bearish_cross' ? '⚡ Bear cross' : macd.histogram > 0 ? 'Bullish' : 'Bearish'}
        </span>
      </div>
    {/if}

    <!-- Weekly trend (multi-timeframe) -->
    {#if weekly}
      {@const trendColor = weekly.trend === 'up' ? 'text-bull-strong' : weekly.trend === 'down' ? 'text-bear-strong' : 'text-text-muted'}
      {@const trendIcon = weekly.trend === 'up' ? '↑' : weekly.trend === 'down' ? '↓' : '→'}
      <div class="flex flex-col min-w-[80px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">W.Trend</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {trendColor}">{trendIcon} {weekly.trend.toUpperCase()}</span>
        </div>
        {#if weekly.rsi !== null}
          <span class="text-[9px] text-text-muted">W.RSI {weekly.rsi}</span>
        {/if}
      </div>
    {/if}

    <!-- Volume ratio — from TwelveData live quote -->
    {#if tdQuote?.volume && tdQuote?.avgVolume}
      {@const ratio = tdQuote.volumeRatio}
      {@const volColor = ratio >= 2 ? 'text-bull-strong' : ratio >= 1.5 ? 'text-uncertain' : ratio <= 0.4 ? 'text-text-muted' : 'text-text-primary'}
      <div class="flex flex-col min-w-[90px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">Volume</span>
        <div class="flex items-baseline gap-1 mt-0.5">
          <span class="text-sm font-mono font-semibold {volColor}">{fmtVol(tdQuote.volume)}</span>
        </div>
        <span class="text-[9px] {volColor}">
          {ratio !== null ? ratio.toFixed(2) + '× avg' : ''}
          {ratio >= 2 ? ' 🔥' : ratio <= 0.4 ? ' low' : ''}
        </span>
      </div>
    {/if}

    <!-- BB position — from TwelveData if available -->
    {#if data?.indicators?.bb != null && price}
      {@const bb = data.indicators.bb}
      {@const bbPct = ((price - bb.lower) / (bb.upper - bb.lower) * 100)}
      {@const bbColor = bbPct < 15 ? 'text-bull-strong' : bbPct > 85 ? 'text-danger' : 'text-text-primary'}
      <div class="flex flex-col min-w-[100px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">BB Position</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <div class="flex-1 relative h-1 bg-surface-600 rounded-full min-w-[60px]">
            <div class="absolute h-2.5 w-0.5 rounded-full -top-[3px] {bbColor === 'text-bull-strong' ? 'bg-bull-strong' : bbColor === 'text-danger' ? 'bg-danger' : 'bg-text-secondary'}" style="left: {Math.max(0, Math.min(100, bbPct))}%"></div>
          </div>
          <span class="text-[10px] font-mono {bbColor}">{bbPct.toFixed(0)}%</span>
        </div>
        <span class="text-[9px] {bbColor}">{bbPct < 15 ? 'Near lower band' : bbPct > 85 ? 'Near upper band' : 'Mid-band'}</span>
      </div>
    {/if}

    <!-- 52-week range bar -->
    {#if pos52w() !== null}
      <div class="flex flex-col min-w-[120px]">
        <span class="text-[10px] text-text-muted uppercase tracking-wider">52W Range</span>
        <div class="flex items-center gap-1.5 mt-1.5">
          <span class="text-[10px] text-text-muted font-mono">${m['52WeekLow']?.toFixed(0)}</span>
          <div class="flex-1 relative h-1 bg-surface-600 rounded-full min-w-[60px]">
            <div class="absolute h-2.5 w-0.5 bg-text-primary rounded-full -top-[3px]" style="left: {pos52w()}%"></div>
          </div>
          <span class="text-[10px] text-text-muted font-mono">${m['52WeekHigh']?.toFixed(0)}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

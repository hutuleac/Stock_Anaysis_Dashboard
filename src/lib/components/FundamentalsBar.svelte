<script>
  import { getTickerData } from '../stores/watchlist.svelte.js';

  let { symbol } = $props();

  const data = $derived(getTickerData(symbol));
  const m = $derived(data?.metrics?.data?.metric ?? {});
  const pt = $derived(data?.priceTarget?.data ?? null);
  const price = $derived(data?.quote?.data?.c ?? null);

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

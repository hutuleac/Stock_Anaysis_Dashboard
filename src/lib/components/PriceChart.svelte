<script>
  import { onMount, onDestroy } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, ColorType } from 'lightweight-charts';
  import { fetchCandles } from '../api/finnhub.svelte.js';
  import { getChecklist } from '../stores/checklist.svelte.js';

  let { symbol } = $props();

  let container = $state(null);
  let chart = null;
  let series = null;
  let ma50Series = null;
  let ma200Series = null;
  let stopLine = null;
  let loading = $state(true);
  let error = $state('');
  let showMA = $state(true);
  let timeframe = $state('3M');

  const stopLossPrice = $derived(() => {
    const val = parseFloat(getChecklist(symbol).stopLoss);
    return isNaN(val) || val <= 0 ? null : val;
  });

  const TIMEFRAMES = {
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
  };

  const CHART_COLORS = {
    background: '#0f1117',
    grid:       '#1e2130',
    text:       '#8b95a5',
    border:     '#252a3a',
    up:         '#22c55e',
    down:       '#ef4444',
    upWick:     '#22c55e',
    downWick:   '#ef4444',
  };

  function computeMA(candles, period) {
    return candles.reduce((acc, c, i) => {
      if (i < period - 1) return acc;
      const slice = candles.slice(i - period + 1, i + 1);
      acc.push({ time: c.time, value: slice.reduce((s, x) => s + x.close, 0) / period });
      return acc;
    }, []);
  }

  async function loadCandles() {
    if (!chart) return;
    loading = true;
    error = '';
    const days = TIMEFRAMES[timeframe];
    const toTs   = Math.floor(Date.now() / 1000);
    const fromTs = Math.floor((Date.now() - days * 86400000) / 1000);

    try {
      const result = await fetchCandles(symbol, 'D', fromTs, toTs);
      const raw = result.data;

      if (!raw || raw.s === 'no_data' || !raw.t?.length) {
        error = 'No chart data available';
        loading = false;
        return;
      }

      // Convert Finnhub candle arrays to lightweight-charts format
      const candles = raw.t.map((ts, i) => ({
        time: ts,
        open:  raw.o[i],
        high:  raw.h[i],
        low:   raw.l[i],
        close: raw.c[i],
      })).sort((a, b) => a.time - b.time);

      series.setData(candles);

      if (showMA) {
        const ma50 = computeMA(candles, 50);
        const ma200 = computeMA(candles, 200);
        if (ma50.length) ma50Series?.setData(ma50);
        if (ma200.length) ma200Series?.setData(ma200);
      } else {
        ma50Series?.setData([]);
        ma200Series?.setData([]);
      }

      chart.timeScale().fitContent();
    } catch (err) {
      error = 'Failed to load chart data';
    }
    loading = false;
  }

  onMount(() => {
    chart = createChart(container, {
      layout: {
        background: { color: CHART_COLORS.background },
        textColor: CHART_COLORS.text,
        fontFamily: 'ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: {
        vertLine: { color: '#3b4a6b', width: 1, style: 3 },
        horzLine: { color: '#3b4a6b', width: 1, style: 3 },
      },
      rightPriceScale: {
        borderColor: CHART_COLORS.border,
      },
      timeScale: {
        borderColor: CHART_COLORS.border,
        timeVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    });

    ma50Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    ma200Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    series = chart.addSeries(CandlestickSeries, {
      upColor:          CHART_COLORS.up,
      downColor:        CHART_COLORS.down,
      borderUpColor:    CHART_COLORS.up,
      borderDownColor:  CHART_COLORS.down,
      wickUpColor:      CHART_COLORS.upWick,
      wickDownColor:    CHART_COLORS.downWick,
    });

    const ro = new ResizeObserver(() => {
      if (container && chart) {
        chart.applyOptions({ width: container.clientWidth });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
    };
  });

  onDestroy(() => {
    chart?.remove();
    chart = null;
  });

  $effect(() => {
    // Re-fetch when timeframe, symbol, or MA toggle changes
    timeframe;
    symbol;
    showMA;
    if (chart) loadCandles();
  });

  $effect(() => {
    // Update stop loss line on chart
    if (!series) return;
    const sl = stopLossPrice();
    if (stopLine) { series.removePriceLine(stopLine); stopLine = null; }
    if (sl) {
      stopLine = series.createPriceLine({
        price: sl,
        color: '#ef4444',
        lineWidth: 1,
        lineStyle: 2, // dashed
        axisLabelVisible: true,
        title: `SL $${sl.toFixed(2)}`,
      });
    }
  });
</script>

<div class="bg-surface-900 rounded-lg border border-border overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2.5 border-b border-border">
    <span class="text-sm font-semibold text-text-primary font-mono">{symbol}</span>
    <div class="flex items-center gap-2">
      <!-- MA toggle -->
      <div class="flex items-center gap-1 border-r border-border pr-2">
        <button
          class="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors {showMA ? 'opacity-100' : 'opacity-40'}"
          onclick={() => showMA = !showMA}
          title="Toggle moving averages"
        >
          <span class="inline-block w-2 h-0.5 bg-amber-400 rounded"></span>
          <span class="text-text-muted">MA50</span>
        </button>
        <button
          class="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors {showMA ? 'opacity-100' : 'opacity-40'}"
          onclick={() => showMA = !showMA}
          title="Toggle moving averages"
        >
          <span class="inline-block w-2 h-0.5 bg-blue-400 rounded"></span>
          <span class="text-text-muted">MA200</span>
        </button>
      </div>
      <!-- Timeframe buttons -->
      <div class="flex gap-1">
        {#each Object.keys(TIMEFRAMES) as tf}
          <button
            class="px-2 py-0.5 text-xs rounded transition-colors {timeframe === tf
              ? 'bg-bull-strong/20 text-bull-strong font-semibold'
              : 'text-text-muted hover:text-text-secondary'}"
            onclick={() => timeframe = tf}
          >
            {tf}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Chart container -->
  <div class="relative" style="height: 240px;">
    <div bind:this={container} class="w-full h-full"></div>

    {#if loading}
      <div class="absolute inset-0 flex items-center justify-center bg-surface-900/80">
        <div class="w-5 h-5 border-2 border-bull-strong border-t-transparent rounded-full animate-spin"></div>
      </div>
    {/if}

    {#if error && !loading}
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-sm text-text-muted">{error}</span>
      </div>
    {/if}
  </div>
</div>

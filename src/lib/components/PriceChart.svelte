<script>
  import { onMount, onDestroy } from 'svelte';
  import { createChart, CandlestickSeries, LineSeries, ColorType } from 'lightweight-charts';
  import { fetchCandles, fetchHistoricalEarnings } from '../api/finnhub.svelte.js';
  import { hasTDApiKey, fetchTimeSeries } from '../api/twelvedata.svelte.js';
  import { getChecklist } from '../stores/checklist.svelte.js';

  let { symbol, priceTarget = null } = $props();

  let container      = $state(null);
  let chart          = null;
  let series         = null;
  let ma50Series     = null;
  let ma200Series    = null;
  let stopLine       = null;
  let loading        = $state(true);
  let error          = $state('');
  let showMA         = $state(true);
  let timeframe      = $state('3M');
  let chartReady     = $state(false);

  // Volume profile
  let allCandles        = [];          // full candles with volume (not reactive — large)
  let showVolumeProfile = $state(false);
  let vpBars            = $state([]);  // {y, height, width, isHVN}

  // Annotations (PT lines + earnings markers)
  let showAnnotations = $state(true);
  let ptLineRefs      = { low: null, mean: null, high: null };

  // Drawing tools
  let drawingMode   = $state(null);   // 'hline' | 'trendline' | 'rect' | null
  let pendingPoints = $state([]);     // accumulates multi-click points
  let drawings      = $state([]);     // persisted drawings for current symbol
  let hLineRefs     = {};             // id → priceLine reference
  let trendLineRefs = {};             // id → LineSeries reference
  let rectCoords    = $state([]);     // computed pixel rects for SVG overlay

  const stopLossPrice = $derived(() => {
    const val = parseFloat(getChecklist(symbol).stopLoss);
    return isNaN(val) || val <= 0 ? null : val;
  });

  const TIMEFRAMES = {
    '1D': { days: 1,   resolution: '60', intraday: true,  tdInterval: '1h',   tdOutput: 200 },
    '5D': { days: 5,   resolution: '60', intraday: true,  tdInterval: '1h',   tdOutput: 200 },
    '1M': { days: 30,  resolution: 'D',  intraday: false, tdInterval: '1day', tdOutput: 365 },
    '3M': { days: 90,  resolution: 'D',  intraday: false, tdInterval: '1day', tdOutput: 365 },
    '6M': { days: 180, resolution: 'D',  intraday: false, tdInterval: '1day', tdOutput: 365 },
    '1Y': { days: 365, resolution: 'D',  intraday: false, tdInterval: '1day', tdOutput: 365 },
  };

  const isIntraday = $derived(TIMEFRAMES[timeframe]?.intraday ?? false);

  const CHART_COLORS = {
    background: '#0f1117', grid: '#1e2130', text: '#8b95a5',
    border: '#252a3a', up: '#22c55e', down: '#ef4444',
    upWick: '#22c55e', downWick: '#ef4444',
  };

  const DRAW_COLOR = '#f59e0b';

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function computeMA(candles, period) {
    return candles.reduce((acc, c, i) => {
      if (i < period - 1) return acc;
      const slice = candles.slice(i - period + 1, i + 1);
      acc.push({ time: c.time, value: slice.reduce((s, x) => s + x.close, 0) / period });
      return acc;
    }, []);
  }

  function normalizeTime(t) {
    if (typeof t === 'string') return t;
    if (typeof t === 'number') return new Date(t * 1000).toISOString().split('T')[0];
    if (t?.year) return `${t.year}-${String(t.month).padStart(2,'0')}-${String(t.day).padStart(2,'0')}`;
    return String(t);
  }

  // ─── Volume Profile ─────────────────────────────────────────────────────────

  function computeVolumeProfile(candles, numBuckets = 24) {
    if (!candles?.length) return [];
    const low  = Math.min(...candles.map(c => c.low));
    const high = Math.max(...candles.map(c => c.high));
    if (high <= low) return [];
    const size = (high - low) / numBuckets;
    const buckets = Array.from({ length: numBuckets }, (_, i) => ({
      priceMid: low + (i + 0.5) * size,
      priceMax: low + (i + 1) * size,
      priceMin: low + i * size,
      volume: 0,
    }));
    for (const c of candles) {
      const typical = (c.high + c.low + c.close) / 3;
      const idx = Math.min(Math.floor((typical - low) / size), numBuckets - 1);
      if (idx >= 0) buckets[idx].volume += c.volume ?? 0;
    }
    return buckets;
  }

  function updateVolumeProfile() {
    if (!series || !allCandles.length) { vpBars = []; return; }
    const profile = computeVolumeProfile(allCandles);
    const maxVol  = Math.max(...profile.map(b => b.volume), 1);
    const MAX_W   = 60;
    vpBars = profile.map(b => {
      const yT = series.priceToCoordinate(b.priceMax);
      const yB = series.priceToCoordinate(b.priceMin);
      if (yT == null || yB == null) return null;
      return {
        y:      Math.min(yT, yB),
        height: Math.max(1, Math.abs(yB - yT)),
        width:  Math.round((b.volume / maxVol) * MAX_W),
        isHVN:  b.volume > maxVol * 0.65,
      };
    }).filter(Boolean);
  }

  // ─── Analyst Price Target Lines ─────────────────────────────────────────────

  function clearPTLines() {
    for (const k of ['low', 'mean', 'high']) {
      if (ptLineRefs[k]) { series?.removePriceLine(ptLineRefs[k]); ptLineRefs[k] = null; }
    }
  }

  function setAnalystTargetLines(pt) {
    if (!series || !pt) return;
    clearPTLines();
    if (pt.targetLow  != null) ptLineRefs.low  = series.createPriceLine({ price: pt.targetLow,  color: '#ef444470', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `PT↓ $${pt.targetLow.toFixed(0)}`  });
    if (pt.targetMean != null) ptLineRefs.mean = series.createPriceLine({ price: pt.targetMean, color: '#f59e0b',   lineWidth: 1, lineStyle: 2, axisLabelVisible: true,  title: `PT $${pt.targetMean.toFixed(0)}`  });
    if (pt.targetHigh != null) ptLineRefs.high = series.createPriceLine({ price: pt.targetHigh, color: '#22c55e70', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: `PT↑ $${pt.targetHigh.toFixed(0)}` });
  }

  // ─── Earnings Markers ───────────────────────────────────────────────────────

  async function setEarningsMarkers(candles) {
    if (!series || !candles?.length || isIntraday) return;
    try {
      const hist = await fetchHistoricalEarnings(symbol, 8);
      if (!hist?.data?.length) return;

      const candleTimes = candles.map(c => ({
        iso:  typeof c.time === 'string' ? c.time : new Date(c.time * 1000).toISOString().split('T')[0],
        time: c.time,
      }));

      const markers = hist.data
        .filter(e => e.period)
        .map(e => {
          const target = new Date(e.period).getTime();
          let best = candleTimes[0], bestDiff = Infinity;
          for (const ct of candleTimes) {
            const diff = Math.abs(new Date(ct.iso).getTime() - target);
            if (diff < bestDiff) { bestDiff = diff; best = ct; }
          }
          if (bestDiff > 10 * 86400000) return null; // >10 days — skip
          const sp    = e.surprisePercent;
          const color = sp == null ? '#8b95a5' : sp > 3 ? '#22c55e' : sp < -3 ? '#ef4444' : '#f59e0b';
          const text  = sp != null ? (sp > 0 ? `+${sp.toFixed(1)}%` : `${sp.toFixed(1)}%`) : 'E';
          return { time: best.time, position: 'belowBar', color, shape: 'arrowUp', text, size: 1 };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const ta = typeof a.time === 'string' ? a.time : String(a.time);
          const tb = typeof b.time === 'string' ? b.time : String(b.time);
          return ta < tb ? -1 : ta > tb ? 1 : 0;
        });

      if (markers.length) series.setMarkers(markers);
    } catch { /* non-blocking */ }
  }

  // ─── Drawing Tools ──────────────────────────────────────────────────────────

  const DRAWINGS_KEY = (sym) => `chart_drawings_${sym}`;

  function saveDrawings() {
    try {
      localStorage.setItem(DRAWINGS_KEY(symbol), JSON.stringify(drawings));
    } catch { /* quota */ }
  }

  function updateRectCoords() {
    if (!chart || !series) { rectCoords = []; return; }
    rectCoords = drawings.filter(d => d.type === 'rect').map(d => {
      const x1 = chart.timeScale().timeToCoordinate(d.p1.time);
      const x2 = chart.timeScale().timeToCoordinate(d.p2.time);
      const y1 = series.priceToCoordinate(d.p1.price);
      const y2 = series.priceToCoordinate(d.p2.price);
      if (x1 == null || x2 == null || y1 == null || y2 == null) return null;
      return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), id: d.id };
    }).filter(Boolean);
  }

  function clearAllDrawings(doSave = true) {
    for (const id in hLineRefs) { series?.removePriceLine(hLineRefs[id]); }
    for (const id in trendLineRefs) { try { chart?.removeSeries(trendLineRefs[id]); } catch { /* */ } }
    hLineRefs = {};
    trendLineRefs = {};
    rectCoords = [];
    drawings = [];
    if (doSave) saveDrawings();
  }

  function restoreDrawings() {
    clearAllDrawings(false);
    try {
      const raw = localStorage.getItem(DRAWINGS_KEY(symbol));
      if (!raw) { drawings = []; return; }
      const saved = JSON.parse(raw);
      drawings = saved;
      for (const d of saved) {
        if (d.type === 'hline' && series) {
          hLineRefs[d.id] = series.createPriceLine({ price: d.price, color: DRAW_COLOR, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: `📏 ${d.price.toFixed(2)}` });
        } else if (d.type === 'trendline' && chart) {
          const tl = chart.addSeries(LineSeries, { color: DRAW_COLOR, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          const pts = [d.p1, d.p2].sort((a, b) => a.time > b.time ? 1 : -1);
          tl.setData([{ time: pts[0].time, value: pts[0].price }, { time: pts[1].time, value: pts[1].price }]);
          trendLineRefs[d.id] = tl;
        }
      }
      updateRectCoords();
    } catch { drawings = []; }
  }

  function handleDrawingClick(e) {
    if (!drawingMode || !chart || !series || !container) return;
    const rect  = container.getBoundingClientRect();
    const x     = e.clientX - rect.left;
    const y     = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    const raw   = chart.timeScale().coordinateToTime(x);
    if (price == null) return;
    const time = raw != null ? normalizeTime(raw) : null;
    const id   = Date.now();

    if (drawingMode === 'hline') {
      if (series) hLineRefs[id] = series.createPriceLine({ price, color: DRAW_COLOR, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: `📏 ${price.toFixed(2)}` });
      drawings = [...drawings, { type: 'hline', price, id }];
      saveDrawings();
      drawingMode = null;
      pendingPoints = [];
    } else if ((drawingMode === 'trendline' || drawingMode === 'rect') && time != null) {
      pendingPoints = [...pendingPoints, { time, price }];
      if (pendingPoints.length === 2) {
        const [p1, p2] = pendingPoints;
        if (drawingMode === 'trendline') {
          const tl  = chart.addSeries(LineSeries, { color: DRAW_COLOR, lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
          const pts = [p1, p2].sort((a, b) => a.time > b.time ? 1 : -1);
          tl.setData([{ time: pts[0].time, value: pts[0].price }, { time: pts[1].time, value: pts[1].price }]);
          trendLineRefs[id] = tl;
          drawings = [...drawings, { type: 'trendline', p1, p2, id }];
        } else {
          drawings = [...drawings, { type: 'rect', p1, p2, id }];
          updateRectCoords();
        }
        saveDrawings();
        drawingMode = null;
        pendingPoints = [];
      }
    }
  }

  // ─── Main candle loader ─────────────────────────────────────────────────────

  async function loadCandles() {
    if (!chart) return;
    loading = true;
    error   = '';
    const tf     = TIMEFRAMES[timeframe];
    const toTs   = Math.floor(Date.now() / 1000);
    const fromTs = Math.floor((Date.now() - tf.days * 86400000) / 1000);

    chart.applyOptions({ timeScale: { borderColor: CHART_COLORS.border, timeVisible: tf.intraday, secondsVisible: false } });

    try {
      let candles;

      if (hasTDApiKey()) {
        const result = await fetchTimeSeries(symbol, tf.tdInterval, tf.tdOutput);
        const values = result.data;
        if (!values?.length) { error = 'No chart data available'; loading = false; return; }
        candles = values.map(v => ({
          time:   tf.intraday ? Math.floor(new Date(v.datetime.replace(' ', 'T') + 'Z').getTime() / 1000) : v.datetime,
          open:   parseFloat(v.open),
          high:   parseFloat(v.high),
          low:    parseFloat(v.low),
          close:  parseFloat(v.close),
          volume: parseInt(v.volume || 0, 10),
        }));
      } else {
        const result = await fetchCandles(symbol, tf.resolution, fromTs, toTs);
        const raw    = result.data;
        if (!raw || raw.s === 'no_data' || !raw.t?.length) { error = 'No chart data available'; loading = false; return; }
        candles = raw.t.map((ts, i) => ({
          time:   ts,
          open:   raw.o[i],
          high:   raw.h[i],
          low:    raw.l[i],
          close:  raw.c[i],
          volume: raw.v?.[i] ?? 0,
        })).sort((a, b) => a.time - b.time);
      }

      allCandles = candles;
      // Strip volume from chart data (lightweight-charts CandlestickSeries ignores it, but be explicit)
      series.setData(candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));

      if (showMA && !tf.intraday) {
        const ma50  = computeMA(candles, 50);
        const ma200 = computeMA(candles, 200);
        if (ma50.length)  ma50Series?.setData(ma50);
        if (ma200.length) ma200Series?.setData(ma200);
      } else {
        ma50Series?.setData([]);
        ma200Series?.setData([]);
      }

      chart.timeScale().fitContent();
      try {
        if (tf.intraday) {
          chart.timeScale().setVisibleRange({ from: fromTs, to: toTs });
        } else {
          const fromStr = new Date(Date.now() - tf.days * 86400000).toISOString().split('T')[0];
          chart.timeScale().setVisibleRange({ from: fromStr, to: new Date().toISOString().split('T')[0] });
        }
      } catch { /* noop */ }

      // Post-load extras (non-blocking)
      if (showAnnotations) {
        setEarningsMarkers(candles);
      }
      if (showVolumeProfile) updateVolumeProfile();
      restoreDrawings();

    } catch (err) {
      error = 'Failed to load chart data';
      console.error('[Chart] loadCandles error:', err);
    }
    loading = false;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  onMount(() => {
    setTimeout(() => {
      chart = createChart(container, {
        autoSize: true,
        layout: { background: { color: CHART_COLORS.background }, textColor: CHART_COLORS.text, fontFamily: 'ui-monospace, monospace', fontSize: 11 },
        grid: { vertLines: { color: CHART_COLORS.grid }, horzLines: { color: CHART_COLORS.grid } },
        crosshair: { vertLine: { color: '#3b4a6b', width: 1, style: 3 }, horzLine: { color: '#3b4a6b', width: 1, style: 3 } },
        rightPriceScale: { borderColor: CHART_COLORS.border },
        timeScale: { borderColor: CHART_COLORS.border, timeVisible: false },
        handleScroll: true,
        handleScale: true,
      });

      ma50Series  = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      ma200Series = chart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      series      = chart.addSeries(CandlestickSeries, { upColor: CHART_COLORS.up, downColor: CHART_COLORS.down, borderUpColor: CHART_COLORS.up, borderDownColor: CHART_COLORS.down, wickUpColor: CHART_COLORS.upWick, wickDownColor: CHART_COLORS.downWick });

      // Recompute VP and rect coords on pan/zoom
      chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
        if (showVolumeProfile) updateVolumeProfile();
        updateRectCoords();
      });

      chartReady = true;
    }, 0);
  });

  onDestroy(() => {
    chart?.remove();
    chart = null;
  });

  // Reload on param changes
  $effect(() => {
    timeframe; symbol; showMA; showAnnotations;
    if (chartReady) loadCandles();
  });

  // Stop loss price line
  $effect(() => {
    if (!series) return;
    const sl = stopLossPrice();
    if (stopLine) { series.removePriceLine(stopLine); stopLine = null; }
    if (sl) stopLine = series.createPriceLine({ price: sl, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `SL $${sl.toFixed(2)}` });
  });

  // Analyst price target lines (reactive to prop + annotations toggle)
  $effect(() => {
    priceTarget; showAnnotations; chartReady;
    if (!chartReady || !series) return;
    if (showAnnotations && priceTarget) setAnalystTargetLines(priceTarget);
    else clearPTLines();
  });

  // Volume profile (reactive to toggle)
  $effect(() => {
    showVolumeProfile; chartReady;
    if (chartReady) {
      if (showVolumeProfile) updateVolumeProfile();
      else vpBars = [];
    }
  });
</script>

<div class="bg-surface-900 rounded-lg border border-border overflow-hidden">
  <!-- Header -->
  <div class="flex items-center justify-between px-3 py-2 border-b border-border flex-wrap gap-y-1.5">
    <span class="text-sm font-semibold text-text-primary font-mono">{symbol}</span>
    <div class="flex items-center gap-1.5 flex-wrap">

      <!-- Drawing toolbar (daily only) -->
      {#if !isIntraday}
        <div class="flex items-center gap-0.5 border-r border-border pr-2">
          {#each [['hline', '─', 'Horizontal line'], ['trendline', '╱', 'Trend line'], ['rect', '▭', 'Rectangle']] as [mode, icon, label]}
            <button
              class="px-2 py-0.5 text-xs rounded font-mono transition-colors {drawingMode === mode ? 'bg-warning/20 text-warning' : 'text-text-muted hover:text-text-secondary'}"
              title="{label}"
              onclick={() => { drawingMode = drawingMode === mode ? null : mode; pendingPoints = []; }}
            >{icon}</button>
          {/each}
          {#if drawings.length}
            <button class="px-1.5 py-0.5 text-[10px] rounded text-text-muted hover:text-danger transition-colors" title="Clear all drawings" onclick={() => clearAllDrawings()}>✕</button>
          {/if}
        </div>
      {/if}

      <!-- Overlay toggles -->
      <div class="flex items-center gap-0.5 border-r border-border pr-2">
        <button
          class="px-1.5 py-0.5 text-xs rounded transition-colors {showAnnotations ? 'text-uncertain' : 'text-text-muted opacity-40'}"
          title="Analyst targets + earnings markers"
          onclick={() => showAnnotations = !showAnnotations}
        >📌</button>
        <button
          class="px-1.5 py-0.5 text-xs rounded transition-colors {showVolumeProfile ? 'text-uncertain' : 'text-text-muted opacity-40'}"
          title="Volume profile"
          onclick={() => showVolumeProfile = !showVolumeProfile}
        >▣</button>
      </div>

      <!-- MA toggle (daily only) -->
      {#if !isIntraday}
        <div class="flex items-center gap-1 border-r border-border pr-2">
          <button class="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors {showMA ? 'opacity-100' : 'opacity-40'}" onclick={() => showMA = !showMA} title="Toggle moving averages">
            <span class="inline-block w-2 h-0.5 bg-amber-400 rounded"></span>
            <span class="text-text-muted">50</span>
          </button>
          <button class="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded transition-colors {showMA ? 'opacity-100' : 'opacity-40'}" onclick={() => showMA = !showMA} title="Toggle moving averages">
            <span class="inline-block w-2 h-0.5 bg-blue-400 rounded"></span>
            <span class="text-text-muted">200</span>
          </button>
        </div>
      {/if}

      <!-- Timeframe buttons -->
      <div class="flex gap-0.5">
        {#each Object.keys(TIMEFRAMES) as tf}
          <button
            class="px-2 py-0.5 text-xs rounded transition-colors {timeframe === tf ? 'bg-bull-strong/20 text-bull-strong font-semibold' : 'text-text-muted hover:text-text-secondary'}"
            onclick={() => timeframe = tf}
          >{tf}</button>
        {/each}
      </div>
    </div>
  </div>

  <!-- Drawing mode hint bar -->
  {#if drawingMode}
    <div class="px-4 py-1 bg-warning/10 border-b border-warning/20 flex items-center justify-between">
      <span class="text-xs text-warning">
        {#if drawingMode === 'hline'}─ Click on chart to place horizontal line
        {:else if drawingMode === 'trendline'}╱ Click two points to draw trend line ({pendingPoints.length}/2 placed)
        {:else}▭ Click two corners to draw rectangle ({pendingPoints.length}/2 placed)
        {/if}
      </span>
      <button class="text-xs text-warning/60 hover:text-warning underline" onclick={() => { drawingMode = null; pendingPoints = []; }}>cancel</button>
    </div>
  {/if}

  <!-- Chart area -->
  <div class="relative" style="height: 380px;">
    <div bind:this={container} style="width:100%;height:380px;"></div>

    <!-- Volume profile SVG (right-anchored horizontal bars) -->
    {#if showVolumeProfile && vpBars.length}
      <svg class="absolute inset-0 w-full pointer-events-none" style="height:380px;" aria-hidden="true">
        {#each vpBars as bar}
          <rect
            x="{(container?.clientWidth ?? 600) - bar.width - 4}"
            y={bar.y} width={bar.width} height={bar.height}
            fill={bar.isHVN ? '#f59e0b55' : '#ffffff18'} rx="1"
          />
        {/each}
      </svg>
    {/if}

    <!-- Rectangle drawings SVG -->
    {#if rectCoords.length}
      <svg class="absolute inset-0 w-full pointer-events-none" style="height:380px;" aria-hidden="true">
        {#each rectCoords as r}
          <rect x={r.x} y={r.y} width={Math.max(r.w, 2)} height={Math.max(r.h, 2)}
            fill="#f59e0b0d" stroke="#f59e0b" stroke-width="1" stroke-dasharray="5,3" rx="1"/>
        {/each}
      </svg>
    {/if}

    <!-- Drawing click capture (only active in draw mode) -->
    {#if drawingMode}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute inset-0 z-10 cursor-crosshair"
        onclick={handleDrawingClick}
        onkeydown={() => {}}
      ></div>
    {/if}

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

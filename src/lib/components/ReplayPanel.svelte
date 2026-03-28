<script>
  import { fetchCandles } from '../api/finnhub.svelte.js';
  import { computeSnapshotAt } from '../indicators.js';

  let { symbol } = $props();

  let open      = $state(false);
  let raw       = $state(null);
  let loading   = $state(false);
  let sliderIdx = $state(0);

  async function load() {
    if (raw) return; // already loaded (cached)
    loading = true;
    const toTs   = Math.floor(Date.now() / 1000);
    const fromTs = toTs - 90 * 86400;
    const res    = await fetchCandles(symbol, 'D', fromTs, toTs);
    raw = res?.data?.s === 'ok' ? res.data : null;
    sliderIdx = raw ? raw.c.length - 1 : 0;
    loading = false;
  }

  function toggle() {
    open = !open;
    if (open) load();
  }

  const snapshot = $derived(
    raw && open ? computeSnapshotAt(raw, sliderIdx) : null
  );

  const totalCandles = $derived(raw?.c?.length ?? 0);

  function fmtDate(d) {
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtPrice(v) {
    return v != null ? '$' + v.toFixed(2) : '—';
  }

  function fmtVol(v) {
    if (!v) return '—';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return String(v);
  }

  const readingStyle = $derived(() => {
    switch (snapshot?.reading) {
      case 'BULLISH':      return { color: 'text-bull-strong',  bg: 'bg-bull-strong/10',  border: 'border-bull-strong/30' };
      case 'LEANING LONG': return { color: 'text-uncertain',    bg: 'bg-uncertain/10',    border: 'border-uncertain/30' };
      case 'BEARISH':      return { color: 'text-bear-strong',  bg: 'bg-bear-strong/10',  border: 'border-bear-strong/30' };
      case 'LEANING SHORT':return { color: 'text-bear-weak',    bg: 'bg-bear-weak/10',    border: 'border-bear-weak/30' };
      default:             return { color: 'text-text-muted',   bg: 'bg-surface-700/50',  border: 'border-border/40' };
    }
  });

  // Mini sparkline for context — show price path up to selected index
  const sparkPts = $derived(() => {
    if (!raw || totalCandles < 2) return null;
    const W = 200, H = 32;
    const end   = sliderIdx;
    const start = Math.max(0, end - 29); // show last 30 candles as context
    const slice = raw.c.slice(start, end + 1);
    if (slice.length < 2) return null;
    const mn = Math.min(...slice), mx = Math.max(...slice);
    const range = Math.max(mx - mn, 0.01);
    const pts = slice.map((v, i) =>
      `${(i / (slice.length - 1)) * W},${H - ((v - mn) / range) * (H - 4) - 2}`
    ).join(' ');
    return { pts, W, H, currentPrice: slice[slice.length - 1] };
  });
</script>

<div class="border-t border-border/30 pt-3 mt-3">
  <button
    class="flex items-center gap-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
    onclick={toggle}
  >
    <span class="text-base">{open ? '▾' : '▸'}</span>
    <span class="font-semibold uppercase tracking-wider">Replay / Backtest</span>
    <span class="text-[10px] text-text-muted normal-case font-normal">— scrub through historical dates</span>
  </button>

  {#if open}
    <div class="mt-3 space-y-3 animate-[fadeIn_0.2s_ease-out]">
      {#if loading}
        <p class="text-xs text-text-muted">Loading candle data…</p>
      {:else if !raw}
        <p class="text-xs text-text-muted">No candle data available. Hit Refresh first.</p>
      {:else}
        <!-- Date slider -->
        <div class="flex items-center gap-3">
          <span class="text-[10px] text-text-muted w-20 shrink-0 font-mono">
            {fmtDate(raw.t ? new Date(raw.t[0] * 1000) : null)}
          </span>
          <input
            type="range"
            min="0"
            max={totalCandles - 1}
            bind:value={sliderIdx}
            class="flex-1 accent-bull-strong"
          />
          <span class="text-[10px] text-text-muted w-20 shrink-0 font-mono text-right">
            {fmtDate(raw.t ? new Date(raw.t[totalCandles - 1] * 1000) : null)}
          </span>
        </div>

        {#if snapshot}
          {@const rs = readingStyle()}
          {@const sp = sparkPts()}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <!-- Left: OHLCV + reading -->
            <div class="bg-surface-700/50 rounded-lg p-3 border border-border/40 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-text-secondary">{fmtDate(snapshot.date)}</span>
                <span class="text-xs font-mono font-bold px-2 py-0.5 rounded border {rs.color} {rs.bg} {rs.border}">
                  {snapshot.reading}
                </span>
              </div>
              <div class="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <p class="text-text-muted">Close</p>
                  <p class="font-mono font-semibold text-text-primary">{fmtPrice(snapshot.price)}</p>
                </div>
                <div>
                  <p class="text-text-muted">Change</p>
                  <p class="font-mono font-semibold {snapshot.dp >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">
                    {snapshot.dp != null ? (snapshot.dp > 0 ? '+' : '') + snapshot.dp.toFixed(2) + '%' : '—'}
                  </p>
                </div>
                <div>
                  <p class="text-text-muted">Volume</p>
                  <p class="font-mono text-text-secondary">{fmtVol(snapshot.volume)}</p>
                </div>
                <div>
                  <p class="text-text-muted">High</p>
                  <p class="font-mono text-text-secondary">{fmtPrice(snapshot.high)}</p>
                </div>
                <div>
                  <p class="text-text-muted">Low</p>
                  <p class="font-mono text-text-secondary">{fmtPrice(snapshot.low)}</p>
                </div>
                <div>
                  <p class="text-text-muted">ATR(14)</p>
                  <p class="font-mono text-text-secondary">{snapshot.atr != null ? '$' + snapshot.atr.toFixed(2) : '—'}</p>
                </div>
              </div>
            </div>

            <!-- Right: Technical signals at that date -->
            <div class="bg-surface-700/50 rounded-lg p-3 border border-border/40 space-y-2">
              <p class="text-[10px] text-text-muted uppercase tracking-wider">Technical Signals</p>
              <div class="space-y-1.5">
                <!-- RSI -->
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-text-muted">RSI(14)</span>
                  {#if snapshot.rsi != null}
                    {@const rsiColor = snapshot.rsi < 30 ? 'text-bull-strong' : snapshot.rsi > 70 ? 'text-danger' : snapshot.rsi < 45 ? 'text-uncertain' : 'text-text-primary'}
                    <span class="font-mono font-semibold {rsiColor}">
                      {snapshot.rsi}
                      <span class="font-normal text-text-muted ml-1">
                        {snapshot.rsi < 30 ? 'Oversold' : snapshot.rsi > 70 ? 'Overbought' : snapshot.rsi < 45 ? 'Mild OS' : snapshot.rsi > 60 ? 'Extended' : 'Neutral'}
                      </span>
                    </span>
                  {:else}
                    <span class="text-text-muted">Need 15+ candles</span>
                  {/if}
                </div>
                <!-- MACD -->
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-text-muted">MACD hist</span>
                  {#if snapshot.macd != null}
                    {@const histColor = snapshot.macd.histogram > 0 ? 'text-bull-strong' : 'text-bear-strong'}
                    <span class="font-mono font-semibold {histColor}">
                      {snapshot.macd.histogram > 0 ? '+' : ''}{snapshot.macd.histogram.toFixed(3)}
                      {#if snapshot.macdCrossover === 'bullish_cross'}
                        <span class="text-bull-strong ml-1">⚡ Bull cross</span>
                      {:else if snapshot.macdCrossover === 'bearish_cross'}
                        <span class="text-danger ml-1">⚡ Bear cross</span>
                      {/if}
                    </span>
                  {:else}
                    <span class="text-text-muted">Need 35+ candles</span>
                  {/if}
                </div>
                <!-- EMA20 -->
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-text-muted">EMA(20)</span>
                  {#if snapshot.ema20 != null}
                    {@const above = snapshot.price > snapshot.ema20}
                    <span class="font-mono {above ? 'text-bull-strong' : 'text-bear-strong'}">
                      {fmtPrice(snapshot.ema20)}
                      <span class="text-[10px] ml-1">{above ? '▲ above' : '▼ below'}</span>
                    </span>
                  {:else}
                    <span class="text-text-muted">—</span>
                  {/if}
                </div>
              </div>
            </div>
          </div>

          <!-- Mini price sparkline showing context window -->
          {#if sp}
            {@const lastPt = sp.pts.split(' ').pop()}
            {@const dotCoords = lastPt ? lastPt.split(',').map(Number) : null}
            <div class="bg-surface-700/30 rounded px-3 py-2 border border-border/30">
              <p class="text-[9px] text-text-muted mb-1 uppercase tracking-wider">Price context (last 30 candles up to selected date)</p>
              <svg viewBox="0 0 {sp.W} {sp.H}" class="w-full" style="height:{sp.H}px" preserveAspectRatio="none">
                <polyline points={sp.pts} fill="none" stroke="#22c55e80" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                {#if dotCoords}
                  <circle cx={dotCoords[0]} cy={dotCoords[1]} r="3" fill="#22c55e"/>
                {/if}
              </svg>
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>

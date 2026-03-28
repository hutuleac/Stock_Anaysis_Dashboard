<script>
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';

  let { marketData = null, collapsed = $bindable(false) } = $props();

  const SECTOR_NAMES = {
    XLK: 'Tech', XLF: 'Finance', XLV: 'Health', XLY: 'Consumer',
    XLP: 'Staples', XLE: 'Energy', XLI: 'Industrial', XLB: 'Materials',
    XLU: 'Utilities', XLRE: 'Real Estate', XLC: 'Comms'
  };

  function getVixLevel(vixPrice) {
    if (!vixPrice) return { label: '—', color: 'text-text-muted', level: 'unknown' };
    if (vixPrice < 15) return { label: 'CALM', color: 'text-bull-strong', level: 'calm' };
    if (vixPrice < 20) return { label: 'NORMAL', color: 'text-text-secondary', level: 'normal' };
    if (vixPrice < 25) return { label: 'ELEVATED', color: 'text-warning', level: 'elevated' };
    if (vixPrice < 35) return { label: 'HIGH', color: 'text-bear-weak', level: 'high' };
    return { label: 'EXTREME', color: 'text-bear-strong', level: 'extreme' };
  }

  function getVixAdvice(level) {
    switch (level) {
      case 'calm': return 'Low volatility — momentum signals reliable';
      case 'normal': return 'Standard conditions — trade your plan';
      case 'elevated': return 'Elevated fear — tighten stops, reduce size';
      case 'high': return 'High anxiety — consider cash, widen stops 20%';
      case 'extreme': return 'Extreme fear — cash is a position';
      default: return 'Refresh to load market data';
    }
  }

  function getSpyTrend(spyData) {
    if (!spyData?.dp) return { label: '—', color: 'text-text-muted', direction: '→' };
    if (spyData.dp > 0.5) return { label: 'Bullish', color: 'text-bull-strong', direction: '↑' };
    if (spyData.dp > -0.5) return { label: 'Neutral', color: 'text-text-secondary', direction: '→' };
    return { label: 'Bearish', color: 'text-bear-strong', direction: '↓' };
  }

  function getSectorLeaders(sectors) {
    if (!sectors) return { leaders: [], laggards: [] };
    const sorted = Object.entries(sectors)
      .filter(([, v]) => v?.data?.dp != null)
      .map(([etf, v]) => ({ etf, name: SECTOR_NAMES[etf] || etf, change: v.data.dp }))
      .sort((a, b) => b.change - a.change);
    return {
      leaders: sorted.slice(0, 2),
      laggards: sorted.slice(-2).reverse()
    };
  }

  function getFearGreedInfo(fg) {
    if (!fg) return null;
    const score = fg.score;
    if (score == null) return null;
    let color, label;
    if (score <= 25)      { color = 'text-bear-strong'; label = 'Extreme Fear'; }
    else if (score <= 40) { color = 'text-bear-weak';   label = 'Fear'; }
    else if (score <= 60) { color = 'text-text-secondary'; label = 'Neutral'; }
    else if (score <= 75) { color = 'text-bull-strong'; label = 'Greed'; }
    else                  { color = 'text-bull-strong'; label = 'Extreme Greed'; }
    return { score, label: fg.rating ?? label, color };
  }

  function getNudge(vixLevel, spyTrend, fgInfo) {
    if (vixLevel === 'extreme') return { text: 'Extreme fear in the market — cash is a valid position today', type: 'danger' };
    if (fgInfo?.score != null && fgInfo.score <= 25) return { text: `Fear & Greed at ${fgInfo.score} (Extreme Fear) — market in panic mode, tread carefully`, type: 'danger' };
    if (vixLevel === 'high') return { text: 'Market anxiety is high — consider reducing position sizes', type: 'warning' };
    if (vixLevel === 'elevated' && spyTrend === 'Bearish') return { text: 'Elevated VIX + bearish trend — not ideal for new longs', type: 'warning' };
    if (fgInfo?.score != null && fgInfo.score >= 80) return { text: `Fear & Greed at ${fgInfo.score} (Extreme Greed) — market extended, contrarian caution`, type: 'warning' };
    return null;
  }

  let vixPrice = $derived(marketData?.vix?.data?.c ?? null);
  let vixChange = $derived(marketData?.vix?.data?.dp ?? null);
  let vixInfo = $derived(getVixLevel(vixPrice));
  let spyData = $derived(marketData?.spy?.data ?? null);
  let spyTrend = $derived(getSpyTrend(spyData));
  let sectorInfo = $derived(getSectorLeaders(marketData?.sectors));
  let fgInfo = $derived(getFearGreedInfo(marketData?.fearGreed?.data));
  let nudge = $derived(getNudge(vixInfo.level, spyTrend.label, fgInfo));
</script>

<!-- Nudge Banner -->
{#if nudge && !collapsed}
  <div class="px-4 py-2 text-center text-sm border-b {nudge.type === 'danger' ? 'bg-bear-strong/10 border-bear-strong/30 text-bear-strong' : 'bg-warning/10 border-warning/30 text-warning'}">
    {nudge.text}
  </div>
{/if}

<!-- Market Context Bar -->
<div class="border-b border-border bg-surface-800/30">
  <div class="max-w-6xl mx-auto px-4">
    <!-- Collapse toggle -->
    <button
      class="w-full flex items-center justify-between py-2 text-left"
      onclick={() => collapsed = !collapsed}
    >
      <span class="text-[10px] uppercase tracking-widest text-text-muted font-medium">Market Context</span>
      <span class="text-xs text-text-muted transition-transform {collapsed ? '' : 'rotate-180'}">▾</span>
    </button>

    <!-- Content -->
    {#if !collapsed}
      <div class="flex items-center gap-6 pb-3 flex-wrap">
        <!-- VIX -->
        <div class="flex flex-col gap-0.5 cursor-default" use:tipAction={() => ({ ...TIPS.vix, current: vixPrice != null ? { value: vixPrice.toFixed(1), label: vixInfo.label, color: vixInfo.level === 'calm' ? '#22c55e' : vixInfo.level === 'normal' ? '#9ca3af' : vixInfo.level === 'elevated' ? '#f59e0b' : vixInfo.level === 'high' ? '#f97316' : '#ef4444' } : undefined })}>
          <span class="text-[9px] uppercase tracking-wider text-text-muted">VIX</span>
          <div class="flex items-center gap-2">
            <span class="text-sm font-bold font-mono {vixInfo.color}">
              {vixPrice != null ? vixPrice.toFixed(1) : '—'}
              {#if vixChange != null}
                <span class="text-xs">{vixChange > 0 ? '↑' : '↓'}</span>
              {/if}
            </span>
            <span class="text-[10px] font-semibold {vixInfo.color} bg-surface-700 px-1.5 py-0.5 rounded">
              {vixInfo.label}
            </span>
          </div>
          <span class="text-[10px] text-text-muted">{getVixAdvice(vixInfo.level)}</span>
        </div>

        <!-- Divider -->
        <div class="w-px h-8 bg-border"></div>

        <!-- SPY Trend -->
        <div class="flex flex-col gap-0.5 cursor-default" use:tipAction={() => ({ ...TIPS.spyTrend, current: spyData?.dp != null ? { value: (spyData.dp > 0 ? '+' : '') + spyData.dp.toFixed(2) + '%', label: spyTrend.label, color: spyTrend.label === 'Bullish' ? '#22c55e' : spyTrend.label === 'Bearish' ? '#ef4444' : '#9ca3af' } : undefined })}>
          <span class="text-[9px] uppercase tracking-wider text-text-muted">SPY Trend</span>
          <div class="flex items-center gap-1.5">
            <span class="text-sm font-bold {spyTrend.color}">{spyTrend.direction}</span>
            <span class="text-sm font-medium {spyTrend.color}">{spyTrend.label}</span>
            {#if spyData?.dp != null}
              <span class="text-xs font-mono text-text-muted">({spyData.dp > 0 ? '+' : ''}{spyData.dp.toFixed(2)}%)</span>
            {/if}
          </div>
          {#if spyData?.c != null}
            <span class="text-[10px] text-text-muted font-mono">${spyData.c.toFixed(2)}</span>
          {/if}
        </div>

        <!-- Divider -->
        <div class="w-px h-8 bg-border"></div>

        <!-- Fear & Greed -->
        {#if fgInfo}
          <div class="flex flex-col gap-0.5 cursor-default" use:tipAction={() => ({ ...TIPS.fearGreed, current: { value: String(fgInfo.score), label: fgInfo.label, color: fgInfo.score <= 25 ? '#ef4444' : fgInfo.score <= 40 ? '#f97316' : fgInfo.score <= 60 ? '#9ca3af' : fgInfo.score <= 75 ? '#f59e0b' : '#ef4444' } })}>
            <span class="text-[9px] uppercase tracking-wider text-text-muted">Fear & Greed</span>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold font-mono {fgInfo.color}">{fgInfo.score}</span>
              <span class="text-[10px] font-semibold {fgInfo.color} bg-surface-700 px-1.5 py-0.5 rounded">{fgInfo.label}</span>
            </div>
            <!-- Gauge bar 0–100 -->
            <div class="w-20 h-1 bg-surface-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all {fgInfo.score <= 40 ? 'bg-bear-strong' : fgInfo.score <= 60 ? 'bg-text-muted' : 'bg-bull-strong'}"
                style="width: {fgInfo.score}%"
              ></div>
            </div>
          </div>

          <!-- Divider -->
          <div class="w-px h-8 bg-border"></div>
        {/if}

        <!-- Sector Leaders -->
        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] uppercase tracking-wider text-text-muted">Leading</span>
          <div class="flex items-center gap-2">
            {#each sectorInfo.leaders as s}
              <span class="text-xs font-mono">
                <span class="text-text-secondary">{s.name}</span>
                <span class="text-bull-strong">{s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%</span>
              </span>
            {/each}
            {#if sectorInfo.leaders.length === 0}
              <span class="text-xs text-text-muted">—</span>
            {/if}
          </div>
        </div>

        <!-- Divider -->
        <div class="w-px h-8 bg-border"></div>

        <!-- Sector Laggards -->
        <div class="flex flex-col gap-0.5">
          <span class="text-[9px] uppercase tracking-wider text-text-muted">Lagging</span>
          <div class="flex items-center gap-2">
            {#each sectorInfo.laggards as s}
              <span class="text-xs font-mono">
                <span class="text-text-secondary">{s.name}</span>
                <span class="text-bear-weak">{s.change > 0 ? '+' : ''}{s.change.toFixed(1)}%</span>
              </span>
            {/each}
            {#if sectorInfo.laggards.length === 0}
              <span class="text-xs text-text-muted">—</span>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

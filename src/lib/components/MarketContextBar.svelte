<script>
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

  function getNudge(vixLevel, spyTrend) {
    if (vixLevel === 'extreme') return { text: 'Extreme fear in the market — cash is a valid position today', type: 'danger' };
    if (vixLevel === 'high') return { text: 'Market anxiety is high — consider reducing position sizes', type: 'warning' };
    if (vixLevel === 'elevated' && spyTrend === 'Bearish') return { text: 'Elevated VIX + bearish trend — not ideal for new longs', type: 'warning' };
    return null;
  }

  let vixPrice = $derived(marketData?.vix?.data?.c ?? null);
  let vixChange = $derived(marketData?.vix?.data?.dp ?? null);
  let vixInfo = $derived(getVixLevel(vixPrice));
  let spyData = $derived(marketData?.spy?.data ?? null);
  let spyTrend = $derived(getSpyTrend(spyData));
  let sectorInfo = $derived(getSectorLeaders(marketData?.sectors));
  let nudge = $derived(getNudge(vixInfo.level, spyTrend.label));
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
        <div class="flex flex-col gap-0.5">
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
        <div class="flex flex-col gap-0.5">
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

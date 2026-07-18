<script>
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';

  let { marketData = null, collapsed = $bindable(false) } = $props();

  const SECTOR_NAMES = {
    XLK: 'Tech', XLF: 'Finance', XLV: 'Health', XLY: 'Consumer',
    XLP: 'Staples', XLE: 'Energy', XLI: 'Industrial', XLB: 'Materials',
    XLU: 'Utilities', XLRE: 'Real Estate', XLC: 'Comms'
  };

  // Every tile shares one anatomy: status dot + label / value + state / context
  // line. `dot` is a bg-* class, `color` a text-* class — always paired.
  const STATES = {
    good:    { dot: 'bg-bull-strong',    color: 'text-bull-strong' },
    neutral: { dot: 'bg-text-muted',     color: 'text-text-secondary' },
    warn:    { dot: 'bg-warning',        color: 'text-warning' },
    caution: { dot: 'bg-bear-weak',      color: 'text-bear-weak' },
    bad:     { dot: 'bg-bear-strong',    color: 'text-bear-strong' },
    unknown: { dot: 'bg-surface-600',    color: 'text-text-muted' },
  };

  function getVixInfo(vixPrice) {
    if (vixPrice == null) return { ...STATES.unknown, value: '—', label: '', sub: 'Refresh to load market data', level: 'unknown', hex: '#9ca3af' };
    if (vixPrice < 15) return { ...STATES.good,    value: vixPrice.toFixed(1), label: 'CALM',     sub: 'Momentum signals reliable',        level: 'calm',     hex: '#22c55e' };
    if (vixPrice < 20) return { ...STATES.neutral, value: vixPrice.toFixed(1), label: 'NORMAL',   sub: 'Standard conditions',              level: 'normal',   hex: '#9ca3af' };
    if (vixPrice < 25) return { ...STATES.warn,    value: vixPrice.toFixed(1), label: 'ELEVATED', sub: 'Tighten stops, reduce size',       level: 'elevated', hex: '#f59e0b' };
    if (vixPrice < 35) return { ...STATES.caution, value: vixPrice.toFixed(1), label: 'HIGH',     sub: 'Consider cash, widen stops 20%',   level: 'high',     hex: '#f97316' };
    return { ...STATES.bad, value: vixPrice.toFixed(1), label: 'EXTREME', sub: 'Cash is a position', level: 'extreme', hex: '#ef4444' };
  }

  function pct(dp) { return (dp > 0 ? '+' : '') + dp.toFixed(2) + '%'; }

  function getSpyInfo(spy) {
    if (spy?.dp == null) return { ...STATES.unknown, value: '—', label: '—', sub: null, hex: '#9ca3af' };
    const sub = spy.c != null ? '$' + spy.c.toFixed(2) : null;
    if (spy.dp > 0.5)  return { ...STATES.good,    value: pct(spy.dp), label: 'BULLISH', sub, hex: '#22c55e' };
    if (spy.dp > -0.5) return { ...STATES.neutral, value: pct(spy.dp), label: 'NEUTRAL', sub, hex: '#9ca3af' };
    return { ...STATES.bad, value: pct(spy.dp), label: 'BEARISH', sub, hex: '#ef4444' };
  }

  // BTC moves ~3x SPY, so risk-on/off thresholds are wider (±1.5% vs ±0.5%)
  function getBtcInfo(btc) {
    if (btc?.dp == null) return null;
    const sub = '$' + Math.round(btc.price).toLocaleString();
    if (btc.dp > 1.5)  return { ...STATES.good,    value: pct(btc.dp), label: 'RISK-ON',  sub, hex: '#22c55e' };
    if (btc.dp > -1.5) return { ...STATES.neutral, value: pct(btc.dp), label: 'NEUTRAL',  sub, hex: '#9ca3af' };
    return { ...STATES.bad, value: pct(btc.dp), label: 'RISK-OFF', sub, hex: '#ef4444' };
  }

  function getMacroInfo(macro) {
    if (!macro) return null;
    const value = macro.t10y2y != null ? (macro.t10y2y > 0 ? '+' : '') + macro.t10y2y.toFixed(2) : '—';
    const parts = [];
    // all three read as percent — units live in the tooltip, keep the line tight
    if (macro.fedFunds != null) parts.push(`Fed ${macro.fedFunds.toFixed(2)}${macro.fedRising ? '↑' : '→'}`);
    if (macro.cpiYoY != null) parts.push(`CPI ${macro.cpiYoY.toFixed(1)}`);
    if (macro.unemployment != null) parts.push(`U ${macro.unemployment.toFixed(1)}`);
    const sub = parts.join(' · ') || null;
    if (macro.curveInverted) return { ...STATES.bad,  value, label: 'INVERTED',   sub, hex: '#ef4444' };
    if (macro.fedRising)     return { ...STATES.warn, value, label: 'FED RISING', sub, hex: '#f59e0b' };
    return { ...STATES.good, value, label: 'NORMAL', sub, hex: '#22c55e' };
  }

  function getFgInfo(fg) {
    if (fg?.score == null) return null;
    const s = fg.score;
    const base =
      s <= 25 ? { ...STATES.bad,     label: 'Extreme Fear',  hex: '#ef4444' } :
      s <= 40 ? { ...STATES.caution, label: 'Fear',          hex: '#f97316' } :
      s <= 60 ? { ...STATES.neutral, label: 'Neutral',       hex: '#9ca3af' } :
      s <= 75 ? { ...STATES.good,    label: 'Greed',         hex: '#f59e0b' } :
                { ...STATES.warn,    label: 'Extreme Greed', hex: '#ef4444' };
    return { ...base, score: s, label: fg.rating ?? base.label };
  }

  // One Rotation tile replaces Leading/Lagging: breadth (advancers/total) is
  // the state, top/bottom sectors are the context lines.
  function getRotation(sectors) {
    const all = Object.entries(sectors ?? {})
      .filter(([, v]) => v?.data?.dp != null)
      .map(([etf, v]) => ({ name: SECTOR_NAMES[etf] || etf, dp: v.data.dp }))
      .sort((a, b) => b.dp - a.dp);
    if (!all.length) return null;
    const up = all.filter(s => s.dp > 0).length;
    const state = up >= 7 ? { ...STATES.good, label: 'BROAD' }
                : up <= 4 ? { ...STATES.bad,  label: 'WEAK' }
                :           { ...STATES.neutral, label: 'MIXED' };
    return { ...state, value: `${up}/${all.length}`, leaders: all.slice(0, 2), laggards: all.slice(-2).reverse() };
  }

  function getBreadthInfo(breadth) {
    const e50 = breadth?.ema50;
    if (!e50 || !e50.total) return null;
    const ratio = e50.above / e50.total;
    const state = ratio >= 0.7 ? { ...STATES.good, label: 'BULLISH' }
                : ratio <= 0.4 ? { ...STATES.bad,  label: 'BEARISH' }
                :                { ...STATES.neutral, label: 'MIXED' };
    return { ...state, value: `${e50.above}/${e50.total}`, ema50: e50, ema200: breadth.ema200 };
  }

  function getNudge(vixLevel, spyLabel, fg) {
    if (vixLevel === 'extreme') return { text: 'Extreme fear in the market — cash is a valid position today', type: 'danger' };
    if (fg?.score != null && fg.score <= 25) return { text: `Fear & Greed at ${fg.score} (Extreme Fear) — market in panic mode, tread carefully`, type: 'danger' };
    if (vixLevel === 'high') return { text: 'Market anxiety is high — consider reducing position sizes', type: 'warning' };
    if (vixLevel === 'elevated' && spyLabel === 'BEARISH') return { text: 'Elevated VIX + bearish trend — not ideal for new longs', type: 'warning' };
    if (fg?.score != null && fg.score >= 80) return { text: `Fear & Greed at ${fg.score} (Extreme Greed) — market extended, contrarian caution`, type: 'warning' };
    return null;
  }

  let vixInfo  = $derived(getVixInfo(marketData?.volProxy ?? null));
  let spyInfo  = $derived(getSpyInfo(marketData?.spy?.data ?? null));
  let btcInfo  = $derived(getBtcInfo(marketData?.btc?.data ?? null));
  let macroInfo = $derived(getMacroInfo(marketData?.macro ?? null));
  let fgInfo   = $derived(getFgInfo(marketData?.fearGreed?.data ?? null));
  let rotation = $derived(getRotation(marketData?.sectors));
  let breadthInfo = $derived(getBreadthInfo(marketData?.breadth ?? null));
  let nudge    = $derived(getNudge(vixInfo.level, spyInfo.label, fgInfo));
</script>

{#snippet tileHeader(info, name)}
  <div class="flex items-center gap-1.5">
    <span class="w-1.5 h-1.5 rounded-full shrink-0 {info.dot}"></span>
    <span class="text-[11px] uppercase tracking-wider text-text-muted truncate">{name}</span>
  </div>
  <div class="flex items-baseline gap-1.5 min-w-0">
    <span class="text-sm font-bold font-mono {info.color}">{info.value}</span>
    <span class="text-[12px] font-semibold {info.color} truncate">{info.label}</span>
  </div>
{/snippet}

<!-- Rotation leader/laggard row: arrow + sector name left, % pinned right.
     Top mover always shows; the runner-up appears only where there's room (md+). -->
{#snippet rotationRow(arrow, color, sectors)}
  <div class="flex items-center gap-x-2 min-w-0">
    {#each sectors as s, i}
      <span class="flex items-center gap-1 min-w-0 {i > 0 ? 'hidden md:flex' : ''}">
        <span class="{color} shrink-0">{arrow}</span>
        <span class="text-text-secondary truncate">{s.name}</span>
        <span class="{color} shrink-0">{s.dp > 0 ? '+' : ''}{s.dp.toFixed(1)}</span>
      </span>
    {/each}
  </div>
{/snippet}

<!-- Nudge Banner -->
{#if nudge && !collapsed}
  <div class="px-4 py-2 text-center text-sm border-b {nudge.type === 'danger' ? 'bg-bear-strong/10 border-bear-strong/30 text-bear-strong' : 'bg-warning/10 border-warning/30 text-warning'}">
    {nudge.text}
  </div>
{/if}

<!-- Market Context Bar -->
<div class="border-b border-border bg-surface-800/30">
  <div class="max-w-[1800px] mx-auto px-4">
    <button
      class="w-full flex items-center justify-between py-2 text-left"
      onclick={() => collapsed = !collapsed}
    >
      <span class="text-[13px] uppercase tracking-widest text-text-muted font-medium">Market Context</span>
      <span class="text-xs text-text-muted transition-transform {collapsed ? '' : 'rotate-180'}">▾</span>
    </button>

    {#if !collapsed}
      <!-- Hairline grid: gap-px over the border color draws the dividers.
           auto-fit keeps it responsive — 2-up on phones, one row on desktop. -->
      <div class="grid gap-px bg-border/60 border border-border/60 rounded-lg overflow-hidden mb-3 [grid-template-columns:repeat(auto-fit,minmax(160px,1fr))]">

        <!-- Volatility (SPY 20d realized, annualized — VIX proxy) -->
        <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
          use:tipAction={() => ({ ...TIPS.vix, current: vixInfo.level !== 'unknown' ? { value: vixInfo.value, label: vixInfo.label, color: vixInfo.hex } : undefined })}>
          {@render tileHeader(vixInfo, 'Volatility')}
          <span class="text-[12px] text-text-muted truncate">{vixInfo.sub}</span>
        </div>

        <!-- SPY Trend -->
        <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
          use:tipAction={() => ({ ...TIPS.spyTrend, current: spyInfo.sub ? { value: spyInfo.value, label: spyInfo.label, color: spyInfo.hex } : undefined })}>
          {@render tileHeader(spyInfo, 'SPY Trend')}
          {#if spyInfo.sub}<span class="text-[12px] text-text-muted font-mono truncate">{spyInfo.sub}</span>{/if}
        </div>

        <!-- BTC Risk Appetite -->
        {#if btcInfo}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={() => ({ ...TIPS.btcRisk, current: { value: btcInfo.value, label: btcInfo.label, color: btcInfo.hex } })}>
            {@render tileHeader(btcInfo, 'BTC Risk')}
            <span class="text-[12px] text-text-muted font-mono truncate">{btcInfo.sub}</span>
          </div>
        {/if}

        <!-- Macro Regime (FRED) -->
        {#if macroInfo}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={() => ({ ...TIPS.macro, current: { value: macroInfo.value, label: macroInfo.label, color: macroInfo.hex } })}>
            {@render tileHeader(macroInfo, 'Macro · 10Y–2Y')}
            {#if macroInfo.sub}<span class="text-[12px] text-text-muted font-mono truncate">{macroInfo.sub}</span>{/if}
          </div>
        {/if}

        <!-- Fear & Greed -->
        {#if fgInfo}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={() => ({ ...TIPS.fearGreed, current: { value: String(fgInfo.score), label: fgInfo.label, color: fgInfo.hex } })}>
            {@render tileHeader({ ...fgInfo, value: String(fgInfo.score) }, 'Fear & Greed')}
            <div class="w-full max-w-24 h-1 bg-surface-700 rounded-full overflow-hidden mt-0.5">
              <div
                class="h-full rounded-full transition-all {fgInfo.score <= 40 ? 'bg-bear-strong' : fgInfo.score <= 60 ? 'bg-text-muted' : 'bg-bull-strong'}"
                style="width: {fgInfo.score}%"
              ></div>
            </div>
          </div>
        {/if}

        <!-- Sector Rotation (breadth + leaders/laggards) -->
        {#if rotation}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={TIPS.sectorLeaders}>
            {@render tileHeader(rotation, 'Rotation')}
            <div class="flex flex-col gap-0.5 text-[12px] font-mono min-w-0 leading-tight mt-0.5">
              {@render rotationRow('▲', 'text-bull-strong', rotation.leaders)}
              {@render rotationRow('▼', 'text-bear-weak', rotation.laggards)}
            </div>
          </div>
        {/if}

        <!-- Watchlist Breadth (%>EMA50/EMA200) -->
        {#if breadthInfo}
          <div class="bg-surface-800 px-3 py-2 flex flex-col gap-0.5 cursor-default min-w-0"
            use:tipAction={TIPS.breadth}>
            {@render tileHeader(breadthInfo, 'Breadth')}
            <span class="text-[12px] text-text-muted font-mono truncate">
              {breadthInfo.ema50.above}/{breadthInfo.ema50.total} &gt; EMA50 · {breadthInfo.ema200.above}/{breadthInfo.ema200.total} &gt; EMA200
            </span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

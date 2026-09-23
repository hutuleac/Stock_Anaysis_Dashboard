<script>
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { entryPlan } from '../entryPlan.js';
  import { toneColor } from '../tone.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';

  let { symbol } = $props();

  const data = $derived(getTickerData(symbol));
  const price = $derived(data?.quote?.data?.c ?? null);
  const dp = $derived(data?.quote?.data?.dp ?? null);
  const weeklyAtr = $derived(data?.weekly?.atr ?? null);
  const dailyAtr = $derived(data?.indicators?.atr ?? null);
  const plan = $derived(entryPlan({ price, weeklyAtr, target: data?.anchors?.fib?.swingHigh ?? null }));

  const usd = (v) => '$' + v.toFixed(2);
  const pct = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
  const rrColor = (rr) => toneColor(rr >= 2 ? 'good' : rr >= 1 ? 'partial' : 'danger');

  const LEVEL_TIPS = {
    stop:   'Suggested stop — entry minus 2× weekly ATR. Far enough that normal weekly noise shouldn\'t take you out.',
    entry:  'Current price — where you would enter today.',
    '1R':   'One unit of risk above entry: the gain equals what the stop would cost.',
    '2R':   'Two units of risk above entry — the usual minimum worth taking a swing for.',
    '3R':   'Three units of risk above entry — an extended target.',
    target: 'Most significant recent swing high — the first real overhead supply.',
  };
  const levelTip = (l) => ({
    title: `${l.key === 'target' ? 'Target' : l.key === 'stop' ? 'Stop' : l.key === 'entry' ? 'Entry' : l.key} · ${usd(l.price)}`,
    description: LEVEL_TIPS[l.key],
  });
</script>

<div class="space-y-2">
  <div class="flex items-center justify-between gap-2">
    <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Entry &amp; Risk</h3>
    {#if plan?.rr != null}
      <span class="font-mono text-sm font-semibold" style="color:{rrColor(plan.rr)}">R:R 1:{plan.rr.toFixed(1)}</span>
    {/if}
  </div>

  {#if dp !== null && Math.abs(dp) >= 5}
    <p class="text-xs {dp >= 5 ? 'text-warning' : 'text-danger'}">
      🌊 High-volatility day ({pct(dp)}) — {dp >= 5 ? 'chasing a gap-up; consider letting it settle.' : 'entering a sharp selloff; could bounce or accelerate.'}
    </p>
  {/if}

  {#if plan}
    <p class="font-mono text-sm text-text-secondary leading-relaxed">
      <span class="text-text-primary">{usd(price)}</span>
      → stop <span class="text-danger">{usd(plan.stop)}</span> <span class="text-text-muted">({pct(plan.stopPct)})</span>
      {#if plan.target}
        → target <span class="text-bull-strong">{usd(plan.target)}</span> <span class="text-text-muted">swing high ({pct(plan.targetPct)})</span>
      {/if}
    </p>

    <!-- Price ladder: red = risk (stop → entry), green = upside (entry → 3R / target) -->
    {@const entryPos = plan.levels[1].pos}
    <div class="relative h-11 mt-1 mx-4">
      <div class="absolute top-3 h-1.5 left-0 rounded-l bg-danger/60" style="width:{entryPos}%"></div>
      <div class="absolute top-3 h-1.5 right-0 rounded-r bg-bull-strong/40" style="left:{entryPos}%"></div>
      {#each plan.levels as l (l.key)}
        <div class="absolute top-0 -translate-x-1/2 flex flex-col items-center cursor-default" style="left:{l.pos}%" use:tipAction={() => levelTip(l)}>
          {#if l.key === 'entry'}
            <span class="mt-2 w-3.5 h-3.5 rounded-full bg-text-primary border-2 border-surface-800"></span>
          {:else if l.key === 'target'}
            <span class="text-bull-strong text-xs leading-none mt-0.5">▲</span>
            <span class="w-0.5 h-3 bg-bull-strong"></span>
          {:else}
            <span class="mt-2 w-0.5 h-3.5 {l.key === 'stop' ? 'bg-danger' : 'bg-text-muted'}"></span>
          {/if}
          {#if l.key !== 'target'}
            <span class="text-[12px] font-mono whitespace-nowrap {l.key === 'stop' ? 'text-danger' : 'text-text-muted'}">{l.key === 'entry' ? '' : l.key}</span>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="text-xs text-text-muted">Weekly ATR unavailable — load candle data to see stop and targets.</p>
  {/if}

  {#if dailyAtr !== null && price}
    <p class="text-xs text-text-muted">
      Daily ATR <span class="font-mono text-text-secondary">{usd(dailyAtr)} ({(dailyAtr / price * 100).toFixed(1)}%)</span> — a normal day's move{#if weeklyAtr}; the stop sits 2× weekly ATR (<span class="font-mono">{usd(weeklyAtr)}</span>) away{/if}.
    </p>
  {/if}
</div>

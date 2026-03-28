<script>
  import { getTickers, getTickerData } from '../stores/watchlist.svelte.js';
  import { computeScore, getBadgeStyle, getDaysToEarnings } from '../scoring.js';
  import { getChecklist } from '../stores/checklist.svelte.js';
  import { selectTicker } from '../stores/watchlist.svelte.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';

  let collapsed = $state(false);

  const brief = $derived(() => {
    const tickers = getTickers();
    if (!tickers.length) return null;

    const scored = tickers.map(t => {
      const data = getTickerData(t.symbol);
      const score = computeScore(data);
      const checklist = getChecklist(t.symbol);
      const daysToEarnings = getDaysToEarnings(data?.earnings);
      const isBlocked = checklist.hardWarning && !checklist.hardWarningDismissed;
      const dp = data?.quote?.data?.dp ?? null;
      return { ticker: t, data, score, daysToEarnings, isBlocked, dp };
    }).filter(s => s.score.score !== null);

    if (!scored.length) return null;

    // Top 3 setups by score (not blocked)
    const topSetups = scored
      .filter(s => !s.isBlocked && s.score.score >= 55)
      .sort((a, b) => b.score.score - a.score.score)
      .slice(0, 3);

    // Earnings warnings (next 7 days)
    const earningsWarnings = scored
      .filter(s => s.daysToEarnings !== null && s.daysToEarnings <= 7)
      .sort((a, b) => a.daysToEarnings - b.daysToEarnings);

    // Blocked tickers
    const blocked = scored.filter(s => s.isBlocked);

    // Big movers today (|dp| > 3%)
    const movers = scored
      .filter(s => s.dp !== null && Math.abs(s.dp) >= 3)
      .sort((a, b) => Math.abs(b.dp) - Math.abs(a.dp))
      .slice(0, 3);

    return { topSetups, earningsWarnings, blocked, movers };
  });
</script>

{#if brief()}
  {@const b = brief()}
  {#if b.topSetups.length || b.earningsWarnings.length || b.blocked.length || b.movers.length}
    <div class="mb-4 border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
      <!-- Header -->
      <button
        class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-700/30 transition-colors"
        onclick={() => collapsed = !collapsed}
      >
        <div class="flex items-center gap-2">
          <span class="text-xs font-semibold text-text-muted uppercase tracking-wider">Morning Brief</span>
          {#if b.blocked.length}
            <span class="text-[10px] bg-danger/20 text-danger px-1.5 py-0.5 rounded font-semibold">{b.blocked.length} blocked</span>
          {/if}
          {#if b.earningsWarnings.length}
            <span class="text-[10px] bg-warning/20 text-warning px-1.5 py-0.5 rounded font-semibold">{b.earningsWarnings.length} earnings soon</span>
          {/if}
        </div>
        <span class="text-text-muted text-xs">{collapsed ? '▸' : '▾'}</span>
      </button>

      {#if !collapsed}
        <div class="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-border/40 pt-3">

          <!-- Top Setups -->
          <div>
            <p class="text-[10px] text-text-muted uppercase tracking-wider mb-2 cursor-default" use:tipAction={TIPS.topSetups}>Top Setups</p>
            {#if b.topSetups.length}
              <div class="space-y-1.5">
                {#each b.topSetups as s}
                  {@const badge = getBadgeStyle(s.score.badge)}
                  <button
                    class="w-full flex items-center gap-2 hover:bg-surface-700/40 rounded px-1.5 py-1 transition-colors text-left"
                    onclick={() => selectTicker(s.ticker.symbol)}
                  >
                    <span class="font-mono font-semibold text-sm text-text-primary w-14 shrink-0">{s.ticker.symbol}</span>
                    <span class="font-mono text-xs {s.score.score >= 72 ? 'text-bull-strong' : 'text-uncertain'}">{s.score.score}</span>
                    <span class="text-[10px] px-1.5 py-0.5 rounded {badge.bg} {badge.text}">{badge.label}</span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-text-muted italic">No strong setups today</p>
            {/if}
          </div>

          <!-- Earnings Warnings -->
          <div>
            <p class="text-[10px] text-text-muted uppercase tracking-wider mb-2 cursor-default" use:tipAction={TIPS.earningsSoon}>Earnings Soon</p>
            {#if b.earningsWarnings.length}
              <div class="space-y-1.5">
                {#each b.earningsWarnings as s}
                  <button
                    class="w-full flex items-center gap-2 hover:bg-surface-700/40 rounded px-1.5 py-1 transition-colors text-left"
                    onclick={() => selectTicker(s.ticker.symbol)}
                  >
                    <span class="font-mono font-semibold text-sm text-text-primary w-14 shrink-0">{s.ticker.symbol}</span>
                    <span class="text-xs {s.daysToEarnings <= 2 ? 'text-danger font-bold' : 'text-warning'}">
                      {s.daysToEarnings === 0 ? 'Today' : s.daysToEarnings === 1 ? 'Tomorrow' : `${s.daysToEarnings}d`}
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-text-muted italic">No earnings this week</p>
            {/if}
          </div>

          <!-- Big Movers -->
          <div>
            <p class="text-[10px] text-text-muted uppercase tracking-wider mb-2 cursor-default" use:tipAction={TIPS.bigMovers}>Big Movers Today</p>
            {#if b.movers.length}
              <div class="space-y-1.5">
                {#each b.movers as s}
                  <button
                    class="w-full flex items-center gap-2 hover:bg-surface-700/40 rounded px-1.5 py-1 transition-colors text-left"
                    onclick={() => selectTicker(s.ticker.symbol)}
                  >
                    <span class="font-mono font-semibold text-sm text-text-primary w-14 shrink-0">{s.ticker.symbol}</span>
                    <span class="text-xs font-mono {s.dp >= 0 ? 'text-bull-strong' : 'text-bear-strong'}">
                      {s.dp >= 0 ? '+' : ''}{s.dp.toFixed(1)}%
                    </span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-text-muted italic">No major moves</p>
            {/if}
          </div>

          <!-- Blocked -->
          <div>
            <p class="text-[10px] text-text-muted uppercase tracking-wider mb-2 cursor-default" use:tipAction={TIPS.blockedTickers}>Blocked</p>
            {#if b.blocked.length}
              <div class="space-y-1.5">
                {#each b.blocked as s}
                  <button
                    class="w-full flex items-center gap-2 hover:bg-surface-700/40 rounded px-1.5 py-1 transition-colors text-left"
                    onclick={() => selectTicker(s.ticker.symbol)}
                  >
                    <span class="font-mono font-semibold text-sm text-text-primary w-14 shrink-0">{s.ticker.symbol}</span>
                    <span class="text-[10px] bg-danger/20 text-danger px-1.5 rounded">BLOCKED</span>
                  </button>
                {/each}
              </div>
            {:else}
              <p class="text-xs text-text-muted italic">No blocked tickers</p>
            {/if}
          </div>

        </div>
      {/if}
    </div>
  {/if}
{/if}

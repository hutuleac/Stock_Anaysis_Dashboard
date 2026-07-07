<script>
  import { getTickers, getTickerData, selectTicker } from '../stores/watchlist.svelte.js';
  import { computeDipRadar } from '../dip.js';
  import { tooltip as tipAction } from '../actions/tooltip.js';
  import { TIPS } from '../tooltipDefs.js';

  let { marketData = null } = $props();
  let collapsed = $state(false);

  const hits = $derived.by(() => {
    const list = getTickers().map(t => ({ symbol: t.symbol, data: getTickerData(t.symbol) }));
    return computeDipRadar(list, {
      fearGreedValue: marketData?.fearGreed?.data?.score ?? null,
      spyBelowEma50:  marketData?.spyBelowEma50 ?? null,
    });
  });

  function readinessColor(r) {
    if (r === 'ACT')  return 'bg-bull-strong/20 text-bull-strong';
    if (r === 'SOON') return 'bg-uncertain/20 text-uncertain';
    return 'bg-surface-600 text-text-secondary'; // WATCH
  }
  function readinessCssColor(r) {
    if (r === 'ACT')  return '#22c55e';
    if (r === 'SOON') return '#f59e0b';
    return '#6b7280';
  }
  const scoreColor = (s) => s >= 7 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#6b7280';
  const componentSummary = (h) => h.components.map(c => `${c.label} ${c.score}/${c.max}`).join(' · ');
  const comp = (h, label) => h.components.find(c => c.label === label);
</script>

{#if getTickers().length}
  <div class="mb-4 border border-border/60 rounded-lg overflow-hidden bg-surface-800/60">
    <button
      class="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-700/30 transition-colors"
      onclick={() => collapsed = !collapsed}
    >
      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold text-text-muted uppercase tracking-wider cursor-default" use:tipAction={TIPS.dipRadar}>▼ Dip Hunter</span>
        <span class="text-[10px] text-text-muted hidden sm:inline">quality stocks on sale</span>
        {#if hits.length}
          <span class="text-[10px] bg-bull-strong/20 text-bull-strong px-1.5 py-0.5 rounded font-semibold">{hits.length}</span>
        {/if}
      </div>
      <span class="text-text-muted text-xs">{collapsed ? '▸' : '▾'}</span>
    </button>

    {#if !collapsed}
      <div class="px-4 pb-3 border-t border-border/40 pt-3">
        {#if hits.length}
          <div class="space-y-1.5">
            {#each hits as h}
              <button
                class="w-full flex items-center gap-3 hover:bg-surface-700/40 rounded px-1.5 py-1.5 transition-colors text-left overflow-x-auto"
                onclick={() => selectTicker(h.symbol)}
              >
                <span class="font-mono font-semibold text-sm text-text-primary w-16 shrink-0">{h.symbol}</span>

                <!-- Dip score + component breakdown tooltip -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded bg-surface-600 text-text-secondary w-20 shrink-0 text-center cursor-default"
                  use:tipAction={() => ({
                    ...TIPS.dipScore,
                    current: { value: `${h.score.toFixed(1)}/10`, label: componentSummary(h), color: scoreColor(h.score) },
                  })}
                >DIP <span style="color:{scoreColor(h.score)}">{h.score.toFixed(1)}</span></span>

                <!-- Readiness -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded {readinessColor(h.readiness)} w-14 shrink-0 text-center cursor-default"
                  use:tipAction={() => ({
                    ...TIPS.radarReadiness,
                    current: { value: h.readiness, label: h.readiness === 'ACT' ? 'fear + oversold + quality aligned' : '', color: readinessCssColor(h.readiness) },
                  })}
                >{h.readiness}</span>

                <!-- RSI -->
                <span
                  class="font-mono text-xs w-16 shrink-0 cursor-default"
                  style="color:{h.rsi == null ? '#6b7280' : h.rsi < 30 ? '#22c55e' : h.rsi < 40 ? '#86efac' : '#6b7280'}"
                  use:tipAction={() => ({
                    ...TIPS.rsi,
                    current: h.rsi != null
                      ? { value: h.rsi.toFixed(1), label: h.rsi < 30 ? 'Oversold' : h.rsi < 40 ? 'Approaching oversold' : 'Neutral', color: h.rsi < 30 ? '#22c55e' : h.rsi < 40 ? '#86efac' : '#6b7280' }
                      : { value: '—', label: 'no indicator data', color: '#6b7280' },
                  })}
                >RSI {h.rsi != null ? h.rsi.toFixed(0) : '—'}</span>

                <!-- 60d drawdown -->
                <span
                  class="font-mono text-xs w-20 shrink-0 cursor-default"
                  style="color:{h.roc60 == null ? '#6b7280' : h.roc60 <= -15 ? '#ef4444' : h.roc60 <= -8 ? '#f97316' : '#6b7280'}"
                  use:tipAction={() => ({
                    ...TIPS.roc,
                    current: h.roc60 != null
                      ? { value: `${h.roc60.toFixed(1)}%`, label: h.roc60 <= -15 ? 'Deep discount' : h.roc60 <= -8 ? 'On sale' : 'Shallow', color: h.roc60 <= -15 ? '#ef4444' : h.roc60 <= -8 ? '#f97316' : '#6b7280' }
                      : { value: '—', label: 'no candle data', color: '#6b7280' },
                  })}
                >60d {h.roc60 != null ? `${h.roc60 > 0 ? '+' : ''}${h.roc60.toFixed(1)}%` : '—'}</span>

                <!-- Turn (MACD bullish cross) -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded shrink-0 cursor-default {comp(h, 'Turn').score > 0 ? 'bg-bull-strong/20 text-bull-strong' : 'bg-surface-600 text-text-muted'}"
                  use:tipAction={() => ({
                    ...TIPS.macd,
                    current: {
                      value: comp(h, 'Turn').detail,
                      label: comp(h, 'Turn').score > 0 ? 'Momentum already turning up' : 'Still waiting on a turn',
                      color: comp(h, 'Turn').score > 0 ? '#22c55e' : '#6b7280',
                    },
                  })}
                >↗ {comp(h, 'Turn').detail}</span>

                <!-- Value (PEG) -->
                <span
                  class="font-mono text-xs shrink-0 cursor-default"
                  style="color:{comp(h, 'Value').score >= 0.7 ? '#22c55e' : comp(h, 'Value').score > 0 ? '#86efac' : '#6b7280'}"
                  use:tipAction={{
                    title: 'Value (PEG)', subtitle: 'P/E ÷ EPS growth, within the quality gate',
                    category: 'Signals',
                    description: 'PEG < 3 is already required to appear on this card. This scores how cheap the growth is within that band — PEG < 1 is a strong value dip, 2–3 barely clears the bar.',
                    why: 'A quality name at PEG 0.8 is a better dip than one at PEG 2.8, even if both passed the gate.',
                    current: { value: comp(h, 'Value').detail, label: '', color: comp(h, 'Value').score >= 0.7 ? '#22c55e' : '#6b7280' },
                  }}
                >{comp(h, 'Value').detail}</span>

                <!-- OBV divergence -->
                <span
                  class="text-[10px] px-1.5 py-0.5 rounded shrink-0 cursor-default {comp(h, 'OBV').score > 0 ? 'bg-bull-strong/20 text-bull-strong' : 'bg-surface-600 text-text-muted'}"
                  use:tipAction={() => ({
                    ...TIPS.obv,
                    current: { value: comp(h, 'OBV').detail, label: '', color: comp(h, 'OBV').score > 0 ? '#22c55e' : '#6b7280' },
                  })}
                >{comp(h, 'OBV').detail}</span>

                <!-- ADX risk flag -->
                {#if h.risk.strongDowntrend}
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded bg-bear-strong/20 text-bear-strong shrink-0 cursor-default"
                    use:tipAction={() => ({
                      ...TIPS.adx,
                      current: { value: `ADX ${h.risk.adx}`, label: 'Strong, still-accelerating downtrend — capped at WATCH', color: '#ef4444' },
                    })}
                  >⚠ trend {h.risk.adx}</span>
                {/if}

                <!-- Support broken flag -->
                {#if h.support.belowSupport}
                  <span
                    class="text-[10px] px-1.5 py-0.5 rounded bg-bear-strong/20 text-bear-strong shrink-0 cursor-default"
                    use:tipAction={() => ({
                      ...TIPS.swingLows,
                      current: { value: `below $${h.support.nearestSupport}`, label: 'Last swing-low support already broken', color: '#ef4444' },
                    })}
                  >⚠ support broken</span>
                {/if}

                <!-- Smart money -->
                <span
                  class="text-[10px] text-text-secondary shrink-0 cursor-default"
                  use:tipAction={() => ({
                    ...TIPS.dipSmartMoney,
                    current: {
                      value: comp(h, 'Smart Money').detail,
                      label: `${comp(h, 'Smart Money').score}/1.0 confirmation`,
                      color: comp(h, 'Smart Money').score >= 1.0 ? '#22c55e' : comp(h, 'Smart Money').score > 0 ? '#86efac' : '#6b7280',
                    },
                  })}
                >💰 {comp(h, 'Smart Money').detail}</span>
              </button>
            {/each}
          </div>
        {:else}
          <p class="text-xs text-text-muted italic">No quality dips right now — patience is a position.</p>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<script>
  import { generateThesis, computeScore } from '../scoring.js';
  import { getTickerData } from '../stores/watchlist.svelte.js';

  let { symbol } = $props();

  const thesis = $derived(() => {
    const data = getTickerData(symbol);
    if (!data) return null;
    const score = computeScore(data);
    return generateThesis(data, score);
  });
</script>

{#if thesis()}
  {@const t = thesis()}
  {#if t.bulls.length || t.bears.length || t.warnings.length}
    <div class="space-y-2">
      <p class="text-xs font-semibold text-text-muted uppercase tracking-wider">Why this score</p>

      {#if t.warnings.length}
        <div class="space-y-1.5">
          {#each t.warnings as w}
            <div class="flex gap-2 items-start">
              <span class="text-warning mt-0.5 shrink-0">⚠</span>
              <span class="text-sm text-warning leading-snug">{w}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if t.bulls.length}
        <div class="space-y-1.5">
          {#each t.bulls as b}
            <div class="flex gap-2 items-start">
              <span class="text-bull-strong mt-0.5 shrink-0 text-xs">▲</span>
              <span class="text-sm text-text-secondary leading-snug">{b}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if t.bears.length}
        <div class="space-y-1.5">
          {#each t.bears as b}
            <div class="flex gap-2 items-start">
              <span class="text-bear-weak mt-0.5 shrink-0 text-xs">▼</span>
              <span class="text-sm text-text-secondary leading-snug">{b}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/if}

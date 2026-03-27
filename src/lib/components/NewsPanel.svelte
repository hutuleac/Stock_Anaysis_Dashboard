<script>
  import { getTickerData } from '../stores/watchlist.svelte.js';

  let { symbol } = $props();

  const BULLISH_WORDS = ['beat', 'beats', 'raised', 'upgrade', 'upgraded', 'buy', 'strong', 'record',
    'growth', 'profit', 'surge', 'rally', 'bullish', 'outperform', 'exceed', 'exceeded', 'positive', 'boost'];
  const BEARISH_WORDS = ['miss', 'misses', 'missed', 'cut', 'downgrade', 'downgraded', 'sell', 'weak',
    'loss', 'decline', 'fall', 'drop', 'bearish', 'underperform', 'concern', 'warning', 'risk', 'negative',
    'layoff', 'layoffs'];

  const headlines = $derived(() => {
    const news = getTickerData(symbol)?.news?.data;
    if (!Array.isArray(news)) return [];
    return news.slice(0, 6).map(item => {
      const text = ((item.headline || '') + ' ' + (item.summary || '')).toLowerCase();
      const bull = BULLISH_WORDS.filter(w => text.includes(w)).length;
      const bear = BEARISH_WORDS.filter(w => text.includes(w)).length;
      const tone = bull > bear ? 'bull' : bear > bull ? 'bear' : 'neutral';
      return { ...item, tone };
    });
  });

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts * 1000) / 60000);
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  }
</script>

<div class="bg-surface-900 rounded-lg border border-border overflow-hidden">
  <div class="px-4 py-2.5 border-b border-border flex items-center gap-2">
    <span class="text-sm font-semibold text-text-primary">News</span>
    <span class="text-xs text-text-muted">last 7 days</span>
  </div>

  {#if headlines().length === 0}
    <div class="px-4 py-4 text-xs text-text-muted">No recent news — refresh to load.</div>
  {:else}
    <div class="divide-y divide-border/50">
      {#each headlines() as item (item.id ?? item.headline)}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-start gap-3 px-4 py-3 hover:bg-surface-800 transition-colors group"
        >
          <!-- Tone indicator -->
          <div class="mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 {item.tone === 'bull' ? 'bg-bull-strong' : item.tone === 'bear' ? 'bg-bear-strong' : 'bg-surface-500'}"></div>

          <div class="flex-1 min-w-0">
            <p class="text-xs text-text-primary leading-snug line-clamp-2 group-hover:text-text-primary/80">
              {item.headline}
            </p>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-[10px] text-text-muted">{item.source}</span>
              <span class="text-[10px] text-text-muted">·</span>
              <span class="text-[10px] text-text-muted">{timeAgo(item.datetime)}</span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

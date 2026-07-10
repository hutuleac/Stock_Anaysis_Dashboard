<script>
  import { getTooltip, hideTooltip } from '../stores/tooltip.svelte.js';

  const TOOLTIP_WIDTH = 374;
  const OFFSET_X = 18;
  const OFFSET_Y = 12;

  const tip = $derived(getTooltip());
  let tipHeight = $state(0); // measured height of the desktop popover

  // Desktop: viewport-aware anchored popover — flip and clamp using the
  // measured height (content varies), never a hardcoded estimate.
  const pos = $derived(() => {
    if (!tip.visible || typeof window === 'undefined') return { x: 0, y: 0 };
    const safeWidth = Math.min(TOOLTIP_WIDTH, window.innerWidth - 16);
    const h = tipHeight || 320; // pre-measurement fallback for the first frame
    let x = tip.x + OFFSET_X;
    if (x + safeWidth > window.innerWidth - 8) x = tip.x - safeWidth - OFFSET_X;
    let y = tip.y + OFFSET_Y;
    if (y + h > window.innerHeight - 8) y = tip.y - h - OFFSET_Y; // flip above cursor
    return { x: Math.max(8, x), y: Math.max(8, y) };
  });

  // Scrolling invalidates a cursor-anchored position — just close.
  // Capture phase also catches scrolls inside nested overflow containers.
  $effect(() => {
    if (!tip.visible || typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 639px)').matches) return; // bottom sheet handles itself
    window.addEventListener('scroll', hideTooltip, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', hideTooltip, { capture: true });
  });

  // On phones the tooltip is a bottom sheet; lock the page behind it so a
  // scroll gesture moves the sheet's own content, not the watchlist underneath.
  $effect(() => {
    if (typeof document === 'undefined') return;
    const isMobile = window.matchMedia('(max-width: 639px)').matches;
    if (tip.visible && isMobile) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  });
</script>

{#snippet body(c)}
  <!-- Header band -->
  <div class="px-3 pt-2.5 pb-2 border-b border-border/40 flex items-start justify-between gap-2">
    <div>
      <p class="font-bold text-sm text-text-primary leading-tight">{c.title}</p>
      {#if c.subtitle}
        <p class="text-[13px] text-text-muted mt-0.5">{c.subtitle}</p>
      {/if}
    </div>
    {#if c.category}
      <span class="text-[12px] uppercase tracking-wider bg-surface-700 text-text-muted px-1.5 py-0.5 rounded shrink-0 mt-0.5">{c.category}</span>
    {/if}
  </div>

  <div class="px-3 py-2.5 space-y-2.5">
    <!-- Current value badge -->
    {#if c.current}
      <div class="flex items-center gap-2 bg-surface-700/60 rounded-lg px-2.5 py-1.5">
        <span class="text-[13px] text-text-muted shrink-0">Now:</span>
        <span class="font-mono font-bold text-sm" style="color:{c.current.color}">{c.current.value}</span>
        {#if c.current.label}
          <span class="text-[13px] font-semibold ml-0.5" style="color:{c.current.color}">{c.current.label}</span>
        {/if}
      </div>
    {/if}

    <!-- Description -->
    {#if c.description}
      <p class="text-[14px] text-text-secondary leading-relaxed">{c.description}</p>
    {/if}

    <!-- Levels table -->
    {#if c.levels?.length}
      <div>
        <p class="text-[12px] uppercase tracking-wider text-text-muted mb-1.5">Reading guide</p>
        <div class="space-y-1">
          {#each c.levels as lvl}
            <div class="flex items-start gap-1.5">
              <span class="text-[12px] font-mono text-text-muted w-[75px] shrink-0 pt-0.5">{lvl.range}</span>
              <span class="text-[13px] font-semibold w-[94px] shrink-0" style="color:{lvl.color}">{lvl.label}</span>
              <span class="text-[13px] text-text-muted leading-tight">{lvl.desc}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Why it matters -->
    {#if c.why}
      <div class="border-t border-border/40 pt-2">
        <p class="text-[12px] uppercase tracking-wider text-text-muted mb-1">Why it matters</p>
        <p class="text-[13px] text-text-secondary leading-relaxed">{c.why}</p>
      </div>
    {/if}
  </div>
{/snippet}

{#if tip.visible && tip.content}
  {@const c = tip.content}
  {@const p = pos()}

  <!-- Desktop: cursor-anchored popover -->
  <div
    class="hidden sm:block fixed z-[9999] pointer-events-none"
    style="left:{p.x}px; top:{p.y}px; width:min({TOOLTIP_WIDTH}px, calc(100vw - 16px));"
    bind:clientHeight={tipHeight}
  >
    <div class="bg-surface-800 border border-border/70 rounded-xl shadow-2xl overflow-hidden text-xs max-h-[calc(100vh-16px)]">
      {@render body(c)}
    </div>
  </div>

  <!-- Mobile: bottom sheet with dimmed, scroll-locked backdrop -->
  <button
    class="sm:hidden fixed inset-0 z-[9998] bg-black/50 cursor-default"
    aria-label="Close"
    onclick={hideTooltip}
  ></button>
  <div class="sm:hidden fixed inset-x-0 bottom-0 z-[9999] bg-surface-800 border-t border-border/70 rounded-t-2xl shadow-2xl text-xs max-h-[82vh] flex flex-col">
    <div class="relative shrink-0 h-6">
      <div class="mx-auto mt-2 h-1 w-10 rounded-full bg-surface-500"></div>
      <button class="absolute right-1.5 top-0.5 p-2 text-text-muted hover:text-text-primary" aria-label="Close" onclick={hideTooltip}>✕</button>
    </div>
    <div class="overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {@render body(c)}
    </div>
  </div>
{/if}

<script>
  import { getTooltip } from '../stores/tooltip.svelte.js';

  const TOOLTIP_WIDTH = 374;
  const OFFSET_X = 18;
  const OFFSET_Y = 12;

  const tip = $derived(getTooltip());

  // Viewport-aware positioning: flip left/up if near edge
  const pos = $derived(() => {
    if (!tip.visible || typeof window === 'undefined') return { x: 0, y: 0 };
    const raw_x = tip.x + OFFSET_X;
    const raw_y = tip.y + OFFSET_Y;
    const safeWidth = Math.min(TOOLTIP_WIDTH, window.innerWidth - 16);
    const max_x = window.innerWidth - safeWidth - 8;
    const x = raw_x > max_x ? tip.x - safeWidth - OFFSET_X : raw_x;
    const max_y = window.innerHeight - 420;
    const y = raw_y > max_y ? tip.y - 320 : raw_y;
    return { x: Math.max(8, x), y: Math.max(8, y) };
  });
</script>

{#if tip.visible && tip.content}
  {@const c = tip.content}
  {@const p = pos()}
  <div
    class="fixed z-[9999] pointer-events-none"
    style="left:{p.x}px; top:{p.y}px; width:min({TOOLTIP_WIDTH}px, calc(100vw - 16px));"
  >
    <div class="bg-surface-800 border border-border/70 rounded-xl shadow-2xl overflow-hidden text-xs">

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
    </div>
  </div>
{/if}

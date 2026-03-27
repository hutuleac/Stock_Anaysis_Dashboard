<script>
  import {
    getChecklist, isChecklistComplete,
    setMacroChecked, setStopLoss,
    toggleAccumulation, setAccCostConfirmed,
    dismissHardWarning, setManualEarnings, setManualSector,
    showAccumulationToggle
  } from '../stores/checklist.svelte.js';
  import { getTickerData } from '../stores/watchlist.svelte.js';
  import { isRefreshing } from '../api/finnhub.svelte.js';

  let { symbol } = $props();

  const checklist = $derived(getChecklist(symbol));
  const complete = $derived(isChecklistComplete(symbol));
  const showAccToggle = $derived(showAccumulationToggle(symbol));
  const hasData = $derived(!!getTickerData(symbol));
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between mb-2">
    <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider">Pre-Buy Checklist</h3>
    {#if complete}
      <span class="text-xs font-semibold text-bull-strong px-2 py-0.5 rounded bg-bull-strong/10">COMPLETE</span>
    {:else}
      <span class="text-xs text-text-muted">Answer all to unlock entry</span>
    {/if}
  </div>

  <!-- Hard Warning Override -->
  {#if checklist.hardWarning}
    <div class="bg-danger/10 border border-danger/30 rounded-lg p-4">
      <div class="flex items-start gap-3">
        <span class="text-danger text-lg">⚠</span>
        <div>
          <p class="text-danger font-semibold text-sm">Earnings in less than 5 days</p>
          <p class="text-text-secondary text-xs mt-1">Entry is blocked. This ticker has imminent earnings risk that cannot be overridden through the checklist.</p>
          {#if !checklist.hardWarningDismissed}
            <button
              class="mt-3 text-xs px-3 py-1.5 rounded border border-danger/50 text-danger hover:bg-danger/10 transition-colors"
              onclick={() => dismissHardWarning(symbol)}
            >
              I understand the risk
            </button>
          {:else}
            <p class="text-xs text-text-muted mt-2 italic">Risk acknowledged. Entry remains locked until earnings pass.</p>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <!-- Accumulation toggle -->
    {#if showAccToggle}
      <div class="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
        <button
          class="text-xs px-2.5 py-1 rounded transition-colors {checklist.accumulation ? 'bg-uncertain/20 text-uncertain border border-uncertain/30' : 'bg-surface-600 text-text-muted hover:text-text-secondary'}"
          onclick={() => toggleAccumulation(symbol)}
        >
          {checklist.accumulation ? '✓ Adding to position' : 'Add to position'}
        </button>
      </div>
    {/if}

    <!-- Q1: Macro Calendar (Manual) -->
    <label class="flex items-start gap-3 p-3 rounded-lg bg-surface-700/50 hover:bg-surface-700 transition-colors cursor-pointer">
      <input
        type="checkbox"
        class="mt-0.5 w-4 h-4 rounded border-border accent-bull-strong"
        checked={checklist.macroChecked}
        onchange={(e) => setMacroChecked(symbol, e.target.checked)}
      />
      <div>
        <p class="text-sm text-text-primary">Have you checked today's macro calendar?</p>
        <a href="https://www.forexfactory.com/calendar" target="_blank" rel="noopener"
          class="text-xs text-uncertain hover:underline mt-0.5 inline-block">
          Open economic calendar ↗
        </a>
      </div>
    </label>

    <!-- Q2: Earnings (Auto / Manual fallback) -->
    <div class="p-3 rounded-lg bg-surface-700/50">
      {#if checklist.autoAnswerFailed.earnings}
        <!-- Fallback to manual -->
        <div class="flex items-start gap-3">
          <span class="text-warning text-sm mt-0.5">⚠</span>
          <div class="flex-1">
            <p class="text-sm text-warning">Could not verify earnings automatically</p>
            <label class="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                class="w-4 h-4 rounded border-border accent-bull-strong"
                checked={checklist.earningsAnswer === 'manual'}
                onchange={(e) => setManualEarnings(symbol, e.target.checked)}
              />
              <span class="text-sm text-text-primary">I confirm no earnings in the next 14 days</span>
            </label>
          </div>
        </div>
      {:else if checklist.earningsAnswer === null}
        <div class="flex items-center gap-3">
          {#if isRefreshing()}
            <div class="w-4 h-4 border-2 border-neutral border-t-transparent rounded-full animate-spin"></div>
            <p class="text-sm text-text-muted">Checking earnings calendar...</p>
          {:else}
            <span class="text-text-muted">○</span>
            <p class="text-sm text-text-muted">Hit <strong>Refresh</strong> to check earnings calendar</p>
          {/if}
        </div>
      {:else if checklist.earningsAnswer === true}
        <div class="flex items-center gap-3">
          <span class="text-bull-strong">✓</span>
          <p class="text-sm text-text-primary">No earnings in the next 14 days</p>
          <span class="text-xs bg-surface-600 text-text-muted px-1.5 py-0.5 rounded ml-auto">Auto</span>
        </div>
      {:else}
        <div class="flex items-center gap-3">
          <span class="text-warning">⚠</span>
          <p class="text-sm text-warning">Earnings within 14 days — limited trade window</p>
          <span class="text-xs bg-surface-600 text-text-muted px-1.5 py-0.5 rounded ml-auto">Auto</span>
        </div>
      {/if}
    </div>

    <!-- Q3: Sector trend (Auto / Manual fallback) OR Q3-ACC: Accumulation cost -->
    <div class="p-3 rounded-lg bg-surface-700/50">
      {#if checklist.accumulation}
        <!-- Q3-ACC: Adding at worse average cost? -->
        <label class="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            class="mt-0.5 w-4 h-4 rounded border-border accent-bull-strong"
            checked={checklist.accCostConfirmed}
            onchange={(e) => setAccCostConfirmed(symbol, e.target.checked)}
          />
          <div>
            <p class="text-sm text-text-primary">I confirm I am NOT adding at a worse average cost</p>
            <p class="text-xs text-text-muted mt-0.5">Check your current avg cost before adding to this position</p>
          </div>
        </label>
      {:else if checklist.autoAnswerFailed.sector}
        <!-- Fallback to manual -->
        <div class="flex items-start gap-3">
          <span class="text-warning text-sm mt-0.5">⚠</span>
          <div class="flex-1">
            <p class="text-sm text-warning">Could not verify sector trend automatically</p>
            <label class="flex items-center gap-2 mt-2 cursor-pointer">
              <input
                type="checkbox"
                class="w-4 h-4 rounded border-border accent-bull-strong"
                checked={checklist.sectorAnswer === 'manual'}
                onchange={(e) => setManualSector(symbol, e.target.checked)}
              />
              <span class="text-sm text-text-primary">I confirm the sector is not in a downtrend</span>
            </label>
          </div>
        </div>
      {:else if checklist.sectorAnswer === null}
        <div class="flex items-center gap-3">
          {#if isRefreshing()}
            <div class="w-4 h-4 border-2 border-neutral border-t-transparent rounded-full animate-spin"></div>
            <p class="text-sm text-text-muted">Checking sector trend...</p>
          {:else}
            <span class="text-text-muted">○</span>
            <p class="text-sm text-text-muted">Hit <strong>Refresh</strong> to check sector trend</p>
          {/if}
        </div>
      {:else if checklist.sectorAnswer === true}
        <div class="flex items-center gap-3">
          <span class="text-bull-strong">✓</span>
          <p class="text-sm text-text-primary">Sector is not in a downtrend</p>
          <span class="text-xs bg-surface-600 text-text-muted px-1.5 py-0.5 rounded ml-auto">Auto</span>
        </div>
      {:else}
        <div class="flex items-center gap-3">
          <span class="text-bear-weak">↓</span>
          <p class="text-sm text-bear-weak">Sector is in a downtrend — proceed with caution</p>
          <span class="text-xs bg-surface-600 text-text-muted px-1.5 py-0.5 rounded ml-auto">Auto</span>
        </div>
      {/if}
    </div>

    <!-- Q4: Stop-loss (Manual — the unlock key) -->
    <div class="p-3 rounded-lg bg-surface-700/50">
      <label class="block">
        <p class="text-sm text-text-primary mb-2">What is your stop-loss level?</p>
        <div class="flex items-center gap-2">
          <span class="text-text-muted">$</span>
          <input
            type="text"
            placeholder="e.g. 142.50"
            class="flex-1 bg-surface-600 border border-border rounded px-3 py-2 text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50 transition-colors"
            value={checklist.stopLoss}
            oninput={(e) => setStopLoss(symbol, e.target.value)}
          />
        </div>
        <p class="text-xs text-text-muted mt-1.5">This is the key — you cannot see your reward until you've committed to your risk.</p>
      </label>
    </div>
  {/if}
</div>

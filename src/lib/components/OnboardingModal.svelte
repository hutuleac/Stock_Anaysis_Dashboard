<script>
  import { getApiKey, setApiKey } from '../api/finnhub.svelte.js';

  let { onComplete } = $props();

  let apiKeyInput = $state('');
  let error = $state('');

  function handleSave() {
    const key = apiKeyInput.trim();
    if (!key) {
      error = 'Please enter your API key';
      return;
    }
    setApiKey(key);
    onComplete();
  }
</script>

<div class="fixed inset-0 bg-black/70 z-50 backdrop-blur-sm flex items-center justify-center p-4">
  <div class="bg-surface-800 border border-border rounded-xl max-w-md w-full p-8 shadow-2xl">
    <div class="text-center mb-6">
      <div class="text-4xl mb-3">📊</div>
      <h1 class="text-xl font-bold text-text-primary mb-2">Stock Analysis Dashboard</h1>
      <p class="text-sm text-text-secondary">Decision quality over information density.</p>
    </div>

    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium text-text-secondary mb-1">Finnhub API Key</label>
        <input
          type="text"
          placeholder="Paste your key here"
          class="w-full bg-surface-700 border border-border rounded-lg px-4 py-3 text-text-primary font-mono text-sm placeholder:text-text-muted focus:outline-none focus:border-bull-strong/50 transition-colors"
          bind:value={apiKeyInput}
          onkeydown={(e) => e.key === 'Enter' && handleSave()}
        />
        {#if error}
          <p class="text-xs text-danger mt-1">{error}</p>
        {/if}
        <p class="text-xs text-text-muted mt-2">
          Get a free key at <a href="https://finnhub.io/register" target="_blank" rel="noopener" class="text-uncertain hover:underline">finnhub.io/register</a> — takes 30 seconds.
        </p>
      </div>

      <button
        class="w-full py-3 bg-bull-strong text-surface-900 font-bold rounded-lg hover:brightness-110 transition text-sm"
        onclick={handleSave}
      >
        Get Started
      </button>
    </div>
  </div>
</div>

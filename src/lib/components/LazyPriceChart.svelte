<script module>
  // Code-split: PriceChart + lightweight-charts are ~half the bundle and only
  // needed once a row is expanded. One shared import, fetched on first use.
  let chart;
  const loadChart = () => (chart ??= import('./PriceChart.svelte'));
</script>

<script>
  let props = $props();
</script>

{#await loadChart()}
  <div style="height:300px"></div>
{:then { default: PriceChart }}
  <PriceChart {...props} />
{/await}

// Global tooltip state — shared across all components via portal pattern.
// TooltipOverlay in App.svelte reads this; tooltip.js action writes it.

let tip = $state({ visible: false, content: null, x: 0, y: 0 });

export function getTooltip() { return tip; }

export function showTooltip(content, x, y) {
  tip.visible = true;
  tip.content = content;
  tip.x = x;
  tip.y = y;
}

export function moveTooltip(x, y) {
  tip.x = x;
  tip.y = y;
}

export function hideTooltip() {
  tip.visible = false;
}

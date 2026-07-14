// Svelte action: use:tooltip={def} or use:tooltip={() => def}
// Desktop: hover (mouseenter/mousemove/mouseleave).
// Touch: tap toggles, triggered from touchend.
// Accepts a plain object or a getter function (evaluated lazily).

import { getTooltip, showTooltip, moveTooltip, hideTooltip } from '../stores/tooltip.svelte.js';

let openedBy = null;

export function tooltip(node, getDef) {
  function resolve() {
    return typeof getDef === 'function' ? getDef() : getDef;
  }

  // ---- Desktop: hover ----
  function onEnter(e) {
    const content = resolve();
    if (content) showTooltip(content, e.clientX, e.clientY);
  }
  function onMove(e) { moveTooltip(e.clientX, e.clientY); }
  function onLeave() { hideTooltip(); }

  // ---- Touch: tap toggles ----
  // iOS Safari does NOT synthesize `click` on plain (cursor-default) divs, so a
  // real finger tap never reached a click handler — which is why click AND the
  // synthesized hover both did nothing on iPhone. `touchend` fires on every
  // element regardless of "clickability", so we trigger from it directly.
  // A small movement guard distinguishes a tap from a scroll; preventDefault
  // suppresses the ghost mouse/click sequence that would otherwise re-fire and
  // toggle the tooltip shut the same instant it opened.
  let startX = 0, startY = 0;
  function onTouchStart(e) {
    const t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY;
  }
  function onTouchEnd(e) {
    const t = e.changedTouches[0];
    if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) return; // scrolled — not a tap
    e.preventDefault();
    e.stopPropagation();
    if (getTooltip().visible && openedBy === node) { hideTooltip(); openedBy = null; return; }
    const content = resolve();
    if (content) { showTooltip(content, t.clientX, t.clientY); openedBy = node; }
  }

  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mousemove', onMove);
  node.addEventListener('mouseleave', onLeave);
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchend', onTouchEnd, { passive: false });

  return {
    update(newDef) { getDef = newDef; },
    destroy() {
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mousemove', onMove);
      node.removeEventListener('mouseleave', onLeave);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchend', onTouchEnd);
      if (openedBy === node) openedBy = null;
      hideTooltip();
    },
  };
}

// Svelte action: use:tooltip={def} or use:tooltip={() => def}
// Attaches mouseenter/mousemove/mouseleave to any element.
// Accepts a plain object or a getter function (evaluated lazily on hover).

import { getTooltip, showTooltip, moveTooltip, hideTooltip } from '../stores/tooltip.svelte.js';

let openedBy = null;

export function tooltip(node, getDef) {
  function resolve() {
    return typeof getDef === 'function' ? getDef() : getDef;
  }

  function onEnter(e) {
    const content = resolve();
    if (content) showTooltip(content, e.clientX, e.clientY);
  }

  function onMove(e) {
    moveTooltip(e.clientX, e.clientY);
  }

  function onLeave() {
    hideTooltip();
  }

  // Touch devices get no mouseenter (or an unreliable synthesized one).
  // A tap toggles the tooltip; stopPropagation keeps a chip inside a
  // clickable card from also toggling the card. Hover-capable devices
  // are untouched — checked per-event so responsive-mode changes apply.
  function onTap(e) {
    if (typeof matchMedia === 'undefined' || !matchMedia('(hover: none)').matches) return;
    e.stopPropagation();
    if (getTooltip().visible && openedBy === node) { hideTooltip(); openedBy = null; return; }
    const content = resolve();
    if (content) { showTooltip(content, e.clientX, e.clientY); openedBy = node; }
  }

  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mousemove', onMove);
  node.addEventListener('mouseleave', onLeave);
  node.addEventListener('click', onTap);

  return {
    update(newDef) { getDef = newDef; },
    destroy() {
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mousemove', onMove);
      node.removeEventListener('mouseleave', onLeave);
      node.removeEventListener('click', onTap);
      if (openedBy === node) openedBy = null;
      hideTooltip();
    },
  };
}

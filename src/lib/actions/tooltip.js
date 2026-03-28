// Svelte action: use:tooltip={def} or use:tooltip={() => def}
// Attaches mouseenter/mousemove/mouseleave to any element.
// Accepts a plain object or a getter function (evaluated lazily on hover).

import { showTooltip, moveTooltip, hideTooltip } from '../stores/tooltip.svelte.js';

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

  node.addEventListener('mouseenter', onEnter);
  node.addEventListener('mousemove', onMove);
  node.addEventListener('mouseleave', onLeave);

  return {
    update(newDef) { getDef = newDef; },
    destroy() {
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mousemove', onMove);
      node.removeEventListener('mouseleave', onLeave);
      hideTooltip();
    },
  };
}

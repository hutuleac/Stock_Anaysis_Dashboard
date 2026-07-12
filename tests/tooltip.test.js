import { describe, it, expect, vi, beforeEach } from 'vitest';

// Node env: stub matchMedia BEFORE importing the action (cache.test.js convention).
let coarse = true;
vi.stubGlobal('matchMedia', (q) => ({ matches: q === '(hover: none)' ? coarse : false }));

const { tooltip } = await import('../src/lib/actions/tooltip.js');
const { getTooltip, hideTooltip } = await import('../src/lib/stores/tooltip.svelte.js');

// Minimal stub node capturing listeners — the action only needs add/removeEventListener.
function makeNode() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type) => { delete listeners[type]; },
    fire: (type, event) => listeners[type]?.(event),
    has: (type) => !!listeners[type],
  };
}
const DEF = { title: 'RSI', body: 'momentum' };
function tapEvent() {
  return { clientX: 10, clientY: 20, stopPropagation: vi.fn() };
}

beforeEach(() => { hideTooltip(); coarse = true; });

describe('tooltip action — touch', () => {
  it('tap on coarse pointer shows the tooltip at tap coords and stops propagation', () => {
    const node = makeNode();
    tooltip(node, DEF);
    const e = tapEvent();
    node.fire('click', e);
    const tip = getTooltip();
    expect(tip.visible).toBe(true);
    expect(tip.content).toEqual(DEF);
    expect(tip.x).toBe(10);
    expect(tip.y).toBe(20);
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('second tap toggles the tooltip closed', () => {
    const node = makeNode();
    tooltip(node, DEF);
    node.fire('click', tapEvent());
    node.fire('click', tapEvent());
    expect(getTooltip().visible).toBe(false);
  });

  it('tap does nothing on fine-pointer (hover-capable) devices', () => {
    coarse = false;
    const node = makeNode();
    tooltip(node, DEF);
    const e = tapEvent();
    node.fire('click', e);
    expect(getTooltip().visible).toBe(false);
    expect(e.stopPropagation).not.toHaveBeenCalled();
  });

  it('resolves getter defs lazily on tap', () => {
    const node = makeNode();
    tooltip(node, () => ({ title: 'lazy' }));
    node.fire('click', tapEvent());
    expect(getTooltip().content).toEqual({ title: 'lazy' });
  });

  it('null def is a no-op on tap', () => {
    const node = makeNode();
    tooltip(node, null);
    node.fire('click', tapEvent());
    expect(getTooltip().visible).toBe(false);
  });

  it('mouseenter still shows the tooltip (desktop path unchanged)', () => {
    const node = makeNode();
    tooltip(node, DEF);
    node.fire('mouseenter', { clientX: 1, clientY: 2 });
    expect(getTooltip().visible).toBe(true);
  });

  it('destroy removes the click listener and hides', () => {
    const node = makeNode();
    const action = tooltip(node, DEF);
    action.destroy();
    expect(node.has('click')).toBe(false);
    expect(getTooltip().visible).toBe(false);
  });

  it('tapping a second element replaces the open tooltip in one tap (no dead tap)', () => {
    const nodeA = makeNode();
    const nodeB = makeNode();
    tooltip(nodeA, { title: 'A' });
    tooltip(nodeB, { title: 'B' });
    nodeA.fire('click', tapEvent());
    nodeB.fire('click', tapEvent());
    const tip = getTooltip();
    expect(tip.visible).toBe(true);
    expect(tip.content).toEqual({ title: 'B' });
  });

  it('reopens after an external close without a stale openedBy blocking it', () => {
    const node = makeNode();
    tooltip(node, DEF);
    node.fire('click', tapEvent());
    hideTooltip();
    node.fire('click', tapEvent());
    expect(getTooltip().visible).toBe(true);
  });
});

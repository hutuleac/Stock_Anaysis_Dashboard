import { describe, it, expect, vi, beforeEach } from 'vitest';

const { tooltip } = await import('../src/lib/actions/tooltip.js');
const { getTooltip, hideTooltip } = await import('../src/lib/stores/tooltip.svelte.js');

// Minimal stub node capturing listeners — the action only needs add/removeEventListener.
function makeNode() {
  const listeners = {};
  return {
    style: {},
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type) => { delete listeners[type]; },
    fire: (type, event) => listeners[type]?.(event),
    has: (type) => !!listeners[type],
  };
}
const DEF = { title: 'RSI', body: 'momentum' };
function touch(x = 10, y = 20) {
  return { changedTouches: [{ clientX: x, clientY: y }], preventDefault: vi.fn(), stopPropagation: vi.fn() };
}
function tap(node, x = 10, y = 20) {
  node.fire('touchstart', touch(x, y));
  const end = touch(x, y);
  node.fire('touchend', end);
  return end;
}

beforeEach(() => { hideTooltip(); });

describe('tooltip action — touch', () => {
  it('tap shows the tooltip at tap coords, prevents the ghost click, stops propagation', () => {
    const node = makeNode();
    tooltip(node, DEF);
    const e = tap(node);
    const tip = getTooltip();
    expect(tip.visible).toBe(true);
    expect(tip.content).toEqual(DEF);
    expect(tip.x).toBe(10);
    expect(tip.y).toBe(20);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  it('second tap toggles the tooltip closed', () => {
    const node = makeNode();
    tooltip(node, DEF);
    tap(node);
    tap(node);
    expect(getTooltip().visible).toBe(false);
  });

  it('a scroll (touch moved past threshold) does not open the tooltip', () => {
    const node = makeNode();
    tooltip(node, DEF);
    node.fire('touchstart', touch(10, 20));
    node.fire('touchend', touch(10, 200)); // moved 180px — a scroll, not a tap
    expect(getTooltip().visible).toBe(false);
  });

  it('resolves getter defs lazily on tap', () => {
    const node = makeNode();
    tooltip(node, () => ({ title: 'lazy' }));
    tap(node);
    expect(getTooltip().content).toEqual({ title: 'lazy' });
  });

  it('null def is a no-op on tap', () => {
    const node = makeNode();
    tooltip(node, null);
    tap(node);
    expect(getTooltip().visible).toBe(false);
  });

  it('mouseenter still shows the tooltip (desktop path unchanged)', () => {
    const node = makeNode();
    tooltip(node, DEF);
    node.fire('mouseenter', { clientX: 1, clientY: 2 });
    expect(getTooltip().visible).toBe(true);
  });

  it('destroy removes the touch listeners and hides', () => {
    const node = makeNode();
    const action = tooltip(node, DEF);
    action.destroy();
    expect(node.has('touchend')).toBe(false);
    expect(node.has('touchstart')).toBe(false);
    expect(getTooltip().visible).toBe(false);
  });

  it('tapping a second element replaces the open tooltip in one tap (no dead tap)', () => {
    const nodeA = makeNode();
    const nodeB = makeNode();
    tooltip(nodeA, { title: 'A' });
    tooltip(nodeB, { title: 'B' });
    tap(nodeA);
    tap(nodeB);
    const tip = getTooltip();
    expect(tip.visible).toBe(true);
    expect(tip.content).toEqual({ title: 'B' });
  });

  it('reopens after an external close without a stale openedBy blocking it', () => {
    const node = makeNode();
    tooltip(node, DEF);
    tap(node);
    hideTooltip();
    tap(node);
    expect(getTooltip().visible).toBe(true);
  });
});

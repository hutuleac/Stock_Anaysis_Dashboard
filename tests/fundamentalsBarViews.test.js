import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The Trend/Pullback playbook toggle filters cards by string key. A key typo in
// either the markup or the membership sets hides a card from that tab forever and
// is invisible until someone notices the card is gone — so assert the two sides match.
const src = readFileSync(new URL('../src/lib/components/FundamentalsBar.svelte', import.meta.url), 'utf8');

const setKeys = (name) => {
  const m = src.match(new RegExp(`${name}:?\\s*=?\\s*new Set\\(\\[([^\\]]*)\\]`));
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
};

const core     = setKeys('CORE');
const trend    = setKeys('trend');
const pullback = setKeys('pullback');
const used     = [...src.matchAll(/show\('([^']+)'\)/g)].map(m => m[1]);

describe('FundamentalsBar playbook views', () => {
  it('every card key is declared in CORE, trend, or pullback', () => {
    const declared = new Set([...core, ...trend, ...pullback]);
    expect(used.filter(k => !declared.has(k))).toEqual([]);
  });

  it('every declared key is actually rendered by a card', () => {
    expect([...core, ...trend, ...pullback].filter(k => !used.includes(k))).toEqual([]);
  });

  it('no card key is duplicated across cards', () => {
    expect(used.length).toBe(new Set(used).size);
  });

  it('core keys are not repeated in the playbook sets', () => {
    expect([...core].filter(k => trend.has(k) || pullback.has(k))).toEqual([]);
  });

  it('both playbooks show a meaningful number of cards', () => {
    expect(core.size + trend.size).toBeGreaterThanOrEqual(8);
    expect(core.size + pullback.size).toBeGreaterThanOrEqual(8);
  });
});

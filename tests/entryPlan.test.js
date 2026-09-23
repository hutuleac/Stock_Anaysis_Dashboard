import { describe, it, expect } from 'vitest';
import { entryPlan } from '../src/lib/entryPlan.js';

describe('entryPlan', () => {
  it('stop is entry − 2× weekly ATR, R:R to the swing-high target', () => {
    const p = entryPlan({ price: 100, weeklyAtr: 4, target: 116 });
    expect(p.stop).toBe(92);
    expect(p.stopPct).toBeCloseTo(-8);
    expect(p.targetPct).toBeCloseTo(16);
    expect(p.rr).toBeCloseTo(2);
    expect(p.levels.map(l => [l.key, l.price])).toEqual([
      ['stop', 92], ['entry', 100], ['1R', 108], ['2R', 116], ['3R', 124], ['target', 116],
    ]);
  });

  it('ladder spans stop → max(3R, target), positions are 0–100%', () => {
    const p = entryPlan({ price: 100, weeklyAtr: 4, target: 140 });
    const pos = Object.fromEntries(p.levels.map(l => [l.key, l.pos]));
    expect(pos.stop).toBe(0);
    expect(pos.target).toBe(100);
    expect(pos.entry).toBeCloseTo((8 / 48) * 100);
  });

  it('drops a target at or below entry (no upside = no R:R)', () => {
    const p = entryPlan({ price: 100, weeklyAtr: 4, target: 95 });
    expect(p.target).toBeNull();
    expect(p.rr).toBeNull();
    expect(p.levels.find(l => l.key === 'target')).toBeUndefined();
    expect(p.levels.at(-1).pos).toBe(100); // 3R is the right edge
  });

  it('returns null without price or ATR', () => {
    expect(entryPlan({ price: null, weeklyAtr: 4 })).toBeNull();
    expect(entryPlan({ price: 100, weeklyAtr: null })).toBeNull();
    expect(entryPlan({ price: 100, weeklyAtr: 60 })).toBeNull(); // stop would be ≤ 0
  });
});

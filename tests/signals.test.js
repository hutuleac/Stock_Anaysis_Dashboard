import { describe, it, expect } from 'vitest';
import { findSwingPivots } from '../src/lib/signals.js';

describe('findSwingPivots', () => {
  it('returns [] for arrays shorter than 2*pivotBars+1', () => {
    expect(findSwingPivots([1, 2, 3], 2, 'high')).toEqual([]);
  });

  it('detects a swing high', () => {
    // index 2 (value 5) is >= its 2 neighbors each side
    const pivots = findSwingPivots([1, 3, 5, 3, 1], 2, 'high');
    expect(pivots).toContainEqual({ index: 2, value: 5 });
  });

  it('detects a swing low', () => {
    const pivots = findSwingPivots([9, 7, 2, 7, 9], 2, 'low');
    expect(pivots).toContainEqual({ index: 2, value: 2 });
  });

  it('respects pivotBars window (no pivot near edges)', () => {
    const pivots = findSwingPivots([5, 4, 3, 2, 1], 2, 'high');
    // index 0 has no left neighbors; never a pivot
    expect(pivots.every(p => p.index >= 2 && p.index <= 2)).toBe(true);
  });
});

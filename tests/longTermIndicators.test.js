import { describe, it, expect } from 'vitest';
import { timingChips, qualityChips, chipColor } from '../src/lib/longTermIndicators.js';

describe('timingChips', () => {
  it('returns all six timing components in display order', () => {
    const chips = timingChips({ drawdown: 12, oversold: 6, reversal: 8, consolidation: 5, volumeBehavior: 6, marketContext: 3 });
    expect(chips.map(c => c.label)).toEqual(['Drawdown', 'Oversold', 'Reversal', 'Base', 'Volume', 'Market']);
    expect(chips.map(c => c.max)).toEqual([20, 20, 20, 15, 15, 10]);
    expect(chips[0].score).toBe(12);
  });

  it('maps a missing/non-finite component to null (distinct from 0)', () => {
    const chips = timingChips({ drawdown: 0, oversold: null });
    expect(chips.find(c => c.key === 'drawdown').score).toBe(0);
    expect(chips.find(c => c.key === 'oversold').score).toBeNull();
    expect(chips.find(c => c.key === 'reversal').score).toBeNull(); // absent key
  });

  it('handles a null/undefined components object', () => {
    expect(timingChips(null).every(c => c.score === null)).toBe(true);
  });
});

describe('qualityChips', () => {
  it('returns all five quality components with correct maxes', () => {
    const chips = qualityChips({ profitability: 18, cashFlow: 12, balanceSheet: 20, shareholderReturn: 6, earningsQuality: 7 });
    expect(chips.map(c => c.label)).toEqual(['Profit', 'Cash', 'Balance', 'Payout', 'Earnings']);
    expect(chips.map(c => c.max)).toEqual([30, 25, 25, 10, 10]);
  });
});

describe('chipColor', () => {
  it('greens a high fill, ambers a mid fill, greys a low fill', () => {
    expect(chipColor(18, 20)).toBe('#22c55e'); // 0.9
    expect(chipColor(8, 20)).toBe('#f59e0b');  // 0.4
    expect(chipColor(2, 20)).toBe('#9ca3af');  // 0.1
  });
  it('greys a null score or missing max regardless', () => {
    expect(chipColor(null, 20)).toBe('#6b7280');
    expect(chipColor(10, 0)).toBe('#6b7280');
  });
});

import { describe, it, expect } from 'vitest';
import { timingChips, qualityChips, chipColor, chipTone, chipStyle, statusTone, timingTone, qualityTone, timingHint, qualityHint, waitingOn, qualityWaitingOn } from '../src/lib/longTermIndicators.js';
import { TIMING_MAX } from '../src/lib/timingScore.js';

describe('timingChips', () => {
  it('returns all six timing components in display order', () => {
    const chips = timingChips({ drawdown: 12, oversold: 6, reversal: 8, consolidation: 5, volumeBehavior: 6, marketContext: 3 });
    expect(chips.map(c => c.label)).toEqual(['Drawdown', 'Oversold', 'Reversal', 'Base', 'Volume', 'Market']);
    expect(chips.map(c => c.max)).toEqual([20, 20, 15, 15, 15, 15]);
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
    expect(chipColor(2, 20)).toBe('#94a3b8');  // 0.1 — theme neutral slate
  });
  it('greys a null score or missing max regardless', () => {
    expect(chipColor(null, 20)).toBe('#6b7280');
    expect(chipColor(10, 0)).toBe('#6b7280');
  });
});

// The chip maxes are the only place the UI states a component's ceiling. When
// the regime round moved reversal 20→15 and market 10→15 in the engine, these
// went stale and the Market chip could render "14/10". Timing now imports the
// engine's caps; this guards the quality mirror and both totals.
describe('chip maxes mirror the score engines', () => {
  it('timing chip maxes are the engine caps and sum to 100', () => {
    const chips = timingChips({});
    expect(chips.map(c => c.max)).toEqual([
      TIMING_MAX.drawdown, TIMING_MAX.oversold, TIMING_MAX.reversal,
      TIMING_MAX.consolidation, TIMING_MAX.volumeBehavior, TIMING_MAX.marketContext,
    ]);
    expect(chips.reduce((s, c) => s + c.max, 0)).toBe(100);
  });

  it('quality chip maxes sum to 100', () => {
    expect(qualityChips({}).reduce((s, c) => s + c.max, 0)).toBe(100);
  });
});

describe('colour coding', () => {
  it('chipTone separates a real zero from a missing component', () => {
    expect(chipTone(0, 20)).toBe('waiting');   // scored zero — information
    expect(chipTone(null, 20)).toBe('none');   // no input — not information
  });

  it('chipTone ramps good / partial / waiting by fill ratio', () => {
    expect(chipTone(15, 20)).toBe('good');      // 75%
    expect(chipTone(12, 20)).toBe('good');      // 60% — boundary
    expect(chipTone(8, 20)).toBe('partial');    // 40%
    expect(chipTone(6, 20)).toBe('partial');    // 30% — boundary
    expect(chipTone(5, 20)).toBe('waiting');    // 25%
  });

  it('chipStyle pairs the tone colour with a matching tint', () => {
    expect(chipStyle(15, 20)).toBe('color:#22c55e;background:rgba(34, 197, 94, 0.12)');
  });

  it('statusTone gives ACCUMULATE, WATCHLIST and CHECK-QUALITY distinct tones', () => {
    expect(statusTone('ACCUMULATE')).toBe('good');
    expect(statusTone('WATCHLIST')).toBe('partial');
    expect(statusTone('OVERSOLD_BUT_CAUTION')).toBe('caution');
    expect(statusTone('WAIT')).toBe('waiting');
    expect(statusTone('INSUFFICIENT_DATA')).toBe('none');
    expect(statusTone('SOMETHING_NEW')).toBe('none');
  });

  it('totals are toned by the gate bands, not the generic fill ratio', () => {
    expect(timingTone(70)).toBe('good');
    expect(timingTone(50)).toBe('partial');
    expect(timingTone(49)).toBe('waiting');
    expect(timingTone(null)).toBe('none');
    expect(qualityTone(65)).toBe('good');
    expect(qualityTone(60)).toBe('partial');   // above the ≥60 gate
    expect(qualityTone(59)).toBe('caution');   // below it — value-trap risk
  });
});

describe('band hints', () => {
  it('names the points needed to reach the next band', () => {
    expect(timingHint(42)).toBe('8 pts to watchlist timing (50+)');
    expect(timingHint(55)).toBe('15 pts to strong timing (70+)');
    expect(qualityHint(62)).toBe('3 pts to good quality (65+)');
    expect(qualityHint(50)).toBe('10 pts to the quality gate (60+)');
  });

  it('returns null at the top band and with no score', () => {
    expect(timingHint(70)).toBeNull();
    expect(timingHint(88)).toBeNull();
    expect(qualityHint(75)).toBeNull();
    expect(timingHint(null)).toBeNull();
  });
});

describe('waitingOn', () => {
  const components = { drawdown: 4, oversold: 2, reversal: 15, consolidation: 5, volumeBehavior: null, marketContext: 9 };

  it('ranks components by the points still on the table', () => {
    expect(waitingOn(components).map(c => `${c.label} +${c.gap}`))
      .toEqual(['Oversold +18', 'Drawdown +16', 'Base +10']);
  });

  it('qualityWaitingOn ranks the quality components the same way', () => {
    expect(qualityWaitingOn({ profitability: 4, cashFlow: null, balanceSheet: 0, shareholderReturn: 2, earningsQuality: 10 }).map(c => `${c.label} +${c.gap}`))
      .toEqual(['Profit +26', 'Balance +25', 'Payout +8']);
  });

  it('skips maxed and missing components', () => {
    const keys = waitingOn(components, 10).map(c => c.key);
    expect(keys).not.toContain('reversal');        // 15/15 — nothing to wait for
    expect(keys).not.toContain('volumeBehavior');  // null — nothing is known
  });

  it('reports the gap size and respects the limit', () => {
    expect(waitingOn(components, 1)).toHaveLength(1);
    expect(waitingOn(components, 1)[0].gap).toBe(18);
    expect(waitingOn({})).toEqual([]);
  });
});

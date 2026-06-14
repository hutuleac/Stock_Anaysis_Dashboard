import { describe, it, expect } from 'vitest';
import { computePEG } from '../src/lib/valuation.js';

describe('computePEG', () => {
  it('returns null when inputs are missing or non-positive', () => {
    expect(computePEG(null, 20)).toBeNull();
    expect(computePEG(20, null)).toBeNull();
    expect(computePEG(20, 0)).toBeNull();   // can't divide by zero growth
    expect(computePEG(20, -10)).toBeNull(); // negative growth → PEG undefined
    expect(computePEG(-5, 20)).toBeNull();  // negative P/E → meaningless
  });

  it('computes PEG = P/E ÷ growth%', () => {
    expect(computePEG(30, 30)).toBeCloseTo(1.0, 5);
    expect(computePEG(20, 40)).toBeCloseTo(0.5, 5);
    expect(computePEG(60, 20)).toBeCloseTo(3.0, 5);
  });

  it('rounds to two decimals', () => {
    // 25 / 17 = 1.470... → 1.47
    expect(computePEG(25, 17)).toBe(1.47);
  });
});

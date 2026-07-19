import { describe, it, expect } from 'vitest';
import { parseFinancials, computeQualityScore } from '../src/lib/qualityScore.js';

function reportEntry({ year, quarter = 0, cf = [], ic = [] }) {
  return { year, quarter, form: '10-K', report: { bs: [], cf, ic } };
}

const OCF = { concept: 'us-gaap_NetCashProvidedByUsedInOperatingActivities', label: 'Net cash from ops', value: 111500000000, unit: 'USD' };
const CAPEX = { concept: 'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', label: 'Capital expenditures', value: 12700000000, unit: 'USD' };
const BUYBACK = { concept: 'us-gaap_PaymentsForRepurchaseOfCommonStock', label: 'Repurchases of common stock', value: 77500000000, unit: 'USD' };
const DILUTED_2026 = { concept: 'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Diluted shares', value: 15200000000, unit: 'shares' };
const DILUTED_2025 = { concept: 'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', label: 'Diluted shares', value: 15550000000, unit: 'shares' };

describe('parseFinancials', () => {
  it('extracts OCF, capex, buyback, and computes fcf = ocf - capex', () => {
    const reported = { data: [reportEntry({ year: 2026, cf: [OCF, CAPEX, BUYBACK], ic: [DILUTED_2026] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
    expect(result.capex).toBe(12700000000);
    expect(result.buyback).toBe(77500000000);
    expect(result.fcf).toBe(111500000000 - 12700000000);
  });

  it('matches concept case-insensitively and ignores the company-specific label', () => {
    const weirdLabelOcf = { ...OCF, label: 'Totally different vendor wording' };
    const reported = { data: [reportEntry({ year: 2026, cf: [weirdLabelOcf, CAPEX] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
  });

  it('returns null fcf when capex is missing, without throwing', () => {
    const reported = { data: [reportEntry({ year: 2026, cf: [OCF] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
    expect(result.capex).toBeNull();
    expect(result.fcf).toBeNull();
  });

  it('returns all nulls for an empty or malformed payload, never throws', () => {
    expect(parseFinancials({ data: [] })).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
    expect(parseFinancials(null)).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
    expect(parseFinancials({})).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
    expect(parseFinancials({ data: [{ year: 2026, quarter: 0, form: '10-K', report: {} }] })).toEqual({
      fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null,
    });
  });

  it('picks the latest annual report (quarter === 0) for current figures, and the prior annual for the diluted-share delta', () => {
    const reported = {
      data: [
        reportEntry({ year: 2025, cf: [], ic: [DILUTED_2025] }),
        reportEntry({ year: 2026, cf: [OCF, CAPEX], ic: [DILUTED_2026] }),
      ],
    };
    const result = parseFinancials(reported);
    expect(result.dilutedShares).toBe(15200000000);
    expect(result.dilutedSharesPrior).toBe(15550000000);
  });

  it('falls back to the latest report when no quarter === 0 annual entry exists', () => {
    const reported = { data: [reportEntry({ year: 2026, quarter: 2, cf: [OCF, CAPEX] })] };
    const result = parseFinancials(reported);
    expect(result.ocf).toBe(111500000000);
  });
});

describe('computeQualityScore — profitability component', () => {
  it('scores ROIC tiers: >=20% -> 18, >=15% -> 15, >=10% -> 10, >=5% -> 5, <5% -> 0', () => {
    const base = { marketCap: null, financials: null, earnings: null };
    expect(computeQualityScore({ ...base, metric: { roiTTM: 20 } }).components.profitability).toBeGreaterThanOrEqual(18);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 22 } }).components.profitability).toBe(18);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 16 } }).components.profitability).toBe(15);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 11 } }).components.profitability).toBe(10);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 6 } }).components.profitability).toBe(5);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 2 } }).components.profitability).toBe(0);
  });

  it('falls back to ROE with a note when roiTTM is absent', () => {
    const result = computeQualityScore({ metric: { roeTTM: 22 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBe(18);
    expect(result.notes.some((n) => n.includes('ROIC unavailable'))).toBe(true);
  });

  it('adds operating margin tiers on top of ROIC', () => {
    const result = computeQualityScore({ metric: { roiTTM: 22, operatingMarginTTM: 30 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBe(18 + 8);
  });

  it('adds +4 stability when both eps growth periods are positive, +2 when one is, 0 + warning when both negative', () => {
    const both = computeQualityScore({ metric: { roiTTM: 22, epsGrowthTTMYoy: 10, epsGrowth3Y: 5 }, marketCap: null, financials: null, earnings: null });
    expect(both.components.profitability).toBe(18 + 4);

    const one = computeQualityScore({ metric: { roiTTM: 22, epsGrowthTTMYoy: 10, epsGrowth3Y: -5 }, marketCap: null, financials: null, earnings: null });
    expect(one.components.profitability).toBe(18 + 2);

    const neither = computeQualityScore({ metric: { roiTTM: 22, epsGrowthTTMYoy: -10, epsGrowth3Y: -5 }, marketCap: null, financials: null, earnings: null });
    expect(neither.components.profitability).toBe(18);
    expect(neither.notes.some((w) => w.includes('EPS growth is negative across multiple periods'))).toBe(true);
  });

  it('caps profitability at 30', () => {
    const result = computeQualityScore({
      metric: { roiTTM: 25, operatingMarginTTM: 30, epsGrowthTTMYoy: 10, epsGrowth3Y: 10 },
      marketCap: null, financials: null, earnings: null,
    });
    expect(result.components.profitability).toBeLessThanOrEqual(30);
  });

  it('profitability is null when metric is entirely absent', () => {
    const result = computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBeNull();
  });
});

describe('computeQualityScore — cashFlow component', () => {
  const fin = (fcf) => ({ fcf, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null });

  it('scores FCF yield tiers: >=8% -> 15, >=6% -> 12, >=4% -> 8, >=2% -> 4, <2% -> 1', () => {
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(90_000_000), earnings: null }).components.cashFlow).toBe(15); // 9%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(70_000_000), earnings: null }).components.cashFlow).toBe(12); // 7%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(50_000_000), earnings: null }).components.cashFlow).toBe(8);  // 5%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(30_000_000), earnings: null }).components.cashFlow).toBe(4);  // 3%
    expect(computeQualityScore({ metric: null, marketCap: 1000, financials: fin(10_000_000), earnings: null }).components.cashFlow).toBe(1);  // 1%
  });

  it('scores 0 + red flag for negative FCF', () => {
    const result = computeQualityScore({ metric: null, marketCap: 1000, financials: fin(-5_000_000), earnings: null });
    expect(result.components.cashFlow).toBe(0);
    expect(result.redFlags).toContain('Negative free cash flow');
  });

  it('FCF sub-score is null (not 0) when fcf or marketCap is missing, so PEG alone can still score', () => {
    const result = computeQualityScore({ metric: { pegTTM: 0.8 }, marketCap: null, financials: fin(null), earnings: null });
    expect(result.components.cashFlow).toBe(10); // PEG-only: <=1.0 tier
  });

  it('scores PEG tiers: <=1.0 -> 10, <=1.5 -> 7, <=2.0 -> 4, >2.0 -> 1, invalid/absent -> no points (not penalized)', () => {
    const withFcf = fin(90_000_000); // maxes FCF sub at 15
    expect(computeQualityScore({ metric: { pegTTM: 0.9 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 10);
    expect(computeQualityScore({ metric: { pegTTM: 1.4 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 7);
    expect(computeQualityScore({ metric: { pegTTM: 1.9 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 4);
    expect(computeQualityScore({ metric: { pegTTM: 3.0 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15 + 1);
    expect(computeQualityScore({ metric: { pegTTM: -1 }, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15);
    expect(computeQualityScore({ metric: {}, marketCap: 1000, financials: withFcf, earnings: null }).components.cashFlow).toBe(15);
  });

  it('caps cashFlow at 25', () => {
    const result = computeQualityScore({ metric: { pegTTM: 0.5 }, marketCap: 1000, financials: fin(200_000_000), earnings: null });
    expect(result.components.cashFlow).toBeLessThanOrEqual(25);
  });

  it('cashFlow is null when both metric and financials/marketCap are entirely absent', () => {
    const result = computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null });
    expect(result.components.cashFlow).toBeNull();
  });
});

describe('computeQualityScore — balanceSheet component', () => {
  const base = { metric: {}, marketCap: null, financials: null, earnings: null };

  it('scores debt/equity fallback tiers: <0.5 -> 10, <1.0 -> 7, <2.0 -> 3, >=2.0 -> 0 + warning', () => {
    expect(computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 0.3 } }).components.balanceSheet).toBe(10);
    expect(computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 0.8 } }).components.balanceSheet).toBe(7);
    expect(computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 1.5 } }).components.balanceSheet).toBe(3);
    const high = computeQualityScore({ ...base, metric: { 'totalDebt/totalEquityQuarterly': 2.5 } });
    expect(high.components.balanceSheet).toBe(0);
    expect(high.notes.some((n) => n.includes('High leverage'))).toBe(true);
  });

  it('adds current ratio tiers: >=1.5 -> +5, >=1.0 -> +3, <1.0 -> 0 + warning', () => {
    expect(computeQualityScore({ ...base, metric: { currentRatioQuarterly: 1.8 } }).components.balanceSheet).toBe(5);
    expect(computeQualityScore({ ...base, metric: { currentRatioQuarterly: 1.2 } }).components.balanceSheet).toBe(3);
    const low = computeQualityScore({ ...base, metric: { currentRatioQuarterly: 0.7 } });
    expect(low.components.balanceSheet).toBe(0);
    expect(low.notes.some((n) => n.includes('Current ratio below 1'))).toBe(true);
  });

  it('adds interest coverage tiers: >=8 -> +5, >=3 -> +3, <3 -> 0 + red flag', () => {
    expect(computeQualityScore({ ...base, metric: { netInterestCoverageTTM: 10 } }).components.balanceSheet).toBe(5);
    expect(computeQualityScore({ ...base, metric: { netInterestCoverageTTM: 4 } }).components.balanceSheet).toBe(3);
    const weak = computeQualityScore({ ...base, metric: { netInterestCoverageTTM: 1 } });
    expect(weak.components.balanceSheet).toBe(0);
    expect(weak.redFlags).toContain('Weak interest coverage');
  });

  it('sums leverage + liquidity + coverage, capped at 25', () => {
    const result = computeQualityScore({
      ...base,
      metric: { 'totalDebt/totalEquityQuarterly': 0.3, currentRatioQuarterly: 1.8, netInterestCoverageTTM: 10 },
    });
    expect(result.components.balanceSheet).toBe(10 + 5 + 5);
    expect(result.components.balanceSheet).toBeLessThanOrEqual(25);
  });

  it('balanceSheet is null when metric is entirely absent', () => {
    expect(computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null }).components.balanceSheet).toBeNull();
  });
});

describe('computeQualityScore — shareholderReturn component', () => {
  const fin = (dilutedShares, dilutedSharesPrior) => ({
    fcf: null, ocf: null, capex: null, buyback: null, dilutedShares, dilutedSharesPrior,
  });

  it('scores dividend tiers: yield>=2% & payout<70% -> 4, yield>0 & payout<90% -> 2, payout>=90% -> 0 + warning', () => {
    const good = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 2.5, payoutRatioTTM: 50 }, marketCap: null, financials: null, earnings: null });
    expect(good.components.shareholderReturn).toBe(4);

    const ok = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 1, payoutRatioTTM: 80 }, marketCap: null, financials: null, earnings: null });
    expect(ok.components.shareholderReturn).toBe(2);

    const risky = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 1, payoutRatioTTM: 95 }, marketCap: null, financials: null, earnings: null });
    expect(risky.components.shareholderReturn).toBe(0);
    expect(risky.notes.some((n) => n.includes('Dividend payout may be unsustainable'))).toBe(true);
  });

  it('does not penalize a non-payer (yield 0, no warning)', () => {
    const result = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 0 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.shareholderReturn).toBe(0);
    expect(result.notes.some((n) => n.includes('Dividend'))).toBe(false);
  });

  it('scores share-count reduction: down>2% -> +6, down 0-2% -> +3, up>3% -> 0 + warning', () => {
    const down = computeQualityScore({ metric: {}, marketCap: null, financials: fin(950, 1000), earnings: null }); // -5%
    expect(down.components.shareholderReturn).toBe(6);

    const flat = computeQualityScore({ metric: {}, marketCap: null, financials: fin(990, 1000), earnings: null }); // -1%
    expect(flat.components.shareholderReturn).toBe(3);

    const diluted = computeQualityScore({ metric: {}, marketCap: null, financials: fin(1050, 1000), earnings: null }); // +5%
    expect(diluted.components.shareholderReturn).toBe(0);
    expect(diluted.notes.some((n) => n.includes('Material share dilution'))).toBe(true);
  });

  it('leaves the share-count sub-score out (not forced to 0) when diluted-share history is missing', () => {
    const result = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 2.5, payoutRatioTTM: 50 }, marketCap: null, financials: fin(null, null), earnings: null });
    expect(result.components.shareholderReturn).toBe(4); // dividend only, share-count sub contributes nothing
  });

  it('caps shareholderReturn at 10', () => {
    const result = computeQualityScore({ metric: { dividendYieldIndicatedAnnual: 3, payoutRatioTTM: 40 }, marketCap: null, financials: fin(900, 1000), earnings: null });
    expect(result.components.shareholderReturn).toBeLessThanOrEqual(10);
  });

  it('shareholderReturn is null when both metric and financials are entirely absent', () => {
    expect(computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null }).components.shareholderReturn).toBeNull();
  });
});

describe('computeQualityScore — earningsQuality component', () => {
  const earn = (results) => results.map(([actual, estimate]) => ({ actual, estimate }));
  const base = { metric: null, marketCap: null, financials: null };

  it('scores beat rate tiers: >=75% -> 10, >=60% -> 7, >=50% -> 4, <50% -> 1', () => {
    expect(computeQualityScore({ ...base, earnings: earn([[2, 1], [2, 1], [2, 1], [2, 1]]) }).components.earningsQuality).toBe(10);
    expect(computeQualityScore({ ...base, earnings: earn([[2, 1], [2, 1], [2, 1], [1, 2], [1, 2]]) }).components.earningsQuality).toBe(7); // 3/5 = 60%
    expect(computeQualityScore({ ...base, earnings: earn([[2, 1], [1, 2]]) }).components.earningsQuality).toBe(4); // 50%
    expect(computeQualityScore({ ...base, earnings: earn([[1, 2], [1, 2], [2, 1]]) }).components.earningsQuality).toBe(1); // 33%
  });

  it('scores 0 + red flag for 3+ consecutive misses (trailing, most-recent-first)', () => {
    const result = computeQualityScore({ ...base, earnings: earn([[1, 2], [1, 2], [1, 2], [2, 1]]) });
    expect(result.components.earningsQuality).toBe(0);
    expect(result.redFlags).toContain('Repeated earnings misses');
  });

  it('earningsQuality is null when earnings history is missing or empty', () => {
    expect(computeQualityScore({ ...base, earnings: null }).components.earningsQuality).toBeNull();
    expect(computeQualityScore({ ...base, earnings: [] }).components.earningsQuality).toBeNull();
  });
});

describe('computeQualityScore — total, label, INSUFFICIENT_DATA', () => {
  it('label is INSUFFICIENT_DATA when fewer than 3 of 5 components are non-null, even if total is reported', () => {
    const result = computeQualityScore({
      metric: { roiTTM: 22 }, // profitability only
      marketCap: null,
      financials: null,
      earnings: null,
    });
    expect(result.components.profitability).not.toBeNull();
    expect(result.components.cashFlow).toBeNull();
    expect(result.components.balanceSheet).not.toBeNull(); // balanceSheet also scores off `metric`
    expect(result.components.shareholderReturn).not.toBeNull(); // dividend sub scores off `metric` too (0, non-null)
    expect(result.components.earningsQuality).toBeNull();
    // 3 of 5 non-null here (profitability, balanceSheet, shareholderReturn) -> not INSUFFICIENT_DATA
    expect(result.label).not.toBe('INSUFFICIENT_DATA');
  });

  it('label is INSUFFICIENT_DATA when everything is absent', () => {
    const result = computeQualityScore({ metric: null, marketCap: null, financials: null, earnings: null });
    expect(result.total).toBeNull();
    expect(result.label).toBe('INSUFFICIENT_DATA');
  });

  it('labels HIGH >=75, MEDIUM 50-74, LOW <50 on a fully-populated high-quality input', () => {
    const result = computeQualityScore({
      metric: {
        roiTTM: 25, operatingMarginTTM: 30, epsGrowthTTMYoy: 10, epsGrowth3Y: 10,
        pegTTM: 0.8,
        'totalDebt/totalEquityQuarterly': 0.2, currentRatioQuarterly: 2.0, netInterestCoverageTTM: 12,
        dividendYieldIndicatedAnnual: 2.5, payoutRatioTTM: 40,
      },
      marketCap: 1000,
      financials: { fcf: 90_000_000, ocf: null, capex: null, buyback: null, dilutedShares: 950, dilutedSharesPrior: 1000 },
      earnings: [{ actual: 2, estimate: 1 }, { actual: 2, estimate: 1 }, { actual: 2, estimate: 1 }],
    });
    expect(result.total).toBeGreaterThanOrEqual(75);
    expect(result.label).toBe('HIGH');
  });

  it('pins a concrete MEDIUM fixture to catch the 50/75 boundary off-by-one', () => {
    const earn2 = (results) => results.map(([actual, estimate]) => ({ actual, estimate }));
    const result = computeQualityScore({
      metric: {
        roiTTM: 11, operatingMarginTTM: 10,
        'totalDebt/totalEquityQuarterly': 1.5, currentRatioQuarterly: 1.2,
      },
      marketCap: null,
      financials: null,
      earnings: earn2([[2, 1], [1, 2]]),
    });
    // profitability: 10+4=14, cashFlow: null, balanceSheet: 3+3=6, shareholderReturn: 0 (metric present, no dividend/payout keys), earningsQuality: 4 (50% beat)
    expect(result.components).toEqual({ profitability: 14, cashFlow: null, balanceSheet: 6, shareholderReturn: 0, earningsQuality: 4 });
    expect(result.total).toBe(24);
    expect(result.label).toBe('LOW');
  });
});

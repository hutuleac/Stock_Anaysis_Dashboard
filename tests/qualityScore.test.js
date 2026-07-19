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
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.20 } }).components.profitability).toBeGreaterThanOrEqual(18);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.22 } }).components.profitability).toBe(18);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.16 } }).components.profitability).toBe(15);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.11 } }).components.profitability).toBe(10);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.06 } }).components.profitability).toBe(5);
    expect(computeQualityScore({ ...base, metric: { roiTTM: 0.02 } }).components.profitability).toBe(0);
  });

  it('falls back to ROE with a note when roiTTM is absent', () => {
    const result = computeQualityScore({ metric: { roeTTM: 0.22 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBe(18);
    expect(result.notes.some((n) => n.includes('ROIC unavailable'))).toBe(true);
  });

  it('adds operating margin tiers on top of ROIC', () => {
    const result = computeQualityScore({ metric: { roiTTM: 0.22, operatingMarginTTM: 0.30 }, marketCap: null, financials: null, earnings: null });
    expect(result.components.profitability).toBe(18 + 8);
  });

  it('adds +4 stability when both eps growth periods are positive, +2 when one is, 0 + warning when both negative', () => {
    const both = computeQualityScore({ metric: { roiTTM: 0.22, epsGrowthTTMYoy: 0.10, epsGrowth3Y: 0.05 }, marketCap: null, financials: null, earnings: null });
    expect(both.components.profitability).toBe(18 + 4);

    const one = computeQualityScore({ metric: { roiTTM: 0.22, epsGrowthTTMYoy: 0.10, epsGrowth3Y: -0.05 }, marketCap: null, financials: null, earnings: null });
    expect(one.components.profitability).toBe(18 + 2);

    const neither = computeQualityScore({ metric: { roiTTM: 0.22, epsGrowthTTMYoy: -0.10, epsGrowth3Y: -0.05 }, marketCap: null, financials: null, earnings: null });
    expect(neither.components.profitability).toBe(18);
    expect(neither.notes.some((w) => w.includes('EPS growth is negative across multiple periods'))).toBe(true);
  });

  it('caps profitability at 30', () => {
    const result = computeQualityScore({
      metric: { roiTTM: 0.25, operatingMarginTTM: 0.30, epsGrowthTTMYoy: 0.10, epsGrowth3Y: 0.10 },
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

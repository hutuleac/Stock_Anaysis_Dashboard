import { describe, it, expect } from 'vitest';
import { parseFinancials } from '../src/lib/qualityScore.js';

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

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const CONCEPTS = {
  ocf: 'netcashprovidedbyusedinoperatingactivities',
  capex: 'paymentstoacquirepropertyplantandequipment',
  buyback: 'paymentsforrepurchaseofcommonstock',
  dilutedShares: 'weightedaveragenumberofdilutedsharesoutstanding',
};

function findConcept(lines, conceptSubstring) {
  if (!Array.isArray(lines)) return null;
  const hit = lines.find(
    (l) => l && typeof l.concept === 'string' && l.concept.toLowerCase().includes(conceptSubstring)
  );
  return hit ? num(hit.value) : null;
}

function pickAnnualReports(data) {
  if (!Array.isArray(data) || data.length === 0) return { latest: null, prior: null };
  const annual = data.filter((d) => d && d.quarter === 0);
  const sorted = [...(annual.length ? annual : data)].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
  return { latest: sorted[0] ?? null, prior: sorted[1] ?? null };
}

/**
 * @param {Object} reported  raw `/stock/financials-reported` payload: { data: [{ year, quarter, form, report: { bs, cf, ic } }] }
 * @returns {{ fcf: number|null, ocf: number|null, capex: number|null, buyback: number|null, dilutedShares: number|null, dilutedSharesPrior: number|null }}
 */
export function parseFinancials(reported) {
  const empty = { fcf: null, ocf: null, capex: null, buyback: null, dilutedShares: null, dilutedSharesPrior: null };
  const data = reported && Array.isArray(reported.data) ? reported.data : null;
  if (!data || data.length === 0) return empty;

  const { latest, prior } = pickAnnualReports(data);
  if (!latest) return empty;

  const cf = latest.report && Array.isArray(latest.report.cf) ? latest.report.cf : [];
  const ic = latest.report && Array.isArray(latest.report.ic) ? latest.report.ic : [];
  const priorIc = prior && prior.report && Array.isArray(prior.report.ic) ? prior.report.ic : [];

  const ocf = findConcept(cf, CONCEPTS.ocf);
  const capex = findConcept(cf, CONCEPTS.capex);
  const buyback = findConcept(cf, CONCEPTS.buyback);
  const dilutedShares = findConcept(ic, CONCEPTS.dilutedShares);
  const dilutedSharesPrior = findConcept(priorIc, CONCEPTS.dilutedShares);

  return {
    fcf: ocf !== null && capex !== null ? ocf - capex : null,
    ocf,
    capex,
    buyback,
    dilutedShares,
    dilutedSharesPrior,
  };
}

function scoreProfitability(metric) {
  if (!metric) return { score: null, notes: [], warnings: [] };
  const notes = [];
  const warnings = [];
  let score = 0;

  const roic = num(metric.roiTTM);
  const roe = num(metric.roeTTM);
  const roicValue = roic !== null ? roic : roe;
  if (roic === null && roe !== null) notes.push('ROIC unavailable — used ROE');
  if (roicValue !== null) {
    if (roicValue >= 0.20) score += 18;
    else if (roicValue >= 0.15) score += 15;
    else if (roicValue >= 0.10) score += 10;
    else if (roicValue >= 0.05) score += 5;
  }

  const opMargin = num(metric.operatingMarginTTM);
  if (opMargin !== null) {
    if (opMargin >= 0.25) score += 8;
    else if (opMargin >= 0.15) score += 6;
    else if (opMargin >= 0.08) score += 4;
    else if (opMargin > 0) score += 2;
  }

  const epsYoy = num(metric.epsGrowthTTMYoy);
  const eps3y = num(metric.epsGrowth3Y);
  if (epsYoy !== null && eps3y !== null) {
    if (epsYoy > 0 && eps3y > 0) score += 4;
    else if (epsYoy > 0 || eps3y > 0) score += 2;
    else warnings.push('EPS growth is negative across multiple periods');
  } else if ((epsYoy !== null && epsYoy > 0) || (eps3y !== null && eps3y > 0)) {
    score += 2;
  }

  const grossMargin = num(metric.grossMarginTTM);
  const roa = num(metric.roaTTM);
  if (grossMargin !== null) notes.push(`Gross margin ${(grossMargin * 100).toFixed(1)}%`);
  if (roa !== null) notes.push(`ROA ${(roa * 100).toFixed(1)}%`);

  return { score: Math.min(30, score), notes, warnings };
}

function scoreCashFlow(metric, marketCap, financials) {
  const fcf = financials ? num(financials.fcf) : null;
  const marketCapNum = num(marketCap);
  const hasFcfInputs = fcf !== null && marketCapNum !== null;
  const pegRaw = metric ? num(metric.pegTTM) : null;
  const hasPegInput = pegRaw !== null && pegRaw > 0;
  if (!hasFcfInputs && !hasPegInput) return { score: null, notes: [], warnings: [], redFlags: [] };

  const redFlags = [];
  let score = 0;

  if (hasFcfInputs) {
    const marketCapUsd = marketCapNum * 1e6;
    const fcfYield = (fcf / marketCapUsd) * 100;
    if (fcf < 0) {
      redFlags.push('Negative free cash flow');
    } else if (fcfYield >= 8) score += 15;
    else if (fcfYield >= 6) score += 12;
    else if (fcfYield >= 4) score += 8;
    else if (fcfYield >= 2) score += 4;
    else score += 1;
  }

  if (hasPegInput) {
    if (pegRaw <= 1.0) score += 10;
    else if (pegRaw <= 1.5) score += 7;
    else if (pegRaw <= 2.0) score += 4;
    else score += 1;
  }

  return { score: Math.min(25, score), notes: [], warnings: [], redFlags };
}

/**
 * @typedef {Object} QualityScore
 * @property {number|null} total
 * @property {'HIGH'|'MEDIUM'|'LOW'|'INSUFFICIENT_DATA'} label
 * @property {Object} components
 * @property {number|null} components.profitability
 * @property {number|null} components.cashFlow
 * @property {number|null} components.balanceSheet
 * @property {number|null} components.shareholderReturn
 * @property {number|null} components.earningsQuality
 * @property {string[]} redFlags
 * @property {string[]} notes
 */

/**
 * @param {Object} input
 * @param {Object|null} input.metric
 * @param {number|null} input.marketCap
 * @param {Object|null} input.financials
 * @param {Array|null} input.earnings
 * @returns {QualityScore}
 */
export function computeQualityScore(input) {
  const { metric = null, marketCap = null, financials = null, earnings = null } = input || {};

  const profitability = scoreProfitability(metric);
  const cashFlow = scoreCashFlow(metric, marketCap, financials);

  const components = {
    profitability: profitability.score,
    cashFlow: cashFlow.score,
    balanceSheet: null,
    shareholderReturn: null,
    earningsQuality: null,
  };
  const notes = [...profitability.notes, ...cashFlow.notes];
  const warnings = [...profitability.warnings, ...cashFlow.warnings];
  const redFlags = [...(cashFlow.redFlags || [])];

  const nonNull = Object.values(components).filter((c) => c !== null);
  const total = nonNull.length > 0 ? Math.round(nonNull.reduce((a, b) => a + b, 0)) : null;
  const label = nonNull.length < 3 ? 'INSUFFICIENT_DATA' : total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW';

  return { total, label, components, redFlags, notes: [...notes, ...warnings] };
}

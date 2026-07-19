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
  // Finnhub metric ratios are percent numbers (roiTTM: 22 = 22%), matching
  // scoring.js/dip.js conventions — not fractions.
  if (roicValue !== null) {
    if (roicValue >= 20) score += 18;
    else if (roicValue >= 15) score += 15;
    else if (roicValue >= 10) score += 10;
    else if (roicValue >= 5) score += 5;
  }

  const opMargin = num(metric.operatingMarginTTM);
  if (opMargin !== null) {
    if (opMargin >= 25) score += 8;
    else if (opMargin >= 15) score += 6;
    else if (opMargin >= 8) score += 4;
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
  if (grossMargin !== null) notes.push(`Gross margin ${grossMargin.toFixed(1)}%`);
  if (roa !== null) notes.push(`ROA ${roa.toFixed(1)}%`);

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

function scoreBalanceSheet(metric) {
  if (!metric) return { score: null, notes: [], warnings: [], redFlags: [] };
  const notes = [];
  const warnings = [];
  const redFlags = [];
  let score = 0;

  const debtEquity = num(metric['totalDebt/totalEquityQuarterly']);
  if (debtEquity !== null) {
    if (debtEquity < 0.5) score += 10;
    else if (debtEquity < 1.0) score += 7;
    else if (debtEquity < 2.0) score += 3;
    else warnings.push('High leverage: debt/equity at or above 2');
  }

  const currentRatio = num(metric.currentRatioQuarterly);
  if (currentRatio !== null) {
    if (currentRatio >= 1.5) score += 5;
    else if (currentRatio >= 1.0) score += 3;
    else warnings.push('Current ratio below 1');
  }

  const coverage = num(metric.netInterestCoverageTTM);
  if (coverage !== null) {
    if (coverage >= 8) score += 5;
    else if (coverage >= 3) score += 3;
    else redFlags.push('Weak interest coverage');
  }

  return { score: Math.min(25, score), notes, warnings, redFlags };
}

function scoreShareholderReturn(metric, financials) {
  const hasDividendInput = !!metric;
  const hasShareCountInput = financials && num(financials.dilutedShares) !== null && num(financials.dilutedSharesPrior) !== null;
  if (!hasDividendInput && !hasShareCountInput) return { score: null, notes: [], warnings: [] };

  const notes = [];
  let score = 0;

  if (hasDividendInput) {
    const yieldPct = num(metric.dividendYieldIndicatedAnnual);
    const payout = num(metric.payoutRatioTTM);
    if (yieldPct !== null && yieldPct > 0) {
      if (yieldPct >= 2 && payout !== null && payout < 70) score += 4;
      else if (payout !== null && payout >= 90) notes.push('Dividend payout may be unsustainable');
      else if (payout === null || payout < 90) score += 2;
    }
  }

  if (hasShareCountInput) {
    const current = num(financials.dilutedShares);
    const prior = num(financials.dilutedSharesPrior);
    const changePct = ((current - prior) / prior) * 100;
    if (changePct <= -2) score += 6;
    else if (changePct <= 0) score += 3;
    else if (changePct > 3) notes.push('Material share dilution');
  }

  return { score: Math.min(10, score), notes, warnings: [] };
}

function scoreEarningsQuality(earnings) {
  if (!Array.isArray(earnings) || earnings.length === 0) return { score: null, redFlags: [] };

  const recent = earnings.slice(0, 8);
  const beats = recent.filter((e) => num(e.actual) !== null && num(e.estimate) !== null && e.actual > e.estimate).length;
  const scored = recent.filter((e) => num(e.actual) !== null && num(e.estimate) !== null).length;
  const beatRate = scored > 0 ? beats / scored : 0;

  let consecutiveMisses = 0;
  for (const e of recent) {
    if (num(e.actual) !== null && num(e.estimate) !== null && e.actual < e.estimate) consecutiveMisses += 1;
    else break;
  }

  if (consecutiveMisses >= 3) return { score: 0, redFlags: ['Repeated earnings misses'] };

  let score;
  if (beatRate >= 0.75) score = 10;
  else if (beatRate >= 0.60) score = 7;
  else if (beatRate >= 0.50) score = 4;
  else score = 1;

  return { score, redFlags: [] };
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
  const balanceSheet = scoreBalanceSheet(metric);
  const shareholderReturn = scoreShareholderReturn(metric, financials);
  const earningsQuality = scoreEarningsQuality(earnings);

  const components = {
    profitability: profitability.score,
    cashFlow: cashFlow.score,
    balanceSheet: balanceSheet.score,
    shareholderReturn: shareholderReturn.score,
    earningsQuality: earningsQuality.score,
  };
  const notes = [...profitability.notes, ...cashFlow.notes, ...balanceSheet.notes, ...shareholderReturn.notes];
  const warnings = [...profitability.warnings, ...cashFlow.warnings, ...balanceSheet.warnings, ...shareholderReturn.warnings];
  const redFlags = [...(cashFlow.redFlags || []), ...(balanceSheet.redFlags || []), ...(earningsQuality.redFlags || [])];

  const nonNull = Object.values(components).filter((c) => c !== null);
  const total = nonNull.length > 0 ? Math.round(nonNull.reduce((a, b) => a + b, 0)) : null;
  const label = nonNull.length < 3 ? 'INSUFFICIENT_DATA' : total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW';

  return { total, label, components, redFlags, notes: [...notes, ...warnings] };
}

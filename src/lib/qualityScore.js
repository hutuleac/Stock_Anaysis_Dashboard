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

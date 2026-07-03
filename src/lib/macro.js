// Pure macro-regime math over FRED series — no fetch, no runes.
// Data source + caching live in api/fred.js.

// FRED marks missing observations with the string '.' (weekends/holidays on
// daily series like T10Y2Y). Returns [{ date, value }] newest-first.
export function parseFredObservations(json) {
  const obs = json?.observations;
  if (!Array.isArray(obs)) return [];
  return obs
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => Number.isFinite(o.value));
}

// series: { T10Y2Y: [{date,value},…], FEDFUNDS: […], CPIAUCSL: […], UNRATE: […] }
// each newest-first (FRED sort_order=desc). Any series may be null/empty.
export function deriveMacroRegime(series) {
  const t10y2y  = series?.T10Y2Y?.[0]?.value ?? null;
  const ffNow   = series?.FEDFUNDS?.[0]?.value ?? null;
  const ffPrev  = series?.FEDFUNDS?.[1]?.value ?? null;
  if (t10y2y === null && ffNow === null) return null;

  // CPI YoY needs the observation 12 months back (13 obs fetched)
  const cpiNow  = series?.CPIAUCSL?.[0]?.value ?? null;
  const cpiYago = series?.CPIAUCSL?.[12]?.value ?? null;
  const cpiYoY  = cpiNow !== null && cpiYago > 0
    ? ((cpiNow / cpiYago) - 1) * 100
    : null;

  return {
    curveInverted: t10y2y !== null && t10y2y < 0,
    fedRising:     ffNow !== null && ffPrev !== null && ffNow > ffPrev,
    t10y2y,
    fedFunds:      ffNow,
    fedFundsPrev:  ffPrev,
    cpi:           cpiNow,
    cpiYoY,
    unemployment:  series?.UNRATE?.[0]?.value ?? null,
  };
}

// Valuation derivations from Finnhub metrics. Pure, display-oriented.

// ── PEG ratio = P/E ÷ EPS growth rate (% YoY) ────────────────────────────────
// PEG < 1 = cheap relative to growth; > 2 = expensive. Undefined when growth is
// zero/negative or P/E is non-positive (the ratio loses meaning).
export function computePEG(pe, epsGrowthPct) {
  if (pe == null || epsGrowthPct == null) return null;
  if (pe <= 0 || epsGrowthPct <= 0) return null;
  return Math.round((pe / epsGrowthPct) * 100) / 100;
}

// Display helpers for the Long-Term Setup UI: turn the timing/quality score
// component objects into labeled chips, mirroring how Setup Radar and Dip Hunter
// surface their own contributing indicators. Pure formatting — no new computation,
// no API calls. Component sub-scores are already produced by computeTimingScore /
// computeQualityScore; here we only label, cap, and colour them.

// [componentKey, short label, max] — order = display order. Maxes match the
// score engines (timingScore.js / qualityScore.js); keep them in sync if a
// component's cap changes.
const TIMING = [
  ['drawdown', 'Drawdown', 20],
  ['oversold', 'Oversold', 20],
  ['reversal', 'Reversal', 20],
  ['consolidation', 'Base', 15],
  ['volumeBehavior', 'Volume', 15],
  ['marketContext', 'Market', 10],
];

const QUALITY = [
  ['profitability', 'Profit', 30],
  ['cashFlow', 'Cash', 25],
  ['balanceSheet', 'Balance', 25],
  ['shareholderReturn', 'Payout', 10],
  ['earningsQuality', 'Earnings', 10],
];

function chips(defs, components) {
  const c = components ?? {};
  return defs.map(([key, label, max]) => ({
    key, label, max,
    // null = the component's inputs were missing (omitted from the total).
    score: typeof c[key] === 'number' && Number.isFinite(c[key]) ? c[key] : null,
  }));
}

export const timingChips = (components) => chips(TIMING, components);
export const qualityChips = (components) => chips(QUALITY, components);

// Colour by fill ratio; a null component (missing input) reads muted grey so it's
// visibly distinct from a real zero.
export function chipColor(score, max) {
  if (score == null || !max) return '#6b7280';
  const r = score / max;
  if (r >= 0.6) return '#22c55e';
  if (r >= 0.3) return '#f59e0b';
  return '#9ca3af';
}

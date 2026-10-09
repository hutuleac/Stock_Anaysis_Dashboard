// Valuation derivations from Finnhub metrics. Pure, display-oriented.

// ── PEG ratio = P/E ÷ EPS growth rate (% YoY) ────────────────────────────────
// PEG < 1 = cheap relative to growth; > 2 = expensive. Undefined when growth is
// zero/negative or P/E is non-positive (the ratio loses meaning).
export function computePEG(pe, epsGrowthPct) {
  if (pe == null || epsGrowthPct == null) return null;
  if (pe <= 0 || epsGrowthPct <= 0) return null;
  return Math.round((pe / epsGrowthPct) * 100) / 100;
}

// ── Valuation vs the stock's own history ────────────────────────────────────
// "Is it cheap compared with where THIS stock usually trades?" — the question
// Quality (good company?) and Timing (washed-out chart?) don't ask. Uses the
// Finnhub /stock/metric `series` that the metric call already returns: points
// are { period: 'YYYY-MM-DD', v }. Quarterly TTM first, annual as fallback.
const SERIES_KEYS = {
  pe: [['quarterly', 'peTTM'], ['quarterly', 'pe'], ['annual', 'pe']],
  ps: [['quarterly', 'psTTM'], ['quarterly', 'ps'], ['annual', 'ps']],
};
const KEEP_POINTS = 24; // ~6 years of quarters — enough for a 5y median

// Keeps only the two histories we read (the full series is most of the payload).
export function trimValuationSeries(series) {
  const out = {};
  for (const [k, paths] of Object.entries(SERIES_KEYS)) {
    for (const [freq, key] of paths) {
      const pts = series?.[freq]?.[key];
      if (Array.isArray(pts) && pts.length) {
        out[k] = pts.filter(p => typeof p?.period === 'string' && Number.isFinite(p?.v))
          .sort((a, b) => b.period.localeCompare(a.period)).slice(0, KEEP_POINTS);
        break;
      }
    }
  }
  return out;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Current multiple vs its own median over the last `years` (positive values
// only — a loss-year P/E is meaningless). Null when fewer than 4 points.
function versus(now, points, years) {
  if (!(now > 0) || !Array.isArray(points) || !points.length) return null;
  const cutoff = new Date(points[0].period);
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const vals = points.filter(p => new Date(p.period) >= cutoff && p.v > 0).map(p => p.v);
  if (vals.length < 4) return null;
  const med = median(vals);
  return { now, median: Math.round(med * 10) / 10, pct: Math.round((now / med - 1) * 100), n: vals.length };
}

/**
 * @param {Object} metric   Finnhub metric object (peTTM / psTTM)
 * @param {Object} history  trimValuationSeries() output
 * @returns {{ pe: object|null, ps: object|null }|null}
 */
export function valuationVsHistory(metric, history, years = 5) {
  if (!history) return null;
  const pe = versus(metric?.peTTM ?? metric?.peBasicExclExtraTTM ?? null, history.pe, years);
  const ps = versus(metric?.psTTM ?? null, history.ps, years);
  return pe || ps ? { pe, ps } : null;
}

// Display tone: ≥15% below its own median reads cheap, ≥15% above rich.
export const valuationTone = (pct) => pct == null ? 'none' : pct <= -15 ? 'good' : pct >= 15 ? 'caution' : 'waiting';

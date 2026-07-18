// Technical-pattern primitives for the Long-Term Timing Score (Slice 1).
// Pure functions over the raw candle shape { s, t[], o[], h[], l[], c[], v[] }.
// Every function returns null / false on insufficient or invalid input —
// never a fake 0, never a throw. Bollinger math uses population variance to
// match computeBBLocal/computeBBSeries in indicators.js.
// (emaArray is imported in Task 4, when the first function that needs it lands.)

/**
 * Percent of the last close below the rolling max of the last `window` closes.
 * @returns {number|null} negative percent, or null if invalid
 */
export function drawdownFrom52wHigh(closes, window = 252) {
  if (!closes || closes.length < 2) return null;
  const slice = closes.slice(-window);
  const hi = Math.max(...slice);
  const price = closes[closes.length - 1];
  if (!(hi > 0)) return null;
  return ((price - hi) / hi) * 100;
}

/**
 * Current Bollinger bandwidth ((upper-lower)/middle * 100) and its percentile
 * rank over the last `lookback` bandwidth values (share of values <= current).
 * @returns {{ width: number, percentile: number }|null}
 */
export function bbWidthPercentile(closes, lookback = 126, period = 20, mult = 2) {
  if (!closes || closes.length < period) return null;
  const bw = [];
  for (let i = period - 1; i < closes.length; i++) {
    const win = closes.slice(i - period + 1, i + 1);
    const mean = win.reduce((s, v) => s + v, 0) / period;
    const variance = win.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    bw.push(mean > 0 ? (((mean + mult * sd) - (mean - mult * sd)) / mean) * 100 : 0);
  }
  if (bw.length < 2) return null;
  const series = bw.slice(-lookback);
  const current = series[series.length - 1];
  const percentile = (series.filter(v => v <= current).length / series.length) * 100;
  return { width: current, percentile };
}

/**
 * Longest trailing run (ending at the last bar) where the high-low range stays
 * within `maxRangePct`. Returns null if that run is shorter than `minDays`.
 * @returns {{ days: number, rangePct: number, high: number, low: number }|null}
 */
export function detectConsolidation(raw, maxRangePct = 15, minDays = 20) {
  const h = raw?.h, l = raw?.l;
  if (!h || !l || h.length < minDays) return null;
  const n = h.length;
  let hi = h[n - 1], lo = l[n - 1];
  let best = null;
  for (let len = 1; len <= n; len++) {
    const idx = n - len;
    hi = Math.max(hi, h[idx]);
    lo = Math.min(lo, l[idx]);
    const rangePct = lo > 0 ? ((hi - lo) / lo) * 100 : Infinity;
    if (rangePct <= maxRangePct) best = { days: len, rangePct, high: hi, low: lo };
    else break; // once an older bar breaks the range, the trailing run ends
  }
  return best && best.days >= minDays ? best : null;
}

/**
 * True when the last close is above `consolidationHigh` and the last volume is
 * above `volMult` x the average of the preceding `avgWindow` volumes.
 * @returns {boolean}
 */
export function breakoutConfirmation(raw, consolidationHigh, volMult = 1.5, avgWindow = 20) {
  const c = raw?.c, v = raw?.v;
  if (!c || !v || c.length < avgWindow + 1 || consolidationHigh == null) return false;
  const lastClose = c[c.length - 1];
  const lastVol = v[v.length - 1];
  const prior = v.slice(-avgWindow - 1, -1);
  const avg = prior.reduce((s, x) => s + (x ?? 0), 0) / prior.length;
  return lastClose > consolidationHigh && avg > 0 && lastVol > volMult * avg;
}

// Technical-pattern primitives for the Long-Term Timing Score (Slice 1).
// Pure functions over the raw candle shape { s, t[], o[], h[], l[], c[], v[] }.
// Every function returns null / false on insufficient or invalid input —
// never a fake 0, never a throw. Bollinger math uses population variance to
// match computeBBLocal/computeBBSeries in indicators.js.
import { emaArray } from './indicators.js';

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

/**
 * True when the last close is above EMA(period) and the previous `minBelow`
 * closes were all below their EMA — a reclaim after a stretch under the line.
 * @returns {boolean}
 */
export function emaReclaim(raw, period = 20, minBelow = 3) {
  const c = raw?.c;
  if (!c || c.length < period + minBelow + 1) return false;
  const ema = emaArray(c, period);
  const n = c.length;
  if (ema[n - 1] == null || !(c[n - 1] > ema[n - 1])) return false;
  for (let k = 2; k <= minBelow + 1; k++) {
    const idx = n - k;
    if (ema[idx] == null || c[idx] >= ema[idx]) return false;
  }
  return true;
}

/**
 * True when the MACD histogram strictly rises over the last `streak` intervals
 * (checks `streak + 1` histogram points), even if the histogram is still
 * negative. MACD line/signal use emaArray to match computeMACD's convention.
 * @returns {boolean}
 */
export function macdHistogramImproving(closes, streak = 3, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal + streak) return false;
  const ema12 = emaArray(closes, fast);
  const ema26 = emaArray(closes, slow);
  const macd = [];
  for (let i = slow - 1; i < closes.length; i++) macd.push(ema12[i] - ema26[i]);
  const sig = emaArray(macd, signal);
  const hist = [];
  for (let i = signal - 1; i < macd.length; i++) hist.push(macd[i] - sig[i]);
  if (hist.length < streak + 1) return false;
  const tail = hist.slice(-(streak + 1));
  for (let i = 1; i < tail.length; i++) if (!(tail[i] > tail[i - 1])) return false;
  return true;
}

/**
 * Up-day volume ÷ down-day volume over the last `window` days.
 * @returns {number|null} Infinity if up-volume with no down days; null if neither
 */
export function upDownVolumeRatio(raw, window = 10) {
  const c = raw?.c, v = raw?.v;
  if (!c || !v || c.length < window + 1) return null;
  let up = 0, down = 0;
  for (let i = Math.max(1, c.length - window); i < c.length; i++) {
    const vol = v[i] ?? 0;
    if (c[i] > c[i - 1]) up += vol;
    else if (c[i] < c[i - 1]) down += vol;
  }
  if (down === 0) return up > 0 ? Infinity : null;
  return up / down;
}

/**
 * Detects capitulation-style days in the last `lookback` bars: a down day with
 * volume >= volMult x the trailing `avgWindow`-day average, occurring after a
 * prior decline (`minPriorDowntrend` days ago higher than now), whose close
 * sits in the lower third (climax selloff) or upper third (intraday reversal)
 * of the day's range.
 * @returns {{ detected: boolean, dates: number[] }}
 */
export function detectCapitulation(raw, { lookback = 15, volMult = 1.8, minPriorDowntrend = 10, avgWindow = 20 } = {}) {
  const c = raw?.c, h = raw?.h, l = raw?.l, v = raw?.v, t = raw?.t;
  if (!c || !h || !l || !v) return { detected: false, dates: [] };
  const n = c.length;
  const need = avgWindow + minPriorDowntrend + 1;
  if (n < need) return { detected: false, dates: [] };
  const dates = [];
  const startI = Math.max(need - 1, n - lookback);
  for (let i = startI; i < n; i++) {
    if (c[i] >= c[i - 1]) continue;
    const priorVols = v.slice(i - avgWindow, i);
    const avg = priorVols.reduce((s, x) => s + (x ?? 0), 0) / priorVols.length;
    if (!(avg > 0) || v[i] < volMult * avg) continue;
    if (!(c[i - minPriorDowntrend] > c[i])) continue;
    const range = h[i] - l[i];
    if (range <= 0) continue;
    const closePos = (c[i] - l[i]) / range;
    if (closePos <= 1 / 3 || closePos >= 2 / 3) dates.push(t?.[i] ?? i);
  }
  return { detected: dates.length > 0, dates };
}

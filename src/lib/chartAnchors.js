// Price-anchored signals (AVWAP, POC, Fibonacci, FVG) computed from the daily
// candle object already in memory. Pure logic, no I/O, no Svelte. Display-only
// except the AVWAP/POC fields consumed by radar.js for a readiness nudge.
import { findSwingPivots } from './signals.js';

const FIB_RATIOS = [0.382, 0.5, 0.618];
// Aligned with computeIndicatorsFromCandles' 30-bar floor so AVWAP/POC never
// silently vanish while RSI/MACD still render (they share the daily candle set).
const MIN_BARS = 30;

// Anchored VWAP from the most significant (lowest-priced) confirmed swing low.
export function computeAVWAP(highs, lows, closes, volumes, pivotBars = 2) {
  if (!highs?.length || highs.length !== lows.length || highs.length !== closes.length) return null;
  const lowPivots = findSwingPivots(lows, pivotBars, 'low');
  if (!lowPivots.length) return null;
  const anchor = lowPivots.reduce((m, p) => (p.value < m.value ? p : m), lowPivots[0]);
  const anchorIndex = anchor.index;

  let sumPV = 0, sumV = 0;
  for (let i = anchorIndex; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    const vol = volumes?.[i] ?? 0;
    sumPV += tp * vol;
    sumV += vol;
  }
  if (sumV <= 0) return null;

  const value = sumPV / sumV;
  const lastClose = closes[closes.length - 1];
  return {
    value,
    pctFromPrice: ((lastClose - value) / value) * 100,
    reclaimed: lastClose > value,
    anchorIndex,
  };
}

// Point of Control + 70% value area from a daily price-bucket volume profile.
export function computePOC(highs, lows, closes, volumes, numBuckets = 24) {
  if (!highs?.length) return null;
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  if (!(high > low)) return null;

  const size = (high - low) / numBuckets;
  const buckets = Array.from({ length: numBuckets }, (_, i) => ({
    priceMid: low + (i + 0.5) * size,
    priceMin: low + i * size,
    priceMax: low + (i + 1) * size,
    volume: 0,
  }));
  let total = 0;
  for (let i = 0; i < highs.length; i++) {
    const typical = (highs[i] + lows[i] + closes[i]) / 3;
    const idx = Math.min(Math.floor((typical - low) / size), numBuckets - 1);
    if (idx >= 0) { buckets[idx].volume += volumes?.[i] ?? 0; total += volumes?.[i] ?? 0; }
  }
  if (total <= 0) return null;

  let pocIdx = 0;
  for (let i = 1; i < buckets.length; i++) if (buckets[i].volume > buckets[pocIdx].volume) pocIdx = i;

  let lo = pocIdx, hi = pocIdx, acc = buckets[pocIdx].volume;
  const target = total * 0.7;
  while (acc < target && (lo > 0 || hi < buckets.length - 1)) {
    const below = lo > 0 ? buckets[lo - 1].volume : -1;
    const above = hi < buckets.length - 1 ? buckets[hi + 1].volume : -1;
    if (above >= below) { hi += 1; acc += buckets[hi].volume; }
    else { lo -= 1; acc += buckets[lo].volume; }
  }

  const valueAreaHigh = buckets[hi].priceMax;
  const valueAreaLow = buckets[lo].priceMin;
  const lastClose = closes[closes.length - 1];
  const position = lastClose > valueAreaHigh ? 'above' : lastClose < valueAreaLow ? 'below' : 'inside';

  return { pocPrice: buckets[pocIdx].priceMid, valueAreaHigh, valueAreaLow, position };
}

// Fibonacci retracement levels between the most significant swing high & low.
export function computeFib(highs, lows, pivotBars = 2) {
  if (!highs?.length) return null;
  const highPivots = findSwingPivots(highs, pivotBars, 'high');
  const lowPivots = findSwingPivots(lows, pivotBars, 'low');
  if (!highPivots.length || !lowPivots.length) return null;

  const hi = highPivots.reduce((m, p) => (p.value > m.value ? p : m), highPivots[0]);
  const lo = lowPivots.reduce((m, p) => (p.value < m.value ? p : m), lowPivots[0]);
  const swingHigh = hi.value, swingLow = lo.value;
  const range = swingHigh - swingLow;
  if (!(range > 0)) return null;

  const direction = lo.index < hi.index ? 'up' : 'down';
  const lv = (r) => (direction === 'up' ? swingHigh - r * range : swingLow + r * range);
  const levels = {};
  for (const r of FIB_RATIOS) levels[String(r)] = lv(r);

  return { swingHigh, swingLow, direction, levels };
}

// Unfilled 3-candle fair value gaps; nearest above & below current price.
export function detectFVG(highs, lows, closes) {
  const empty = { gapsAbove: [], gapsBelow: [] };
  if (!highs?.length || highs.length < 3) return empty;
  const n = highs.length;
  const gaps = [];

  for (let i = 1; i < n - 1; i++) {
    let bottom = null, top = null;
    if (lows[i + 1] > highs[i - 1]) { bottom = highs[i - 1]; top = lows[i + 1]; }       // bullish gap
    else if (highs[i + 1] < lows[i - 1]) { bottom = highs[i + 1]; top = lows[i - 1]; }  // bearish gap
    if (bottom === null) continue;

    let filled = false;
    for (let j = i + 2; j < n; j++) {
      if (lows[j] <= top && highs[j] >= bottom) { filled = true; break; }
    }
    if (!filled) gaps.push({ top, bottom, index: i });
  }

  const lastClose = closes[closes.length - 1];
  const gapsAbove = gaps.filter(g => g.bottom > lastClose).sort((a, b) => a.bottom - b.bottom);
  const gapsBelow = gaps.filter(g => g.top < lastClose).sort((a, b) => b.top - a.top);
  return { gapsAbove, gapsBelow };
}

// Orchestrator — consumes the Finnhub-style daily raw object { s, c, h, l, v }.
export function computeChartAnchors(raw) {
  if (!raw || raw.s !== 'ok' || !Array.isArray(raw.c) || raw.c.length < MIN_BARS) return null;
  const closes = raw.c;
  const highs = raw.h ?? closes;
  const lows = raw.l ?? closes;
  const volumes = raw.v ?? [];
  return {
    avwap: computeAVWAP(highs, lows, closes, volumes),
    poc: computePOC(highs, lows, closes, volumes),
    fib: computeFib(highs, lows),
    fvg: detectFVG(highs, lows, closes),
  };
}

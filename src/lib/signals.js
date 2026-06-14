// Weekly leading-signal engine — pure functions.
// Adapted from range-finder/signal_engine.py for long-term stock entries.
// Runs on weekly OHLCV; reuses core math from indicators.js. Zero API calls.

import { computeRSI, emaArray } from './indicators.js';

// ── Swing pivot detection (N-bar pivot) ──────────────────────────────────────
export function findSwingPivots(arr, pivotBars = 2, direction = 'both') {
  const result = [];
  const n = arr.length;
  for (let i = pivotBars; i < n - pivotBars; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= pivotBars; j++) {
      if (!(arr[i] >= arr[i - j] && arr[i] >= arr[i + j])) isHigh = false;
      if (!(arr[i] <= arr[i - j] && arr[i] <= arr[i + j])) isLow = false;
    }
    if ((direction === 'both' || direction === 'high') && isHigh) {
      result.push({ index: i, value: arr[i] });
    } else if ((direction === 'both' || direction === 'low') && isLow) {
      result.push({ index: i, value: arr[i] });
    }
  }
  return result;
}

function round1(v) { return Math.round(v * 10) / 10; }

// ── RSI value at given pivot indices (reuses computeRSI on prefixes) ──────────
function rsiAtPivots(closes, pivotIndices, period = 14) {
  const out = {};
  for (const idx of pivotIndices) {
    out[idx] = computeRSI(closes.slice(0, idx + 1), period);
  }
  return out;
}

// ── Divergence: price vs RSI on the two most recent swing lows/highs ──────────
export function detectDivergence(closes, highs, lows, lookback = 30, period = 14) {
  const none = { type: 'NONE', strength: 0, barsAgo: 0 };
  if (!closes || closes.length < period + 4) return none;

  const start = Math.max(0, closes.length - lookback);
  const wClose = closes.slice(start);
  const wHigh = highs.slice(start);
  const wLow = lows.slice(start);

  const swingLows = findSwingPivots(wLow, 2, 'low');
  const swingHighs = findSwingPivots(wHigh, 2, 'high');

  // Bullish: price lower-low, RSI higher-low
  if (swingLows.length >= 2) {
    const a = swingLows[swingLows.length - 2];
    const b = swingLows[swingLows.length - 1];
    const rsi = rsiAtPivots(wClose, [a.index, b.index], period);
    if (rsi[a.index] != null && rsi[b.index] != null &&
        b.value < a.value && rsi[b.index] > rsi[a.index]) {
      const priceDiff = a.value > 0 ? Math.abs(a.value - b.value) / a.value : 0;
      const rsiDiff = Math.min(1, Math.abs(rsi[b.index] - rsi[a.index]) / 50);
      const strength = Math.min(1, (priceDiff + rsiDiff) / 2);
      return { type: 'BULL', strength, barsAgo: wClose.length - 1 - b.index };
    }
  }

  // Bearish: price higher-high, RSI lower-high
  if (swingHighs.length >= 2) {
    const a = swingHighs[swingHighs.length - 2];
    const b = swingHighs[swingHighs.length - 1];
    const rsi = rsiAtPivots(wClose, [a.index, b.index], period);
    if (rsi[a.index] != null && rsi[b.index] != null &&
        b.value > a.value && rsi[b.index] < rsi[a.index]) {
      const priceDiff = a.value > 0 ? Math.abs(b.value - a.value) / a.value : 0;
      const rsiDiff = Math.min(1, Math.abs(rsi[a.index] - rsi[b.index]) / 50);
      const strength = Math.min(1, (priceDiff + rsiDiff) / 2);
      return { type: 'BEAR', strength, barsAgo: wClose.length - 1 - b.index };
    }
  }

  return none;
}

// ── Bollinger bandwidth series ((upper-lower)/middle * 100) ───────────────────
function bbBandwidthSeries(closes, period = 20, mult = 2) {
  const n = closes.length;
  if (n < period) return [];
  const bw = [];
  for (let i = 0; i <= n - period; i++) {
    const slice = closes.slice(i, i + period);
    const mean = slice.reduce((s, v) => s + v, 0) / period;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    bw.push(mean > 0 ? ((2 * mult * std) / mean) * 100 : 0);
  }
  return bw;
}

const SQ_BW_THRESHOLD = 5;          // bandwidth % below which we call it a squeeze
const SQ_COMPRESSION_SLOPE = -0.1;

export function detectSqueeze(closes, period = 20, mult = 2) {
  const flat = { phase: 'FLAT', percentile: 50, currentBw: 0, barsToSqueeze: 99 };
  const bw = bbBandwidthSeries(closes, period, mult);
  if (bw.length < 10) return flat;

  const currentBw = bw[bw.length - 1];
  const tail = bw.slice(-10);

  // Linear regression slope over last 10 bandwidth values (x = 0..9, mean 4.5)
  const xMean = 4.5;
  const yMean = tail.reduce((s, v) => s + v, 0) / tail.length;
  let num = 0, den = 0;
  tail.forEach((v, i) => { num += (i - xMean) * (v - yMean); den += (i - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;

  const percentile = (bw.filter(v => v <= currentBw).length / bw.length) * 100;

  let phase, barsToSqueeze;
  if (currentBw > 0 && currentBw < SQ_BW_THRESHOLD) {
    phase = 'SQUEEZE'; barsToSqueeze = 0;
  } else if (slope < SQ_COMPRESSION_SLOPE && percentile < 50) {
    // Bandwidth contracting AND below its own recent median = genuinely compressing.
    // Percentile (not an absolute level) keeps this scale-agnostic across tickers.
    phase = 'COMPRESSING';
    barsToSqueeze = slope < 0 ? Math.max(1, Math.round((currentBw - SQ_BW_THRESHOLD) / Math.abs(slope))) : 99;
  } else if (slope > Math.abs(SQ_COMPRESSION_SLOPE)) {
    phase = 'EXPANDING'; barsToSqueeze = 99;
  } else {
    phase = 'FLAT'; barsToSqueeze = 99;
  }

  return { phase, percentile, currentBw, barsToSqueeze };
}

// ── Volume profile: dry-up (accumulation) vs expansion (breakout) ────────────
export function detectVolumeProfile(volumes, lookback = 12) {
  const neutral = { state: 'NEUTRAL', slopePct: 0, percentile: 50 };
  if (!volumes || volumes.length < lookback) return neutral;

  const vols = volumes.slice(-lookback);
  const mean = vols.reduce((s, v) => s + v, 0) / vols.length;
  if (mean <= 0) return neutral;

  const xMean = (lookback - 1) / 2;
  let num = 0, den = 0;
  vols.forEach((v, i) => { num += (i - xMean) * (v - mean); den += (i - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const slopePct = (slope / mean) * 100;

  const current = vols[vols.length - 1];
  const percentile = (vols.filter(v => v <= current).length / vols.length) * 100;

  let state = 'NEUTRAL';
  if (slopePct < -1.5 && percentile < 45) state = 'DRY_UP';
  else if (slopePct > 1.5 && percentile > 60) state = 'EXPANSION';

  return { state, slopePct, percentile };
}

const STRUCT_EXHAUSTION_PCT = 0.03; // 3% — swing extremes flattening threshold

export function detectStructure(highs, lows, lookback = 20) {
  const def = { current: 'Neutral', signal: 'STABLE', confidence: 0 };
  if (!highs || highs.length < 5) return def;

  const h = highs.slice(-lookback);
  const l = lows.slice(-lookback);
  const n = h.length;

  // Current regime — same 5-bar logic as indicators' weekly structure
  let current = 'Neutral';
  if (n >= 5) {
    const [h0, h2, h4] = [h[n - 1], h[n - 3], h[n - 5]];
    const [l0, l2, l4] = [l[n - 1], l[n - 3], l[n - 5]];
    if (h0 > h2 && h2 > h4 && l0 > l2 && l2 > l4) current = 'Bullish';
    else if (h0 < h2 && h2 < h4 && l0 < l2 && l2 < l4) current = 'Bearish';
  }

  const swingH = findSwingPivots(h, 2, 'high');
  const swingL = findSwingPivots(l, 2, 'low');

  // Breakout: latest bar clears the prior swing high
  if (current === 'Bullish' && swingH.length >= 1 && h[n - 1] > swingH[swingH.length - 1].value) {
    return { current, signal: 'BREAKOUT', confidence: 0.6 };
  }

  // Trend exhaustion: swing extremes flattening
  if (current === 'Bullish' && swingH.length >= 2) {
    const prev = swingH[swingH.length - 2].value, last = swingH[swingH.length - 1].value;
    const diff = prev > 0 ? Math.abs(last - prev) / prev : 0;
    if (diff < STRUCT_EXHAUSTION_PCT) {
      return { current, signal: 'TREND_EXHAUSTION', confidence: 1 - diff / STRUCT_EXHAUSTION_PCT };
    }
  }
  if (current === 'Bearish' && swingL.length >= 2) {
    const prev = swingL[swingL.length - 2].value, last = swingL[swingL.length - 1].value;
    const diff = prev > 0 ? Math.abs(last - prev) / prev : 0;
    if (diff < STRUCT_EXHAUSTION_PCT) {
      return { current, signal: 'TREND_EXHAUSTION', confidence: 1 - diff / STRUCT_EXHAUSTION_PCT };
    }
  }

  // Range forming: swing highs and lows converging
  if (swingH.length >= 2 && swingL.length >= 2) {
    const hRange = Math.abs(swingH[swingH.length - 1].value - swingH[swingH.length - 2].value);
    const lRange = Math.abs(swingL[swingL.length - 1].value - swingL[swingL.length - 2].value);
    const avg = (swingH[swingH.length - 1].value + swingL[swingL.length - 1].value) / 2;
    if (avg > 0) {
      const convergence = (hRange + lRange) / avg;
      if (convergence < STRUCT_EXHAUSTION_PCT * 2) {
        return { current, signal: 'RANGE_FORMING', confidence: Math.max(0, 1 - convergence / (STRUCT_EXHAUSTION_PCT * 2)) };
      }
    }
  }

  return { current, signal: 'STABLE', confidence: 0 };
}

// ── Shared label + readiness derivation ──────────────────────────────────────
function labelForScore(score) {
  if (score >= 7) return 'STRONG SETUP';
  if (score >= 4.5) return 'FORMING';
  if (score > 0) return 'EARLY';
  return 'NO SETUP';
}

function readinessForScore(score, urgencyBonus) {
  const rank = score + urgencyBonus;
  if (rank >= 8) return 'ACT';
  if (rank >= 6) return 'SOON';
  if (rank >= 3.5) return 'WATCH';
  return 'WAIT';
}

// ── Pullback / Accumulation setup ────────────────────────────────────────────
export function scorePullbackSetup({ divergence, structure, volume, rangePos }) {
  const components = [];

  // C1: Bullish divergence (max 3.5)
  let s1 = 0;
  if (divergence.type === 'BULL') {
    s1 = Math.min(3.5, 2 + divergence.strength * 1.5);
  }
  components.push({ label: 'Bullish Divergence', score: round1(s1), max: 3.5,
    detail: divergence.type === 'BULL' ? `str ${(divergence.strength * 100).toFixed(0)}%, ${divergence.barsAgo}w ago` : 'none' });

  // C2: Downtrend exhaustion / range forming (max 2.5)
  let s2 = 0;
  if (structure.current === 'Bearish' && structure.signal === 'TREND_EXHAUSTION') s2 = 1.5 + structure.confidence;
  else if (structure.signal === 'RANGE_FORMING') s2 = structure.confidence * 1.5;
  s2 = Math.min(2.5, s2);
  components.push({ label: 'Downtrend Exhaustion', score: round1(s2), max: 2.5, detail: structure.signal });

  // C3: Volume dry-up (max 2.0)
  const s3 = volume.state === 'DRY_UP' ? 2.0 : volume.slopePct < -1 ? 0.5 : 0;
  components.push({ label: 'Volume Dry-Up', score: round1(s3), max: 2.0, detail: `${volume.state} slope ${volume.slopePct.toFixed(1)}%` });

  // C4: Lower-half of range (max 2.0) — cheaper near the lows
  let s4 = 0;
  if (rangePos != null) {
    if (rangePos < 0.25) s4 = 2.0;
    else if (rangePos < 0.4) s4 = 1.2;
    else if (rangePos < 0.5) s4 = 0.5;
  }
  components.push({ label: 'Range Position', score: round1(s4), max: 2.0,
    detail: rangePos != null ? `${(rangePos * 100).toFixed(0)}th pctile` : 'n/a' });

  const score = Math.min(10, round1(s1 + s2 + s3 + s4));
  const urgencyBonus = (divergence.type === 'BULL' && divergence.barsAgo <= 2) ? 1.5 : 0;
  const readiness = score > 0 ? readinessForScore(score, urgencyBonus) : 'WAIT';
  const etaWeeks = structure.signal === 'TREND_EXHAUSTION' && structure.confidence > 0
    ? Math.max(1, Math.round((1 - structure.confidence) * 6)) : null;

  return { score, label: labelForScore(score), components, readiness, etaWeeks };
}

// ── Momentum / Breakout setup ────────────────────────────────────────────────
export function scoreMomentumSetup({ squeeze, structure, volume, emaReclaim }) {
  const components = [];

  // C1: Squeeze resolving up (max 3.0)
  let s1 = 0;
  if (squeeze.phase === 'SQUEEZE') s1 = emaReclaim ? 3.0 : 2.0;
  else if (squeeze.phase === 'COMPRESSING') {
    if (squeeze.barsToSqueeze <= 5) s1 = 2.0;
    else if (squeeze.barsToSqueeze <= 15) s1 = 1.2;
    else s1 = 0.6;
  }
  components.push({ label: 'Volatility Squeeze', score: round1(s1), max: 3.0,
    detail: `${squeeze.phase} bw ${squeeze.currentBw.toFixed(1)}%` });

  // C2: Structure bullish / breakout (max 3.0)
  let s2 = 0;
  if (structure.signal === 'BREAKOUT') s2 = 3.0;
  else if (structure.current === 'Bullish' && structure.signal === 'STABLE') s2 = 1.5;
  else if (structure.current === 'Bullish') s2 = 2.0;
  components.push({ label: 'Structure Breakout', score: round1(s2), max: 3.0,
    detail: `${structure.current}/${structure.signal}` });

  // C3: Volume expansion (max 2.0)
  const s3 = volume.state === 'EXPANSION' ? 2.0 : volume.slopePct > 1 ? 0.5 : 0;
  components.push({ label: 'Volume Expansion', score: round1(s3), max: 2.0,
    detail: `${volume.state} slope ${volume.slopePct.toFixed(1)}%` });

  // C4: Price reclaiming EMA (max 2.0)
  const s4 = emaReclaim ? 2.0 : 0;
  components.push({ label: 'EMA Reclaim', score: round1(s4), max: 2.0, detail: emaReclaim ? 'above weekly EMA' : 'below EMA' });

  const score = Math.min(10, round1(s1 + s2 + s3 + s4));
  let urgencyBonus = 0;
  if (squeeze.phase === 'SQUEEZE') urgencyBonus = 2;
  else if (squeeze.phase === 'COMPRESSING' && squeeze.barsToSqueeze <= 5) urgencyBonus = 1.5;
  const readiness = score > 0 ? readinessForScore(score, urgencyBonus) : 'WAIT';
  const etaWeeks = squeeze.phase === 'COMPRESSING' && squeeze.barsToSqueeze < 99 ? squeeze.barsToSqueeze : null;

  return { score, label: labelForScore(score), components, readiness, etaWeeks };
}

// ── Main orchestrator ─────────────────────────────────────────────────────────
export function computeSetupSignals(weeklyRaw) {
  if (!weeklyRaw?.c || weeklyRaw.s !== 'ok' || weeklyRaw.c.length < 20) return null;

  const closes = weeklyRaw.c;
  const highs = weeklyRaw.h ?? closes;
  const lows = weeklyRaw.l ?? closes;
  const volumes = weeklyRaw.v ?? [];

  const divergence = detectDivergence(closes, highs, lows);
  const squeeze = detectSqueeze(closes);
  const volume = volumes.length >= 12
    ? detectVolumeProfile(volumes)
    : { state: 'NEUTRAL', slopePct: 0, percentile: 50 };
  const structure = detectStructure(highs, lows);

  // Range position over available weekly history (self-contained — no Finnhub 52w)
  const lo = Math.min(...lows);
  const hi = Math.max(...highs);
  const price = closes[closes.length - 1];
  const rangePos = hi > lo ? (price - lo) / (hi - lo) : null;

  // EMA reclaim: price above weekly EMA10
  const ema10arr = emaArray(closes, 10);
  const ema10 = ema10arr.length ? ema10arr[ema10arr.length - 1] : null;
  const emaReclaim = ema10 != null && price > ema10;

  const pullback = scorePullbackSetup({ divergence, structure, volume, rangePos });
  const momentum = scoreMomentumSetup({ squeeze, structure, volume, emaReclaim });

  return { pullback, momentum };
}

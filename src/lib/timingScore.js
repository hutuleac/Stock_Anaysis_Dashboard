// Long-Term Timing Score (Slice 1) — pure composition of technical primitives.
// Measures only whether the moment is attractive for accumulation; it never
// says "buy" on its own (that is Slice 3's buildLongTermSetup). Null-safe:
// a component is null when its inputs are missing, and is omitted from the
// total; all-null → total null, label WAIT.

import { computeRSI, computeMACD, resampleMonthly } from './indicators.js';
import { detectDivergence } from './signals.js';
import {
  drawdownFrom52wHigh,
  bbWidthPercentile,
  detectConsolidation,
  breakoutConfirmation,
  emaReclaim,
  macdHistogramImproving,
  upDownVolumeRatio,
  detectCapitulation,
} from './technicalPatterns.js';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cap = (v, max) => Math.min(v, max);

function labelForTiming(total) {
  if (total == null) return 'WAIT';
  if (total >= 70) return 'STRONG_ACCUMULATION_ZONE';
  if (total >= 50) return 'WATCHLIST';
  if (total >= 30) return 'NEUTRAL';
  return 'WAIT';
}

/**
 * @param {{ dailyCandles?: object, weeklyCandles?: object, marketContext?: object }} input
 * @returns {TimingScore}
 */
export function computeTimingScore(input = {}) {
  const { dailyCandles, weeklyCandles, marketContext = {} } = input;
  const signals = [];
  const warnings = [];
  const components = {
    drawdown: null, oversold: null, reversal: null,
    consolidation: null, volumeBehavior: null, marketContext: null,
  };

  const dOk = !!(dailyCandles?.c?.length && dailyCandles.s === 'ok');
  const dCloses = dOk ? dailyCandles.c : null;

  // ── Drawdown (max 20) ──
  if (dCloses) {
    const dd = drawdownFrom52wHigh(dCloses);
    if (dd != null) {
      let pts;
      if (dd <= -40) { pts = 20; warnings.push('Deep drawdown: verify whether the investment thesis changed'); }
      else if (dd <= -25) pts = 18;
      else if (dd <= -15) pts = 12;
      else if (dd <= -10) pts = 6;
      else pts = 2;
      components.drawdown = pts;
      signals.push(`Drawdown ${dd.toFixed(1)}% from 52-week high`);
    }
  }

  // ── Oversold multi-timeframe (max 20) ──
  const dRsi = dCloses ? computeRSI(dCloses) : null;
  const wRsi = weeklyCandles?.c?.length ? computeRSI(weeklyCandles.c) : null;
  const monthly = dOk ? resampleMonthly(dailyCandles) : null;
  const mRsi = monthly?.c?.length ? computeRSI(monthly.c) : null;
  if (dRsi != null || wRsi != null || mRsi != null) {
    let pts = 0;
    if (dRsi != null) pts += dRsi < 30 ? 6 : dRsi <= 35 ? 3 : 0;
    if (wRsi != null) pts += wRsi < 35 ? 6 : wRsi <= 40 ? 3 : 0;
    if (mRsi != null) pts += mRsi < 40 ? 8 : mRsi <= 45 ? 4 : 0;
    components.oversold = cap(pts, 20);
    const r = (x) => (x == null ? 'n/a' : x.toFixed(0));
    signals.push(`Daily RSI ${r(dRsi)} | Weekly RSI ${r(wRsi)} | Monthly RSI ${r(mRsi)}`);
  }

  // ── Reversal confirmation (max 20) ──
  if (dCloses && dailyCandles.h && dailyCandles.l) {
    let pts = 0;
    const div = detectDivergence(dCloses, dailyCandles.h, dailyCandles.l);
    if (div?.type === 'BULL') { pts += 8; signals.push('Bullish RSI divergence detected'); }
    if (emaReclaim(dailyCandles)) { pts += 5; signals.push('Reclaimed the 20-day EMA'); }
    if (macdHistogramImproving(dCloses)) { pts += 4; signals.push('MACD histogram improving 3 days'); }
    const macd = computeMACD(dCloses);
    if (macd?.crossover === 'bullish_cross') { pts += 3; signals.push('MACD bullish crossover'); }
    components.reversal = cap(pts, 20);
  }

  // ── Consolidation quality (max 15) ──
  let consolidationHigh = null;
  if (dCloses) {
    let pts = 0;
    const bb = bbWidthPercentile(dCloses);
    if (bb) pts += bb.percentile < 10 ? 8 : bb.percentile < 20 ? 5 : bb.percentile < 30 ? 2 : 0;
    const con = detectConsolidation(dailyCandles);
    if (con) {
      pts += con.days >= 60 ? 7 : con.days >= 40 ? 4 : con.days >= 20 ? 2 : 0;
      consolidationHigh = con.high;
      signals.push(`Consolidation: ${con.days} trading days, range ${con.rangePct.toFixed(1)}%${bb ? `, BB Width percentile ${bb.percentile.toFixed(0)}` : ''}`);
    }
    if (bb || con) components.consolidation = cap(pts, 15);
  }

  // ── Volume behavior (max 15) ──
  if (dCloses && dailyCandles.v) {
    let pts = 0;
    const capit = detectCapitulation(dailyCandles);
    if (capit.detected) { pts += 6; signals.push('Capitulation-style volume detected'); }
    const udr = upDownVolumeRatio(dailyCandles);
    if (udr != null) {
      if (udr > 1.3) pts += 6;
      else if (udr >= 1.0) pts += 3;
      else if (udr < 0.7) warnings.push('Selling volume remains dominant');
    }
    if (consolidationHigh != null && breakoutConfirmation(dailyCandles, consolidationHigh)) {
      pts += 3; signals.push('Breakout on above-average volume');
    }
    components.volumeBehavior = cap(pts, 15);
  }

  // ── Market context (max 10) ──
  {
    const mc = marketContext || {};
    let pts = 0, any = false;
    if (mc.spyAboveEma50 === true) { pts += 3; any = true; }
    if (mc.spyAboveEma50 === false && mc.spyDowntrend === true) { warnings.push('Broad market trend is still negative'); any = true; }
    if (mc.sectorOutperforming === true) { pts += 3; any = true; }
    const fg = num(mc.fearGreed);
    if (fg != null) { any = true; if (fg < 30) pts += 2; }
    const vp = num(mc.volProxy);
    if (vp != null) {
      any = true;
      if (vp > 35) warnings.push('Extreme volatility: use staged entries only');
      else if (vp >= 25) pts += 2;
    }
    if (any) components.marketContext = cap(pts, 10);
  }

  // ── Total + label ──
  const present = Object.values(components).filter(v => v != null);
  const total = present.length ? Math.round(present.reduce((s, v) => s + v, 0)) : null;
  return { total, label: labelForTiming(total), components, signals, warnings };
}

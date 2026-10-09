// Long-Term Timing Score (Slice 1) — pure composition of technical primitives.
// Measures only whether the moment is attractive for accumulation; it never
// says "buy" on its own (that is Slice 3's buildLongTermSetup). Null-safe:
// a component is null when its inputs are missing, and is omitted from the
// total; all-null → total null, label WAIT.
//
// Shape: Drawdown (how far on sale) + Entry phase + Market. The phase is the
// BEST of three alternative paths, not their sum — capitulation, a confirmed
// turn and a tight base are different moments of one bottoming process and are
// rarely true together. Summing them capped real-data totals near 60, so the
// 70 gate never fired (Oct 2026 sweep: 26 symbols × 19 months).

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

// Per-component caps — the single source of truth. longTermIndicators.js imports
// these for its row maxes, so a cap change can't drift the UI. Must sum to 100.
export const TIMING_MAX = {
  drawdown: 25,
  phase: 50,
  marketContext: 25,
};
// Each phase path is scored 0–PATH_MAX; only the best one counts.
export const PATH_MAX = 50;
export const PATH_LABELS = { oversold: 'Oversold', reversal: 'Reversal', base: 'Base' };

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
  // Same strings, keyed by component — lets the UI put each reading on its own row.
  const notes = {};
  const add = (list, warn) => (key, text) => { list.push(text); (notes[key] ??= []).push({ text, warn }); };
  const sig = add(signals, false), warn = add(warnings, true);
  const components = { drawdown: null, phase: null, marketContext: null };
  const paths = { oversold: null, reversal: null, base: null };

  const dOk = !!(dailyCandles?.c?.length && dailyCandles.s === 'ok');
  const dCloses = dOk ? dailyCandles.c : null;

  // Bull regimes (confirmed uptrend, incl. late-cycle) get compressed bands —
  // pullbacks run shallower and RSI rarely touches bear-market oversold levels.
  const regime = marketContext?.regime ?? null;
  const isBull = regime === 'BULL' || regime === 'BULL_LATE';

  // ── Drawdown (max 25) ──
  if (dCloses) {
    const dd = drawdownFrom52wHigh(dCloses);
    if (dd != null) {
      const [deep, major, moderate, mild] = isBull ? [-20, -12, -8, -4] : [-40, -25, -15, -10];
      const pts = dd <= deep ? 25 : dd <= major ? 21 : dd <= moderate ? 15 : dd <= mild ? 8 : 2;
      if (dd <= deep) warn('drawdown', 'Deep drawdown: verify whether the investment thesis changed');
      components.drawdown = cap(pts, TIMING_MAX.drawdown);
      sig('drawdown', `Drawdown ${dd.toFixed(1)}% from 52-week high`);
    }
  }

  // ── Phase path 1: Oversold / capitulation (max 50) ──
  const wOk = !!(weeklyCandles?.c?.length && weeklyCandles.s === 'ok');
  const dRsi = dCloses ? computeRSI(dCloses) : null;
  const wRsi = wOk ? computeRSI(weeklyCandles.c) : null;
  const monthly = dOk ? resampleMonthly(dailyCandles) : null;
  const mRsi = monthly?.c?.length ? computeRSI(monthly.c) : null;
  const pathNotes = { oversold: [], reversal: [], base: [] };
  if (dRsi != null || wRsi != null || mRsi != null) {
    const [d1, d2, w1, w2, m1, m2] = isBull ? [40, 45, 42, 48, 45, 50] : [30, 35, 35, 40, 40, 45];
    let pts = 0;
    if (dRsi != null) pts += dRsi < d1 ? 10 : dRsi <= d2 ? 5 : 0;
    if (wRsi != null) pts += wRsi < w1 ? 14 : wRsi <= w2 ? 7 : 0;
    if (mRsi != null) pts += mRsi < m1 ? 14 : mRsi <= m2 ? 7 : 0;
    const r = (x) => (x == null ? 'n/a' : x.toFixed(0));
    pathNotes.oversold.push(`Daily RSI ${r(dRsi)} | Weekly RSI ${r(wRsi)} | Monthly RSI ${r(mRsi)}`);
    if (dCloses && dailyCandles.v && detectCapitulation(dailyCandles).detected) {
      pts += 12; pathNotes.oversold.push('Capitulation-style volume detected');
    }
    paths.oversold = cap(pts, PATH_MAX);
  }

  // ── Phase path 2: Reversal confirmed (max 50) ──
  // A turn needs something to turn from: below a mild pullback (drawdown < 8)
  // MACD crosses and EMA reclaims are uptrend noise, not a bottom.
  const pulledBack = components.drawdown != null && components.drawdown >= 8;
  if (dCloses && dailyCandles.h && dailyCandles.l && !pulledBack) paths.reversal = 0;
  else if (dCloses && dailyCandles.h && dailyCandles.l) {
    let pts = 0;
    const div = detectDivergence(dCloses, dailyCandles.h, dailyCandles.l);
    if (div?.type === 'BULL') { pts += 15; pathNotes.reversal.push('Bullish RSI divergence detected'); }
    if (emaReclaim(dailyCandles)) { pts += 10; pathNotes.reversal.push('Reclaimed the 20-day EMA'); }
    if (macdHistogramImproving(dCloses)) { pts += 8; pathNotes.reversal.push('MACD histogram improving 3 days'); }
    if (computeMACD(dCloses)?.crossover === 'bullish_cross') { pts += 7; pathNotes.reversal.push('MACD bullish crossover'); }
    const udr = dailyCandles.v ? upDownVolumeRatio(dailyCandles) : null;
    if (udr != null) {
      if (udr > 1.3) { pts += 10; pathNotes.reversal.push('Up-day volume leads down-day volume'); }
      else if (udr >= 1.0) pts += 5;
      else if (udr < 0.7) warn('phase', 'Selling volume remains dominant');
    }
    paths.reversal = cap(pts, PATH_MAX);
  }

  // ── Phase path 3: Base / breakout (max 50) ──
  if (dCloses) {
    let pts = 0;
    const bb = bbWidthPercentile(dCloses);
    if (bb) pts += bb.percentile < 10 ? 15 : bb.percentile < 20 ? 10 : bb.percentile < 30 ? 5 : 0;
    // The base is measured up to the PRIOR bar — a range that includes today's
    // high can never be broken by today's close.
    const prior = { h: dailyCandles.h?.slice(0, -1), l: dailyCandles.l?.slice(0, -1) };
    const con = detectConsolidation(prior);
    if (con) {
      pts += con.days >= 60 ? 20 : con.days >= 40 ? 14 : con.days >= 20 ? 8 : 0;
      pathNotes.base.push(`Base: ${con.days} trading days, range ${con.rangePct.toFixed(1)}%${bb ? `, BB Width percentile ${bb.percentile.toFixed(0)}` : ''}`);
      if (breakoutConfirmation(dailyCandles, con.high)) { pts += 15; pathNotes.base.push('Breakout above the base on above-average volume'); }
    }
    if (bb || con) paths.base = cap(pts, PATH_MAX);
  }

  // Best path wins; the others are shown as context, not added.
  const scored = Object.entries(paths).filter(([, v]) => v != null);
  let phase = null;
  if (scored.length) {
    const [bestKey, best] = scored.reduce((a, b) => (b[1] > a[1] ? b : a));
    phase = best > 0 ? bestKey : null;
    components.phase = best;
    if (phase) for (const t of pathNotes[phase]) sig('phase', t);
    if (phase === null) for (const t of pathNotes.oversold) sig('phase', t);
    const others = scored.filter(([k]) => k !== phase).map(([k, v]) => `${PATH_LABELS[k]} ${v}`).join(' · ');
    if (others) sig('phase', `Other paths: ${others}`);
  }

  // ── Market context (max 25) — trend (10) + sentiment (15) ──
  // Fear is opportunity for a long-term buyer; systemic risk is handled by the
  // credit-stress gate in longTermSetup.js, not here.
  {
    const mc = marketContext || {};
    let trend = null, sent = null;
    if (regime === 'BULL') trend = 10;
    else if (regime === 'BULL_LATE') { trend = 6; warn('marketContext', 'Late-cycle greed: trim position size'); }
    else if (regime === 'CHOP') { trend = 4; warn('marketContext', 'Mixed market regime: reduce position size'); }
    else if (regime === 'BEAR') trend = 0;
    else if (mc.spyAboveEma50 === true) trend = 6;
    else if (mc.spyAboveEma50 === false) trend = 0;
    if (mc.spyAboveEma50 === false && mc.spyDowntrend === true) warn('marketContext', 'Broad market trend is still negative');

    const fg = num(mc.fearGreed);
    const vp = num(mc.volProxy);
    if (fg != null) sent = fg < 25 ? 15 : fg < 35 ? 11 : fg < 45 ? 7 : fg < 55 ? 3 : 0;
    else if (vp != null) sent = vp >= 25 ? 8 : vp >= 20 ? 4 : 0;
    if (vp != null && vp > 35) warn('marketContext', 'Extreme volatility: use staged entries only');
    if (fg != null) sig('marketContext', `Fear & Greed ${fg}`);

    if (trend != null || sent != null) components.marketContext = cap((trend ?? 0) + (sent ?? 0), TIMING_MAX.marketContext);
  }

  // ── Total + label ──
  const present = Object.values(components).filter(v => v != null);
  const total = present.length ? Math.round(present.reduce((s, v) => s + v, 0)) : null;
  return { total, label: labelForTiming(total), components, paths, phase, signals, warnings, notes };
}

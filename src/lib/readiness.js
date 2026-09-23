// Readiness colouring for every ACT / SOON / WATCH / WAIT badge on the dashboard
// (Setup Radar, Dip Hunter, ETF entry+exit, the FundamentalsBar setup cards).
//
// This used to be four near-copies, one per component, and they had drifted:
// SOON rendered purple in a badge class and amber in the hex variant of the same
// file, and WATCH was grey in Setup Radar / Dip Hunter but near-white in
// FundamentalsBar. One state must not have three colours.
import { toneColor, toneStyle } from './tone.js';

const READINESS_TONE = {
  ACT: 'good',
  SOON: 'partial',
  WATCH: 'waiting',
  WAIT: 'none',
};

export const readinessTone = (readiness) => READINESS_TONE[readiness] ?? 'none';
export const readinessColor = (readiness) => toneColor(readinessTone(readiness));
export const readinessStyle = (readiness) => toneStyle(readinessTone(readiness));

// Direction matters more than strength. A SELL ACT is as urgent as a BUY ACT but
// means the opposite, so it must not borrow the same green — green reads "good to
// buy" at a glance, which is exactly backwards for an exit signal.
const SELL_TONE = {
  ACT: 'danger',
  SOON: 'caution',
  WATCH: 'waiting',
  WAIT: 'none',
};

export const signalTone = (readiness, isBuy) =>
  isBuy ? readinessTone(readiness) : (SELL_TONE[readiness] ?? 'none');
export const signalColor = (readiness, isBuy) => toneColor(signalTone(readiness, isBuy));
export const signalStyle = (readiness, isBuy) => toneStyle(signalTone(readiness, isBuy));

// A 0–10 score on the shared ACT ≥7 / SOON ≥5 tiers. `direction` flips the ramp
// for scores where a high number is a reason to leave, not to enter (the ETF exit
// score): 8.0 of sell pressure is red, never green.
export function scoreTone(score, direction = 'entry') {
  if (score == null || !Number.isFinite(score)) return 'none';
  const sell = direction === 'exit';
  if (score >= 7) return sell ? 'danger' : 'good';
  if (score >= 5) return sell ? 'caution' : 'partial';
  return 'waiting';
}

export const scoreColor = (score, direction) => toneColor(scoreTone(score, direction));

// ─── Distance to next tier ──────────────────────────────────────────────────
// Same ACT ≥7 / SOON ≥5 / WATCH ≥3 bands `scoreTone` uses. A 6.2 SOON should
// say "+0.8 to ACT", not leave the user to guess the gap.
const SCORE_BANDS = [[7, 'ACT'], [5, 'SOON'], [3, 'WATCH']];
const round1 = (v) => Math.round(v * 10) / 10;

// `blocked`: a reason string when a hidden non-score gate (e.g. Dip Hunter's
// fear requirement) is what's actually holding the badge back at the top
// band — shown instead of "already there" so a 7.5 stuck at SOON explains why.
export function scoreTierHint(score, { blocked = null } = {}) {
  if (score == null || !Number.isFinite(score)) return null;
  if (score >= 7) return blocked;
  const [need, name] = SCORE_BANDS.filter(([n]) => n > score).pop();
  return `+${round1(need - score)} to ${name}`;
}

// ─── "Waiting on" ────────────────────────────────────────────────────────────
// Ranks a panel's own `components[]` ({label, score, max}) by points still on
// the table — what has to improve before the score gets better. Pure ranking
// of numbers the caller already computed; a null score means the input isn't
// known, not that it's zero, so it's skipped rather than counted as a gap.
export function rankGaps(components, limit = 3) {
  return (components ?? [])
    .filter(c => c.score != null && c.score < c.max)
    .map(c => ({ ...c, gap: round1(c.max - c.score) }))
    .sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label))
    .slice(0, limit);
}

// ─── Verdict reconciler ─────────────────────────────────────────────────────
// The row badge is a short-term score; the setups are forward-looking. They can
// legitimately disagree (LEAN SHORT today, Pullback SOON in the radar) — this
// names the disagreement in one sentence instead of leaving two contradicting
// labels side by side. `rows` is radar.js's tickerSetups() + the long-term
// status; only setups the radar actually surfaces (inRadar) count.
const BEARISH = new Set(['LEAN_SHORT', 'STRONG_SHORT']);
const BULLISH = new Set(['LEAN_LONG', 'STRONG_LONG']);

export function reconcileVerdict(badge, rows) {
  if (!rows) return null;
  const { pullback, momentum, longTerm } = rows;
  if (BEARISH.has(badge) && pullback?.inRadar && (pullback.readiness === 'SOON' || pullback.readiness === 'ACT')) {
    return { tone: 'partial', text: 'Weak now, accumulation setup forming — small, staged size' };
  }
  if (BULLISH.has(badge) && momentum?.inRadar && momentum.readiness === 'ACT') {
    return { tone: 'good', text: 'Trend confirmed — breakout entry' };
  }
  if (longTerm?.status === 'ACCUMULATE') {
    return { tone: 'good', text: 'Quality on sale — long-term entry window' };
  }
  return null;
}

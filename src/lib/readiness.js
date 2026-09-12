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

// Display helpers for the Long-Term Setup UI: turn the timing/quality score
// component objects into labeled chips, mirroring how Setup Radar and Dip Hunter
// surface their own contributing indicators. Pure formatting — no new computation,
// no API calls. Component sub-scores are already produced by computeTimingScore /
// computeQualityScore; here we only label, cap, and colour them.

// [componentKey, short label, max] — order = display order. Timing maxes are
// imported from the engine itself so a cap change can't drift the UI; quality's
// caps are inline Math.min() literals in qualityScore.js and are mirrored here
// (tests/longTermIndicators.test.js asserts both sets still sum to 100).
import { TIMING_MAX } from './timingScore.js';

const TIMING = [
  ['drawdown', 'Drawdown', TIMING_MAX.drawdown],
  ['oversold', 'Oversold', TIMING_MAX.oversold],
  ['reversal', 'Reversal', TIMING_MAX.reversal],
  ['consolidation', 'Base', TIMING_MAX.consolidation],
  ['volumeBehavior', 'Volume', TIMING_MAX.volumeBehavior],
  ['marketContext', 'Market', TIMING_MAX.marketContext],
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

// ─── Colour coding ──────────────────────────────────────────────────────────
// One ramp across the whole Long-Term Setup card so a colour means the same thing
// everywhere: green = this is working in your favour, amber = partly there,
// slate = not contributing yet (what you're waiting on), dim grey = no data.
const TONE = {
  good:    { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },   // bull-strong
  partial: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },  // warning
  caution: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },  // bear-weak
  waiting: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.10)' }, // neutral slate
  none:    { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)' }, // no data
};

// Fill ratio → tone. A null component (missing input) is 'none', visibly distinct
// from a real zero, which is 'waiting' — a zero is information, a null is not.
export function chipTone(score, max) {
  if (score == null || !max) return 'none';
  const r = score / max;
  if (r >= 0.6) return 'good';
  if (r >= 0.3) return 'partial';
  return 'waiting';
}

export const chipColor = (score, max) => TONE[chipTone(score, max)].color;

// Inline style for a chip: text colour plus a matching background tint, so the
// row is scannable without reading each number.
export function chipStyle(score, max) {
  const t = TONE[chipTone(score, max)];
  return `color:${t.color};background:${t.bg}`;
}

// Status → tone. ACCUMULATE is the only "act" state; WATCHLIST is a good name
// waiting on timing; OVERSOLD_BUT_CAUTION is the opposite (timing is there, the
// quality gate is not) and gets its own colour so the two are never confused.
const STATUS_TONE = {
  ACCUMULATE: 'good',
  WATCHLIST: 'partial',
  OVERSOLD_BUT_CAUTION: 'caution',
  NEUTRAL: 'waiting',
  WAIT: 'waiting',
  INSUFFICIENT_DATA: 'none',
};

export const statusTone = (status) => STATUS_TONE[status] ?? 'none';
export const statusColor = (status) => TONE[statusTone(status)].color;
export const statusStyle = (status) => {
  const t = TONE[statusTone(status)];
  return `color:${t.color};background:${t.bg}`;
};

// ─── Band hints: what the score has to reach next ───────────────────────────
// The gate thresholds live in longTermSetup.js (timingBand / qualityBand). These
// mirror them for display only — the point is that a 42 reads as "18 short of the
// 50 that puts this on the watchlist", not as a bare number.
const TIMING_BANDS  = [[70, 'strong timing'], [50, 'watchlist timing']];
const QUALITY_BANDS = [[75, 'high quality'], [65, 'good quality'], [60, 'the quality gate']];

function bandHint(total, bands) {
  if (total == null) return null;
  if (total >= bands[0][0]) return null;              // already at the top band
  const [need, name] = bands.filter(([n]) => n > total).pop();
  return `${need - total} pts to ${name} (${need}+)`;
}

export const timingHint  = (total) => bandHint(total, TIMING_BANDS);
export const qualityHint = (total) => bandHint(total, QUALITY_BANDS);

// Totals use the gate bands, not the generic fill ratio: 70 is the timing gate
// and 60 the quality gate, so a 62 quality is 'partial' rather than 'waiting'.
export const timingTone  = (total) => total == null ? 'none' : total >= 70 ? 'good' : total >= 50 ? 'partial' : 'waiting';
export const qualityTone = (total) => total == null ? 'none' : total >= 65 ? 'good' : total >= 60 ? 'partial' : 'caution';
export const toneColor   = (tone) => (TONE[tone] ?? TONE.none).color;

// ─── What to wait for ───────────────────────────────────────────────────────
// The components with the most points still on the table — i.e. what has to
// improve before the entry gets better. Pure ranking of existing sub-scores:
// a null component is skipped (nothing is known about it, so it isn't a wait).
function gaps(defs, components, limit) {
  return chips(defs, components)
    .filter(c => c.score != null && c.score < c.max)
    .map(c => ({ ...c, gap: c.max - c.score }))
    .sort((a, b) => b.gap - a.gap || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export const waitingOn = (components, limit = 3) => gaps(TIMING, components, limit);
export const qualityWaitingOn = (components, limit = 3) => gaps(QUALITY, components, limit);

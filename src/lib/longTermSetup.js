// Long-Term Setup (Slice 3) — combines the independent Timing Score (Slice 1)
// and Quality Score (Slice 2) engines into one actionable status via a fixed
// gate matrix. Never blends the two totals into one number: a high-timing
// low-quality "falling knife" must stay visibly distinct from a genuine
// accumulation zone (OVERSOLD_BUT_CAUTION vs ACCUMULATE), which a blended
// score would erase.

function timingBand(timingScore) {
  const t = timingScore?.total ?? null;
  if (t !== null && t >= 70) return 'STRONG';
  if (t !== null && t >= 50) return 'WATCH';
  return 'WEAK';
}

function qualityBand(qualityScore) {
  const q = qualityScore?.total ?? null;
  const label = qualityScore?.label ?? null;
  if (label === 'INSUFFICIENT_DATA') return 'WEAK_OR_UNKNOWN';
  if (q !== null && q >= 75) return 'HIGH';
  if (q !== null && q >= 65) return 'GOOD';
  if (q !== null && q >= 60) return 'OK';
  return 'WEAK_OR_UNKNOWN';
}

const MATRIX = {
  STRONG: { HIGH: 'ACCUMULATE', GOOD: 'ACCUMULATE', OK: 'ACCUMULATE', WEAK_OR_UNKNOWN: 'OVERSOLD_BUT_CAUTION' },
  WATCH:  { HIGH: 'WATCHLIST',  GOOD: 'WATCHLIST',  OK: 'NEUTRAL',    WEAK_OR_UNKNOWN: 'NEUTRAL' },
  WEAK:   { HIGH: 'WAIT',       GOOD: 'WAIT',       OK: 'WAIT',       WEAK_OR_UNKNOWN: 'WAIT' },
};

function buildReasons(status, timingScore, qualityScore) {
  const t = timingScore?.total ?? null;
  const q = qualityScore?.total ?? null;
  const qLabel = qualityScore?.label ?? null;
  const qualityUnchecked = qualityScore == null;

  switch (status) {
    case 'ACCUMULATE':
      return [`Strong timing (${t}) + ${qLabel ?? 'confirmed'} quality (${q}) — accumulation zone`];
    case 'OVERSOLD_BUT_CAUTION':
      return qualityUnchecked || qLabel === 'INSUFFICIENT_DATA'
        ? [`Timing looks attractive but quality hasn't been checked yet — expand this ticker to fetch fundamentals`]
        : [`Deep drawdown/oversold but quality score ${q} is below the ≥60 gate — could be a value trap`];
    case 'WATCHLIST':
      return [`Good quality (${q}), timing not yet ripe (${t}) — watch for a better entry`];
    case 'NEUTRAL':
      return [`Timing and quality signals are mixed — no clear edge either way`];
    case 'WAIT':
      return [`Timing score too low (${t ?? 'n/a'}) — not yet an attractive entry moment`];
    case 'INSUFFICIENT_DATA':
      return [`Not enough data for either score yet — needs more price history and/or fundamentals`];
    default:
      return [];
  }
}

/**
 * @typedef {Object} LongTermSetup
 * @property {'ACCUMULATE'|'WATCHLIST'|'OVERSOLD_BUT_CAUTION'|'NEUTRAL'|'WAIT'|'INSUFFICIENT_DATA'} status
 * @property {Object|null} timingScore
 * @property {Object|null} qualityScore
 * @property {string[]} reasons
 */

/**
 * @param {Object|null} timingScore   computeTimingScore() output, or null if not yet run
 * @param {Object|null} qualityScore  computeQualityScore() output, or null if not yet fetched
 * @param {Object|null} marketContext currently unused here (Task 2 adds fearGreed)
 * @returns {LongTermSetup}
 */
export function buildLongTermSetup(timingScore, qualityScore, marketContext) {
  const tTotal = timingScore?.total ?? null;
  const qLabel = qualityScore?.label ?? null;
  const qMissing = qualityScore == null || qLabel === 'INSUFFICIENT_DATA';

  if (tTotal === null && qMissing) {
    return { status: 'INSUFFICIENT_DATA', timingScore: timingScore ?? null, qualityScore: qualityScore ?? null, reasons: buildReasons('INSUFFICIENT_DATA', timingScore, qualityScore) };
  }

  const status = MATRIX[timingBand(timingScore)][qualityBand(qualityScore)];
  return { status, timingScore: timingScore ?? null, qualityScore: qualityScore ?? null, reasons: buildReasons(status, timingScore, qualityScore) };
}

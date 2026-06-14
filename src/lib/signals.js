// Weekly leading-signal engine — pure functions.
// Adapted from range-finder/signal_engine.py for long-term stock entries.
// Runs on weekly OHLCV; reuses core math from indicators.js. Zero API calls.

import { computeRSI, computeMACD, emaArray } from './indicators.js';

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

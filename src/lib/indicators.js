// Local indicator computation from OHLC candle data (Finnhub format)
// Produces the same shape as twelvedata.svelte.js fetchIndicators()
// so the scoring engine is source-agnostic.

// ── EMA helper ───────────────────────────────────────────────────────────────
function emaArray(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  // Seed with SMA of first `period` values
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  result[period - 1] = seed / period;
  for (let i = period; i < values.length; i++) {
    result[i] = values[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

// ── RSI(14) using Wilder's smoothing ─────────────────────────────────────────
export function computeRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;

  // Wilder smoothing over remaining candles
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// RSI of last two candles for direction detection
function computeRSIPair(closes, period = 14) {
  if (closes.length < period + 2) return [null, null];
  const prev = computeRSI(closes.slice(0, -1), period);
  const curr = computeRSI(closes, period);
  return [curr, prev];
}

// ── MACD(12, 26, 9) ──────────────────────────────────────────────────────────
export function computeMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;

  const ema12 = emaArray(closes, fast);
  const ema26 = emaArray(closes, slow);

  // MACD line — valid only where both EMAs exist (from index slow-1)
  const macdLine = [];
  for (let i = slow - 1; i < closes.length; i++) {
    macdLine.push({ i, val: ema12[i] - ema26[i] });
  }

  if (macdLine.length < signal) return null;

  const macdVals = macdLine.map(m => m.val);
  const signalEma = emaArray(macdVals, signal);
  if (signalEma.length === 0) return null;

  const last = macdVals.length - 1;
  const prev = last - 1;

  const macdLast   = macdVals[last];
  const signalLast = signalEma[last];
  const histLast   = macdLast - signalLast;

  const macdPrev   = macdVals[prev] ?? null;
  const signalPrev = signalEma[prev] ?? null;
  const histPrev   = (macdPrev !== null && signalPrev !== null) ? macdPrev - signalPrev : null;

  const crossover =
    histPrev !== null && histLast > 0 && histPrev <= 0 ? 'bullish_cross' :
    histPrev !== null && histLast < 0 && histPrev >= 0 ? 'bearish_cross' :
    null;

  return {
    current: { macd: macdLast, signal: signalLast, histogram: histLast },
    crossover,
  };
}

// ── Main: compute all indicators from raw Finnhub candle response ─────────────
// raw shape: { c: [...], h: [...], l: [...], o: [...], t: [...], s: 'ok' }
export function computeIndicatorsFromCandles(raw) {
  if (!raw?.c || raw.s !== 'ok' || raw.c.length < 30) return null;

  const closes = raw.c;

  const [rsiCurr, rsiPrev] = computeRSIPair(closes);
  const macdResult = computeMACD(closes);

  return {
    rsi: rsiCurr !== null ? Math.round(rsiCurr * 10) / 10 : null,
    rsiDirection:
      rsiCurr !== null && rsiPrev !== null
        ? rsiCurr > rsiPrev + 0.1 ? 'rising'
        : rsiCurr < rsiPrev - 0.1 ? 'falling'
        : 'flat'
      : null,
    macd: macdResult ? macdResult.current : null,
    macdCrossover: macdResult ? macdResult.crossover : null,
    bb: null, // requires TwelveData
    source: 'local',
  };
}

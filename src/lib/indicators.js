// Local indicator computation from OHLC candle data (Finnhub format)
// Produces the same shape as twelvedata.svelte.js fetchIndicators()
// so the scoring engine is source-agnostic.

// ── EMA helper ───────────────────────────────────────────────────────────────
export function emaArray(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
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

// ── ADX(14) — local Wilder-smoothed computation for replay ───────────────────
function computeADXLocal(highs, lows, closes, period = 14) {
  if (highs.length < period * 2 + 1) return null;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < highs.length; i++) {
    const up   = highs[i] - highs[i - 1];
    const down = lows[i - 1] - lows[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  if (tr.length < period) return null;
  function wilderSmooth(arr, p) {
    let s = arr.slice(0, p).reduce((a, v) => a + v, 0);
    const out = [s];
    for (let i = p; i < arr.length; i++) { s = s - s / p + arr[i]; out.push(s); }
    return out;
  }
  const sTR = wilderSmooth(tr, period);
  const sPDM = wilderSmooth(plusDM, period);
  const sNDM = wilderSmooth(minusDM, period);
  const dx = sTR.map((t, i) => {
    if (t === 0) return 0;
    const dp = 100 * sPDM[i] / t;
    const dm = 100 * sNDM[i] / t;
    const s = dp + dm;
    return s === 0 ? 0 : 100 * Math.abs(dp - dm) / s;
  });
  if (dx.length < period) return null;
  const adxArr = wilderSmooth(dx, period);
  return Math.round(adxArr[adxArr.length - 1] * 10) / 10;
}

// ── ATR(14) from OHLC arrays ─────────────────────────────────────────────────
export function computeATR(highs, lows, closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    ));
  }
  const recent = trs.slice(-period);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

// ── Z-score of RSI vs its own rolling 90-candle history ─────────────────────
// Returns how many std-devs the current RSI is above/below its recent average.
// e.g. +1.8 = RSI unusually high vs recent history; -1.5 = unusually low.
export function computeRSIZScore(closes, period = 14) {
  if (!closes || closes.length < period + 30) return null;

  const windowSize = Math.min(closes.length - period, 90);
  const startIdx = closes.length - windowSize;

  const rsiHistory = [];
  for (let i = startIdx; i < closes.length; i++) {
    const rsi = computeRSI(closes.slice(0, i + 1), period);
    if (rsi !== null) rsiHistory.push(rsi);
  }

  if (rsiHistory.length < 5) return null;

  const current = rsiHistory[rsiHistory.length - 1];
  const mean = rsiHistory.reduce((s, v) => s + v, 0) / rsiHistory.length;
  const variance = rsiHistory.reduce((s, v) => s + (v - mean) ** 2, 0) / rsiHistory.length;
  const stddev = Math.sqrt(variance);

  if (stddev < 0.1) return 0;
  return Math.round(((current - mean) / stddev) * 10) / 10;
}

// ── Main: compute all indicators from raw Finnhub/TwelveData candle response ──
export function computeIndicatorsFromCandles(raw) {
  if (!raw?.c || raw.s !== 'ok' || raw.c.length < 30) return null;

  const closes = raw.c;
  const [rsiCurr, rsiPrev] = computeRSIPair(closes);
  const macdResult = computeMACD(closes);

  // EMA/SMA values — used in scoring + FundamentalsBar (no extra API credits)
  const ema20arr = emaArray(closes, 20);
  const ema50arr = emaArray(closes, 50);
  const ema20 = ema20arr.length > 0 ? Math.round(ema20arr[ema20arr.length - 1] * 100) / 100 : null;
  const ema50 = ema50arr.length > 0 ? Math.round(ema50arr[ema50arr.length - 1] * 100) / 100 : null;
  const ema200arr = emaArray(closes, 200);
  const ema200 = ema200arr.length > 0 ? Math.round(ema200arr[ema200arr.length - 1] * 100) / 100 : null;

  return {
    rsi: rsiCurr !== null ? Math.round(rsiCurr * 10) / 10 : null,
    rsiDirection:
      rsiCurr !== null && rsiPrev !== null
        ? rsiCurr > rsiPrev + 0.1 ? 'rising'
        : rsiCurr < rsiPrev - 0.1 ? 'falling'
        : 'flat'
      : null,
    rsiZScore: computeRSIZScore(closes),
    macd: macdResult ? macdResult.current : null,
    macdCrossover: macdResult ? macdResult.crossover : null,
    bb: null,
    ema20,
    ema50,
    ema200,
    source: 'local',
  };
}

// ── Weekly trend from weekly candle data ─────────────────────────────────────
export function computeWeeklyTrend(raw) {
  if (!raw?.c || raw.s !== 'ok' || raw.c.length < 14) return null;

  const closes = raw.c;
  const highs  = raw.h;
  const lows   = raw.l;

  const rsi = computeRSI(closes);
  const ema10arr = emaArray(closes, 10);
  const ema10 = ema10arr[ema10arr.length - 1] ?? null;
  const price = closes[closes.length - 1];
  const prevEma = ema10arr[ema10arr.length - 2] ?? null;
  const macdResult = computeMACD(closes);
  const atr = computeATR(highs, lows, closes);

  // EMA slope
  const emaRising = ema10 !== null && prevEma !== null && ema10 > prevEma;
  const aboveEma  = ema10 !== null && price > ema10;

  // Derive trend
  let bullCount = 0, bearCount = 0;
  if (aboveEma)  bullCount++; else bearCount++;
  if (emaRising) bullCount++; else bearCount++;
  if (rsi !== null) {
    if (rsi > 55) bullCount++;
    else if (rsi < 45) bearCount++;
  }
  if (macdResult?.current) {
    if (macdResult.current.histogram > 0) bullCount++;
    else bearCount++;
  }

  const trend = bullCount >= 3 ? 'up' : bearCount >= 3 ? 'down' : 'neutral';

  return {
    trend,
    rsi: rsi !== null ? Math.round(rsi * 10) / 10 : null,
    ema10,
    aboveEma,
    atr,
    macd: macdResult?.current ?? null,
  };
}

// ── Replay: compute technical snapshot at a specific candle index ─────────────
// Used by ReplayPanel to scrub through historical dates.
export function computeSnapshotAt(raw, index) {
  if (!raw?.c || raw.s !== 'ok') return null;

  const i = Math.max(0, Math.min(index, raw.c.length - 1));
  const closes = raw.c.slice(0, i + 1);
  const highs  = raw.h ? raw.h.slice(0, i + 1) : [];
  const lows   = raw.l ? raw.l.slice(0, i + 1) : [];

  const price    = closes[closes.length - 1];
  const prevClose = closes.length >= 2 ? closes[closes.length - 2] : null;
  const dp = prevClose ? ((price - prevClose) / prevClose) * 100 : null;

  const rsi = computeRSI(closes);
  const macdResult = computeMACD(closes);
  const atr = highs.length >= 15 ? computeATR(highs, lows, closes) : null;

  const ema20arr = emaArray(closes, 20);
  const ema20 = ema20arr.length > 0 ? ema20arr[ema20arr.length - 1] : null;
  const adx = highs.length >= 29 ? computeADXLocal(highs, lows, closes) : null;

  // Simple tech reading from available signals
  let bull = 0, bear = 0;
  if (dp !== null) { if (dp > 1) bull++; else if (dp < -1) bear++; }
  if (rsi !== null) { if (rsi < 40) bull++; else if (rsi > 65) bear++; }
  if (macdResult?.current) { if (macdResult.current.histogram > 0) bull++; else bear++; }
  if (ema20 !== null) { if (price > ema20) bull++; else bear++; }

  const reading =
    bull >= 3 ? 'BULLISH' :
    bear >= 3 ? 'BEARISH' :
    bull > bear ? 'LEANING LONG' :
    bear > bull ? 'LEANING SHORT' : 'NEUTRAL';

  return {
    date: raw.t ? new Date(raw.t[i] * 1000) : null,
    price,
    open:   raw.o ? raw.o[i] : null,
    high:   raw.h ? raw.h[i] : null,
    low:    raw.l ? raw.l[i] : null,
    volume: raw.v ? raw.v[i] : null,
    dp,
    rsi: rsi !== null ? Math.round(rsi * 10) / 10 : null,
    macd: macdResult?.current ?? null,
    macdCrossover: macdResult?.crossover ?? null,
    ema20,
    atr,
    adx,
    reading,
  };
}

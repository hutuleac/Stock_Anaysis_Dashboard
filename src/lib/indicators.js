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

// ── Main: compute all indicators from raw Finnhub candle response ─────────────
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
    bb: null,
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
    reading,
  };
}

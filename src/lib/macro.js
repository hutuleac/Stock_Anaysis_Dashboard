// Pure macro-regime math over FRED series — no fetch, no runes.
// Data source + caching live in api/fred.js.

import { emaArray } from './indicators.js';

// FRED marks missing observations with the string '.' (weekends/holidays on
// daily series like T10Y2Y). Returns [{ date, value }] newest-first.
export function parseFredObservations(json) {
  const obs = json?.observations;
  if (!Array.isArray(obs)) return [];
  return obs
    .map(o => ({ date: o.date, value: parseFloat(o.value) }))
    .filter(o => Number.isFinite(o.value));
}

// series: { T10Y2Y: [{date,value},…], FEDFUNDS: […], CPIAUCSL: […], UNRATE: […] }
// each newest-first (FRED sort_order=desc). Any series may be null/empty.
export function deriveMacroRegime(series) {
  const t10y2y  = series?.T10Y2Y?.[0]?.value ?? null;
  const ffNow   = series?.FEDFUNDS?.[0]?.value ?? null;
  const ffPrev  = series?.FEDFUNDS?.[1]?.value ?? null;
  const hyNow   = series?.BAMLH0A0HYM2?.[0]?.value ?? null;
  if (t10y2y === null && ffNow === null && hyNow === null) return null;

  // HY credit spread stress: daily obs newest-first, index 20 ≈ 20 trading
  // days back. STRESS = level > 5% or +0.5pp in ~20 sessions (systemic risk,
  // not a buyable dip); ELEVATED = 4–5%; CALM below. Thresholds would have
  // flagged 2008, 2020, and 2022 — tune here if the tape says otherwise.
  const hyPrev = series?.BAMLH0A0HYM2?.[20]?.value ?? null;
  const hyDelta20d = hyNow !== null && hyPrev !== null
    ? Math.round((hyNow - hyPrev) * 100) / 100
    : null;
  const creditStress = hyNow === null ? null
    : (hyNow > 5 || (hyDelta20d !== null && hyDelta20d >= 0.5)) ? 'STRESS'
    : hyNow >= 4 ? 'ELEVATED'
    : 'CALM';

  // CPI YoY needs the observation 12 months back (13 obs fetched)
  const cpiNow  = series?.CPIAUCSL?.[0]?.value ?? null;
  const cpiYago = series?.CPIAUCSL?.[12]?.value ?? null;
  const cpiYoY  = cpiNow !== null && cpiYago > 0
    ? ((cpiNow / cpiYago) - 1) * 100
    : null;

  return {
    curveInverted: t10y2y !== null && t10y2y < 0,
    fedRising:     ffNow !== null && ffPrev !== null && ffNow > ffPrev,
    t10y2y,
    fedFunds:      ffNow,
    fedFundsPrev:  ffPrev,
    cpi:           cpiNow,
    cpiYoY,
    unemployment:  series?.UNRATE?.[0]?.value ?? null,
    hySpread:      hyNow,
    hyDelta20d,
    creditStress,
  };
}

// Composite market regime for timingScore.js's adaptive drawdown/oversold bands.
// Reuses data App.svelte already fetches for RS/vol/F&G/macro each refresh —
// zero new API calls. spyCloses: oldest-first daily closes (needs 200+ bars).
export function detectMarketRegime({ spyCloses, volProxy, fearGreed, macro } = {}) {
  if (!spyCloses || spyCloses.length < 200) return null;

  const ema50arr = emaArray(spyCloses, 50);
  const ema200arr = emaArray(spyCloses, 200);
  const price = spyCloses[spyCloses.length - 1];
  const ema50 = ema50arr[ema50arr.length - 1];
  const ema200 = ema200arr[ema200arr.length - 1];
  if (ema50 == null || ema200 == null) return null;

  let regime = price > ema50 && ema50 > ema200 ? 'BULL'
    : price < ema50 && ema50 < ema200 ? 'BEAR'
    : 'CHOP';

  // Trailing 120-day max drawdown of SPY itself — "how deep do dips get right
  // now", the actual number the BULL threshold tables are meant to track.
  const window = spyCloses.slice(-120);
  let peak = -Infinity, maxDd = 0;
  for (const c of window) {
    peak = Math.max(peak, c);
    maxDd = Math.min(maxDd, ((c - peak) / peak) * 100);
  }
  const pullbackScale = Math.round(maxDd * 10) / 10;

  // Vol spike downgrades a nominal bull read: price can sit above its EMAs
  // while the tape itself is unstable (a violent low-quality rally).
  if (regime === 'BULL' && volProxy != null && volProxy > 30) regime = 'CHOP';

  // Extreme greed inside a confirmed bull is late-cycle, not a downgrade —
  // dips are still shallow, just size down (handled as a warning upstream).
  if (regime === 'BULL' && fearGreed != null && fearGreed > 75) regime = 'BULL_LATE';

  // Macro overlay gates last: systemic risk overrides a benign price/vol read.
  if ((macro?.creditStress === 'STRESS' || macro?.curveInverted) && regime !== 'BEAR') {
    regime = 'CHOP';
  }

  return { regime, pullbackScale };
}

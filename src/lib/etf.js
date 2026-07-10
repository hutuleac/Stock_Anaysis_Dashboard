// ETF entry/exit signal engine — display-only, weekly cadence (months-to-a-year horizon).
// Signals run on the US-listed proxy of each UCITS ETF (see etflist store).
import { computeRSI, emaArray, computeMACD, computeRelativeStrength } from './indicators.js';
import { detectDivergence } from './signals.js';

const round1 = (v) => Math.round(v * 10) / 10;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readinessFor(score) {
  if (score >= 7) return 'ACT';
  if (score >= 5) return 'SOON';
  if (score >= 3) return 'WATCH';
  return 'WAIT';
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreEtfEntry({ rsiW, belowLowerBB, rs3m, groupMedianRs3m, macdCross, divergence, drawdownPct }) {
  const components = [];

  const rsi = num(rsiW);
  let oversold = rsi === null ? 0 : rsi < 30 ? 2.0 : rsi < 35 ? 1.5 : rsi < 40 ? 0.75 : 0;
  if (belowLowerBB === true) oversold += 1.0;
  oversold = Math.min(oversold, 3.0);
  components.push({ label: 'Oversold', score: oversold, max: 3.0,
    detail: rsi === null ? 'n/a' : `wRSI ${Math.round(rsi)}${belowLowerBB ? ', ≤ lower BB' : ''}` });

  const r3 = num(rs3m);
  let rotation = 0;
  let rotDetail = 'n/a';
  if (r3 !== null) {
    if (r3 < -25) {
      rotDetail = `RS3m ${r3}% — falling knife`;
    } else {
      rotation += r3 <= -10 ? 1.5 : r3 <= -5 ? 1.0 : r3 <= -3 ? 0.5 : 0;
      const med = num(groupMedianRs3m);
      if (med !== null) {
        const gap = med - r3;
        rotation += gap >= 8 ? 1.5 : gap >= 4 ? 1.0 : gap >= 2 ? 0.5 : 0;
      }
      rotDetail = `RS3m ${r3 > 0 ? '+' : ''}${r3}% vs SPY`;
    }
  }
  components.push({ label: 'Rotation', score: rotation, max: 3.0, detail: rotDetail });

  let turn = 0;
  const turnParts = [];
  if (macdCross === 'bullish_cross') { turn += 1.0; turnParts.push('MACD bull cross'); }
  if (divergence?.type === 'BULL') { turn += 1.0; turnParts.push('bull divergence'); }
  components.push({ label: 'Turn', score: turn, max: 2.0,
    detail: turnParts.length ? turnParts.join(', ') : 'no turn yet' });

  const dd = num(drawdownPct);
  const drawdown = dd === null ? 0 : dd >= 20 ? 2.0 : dd >= 12 ? 1.5 : dd >= 8 ? 1.0 : dd >= 5 ? 0.5 : 0;
  components.push({ label: 'Drawdown', score: drawdown, max: 2.0,
    detail: dd === null ? 'n/a' : `−${Math.round(dd)}% off 52w high` });

  const score = round1(components.reduce((s, c) => s + c.score, 0));
  return { score, components, readiness: readinessFor(score) };
}

export function scoreEtfExit({ rsiW, extensionPct, rs1m, rs3m, volumeRatio }) {
  const components = [];

  const rsi = num(rsiW);
  const overbought = rsi === null ? 0 : rsi >= 75 ? 3.0 : rsi >= 70 ? 2.0 : rsi >= 65 ? 1.0 : 0;
  components.push({ label: 'Overbought', score: overbought, max: 3.0,
    detail: rsi === null ? 'n/a' : `wRSI ${Math.round(rsi)}` });

  const ext = num(extensionPct);
  const extension = ext === null ? 0 : ext >= 25 ? 3.0 : ext >= 18 ? 2.0 : ext >= 12 ? 1.0 : 0;
  components.push({ label: 'Extension', score: extension, max: 3.0,
    detail: ext === null ? 'n/a' : `${ext > 0 ? '+' : ''}${Math.round(ext)}% vs wEMA30` });

  const r1 = num(rs1m), r3 = num(rs3m);
  let rotLoss = 0;
  if (r1 !== null && r3 !== null) {
    if (r1 <= -2 && r3 >= 5) rotLoss = 2.0;
    else if (r1 < 0 && r3 > 0) rotLoss = 1.0;
  }
  components.push({ label: 'Rotation Loss', score: rotLoss, max: 2.0,
    detail: r1 === null ? 'n/a' : `RS1m ${r1 > 0 ? '+' : ''}${r1}%, RS3m ${r3 > 0 ? '+' : ''}${r3}%` });

  const vr = num(volumeRatio);
  const climax = (rsi !== null && rsi >= 60 && vr !== null)
    ? (vr >= 2 ? 2.0 : vr >= 1.5 ? 1.0 : 0) : 0;
  components.push({ label: 'Climax Vol', score: climax, max: 2.0,
    detail: vr === null ? 'n/a' : `${vr.toFixed(1)}× avg wVol` });

  const score = round1(components.reduce((s, c) => s + c.score, 0));
  return { score, components, readiness: readinessFor(score) };
}

// list: [{ proxy, weeklyRaw: {s,t,o,h,l,c,v}, dailyCloses: number[] }]
// spyCloses: daily SPY closes (ascending) or null
export function computeEtfSignals(list, spyCloses) {
  const out = {};

  // Pass 1: relative strength per proxy (needed for the group median)
  const rsMap = {};
  for (const { proxy, dailyCloses } of list) {
    rsMap[proxy] = (spyCloses?.length && dailyCloses?.length)
      ? computeRelativeStrength(dailyCloses, spyCloses)
      : { rs1m: null, rs3m: null };
  }
  const groupMedianRs3m = median(
    Object.values(rsMap).map(r => r.rs3m).filter(v => v !== null)
  );

  // Pass 2: score each proxy
  for (const { proxy, weeklyRaw, dailyCloses } of list) {
    if (!weeklyRaw?.c || weeklyRaw.s !== 'ok' || weeklyRaw.c.length < 20 || !dailyCloses?.length) {
      out[proxy] = null;
      continue;
    }
    const wc = weeklyRaw.c;
    const wh = weeklyRaw.h ?? wc;
    const wl = weeklyRaw.l ?? wc;
    const wv = weeklyRaw.v ?? [];
    const price = dailyCloses[dailyCloses.length - 1];

    const rsiW = computeRSI(wc);
    const macd = computeMACD(wc);
    const divergence = detectDivergence(wc, wh, wl);

    // Weekly BB(20,2) lower band — population σ, same convention as indicators.js
    const last20 = wc.slice(-20);
    const mean = last20.reduce((s, v) => s + v, 0) / 20;
    const sd = Math.sqrt(last20.reduce((s, v) => s + (v - mean) ** 2, 0) / 20);
    const belowLowerBB = wc[wc.length - 1] <= mean - 2 * sd;

    // Drawdown from ~52w daily high
    const hi52 = Math.max(...dailyCloses.slice(-252));
    const drawdownPct = hi52 > 0 ? ((hi52 - price) / hi52) * 100 : null;

    // Extension above weekly EMA30
    const ema30arr = emaArray(wc, 30);
    const ema30 = ema30arr.length ? ema30arr[ema30arr.length - 1] : null;
    const extensionPct = ema30 ? ((wc[wc.length - 1] - ema30) / ema30) * 100 : null;

    // Weekly volume ratio: last bar vs avg of prior 20
    let volumeRatio = null;
    if (wv.length >= 21) {
      const prior = wv.slice(-21, -1);
      const avg = prior.reduce((s, v) => s + v, 0) / prior.length;
      if (avg > 0) volumeRatio = wv[wv.length - 1] / avg;
    }

    // ── Display-only indicators (v0.17) — rendered in the expanded row, never scored
    const ema10arrW = emaArray(wc, 10);
    const ema10 = ema10arrW.length ? ema10arrW[ema10arrW.length - 1] : null;
    const wClose = wc[wc.length - 1];
    let trendState = null;
    if (ema10 != null && ema30 != null) {
      if (wClose > ema10 && wClose > ema30 && ema10 > ema30) trendState = 'UPTREND';
      else if (wClose < ema10 && wClose < ema30) trendState = 'DOWNTREND';
      else if (wClose < ema10 && wClose >= ema30) trendState = 'PULLBACK';
      else trendState = 'BASING';
    }

    const win52 = dailyCloses.slice(-252);
    const lo52 = Math.min(...win52);
    const rangePos52w = hi52 > lo52 ? Math.round(((price - lo52) / (hi52 - lo52)) * 100) : null;

    const roc13w = wc.length >= 14 && wc[wc.length - 14] > 0
      ? round1((wClose / wc[wc.length - 14] - 1) * 100)
      : null;

    const rs = rsMap[proxy];
    out[proxy] = {
      price,
      rs,
      groupMedianRs3m,
      indicators: {
        trendState,
        wRsi: rsiW == null ? null : Math.round(rsiW),
        rangePos52w,
        roc13w,
      },
      entry: scoreEtfEntry({
        rsiW, belowLowerBB, rs3m: rs.rs3m, groupMedianRs3m,
        macdCross: macd?.crossover ?? null, divergence, drawdownPct,
      }),
      exit: scoreEtfExit({
        rsiW, extensionPct, rs1m: rs.rs1m, rs3m: rs.rs3m, volumeRatio,
      }),
    };
  }
  return out;
}

// Plain-English explanation of the entry/exit picture — display-only,
// built strictly from component scores already computed above.
const TREND_PHRASE = {
  UPTREND: 'uptrend intact',
  PULLBACK: 'pulling back within an uptrend',
  BASING: 'basing — no established trend',
  DOWNTREND: 'in a weekly downtrend',
};

export function generateEtfThesis(sig) {
  if (!sig?.entry || !sig?.exit) return null;
  const { entry, exit } = sig;
  const ind = sig.indicators ?? {};
  const entryLed = entry.score >= exit.score;
  const lead = entryLed ? entry : exit;
  const firing = lead.components.filter(c => c.score > 0);

  let first;
  if (!firing.length) {
    first = entryLed
      ? 'No entry signals firing — nothing to buy into here yet.'
      : 'No exit signals firing — no exhaustion pressure visible.';
  } else {
    const parts = firing.map(c => `${c.label.toLowerCase()} (${c.detail})`).join(', ');
    first = `${entryLed ? 'Entry' : 'Exit'} case ${lead.score}/10 (${lead.readiness}): ${parts}.`;
  }

  const trendPhrase = TREND_PHRASE[ind.trendState] ?? null;
  let second = trendPhrase ? `Trend: ${trendPhrase}.` : '';
  if (entryLed && entry.score >= 3) {
    const turn = entry.components.find(c => c.label === 'Turn');
    if (turn && turn.score === 0) second += ` No reversal confirmation yet — MACD hasn't turned.`;
  }
  return second ? `${first} ${second}` : first;
}

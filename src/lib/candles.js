// Daily bars per TwelveData time_series fetch — and the cache key suffix the
// startup hydrate reads (`td_ts_1day_<sym>_1day_<N>`), so every site must use it.
// 400 trading days ≈ 19 monthly bars: monthly RSI(14) needs 15. 250 gave ~12.
export const TD_DAILY_BARS = 400;

// TwelveData → Finnhub-style synthetic candles.
// TD /time_series values arrive oldest-first (order=ASC) with string numerics;
// this is the one shared mapping for all four App.svelte consumption sites.
// Parity with the legacy inline blocks is deliberate: bad numerics stay NaN.
export function tdValuesToCandles(vals) {
  if (!vals?.length) return null;
  return {
    s: 'ok',
    t: vals.map(v => Math.floor(new Date(v.datetime + 'T00:00:00Z').getTime() / 1000)),
    o: vals.map(v => parseFloat(v.open)),
    h: vals.map(v => parseFloat(v.high)),
    l: vals.map(v => parseFloat(v.low)),
    c: vals.map(v => parseFloat(v.close)),
    v: vals.map(v => parseInt(v.volume, 10)),
  };
}

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

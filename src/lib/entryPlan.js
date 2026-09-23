// Entry plan for the expanded row: stop, target, R:R and the price-ladder
// geometry, in one pure function so the panel only formats.
// Stop = entry − 2× weekly ATR (horizon-appropriate for multi-week holds);
// target = most significant swing high (chartAnchors fib.swingHigh), used only
// when it sits above entry. Ladder spans stop → max(3R, target).
export function entryPlan({ price, weeklyAtr, target = null }) {
  if (!(price > 0) || !(weeklyAtr > 0)) return null;
  const risk = 2 * weeklyAtr;
  const stop = price - risk;
  if (stop <= 0) return null;
  const tgt = target > price ? target : null;

  const pts = [
    ['stop', stop], ['entry', price],
    ['1R', price + risk], ['2R', price + 2 * risk], ['3R', price + 3 * risk],
  ];
  if (tgt) pts.push(['target', tgt]);
  const hi = Math.max(price + 3 * risk, tgt ?? 0);
  const pos = (v) => ((v - stop) / (hi - stop)) * 100;

  return {
    stop,
    stopPct: (-risk / price) * 100,
    target: tgt,
    targetPct: tgt ? ((tgt - price) / price) * 100 : null,
    rr: tgt ? (tgt - price) / risk : null,
    levels: pts.map(([key, p]) => ({ key, price: p, pos: pos(p) })),
  };
}

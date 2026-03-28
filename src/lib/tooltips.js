// Plain-English "so what" tooltip text for every technical indicator reading.
// Used as title= attributes in FundamentalsBar and WatchlistTable.

export function rsiTooltip(rsi) {
  if (rsi == null) return null;
  if (rsi < 25) return `RSI ${rsi.toFixed(0)} — deeply oversold; watch for reversal candle before entering`;
  if (rsi < 35) return `RSI ${rsi.toFixed(0)} — approaching oversold; potential base forming`;
  if (rsi < 45) return `RSI ${rsi.toFixed(0)} — mild weakness, no strong directional signal`;
  if (rsi < 55) return `RSI ${rsi.toFixed(0)} — neutral momentum`;
  if (rsi < 65) return `RSI ${rsi.toFixed(0)} — healthy momentum, uptrend intact`;
  if (rsi < 75) return `RSI ${rsi.toFixed(0)} — overbought territory; momentum extended, tighten stop`;
  return `RSI ${rsi.toFixed(0)} — heavily overbought; reversal risk elevated, avoid chasing`;
}

export function macdTooltip(macd, crossover) {
  if (!macd) return null;
  const { histogram, macd: m, signal: s } = macd;
  if (crossover === 'bullish_cross') return 'MACD: fresh bullish crossover — strongest momentum shift signal; buy zone';
  if (crossover === 'bearish_cross') return 'MACD: fresh bearish crossover — momentum turned negative; exit or hedge';
  if (histogram > 0 && m > s) return 'MACD: bullish and accelerating — trend has fuel, stay long';
  if (histogram > 0) return 'MACD: bullish but decelerating — watch for MACD stall before adding';
  if (histogram < 0 && m < s) return 'MACD: bearish and accelerating — downtrend in control, avoid longs';
  return 'MACD: bearish momentum slowing — possible base forming, wait for confirmation';
}

export function adxTooltip(adx) {
  if (adx == null) return null;
  if (adx > 40) return `ADX ${adx.toFixed(0)} — very strong trend; ride it until slope flattens or reverses`;
  if (adx > 30) return `ADX ${adx.toFixed(0)} — strong trend; momentum signals are reliable here`;
  if (adx > 25) return `ADX ${adx.toFixed(0)} — trending; directional trades have an edge`;
  if (adx > 20) return `ADX ${adx.toFixed(0)} — weak trend emerging; signals less reliable`;
  return `ADX ${adx.toFixed(0)} — ranging market; wait for breakout before trading momentum`;
}

export function stochTooltip(k, cross) {
  if (k == null) return null;
  if (cross === 'bullish_cross' && k < 30) return `Stoch ${k.toFixed(0)} — oversold bull cross: high-conviction reversal signal`;
  if (cross === 'bullish_cross') return `Stoch ${k.toFixed(0)} — bullish cross in neutral zone: moderate entry signal`;
  if (cross === 'bearish_cross' && k > 70) return `Stoch ${k.toFixed(0)} — overbought bear cross: high-conviction sell signal`;
  if (cross === 'bearish_cross') return `Stoch ${k.toFixed(0)} — bearish cross: momentum fading`;
  if (k < 20) return `Stoch ${k.toFixed(0)} — deeply oversold; look for reversal candle`;
  if (k < 35) return `Stoch ${k.toFixed(0)} — approaching oversold; building a base`;
  if (k > 80) return `Stoch ${k.toFixed(0)} — deeply overbought; risk of near-term pullback`;
  if (k > 65) return `Stoch ${k.toFixed(0)} — elevated; watch for rollover`;
  return `Stoch ${k.toFixed(0)} — neutral range, no strong directional signal`;
}

export function rsiZScoreTooltip(z) {
  if (z == null) return null;
  const abs = Math.abs(z);
  const sign = z >= 0 ? '+' : '';
  if (abs < 0.5) return `RSI z-score ${sign}${z.toFixed(1)}: in line with its own 90-day average`;
  if (z > 2.0) return `RSI z-score ${sign}${z.toFixed(1)}: unusually high vs recent 90 days — momentum extended vs own history`;
  if (z < -2.0) return `RSI z-score ${sign}${z.toFixed(1)}: unusually low vs recent 90 days — oversold vs own baseline`;
  if (z > 1.0) return `RSI z-score ${sign}${z.toFixed(1)}: above-average RSI vs recent history`;
  if (z < -1.0) return `RSI z-score ${sign}${z.toFixed(1)}: below-average RSI vs recent history`;
  if (z > 0) return `RSI z-score ${sign}${z.toFixed(1)}: slightly elevated vs recent average`;
  return `RSI z-score ${sign}${z.toFixed(1)}: slightly depressed vs recent average`;
}

export function convictionTooltip(conviction, label) {
  if (conviction == null) return null;
  const desc = {
    HIGH:     'signals strongly agree — high-confidence setup',
    MODERATE: 'most signals agree — solid directional case',
    LOW:      'signals weakly agree — treat as tentative',
    MIXED:    'signals conflict — thesis is fragile, size down',
  };
  return `${label} conviction: ${conviction}% of signals agree. ${desc[label] ?? ''}`;
}

export function scoreTooltip(score, conviction, convictionLabel) {
  if (score == null) return null;
  const dir = score >= 58 ? 'bullish' : score >= 42 ? 'neutral' : 'bearish';
  const convNote = conviction != null
    ? ` ${convictionLabel} conviction (${conviction}% of signals agree).`
    : '';
  return `Score ${score} — ${dir} bias.${convNote}`;
}

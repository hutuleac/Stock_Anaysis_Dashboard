// AI export — formats a ticker's full dashboard reading as a plain-text
// snapshot and merges it into a prompt template for external LLMs.
// Pure logic, display-only: reads data already on the ticker object,
// no API calls, nothing here feeds computeScore or the setup engines.
import { computeScore, getDaysToEarnings } from './scoring.js';
import { computePEG } from './valuation.js';
import { pct52wRange } from './indicators.js';
import { computeDipRadar } from './dip.js';

const NA = 'n/a';
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
function fmt(v, suffix = '') { const n = num(v); return n === null ? NA : `${n}${suffix}`; }
function fmtSigned(v, suffix = '%') { const n = num(v); return n === null ? NA : `${n > 0 ? '+' : ''}${n}${suffix}`; }

// Same 5 bands as FundamentalsBar's rsiLabel — keep in sync.
function rsiLabel(rsi) {
  if (rsi < 30) return 'Oversold';
  if (rsi < 40) return 'Mild Oversold';
  if (rsi <= 60) return 'Neutral';
  if (rsi <= 70) return 'Extended';
  return 'Overbought';
}

function fgZone(fg) {
  if (fg < 25) return 'Extreme Fear';
  if (fg < 45) return 'Fear';
  if (fg < 55) return 'Neutral';
  if (fg < 75) return 'Greed';
  return 'Extreme Greed';
}

function setupLine(name, su) {
  if (!su) return `${name} ${NA}`;
  const eta = su.etaWeeks != null ? `, ~${su.etaWeeks}w` : '';
  return `${name} ${fmt(su.score)}/10 (${su.readiness ?? NA}${eta})`;
}

export function buildStockSnapshot(ticker, d, marketCtx) {
  const symbol = ticker?.symbol ?? '?';
  const q = d?.quote?.data ?? {};
  const m = d?.metrics?.data?.metric ?? {};
  const ind = d?.indicators ?? {};
  const s = computeScore(d ?? {});

  const price = num(q.c);
  const rangePos = pct52wRange(price, num(m['52WeekLow']), num(m['52WeekHigh']));
  const rsi = num(ind.rsi);
  const macdLine = ind.macdCrossover
    ? `${ind.macdCrossover.replaceAll('_', ' ')}${num(ind.macd?.histogram) !== null ? `, hist ${ind.macd.histogram > 0 ? '+' : ''}${ind.macd.histogram}` : ''}`
    : NA;
  const bbLine = num(ind.bb?.upper) !== null && price !== null
    ? (price > ind.bb.upper ? 'above upper band' : num(ind.bb?.lower) !== null && price < ind.bb.lower ? 'below lower band' : 'inside bands')
    : NA;
  const pe = num(m.peNormalizedAnnual) ?? num(m.peBasicExclExtraTTM);
  const eps = num(m.epsGrowthTTMYoy);
  const peg = eps !== null && pe !== null ? computePEG(pe, eps) : null;
  const sm = d?.smartMoney?.data;
  const buyPct = num(sm?.rec?.buyRatio) !== null ? Math.round(sm.rec.buyRatio * 100) : null;
  const dipHit = d ? (computeDipRadar(
    [{ symbol, data: d }],
    { fearGreedValue: marketCtx?.fearGreedValue ?? null, spyBelowEma50: marketCtx?.spyDowntrend === true }
  )[0] ?? null) : null;
  const fg = num(marketCtx?.fearGreedValue);
  const days = getDaysToEarnings(d?.earnings);

  const lines = [
    `=== ${symbol}${ticker?.name ? ` — ${ticker.name}` : ''}${ticker?.sector ? ` (${ticker.sector})` : ''} ===`,
    `Snapshot date: ${new Date().toISOString().slice(0, 10)} (data from my offline dashboard — verify anything time-sensitive)`,
    '',
    `PRICE: ${price !== null ? `$${price}` : NA} (${fmtSigned(q.dp)} today) · 52w range position: ${fmt(rangePos, '%')} · 20d ROC ${fmtSigned(ind.roc20)} · 60d ROC ${fmtSigned(ind.roc60)}`,
    `DASHBOARD SCORE: ${fmt(s.score)}/100 — ${s.badge ?? NA}, conviction ${s.convictionLabel ?? NA}` +
      ` (technical ${fmt(s.technical)}, fundamental ${fmt(s.fundamental)}, sentiment ${fmt(s.sentiment)})` +
      (s.regimeNote ? ` · note: ${s.regimeNote}` : ''),
    `TECHNICALS (daily): RSI ${rsi !== null ? `${rsi} (${rsiLabel(rsi)}, ${ind.rsiDirection ?? NA})` : NA} · MACD ${macdLine} · ADX ${fmt(ind.adx)} · Stoch %K ${fmt(ind.stochK)} · EMA stack: ${ind.emaStack ?? NA} · Bollinger: ${bbLine} · ATR ${fmt(ind.atr)} (weekly ${fmt(d?.weekly?.atr)})`,
    `SETUPS (weekly): ${setupLine('Pullback', d?.setups?.pullback)} · ${setupLine('Momentum', d?.setups?.momentum)} · weekly RSI ${fmt(d?.setups?.meta?.wRsi)}`,
    `FUNDAMENTALS: P/E ${fmt(pe)} · PEG ${peg !== null ? Math.round(peg * 10) / 10 : NA} · EPS growth ${fmtSigned(eps)} · Rev growth ${fmtSigned(m.revenueGrowthTTMYoy)} · Net margin ${fmt(m.netProfitMarginTTM, '%')} · P/S ${fmt(m.psTTM)} · Div yield ${fmt(m.dividendYieldIndicatedAnnual, '%')}`,
    `REL. STRENGTH vs SPY: 1M ${fmtSigned(d?.rs?.rs1m)} · 3M ${fmtSigned(d?.rs?.rs3m)}`,
    `SMART MONEY: insider MSPR ${fmtSigned(sm?.mspr3m, '')} · analysts ${fmt(buyPct, '% buy')}${sm?.rec?.deteriorating === true ? ' (deteriorating)' : ''}`,
    `DIP SCORE: ${dipHit ? `${dipHit.score}/10 (${dipHit.readiness})` : 'none (no qualifying dip)'}`,
    `MARKET CONTEXT: vol proxy ${fmt(marketCtx?.vixPrice)} · Fear&Greed ${fg !== null ? `${fg} (${fgZone(fg)})` : NA} · ${marketCtx?.spyDowntrend === true ? 'SPY downtrend' : marketCtx?.spyDowntrend === false ? 'SPY uptrend' : `SPY trend ${NA}`}`,
    `EARNINGS: ${days !== null ? `in ${days} days` : NA}`,
  ];
  return lines.join('\n');
}

export function buildPrompt(templateBody, snapshot, symbol) {
  return String(templateBody ?? '')
    .replaceAll('{{DATA}}', snapshot ?? '')
    .replaceAll('{{TICKER}}', symbol ?? '')
    .replaceAll('{{DATE}}', new Date().toISOString().slice(0, 10));
}

export const DEFAULT_TEMPLATES = [
  {
    id: 'deep-dive',
    name: 'Deep Dive',
    body: `You are an experienced equity analyst. Below is a technical + fundamental snapshot of {{TICKER}} from my personal analysis dashboard, taken on {{DATE}}.

{{DATA}}

Using this snapshot PLUS current web research (recent news, analyst updates, sector developments):
1. Summarize the current investment thesis for {{TICKER}} — bull case and bear case.
2. Cross-check my dashboard's reading: does the score/badge match what fresh data says? Flag any disagreement.
3. Identify near-term catalysts (next 4-8 weeks) and their likely direction.
4. Give a swing-trade oriented verdict: buy / wait / avoid, with the key level or event that would change your view.
Be specific and cite recent sources where you can.`,
  },
  {
    id: 'trade-setup',
    name: 'Trade Setup Review',
    body: `You are a swing-trading mentor. Here is my dashboard's snapshot of {{TICKER}} as of {{DATE}}:

{{DATA}}

I'm considering a long swing trade (weeks to a few months). Combine this with current web data and:
1. Validate or challenge the setup: is this a good entry zone right now?
2. Propose a concrete plan: entry zone, stop-loss (respecting the ATR shown), first target, risk:reward.
3. List anything happening in the next 2-4 weeks that could invalidate the trade (earnings, macro events, sector news).
4. Verdict in one line: enter now / wait for a specific trigger / skip.`,
  },
  {
    id: 'risk-check',
    name: 'Risk Check',
    body: `Act as a skeptical risk manager. My dashboard snapshot of {{TICKER}} from {{DATE}}:

{{DATA}}

Your job is to find what could go WRONG with a long position here. Using current web research:
1. List the top 3-5 risks (company-specific, sector, macro), each with likelihood and potential impact.
2. Check recent news for red flags my offline dashboard cannot see (guidance cuts, legal issues, insider selling, competitive threats).
3. Assess earnings risk if a report is near.
4. Conclusion: what position size (full / half / none) does this risk profile justify, and what early-warning signal should I watch?`,
  },
  {
    id: 'news-scan',
    name: 'News Catalyst Scan',
    body: `Here is my dashboard's data snapshot of {{TICKER}} from {{DATE}}:

{{DATA}}

Search the web for everything relevant from the last 2 weeks: news, analyst rating changes, insider transactions, sector moves, social sentiment.
1. Summarize the news flow — bullish, bearish, or mixed?
2. Did anything happen that my snapshot (price/indicator data only) would not reflect yet?
3. Does the fresh information confirm or contradict the dashboard score above?
4. One-line takeaway: has the story changed, and in which direction?`,
  },
];

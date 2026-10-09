import { describe, it, expect } from 'vitest';
import { computeHighlights, computeNotifications } from '../src/lib/highlights.js';

const etfRow = (ucits, entryScore, entryReadiness, exitScore = 0, exitReadiness = 'WAIT') => ({
  ucits,
  sig: {
    entry: { score: entryScore, readiness: entryReadiness, components: [] },
    exit: { score: exitScore, readiness: exitReadiness, components: [] },
  },
});

describe('computeHighlights', () => {
  it('collects ACT/SOON from all three sources, ACT first then score desc', () => {
    const items = computeHighlights({
      radarHits: [{ symbol: 'NVDA', setupType: 'PULLBACK', setupScore: 6.2, readiness: 'SOON' }],
      dipHits: [{ symbol: 'AAPL', score: 7.5, readiness: 'ACT' }],
      etfRows: [etfRow('CSPX', 7.8, 'ACT'), etfRow('CNDX', 5.1, 'SOON')],
    });
    expect(items.map(i => i.symbol)).toEqual(['CSPX', 'AAPL', 'NVDA', 'CNDX']);
    expect(items[0]).toMatchObject({ kind: 'etf-entry', view: 'etfs', readiness: 'ACT' });
  });

  it('excludes WATCH/WAIT and null sigs', () => {
    const items = computeHighlights({
      radarHits: [{ symbol: 'MSFT', setupType: 'MOMENTUM', setupScore: 4, readiness: 'WATCH' }],
      dipHits: [],
      etfRows: [{ ucits: 'VUAA', sig: null }, etfRow('EQQQ', 2, 'WAIT')],
    });
    expect(items).toEqual([]);
  });

  it('an ETF can appear for both entry and exit', () => {
    const items = computeHighlights({ etfRows: [etfRow('SMGB', 5.5, 'SOON', 7.2, 'ACT')] });
    expect(items.map(i => i.kind)).toEqual(['etf-exit', 'etf-entry']);
  });
});

describe('computeHighlights — long-term entries', () => {
  const lt = (symbol, status, total) => ({ symbol, setup: { status, timingScore: { total } } });

  it('ACCUMULATE is ACT, WATCHLIST is SOON, everything else is left out', () => {
    const items = computeHighlights({ longTerm: [lt('NVDA', 'ACCUMULATE', 74), lt('LLY', 'WATCHLIST', 55),
      lt('TSLA', 'OVERSOLD_BUT_CAUTION', 80), lt('AAPL', 'WAIT', 20)] });
    expect(items.map(i => `${i.symbol} ${i.readiness}`)).toEqual(['NVDA ACT', 'LLY SOON']);
    expect(items[0]).toMatchObject({ kind: 'long-term', view: 'stocks', label: 'NVDA long-term accumulate 74' });
  });

  it('notifies once when a name moves from WATCHLIST to ACCUMULATE', () => {
    const watch = computeHighlights({ longTerm: [lt('NVDA', 'WATCHLIST', 60)] });
    const acc = computeHighlights({ longTerm: [lt('NVDA', 'ACCUMULATE', 72)] });
    const first = computeNotifications([], watch);
    expect(computeNotifications(first.keys, acc).newItems).toHaveLength(1);
  });
});

describe('computeNotifications', () => {
  const soon = { kind: 'dip', symbol: 'AAPL', view: 'stocks', score: 5.5, readiness: 'SOON', label: 'AAPL dip 5.5' };
  const act = { ...soon, score: 7.1, readiness: 'ACT', label: 'AAPL dip 7.1' };

  it('first appearance notifies', () => {
    const { newItems, keys } = computeNotifications([], [soon]);
    expect(newItems).toHaveLength(1);
    expect(keys).toEqual(['dip:AAPL:SOON']);
  });

  it('repeat stays silent', () => {
    expect(computeNotifications(['dip:AAPL:SOON'], [soon]).newItems).toHaveLength(0);
  });

  it('upgrade SOON→ACT notifies; downgrade ACT→SOON stays silent', () => {
    expect(computeNotifications(['dip:AAPL:SOON'], [act]).newItems).toHaveLength(1);
    expect(computeNotifications(['dip:AAPL:ACT'], [soon]).newItems).toHaveLength(0);
  });

  it('handles null prevKeys', () => {
    expect(computeNotifications(null, [soon]).newItems).toHaveLength(1);
  });
});

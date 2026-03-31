let trades = $state([]);

try {
  const saved = localStorage.getItem('papertrades');
  if (saved) trades = JSON.parse(saved);
} catch { /* noop */ }

function persist() {
  try {
    localStorage.setItem('papertrades', JSON.stringify(trades));
  } catch (e) {
    console.warn('papertrades persist failed:', e);
  }
}

export function getPaperTrades() { return trades; }

export function getPaperTradesForSymbol(symbol) {
  return trades.filter(t => t.symbol === symbol);
}

export function getOpenPaperTrades() {
  return trades.filter(t => t.status === 'OPEN');
}

export function addPaperTrade({ symbol, side, shares, entryPrice, notes = '', entrySnapshot = null }) {
  trades.unshift({
    id: Date.now(),
    symbol,
    side,               // 'BUY' | 'SELL'
    shares: Number(shares),
    entryPrice: Number(entryPrice),
    entryDate: new Date().toISOString(),
    notes,
    entrySnapshot,      // { score, badge, conviction, convictionLabel, technical, fundamental, sentiment, thesis }
    status: 'OPEN',
    exitPrice: null,
    exitDate: null,
    exitSnapshot: null,
    exitNotes: null,
  });
  persist();
}

export function closePaperTrade(id, { exitPrice, exitSnapshot = null, exitNotes = '' }) {
  const trade = trades.find(t => t.id === id);
  if (!trade) return;
  trade.exitPrice   = Number(exitPrice);
  trade.exitDate    = new Date().toISOString();
  trade.exitSnapshot = exitSnapshot;
  trade.exitNotes   = exitNotes;
  trade.status      = 'CLOSED';
  persist();
}

export function removePaperTrade(id) {
  const idx = trades.findIndex(t => t.id === id);
  if (idx !== -1) trades.splice(idx, 1);
  persist();
}

// Returns { pnl, pnlPct, daysHeld, verdict } or null if currentPrice unavailable
export function getPaperTradePnL(trade, currentPrice) {
  const price = trade.status === 'CLOSED' ? trade.exitPrice : currentPrice;
  if (price == null) return null;

  const dir   = trade.side === 'BUY' ? 1 : -1;
  const pnl   = dir * trade.shares * (price - trade.entryPrice);
  const pnlPct = dir * ((price - trade.entryPrice) / trade.entryPrice) * 100;
  const closeTs = trade.status === 'CLOSED' ? new Date(trade.exitDate).getTime() : Date.now();
  const daysHeld = Math.max(0, Math.floor((closeTs - new Date(trade.entryDate).getTime()) / 86400000));

  const pricePct = Math.abs((price - trade.entryPrice) / trade.entryPrice * 100);
  let verdict = 'FLAT';
  if (pricePct >= 1) {
    const priceDiff = price - trade.entryPrice;
    const correct = (trade.side === 'BUY' && priceDiff > 0) || (trade.side === 'SELL' && priceDiff < 0);
    verdict = correct ? 'CONFIRMED' : 'AGAINST';
  }

  return { pnl, pnlPct, daysHeld, verdict };
}

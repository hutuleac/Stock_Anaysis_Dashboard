let trades = $state([]);

try {
  const saved = localStorage.getItem('tradelog');
  if (saved) trades = JSON.parse(saved);
} catch { /* noop */ }

function persist() {
  try {
    localStorage.setItem('tradelog', JSON.stringify(trades));
  } catch { /* noop */ }
}

export function getTrades() { return trades; }

export function getTradesForSymbol(symbol) {
  return trades.filter(t => t.symbol === symbol);
}

export function addTrade({ symbol, side, shares, price, notes = '' }) {
  trades.unshift({
    id: Date.now(),
    symbol,
    side,           // 'BUY' | 'SELL'
    shares: Number(shares),
    price: Number(price),
    notes,
    date: new Date().toISOString(),
  });
  persist();
}

export function removeTrade(id) {
  const idx = trades.findIndex(t => t.id === id);
  if (idx !== -1) trades.splice(idx, 1);
  persist();
}

// Calculate realized P&L for a symbol using FIFO matching
export function getRealizedPnL(symbol) {
  const buys = [];
  let realized = 0;

  const sorted = [...trades.filter(t => t.symbol === symbol)]
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  for (const t of sorted) {
    if (t.side === 'BUY') {
      buys.push({ shares: t.shares, price: t.price });
    } else {
      let toSell = t.shares;
      while (toSell > 0 && buys.length > 0) {
        const lot = buys[0];
        const matched = Math.min(lot.shares, toSell);
        realized += matched * (t.price - lot.price);
        lot.shares -= matched;
        toSell -= matched;
        if (lot.shares === 0) buys.shift();
      }
    }
  }
  return realized;
}

// Price alerts — checked on each refresh
let alerts = $state([]);
let triggered = $state([]);

try {
  const saved = localStorage.getItem('price_alerts');
  if (saved) alerts = JSON.parse(saved);
} catch { /* noop */ }

function persist() {
  try { localStorage.setItem('price_alerts', JSON.stringify(alerts)); }
  catch { /* noop */ }
}

export function getAlerts() { return alerts; }
export function getTriggered() { return triggered; }

export function addAlert(symbol, targetPrice, direction) {
  // direction: 'above' | 'below'
  alerts.push({ id: Date.now(), symbol, targetPrice: Number(targetPrice), direction });
  persist();
}

export function removeAlert(id) {
  const idx = alerts.findIndex(a => a.id === id);
  if (idx !== -1) alerts.splice(idx, 1);
  persist();
}

export function dismissTriggered(id) {
  const idx = triggered.findIndex(t => t.id === id);
  if (idx !== -1) triggered.splice(idx, 1);
}

export function checkAlerts(marketData) {
  const newlyTriggered = [];
  const remaining = [];

  for (const alert of alerts) {
    const price = marketData[alert.symbol]?.quote?.data?.c;
    if (price == null) { remaining.push(alert); continue; }

    const hit = alert.direction === 'above' ? price >= alert.targetPrice
                                            : price <= alert.targetPrice;
    if (hit) {
      newlyTriggered.push({ ...alert, currentPrice: price });
    } else {
      remaining.push(alert);
    }
  }

  if (newlyTriggered.length > 0) {
    triggered.push(...newlyTriggered);
    alerts.length = 0;
    alerts.push(...remaining);
    persist();
  }
}

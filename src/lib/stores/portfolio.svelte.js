let positions = $state([]);
let portfolioValue = $state(0);
let storageWarning = $state(false);
export function isPortfolioStorageFull() { return storageWarning; }
export function clearPortfolioStorageWarning() { storageWarning = false; }

// Initialize from localStorage
try {
  const saved = localStorage.getItem('portfolio');
  if (saved) positions = JSON.parse(saved);
} catch { /* noop */ }

try {
  const savedVal = localStorage.getItem('portfolioValue');
  if (savedVal) portfolioValue = parseFloat(savedVal) || 0;
} catch { /* noop */ }

function persistPositions() {
  try {
    localStorage.setItem('portfolio', JSON.stringify(positions));
  } catch (e) {
    if (e.name === 'QuotaExceededError') storageWarning = true;
    else console.warn('localStorage write failed:', e);
  }
}

export function getPortfolioValue() { return portfolioValue; }
export function setPortfolioValue(val) {
  portfolioValue = val;
  try {
    localStorage.setItem('portfolioValue', String(val));
  } catch (e) {
    if (e.name === 'QuotaExceededError') storageWarning = true;
  }
}

export function getPositions() { return positions; }

export function addPosition(ticker, qty, avgCost) {
  const existing = positions.findIndex(p => p.ticker === ticker);
  if (existing !== -1) {
    positions[existing] = { ticker, qty, avgCost };
  } else {
    positions.push({ ticker, qty, avgCost });
  }
  persistPositions();
}

export function removePosition(ticker) {
  const idx = positions.findIndex(p => p.ticker === ticker);
  if (idx !== -1) positions.splice(idx, 1);
  persistPositions();
}

export function getPosition(ticker) {
  return positions.find(p => p.ticker === ticker) || null;
}

export function hasPosition(ticker) {
  return positions.some(p => p.ticker === ticker);
}

export function clearPositions() {
  positions.length = 0;
  persistPositions();
}

export function setPositions(newPositions) {
  positions.length = 0;
  positions.push(...newPositions);
  persistPositions();
}

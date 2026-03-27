import { fetchProfile, getSectorETF } from '../api/finnhub.svelte.js';

let tickers = $state([]);
let selectedSymbol = $state(null);
let marketData = $state({});

// Initialize from localStorage
try {
  const saved = localStorage.getItem('watchlist');
  if (saved) tickers = JSON.parse(saved);
} catch { /* noop */ }

function persistTickers() {
  try {
    localStorage.setItem('watchlist', JSON.stringify(tickers));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

export function getTickers() { return tickers; }
export function getSelectedSymbol() { return selectedSymbol; }
export function getMarketData() { return marketData; }

export function selectTicker(symbol) {
  selectedSymbol = selectedSymbol === symbol ? null : symbol;
}

export async function addTicker(symbol, name) {
  if (tickers.some(t => t.symbol === symbol)) return false;

  let sector = 'Unknown';
  let sectorETF = 'SPY';

  try {
    const { data } = await fetchProfile(symbol);
    if (data?.finnhubIndustry) {
      sector = data.finnhubIndustry;
      sectorETF = getSectorETF(sector);
    }
  } catch { /* use defaults */ }

  tickers.push({ symbol, name, sector, sectorETF });
  persistTickers();
  return true;
}

export function removeTicker(symbol) {
  const idx = tickers.findIndex(t => t.symbol === symbol);
  if (idx !== -1) tickers.splice(idx, 1);
  if (selectedSymbol === symbol) selectedSymbol = null;
  persistTickers();
}

export function reorderTickers(fromIndex, toIndex) {
  const [item] = tickers.splice(fromIndex, 1);
  tickers.splice(toIndex, 0, item);
  persistTickers();
}

export function setMarketData(data) {
  marketData = { ...marketData, ...data };
}

export function getTickerData(symbol) {
  return marketData[symbol] || null;
}

export function getSymbols() {
  return tickers.map(t => t.symbol);
}

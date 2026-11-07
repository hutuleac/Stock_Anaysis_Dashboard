import { fetchProfile, getSectorETF } from '../api/finnhub.svelte.js';
import { HARDCODED_DEFAULTS } from '../defaultLists.js';

// Initial values are read into plain locals first, then wrapped in $state —
// reading a $state at module load only sees its initial value.
let initialDefaults = [...HARDCODED_DEFAULTS];
try {
  const savedDefaults = localStorage.getItem('watchlist_defaults');
  if (savedDefaults) initialDefaults = JSON.parse(savedDefaults);
} catch { /* noop */ }

// Watchlist from localStorage, seeded with the defaults on first run
let initialTickers = [];
try {
  const saved = localStorage.getItem('watchlist');
  if (saved) initialTickers = JSON.parse(saved);
} catch { /* noop */ }
if (initialTickers.length === 0) {
  initialTickers = [...initialDefaults];
  try { localStorage.setItem('watchlist', JSON.stringify(initialTickers)); } catch { /* noop */ }
}

let tickers = $state(initialTickers);
let selectedSymbol = $state(null);
let marketData = $state({});

// User-configurable defaults — persisted separately from active watchlist
let defaultTickers = $state(initialDefaults);

function persistDefaults() {
  try { localStorage.setItem('watchlist_defaults', JSON.stringify(defaultTickers)); } catch { /* noop */ }
}

export function getDefaultTickers() { return defaultTickers; }

export function addDefaultTicker(symbol, name) {
  if (defaultTickers.some(t => t.symbol === symbol)) return false;
  defaultTickers.push({ symbol, name: name || symbol, sector: 'Unknown', sectorETF: 'SPY' });
  persistDefaults();
  return true;
}

export function removeDefaultTicker(symbol) {
  const idx = defaultTickers.findIndex(t => t.symbol === symbol);
  if (idx !== -1) defaultTickers.splice(idx, 1);
  persistDefaults();
}

export function resetDefaultTickers() {
  defaultTickers = [...HARDCODED_DEFAULTS];
  persistDefaults();
}

function persistTickers() {
  try {
    localStorage.setItem('watchlist', JSON.stringify(tickers));
  } catch (e) {
    console.warn('localStorage write failed:', e);
  }
}

export function getTickers() { return tickers; }
export function getSelectedSymbol() { return selectedSymbol; }

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

// Load demo tickers without persisting — used in demo mode only
export function loadDemoTickers(demoTickers) {
  tickers = [...demoTickers];
}

// Clear demo tickers and seed defaults so user starts fresh after adding API keys
export function clearDemoTickers() {
  tickers = [...defaultTickers];
  marketData = {};
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

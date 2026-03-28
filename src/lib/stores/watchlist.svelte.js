import { fetchProfile, getSectorETF } from '../api/finnhub.svelte.js';

let tickers = $state([]);
let selectedSymbol = $state(null);
let marketData = $state({});

const DEFAULT_TICKERS = [
  { symbol: 'TSLA',  name: 'Tesla Inc',          sector: 'Consumer Cyclical',      sectorETF: 'XLY' },
  { symbol: 'SKM',   name: 'SK Telecom',          sector: 'Communication Services', sectorETF: 'XLC' },
  { symbol: 'SOFI',  name: 'SoFi Technologies',   sector: 'Financial Services',     sectorETF: 'XLF' },
  { symbol: 'GOOGL', name: 'Alphabet Inc',         sector: 'Communication Services', sectorETF: 'XLC' },
  { symbol: 'AMZN',  name: 'Amazon.com Inc',       sector: 'Consumer Cyclical',      sectorETF: 'XLY' },
  { symbol: 'HOOD',  name: 'Robinhood Markets',    sector: 'Financial Services',     sectorETF: 'XLF' },
];

// Initialize from localStorage or seed with defaults on first run
try {
  const saved = localStorage.getItem('watchlist');
  if (saved) tickers = JSON.parse(saved);
} catch { /* noop */ }

if (tickers.length === 0) {
  tickers = [...DEFAULT_TICKERS];
  try { localStorage.setItem('watchlist', JSON.stringify(tickers)); } catch { /* noop */ }
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

// Load demo tickers without persisting — used in demo mode only
export function loadDemoTickers(demoTickers) {
  tickers = [...demoTickers];
}

// Clear demo tickers and seed defaults so user starts fresh after adding API keys
export function clearDemoTickers() {
  tickers = [...DEFAULT_TICKERS];
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

// UCITS ETF catalog + proxy candle data. Signals run on the US proxy (see etf.js);
// the UCITS ticker/ISIN/TER are display metadata for what the user actually buys.
const HARDCODED_ETFS = [
  { ucits: 'VUAA', isin: 'IE00BFMXXD54', name: 'Vanguard S&P 500 (Acc)',      ter: '0.07%', category: 'Core US',      proxy: 'SPY'  },
  { ucits: 'CSPX', isin: 'IE00B5BMR087', name: 'iShares Core S&P 500 (Acc)',  ter: '0.07%', category: 'Core US',      proxy: 'SPY'  },
  { ucits: 'CNDX', isin: 'IE00B53SZB19', name: 'iShares Nasdaq 100',          ter: '0.33%', category: 'Tech',         proxy: 'QQQ'  },
  { ucits: 'EQQQ', isin: 'IE00BFZXGZ54', name: 'Invesco EQQQ Nasdaq-100',     ter: '0.30%', category: 'Tech',         proxy: 'QQQ'  },
  { ucits: 'AIAI', isin: 'IE00BK5BCD43', name: 'L&G Artificial Intelligence', ter: '0.49%', category: 'AI thematic',  proxy: 'THNQ' },
  { ucits: 'AIRO', isin: 'IE00BYZK4552', name: 'Global X Robotics & AI',      ter: '0.50%', category: 'AI/Robotics',  proxy: 'BOTZ' },
  { ucits: 'SMGB', isin: 'IE00BMC38736', name: 'VanEck Semiconductor',        ter: '0.35%', category: 'Semis',        proxy: 'SMH'  },
  { ucits: 'IUES', isin: 'IE00B42Z5J44', name: 'iShares S&P 500 Energy',      ter: '0.15%', category: 'Energy',       proxy: 'XLE'  },
  { ucits: 'INRG', isin: 'IE00B1XNHC34', name: 'iShares Global Clean Energy', ter: '0.65%', category: 'Clean Energy', proxy: 'ICLN' },
];

let etfs = $state([]);
try {
  const saved = localStorage.getItem('etfList');
  etfs = saved ? JSON.parse(saved) : [...HARDCODED_ETFS];
} catch { etfs = [...HARDCODED_ETFS]; }

function persist() {
  try { localStorage.setItem('etfList', JSON.stringify(etfs)); } catch { /* noop */ }
}

// Proxy candle data, keyed by proxy symbol — NOT persisted here (TwelveData's
// own localStorage cache is the persistence layer; App.svelte re-hydrates from it).
let proxyData = $state({});
let spyCloses = $state(null);

export function getEtfs() { return etfs; }

export function addEtf({ ucits, isin = '', name = '', ter = '', category = '', proxy }) {
  const u = ucits?.trim().toUpperCase();
  const p = proxy?.trim().toUpperCase();
  if (!u || !p || etfs.some(e => e.ucits === u)) return false;
  etfs.push({ ucits: u, isin, name, ter, category, proxy: p });
  persist();
  return true;
}

export function removeEtf(ucits) {
  const idx = etfs.findIndex(e => e.ucits === ucits);
  if (idx !== -1) etfs.splice(idx, 1);
  persist();
}

export function resetEtfs() {
  etfs = [...HARDCODED_ETFS];
  persist();
}

export function getUniqueProxies() {
  return [...new Set(etfs.map(e => e.proxy))];
}

export function setEtfProxyData(proxy, data) {
  proxyData = { ...proxyData, [proxy]: data };
}
export function getEtfProxyData(proxy) { return proxyData[proxy] ?? null; }

export function setEtfSpyCloses(closes) { spyCloses = closes; }
export function getEtfSpyCloses() { return spyCloses; }

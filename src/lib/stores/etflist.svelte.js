// UCITS ETF catalog + proxy candle data. Signals run on the US proxy (see etf.js);
// the UCITS ticker/ISIN/TER are display metadata for what the user actually buys.

import { HARDCODED_ETFS } from '../defaultLists.js';

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

// One-shot expand request from outside the ETF view (e.g. highlights strip).
let expandRequest = $state(null);
export function requestEtfExpand(ucits) { expandRequest = ucits; }
export function getEtfExpandRequest() { return expandRequest; }
export function clearEtfExpandRequest() { expandRequest = null; }

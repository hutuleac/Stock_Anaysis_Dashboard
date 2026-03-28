// Per-ticker notes — persisted to localStorage, reactive via version counter.

const _data = {};
let _version = $state(0);

function load(symbol) {
  if (_data[symbol] === undefined) {
    try { _data[symbol] = localStorage.getItem(`note_${symbol}`) || ''; }
    catch { _data[symbol] = ''; }
  }
}

export function getNotes(symbol) {
  _version; // reactive dependency
  load(symbol);
  return _data[symbol];
}

export function setNotes(symbol, text) {
  _data[symbol] = text;
  _version++;
  try { localStorage.setItem(`note_${symbol}`, text); }
  catch { /* noop */ }
}

export function hasNotes(symbol) {
  _version; // reactive dependency
  load(symbol);
  return _data[symbol].trim().length > 0;
}

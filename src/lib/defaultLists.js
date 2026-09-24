// Built-in lists shared by the stores and scripts/snapshot.mjs (the scheduled
// snapshot job) — plain module, no runes, so Node can import it.

import watchlist from '../../watchlist.json' with { type: 'json' };

// Default watchlist — edit watchlist.json at the repo root. It is also the list
// the scheduled snapshot job fetches (scripts/snapshot.mjs).
export const HARDCODED_DEFAULTS = watchlist;

export const HARDCODED_ETFS = [
  { ucits: 'VUAA', isin: 'IE00BFMXXD54', name: 'Vanguard S&P 500 (Acc)',      ter: '0.07%', category: 'Core US',      proxy: 'SPY'  },
  { ucits: 'CSPX', isin: 'IE00B5BMR087', name: 'iShares Core S&P 500 (Acc)',  ter: '0.07%', category: 'Core US',      proxy: 'SPY'  },
  { ucits: 'CNDX', isin: 'IE00B53SZB19', name: 'iShares Nasdaq 100',          ter: '0.33%', category: 'Tech',         proxy: 'QQQ'  },
  { ucits: 'EQQQ', isin: 'IE00BFZXGZ54', name: 'Invesco EQQQ Nasdaq-100',     ter: '0.30%', category: 'Tech',         proxy: 'QQQ'  },
  { ucits: 'XDEW', isin: '', name: 'Xtrackers S&P 500 Equal Weight (Acc)', ter: '0.20%', category: 'US Equal Weight', proxy: 'RSP' },
  { ucits: 'AIAI', isin: 'IE00BK5BCD43', name: 'L&G Artificial Intelligence', ter: '0.49%', category: 'AI thematic',  proxy: 'THNQ' },
  { ucits: 'AIRO', isin: 'IE00BYZK4552', name: 'Global X Robotics & AI',      ter: '0.50%', category: 'AI/Robotics',  proxy: 'BOTZ' },
  { ucits: 'SMGB', isin: 'IE00BMC38736', name: 'VanEck Semiconductor',        ter: '0.35%', category: 'Semis',        proxy: 'SMH'  },
  { ucits: 'IUES', isin: 'IE00B42Z5J44', name: 'iShares S&P 500 Energy',      ter: '0.15%', category: 'Energy',       proxy: 'XLE'  },
  { ucits: 'INRG', isin: 'IE00B1XNHC34', name: 'iShares Global Clean Energy', ter: '0.65%', category: 'Clean Energy', proxy: 'ICLN' },
  { ucits: 'IUHC', isin: 'IE00B43HR379', name: 'iShares S&P 500 Health Care',  ter: '0.15%', category: 'Healthcare',   proxy: 'XLV'  },
  // No UCITS wrapper tracks this index — held directly (US-listed, no ISIN shown).
  { ucits: 'IGV',  isin: '',             name: 'iShares Expanded Tech-Software', ter: '0.39%', category: 'Software',  proxy: 'IGV'  },
  { ucits: 'BOTZ', isin: '',             name: 'Global X Robotics & AI',       ter: '0.68%', category: 'AI/Robotics',  proxy: 'BOTZ' },
  // 3x daily-leveraged — decays in chop, amplifies both directions. Not a buy-and-hold core position.
  { ucits: 'SOXL', isin: '',             name: 'Direxion Daily Semiconductor Bull 3X', ter: '0.75%', category: 'Leveraged Semis', proxy: 'SOXL' },
  { ucits: 'TQQQ', isin: '',             name: 'ProShares UltraPro QQQ 3X',    ter: '0.84%', category: 'Leveraged Tech', proxy: 'TQQQ' },
];

import { describe, it, expect } from 'vitest';
import { ETF_CATALOG, searchCatalog } from '../src/lib/etfCatalog.js';

describe('ETF_CATALOG sanity', () => {
  it('every entry has ucits, name, category, and a proxy', () => {
    for (const e of ETF_CATALOG) {
      expect(e.ucits).toBeTruthy();
      expect(e.name).toBeTruthy();
      expect(e.category).toBeTruthy();
      expect(e.proxy).toBeTruthy();
    }
  });

  it('has no duplicate UCITS tickers', () => {
    const tickers = ETF_CATALOG.map(e => e.ucits);
    expect(new Set(tickers).size).toBe(tickers.length);
  });
});

describe('searchCatalog', () => {
  it('matches ticker case-insensitively', () => {
    expect(searchCatalog('vwce').map(r => r.ucits)).toContain('VWCE');
  });

  it('matches on name and category', () => {
    expect(searchCatalog('world').length).toBeGreaterThan(2);
    expect(searchCatalog('defense').map(r => r.ucits)).toEqual(expect.arrayContaining(['NATO', 'DFNS']));
  });

  it('empty or whitespace query returns nothing', () => {
    expect(searchCatalog('')).toEqual([]);
    expect(searchCatalog('   ')).toEqual([]);
  });

  it('flags already-added ETFs and caps at 12 results', () => {
    const res = searchCatalog('iwda', ['IWDA']);
    expect(res[0].added).toBe(true);
    expect(searchCatalog('i').length).toBeLessThanOrEqual(12);
  });
});

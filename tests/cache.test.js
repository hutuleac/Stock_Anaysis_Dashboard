import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── localStorage mock ────────────────────────────────────────────────────────
// Map-backed so it supports key(i)/length (needed by the prune + evict loops),
// with an optional quota cap that throws QuotaExceededError like real browsers.
function makeStorage(quotaBytes = Infinity) {
  const store = new Map();
  const size = () => [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    get length() { return store.size; },
    key(i) { return [...store.keys()][i] ?? null; },
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
    setItem(k, v) {
      const projected = size() - (store.get(k)?.length ?? 0) + k.length + v.length;
      if (projected > quotaBytes) {
        const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err;
      }
      store.set(k, String(v));
    },
  };
}

vi.stubGlobal('localStorage', makeStorage());

const NOW = Date.now();
const entry = (data, ageMs = 0) => JSON.stringify({ data, ts: NOW - ageMs });

// Imported after the stub is in place (finnhub reads localStorage at module load).
const { pruneOrphanedCache, evictStaleCache } = await import('../src/lib/api/finnhub.svelte.js');

beforeEach(() => { localStorage.clear(); });

describe('pruneOrphanedCache', () => {
  it('removes per-symbol caches for untracked symbols, keeps tracked ones', () => {
    localStorage.setItem('td_ts_1day_AAPL_1day_250', entry([1]));
    localStorage.setItem('fh_fundamentals_TSLA', entry({ x: 1 }));
    localStorage.setItem('fh_quote_MSFT', entry({ c: 1 }));

    const removed = pruneOrphanedCache(['AAPL']); // TSLA + MSFT dropped from watchlist

    expect(localStorage.getItem('td_ts_1day_AAPL_1day_250')).not.toBeNull();
    expect(localStorage.getItem('fh_fundamentals_TSLA')).toBeNull();
    expect(localStorage.getItem('fh_quote_MSFT')).toBeNull();
    expect(removed).toBe(2);
  });

  it('prunes frozen sv_ score history for removed symbols but keeps tracked ones', () => {
    localStorage.setItem('sv_AAPL', entry([{ score: 60, ts: NOW }]));
    localStorage.setItem('sv_TSLA', entry([{ score: 40, ts: NOW }]));

    pruneOrphanedCache(['AAPL']);

    expect(localStorage.getItem('sv_AAPL')).not.toBeNull();
    expect(localStorage.getItem('sv_TSLA')).toBeNull();
  });

  it('never touches macro / notes / watchlist / api-key keys', () => {
    localStorage.setItem('fh_feargreed', entry({ score: 50 }));
    localStorage.setItem('fred_cpi', entry({ v: 3 }));
    localStorage.setItem('watchlist', JSON.stringify(['AAPL']));
    localStorage.setItem('finnhub_api_key', 'secret');

    pruneOrphanedCache([]); // empty watchlist — nothing tracked

    expect(localStorage.getItem('fh_feargreed')).not.toBeNull();
    expect(localStorage.getItem('fred_cpi')).not.toBeNull();
    expect(localStorage.getItem('watchlist')).not.toBeNull();
    expect(localStorage.getItem('finnhub_api_key')).not.toBeNull();
  });
});

describe('evictStaleCache', () => {
  it('deletes entries past their TTL and keeps fresh ones', () => {
    localStorage.setItem('td_ts_1day_AAPL_1day_250', entry([1], 2 * 86400_000)); // 2d old, ttl 24h → stale
    localStorage.setItem('fh_fundamentals_AAPL', entry({ x: 1 }, 3600_000));      // 1h old, ttl 7d → fresh
    localStorage.setItem('fh_quote_AAPL', entry({ c: 1 }, 2 * 3600_000));         // 2h old, grace 1h → stale

    const freed = evictStaleCache();

    expect(freed).toBe(2);
    expect(localStorage.getItem('td_ts_1day_AAPL_1day_250')).toBeNull();
    expect(localStorage.getItem('fh_quote_AAPL')).toBeNull();
    expect(localStorage.getItem('fh_fundamentals_AAPL')).not.toBeNull();
  });

  it('removes unparseable / ts-less junk entries under a cache prefix', () => {
    localStorage.setItem('fh_news_AAPL', 'not json');
    localStorage.setItem('fh_earnings_AAPL', JSON.stringify({ data: 1 })); // no ts

    expect(evictStaleCache()).toBe(2);
    expect(localStorage.getItem('fh_news_AAPL')).toBeNull();
    expect(localStorage.getItem('fh_earnings_AAPL')).toBeNull();
  });

  it('leaves non-cache keys alone', () => {
    localStorage.setItem('watchlist', JSON.stringify(['AAPL']));
    localStorage.setItem('finnhub_api_key', 'secret');
    expect(evictStaleCache()).toBe(0);
    expect(localStorage.getItem('watchlist')).not.toBeNull();
  });
});

// NOTE: writeCache is module-private, so this exercises the self-heal *primitive*
// (eviction frees room so a retry fits) against a quota-capped store — not the
// writeCache retry composition itself, which is verified by inspection.
describe('quota eviction frees room for a retry', () => {
  it('evicting a stale entry lets a previously-failing write succeed', () => {
    // Small quota. Seed with a stale big entry, then a fresh write that would
    // overflow — eviction of the stale one must free room for the retry.
    const capped = makeStorage(400);
    vi.stubGlobal('localStorage', capped);

    // Stale (2d old) td series occupying most of the quota.
    capped.setItem('td_ts_1day_OLD_1day_250', entry('x'.repeat(300), 2 * 86400_000));
    // A fresh fundamentals write that won't fit until the stale one is evicted.
    // Route it through writeCache by importing a fetcher path is heavy; instead
    // assert the primitive: eviction frees the stale key so a retry fits.
    let threw = false;
    try { capped.setItem('fh_fundamentals_NEW', entry('y'.repeat(300))); }
    catch { threw = true; }
    expect(threw).toBe(true);            // confirms the store is genuinely full

    const freed = evictStaleCache();     // self-heal step
    expect(freed).toBe(1);
    // Retry now succeeds.
    expect(() => capped.setItem('fh_fundamentals_NEW', entry('y'.repeat(300)))).not.toThrow();

    vi.stubGlobal('localStorage', makeStorage()); // restore for other suites
  });
});

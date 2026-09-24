import { it, expect, vi } from 'vitest';
import { seedSnapshot } from '../src/lib/snapshot.js';

const store = new Map();
vi.stubGlobal('localStorage', {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
});
const entry = (data, ts) => JSON.stringify({ data, ts });

// The snapshot is a pre-filled cache: it fills gaps and replaces older entries,
// but never clobbers something this browser fetched live after the job ran.
it('seeds missing and older cache entries, keeps newer ones', async () => {
  store.set('fh_quote_AAPL', entry({ c: 1 }, 100));  // older than snapshot
  store.set('fh_quote_NVDA', entry({ c: 9 }, 900));  // live refresh after snapshot
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({
    generatedAt: 500, mode: 'close',
    entries: {
      fh_quote_AAPL: entry({ c: 2 }, 500),
      fh_quote_NVDA: entry({ c: 3 }, 500),
      fh_quote_TSLA: entry({ c: 4 }, 500),
    },
  }) })));

  expect(await seedSnapshot('snapshot.json')).toEqual({ generatedAt: 500, mode: 'close' });
  expect(JSON.parse(store.get('fh_quote_AAPL')).data.c).toBe(2);
  expect(JSON.parse(store.get('fh_quote_NVDA')).data.c).toBe(9);
  expect(JSON.parse(store.get('fh_quote_TSLA')).data.c).toBe(4);
});

it('returns null when no snapshot is published', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
  expect(await seedSnapshot('snapshot.json')).toBeNull();
});

import { it, expect, vi } from 'vitest';

vi.stubGlobal('localStorage', {
  store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = String(v); },
  removeItem(k) { delete this.store[k]; }, key() { return null; }, length: 0,
});

const { setTDApiKey, fetchTimeSeries } = await import('../src/lib/api/twelvedata.svelte.js');

// TwelveData reports its rate limit as HTTP 200 + { code: 429 } in the body —
// that must take the wait-and-retry path, not fail the fetch.
it('retries after a rate-limit reported in the response body', async () => {
  vi.useFakeTimers();
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(ok({ code: 429, status: 'error', message: 'run out of API credits' }))
    .mockResolvedValueOnce(ok({ values: [{ datetime: '2026-09-24', close: '1' }] }));
  vi.stubGlobal('fetch', fetchMock);
  setTDApiKey('k');

  const p = fetchTimeSeries('SPY', '1day', 5);
  await vi.advanceTimersByTimeAsync(61_000);
  const res = await p;

  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(res.data).toHaveLength(1);
  expect(res.stale).toBe(false);
  vi.useRealTimers();
});

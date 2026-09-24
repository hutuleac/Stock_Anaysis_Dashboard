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

// Production seeds the cache from the deploy-time candles.json snapshot, so a
// symbol it covers costs no TwelveData credit; anything else still goes live.
it('serves daily candles from candles.json, falls through for uncovered symbols', async () => {
  vi.stubEnv('PROD', true);
  const snap = { generatedAt: Date.now() - 3600_000, bars: { AAPL: [['2026-09-23', '1', '2', '0.5', '1.5', '100'], ['2026-09-24', '1.5', '3', '1', '2.5', '200']] } };
  const fetchMock = vi.fn(async (url) => ({
    ok: true, status: 200,
    json: async () => (url.includes('candles.json') ? snap : { values: [{ datetime: '2026-09-24', close: '9' }] }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  setTDApiKey('k');

  const aapl = await fetchTimeSeries('AAPL', '1day', 1);
  expect(aapl.data).toEqual([{ datetime: '2026-09-24', open: '1.5', high: '3', low: '1', close: '2.5', volume: '200' }]);
  expect(fetchMock.mock.calls.some(([u]) => u.includes('twelvedata'))).toBe(false);

  const nvda = await fetchTimeSeries('NVDA', '1day', 1);
  expect(nvda.data[0].close).toBe('9');
  expect(fetchMock.mock.calls.filter(([u]) => u.includes('candles.json'))).toHaveLength(1);
  vi.unstubAllEnvs();
});

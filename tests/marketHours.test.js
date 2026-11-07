import { describe, it, expect } from 'vitest';
import { isTradingDay, getMarketStatus } from '../src/lib/marketHours.js';

describe('isTradingDay — NYSE full-day holidays', () => {
  it.each([
    ['New Year (Sun → Mon)', 2023, 1, 2],
    ['MLK Day', 2026, 1, 19],
    ['Presidents Day', 2026, 2, 16],
    ['Good Friday', 2026, 4, 3],
    ['Good Friday', 2027, 3, 26],
    ['Memorial Day', 2026, 5, 25],
    ['Juneteenth (Sat → Fri)', 2027, 6, 18],
    ['Independence Day (Sat → Fri)', 2026, 7, 3],
    ['Labor Day', 2026, 9, 7],
    ['Thanksgiving', 2026, 11, 26],
    ['Christmas', 2026, 12, 25],
    ['Christmas (Sat → Fri)', 2027, 12, 24],
  ])('%s %i-%i-%i is closed', (_, y, m, d) => {
    expect(isTradingDay(y, m, d)).toBe(false);
  });

  it.each([
    ['Black Friday (early close, still a session)', 2026, 11, 27],
    ['Dec 31 when New Year falls on Saturday', 2027, 12, 31],
    ['an ordinary Wednesday', 2026, 11, 4],
  ])('%s %i-%i-%i is open', (_, y, m, d) => {
    expect(isTradingDay(y, m, d)).toBe(true);
  });

  it('weekends are closed', () => {
    expect(isTradingDay(2026, 11, 7)).toBe(false);
    expect(isTradingDay(2026, 11, 8)).toBe(false);
  });
});

describe('getMarketStatus', () => {
  it('open during the session on a trading day', () => {
    expect(getMarketStatus(new Date('2026-11-04T15:00:00Z'))) // Wed 10:00 EST
      .toEqual({ isOpen: true, nextEvent: 'Closes in 6h 0m' });
  });

  it('closed all day on Thanksgiving', () => {
    expect(getMarketStatus(new Date('2026-11-26T16:00:00Z')).isOpen).toBe(false); // Thu 11:00 EST
  });

  it('the next open skips the holiday', () => {
    // Wed Nov 25 2026 17:00 EST → Fri Nov 27 09:30 = 40h30m
    expect(getMarketStatus(new Date('2026-11-25T22:00:00Z')).nextEvent).toBe('Opens 1d 16h');
  });

  it('pre-open on a trading day counts down to today', () => {
    expect(getMarketStatus(new Date('2026-11-04T13:00:00Z')).nextEvent).toBe('Opens in 1h 30m'); // 08:00 EST
  });

  it('weekend points to Monday', () => {
    expect(getMarketStatus(new Date('2026-11-07T15:00:00Z')).nextEvent).toBe('Opens 1d 23h'); // Sat 10:00 → Mon 09:30 = 47h30m
  });
});

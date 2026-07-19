import { describe, it, expect } from 'vitest';
import { buildLongTermSetup } from '../src/lib/longTermSetup.js';

function timing(total) {
  if (total === null) return { total: null, label: 'WAIT', components: {}, signals: [], warnings: [] };
  const label = total >= 70 ? 'STRONG_ACCUMULATION_ZONE' : total >= 50 ? 'WATCHLIST' : total >= 30 ? 'NEUTRAL' : 'WAIT';
  return { total, label, components: {}, signals: [], warnings: [] };
}

function quality(total, label) {
  if (total === null) return { total: null, label: label ?? 'INSUFFICIENT_DATA', components: {}, redFlags: [], notes: [] };
  return { total, label: label ?? (total >= 75 ? 'HIGH' : total >= 50 ? 'MEDIUM' : 'LOW'), components: {}, redFlags: [], notes: [] };
}

describe('buildLongTermSetup — gate matrix', () => {
  it('STRONG timing + HIGH/GOOD/OK quality -> ACCUMULATE', () => {
    expect(buildLongTermSetup(timing(75), quality(80), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(75), quality(68), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(75), quality(62), null).status).toBe('ACCUMULATE');
  });

  it('STRONG timing + WEAK/UNKNOWN quality -> OVERSOLD_BUT_CAUTION', () => {
    expect(buildLongTermSetup(timing(75), quality(40), null).status).toBe('OVERSOLD_BUT_CAUTION');
    expect(buildLongTermSetup(timing(75), null, null).status).toBe('OVERSOLD_BUT_CAUTION');
  });

  it('WATCH timing + HIGH/GOOD quality -> WATCHLIST', () => {
    expect(buildLongTermSetup(timing(55), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(68), null).status).toBe('WATCHLIST');
  });

  it('WATCH timing + OK/WEAK quality -> NEUTRAL', () => {
    expect(buildLongTermSetup(timing(55), quality(62), null).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(timing(55), quality(40), null).status).toBe('NEUTRAL');
  });

  it('WEAK timing (any quality) -> WAIT', () => {
    expect(buildLongTermSetup(timing(49), quality(80), null).status).toBe('WAIT');
    expect(buildLongTermSetup(timing(20), quality(40), null).status).toBe('WAIT');
    expect(buildLongTermSetup(timing(null), quality(80), null).status).toBe('WAIT');
  });

  it('band boundaries: t=70 is STRONG, t=69 is WATCH; t=50 is WATCH, t=49 is WEAK', () => {
    expect(buildLongTermSetup(timing(70), quality(62), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(69), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(50), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(49), quality(80), null).status).toBe('WAIT');
  });

  it('band boundaries: q=75 is HIGH, q=74 is GOOD; q=65 is GOOD, q=64 is OK; q=60 is OK, q=59 is WEAK', () => {
    expect(buildLongTermSetup(timing(75), quality(75), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(55), quality(74), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(65), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(64), null).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(timing(75), quality(60), null).status).toBe('ACCUMULATE');
    expect(buildLongTermSetup(timing(75), quality(59), null).status).toBe('OVERSOLD_BUT_CAUTION');
  });

  it('quality.label INSUFFICIENT_DATA is treated as WEAK/UNKNOWN even if total happens to be non-null', () => {
    const q = quality(65, 'INSUFFICIENT_DATA');
    expect(buildLongTermSetup(timing(75), q, null).status).toBe('OVERSOLD_BUT_CAUTION');
  });
});

describe('buildLongTermSetup — INSUFFICIENT_DATA override', () => {
  it('both engines empty -> INSUFFICIENT_DATA, not WAIT', () => {
    const result = buildLongTermSetup(timing(null), quality(null), null);
    expect(result.status).toBe('INSUFFICIENT_DATA');
  });

  it('both args entirely null (engines never run) -> INSUFFICIENT_DATA', () => {
    expect(buildLongTermSetup(null, null, null).status).toBe('INSUFFICIENT_DATA');
  });

  it('does NOT fire when only timing is null but quality has real data', () => {
    const result = buildLongTermSetup(timing(null), quality(80), null);
    expect(result.status).toBe('WAIT'); // falls through to the matrix: WEAK timing -> WAIT
  });

  it('does NOT fire when only quality is null but timing has real data', () => {
    const result = buildLongTermSetup(timing(55), null, null);
    expect(result.status).toBe('NEUTRAL'); // WATCH timing x WEAK/UNKNOWN quality -> NEUTRAL
  });
});

describe('buildLongTermSetup — return shape', () => {
  it('always includes the raw timingScore and qualityScore on the result', () => {
    const t = timing(75);
    const q = quality(80);
    const result = buildLongTermSetup(t, q, null);
    expect(result.timingScore).toBe(t);
    expect(result.qualityScore).toBe(q);
  });

  it('reasons is a non-empty array of strings for every status', () => {
    for (const s of [
      buildLongTermSetup(timing(75), quality(80), null),
      buildLongTermSetup(timing(75), quality(40), null),
      buildLongTermSetup(timing(55), quality(80), null),
      buildLongTermSetup(timing(55), quality(40), null),
      buildLongTermSetup(timing(20), quality(40), null),
      buildLongTermSetup(null, null, null),
    ]) {
      expect(Array.isArray(s.reasons)).toBe(true);
      expect(s.reasons.length).toBeGreaterThan(0);
      expect(typeof s.reasons[0]).toBe('string');
    }
  });
});

describe('buildLongTermSetup — extreme-panic boost', () => {
  it('WATCHLIST + fearGreed<30 + HIGH/GOOD quality -> boosted to ACCUMULATE', () => {
    const high = buildLongTermSetup(timing(55), quality(80), { fearGreed: 22 });
    expect(high.status).toBe('ACCUMULATE');
    expect(high.reasons.some(r => r.includes('Extreme market panic'))).toBe(true);

    const good = buildLongTermSetup(timing(55), quality(68), { fearGreed: 29 });
    expect(good.status).toBe('ACCUMULATE');
  });

  it('does not fire when fearGreed >= 30', () => {
    const result = buildLongTermSetup(timing(55), quality(80), { fearGreed: 30 });
    expect(result.status).toBe('WATCHLIST');
  });

  it('does not fire when quality band is OK or WEAK_OR_UNKNOWN', () => {
    expect(buildLongTermSetup(timing(55), quality(62), { fearGreed: 10 }).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(timing(55), quality(40), { fearGreed: 10 }).status).toBe('NEUTRAL');
  });

  it('does not fire on WAIT, OVERSOLD_BUT_CAUTION, NEUTRAL, or INSUFFICIENT_DATA', () => {
    expect(buildLongTermSetup(timing(20), quality(80), { fearGreed: 5 }).status).toBe('WAIT');
    expect(buildLongTermSetup(timing(75), quality(40), { fearGreed: 5 }).status).toBe('OVERSOLD_BUT_CAUTION');
    expect(buildLongTermSetup(timing(55), quality(62), { fearGreed: 5 }).status).toBe('NEUTRAL');
    expect(buildLongTermSetup(null, null, { fearGreed: 5 }).status).toBe('INSUFFICIENT_DATA');
  });

  it('handles a null/missing marketContext gracefully (no boost, no throw)', () => {
    expect(buildLongTermSetup(timing(55), quality(80), null).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(80), {}).status).toBe('WATCHLIST');
    expect(buildLongTermSetup(timing(55), quality(80), undefined).status).toBe('WATCHLIST');
  });
});

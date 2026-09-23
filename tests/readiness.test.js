import { describe, it, expect } from 'vitest';
import { readinessTone, readinessColor, readinessStyle, signalTone, signalColor, scoreTone, scoreColor, scoreTierHint, rankGaps, reconcileVerdict } from '../src/lib/readiness.js';
import { TONE, toneColor, toneStyle } from '../src/lib/tone.js';

describe('readiness tones', () => {
  it('maps every readiness tier, and unknown input falls back to no-data', () => {
    expect(readinessTone('ACT')).toBe('good');
    expect(readinessTone('SOON')).toBe('partial');
    expect(readinessTone('WATCH')).toBe('waiting');
    expect(readinessTone('WAIT')).toBe('none');
    expect(readinessTone(undefined)).toBe('none');
    expect(readinessTone('WHATEVER')).toBe('none');
  });

  it('renders one colour per tier, shared with the tone palette', () => {
    expect(readinessColor('ACT')).toBe(TONE.good.color);
    expect(readinessColor('SOON')).toBe(TONE.partial.color);
    expect(readinessStyle('ACT')).toBe(toneStyle('good'));
  });
});

describe('direction-aware signals', () => {
  it('never colours a sell signal with the buy green', () => {
    expect(signalColor('ACT', true)).toBe(TONE.good.color);
    expect(signalColor('ACT', false)).toBe(TONE.danger.color);
    expect(signalColor('ACT', false)).not.toBe(signalColor('ACT', true));
  });

  it('keeps sell urgency on its own ramp', () => {
    expect(signalTone('ACT', false)).toBe('danger');
    expect(signalTone('SOON', false)).toBe('caution');
    expect(signalTone('WATCH', false)).toBe('waiting');
    expect(signalTone('WAIT', false)).toBe('none');
  });
});

describe('scoreTone', () => {
  it('uses the shared ACT >= 7 / SOON >= 5 tiers for an entry score', () => {
    expect(scoreTone(8.2)).toBe('good');
    expect(scoreTone(7)).toBe('good');
    expect(scoreTone(6.9)).toBe('partial');
    expect(scoreTone(5)).toBe('partial');
    expect(scoreTone(4.9)).toBe('waiting');
  });

  it('inverts for an exit score, where a high number means get out', () => {
    expect(scoreTone(8.2, 'exit')).toBe('danger');
    expect(scoreTone(6, 'exit')).toBe('caution');
    expect(scoreTone(2, 'exit')).toBe('waiting');
    expect(scoreColor(8.2, 'exit')).not.toBe(scoreColor(8.2, 'entry'));
  });

  it('treats a missing score as no data, not as a zero', () => {
    expect(scoreTone(null)).toBe('none');
    expect(scoreTone(undefined)).toBe('none');
    expect(scoreTone(NaN)).toBe('none');
    expect(scoreTone(0)).toBe('waiting');
  });
});

describe('scoreTierHint', () => {
  it('reports the distance to the next tier', () => {
    expect(scoreTierHint(6.2)).toBe('+0.8 to ACT');
    expect(scoreTierHint(4.3)).toBe('+0.7 to SOON');
    expect(scoreTierHint(1)).toBe('+2 to WATCH');
  });

  it('is null at the top tier with no blocked reason', () => {
    expect(scoreTierHint(7)).toBeNull();
    expect(scoreTierHint(9)).toBeNull();
  });

  it('surfaces a blocked reason instead of "already there" at the top tier', () => {
    expect(scoreTierHint(7.5, { blocked: 'needs market fear' })).toBe('needs market fear');
    expect(scoreTierHint(7.5, { blocked: null })).toBeNull();
  });

  it('ignores a blocked reason below the top tier — the gap is the real answer', () => {
    expect(scoreTierHint(6, { blocked: 'needs market fear' })).toBe('+1 to ACT');
  });

  it('treats a missing score as no hint', () => {
    expect(scoreTierHint(null)).toBeNull();
    expect(scoreTierHint(NaN)).toBeNull();
  });
});

describe('rankGaps', () => {
  const components = [
    { label: 'A', score: 2, max: 3 },
    { label: 'B', score: 0, max: 2 },
    { label: 'C', score: 1, max: 1 },
    { label: 'D', score: null, max: 1 },
  ];

  it('ranks by points left on the table, largest gap first', () => {
    expect(rankGaps(components).map(c => `${c.label} +${c.gap}`))
      .toEqual(['B +2', 'A +1']);
  });

  it('skips a completed or unknown component', () => {
    const labels = rankGaps(components, 10).map(c => c.label);
    expect(labels).not.toContain('C'); // maxed out
    expect(labels).not.toContain('D'); // null = unknown, not a gap
  });

  it('respects the limit and handles an empty/missing list', () => {
    expect(rankGaps(components, 1)).toHaveLength(1);
    expect(rankGaps([])).toEqual([]);
    expect(rankGaps(undefined)).toEqual([]);
  });
});

describe('tone palette', () => {
  it('exposes a colour and a matching tint for every tone', () => {
    for (const [name, t] of Object.entries(TONE)) {
      expect(t.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(toneStyle(name)).toBe(`color:${t.color};background:${t.bg}`);
    }
  });

  it('falls back to the no-data tone for an unknown name', () => {
    expect(toneColor('nope')).toBe(TONE.none.color);
  });
});

describe('reconcileVerdict', () => {
  const rows = (o = {}) => ({
    pullback: { readiness: 'WAIT', inRadar: false, ...o.pullback },
    momentum: { readiness: 'WAIT', inRadar: false, ...o.momentum },
    longTerm: { status: 'WAIT', ...o.longTerm },
  });

  it('bearish score + pullback SOON/ACT in the radar → staged accumulation', () => {
    for (const readiness of ['SOON', 'ACT']) {
      const v = reconcileVerdict('LEAN_SHORT', rows({ pullback: { readiness, inRadar: true } }));
      expect(v.text).toMatch(/Weak now, accumulation setup forming/);
      expect(v.tone).toBe('partial');
    }
  });

  it('a pullback the radar gated out does not count', () => {
    expect(reconcileVerdict('LEAN_SHORT', rows({ pullback: { readiness: 'SOON', inRadar: false } }))).toBeNull();
  });

  it('bullish score + breakout ACT → trend confirmed', () => {
    const v = reconcileVerdict('STRONG_LONG', rows({ momentum: { readiness: 'ACT', inRadar: true } }));
    expect(v).toEqual({ tone: 'good', text: 'Trend confirmed — breakout entry' });
    expect(reconcileVerdict('STRONG_LONG', rows({ momentum: { readiness: 'SOON', inRadar: true } }))).toBeNull();
  });

  it('long-term ACCUMULATE → quality on sale, regardless of badge', () => {
    const v = reconcileVerdict('NEUTRAL', rows({ longTerm: { status: 'ACCUMULATE' } }));
    expect(v).toEqual({ tone: 'good', text: 'Quality on sale — long-term entry window' });
  });

  it('otherwise null (header shows the badge alone)', () => {
    expect(reconcileVerdict('NEUTRAL', rows())).toBeNull();
    expect(reconcileVerdict('NO_DATA', null)).toBeNull();
  });
});

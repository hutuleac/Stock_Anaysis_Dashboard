import { describe, it, expect } from 'vitest';
import { readinessTone, readinessColor, readinessStyle, signalTone, signalColor, scoreTone, scoreColor } from '../src/lib/readiness.js';
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

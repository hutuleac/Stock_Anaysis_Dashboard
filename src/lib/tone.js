// The one colour ramp for the whole dashboard. A tone means the same thing on
// every panel, so a colour can be read without reading the label next to it:
//
//   good    — this is working in your favour / act on it
//   partial — partly there, not yet actionable
//   caution — actionable, but against you: sell pressure, a failed gate
//   waiting — not contributing yet; this is what you're waiting on
//   none    — no data (distinct from a real zero, which is `waiting`)
//
// Kept as hex + rgba rather than Tailwind classes so every consumer renders the
// identical colour: class-based ramps in four components had already drifted
// (SOON was purple in one place and amber in another, WATCH grey in two panels
// and near-white in a third).
export const TONE = {
  good:    { color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)' },   // bull-strong
  partial: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },  // warning
  caution: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.12)' },  // bear-weak
  danger:  { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)' },   // bear-strong
  waiting: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.10)' }, // neutral slate
  none:    { color: '#6b7280', bg: 'rgba(107, 114, 128, 0.08)' }, // no data
};

export const toneColor = (tone) => (TONE[tone] ?? TONE.none).color;

// Inline `color:…;background:…` for a chip or badge.
export function toneStyle(tone) {
  const t = TONE[tone] ?? TONE.none;
  return `color:${t.color};background:${t.bg}`;
}

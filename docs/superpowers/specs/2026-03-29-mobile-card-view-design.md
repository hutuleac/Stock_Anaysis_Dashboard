# Mobile Card View — Richer Card Design

**Date:** 2026-03-29
**Status:** Approved
**Scope:** `src/lib/components/WatchlistTable.svelte` — mobile card block only (`block sm:hidden`)

---

## Problem

The existing mobile card shows 3 rows (symbol/badge, price/score, T/F/S bars) but does not surface enough signal to decide whether to tap into a ticker. Key indicators (RSI, ADX, volume ratio) are only visible after expanding the card, which requires an extra tap.

---

## Goal

Surface the 3 most actionable at-a-glance signals — RSI, ADX, Volume ratio — directly on the collapsed card as a new Row 4. Add a left-border accent color keyed to the badge for instant visual scanning.

---

## Design

### Card Layout (collapsed)

```
┌─────────────────────────────────────────────┐
│ NVDA          ↑ LEAN LONG    ⚡ 12d earnings │  Row 1: symbol + badge + earnings (unchanged)
│ $875.40  +2.4%              Score: 74        │  Row 2: price + change + score (unchanged)
│ T ██████ 7  F ████ 5  S ███ 4               │  Row 3: T/F/S mini-bars (unchanged)
│ RSI 62 ↗   ADX 32 trend   Vol 1.4×          │  Row 4: NEW — indicator chips
└─────────────────────────────────────────────┘
```

### Row 4 — Indicator Chips

Three chips displayed left-to-right with a `gap-3` flex row, `mt-1.5`:

| Chip | Source field | Display | Color logic |
|------|-------------|---------|-------------|
| **RSI** | `indicators.rsi` | `RSI {value} {arrow}` | green if < 40, red if > 70, muted otherwise |
| **ADX** | `indicators.adx` | `ADX {value} {label}` | label = "trend" if ≥ 25, "weak" if < 25; always muted color |
| **Vol** | `tdQuote.volumeRatio` | `Vol {ratio}×` | green if 0.8–1.9×, red if ≥ 2×, muted otherwise |

Arrow for RSI direction (`indicators.rsiDirection`): `↑` = bullish, `↓` = bearish, `→` = neutral/null.

If a value is null/unavailable, the chip is omitted (no placeholder dash).

### Left Border Accent

Each card gains a `border-l-2` left border whose color maps to the score badge:

| Badge | Border color |
|-------|-------------|
| STRONG_LONG | `border-l-bull-strong` |
| LEAN_LONG | `border-l-bull-weak` |
| NEUTRAL | `border-l-border` (subtle gray) |
| LEAN_SHORT | `border-l-bear-weak` |
| STRONG_SHORT | `border-l-bear-strong` |

### Padding tweak

Card container: `px-4 py-3.5` (was `px-3 py-3`) for slightly more breathing room on touch targets.

---

## Expanded View

No changes. The tap-to-expand panel (PriceChart → FundamentalsBar → PreBuyChecklist → EntryPanel → Notes) already works correctly on mobile.

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/components/WatchlistTable.svelte` | Add Row 4 chips + left border accent to mobile card block (lines ~262–343) |

No new files. No store changes. No API changes.

---

## Verification

1. Open app on mobile viewport (< 640px / Chrome DevTools)
2. Collapsed card shows 4 rows — Row 4 visible with RSI, ADX, Vol chips
3. Left border accent color matches badge (LEAN LONG = green accent, NEUTRAL = gray, etc.)
4. Chips with null data are omitted cleanly (no "—" placeholders)
5. Tap card → expansion panel works as before (no regression)
6. Desktop (≥ sm) — mobile card not visible, desktop table unaffected

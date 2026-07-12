# Mobile pass v0.19 — design spec

Date: 2026-07-12
Status: approved (audit + brainstorm session)
Scope: three slices, one per PR, in order. Display-only, zero new API calls, all
state in localStorage. Existing 306 tests stay green; each slice adds its own.

## Why

The mobile experience is a stripped-down fork of desktop: indicator tooltips
never had a touch trigger (the PR #23 bottom sheet exists but only hover opens
it), the mobile expansion panel silently lacks NewsPanel, score history, the
price-alert form, and the v0.18 Copy-for-AI button, and `WatchlistTable.svelte`
(883 lines, largest file) maintains two duplicated layouts that caused exactly
this drift. Fix the trigger, unify the panel so drift cannot recur, cut the
documented duplications, then polish the mobile reading flow.

## Slice 1 — touch tooltips + unified expansion panel (functional)

### 1a. Tap trigger in `src/lib/actions/tooltip.js`
- Add a `click` listener alongside the existing mouse listeners.
- On tap: if the device is coarse-pointer (`matchMedia('(hover: none)')`,
  evaluated per-event, not cached), resolve the def and `showTooltip` at the
  tap coordinates; call `stopPropagation()` so a chip inside a clickable card
  does not also toggle the card. If the tooltip is already visible, a second
  tap closes it (toggle).
- On hover-capable devices the click handler does nothing — desktop behavior
  is byte-identical to today.
- The existing mobile bottom sheet (backdrop tap + ✕ button) remains the
  close path.
- Tests (`tests/tooltip.test.js`, jsdom): tap on coarse pointer shows/toggles;
  tap on fine pointer is a no-op; stopPropagation verified via a parent click
  spy; mouseenter path unchanged.

### 1b. One expansion panel, two layouts
- Extract the desktop expanded-row content (PriceChart, NewsPanel,
  FundamentalsBar, score-history chart, EntryPanel, alert form, notes, AI
  toolbar) into a Svelte 5 `{#snippet expandedPanel(ticker, data, score, ...)}`
  inside `WatchlistTable.svelte`, rendered by BOTH the desktop `<tr>` expansion
  and the mobile card expansion.
- Mobile therefore gains: NewsPanel, score history, price alerts, Copy for AI
  (+ template dropdown), and a "Remove from watchlist" affordance (confirm via
  the existing removeTicker; mobile cards currently have no ✕ at all).
- The score-history SVG uses a fixed 600-wide viewBox — verify it scales via
  its existing `w-full` (preserveAspectRatio="none"); adjust only if broken.
- No visual redesign in this slice: the shared panel renders the same content
  stack both places. Redesign is slice 3.

## Slice 2 — dedup refactors (zero behavior change)

### 2a. `tdValuesToCandles(vals)` helper
- New `src/lib/candles.js` exporting `tdValuesToCandles(vals)`: maps a
  TwelveData `values` array (newest-first strings) to the synthetic candle
  object `{ t, o, h, l, c, v }` exactly as the four duplicated App.svelte
  blocks (~lines 248/331/474/511) do today, including the `'T00:00:00Z'` UTC
  parse and `parseFloat` volume handling. All four sites call it.
- `resampleWeekly` stays where it is; this helper only builds the candle
  object.
- Tests (`tests/candles.test.js`): shape, ordering, UTC timestamp math, NaN
  passthrough parity with the old inline code (character-for-character parity
  is the goal — no "improvements").

### 2b. WatchlistTable chip/score snippets
- `{#snippet tickerChips(data)}` — the setup/RS/EMA-stack/52w-high chip row,
  used by mobile card row 1 and desktop ticker cell (desktop keeps its
  `hidden md:inline-block` wrapper semantics — pass a variant flag or wrap at
  the call site).
- Score color/label ternaries (duplicated as `scoreCssColor(M)`/
  `scoreLabel(M)`) become one `scoreStyle(score)` helper function.
- FundamentalsBar's with/without-value tipAction pairs are explicitly OUT of
  scope (low value, high churn).

## Slice 3 — mobile redesign (visual, < sm only)

- **Card**: chips move off the ticker row into their own horizontally
  scrollable row (`overflow-x-auto`, no wrap, scrollbar hidden); score becomes
  the right-aligned visual anchor with its existing color coding; row heights
  and tap targets ≥ 44px.
- **Expansion panel** (mobile variant of the slice-1 snippet): collapsible
  sections — order: Thesis + score history (open), Chart (open), Indicators
  (open), Entry Plan (collapsed), News (collapsed), Notes (collapsed).
  Section headers are full-width tap rows with a chevron; state is per-session
  (`$state`, not persisted).
- **Sticky action bar** at the bottom of the expanded card: 🤖 Copy for AI ·
  🔔 Alert · ✕ Remove. Sits `sticky bottom-0` within the card, surface-800
  background, border-t. Desktop keeps its existing inline toolbar/buttons.
- Desktop (≥ sm) rendering must be pixel-equivalent to pre-slice-3; the
  collapsible/sticky behavior is gated to the mobile variant.
- Visual language unchanged: existing surface/border/text tokens, no new
  colors, Apple-clean density per the owner's design preferences.

## Testing / verification

- Unit: new tooltip action tests + candles parity tests; all existing suites
  green after every slice.
- Each slice: `npm run build` warning-free for touched code.
- After slices 1 and 3: viewport-emulated QA pass (375×812) — expand a card,
  tap 3 indicator tips, set an alert, copy a prompt, open every collapsible
  section, check ETF tab tap-tooltips (they use the same action, so slice 1
  fixes them too).

## Out of scope

- EtfDashboard mobile card layout (squeezed table is usable; revisit after
  this round proves the patterns).
- FundamentalsBar tipAction pair dedup.
- Any scoring/signal logic change.

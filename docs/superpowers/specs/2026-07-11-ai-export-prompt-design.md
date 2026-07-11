# AI Export Prompt — design spec

Date: 2026-07-11
Status: approved (brainstorm session)
Scope: v0.18 feature round, phase 1. Phase 2 (Gemini API) parked in BACKLOG.md.

## Purpose

Let the user hand off a stock's full dashboard reading to an external LLM
(Claude, Perplexity, etc.) with one click. The dashboard is offline-first and
has no news/web access; an external LLM fills that gap. The export merges a
structured data snapshot into a user-editable prompt template and copies the
result to the clipboard, ready to paste.

Constraints (repo conventions): display-only, zero new API calls, all state in
localStorage, pure logic in a testable `src/lib` module, tests gate the merge.

## Decisions made

- **v1 flow:** one-click copy from the expanded ticker row. No modal, no
  two-step extract/infuse UI (can be added later if needed).
- **Templates:** 4 shipped presets, each editable in Settings, one marked as
  default. Copy button uses the default; a chevron dropdown next to it allows
  a one-off pick of another template (also copies immediately).
- **Data scope:** everything, always. Full snapshot every time, values carry
  the dashboard's plain-English interpretation (e.g. "RSI 61 (Extended)").
  No section-picking UI.
- **Coverage:** Stocks view only. ETF export is a follow-up round.

## Architecture

### 1. `src/lib/export.js` — pure module, no imports from stores

- `buildStockSnapshot(t, marketCtx)` → plain-text block. Reads only fields
  already present on the ticker object: `data.quote`, `data.indicators`,
  `data.metrics`, `data.profile`, `data.rs`, `data.smartMoney`, `data.score`
  (score/badge/conviction), `data.setups` (Pullback/Momentum), `data.dip`,
  plus `marketCtx` (VIX, F&G, SPY trend) and days-to-earnings.
- Sections: header (ticker, name, sector, snapshot date + freshness caveat),
  PRICE, DASHBOARD SCORE, TECHNICALS (daily), SETUPS (weekly), FUNDAMENTALS,
  REL. STRENGTH vs SPY, SMART MONEY, DIP SCORE, MARKET CONTEXT, EARNINGS.
- Every missing/null value prints `n/a`. Never throws on partial data.
- `buildPrompt(templateBody, snapshot, ticker)` → final text. Substitutes
  `{{DATA}}`, `{{TICKER}}`, `{{DATE}}`. Unknown placeholders left as-is.

### 2. `src/lib/stores/prompts.svelte.js` — template store

- Seeds 4 presets on first run; localStorage key `promptTemplates`
  (array of `{ id, name, body }`), default id in `promptDefault`.
- Presets (each instructs the LLM to combine the snapshot with fresh web
  research):
  1. **Deep Dive** — full analysis, recent news, updated thesis, bull/bear case
  2. **Trade Setup Review** — validate entry/stop/target, near-term catalysts,
     risk/reward verdict
  3. **Risk Check** — what could break the position; earnings risk, sector
     news, red flags
  4. **News Catalyst Scan** — last-2-weeks news, sentiment shift, does it
     change the dashboard reading
- `resetTemplate(id)` restores a shipped preset. User edits persist.

### 3. UI

- **Expanded row (WatchlistTable.svelte):** "Copy for AI" button near existing
  actions. Click → merge default template + snapshot → clipboard → button
  flashes "Copied ✓" (~1.5 s). Chevron beside it opens a template dropdown;
  picking one copies immediately with that template.
- **Settings panel:** "AI Prompts" section — list of templates, textarea edit,
  set-default radio, per-template "Reset to default". Placeholder help line
  (`{{DATA}}`, `{{TICKER}}`, `{{DATE}}`).
- Clipboard: `navigator.clipboard.writeText` with hidden-textarea
  `execCommand('copy')` fallback.

### 4. Tests — `tests/export.test.js`

- Snapshot with full data: all sections present, labels correct.
- Snapshot with partial data: nulls → `n/a`, no throw.
- Interpretation labels (RSI bands, badge names) match dashboard conventions.
- `buildPrompt`: placeholder substitution, unknown placeholders untouched.
- Store: seed on empty storage, edit persistence, reset restores preset,
  default selection. ~12–15 tests total.

## Error handling

- Clipboard write failure → brief "Copy failed" state on the button, no crash.
- Ticker with no fetched data yet → snapshot still renders header + `n/a`
  rows (button never disabled-crashes).

## Phase 2 (parked)

Optional Gemini free-tier key in Settings → "Analyze" button posts the same
merged prompt, renders the response inline. The snapshot/template layer is
the exact input it needs; nothing built in phase 1 is throwaway.

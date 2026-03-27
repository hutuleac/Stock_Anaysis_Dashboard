# TODOS

## Wave 1

### localStorage quota handling
- **What:** Wrap all `localStorage.setItem` calls in try/catch. Show a toast "Storage full — clear old data in Settings" on QuotaExceededError.
- **Why:** Without this, writes silently fail when localStorage hits ~5MB. User loses watchlist/portfolio data with no indication.
- **Pros:** Prevents silent data loss; simple to implement (one wrapper function).
- **Cons:** Adds a toast/notification component dependency.
- **Context:** The design doc uses localStorage for watchlist, portfolio, API cache (with TTLs), and checklist state. Cache data is the most likely culprit — fundamentals cached for 7 days across many tickers accumulate. The `fetchWithCache` function in `api/finnhub.svelte.js` is the primary write path.
- **Depends on:** localStorage sync layer (`$effect` in store modules).

### Update design doc code samples for Svelte 5 runes
- **What:** Replace all `writable()`, `derived()`, and `$:` syntax in the design doc with `$state`, `$derived`, and `.svelte.js` module patterns.
- **Why:** The eng review decided on Svelte 5 runes only. Design doc currently mixes Svelte 4 and 5 syntax, which will confuse implementation.
- **Pros:** Single source of truth matches the architectural decision.
- **Cons:** None — purely documentation.
- **Context:** Affected sections: "Recommended Approach" code sample, build steps 3-5 in "Next Steps", checklist derived store description. The runes pattern uses `$state([])` in `.svelte.js` modules instead of `writable([])` from `svelte/store`.
- **Depends on:** Nothing. Can be done anytime before implementation.

### Define ticker search UX edge cases
- **What:** Specify behavior for: no search results, ambiguous matches (multiple results for same query), Finnhub /search endpoint down, debounce timing.
- **Why:** The design doc says "Search input → Finnhub /search → select from dropdown" but doesn't specify failure/edge states. Implementer will have to guess.
- **Pros:** Prevents UX inconsistency; quick to define (5 min).
- **Cons:** None.
- **Context:** Finnhub `/search` returns `{count, result[{symbol, description, type}]}`. Common edge: user types "META" and gets Meta Platforms Inc (META) plus Metavisio (ALTMV.PA) plus others. Need: filter to common stocks only? Show all? Limit to US exchanges?
- **Depends on:** Nothing.

### API key onboarding flow
- **What:** Design a first-run experience that prompts for Finnhub API key before the dashboard is usable. Include a direct link to Finnhub's free API key signup page.
- **Why:** Without an API key, the entire dashboard shows skeleton/error states. The settings panel exists but there's no prompt guiding the user there on first load.
- **Pros:** Zero-to-working-dashboard in under 2 minutes; prevents confusion on first launch.
- **Cons:** Adds a modal/overlay component for first-run.
- **Context:** Finnhub free tier keys are available at finnhub.io/register. Key is stored in localStorage. The same first-run flow could also prompt for portfolio snapshot (already mentioned in design doc as "prompted once on first load if empty").
- **Depends on:** SettingsPanel.svelte (where the key is stored/edited after onboarding).

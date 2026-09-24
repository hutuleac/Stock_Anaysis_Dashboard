# QA pass — 2026-09-24 (v0.26, live keys)

> **Status:** P0 and P1 (#1–#6) fixed on branch `fix/qa-p0-p1`. Re-measured on a production build: warm refresh 106 s → 35 s, 0 TwelveData quote credits, Macro tile loads from `macro.json`. P2/P3 are still open.

Playwright, Chromium, local dev build of `main` @ `4f9865d` plus a check against the live site. 13-ticker watchlist, 15 ETFs. Tested cold (empty cache) and warm (second refresh). Viewports 1440×900 and 402×874. Screenshots are in `docs/screenshots/qa-2026-09-24/`.

## Summary

The app loads cleanly. There are no console errors during refresh, every API call returned 200, no `NaN`/`undefined` text appears, and nothing scrolls horizontally on a phone. There are two real defects. **On the live site the macro data from FRED no longer loads** because the CORS proxy now requires a paid key. **The price chart throws an error** when it is unmounted quickly. The biggest improvement available is refresh time: **a warm refresh takes 106 s, and about 70% of that is spent on duplicate or redundant calls.**

## Measured

| | Cold (empty cache) | Warm (2nd refresh) |
|---|---|---|
| Wall time | ~5 min | **106 s** |
| Finnhub calls (60/min free) | 116 | 38, all `/quote` |
| TwelveData credits (8/min, 800/day free) | 38 (25 `time_series` + 13 `quote`) | 13, all `/quote` |
| FRED / CNN F&G / Binance | 5 / 1 / 1 | cached |
| Errors / non-200 | 0 / 0 | 0 / 0 |
| localStorage after load | 1.4 M chars, 83% of it `td_ts_1day_*` | — |

Where the 38 warm Finnhub quotes come from: 13 tickers + SPY + 11 sector ETFs (market context), plus **13 sector-ETF quotes fetched again per ticker**. XLK alone is fetched 7× per refresh.

---

## P0 — broken

### 1. FRED is dead in production (Macro tile + HY credit-stress gate)
`fred.js` routes production calls through `corsproxy.io`. That service now returns `401 {"error":"A valid API key is required"}`. I confirmed this from the real `hutuleac.github.io` origin. Local dev still works because it uses the Vite `/fred-api` proxy, so the break never shows up locally. Effect: on the live site the Macro tile and the **only macro input that changes classification** (HY `creditStress`) are silently absent.

**Fix (recommended):** a scheduled GitHub Action, run daily, that fetches the 5 series and commits `public/macro.json`. The app then reads it same-origin.
- No proxy, and the FRED key never reaches the browser or a third party (today the key goes through corsproxy).
- FRED series update daily or monthly, so a daily snapshot loses nothing.
- Zero runtime dependencies. It uses the existing Pages deploy.

Alternative: a Cloudflare Worker proxy (free tier is 100k req/day). It does the same job but adds a service to run and monitor. The Action is simpler.

### 2. `PriceChart` crash on fast unmount
`TypeError: Failed to execute 'observe' on 'ResizeObserver': parameter 1 is not of type 'Element'` at `PriceChart.svelte:544`. `onMount` defers `createChart(container)` with `setTimeout(0)`. If the component is destroyed first (for example, a Stocks⇄ETFs switch while a row is expanded), `container` is null. It also leaks a chart that nothing removes.
**Fix:** one line, `if (!container) return;` at the top of the timeout callback.

---

## P1 — rate limits / refresh speed (zero feature loss)

### 3. Drop the TwelveData `/quote` enrichment → about −60 s per refresh
`App.svelte:387` fetches a TD quote for every ticker and overwrites the Finnhub quote that was already fetched. Finnhub `/quote` is real-time for US stocks on the free tier, so this adds nothing. The cost is 13 TD credits per refresh, which takes 2 rate-limit windows (8/min), and it queues behind any candle fetch. TD's 800/day budget would then go almost entirely to candles.

### 4. Dedupe sector-ETF quotes → −13 Finnhub calls, about −14 s
`fetchSectorETFQuote(ticker.sector)` runs per ticker (`App.svelte:239`), but `fetchMarketContext` already fetched all 11 sector ETFs in the same refresh. Quote TTL is 0, so every call goes to the network. **Fix:** reuse market-context's sector quotes, or give quotes a ~60 s TTL, which dedupes every caller at once.

**3 + 4 together:** warm refresh drops from ~106 s to roughly 25–30 s (25 Finnhub calls at the 1.1 s spacing).

### 5. Cold start: make the wait honest, and trigger it automatically
- The 25 daily-candle series cost 1 TD credit each. At 8/min that is about 3 min minimum. Batching doesn't help because TD bills per symbol. **Show an ETA** in the progress chip ("candles 9/25 · ~2 min · TwelveData free tier 8/min") so it doesn't look hung.
- With keys set and an empty cache, the first screen is a table of `NO DATA` plus `⚠ Quotes unknown old`, and nothing starts. **Auto-run the first refresh** when keys exist and the cache is empty. Show the stale-quote warning only when a quote exists.

### 6. (Watch, don't build) TwelveData 429 handling
`fetchTD` checks for HTTP 429, but TwelveData can report rate limits as `{status:"error", code:429}` in the body. In that case the retry-after-61 s path is skipped and the call just fails. The client-side limiter makes this rare. Worth a check the next time a 429 shows up.

---

## P2 — visual / logic issues seen in screenshots

| # | Where | Issue | Suggested fix |
|---|---|---|---|
| 7 | Chart sub-pane (`04-chart.png`) | Volume and RSI share one pane. The axis reads `200000000.00` and RSI has no scale; only its 30/70 lines show. The TradingView logo sits on top of the first volume bar. | Volume `priceFormat: {type:'volume'}` on its own overlay scale. RSI in its own pane with a 0–100 scale. |
| 8 | Entry & Risk, AAPL (`03-aapl-expanded.png`) | Setups say **Breakout ACT**, but R:R is **1:0.2**: stop −11.7%, target = swing high +2.4%. On a breakout, the price is already at the swing high, so that target is meaningless. | In `entryPlan.js`: when the swing high is within ~1 ATR, use a measured-move / 2R target, or flag "no overhead target". |
| 9 | Desktop rows (`02-desktop-loaded.png`) | AAPL's chips wrap to 2 lines (`RS +9%`, `BULL STACK`, `2.4% ↓ 52wH · low vol`). TSLA's `LEAN SHORT` badge wraps and is taller than the others. | `whitespace-nowrap` on chips and badges; show at most 2 chips, then `+1`. |
| 10 | Score column | The sparkline draws a flat line from a single snapshot (all rows after a cache clear). | Hide it until there are ≥ 2 points. |
| 11 | Mobile (`06-mobile.png`) | Search placeholder cut to "Search ticker to a". The +Bulk / ↓CSV buttons use ~45% of the row. | Placeholder "Add ticker" below `sm`, and icon-only buttons. |
| 12 | ETF table (`05-etf.png`) | CSPX/VUAA show `RS 0% / 0%` (SPY against itself). | Render `benchmark` instead of 0%. |
| 13 | ETF table | 3 pairs are identical rows (CSPX=VUAA, CNDX=EQQQ, AIRO=BOTZ on the same proxy). TQQQ and SOXL are US-listed, not UCITS, which EU retail generally can't buy, yet they sit under the "UCITS ETFs" header. | Group by proxy, or accept it. Relabel non-UCITS rows. |
| 14 | ETF table | RS formatting is inconsistent: `-2%` next to `-3.1%`. | Always 1 decimal. |
| 15 | SPY tile | Sub-line renders as `$767.88· + rotation, breadth, btc`, with a stray middot/spacing. | Fix the separator. |

## P3 — housekeeping

- **Bundle 566 KB** (179 KB gz) trips Vite's 500 KB warning. Lazy-load `lightweight-charts` on the first row expand. It's a personal tool, so do this only if the first paint on mobile feels slow.
- **Storage:** TD candles are 1.17 M of the 1.4 M chars. That's fine at 26 series. If the watchlist grows past ~40, store candles as arrays (`[t,o,h,l,c,v]`) instead of objects, which cuts roughly 60%.
- **Binance** (the BTC tile) returns HTTP 451 for US IPs. That's fine from the EU. Mention it if the app is ever shared.

## Checked and fine
No console errors or warnings during either refresh, apart from #2. No failed requests. No horizontal overflow at 402 px. All 4 market tiles are populated in dev. Tooltips, the Today strip, scan summary, long-term card, revenue bars and the ETF signals all render. CNN Fear & Greed loads directly (no CORS issue).

## Free-tier budget after fixes 3 + 4

| Provider | Limit | Per warm refresh | Per cold day |
|---|---|---|---|
| Finnhub | 60/min | ~25 calls (~28 s) | ~103 |
| TwelveData | 8/min, 800/day | 0 | ~25 (candles, 24 h TTL) |
| FRED (via Action) | 120/min | 0 in browser | 5/day server-side |

TD daily use falls from about 25 + 13×N (N = refreshes) to a flat ~25. The watchlist can then grow well past 50 tickers before the 800/day cap matters. At that size the real constraint is how long the first load of the day takes, at 8/min.

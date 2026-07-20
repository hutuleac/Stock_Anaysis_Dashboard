<script>
  import { getApiKey, isRefreshing, getRefreshProgress, refreshAll, fetchSectorETFQuote, getSectorETF, fetchMarketContext, isStorageFull, clearStorageFullFlag, fetchCandles, fetchProfile, fetchSmartMoney, hydrateFromCache, pruneOrphanedCache, delay, fetchFinancialsReported, fetchHistoricalEarnings } from './lib/api/finnhub.svelte.js';
  import { hasTDApiKey, fetchTDQuote, fetchTimeSeries } from './lib/api/twelvedata.svelte.js';
  import { fetchMacroContext, readMacroFromCache } from './lib/api/fred.js';
  import { computeIndicatorsFromCandles, computeWeeklyTrend, computeRelativeStrength, computeBreadth, resampleWeekly, realizedVol, emaArray } from './lib/indicators.js';
  import { computeSetupSignals } from './lib/signals.js';
  import { computeTimingScore } from './lib/timingScore.js';
  import { parseFinancials, computeQualityScore } from './lib/qualityScore.js';
  import { computeChartAnchors } from './lib/chartAnchors.js';
  import { tdValuesToCandles } from './lib/candles.js';
  import { getTickers, getSymbols, setMarketData, getTickerData, selectTicker, getSelectedSymbol, loadDemoTickers, clearDemoTickers } from './lib/stores/watchlist.svelte.js';
  import { DEMO_TICKERS, DEMO_MARKET_DATA, DEMO_MARKET_CONTEXT } from './lib/demoData.js';
  import { getDaysToEarnings, computeScore, storeScoreSnapshot, setMarketContext, getMarketContext, storeSectorMomentumSnapshot, getSectorMomentumHistory, computeSectorMomentum } from './lib/scoring.js';
  import WatchlistTable from './lib/components/WatchlistTable.svelte';
  import MarketContextBar from './lib/components/MarketContextBar.svelte';
  import SettingsPanel from './lib/components/SettingsPanel.svelte';
  // OnboardingModal removed — demo mode replaces it

  import SetupRadar from './lib/components/SetupRadar.svelte';
  import DipRadar from './lib/components/DipRadar.svelte';
  import LongTermScanPanel from './lib/components/LongTermScanPanel.svelte';
  import EtfDashboard from './lib/components/EtfDashboard.svelte';
  import { getUniqueProxies, setEtfProxyData, setEtfSpyCloses, requestEtfExpand } from './lib/stores/etflist.svelte.js';
  import TooltipOverlay from './lib/components/TooltipOverlay.svelte';
  import HighlightsStrip from './lib/components/HighlightsStrip.svelte';
  import { version as pkgVersion } from '../package.json';

  // Badge shows the feature-round (major.minor); in-round patch bumps don't change it.
  const appVersion = `v${pkgVersion.split('.').slice(0, 2).join('.')}`;

  function handleHighlightNav(item) {
    activeView = item.view;
    if (item.view === 'stocks') selectTicker(item.symbol);
    else requestEtfExpand(item.symbol);
  }

  let settingsOpen = $state(false);
  let activeView = $state('stocks'); // 'stocks' | 'etfs'
  let isDemoMode = $state(false);
  let lastRefreshed = $state(null);
  let offline = $state(!navigator.onLine);
  let refreshError = $state('');
  let marketContextData = $state(null);
  let macroCtx = null; // FRED macro context — feeds setMarketContext, not the template
  let marketBarCollapsed = $state(false);
  let marketStatus = $state(getMarketStatus());

  // When a user enters API keys in Settings, exit demo mode and load real data
  $effect(() => {
    if (getApiKey() && isDemoMode) {
      isDemoMode = false;
      clearDemoTickers();
      handleRefresh();
    }
  });

  function getMarketStatus() {
    const now = new Date();
    // Convert to US Eastern time
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay(); // 0=Sun, 6=Sat
    const h = et.getHours(), min = et.getMinutes();
    const mins = h * 60 + min;
    const isWeekday = day >= 1 && day <= 5;
    const isOpen = isWeekday && mins >= 570 && mins < 960; // 9:30–16:00

    let nextEvent = null;
    if (isOpen) {
      const closeMin = 960 - mins;
      nextEvent = `Closes in ${Math.floor(closeMin / 60)}h ${closeMin % 60}m`;
    } else {
      // Next open: find next weekday 9:30
      let minsToOpen = (570 - mins + 1440) % 1440;
      if (!isWeekday) {
        const daysToMon = day === 0 ? 1 : 7 - day + 1;
        minsToOpen = daysToMon * 1440 - mins + 570;
      } else if (mins >= 960) {
        const daysToNext = day === 5 ? 3 : 1;
        minsToOpen = daysToNext * 1440 - mins + 570;
      }
      const h2 = Math.floor(minsToOpen / 60), m2 = minsToOpen % 60;
      nextEvent = h2 > 23 ? `Opens ${Math.floor(h2/24)}d ${h2%24}h` : `Opens in ${h2}h ${m2}m`;
    }
    return { isOpen, nextEvent };
  }

  // Refresh market status every minute + auto-refresh if configured
  if (typeof window !== 'undefined') {
    setInterval(() => { marketStatus = getMarketStatus(); }, 60000);

    setInterval(() => {
      const mins = parseInt(localStorage.getItem('autoRefreshInterval') || '0');
      if (mins <= 0) return;
      if (!getMarketStatus().isOpen) return;
      const lastMs = parseInt(localStorage.getItem('lastRefreshed') || '0');
      if (Date.now() - lastMs >= mins * 60000) handleRefresh();
    }, 60000);
  }

  // Load last refresh timestamp
  try {
    const saved = localStorage.getItem('lastRefreshed');
    if (saved) lastRefreshed = new Date(parseInt(saved));
  } catch { /* noop */ }

  // Online/offline detection
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => offline = false);
    window.addEventListener('offline', () => offline = true);

    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        selectTicker(null);
      } else if (e.key === 'r' && !isInput && !e.ctrlKey && !e.metaKey) {
        handleRefresh();
      } else if (e.key === '/' && !isInput) {
        e.preventDefault();
        document.querySelector('input[placeholder*="Search ticker"]')?.focus();
      } else if ((e.key === 'j' || e.key === 'k') && !isInput) {
        e.preventDefault();
        const symbols = getSymbols();
        if (!symbols.length) return;
        const currentIdx = symbols.indexOf(getSelectedSymbol() ?? '');
        const nextIdx = e.key === 'j'
          ? (currentIdx + 1) % symbols.length
          : (currentIdx <= 0 ? symbols.length - 1 : currentIdx - 1);
        selectTicker(symbols[nextIdx]);
      }
    });
  }

  async function handleRefresh() {
    if (!getApiKey() || isRefreshing()) return;
    refreshError = '';

    const symbols = getSymbols();
    if (symbols.length === 0) return;

    try {
      // FRED macro context (CPI, Fed funds, unemployment, yield curve) —
      // 24h localStorage cache, so this is usually a no-op. Non-blocking.
      try { macroCtx = await fetchMacroContext(); } catch { /* macro unavailable */ }

      // Fetch market context first (VIX, SPY, sectors, Fear & Greed)
      try {
        marketContextData = await fetchMarketContext();
        marketContextData.macro = macroCtx?.regime ?? null; // for the Macro tile
        // Push regime context into scoring engine — all computeScore() calls
        // this session will automatically use regime-aware weights + penalties.
        setMarketContext({
          vixPrice:       null, // refined below from SPY realized vol
          spyDowntrend:   (marketContextData.spy?.data?.dp ?? 0) < -0.5, // refined below
          fearGreedValue: marketContextData.fearGreed?.data?.score ?? null,
          macro:          macroCtx?.regime ?? null,
        });
      } catch { /* non-blocking — market context is informational */ }

      const results = await refreshAll(symbols);

      // Per-ticker enrichment: checklist auto-answers + indicators
      const tickers = getTickers();
      const toTs = Math.floor(Date.now() / 1000);
      const fromTs = toTs - 600 * 86400; // ~600 calendar days ≈ 415 trading days ≈ 19 monthly bars — EMA200 + monthly RSI(14)

      // SPY daily closes (fetched once, cached) — benchmark for Relative Strength
      let spyCloses = null;
      try {
        if (hasTDApiKey()) {
          const r = await fetchTimeSeries('SPY', '1day', 250);
          if (r?.data?.length) spyCloses = r.data.map(v => parseFloat(v.close));
        } else {
          const r = await fetchCandles('SPY', 'D', fromTs, toTs);
          if (r?.data?.c?.length) spyCloses = r.data.c;
        }
      } catch { /* RS unavailable this refresh */ }
      if (spyCloses) setEtfSpyCloses(spyCloses);

      // Volatility regime + SPY trend from the closes just fetched (audit F2+F4):
      // realized vol is the vixPrice proxy; downtrend = SPY below its EMA50.
      if (spyCloses?.length) {
        const volProxy = realizedVol(spyCloses);
        const ema50arr = emaArray(spyCloses, 50);
        const spyBelowEma50 = ema50arr.length
          ? spyCloses[spyCloses.length - 1] < ema50arr[ema50arr.length - 1] : null;
        if (marketContextData) {
          marketContextData.volProxy = volProxy;
          marketContextData.spyBelowEma50 = spyBelowEma50;
        }
        setMarketContext({
          vixPrice:       volProxy,
          spyDowntrend:   spyBelowEma50 ?? ((marketContextData?.spy?.data?.dp ?? 0) < -0.5),
          fearGreedValue: marketContextData?.fearGreed?.data?.score ?? null,
          macro:          macroCtx?.regime ?? null,
        });
      }

      for (const ticker of tickers) {
        const data = results[ticker.symbol];
        if (!data) continue;

        // Sector momentum — smoothed 10-snapshot rolling average of the sector
        // ETF's daily % change, replacing the old single-day boolean.
        try {
          const etf = getSectorETF(ticker.sector);
          const etfQuote = await fetchSectorETFQuote(ticker.sector);
          if (etfQuote.data) {
            storeSectorMomentumSnapshot(etf, etfQuote.data.dp);
            results[ticker.symbol].sectorMomentum = computeSectorMomentum(getSectorMomentumHistory(etf), etfQuote.data.dp);
          } else {
            results[ticker.symbol].sectorMomentum = null;
          }
        } catch {
          results[ticker.symbol].sectorMomentum = null;
        }
        await delay(100);

        // Company profile (cached 7d) → USD market cap + listing currency.
        // The metrics endpoint reports market cap in the company's reporting
        // currency (e.g. KRW for ADRs like SKM); profile2 gives USD.
        try {
          const profRes = await fetchProfile(ticker.symbol);
          if (profRes?.data?.marketCapitalization != null) {
            results[ticker.symbol].profile = {
              marketCapitalization: profRes.data.marketCapitalization,
              currency: profRes.data.currency ?? null,
            };
          }
        } catch { /* non-blocking */ }
        await delay(100);

        // Smart money (analyst recs + insider sentiment) — 7d cache, free tier
        try {
          const sm = await fetchSmartMoney(ticker.symbol);
          if (sm?.data) results[ticker.symbol].smartMoney = sm;
        } catch { /* non-blocking */ }
        await delay(100);

        // Daily candles → local RSI/MACD indicators
        try {
          if (hasTDApiKey()) {
            // TwelveData — Finnhub free tier blocks /candle
            const candleRes = await fetchTimeSeries(ticker.symbol, '1day', 250);
            if (candleRes?.data?.length) {
              // Convert to Finnhub-style raw object for computeIndicatorsFromCandles
              const vals = candleRes.data;
              const synthetic = tdValuesToCandles(vals);
              const localInd = computeIndicatorsFromCandles(synthetic);
              if (localInd) {
                results[ticker.symbol].indicators = localInd;
                // Build local volume fallback so Volume cell shows for all tickers
                const vols = synthetic.v.filter(v => v > 0);
                if (vols.length >= 20) {
                  const vol = vols[vols.length - 1];
                  const avgVol = Math.round(vols.slice(-20).reduce((s, v) => s + v, 0) / 20);
                  results[ticker.symbol].tdQuote = { volume: vol, avgVolume: avgVol, volumeRatio: avgVol > 0 ? vol / avgVol : null };
                }
              }

              // Weekly trend — aggregate daily bars into true weekly OHLCV
              const weeklyRaw = resampleWeekly(synthetic);
              const weeklyTrend = computeWeeklyTrend(weeklyRaw);
              if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
              const setups = computeSetupSignals(weeklyRaw);
              if (setups) results[ticker.symbol].setups = setups;

              const anchors = computeChartAnchors(synthetic);
              if (anchors) results[ticker.symbol].anchors = anchors;

              results[ticker.symbol].timingScore = computeTimingScore({
                dailyCandles: synthetic,
                weeklyCandles: weeklyRaw,
                marketContext: timingMarketContext(results[ticker.symbol].sectorMomentum),
              });

              if (spyCloses) {
                const rs = computeRelativeStrength(synthetic.c, spyCloses);
                if (rs.rs1m !== null || rs.rs3m !== null) results[ticker.symbol].rs = rs;
              }
            }
          } else {
            const candleRes = await fetchCandles(ticker.symbol, 'D', fromTs, toTs);
            await delay(100);
            const localInd = computeIndicatorsFromCandles(candleRes?.data);
            if (localInd) {
              results[ticker.symbol].indicators = localInd;
              const vols = (candleRes?.data?.v ?? []).filter(v => v > 0);
              if (vols.length >= 20) {
                const vol = vols[vols.length - 1];
                const avgVol = Math.round(vols.slice(-20).reduce((s, v) => s + v, 0) / 20);
                results[ticker.symbol].tdQuote = { volume: vol, avgVolume: avgVol, volumeRatio: avgVol > 0 ? vol / avgVol : null };
              }
            }

            const weeklyFromTs = toTs - 52 * 7 * 86400;
            const weeklyRes = await fetchCandles(ticker.symbol, 'W', weeklyFromTs, toTs);
            await delay(100);
            const weeklyTrend = computeWeeklyTrend(weeklyRes?.data);
            if (weeklyTrend) results[ticker.symbol].weekly = weeklyTrend;
            const setups = computeSetupSignals(weeklyRes?.data);
            if (setups) results[ticker.symbol].setups = setups;

            const anchors = computeChartAnchors(candleRes?.data);
            if (anchors) results[ticker.symbol].anchors = anchors;

            results[ticker.symbol].timingScore = computeTimingScore({
              dailyCandles: candleRes?.data,
              weeklyCandles: weeklyRes?.data,
              marketContext: timingMarketContext(results[ticker.symbol].sectorMomentum),
            });

            if (spyCloses && candleRes?.data?.c?.length) {
              const rs = computeRelativeStrength(candleRes.data.c, spyCloses);
              if (rs.rs1m !== null || rs.rs3m !== null) results[ticker.symbol].rs = rs;
            }
          }
        } catch { /* non-blocking */ }

        // Commit this ticker as soon as its enrichment lands — with a
        // rate-limited TD queue (8 req/min) a full watchlist can take
        // minutes to drain; don't make the UI wait for the last ticker.
        setMarketData({ [ticker.symbol]: results[ticker.symbol] });
      }

      // ETF proxies — daily candles per unique proxy → weekly resample → etf store.
      // TD path: SPY/QQQ often already cached from RS/watchlist fetches (cache hit = free).
      for (const proxy of getUniqueProxies()) {
        try {
          let synthetic = null;
          if (hasTDApiKey()) {
            const r = await fetchTimeSeries(proxy, '1day', 250);
            if (r?.data?.length) {
              const vals = r.data;
              synthetic = tdValuesToCandles(vals);
            }
          } else {
            const r = await fetchCandles(proxy, 'D', fromTs, toTs);
            if (r?.data?.c?.length) synthetic = r.data;
          }
          if (synthetic) {
            setEtfProxyData(proxy, {
              weeklyRaw: resampleWeekly(synthetic),
              dailyCloses: synthetic.c,
            });
          }
        } catch { /* non-blocking — ETF row shows 'no data' */ }
        await delay(100);
      }

      // TwelveData — live quote enrichment only (indicators already computed locally from candles)
      // This is 1 credit/ticker instead of 6; all RSI/MACD/BB/ADX/Stoch come from local computation above.
      if (hasTDApiKey()) {
        for (const ticker of tickers) {
          try {
            const qRes = await fetchTDQuote(ticker.symbol);
            const q = qRes?.data;
            if (q?.price && results[ticker.symbol]) {
              if (results[ticker.symbol].quote?.data) {
                results[ticker.symbol].quote.data.c  = q.price;
                results[ticker.symbol].quote.data.d  = q.change;
                results[ticker.symbol].quote.data.dp = q.changePct;
                results[ticker.symbol].quote.data.pc = q.prevClose;
              }
              results[ticker.symbol].tdQuote = q;
              setMarketData({ [ticker.symbol]: results[ticker.symbol] });
            }
          } catch { /* non-blocking */ }
        }
      }

      // Store score snapshots for velocity tracking
      for (const ticker of tickers) {
        const data = results[ticker.symbol];
        if (data) storeScoreSnapshot(ticker.symbol, computeScore(data).score);
      }

      // Watchlist breadth (%>EMA50/EMA200) — pure local aggregation, no new calls
      if (marketContextData) {
        const breadthEntries = tickers.map(t => {
          const d = results[t.symbol];
          return {
            price:  d?.quote?.data?.c ?? null,
            ema50:  d?.indicators?.ema50 ?? null,
            ema200: d?.indicators?.ema200 ?? null,
          };
        });
        marketContextData = { ...marketContextData, breadth: computeBreadth(breadthEntries) };
      }

      lastRefreshed = new Date();
      try { localStorage.setItem('lastRefreshed', String(lastRefreshed.getTime())); } catch { /* noop */ }

      // Persist all UI-critical fields to supplement (~100 KB).
      // Excludes only news (large, non-critical for scores/indicators).
      // First remove the old large snapshot key to free quota space.
      try { localStorage.removeItem('dashboard_snapshot'); } catch { /* noop */ }
      try {
        // Read previous supplement so candle-derived fields (indicators, weekly,
        // setups, rs) survive a refresh where candle fetches fail or are rate-limited.
        let prevSupp = null;
        try {
          const ps = localStorage.getItem('dashboard_supplement');
          if (ps) prevSupp = JSON.parse(ps)?.tickers ?? null;
        } catch { /* noop */ }

        const supplement = {};
        for (const [sym, d] of Object.entries(results)) {
          const p = prevSupp?.[sym];
          supplement[sym] = {
            quote:       d.quote       ?? null,
            earnings:    d.earnings    ?? null,
            metrics:     d.metrics     ?? null,
            indicators:  d.indicators  ?? p?.indicators  ?? null,
            tdQuote:     d.tdQuote     ?? p?.tdQuote     ?? null,
            weekly:      d.weekly      ?? p?.weekly      ?? null,
            setups:      d.setups      ?? p?.setups      ?? null,
            profile:     d.profile     ?? p?.profile     ?? null,
            rs:          d.rs          ?? p?.rs          ?? null,
            smartMoney:  d.smartMoney  ?? p?.smartMoney  ?? null,
            sectorMomentum: d.sectorMomentum ?? null,
            timingScore:  d.timingScore  ?? p?.timingScore  ?? null,
            qualityScore: d.qualityScore ?? p?.qualityScore ?? null,
          };
        }
        localStorage.setItem('dashboard_supplement', JSON.stringify({
          tickers: supplement,
          marketContextData: marketContextData ?? null,
          ts: lastRefreshed.getTime(),
        }));
      } catch { /* quota exceeded — non-fatal */ }
    } catch (err) {
      refreshError = err.message;
    }
  }

  function formatTime(date) {
    if (!date) return 'Never';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // Lazy Quality Score fetch — called when a ticker's row is expanded (Slice 3
  // design decision: avoid 2 extra Finnhub calls/ticker on every batch refresh).
  // Both underlying calls are already cached (7d financials, 24h earnings), so
  // re-expanding within the cache window costs nothing.
  async function loadQualityScoreForTicker(symbol) {
    const data = getTickerData(symbol);
    if (!data || data.qualityScore) return;
    try {
      const [finRes, earnRes] = await Promise.all([
        fetchFinancialsReported(symbol).catch(() => null),
        fetchHistoricalEarnings(symbol, 8).catch(() => null),
      ]);
      const financials = finRes?.data ? parseFinancials(finRes.data) : null;
      const earnings = Array.isArray(earnRes?.data) ? earnRes.data : null;
      const marketCap = data.profile?.marketCapitalization ?? null;
      const metric = data.metrics?.data?.metric ?? null;
      const quality = computeQualityScore({ metric, marketCap, financials, earnings });
      setMarketData({ [symbol]: { ...data, qualityScore: quality } });
    } catch { /* non-blocking — Long-Term Setup shows "not yet checked" */ }
  }

  // Market context for computeTimingScore — same source as the scoring engine
  // (spyDowntrend there already means "SPY below EMA50"), plus the per-ticker
  // sectorMomentum already computed on refresh (sector ETF avg daily % move).
  function timingMarketContext(sectorMomentum) {
    const ctx = getMarketContext() ?? {};
    const spyKnown = typeof ctx.spyDowntrend === 'boolean';
    return {
      fearGreed: ctx.fearGreedValue ?? null,
      volProxy: ctx.vixPrice ?? null,
      spyAboveEma50: spyKnown ? !ctx.spyDowntrend : null,
      spyDowntrend: spyKnown ? ctx.spyDowntrend : null,
      // sector ETF avg daily % move; > 1 matches scoring.js's positive tier
      sectorOutperforming: Number.isFinite(sectorMomentum) ? sectorMomentum > 1 : null,
    };
  }

  // On startup: merge Finnhub cache + supplement into one object, then set once.
  // Calling setMarketData twice causes the second call to replace (not merge)
  // per-ticker objects, losing fields from the first call.
  function hydrateStartup() {
    // No API key — show demo dashboard instead of blank screen
    if (!getApiKey()) {
      loadDemoTickers(DEMO_TICKERS);
      setMarketData(DEMO_MARKET_DATA);
      marketContextData = DEMO_MARKET_CONTEXT;
      setMarketContext({ vixPrice: 22.4, spyDowntrend: true, fearGreedValue: 38 });
      isDemoMode = true;
      return;
    }

    const symbols = getSymbols();
    if (!symbols.length) return;

    // Start with Finnhub-cached fields (quote, earnings, metrics, news)
    const results = hydrateFromCache(symbols);

    // Patch supplement fields directly into results (same object, no extra
    // setMarketData call). Runs BEFORE the ticker loop so the market context
    // it restores feeds the timingScore computations below; anything the loop
    // recomputes from candles simply overwrites the supplement snapshot.
    try {
      const raw = localStorage.getItem('dashboard_supplement');
      if (raw) {
        const sup = JSON.parse(raw);
        if (sup?.tickers) {
          for (const sym of symbols) {
            const s = sup.tickers[sym];
            if (!s || !results[sym]) continue;
            if (s.quote       != null) results[sym].quote       = s.quote;
            if (s.earnings    != null) results[sym].earnings    = s.earnings;
            if (s.metrics     != null) results[sym].metrics     = s.metrics;
            if (s.indicators  != null) results[sym].indicators  = s.indicators;
            if (s.tdQuote     != null) results[sym].tdQuote     = s.tdQuote;
            if (s.weekly      != null) results[sym].weekly      = s.weekly;
            if (s.setups      != null) results[sym].setups      = s.setups;
            if (s.profile     != null) results[sym].profile     = s.profile;
            if (s.rs          != null) results[sym].rs          = s.rs;
            if (s.smartMoney  != null) results[sym].smartMoney  = s.smartMoney;
            if (s.sectorMomentum != null) results[sym].sectorMomentum = s.sectorMomentum;
            if (s.timingScore  != null) results[sym].timingScore  = s.timingScore;
            if (s.qualityScore != null) results[sym].qualityScore = s.qualityScore;
          }
          if (sup.marketContextData) {
            marketContextData = sup.marketContextData;
            if (!macroCtx) macroCtx = readMacroFromCache(); // startup: cached FRED data only, no network
            marketContextData.macro = macroCtx?.regime ?? marketContextData.macro ?? null;
            setMarketContext({
              vixPrice:       sup.marketContextData.volProxy ?? null,
              spyDowntrend:   sup.marketContextData.spyBelowEma50
                                ?? ((sup.marketContextData.spy?.data?.dp ?? 0) < -0.5),
              fearGreedValue: sup.marketContextData.fearGreed?.data?.score ?? null,
              macro:          macroCtx?.regime ?? null,
            });
          }
          if (sup.ts) lastRefreshed = new Date(sup.ts);
        }
      }
    } catch { /* corrupted supplement — non-fatal */ }

    const tickerList = getTickers();
    for (const ticker of tickerList) {
      const data = results[ticker.symbol];
      if (!data) continue;
      if (data._candlesDaily)  { const ind = computeIndicatorsFromCandles(data._candlesDaily);  if (ind) data.indicators = ind; }
      if (data._candlesWeekly) { const wt  = computeWeeklyTrend(data._candlesWeekly);           if (wt)  data.weekly    = wt;  }
      if (data._candlesWeekly) { const st  = computeSetupSignals(data._candlesWeekly);          if (st)  data.setups    = st;  }
      if (data._candlesDaily)  { const an  = computeChartAnchors(data._candlesDaily);           if (an)  data.anchors   = an;  }
      if (data._candlesDaily || data._candlesWeekly) {
        data.timingScore = computeTimingScore({
          dailyCandles: data._candlesDaily,
          weeklyCandles: data._candlesWeekly,
          marketContext: timingMarketContext(data.sectorMomentum),
        });
      }
      delete data._candlesDaily;
      delete data._candlesWeekly;

      // TwelveData candle cache — used when Finnhub candles are unavailable (403).
      // Converts the cached td_ts_1day_* values into indicators on startup so tickers
      // load fully without needing a fresh API refresh.
      if (!data.indicators) {
        try {
          const tdRaw = localStorage.getItem(`td_ts_1day_${ticker.symbol}_1day_250`);
          if (tdRaw) {
            const td = JSON.parse(tdRaw);
            if (td?.data?.length >= 30) {
              const vals = td.data;
              const synthetic = tdValuesToCandles(vals);
              const ind = computeIndicatorsFromCandles(synthetic);
              if (ind) {
                data.indicators = ind;
                const vols = synthetic.v.filter(v => v > 0);
                if (vols.length >= 20) {
                  const vol = vols[vols.length - 1];
                  const avgVol = Math.round(vols.slice(-20).reduce((s, v) => s + v, 0) / 20);
                  data.tdQuote = { volume: vol, avgVolume: avgVol, volumeRatio: avgVol > 0 ? vol / avgVol : null };
                }
                // Aggregate daily→weekly (true OHLCV bars) for weekly trend + setups
                const weeklyRaw = resampleWeekly(synthetic);
                const wt = computeWeeklyTrend(weeklyRaw); if (wt) data.weekly = wt;
                const st = computeSetupSignals(weeklyRaw); if (st) data.setups = st;
                const an = computeChartAnchors(synthetic); if (an) data.anchors = an;
                data.timingScore = computeTimingScore({
                  dailyCandles: synthetic,
                  weeklyCandles: weeklyRaw,
                  marketContext: timingMarketContext(data.sectorMomentum),
                });
              }
            }
          }
        } catch { /* noop */ }
      }
    }

    // ETF proxy candles from the TwelveData localStorage cache
    for (const proxy of getUniqueProxies()) {
      try {
        const tdRaw = localStorage.getItem(`td_ts_1day_${proxy}_1day_250`);
        if (!tdRaw) continue;
        const vals = JSON.parse(tdRaw)?.data;
        if (!vals?.length) continue;
        const synthetic = tdValuesToCandles(vals);
        setEtfProxyData(proxy, { weeklyRaw: resampleWeekly(synthetic), dailyCloses: synthetic.c });
        if (proxy === 'SPY') setEtfSpyCloses(synthetic.c);
      } catch { /* noop */ }
    }

    setMarketData(results);
  }

  hydrateStartup();

  // One-time-per-load cleanup: drop cached quotes/candles/fundamentals/news for
  // symbols no longer in the watchlist or ETF proxy list. Prevents the
  // "storage full" warning from creeping back as tickers are added/removed
  // over time (see Settings > Clear API cache for a manual full wipe).
  try {
    pruneOrphanedCache([...getSymbols(), ...getUniqueProxies(), 'SPY']);
  } catch { /* noop — non-critical maintenance */ }
</script>

<div class="min-h-screen bg-surface-900">
  <!-- Header -->
  <header class="border-b border-border bg-surface-800/50 backdrop-blur-sm sticky top-0 z-30">
    <div class="max-w-[1800px] mx-auto px-3 sm:px-4 py-3 flex flex-nowrap sm:flex-wrap items-center justify-between gap-y-2 gap-x-2">
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <h1 class="text-lg font-bold text-text-primary tracking-tight">
          <span class="hidden sm:inline">Stock Dashboard</span>
          <span class="sm:hidden">StD</span>
        </h1>
        <span class="text-xs text-text-muted bg-surface-700 px-2 py-0.5 rounded hidden sm:inline">{appVersion}</span>

        <!-- Stocks | ETFs view toggle -->
        <div class="flex items-center gap-0.5 bg-surface-700/60 rounded-lg p-0.5">
          <button
            class="text-xs px-3 py-1 rounded-md transition-colors {activeView === 'stocks' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
            onclick={() => activeView = 'stocks'}
          >Stocks</button>
          <button
            class="text-xs px-3 py-1 rounded-md transition-colors {activeView === 'etfs' ? 'bg-surface-600 text-text-primary' : 'text-text-muted hover:text-text-secondary'}"
            onclick={() => activeView = 'etfs'}
          >ETFs</button>
        </div>
      </div>

      <div class="flex items-center gap-2 sm:gap-3">
        <!-- Market status -->
        <div class="hidden sm:flex items-center gap-1.5 text-xs">
          <span class="w-1.5 h-1.5 rounded-full {marketStatus.isOpen ? 'bg-bull-strong animate-pulse' : 'bg-surface-500'}"></span>
          <span class="{marketStatus.isOpen ? 'text-bull-strong' : 'text-text-muted'}">{marketStatus.isOpen ? 'OPEN' : 'CLOSED'}</span>
          <span class="text-text-muted">{marketStatus.nextEvent}</span>
        </div>

        <!-- Refresh button + progress -->
        {#if isRefreshing()}
          <div class="flex items-center gap-2 text-sm text-text-secondary">
            <div class="w-3.5 h-3.5 border-2 border-bull-strong border-t-transparent rounded-full animate-spin"></div>
            <span class="font-mono text-xs">
              {getRefreshProgress().current}/{getRefreshProgress().total}
            </span>
          </div>
        {:else}
          <button
            class="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 text-sm bg-surface-700 hover:bg-surface-600 text-text-secondary hover:text-text-primary rounded-lg transition-colors disabled:opacity-40"
            onclick={handleRefresh}
            disabled={!getApiKey() || getTickers().length === 0}
            title="Refresh"
          >
            <span>↻</span><span class="hidden sm:inline">Refresh</span>
          </button>
        {/if}

        <!-- Last refreshed -->
        <span class="text-xs text-text-muted hidden sm:inline">
          {lastRefreshed ? formatTime(lastRefreshed) : ''}
        </span>

        <!-- Settings gear -->
        <button
          class="p-2 text-text-muted hover:text-text-primary transition-colors"
          onclick={() => settingsOpen = true}
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>

    <!-- Progress bar -->
    {#if isRefreshing()}
      <div class="h-0.5 bg-surface-700">
        <div
          class="h-full bg-bull-strong transition-all duration-300"
          style="width: {(getRefreshProgress().current / Math.max(getRefreshProgress().total, 1)) * 100}%"
        ></div>
      </div>
    {/if}
  </header>

  <!-- Demo mode banner -->
  {#if isDemoMode}
    <div class="px-4 py-2.5 text-center text-sm bg-surface-700/60 border-b border-border flex items-center justify-center gap-3 flex-wrap">
      <span class="text-warning font-semibold">⚡ Demo Mode</span>
      <span class="text-text-muted">Sample data only — not real market prices.</span>
      <button
        class="text-xs px-2.5 py-1 bg-bull-strong/20 text-bull-strong rounded hover:bg-bull-strong/30 transition-colors font-semibold"
        onclick={() => settingsOpen = true}
      >
        Add API Keys to go live →
      </button>
    </div>
  {/if}

  <!-- Offline banner -->
  {#if offline}
    <div class="bg-warning/10 border-b border-warning/30 px-4 py-2 text-center">
      <span class="text-sm text-warning">
        Offline — showing cached data {lastRefreshed ? `from ${formatTime(lastRefreshed)}` : ''}
      </span>
    </div>
  {/if}

  <!-- Storage full warning -->
  {#if isStorageFull()}
    <div class="bg-warning/10 border-b border-warning/30 px-4 py-2 text-center">
      <span class="text-sm text-warning">Storage full — old cache data may not be saving. Clear cache in Settings.</span>
      <button class="text-xs text-text-muted ml-2 hover:text-text-secondary" onclick={clearStorageFullFlag}>dismiss</button>
    </div>
  {/if}

  <!-- Refresh error -->
  {#if refreshError}
    <div class="bg-danger/10 border-b border-danger/30 px-4 py-2 text-center">
      <span class="text-sm text-danger">Refresh failed: {refreshError}</span>
      <button class="text-xs text-text-muted ml-2 hover:text-text-secondary" onclick={() => refreshError = ''}>dismiss</button>
    </div>
  {/if}

  <!-- Market Context Bar -->
  <MarketContextBar marketData={marketContextData} bind:collapsed={marketBarCollapsed} />

  <!-- Main content -->
  <main class="max-w-[1800px] mx-auto px-2 sm:px-4 py-4 sm:py-6">

    <HighlightsStrip marketData={marketContextData} onNavigate={handleHighlightNav} />

    {#if activeView === 'stocks'}
      <SetupRadar />
      <DipRadar marketData={marketContextData} />
      <LongTermScanPanel marketContextData={marketContextData} />
      <WatchlistTable onTickerAdded={handleRefresh} onTickerExpand={loadQualityScoreForTicker} />
    {:else}
      <EtfDashboard />
    {/if}

    <div class="mt-6 border-t border-border/50 pt-3 flex justify-end">
      <span class="text-[13px] text-text-muted hidden sm:block">
        Shortcuts: <kbd class="bg-surface-700 px-1 rounded">R</kbd> refresh &nbsp;
        <kbd class="bg-surface-700 px-1 rounded">Esc</kbd> close &nbsp;
        <kbd class="bg-surface-700 px-1 rounded">/</kbd> search &nbsp;
        <kbd class="bg-surface-700 px-1 rounded">J</kbd><kbd class="bg-surface-700 px-1 rounded">K</kbd> navigate
      </span>
    </div>
  </main>
</div>

<!-- Settings Panel -->
<SettingsPanel bind:open={settingsOpen} />

<!-- Global rich tooltip overlay (portal pattern) -->
<TooltipOverlay />

// Published snapshot (scripts/snapshot.mjs → snapshot.json): the API cache as
// the browser fetchers would have written it, captured by the scheduled job at
// ~10:00 ET (open) and ~16:30 ET (close). Seeding copies each entry into
// localStorage unless the browser already holds a newer one, so every fetcher
// and TTL keeps working unchanged — the snapshot is just a pre-filled cache.

// Returns { generatedAt, mode } when a snapshot was applied, else null.
export async function seedSnapshot(url) {
  let snap;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    snap = await res.json();
  } catch { return null; }
  if (!snap?.entries) return null;

  for (const [key, raw] of Object.entries(snap.entries)) {
    try {
      const mine = JSON.parse(localStorage.getItem(key) ?? 'null')?.ts ?? 0;
      if (JSON.parse(raw).ts > mine) localStorage.setItem(key, raw);
    } catch { /* quota or bad entry — the live fetch path still covers it */ }
  }
  return { generatedAt: snap.generatedAt, mode: snap.mode };
}

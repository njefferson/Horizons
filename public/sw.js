// Quietkeep service worker.
//
// The cache name carries the version.capability.iteration triplet and is bumped
// with it (Doctrine §7, CLAUDE.md). Changing the triplet is what retires the old
// cache — that is the whole mechanism, so it is not optional.
const CACHE = 'quietkeep-0.9.0';

// The shell only. User data is NEVER cached here — it lives in IndexedDB, which
// this file does not touch and must not.
const SHELL = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './brand/icon-192.png',
  './brand/icon-512.png',
  './brand/apple-touch-icon.png',
  './brand/favicon-32.png',
];

self.addEventListener('install', (event) => {
  // Take over promptly: a half-updated shell is worse than a brief wait.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {
      // A failed precache must not block install. The app still works online,
      // and capture — the one thing that must never break — needs no network.
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Per-key, contained: one failed delete must not abort the sweep or skip
    // clients.claim() — reads below are pinned to CACHE, so a straggler old
    // cache is dead weight, never the winner (the audit showed caches.match
    // with no cacheName preferring the OLDEST cache).
    for (const key of await caches.keys()) {
      if (key !== CACHE) { try { await caches.delete(key); } catch { /* retried next activate */ } }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for navigations so a deployed update is picked up — but the
  // network gets a BOUNDED head start, not a blank cheque. On a stalled-but-
  // present connection ("lie-fi"), an unbounded fetch hangs far past the
  // 2-second capture budget, and the gap between thought and safety is the
  // whole product. If the deadline passes, the cached shell serves immediately
  // and the fetch keeps running in the background to freshen the cache for
  // next time.
  if (req.mode === 'navigate') {
    const NAV_DEADLINE_MS = 2000;
    event.respondWith((async () => {
      const freshen = fetch(req).then(async (fresh) => {
        if (fresh.ok) (await caches.open(CACHE)).put('./index.html', fresh.clone());
        return fresh;
      });
      // Keep freshening even after we answer from cache; swallow its failure.
      event.waitUntil(freshen.catch(() => {}));

      const timeout = new Promise((resolve) =>
        setTimeout(() => resolve(null), NAV_DEADLINE_MS));
      const winner = await Promise.race([freshen.catch(() => null), timeout]);
      // `.ok` matters: a reachable origin serving a 503 is a LOSS, not a win —
      // the audit showed an installed app rendering the deploy's error page
      // while a complete cached shell sat unused.
      if (winner && winner.ok) return winner;
      const cached = await (await caches.open(CACHE)).match('./index.html');
      if (cached) return cached;
      // No cache to fall back on (first visit): the network is all there is,
      // however long it takes. If it errored above, hand that answer over.
      return winner ?? freshen.catch(() => Response.error());
    })());
    return;
  }

  // Cache-first for the SHELL only, read from THIS version's cache — an
  // unscoped caches.match() prefers the oldest cache in creation order, which
  // pins a stale bundle if one old cache ever survives (audit). Non-shell GETs
  // pass through uncached, so the cache cannot grow without bound.
  const rel = `.${url.pathname}`;
  if (!SHELL.includes(rel) && !url.pathname.endsWith('/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  })());
});

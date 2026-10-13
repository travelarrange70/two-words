/**
 * TwoWords — Service Worker (PWA)
 * Strategy: Cache-first for assets, Network-first for API.
 * Enables offline map tiles, offline UI shell, and background sync.
 */

const CACHE_VERSION  = 'tw-v3.1.0-nomarks';
const SHELL_CACHE    = `${CACHE_VERSION}-shell`;
const TILE_CACHE     = `${CACHE_VERSION}-tiles`;
const API_CACHE      = `${CACHE_VERSION}-api`;

// Static shell assets to pre-cache on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/js/config.js',
  '/js/eventbus.js',
  '/js/state.js',
  '/js/ws.js',
  '/js/gps.js',
  '/js/camera.js',
  '/js/geo.js',
  '/manifest.json',
  // Fonts (if self-hosted in future)
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('[SW] Pre-cache partial failure (ok in dev):', err.message);
      }))
      .then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('tw-') && !k.startsWith(CACHE_VERSION))
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests we don't control (except tiles)
  if (url.hostname !== location.hostname &&
      !url.hostname.endsWith('cartocdn.com') &&
      !url.hostname.endsWith('arcgisonline.com') &&
      !url.hostname.endsWith('openfreemap.org') &&
      !url.hostname.endsWith('openstreetmap.org') &&
      !url.hostname.endsWith('tile.openstreetmap.org')) {
    return; // let browser handle it
  }

  // Map tiles → Cache-first (they rarely change)
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|pbf|mvt)$/) ||
      url.hostname.endsWith('arcgisonline.com') ||
      url.hostname.endsWith('openfreemap.org') ||
      url.hostname.endsWith('tile.openstreetmap.org')) {
    event.respondWith(_cacheFirst(TILE_CACHE, request));
    return;
  }

  // API routes → Network-first with stale fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(_networkFirst(API_CACHE, request));
    return;
  }

  // App HTML & Navigation → Network-first (so live updates appear immediately)
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(_networkFirst(SHELL_CACHE, request));
    return;
  }

  // Other static assets (images, css, js) → Stale-while-revalidate / Cache-first
  event.respondWith(_cacheFirst(SHELL_CACHE, request));
});

// ── Background Sync ───────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'gps-sync') {
    event.waitUntil(_flushGPSQueue());
  }
});

// ── Push Notifications ────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() ?? { title: 'TwoWords', body: 'New activity nearby!' };
  event.waitUntil(
    self.registration.showNotification(data.title || 'TwoWords', {
      body:  data.body  || '',
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      tag:   'twowords-push',
      data:  { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// ── Cache Strategies ──────────────────────────────────────────────────────────

async function _cacheFirst(cacheName, request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch (_) {
    return new Response('Offline', { status: 503 });
  }
}

async function _networkFirst(cacheName, request) {
  try {
    const resp = await fetch(request);
    if (resp.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, resp.clone());
    }
    return resp;
  } catch (_) {
    const cached = await caches.match(request);
    return cached ?? new Response(JSON.stringify({ error: 'offline' }), {
      status: 503, headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function _flushGPSQueue() {
  // Placeholder — would send queued GPS positions to server when back online
  console.log('[SW] GPS sync triggered');
}

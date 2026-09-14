/**
 * service-worker.js - PWA用 Service Worker
 *
 * HTML・イベントデータ・UX共通レイヤーはnetwork-first。
 * その他の静的アセットはstale-while-revalidate。
 */
const CACHE_NAME = 'wc-cache-v8';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/events.js',
  '/ux-improvements.css',
  '/ux-improvements.js',
  '/ux-polish.css',
  '/ux-polish.js',
  '/mobile-fixes.css',
  '/mobile-fixes.js',
  '/assets/icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

const OFFLINE_RESPONSE = () => new Response('オフラインのため表示できません。', {
  status: 503,
  statusText: 'Offline',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }
});

function isFreshnessCritical(url, request) {
  if (request.mode === 'navigate') return true;
  if (url.pathname === '/' || url.pathname.endsWith('.html')) return true;
  return /\/(events|organizations|script|auth-ui|pwa-install|ux-improvements|ux-polish|mobile-fixes)\.js$/.test(url.pathname)
    || /\/(style|ux-improvements|ux-polish|mobile-fixes)\.css$/.test(url.pathname);
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;

  if (isFreshnessCritical(url, event.request)) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.open(CACHE_NAME).then(async cache => (await cache.match(event.request)) || OFFLINE_RESPONSE()))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then(res => {
          if (res && res.status === 200) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        networkFetch;
        return cached;
      }
      const networkRes = await networkFetch;
      return networkRes || OFFLINE_RESPONSE();
    })
  );
});

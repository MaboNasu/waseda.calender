/**
 * service-worker.js - PWA用 Service Worker
 *
 * 戦略: stale-while-revalidate（キャッシュがあれば即返し、裏でネットワークから取得して更新する）。
 * 自分のオリジン以外（Firebase/GA4/CDN等）のリクエストは素通りさせ、キャッシュ対象にしない。
 */
const CACHE_NAME = 'wc-cache-v1';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/events.js',
  '/assets/icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // Firebase/GA4/CDN等はキャッシュしない

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const networkFetch = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        networkFetch; // 裏でキャッシュを更新（結果は待たない）
        return cached;
      }
      const networkRes = await networkFetch;
      return networkRes || new Response('オフラインのため表示できません。', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }
      });
    })
  );
});

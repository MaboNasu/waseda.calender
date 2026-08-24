/**
 * service-worker.js - PWA用 Service Worker
 *
 * 戦略: HTML本体とevents.js/organizations.js（イベント日程データ）はnetwork-first
 * （常にネットワークを優先し、オフライン時のみキャッシュへフォールバック）。
 * それ以外の静的アセット（style.css/script.js等、?v=Nでキャッシュバスティング済み）は
 * stale-while-revalidate（キャッシュがあれば即返し、裏でネットワークから取得して更新する）。
 * 以前は全リクエスト共通でstale-while-revalidateだったため、イベント日時を更新しても
 * 古いキャッシュが返され続けることがあった（2026-08-24、ローカル検証中に実際に発生）。
 * 自分のオリジン以外（Firebase/GA4/CDN等）のリクエストは素通りさせ、キャッシュ対象にしない。
 */
/** PRECACHE_URLSの中身（index.html/style.css/script.js/events.js等）を更新する変更をデプロイするたびに、
 *  このバージョンを上げること。上げないと、インストール済みユーザーに古いキャッシュが残り続ける。 */
const CACHE_NAME = 'wc-cache-v4';

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

const OFFLINE_RESPONSE = () => new Response('オフラインのため表示できません。', {
  status: 503,
  statusText: 'Offline',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' }
});

/** HTMLページ本体と、イベント/団体データ本体（events.js/organizations.js）は鮮度が最優先。
 *  ?v=Nでキャッシュバスティングされる他の静的アセットと違い、これらは同じURLのまま中身だけ
 *  更新されることが多いため、stale-while-revalidateだと更新後もしばらく古い内容が表示される。 */
function isFreshnessCritical(url, request) {
  if (request.mode === 'navigate') return true;
  if (url.pathname === '/' || url.pathname.endsWith('.html')) return true;
  return /\/(events|organizations)\.js$/.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // Firebase/GA4/CDN等はキャッシュしない

  if (isFreshnessCritical(url, event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() =>
          caches.open(CACHE_NAME).then(async (cache) => (await cache.match(event.request)) || OFFLINE_RESPONSE())
        )
    );
    return;
  }

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
      return networkRes || OFFLINE_RESPONSE();
    })
  );
});

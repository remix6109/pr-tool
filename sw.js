/* Service Worker — 離線可看(讀取);寫入仍要網路。
 * 改 SW 邏輯時,改下面 CACHE_VERSION,所有客戶端會自動拿新版。
 */
const CACHE_VERSION = 'v20';
const APP_CACHE = 'pr-app-' + CACHE_VERSION;
const API_CACHE = 'pr-api-' + CACHE_VERSION;

// App shell — 安裝時就抓進 cache,之後離線也能開
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/api.js',
  './js/app.js',
  './js/config.js',
  './js/themes.js',
  './js/chart.min.js',
  './manifest.json',
  './manifest-bag.json',
  './manifest-bank.json',
  './manifest-book.json',
  './manifest-chart.json',
  './manifest-gold.json',
  './manifest-robot.json',
  './icon.svg',
  './icons/bag.svg',
  './icons/bank.svg',
  './icons/book.svg',
  './icons/chart.svg',
  './icons/gold.svg',
  './icons/robot.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then(c => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  // 清舊版 cache
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== APP_CACHE && k !== API_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;        // 寫入不快取

  const url = new URL(req.url);
  const isApi = url.hostname.endsWith('script.google.com') ||
                url.hostname.endsWith('googleusercontent.com');

  if (isApi) {
    // API: network-first,失敗時用 cache 回應(離線可讀上次抓到的資料)
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // 只快取成功的 GET 回應
        if (fresh && fresh.ok) {
          const c = await caches.open(API_CACHE);
          // 用 url(去掉 ?t= cache-buster)當 key,讓不同 timestamp 的同一請求共用 cache
          const key = new Request(url.origin + url.pathname);
          c.put(key, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const c = await caches.open(API_CACHE);
        const key = new Request(url.origin + url.pathname);
        const cached = await c.match(key);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  // App shell: cache-first(離線也能開)
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && url.origin === location.origin) {
        const c = await caches.open(APP_CACHE);
        c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      // 離線且 cache 沒有 → 退回 index.html(避免整個白畫面)
      if (req.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});

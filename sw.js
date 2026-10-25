/* Service Worker — 離線可看(讀取);寫入仍要網路。
 * 改 SW 邏輯時,改下面 CACHE_VERSION,所有客戶端會自動拿新版。
 */
const CACHE_VERSION = 'v63';
const APP_CACHE = 'pr-app-' + CACHE_VERSION;
const API_CACHE = 'pr-api-' + CACHE_VERSION;

// App shell — 安裝時就抓進 cache,之後離線也能開
const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './fx.css',
  './js/api.js',
  './js/utils.js',
  './js/appearance.js',
  './js/auth.js',
  './js/ui.js',
  './js/loader.js',
  './js/dashboard.js',
  './js/charts.js',
  './js/portfolio.js',
  './js/prices.js',
  './js/plan.js',
  './js/forms.js',
  './js/history.js',
  './js/pricehistory.js',
  './js/history-summary.js',
  './js/settings.js',
  './js/autodiv.js',
  './js/datacheck.js',
  './js/town.js',
  './js/town3d.js',
  './js/market.js',
  './js/fx.js',
  './js/main.js',
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
    // cache: 'reload' 略過瀏覽器的 HTTP 快取(GitHub Pages 會快取 10 分鐘),
    // 否則剛推送後安裝,可能存到「新 index + 舊 js」混在一起的版本
    caches.open(APP_CACHE)
      .then(c => c.addAll(SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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

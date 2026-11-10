// 急救小本本 service worker
// 第一次連網開啟後，把頁面與外部資源（Tailwind、字型、拍照辨識引擎）存在手機上，
// 之後診間斷網也能打開。
// 改了 vendor/ 或圖示時把 VERSION 加一，啟用時會清掉舊快取；
// index.html 走「網路優先」，平常更新不需要動這裡。
const VERSION = 'v1';
const CACHE = 'xiaobenben-' + VERSION;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'vendor/react.production.min.js',
  'vendor/react-dom.production.min.js',
  'favicon.png',
  'apple-touch-icon.png',
  'icon-192.png',
  'icon-512.png',
  'icon-512-maskable.png'
];

// 頁面一載入就要用的外部資源：安裝時先抓，第一次開啟後就能完整離線
const REMOTE = [
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700&family=IBM+Plex+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;600;700&display=swap'
];

// 這些網域的資源用到時順便存起來（字型檔、Tesseract 引擎與語言檔）
const RUNTIME_HOSTS = [
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'tessdata.projectnaptha.com'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // 外部資源抓不到不影響安裝，用到時會再補
    await Promise.all(REMOTE.map(u =>
      fetch(new Request(u, { mode: 'no-cors' }))
        .then(r => cache.put(u, r))
        .catch(() => {})
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('xiaobenben-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 網路優先：拿得到就用新版並更新快取；斷網或 4 秒沒回應就用快取
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const net = fetch(req).then(r => {
    if (r.ok) cache.put(req, r.clone());
    return r;
  });
  net.catch(() => {});
  const timeout = new Promise(res => setTimeout(res, 4000));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
  } catch (_) {}
  const hit = await cache.match(req) || await cache.match('index.html');
  return hit || net;
}

// 先用快取立刻回應，背景再更新
async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const net = fetch(req).then(r => {
    if (r.ok || r.type === 'opaque') cache.put(req, r.clone());
    return r;
  }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    e.respondWith(isPage ? networkFirst(req) : staleWhileRevalidate(req));
  } else if (RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
  // 其他外部請求（例如瀏覽人次計數）不經快取
});

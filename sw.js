/* 热点速拍 Service Worker
 * 静态资源：缓存优先（离线也能打开应用外壳）
 * 热点数据：网络优先（保证新鲜），断网时回退到最近一次缓存
 */
// 注意：每次部署前端改动必须递增版本号，否则老用户会看到缓存的旧页面
const CACHE_NAME = "hot-spot-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // 热点数据：网络优先，失败回退缓存
  if (url.pathname.endsWith("/data/data.json")) {
    e.respondWith(
      fetch(e.request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put("./data/data.json", clone));
          return resp;
        })
        .catch(() => caches.match("./data/data.json"))
    );
    return;
  }

  // 其余静态资源：缓存优先，未命中回源并写入缓存
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});

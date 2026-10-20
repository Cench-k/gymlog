// 오프라인용: 캐시 먼저 응답 + 백그라운드로 갱신 (다음 실행 때 새 버전)
const C = 'gymlog';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(['./', 'index.html', 'core.js', 'ui.js', 'sync.js', 'share.js', 'level.js', 'report.js', 'feedback.js', 'settings.js', 'app.js', 'data.js', 'media.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', e => e.waitUntil(Promise.all([self.clients.claim(), caches.delete('gymlog-img')])));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 운동 이미지·폰트(CDN): 한 번 받으면 캐시에서
  if (/^https:\/\/(cdn\.jsdelivr\.net\/(gh\/(yuhonas|orioncactus)|npm\/html-to-image@)|fonts\.(googleapis|gstatic)\.com\/)/.test(e.request.url)) {
    // jsdelivr는 CORS 지원: 항상 cors로 받아 캐시해야 결과 카드 이미지(html-to-image)에서도 씀
    const req = e.request.url.startsWith('https://cdn.jsdelivr.net/') ? new Request(e.request.url, { mode: 'cors', credentials: 'omit' }) : e.request;
    e.respondWith(caches.open('gymlog-img2').then(async c => (await c.match(req)) || fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; })));
    return;
  }
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(cs => cs[0] ? cs[0].focus() : self.clients.openWindow('./')));
});

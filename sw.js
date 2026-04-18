const CACHE_NAME = 'blessmas-pos-v3';

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});

const CACHE_NAME = 'blessmas-pos-v10'; // Bumped to v10 to force the update

// 1. Tell the phone exactly which files to download and save offline
const URLS_TO_CACHE = [
  '/',
  '/admin.html',
  '/app.js',
  '/manifest.json'
];

// 2. The Install Event: Save the files to the phone's hard drive
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Forces the phone to activate this new version immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Successfully saved files for offline use!');
      return cache.addAll(URLS_TO_CACHE);
    })
  );
});

// 3. The Fetch Event: Act as the bouncer between the phone and the internet
self.addEventListener('fetch', (event) => {
  event.respondWith(
    // Try to get the live file from the internet first
    fetch(event.request).catch(async () => {
      // If the internet is down, look in the phone's cache
      const cachedFile = await caches.match(event.request);
      if (cachedFile) {
        return cachedFile;
      }
      
      // If the file isn't on the internet AND isn't in the cache, fail gracefully (No ERR_FAILED crash!)
      return new Response("You are completely offline and this page hasn't been saved yet.", {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    })
  );
});

// 4. The Clean-up Event: Delete old versions (v8, v7, etc.) so the phone's storage doesn't get full
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

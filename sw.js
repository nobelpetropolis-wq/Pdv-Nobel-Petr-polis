const CACHE_NAME = 'livraria-pdv-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/index.tsx',
  '/App.tsx',
  '/types.ts',
  '/components/CashierModal.tsx',
  '/components/ConfirmationModal.tsx',
  '/components/DashboardModal.tsx',
  '/components/Icons.tsx',
  '/components/InventoryModal.tsx',
  '/components/LoadingOverlay.tsx',
  '/components/SetupModal.tsx',
  '/services/geminiService.ts',
  '/services/googleSheetsService.ts',
  '/utils/storage.ts',
  '/data/books.json',
  '/metadata.json',
  '/manifest.json',
  '/icons/icon.svg',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.url.includes('script.google.com')) {
    return; // Do not cache non-GET requests or API calls
  }

  // Network falling back to cache strategy
  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Response received from network. Cache it and return it.
        let responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME)
          .then(cache => {
            // Do not cache opaque responses (e.g. from no-cors requests to third-party CDNs)
            // as we can't determine if they are valid.
            if(responseToCache.type === 'opaque') {
                return;
            }
            cache.put(event.request, responseToCache);
          });
        return networkResponse;
      })
      .catch(() => {
        // Fetch failed, probably offline. Try to get it from the cache.
        return caches.match(event.request);
      })
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
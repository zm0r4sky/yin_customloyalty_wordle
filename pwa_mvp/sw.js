const CACHE_NAME = 'yin-wordle-v5';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './mockApi.js',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    // Strategia Network-First dla ułatwienia testów MVP (pobiera nowe, w razie braku sieci używa cache)
    event.respondWith(
        fetch(event.request)
            .then(networkResponse => {
                // Klonujemy odpowiedź przed zapisem do cache
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            })
            .catch(() => {
                // Błąd sieci (Offline) - zwracamy wersję zbuforowaną
                return caches.match(event.request);
            })
    );
});

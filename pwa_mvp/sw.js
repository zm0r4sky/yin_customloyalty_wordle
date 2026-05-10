const CACHE_NAME = 'yin-wordle-v1';
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
    // Prosta strategia Cache-First dla assetów PWA
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});

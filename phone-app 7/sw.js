// Cache the whole app so it opens instantly and works with no signal.
// Bump CACHE when the app changes; the old cache is deleted on activate.
const CACHE = 'ea-prep-v57';
const ASSETS = ['./','./index.html','./manifest.webmanifest',
  './styles.css','./ai-tutor.css',
  './data.js','./questions.js','./migration-map.js',
  './quiz-state.js','./account-sync.js','./auth-account-ui.js','./menu.js',
  './review.js','./flashcards.js','./quiz-view.js','./study-tools.js',
  './notes.js','./app-boot.js','./ai-tutor.js',
  './icon-192.png','./icon-512.png','./icon-192-maskable.png','./icon-512-maskable.png','./apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // never cache the sync calls — those must always hit the network
  if (url.hostname.endsWith('supabase.co')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) {
        // refresh in the background so the next open has the newest build
        fetch(e.request).then(r => {
          if (r && r.ok) caches.open(CACHE).then(c => c.put(e.request, r.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(e.request).then(r => {
        if (r && r.ok && url.origin === location.origin) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

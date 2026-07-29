/* =========================================================
   SERVICE WORKER
   Macht die App offline nutzbar.
   WICHTIG: Bei jeder Änderung an den Dateien die CACHE-Version
   hochzählen (v1 -> v2), damit Nutzer das Update erhalten.
   ========================================================= */

const CACHE = 'progression-v2';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/exercises.js',
  './js/storage.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {})
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Strategie: Netzwerk zuerst (damit Updates ankommen),
   bei Fehler aus dem Cache – so funktioniert die App offline. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if(res && res.status === 200 && res.type === 'basic'){
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

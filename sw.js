/* =========================================================
   SERVICE WORKER
   Macht die App offline nutzbar.

   Dateiliste und Cache-Version stehen in sw-manifest.js und werden von
   tools/gen-sw-manifest.js erzeugt (npm run sw:manifest). Die Version wird
   aus dem Inhalt aller Dateien abgeleitet – sie kann also nicht vergessen
   werden, und ein Deploy erzeugt automatisch einen neuen Cache.
   ========================================================= */

importScripts('sw-manifest.js');

const CACHE = self.__SW_VERSION;
const ASSETS = self.__SW_ASSETS;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* Einzeln statt addAll(): addAll bricht ATOMAR ab, sobald ein Eintrag
       fehlt – ein falscher Dateiname legte damit den kompletten Offline-
       Betrieb still, und der frühere .catch(() => {}) verschluckte es.
       Jetzt wird jeder Fehlschlag benannt, der Rest wird trotzdem gecacht. */
    const results = await Promise.allSettled(
      ASSETS.map(url => cache.add(new Request(url, { cache: 'reload' })))
    );
    results.forEach((r, i) => {
      if(r.status === 'rejected') console.error('[sw] nicht cachebar:', ASSETS[i], r.reason);
    });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   /* Fremde Hosts nicht anfassen */

  /* Navigationen: Netzwerk zuerst, damit ein Deploy zügig ankommt. */
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { /* Cache voll */ });
          return res;
        })
        /* Nur hier ist index.html die richtige Antwort – früher wurde sie bei
           JEDEM fehlgeschlagenen Request geliefert, auch für Bilder und JSON. */
        .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  /* Statische Dateien: Cache zuerst. Unbedenklich, weil der Cache-Name aus
     dem Inhalt abgeleitet ist – nach jeder Änderung entsteht ein neuer Cache,
     es kann also nichts Veraltetes ausgeliefert werden. Netzwerk-zuerst
     bedeutete dagegen im schlechten WLAN, dass jede Datei erst auf einen
     Timeout wartet. */
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if(res && res.status === 200 && res.type === 'basic'){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { /* Cache voll */ });
      }
      return res;
    }))
  );
});

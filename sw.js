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
    /* Hier stand ein bedingungsloses skipWaiting(). Die neue Version uebernahm
       damit die LAUFENDE Seite: ab dem Wechsel lieferte der neue Cache die
       Dateien, waehrend im Dokument noch das alte app.js lief – und der alte
       Cache war schon geloescht. Alles, was erst spaeter geholt wurde (eine
       Schrift unter font-display:swap, ein Icon), kam aus der neuen Version.
       Gesagt wurde dem Nutzer nichts.

       Jetzt wartet die neue Version, bis die App danach fragt. */
  })());
});

/* Die Seite bittet um die Uebernahme, nachdem der Nutzer zugestimmt hat.
   Danach laedt sie sich bei controllerchange selbst neu. */
self.addEventListener('message', e => {
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
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

  /* Navigationen: Cache zuerst, genau wie alle anderen Dateien.

     Vorher stand hier Netzwerk-zuerst, „damit ein Deploy zügig ankommt". Das
     ging nicht auf: die Dateinamen tragen keinen Hash, nur der Cache-Name
     hängt am Inhalt. Ein frisches index.html vom Netz verwies also weiterhin
     auf js/app.js und css/style.css, die der Cache-first-Zweig aus dem ALTEN
     Cache bediente – neues HTML mit altem JavaScript, schlechter als
     durchgehend alt. Die Zustellung neuer Versionen läuft jetzt über den
     Update-Hinweis in der App, nicht über diesen Zweig.

     Nur hier ist index.html die richtige Ersatzantwort – früher wurde sie bei
     JEDEM fehlgeschlagenen Request geliefert, auch für Bilder und JSON. */
  if(req.mode === 'navigate'){
    e.respondWith(
      caches.match(req)
        .then(hit => hit || fetch(req).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => { /* Cache voll */ });
          return res;
        }))
        .catch(() => caches.match('./index.html'))
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

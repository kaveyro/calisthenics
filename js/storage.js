/* =========================================================
   SPEICHER-ADAPTER
   Kapselt localStorage hinter einer async API, damit ein
   spaeterer Wechsel auf IndexedDB nur diese Datei betrifft.
   ========================================================= */

export const STORAGE_KEY = 'progression:v3';
const LEGACY_KEYS = ['ct:progress:v2', 'ct:progress:v1'];
/* Hierhin wird ein nicht lesbarer Stand gesichert, statt ihn zu verwerfen. */
const CORRUPT_KEY = 'progression:corrupt';

export const store = {
  /* Woher der zuletzt geladene Stand kam – die Migration raeumt danach auf. */
  loadedFrom: null,
  /* Gesetzt, wenn ein vorhandener Stand nicht gelesen werden konnte. */
  loadError: null,

  get mode(){ return 'Browser-Speicher (localStorage)'; },

  async get(key){
    const v = localStorage.getItem(key);
    return v !== null ? { key, value: v } : null;
  },
  async set(key, value){
    localStorage.setItem(key, value);
    return { key, value };
  },
  async remove(key){
    localStorage.removeItem(key);
    return { key, deleted: true };
  },

  /* Laedt den Rohstand. Faellt auf aeltere Schluessel zurueck und meldet
     ueber loadedFrom, welcher es war. Gibt null zurueck, wenn nichts da ist. */
  async load(){
    this.loadedFrom = null;
    this.loadError = null;

    for(const key of [STORAGE_KEY, ...LEGACY_KEYS]){
      let raw = null;
      try{
        const res = await this.get(key);
        if(res && res.value) raw = res.value;
      }catch(err){
        /* Zugriff verweigert (privater Modus, blockierte Cookies).
           Das ist etwas anderes als "kein Stand vorhanden". */
        this.loadError = err;
        return null;
      }
      if(!raw) continue;

      try{
        const parsed = JSON.parse(raw);
        this.loadedFrom = key;
        return parsed;
      }catch(err){
        /* Kaputtes JSON nicht stillschweigend verwerfen – sonst startet der
           Nutzer kommentarlos bei null und der einzige Stand ist weg. */
        this.loadError = err;
        try{ localStorage.setItem(CORRUPT_KEY + ':' + key, raw); }catch{ /* kein Platz */ }
        return null;
      }
    }
    return null;
  },

  async save(state){
    return this.set(STORAGE_KEY, JSON.stringify(state));
  },

  /* Entfernt die Altschluessel, nachdem ihr Inhalt uebernommen wurde. */
  async dropLegacy(){
    for(const k of LEGACY_KEYS){ try{ await this.remove(k); }catch{ /* egal */ } }
  },

  async clear(){
    await this.remove(STORAGE_KEY);
    await this.dropLegacy();
  },

  /* ================= Dauerhaftigkeit =================
     Ohne diese Zusage ist der Origin fuer den Browser "best effort": unter
     Speicherdruck darf er ihn raeumen, und iOS loescht die Daten einer nicht
     installierten Seite nach sieben Tagen ohne Nutzung. Der gesamte
     Trainingsverlauf haengt an einem einzigen localStorage-Schluessel – das
     ist das groesste Datenrisiko der App und mit einem Aufruf zu entschaerfen.

     Liefert true (zugesagt), false (abgelehnt) oder null (Browser kennt die
     Schnittstelle nicht). Firefox fragt dabei nach, Chrome entscheidet
     anhand von Installation und Nutzung selbst. */
  async persist(){
    try{
      if(!navigator.storage || !navigator.storage.persist) return null;
      if(navigator.storage.persisted && await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }catch{
      return null;
    }
  },

  /* Belegter Platz in Bytes, oder null. Nur zur Anzeige. */
  async estimate(){
    try{
      if(!navigator.storage || !navigator.storage.estimate) return null;
      const e = await navigator.storage.estimate();
      return Number.isFinite(e && e.usage) ? e.usage : null;
    }catch{
      return null;
    }
  }
};

/* =========================================================
   SPEICHER-ADAPTER
   Kapselt localStorage hinter einer async API, damit ein
   spaeterer Wechsel auf IndexedDB nur diese Datei betrifft.
   ========================================================= */

const STORAGE_KEY = 'progression:v3';
const LEGACY_KEYS = ['ct:progress:v2', 'ct:progress:v1'];
/* Hierhin wird ein nicht lesbarer Stand gesichert, statt ihn zu verwerfen. */
const CORRUPT_KEY = 'progression:corrupt';

const store = {
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
        try{ localStorage.setItem(CORRUPT_KEY + ':' + key, raw); }catch(e){ /* kein Platz */ }
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
    for(const k of LEGACY_KEYS){ try{ await this.remove(k); }catch(e){ /* egal */ } }
  },

  async clear(){
    await this.remove(STORAGE_KEY);
    await this.dropLegacy();
  }
};

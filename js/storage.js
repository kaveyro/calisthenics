/* =========================================================
   SPEICHER-ADAPTER
   Nutzt localStorage im normalen Browser und window.storage,
   falls die App in einer Claude-Umgebung läuft.
   ========================================================= */

const STORAGE_KEY = 'progression:v3';
const LEGACY_KEYS = ['ct:progress:v2', 'ct:progress:v1'];

const store = {
  cloud: (typeof window !== 'undefined' && window.storage) ? window.storage : null,
  get mode(){ return this.cloud ? 'Claude-Speicher' : 'Browser-Speicher (localStorage)'; },

  async get(key){
    if(this.cloud) return this.cloud.get(key);
    const v = localStorage.getItem(key);
    return v !== null ? { key, value: v } : null;
  },
  async set(key, value){
    if(this.cloud) return this.cloud.set(key, value);
    localStorage.setItem(key, value);
    return { key, value };
  },
  async remove(key){
    if(this.cloud) return this.cloud.delete(key);
    localStorage.removeItem(key);
    return { key, deleted: true };
  },

  /* Lädt den Stand und migriert ältere Formate mit */
  async load(){
    let raw = null;
    try{
      const res = await this.get(STORAGE_KEY);
      if(res && res.value) raw = res.value;
    }catch(e){ /* Schlüssel existiert noch nicht */ }

    if(!raw){
      for(const k of LEGACY_KEYS){
        try{
          const old = await this.get(k);
          if(old && old.value){ raw = old.value; break; }
        }catch(e){ /* weiter */ }
      }
    }
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch(e){ return null; }
  },

  async save(state){
    return this.set(STORAGE_KEY, JSON.stringify(state));
  },
  async clear(){
    await this.remove(STORAGE_KEY);
    for(const k of LEGACY_KEYS){ try{ await this.remove(k); }catch(e){} }
  }
};

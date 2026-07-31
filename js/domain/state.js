/* Zustandsform, Migration und Beschneidung importierter Backups.

   Reine Logik: kein DOM, kein Modulzustand. Beide Funktionen entscheiden
   darueber, ob ein gespeicherter oder importierter Stand heil ankommt – der
   einzige Ort im Projekt, an dem ein Fehler direkt Nutzerdaten kostet.
   Deshalb liegen sie hier und nicht in app.js: hier sind sie testbar.

   EX_BY_ID wird als Parameter hereingereicht, statt es zu importieren. Die
   Schicht darf nichts nach aussen importieren, und detectPlateaus() macht es
   mit exById bereits genauso. */

import { sanitizeDayKey } from './escape.js';

export const SETTINGS_DEFAULTS = {
  rest: 90, perExRest: true, autoRest: true, sound: true, vibrate: true,
  setsMode: 'standard', streak: 2, weekGoal: 4, deload: 24, lang: 'de',
  regress: true
};

/* Schema-Version des gespeicherten Standes. Beim Aendern der Datenstruktur
   hochzaehlen und in migrateState() einen Schritt ergaenzen. */
export const STATE_VERSION = 6;

/* Obergrenzen der wachsenden Sammlungen. Frueher 500 bzw. 200 – bei
   4 Einheiten pro Woche war das Trainingslog nach gut zwei Jahren still
   abgeschnitten. Ein Eintrag ist rund 100 Bytes, 2000 bleiben deutlich
   unter dem localStorage-Budget. */
export const MAX_LOG_ENTRIES = 2000;
export const MAX_SERIES_ENTRIES = 1000;
/* Ein Trainingstag fasst hoechstens 30 Uebungen (siehe clampBackup); die
   Liste im Log-Eintrag kann nicht laenger sein als das, was trainierbar war. */
export const MAX_EX_PER_ENTRY = 30;

export const DEFAULT_STATE = () => ({
  v: STATE_VERSION, planId: 'ab4', customPlan: null, activeSession: null,
  levels: {}, streaks: {}, prs: {}, notes: {}, milestones: {},
  weights: [], log: [], workouts: 0, byDay: {},
  lastDate: null, theme: null, settings: {}, deloadDismissed: 0,
  measurements: {}, warmupCustom: null, regressedFor: null,
  /* Wann zuletzt gesichert wurde und bei welchem Zaehlerstand – siehe
     js/domain/backup.js. backupDismissed haelt ein "Spaeter" fest. */
  lastBackup: null, backupWorkouts: 0, backupDismissed: 0
});
/* Entfernt in v5: streakDays, lastWeek, pauseHistory – wurden geschrieben
   bzw. angelegt, aber nie gelesen. migrateState() laesst sie beim Laden
   alter Staende einfach weg. */

/* ================= Migration =================
   Reine Funktion: nimmt einen beliebigen geladenen Rohwert und liefert einen
   Stand in der aktuellen Form. Ersetzt das fruehere
   Object.assign(DEFAULT_STATE(), loaded) – ein FLACHER Merge, bei dem ein
   "notes": null aus einem alten oder handgeschriebenen Stand den Default {}
   ueberschrieb und die App beim naechsten Training abstuerzen liess.

   Zwischen v1 und v4 ist keine strukturelle Aenderung dokumentiert oder aus
   dem Code ableitbar; diese Schritte sind daher reine Normalisierung. v5
   ergaenzt activeSession und das numerische Feld prs[].n – beides additiv
   und ueber die Defaults bzw. prNumber() abgedeckt. v6 ergaenzt log[].ex
   (die tatsaechlich trainierten Uebungen); aeltere Eintraege bekommen hier
   eine leere Liste, und js/domain/log.js faellt fuer sie auf Plan und
   Wiederholungsschluessel zurueck. Ebenfalls v6: lastBackup, backupWorkouts
   und backupDismissed – additiv und ueber die Defaults abgedeckt. */
export function migrateState(raw){
  const def = DEFAULT_STATE();
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return def;

  const out = DEFAULT_STATE();
  Object.keys(def).forEach(k => {
    const v = raw[k], d = def[k];
    if(v === undefined || v === null) return;              /* Default behalten */
    if(Array.isArray(d)){ if(Array.isArray(v)) out[k] = v; return; }
    if(d !== null && typeof d === 'object'){
      if(typeof v === 'object' && !Array.isArray(v)) out[k] = v;
      return;
    }
    if(typeof d === 'number'){ if(typeof v === 'number' && Number.isFinite(v)) out[k] = v; return; }
    if(typeof d === 'string'){ if(typeof v === 'string') out[k] = v; return; }
    out[k] = v;                                            /* Defaults mit null */
  });

  /* Felder mit Default null, die dennoch eine Form haben muessen. */
  if(out.customPlan && (typeof out.customPlan !== 'object' || !Array.isArray(out.customPlan.days))) out.customPlan = null;
  if(out.warmupCustom && !Array.isArray(out.warmupCustom)) out.warmupCustom = null;
  if(out.activeSession && typeof out.activeSession !== 'object') out.activeSession = null;
  if(typeof out.theme === 'string' && out.theme !== 'dark' && out.theme !== 'light') out.theme = null;
  /* Default null heisst oben "jeden Typ durchlassen" – hier steht aber ein
     ISO-Datum, das spaeter in eine Datumsrechnung laeuft. */
  if(out.lastBackup !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(out.lastBackup))) out.lastBackup = null;

  /* Eintraege innerhalb der Sammlungen auf die erwartete Form bringen. */
  out.log = out.log
    .filter(l => l && typeof l === 'object' && typeof l.d === 'string')
    .map(l => ({
      d: l.d,
      day: typeof l.day === 'string' ? l.day : 'A',
      sets: Number(l.sets) || 0,
      tops: Number(l.tops) || 0,
      ups: Array.isArray(l.ups) ? l.ups.filter(u => typeof u === 'string') : [],
      /* Seit v6: die tatsaechlich trainierten Uebungen. Leer bei Altbestaenden
         und bei CSV-Importen – dort greifen die Rueckfaelle in domain/log.js. */
      ex: Array.isArray(l.ex) ? l.ex.filter(x => typeof x === 'string' && x).slice(0, MAX_EX_PER_ENTRY) : [],
      reps: (l.reps && typeof l.reps === 'object') ? l.reps : {}
    }))
    .slice(-MAX_LOG_ENTRIES);

  out.weights = out.weights
    .filter(w => w && typeof w === 'object' && typeof w.d === 'string' && Number.isFinite(Number(w.kg)))
    .map(w => ({ d: w.d, kg: Number(w.kg) }))
    .slice(-MAX_SERIES_ENTRIES);

  /* levels/streaks sind id -> Zahl. Ein Nicht-Zahl-Wert wuerde spaeter in
     Vergleiche und Array-Indizes laufen. */
  ['levels', 'streaks'].forEach(k => {
    Object.keys(out[k]).forEach(id => {
      const n = parseInt(out[k][id], 10);
      if(Number.isFinite(n) && n >= 0) out[k][id] = n; else delete out[k][id];
    });
  });

  /* Nur bekannte Einstellungen uebernehmen – UND nur im richtigen Typ.
     Vorher wurde jeder Wert mit bekanntem Schluessel durchgelassen. Ein
     settings.rest: "abc" ueberlebte damit bis in startRest(), wo daraus
     eine Pause ueber NaN Sekunden wurde: die Anzeige blieb auf "NaN:aN"
     stehen und der Timer lief nie ab. */
  const settings = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(k => {
    const v = out.settings[k], d = SETTINGS_DEFAULTS[k];
    if(v === undefined || v === null) return;
    if(typeof v !== typeof d) return;
    if(typeof v === 'number' && !Number.isFinite(v)) return;
    settings[k] = v;
  });
  out.settings = settings;

  out.v = STATE_VERSION;
  return out;
}

/* ================= Import beschneiden =================
   Beschneidet ein importiertes Backup auf die bekannte Form.
   Bewusst kappen statt ablehnen: ein Validator, der die eigenen aelteren
   Backups des Nutzers zurueckweist, waere ein Datenverlust-Bug.

   Die Eingabe wird NICHT veraendert. Frueher war `out` ein flacher Klon, und
   die Zuweisungen an out.customPlan.days, out.notes[id].t und out.prs[id].v
   schrieben durch ihn hindurch in das geparste JSON des Aufrufers zurueck.

   Das Ergebnis ist danach noch durch migrateState() zu schicken: hier werden
   nur Laengen und Fremdfelder gekappt, die Typnormalisierung sitzt dort. */
export function clampBackup(data, exById = {}){
  const known = Object.keys(DEFAULT_STATE());
  const out = {};
  known.forEach(k => { if(data[k] !== undefined && data[k] !== null) out[k] = data[k]; });

  if(out.customPlan && typeof out.customPlan === 'object'){
    const days = Array.isArray(out.customPlan.days) ? out.customPlan.days : [];
    out.customPlan = {
      ...out.customPlan,
      days: days.filter(d => d && typeof d === 'object').slice(0, 20).map(d => ({
        key: sanitizeDayKey(d.key) || '?',
        title: String(d.title == null ? '' : d.title).slice(0, 40),
        sub: String(d.sub == null ? '' : d.sub).slice(0, 60),
        ex: (Array.isArray(d.ex) ? d.ex : []).filter(id => exById[id]).slice(0, 30)
      }))
    };
  }
  if(Array.isArray(out.warmupCustom)){
    out.warmupCustom = out.warmupCustom.slice(0, 30).map(w => String(w == null ? '' : w).slice(0, 80));
  }
  if(out.notes && typeof out.notes === 'object'){
    const notes = {};
    Object.keys(out.notes).forEach(id => {
      const n = out.notes[id];
      if(!n || typeof n !== 'object') return;
      notes[id] = { ...n, t: String(n.t == null ? '' : n.t).slice(0, 160) };
    });
    out.notes = notes;
  }
  if(out.prs && typeof out.prs === 'object'){
    const prs = {};
    Object.keys(out.prs).forEach(id => {
      const p = out.prs[id];
      if(!p || typeof p !== 'object') return;
      prs[id] = { ...p, v: String(p.v == null ? '' : p.v).slice(0, 40) };
    });
    out.prs = prs;
  }
  if(Array.isArray(out.log)) out.log = out.log.filter(l => l && typeof l === 'object').slice(-MAX_LOG_ENTRIES);
  if(Array.isArray(out.weights)) out.weights = out.weights.filter(w => w && typeof w === 'object').slice(-MAX_SERIES_ENTRIES);
  return out;
}

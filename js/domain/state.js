/* Zustandsform, Migration und Beschneidung importierter Backups.

   Reine Logik: kein DOM, kein Modulzustand. Beide Funktionen entscheiden
   darueber, ob ein gespeicherter oder importierter Stand heil ankommt – der
   einzige Ort im Projekt, an dem ein Fehler direkt Nutzerdaten kostet.
   Deshalb liegen sie hier und nicht in app.js: hier sind sie testbar.

   EX_BY_ID wird als Parameter hereingereicht, statt es zu importieren. Die
   Schicht darf nichts nach aussen importieren, und detectPlateaus() macht es
   mit exById bereits genauso. */

import { sanitizeDayKey } from './escape.js';
import { EQUIP, EQUIP_ALL } from './equipment.js';

export const SETTINGS_DEFAULTS = {
  rest: 90, perExRest: true, autoRest: true, sound: true, vibrate: true,
  setsMode: 'standard', streak: 2, weekGoal: 4, deload: 24, lang: 'de',
  regress: true
};

/* Schema-Version des gespeicherten Standes. Beim Aendern der Datenstruktur
   hochzaehlen und in migrateState() einen Schritt ergaenzen. */
export const STATE_VERSION = 9;

/* Obergrenzen der wachsenden Sammlungen. Frueher 500 bzw. 200 – bei
   4 Einheiten pro Woche war das Trainingslog nach gut zwei Jahren still
   abgeschnitten. Ein Eintrag ist rund 100 Bytes, 2000 bleiben deutlich
   unter dem localStorage-Budget. */
export const MAX_LOG_ENTRIES = 2000;
export const MAX_SERIES_ENTRIES = 1000;
/* Ein Trainingstag fasst hoechstens 30 Uebungen (siehe clampBackup); die
   Liste im Log-Eintrag kann nicht laenger sein als das, was trainierbar war. */
export const MAX_EX_PER_ENTRY = 30;
/* Obergrenze der aufgezeichneten Trainingsdauer. Gemessen wird die Spanne
   zwischen dem ersten Haken und "Fertig" – wer die Einheit offen liegen
   laesst und Stunden spaeter abschliesst, haette sonst eine Vierstunden-
   Einheit im Verlauf und einen unbrauchbaren Durchschnitt. Darueber gilt die
   Dauer als unbekannt (0) statt als sehr lang: eine falsche Zahl ist
   schlechter als gar keine. */
export const MAX_WORKOUT_SECS = 4 * 3600;

export const DEFAULT_STATE = () => ({
  v: STATE_VERSION, planId: 'ab4', customPlan: null, activeSession: null,
  levels: {}, streaks: {}, prs: {}, notes: {}, milestones: {},
  weights: [], log: [], workouts: 0, byDay: {},
  lastDate: null, theme: null, settings: {}, deloadDismissed: 0,
  measurements: {}, warmupCustom: null, regressedFor: null,
  /* Wann zuletzt gesichert wurde und bei welchem Zaehlerstand – siehe
     js/domain/backup.js. backupDismissed haelt ein "Spaeter" fest. */
  lastBackup: null, backupWorkouts: 0, backupDismissed: 0,
  /* Zaehlt jeden Schreibvorgang hoch. Nur dafuer da, zwei offene Fenster
     derselben App auseinanderzuhalten: das storage-Ereignis liefert den
     fremden Stand, und ohne einen Vergleich waere nicht zu erkennen, ob er
     neuer ist als der eigene oder nur das Echo des eigenen Schreibens.
     Geraetelokal – aus einem Backup wird er nie uebernommen. */
  rev: 0,
  /* Welche Geraete tatsaechlich zur Verfuegung stehen. Vorgabe ist "alles",
     damit ein bestehender Stand sich nach dem Update genauso verhaelt wie
     vorher – erst wer etwas abwaehlt, bekommt einen Filter. Ein LEERES Array
     ist gueltig und heisst "gar nichts, nur Boden". */
  equipment: [...EQUIP_ALL],
  /* Laufende Entlastungswoche: { bis: 'YYYY-MM-DD' } oder null. Halbiert die
     Saetze und setzt die Progression aus, solange sie laeuft. */
  deload: null,
  /* Ob der Einstieg durchlaufen wurde. Ein bestehender Stand gilt als
     eingerichtet – wer schon trainiert, soll nicht nach seinen Startstufen
     gefragt werden. Das entscheidet migrateState() unten anhand des Verlaufs,
     nicht dieser Vorgabewert. */
  onboarded: false
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
   und backupDismissed – additiv und ueber die Defaults abgedeckt. v7 ergaenzt
   rev, den Revisionszaehler fuer den Abgleich zwischen zwei Fenstern; ein
   Stand ohne ihn faengt bei 0 an. v8 ergaenzt equipment (vorhandene Geraete,
   Vorgabe "alles" – ein alter Stand verhaelt sich damit unveraendert) und
   deload (laufende Entlastungswoche, Vorgabe null). v9 ergaenzt onboarded
   (siehe unten – ein benutzter Stand gilt als eingerichtet) und log[].dauer
   (Trainingsdauer in Sekunden; 0 heisst "nicht aufgezeichnet" und gilt fuer
   jeden Eintrag von vor v9). */
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
  /* Der Revisionszaehler wird nur groesser und nur ganzzahlig – eine 2.5 oder
     eine -1 aus einem handgeschriebenen Stand wuerde den Vergleich zwischen
     zwei Fenstern still verdrehen. */
  if(!Number.isInteger(out.rev) || out.rev < 0) out.rev = 0;
  /* Nur bekannte Geraete, entdoppelt, ohne 'none' (das ist keine Anschaffung
     und immer vorhanden). Ein leeres Ergebnis bleibt leer und faellt NICHT auf
     die Vorgabe zurueck: "ich habe gar nichts" ist eine gueltige Antwort, und
     sie zurueckzusetzen wuerde die Einstellung bei jedem Laden verwerfen. */
  out.equipment = [...new Set(out.equipment.filter(e => EQUIP.includes(e) && e !== 'none'))];
  /* Wie lastBackup: Default null laesst oben jeden Typ durch, hier laeuft
     spaeter aber ein Datumsvergleich. */
  if(out.deload && (typeof out.deload !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(out.deload.bis)))) out.deload = null;
  /* Oben faellt ein Boolean in den letzten Zweig und wuerde jeden Typ
     durchlassen; hier haengt eine Verzweigung beim Start daran. */
  out.onboarded = out.onboarded === true;
  /* Ein bereits benutzter Stand gilt als eingerichtet. Der Einstieg fragt
     nach Startstufen und Geraeten – wer davon schon etwas festgelegt oder
     ueberhaupt trainiert hat, bekommt die Frage nicht nachtraeglich gestellt.
     Nur beim ersten Start einer leeren App ist sie sinnvoll. */
  if(raw.onboarded === undefined &&
     (out.workouts > 0 || out.log.length > 0 || Object.keys(out.levels).length > 0)) out.onboarded = true;

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
      reps: (l.reps && typeof l.reps === 'object') ? l.reps : {},
      /* Seit v9: die Dauer in Sekunden. 0 heisst "nicht aufgezeichnet" und
         gilt fuer alle Eintraege davor, fuer CSV-Importe und fuer eine
         nachgetragene Einheit. Die Anzeige laesst die Angabe dann weg,
         statt "0 Min" zu behaupten. */
      dauer: dauerWert(l.dauer)
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

/* Die Dauer eines Log-Eintrags auf eine ganze, plausible Sekundenzahl
   bringen. Alles Unlesbare, Negative oder unrealistisch Lange wird zu 0 –
   also zu "unbekannt". Siehe MAX_WORKOUT_SECS. */
function dauerWert(v){
  const n = Math.round(Number(v));
  if(!Number.isFinite(n) || n <= 0 || n > MAX_WORKOUT_SECS) return 0;
  return n;
}

/* Der Zahlenwert einer Bestleistung, oder -Infinity wenn keiner ermittelbar
   ist. Das Feld erlaubt Freitext ("sauber!"); frueher lieferte parseInt() dann
   NaN und jeder Vergleich  v > NaN  war false – die automatische PR-Erfassung
   war fuer diese Uebung dauerhaft tot. Ein nicht lesbarer Wert darf nicht
   blockieren.

   Liegt hier und nicht in app.js, weil die Form von state.prs hier beschrieben
   ist und js/domain/merge.js denselben Vergleich braucht. */
export function prNumber(pr){
  if(!pr) return -Infinity;
  const n = typeof pr.n === 'number' ? pr.n : parseInt(pr.v, 10);
  return Number.isFinite(n) ? n : -Infinity;
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
  /* rev zaehlt die Schreibvorgaenge DIESES Geraets. Der Wert aus einer fremden
     Datei sagt darueber nichts aus und wuerde den Abgleich zwischen zwei
     Fenstern nach einem Import verwirren – deshalb gar nicht erst uebernehmen. */
  const known = Object.keys(DEFAULT_STATE()).filter(k => k !== 'rev');
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

/* =========================================================
   PROGRESSION – App-Logik
   ========================================================= */

import { CATS, EXERCISES, PLAN_TEMPLATES, MILESTONES, WARMUP, EX_BY_ID } from './exercises.js';
import { store, STORAGE_KEY } from './storage.js';
import { today, fmtDate, isoWeek, calcGlobalStreak as streakOf } from './domain/dates.js';
import { esc, sanitizeDayKey } from './domain/escape.js';
import { parseTarget as parseTargetPure } from './domain/target.js';
import { serializeLog, parseLog } from './domain/csv.js';

const SETTINGS_DEFAULTS = {
  rest: 90, perExRest: true, autoRest: true, sound: true, vibrate: true,
  setsMode: 'standard', streak: 2, weekGoal: 4, deload: 24, lang: 'de',
  regress: true
};

/* Schema-Version des gespeicherten Standes. Beim Aendern der Datenstruktur
   hochzaehlen und in migrateState() einen Schritt ergaenzen. */
const STATE_VERSION = 5;

/* Obergrenzen der wachsenden Sammlungen. Frueher 500 bzw. 200 – bei
   4 Einheiten pro Woche war das Trainingslog nach gut zwei Jahren still
   abgeschnitten. Ein Eintrag ist rund 100 Bytes, 2000 bleiben deutlich
   unter dem localStorage-Budget. */
const MAX_LOG_ENTRIES = 2000;
const MAX_SERIES_ENTRIES = 1000;

const DEFAULT_STATE = () => ({
  v: STATE_VERSION, planId: 'ab4', customPlan: null, activeSession: null,
  levels: {}, streaks: {}, prs: {}, notes: {}, milestones: {},
  weights: [], log: [], workouts: 0, byDay: {},
  lastDate: null, theme: null, settings: {}, deloadDismissed: 0,
  measurements: {}, warmupCustom: null, regressedFor: null
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
   und ueber die Defaults bzw. prNumber() abgedeckt. */
function migrateState(raw){
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

  /* Eintraege innerhalb der Sammlungen auf die erwartete Form bringen. */
  out.log = out.log
    .filter(l => l && typeof l === 'object' && typeof l.d === 'string')
    .map(l => ({
      d: l.d,
      day: typeof l.day === 'string' ? l.day : 'A',
      sets: Number(l.sets) || 0,
      tops: Number(l.tops) || 0,
      ups: Array.isArray(l.ups) ? l.ups.filter(u => typeof u === 'string') : [],
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

  /* Nur bekannte Einstellungen uebernehmen. */
  const settings = {};
  Object.keys(SETTINGS_DEFAULTS).forEach(k => {
    if(out.settings[k] !== undefined && out.settings[k] !== null) settings[k] = out.settings[k];
  });
  out.settings = settings;

  out.v = STATE_VERSION;
  return out;
}

let state = DEFAULT_STATE();
let session = { dayKey: null, sets: {}, top: {}, reps: {} };
let holdTimer = null, restTimer = null, wakeLock = null;
let libFilter = 'all';
const libOpen = {};
let storageOK = true, lastWorkoutSnapshot = null, undoTimeout = null;

const LANG = {
  de: {
    appName: 'Progression',
    trainings: 'Trainings', thisWeek: 'Diese Woche', levelUps: 'Level-Ups',
    goals: 'Ziele', warmup: 'Warm-up (8–10 Min) – vor jeder Einheit',
    selectDay: 'Wähle oben deinen Trainingstag', pause: 'Pause', tapEnd: 'Tippen beendet',
    settings: 'Einstellungen', close: 'Schließen', training: 'Training',
    history: 'Verlauf', exercises: 'Übungen', plan: 'Plan', milestones: 'Ziele',
    finishWorkout: 'Training abschließen', setsMode: 'Satz-Modus',
    restBasic: 'Satzpause', perExRest: 'Übungsspezifische Pausen',
    autoRest: 'Pausen-Timer automatisch', sound: 'Signaltöne',
    vibration: 'Vibration', levelUpAfter: 'Level-Up nach',
    weekGoal: 'Wochenziel', deloadRemind: 'Deload-Erinnerung',
    dataBackup: 'Daten & Backup', downloadBackup: 'Backup herunterladen',
    importBackup: 'Backup importieren', exportCSV: 'Verlauf als CSV',
    copyText: 'Als Text kopieren', resetAll: 'Alles zurücksetzen',
    light: 'Hell', dark: 'Dunkel', standard: 'Standard (3–4)',
    lightMode: 'Einsteiger (max. 3)', hard: 'Fortgeschritten (+1 Satz)',
    off: 'Aus', search: 'Übung suchen …', all: 'Alle',
    inPlan: 'im Plan', noExercises: 'Keine Übung gefunden.',
    noHistory: 'Noch keine Trainings', noLogs: 'Noch keine Einträge.',
    noPlanDays: 'Dein Plan hat keine Trainingstage',
    template: 'Vorlage', customPlan: 'Eigener Plan',
    addDay: 'Trainingstag hinzufügen', resetToTemplate: 'Auf Vorlage zurücksetzen',
    addExercise: 'Hinzufügen', rename: 'Umbenennen', remove: 'entfernen',
    moveUp: 'nach oben', moveDown: 'nach unten',
    topLimit: 'Oberes Limit in allen Sätzen geschafft',
    tips: 'Tipps zur Übung', notes: 'Notiz', best: 'Bestleistung',
    save: 'Speichern', cancel: 'Abbrechen', confirm: 'Bestätigen',
    level: 'Stufe', sets: 'Sätze', reps: 'Wdh', sec: 'Sek',
    kg: 'kg', bodyWeight: 'Körpergewicht', weightHint: 'Gewicht in kg',
    workoutLog: 'Letzte Trainings', perExercise: 'pro Übung',
    undo: 'Rückgängig', done: 'Erledigt', week: 'Woche',
    chartWorkouts: 'Trainings pro Woche', chartVolume: 'Sätze pro Woche',
    totalVolume: 'Gesamtvolumen', measurements: 'Körpermaße',
    chest: 'Brust', waist: 'Taille', arm: 'Arm', thigh: 'Oberschenkel',
    plateauDetected: 'Stagnation erkannt', plateauMsg: 'Diese Übung macht seit mehreren Einheiten keine Fortschritte. Vielleicht eine leichtere Variante versuchen oder die Form überprüfen.',
    regressAfterBreak: 'Nach der Pause eine Stufe zurückgestuft',
    globalStreak: 'Trainingsserie', days: 'Tage',
    calendar: 'Kalender', schedule: 'Planübersicht',
    substitute: 'Ersetzen', superset: 'Supersatz',
    warmupCustom: 'Warm-up anpassen', milestoneSearch: 'Meilenstein suchen',
    keyboardHints: 'Tastatur: Leertaste = Satz, R = Pause, 1-5 = Tab',
    undoWorkout: 'Training rückgängig gemacht',
    volumeProgress: 'Volumensteigerung',
    addMeasurement: 'Maß speichern', cm: 'cm'
  }
};

let T = LANG.de;
function setLang(l){ T = LANG[l] || LANG.de; }
function __(k){ return T[k] || k; }

function cfg(k){
  return (state.settings && state.settings[k] !== undefined) ? state.settings[k] : SETTINGS_DEFAULTS[k];
}

/* ================= Start ================= */
(async function boot(){
  try{
    const loaded = await store.load();
    if(loaded){
      const wasLegacy = store.loadedFrom && store.loadedFrom !== STORAGE_KEY;
      state = migrateState(loaded);
      if(wasLegacy || loaded.v !== STATE_VERSION){
        /* Sofort im aktuellen Schluessel und Format ablegen, danach die
           Altschluessel entfernen – sonst werden sie bei jedem Kaltstart
           erneut gelesen. */
        await save();
        if(wasLegacy) await store.dropLegacy();
      }
    } else if(store.loadError){
      /* Es lag ein Stand vor, war aber nicht lesbar. storage.js hat das
         Original unter progression:corrupt:* gesichert. */
      console.error('[boot] Gespeicherter Stand nicht lesbar:', store.loadError);
      setTimeout(() => toast('Gespeicherter Stand war beschädigt – es wurde neu begonnen. Eine Kopie liegt im Browser-Speicher.', true), 400);
    }
    setLang(cfg('lang'));
    applyTheme();
    applyRegression();     /* vor dem ersten Rendern, damit die Stufen stimmen */
    renderWarmup();
    renderAll();
    restoreActiveSession();
    registerSW();
    addKeyboardShortcuts();
    addTablistNavigation();
  }catch(err){
    /* Ohne diesen Zweig bliebe der Ladehinweis dauerhaft stehen und der
       Fehler landete nur als unbehandelte Promise-Rejection in der Konsole. */
    console.error('[boot]', err);
    const el = document.getElementById('content');
    if(el) el.innerHTML =
      '<div class="empty-hint"><b>Die App konnte nicht starten.</b><br><br>' +
      esc(String(err && err.message || err)) +
      '<br><br>Lade die Seite neu. Bleibt der Fehler, hilft ein Backup-Import ' +
      'oder „Alles zurücksetzen" in den Einstellungen.</div>';
  }
})();

/* Ein einmaliger Toast reichte nicht: wer ihn verpasst, trainiert
   wochenlang weiter, ohne dass etwas ankommt. Der Hinweis bleibt jetzt
   sichtbar, solange Schreiben fehlschlaegt, und verschwindet von selbst,
   sobald es wieder klappt. */
function updateStorageWarning(){
  const el = document.getElementById('storageWarn');
  if(el) el.hidden = storageOK;
}

async function save(){
  try{
    const res = await store.save(state);
    if(!res) throw new Error('no result');
    if(!storageOK){
      storageOK = true; updateStorageWarning();
      toast('Speichern funktioniert wieder.');
    }
  }catch(err){
    console.error('[save]', err);
    if(storageOK){
      storageOK = false; updateStorageWarning();
      toast('Speichern nicht möglich – Fortschritt gilt nur für diese Sitzung.');
    }
  }
}

/* ================= Laufende Einheit sichern =================
   session lebte bisher nur im Arbeitsspeicher. Schickt das Handy die PWA in
   den Hintergrund und der Browser entlaedt sie, war die halb fertige Einheit
   weg – beforeunload feuert beim App-Wechsel auf Mobilgeraeten nicht.
   Deshalb wird sie bei jeder Aenderung mitgeschrieben. */
function persistSession(){
  state.activeSession = session.dayKey
    ? { dayKey: session.dayKey, sets: { ...session.sets }, top: { ...session.top }, reps: { ...session.reps }, d: today() }
    : null;
  save();
}
function clearSession(){
  session = { dayKey: null, sets: {}, top: {}, reps: {} };
  state.activeSession = null;
}
function restoreActiveSession(){
  const a = state.activeSession;
  if(!a || !a.dayKey) return false;
  /* Eine Einheit von gestern ist keine laufende Einheit mehr. */
  if(a.d && a.d !== today()){ state.activeSession = null; return false; }
  if(!getDay(a.dayKey)) { state.activeSession = null; return false; }
  session = { dayKey: a.dayKey, sets: a.sets || {}, top: a.top || {}, reps: a.reps || {} };
  renderDaySelect(); renderWorkout(); restoreSession({}, session.reps);
  toast('Laufendes Training wiederhergestellt.');
  return true;
}

function setRep(key, value){
  const n = parseInt(value, 10);
  session.reps[key] = Number.isFinite(n) ? n : null;
  persistSession();
}

function registerSW(){
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

function renderAll(){
  renderStats(); renderPhase(); renderBanners(); renderDaySelect();
  /* Ein laufendes Training nicht ueberschreiben. Alle Aufrufer, die eine
     Einheit beenden oder verwerfen, setzen session.dayKey vorher auf null. */
  if(session.dayKey) return;
  document.getElementById('content').innerHTML =
    '<div class="empty-hint">' + __('selectDay') + '.<br><br>' +
    'Bei Halteübungen startet ein Tipp auf den Satz einen Countdown mit Signal.</div>';
}

/* ================= Theme ================= */
function applyTheme(){
  let t = state.theme;
  if(!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = t === 'dark' ? '☀' : '☾';
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.setAttribute('content', t === 'dark' ? '#14161A' : '#F3F4F1');
}
function toggleTheme(){
  state.theme = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
  applyTheme(); save();
}

/* ================= Plan ================= */
function getPlan(){
  if(state.customPlan) return state.customPlan;
  return PLAN_TEMPLATES[state.planId] || PLAN_TEMPLATES.ab4;
}
function getDays(){ return getPlan().days || []; }
function getDay(key){ return getDays().find(d => d.key === key); }

function nextSuggestedKey(){
  const days = getDays();
  if(!days.length) return null;
  const last = (state.log || []).slice(-1)[0];
  if(!last) return days[0].key;
  const i = days.findIndex(d => d.key === last.day);
  return days[(i + 1) % days.length].key;
}

/* ================= Kopfbereich ================= */
function renderStats(){
  /* Echte Level-Ups aus dem Log zaehlen. Frueher wurde die Summe der
     Stufen-Indizes gebildet, sodass jede manuelle Korrektur ueber die
     +/--Buttons den Zaehler mit aufgeblaeht hat. */
  const ups = (state.log || []).reduce((a, l) => a + ((l.ups && l.ups.length) || 0), 0);
  const ms = Object.keys(state.milestones || {}).length;
  const thisWeek = (state.log || []).filter(l => isoWeek(l.d) === isoWeek(today())).length;
  document.getElementById('stats').innerHTML =
    statBox(state.workouts || 0, __('trainings')) +
    statBox(thisWeek + ' / ' + cfg('weekGoal'), __('thisWeek')) +
    statBox(ups, __('levelUps')) +
    statBox(ms + ' / ' + MILESTONES.length, __('goals'));
  document.getElementById('planName').textContent = getPlan().name;
}
function statBox(n, l){
  return '<div class="stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>';
}
function renderPhase(){
  const perWeek = Math.max(2, cfg('weekGoal'));
  const w = Math.min(8, Math.floor((state.workouts || 0) / perWeek) + 1);
  let phase = 'Technik & Gewöhnung';
  if(w >= 3) phase = 'Volumen steigern';
  if(w >= 5) phase = 'Übungen schwerer machen';
  if(w >= 7) phase = 'Meilensteine testen';
  let extra = '';
  const gs = calcGlobalStreak();
  if(gs >= 7) extra += ' · Serie: <b>' + gs + ' ' + __('days') + '</b>';
  document.getElementById('phaseLine').innerHTML =
    'Woche <b>' + w + '</b>/8 · <b>' + phase + '</b>' +
    (state.lastDate ? ' · zuletzt <b>' + fmtDate(state.lastDate) + '</b>' : '') + extra;
}

/* ================= Global Streak & Plateau Detection ================= */
/* Duenne Huellen um die reinen Funktionen aus js/domain/, damit die vielen
   Aufrufstellen unveraendert bleiben. */
function calcGlobalStreak(){ return streakOf(state.log); }

function detectPlateaus(){
  const plateaus = [];
  getDays().forEach(d => {
    d.ex.forEach(id => {
      const ex = EX_BY_ID[id]; if(!ex) return;
      const recent = (state.log || []).filter(l => {
        const day = getDay(l.day);
        return day && day.ex.includes(id);
      }).slice(-5);
      if(recent.length >= 4 && !recent.some(l => l.ups && l.ups.length)){
        const lvl = state.levels[id] || 0;
        if(lvl < ex.levels.length - 1) plateaus.push(ex.name);
      }
    });
  });
  return plateaus;
}

/* Nach einer laengeren Pause eine Stufe zurueckgehen.

   Die Funktion existierte vollstaendig, wurde aber nie aufgerufen – das
   Feature war unsichtbar. Zwei Dinge fehlten fuer den produktiven Einsatz:
   eine Abschaltmoeglichkeit und ein Schutz gegen mehrfaches Ausloesen.
   Ohne den zweiten wuerde jeder App-Start waehrend derselben Pause erneut
   eine Stufe abziehen. */
const REGRESSION_DAYS = 14;

function applyRegression(){
  if(!cfg('regress') || !state.lastDate) return;
  /* Pro Pause nur einmal: gemerkt wird das Datum der letzten Einheit. */
  if(state.regressedFor === state.lastDate) return;

  const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
  if(days < REGRESSION_DAYS) return;

  const namen = [];
  Object.keys(state.levels).forEach(id => {
    const ex = EX_BY_ID[id];
    if(!ex || !(state.levels[id] > 0)) return;
    state.levels[id] = state.levels[id] - 1;
    state.streaks[id] = 0;
    namen.push(ex.name);
  });

  state.regressedFor = state.lastDate;
  if(namen.length){
    save();
    setTimeout(() => toast(__('regressAfterBreak') + ' (' + namen.length + ' Übungen)', true), 600);
  }
}

function renderBanners(){
  const el = document.getElementById('banners');
  let html = '';
  const every = cfg('deload');
  if(every > 0){
    const due = Math.floor((state.workouts || 0) / every) * every;
    if(due > 0 && due > (state.deloadDismissed || 0)){
      html += '<div class="banner warn"><b>Deload-Woche empfohlen.</b> Du hast ' + state.workouts +
        ' Trainings absolviert. Mach diese Woche nur die Hälfte der Sätze mit leichteren Varianten – Sehnen und Gelenke brauchen das, besonders bei Stütz- und Zugarbeit.' +
        '<br><button onclick="dismissDeload(' + due + ')">Verstanden</button></div>';
    }
  }
  if(state.lastDate){
    const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
    if(days >= 7){
      html += '<div class="banner info">Letztes Training war vor ' + days +
        ' Tagen. Steig ruhig eine Stufe niedriger wieder ein – nach einer Pause ist das kein Rückschritt, sondern Verletzungsprophylaxe.</div>';
    }
  }
  const plateaus = detectPlateaus();
  if(plateaus.length){
    html += '<div class="banner warn">' + __('plateauDetected') + ': ' + plateaus.join(', ') +
      '.<br><small>' + __('plateauMsg') + '</small></div>';
  }
  el.innerHTML = html;
}
function dismissDeload(n){ state.deloadDismissed = n; save(); renderBanners(); }

function renderWarmup(){
  const items = state.warmupCustom || WARMUP;
  const el = document.getElementById('warmupList');
  el.innerHTML = items.map((w, i) =>
    '<li' + (w.includes('Pflicht') ? ' class="pflicht"' : '') + '>' +
    esc(w) + ' <button class="mini-btn mini-btn--inline" onclick="removeWarmupItem(' + i + ')"' +
    ' aria-label="Warm-up-Eintrag entfernen: ' + esc(w) + '">✕</button></li>'
  ).join('');
}
function removeWarmupItem(i){
  if(!state.warmupCustom) state.warmupCustom = [...WARMUP];
  state.warmupCustom.splice(i, 1);
  save(); renderWarmup();
}
async function addWarmupItem(){
  const t = await askText('Warm-up erweitern', 'Neuer Eintrag', '', 80);
  if(!t || !t.trim()) return;
  if(!state.warmupCustom) state.warmupCustom = [...WARMUP];
  state.warmupCustom.push(t.trim());
  save(); renderWarmup();
}

/* ================= Tabs ================= */
const TABS = ['train', 'history', 'library', 'plan', 'milestones'];
function showTab(t){
  TABS.forEach(x => {
    const sel = (x === t);
    document.getElementById('view-' + x).hidden = !sel;
    const tab = document.getElementById('tab-' + x);
    tab.classList.toggle('active', sel);
    /* setAttribute statt der IDL-Eigenschaft .ariaSelected: wo die Browser
       sie nicht reflektieren, entstand dort nur eine Expando-Eigenschaft,
       waehrend das Attribut im DOM dauerhaft auf false stehen blieb. */
    tab.setAttribute('aria-selected', sel ? 'true' : 'false');
    /* Roving tabindex: der Tabulator springt in die Leiste hinein und wieder
       heraus, zwischen den Tabs navigiert man mit den Pfeiltasten. */
    tab.tabIndex = sel ? 0 : -1;
  });
  document.getElementById('finishBar').style.display = (t === 'train' && session.dayKey) ? 'block' : 'none';
  if(t === 'history') renderHistory();
  if(t === 'library') { renderCatFilter(); renderLibrary(); }
  if(t === 'plan') renderPlanTab();
  if(t === 'milestones') { renderMilestones(); renderRoadmap(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Pfeiltasten-Navigation innerhalb der Tableiste (ARIA-Tabs-Muster). */
function addTablistNavigation(){
  document.querySelector('.tabs').addEventListener('keydown', e => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
    if(!(e.key in keys)) return;
    const cur = TABS.indexOf(e.target.id.replace('tab-', ''));
    if(cur < 0) return;
    e.preventDefault();
    const d = keys[e.key];
    const next = d === 'first' ? 0
      : d === 'last' ? TABS.length - 1
      : (cur + d + TABS.length) % TABS.length;
    showTab(TABS[next]);
    document.getElementById('tab-' + TABS[next]).focus();
  });
}

/* ================= Tab Keyboard Navigation ================= */
function addKeyboardShortcuts(){
  document.addEventListener('keydown', e => {
    /* Escape zuerst und unabhaengig vom Fokus – schliesst den jeweils
       offenen Dialog, nicht nur die Einstellungen. */
    if(e.key === 'Escape'){
      /* Nur die oberste Ebene schliessen. Die askDialog-Overlays behandeln
         Escape selbst und stoppen die Weitergabe. */
      if(openDialogEl.current) closeDialog(openDialogEl.current);
      return;
    }
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    /* Bei offenem Dialog keine Kuerzel im Hintergrund ausloesen. */
    if(openDialogEl.current) return;
    /* Nur auslosen, wenn kein anderes Bedienelement den Fokus hat – sonst
       schluckt Space die Aktivierung des fokussierten Buttons. */
    if(e.key === ' ' && e.target.closest('button, a, summary, [tabindex]') &&
       !e.target.classList.contains('set-dot')) return;
    if(e.key === ' ' && session.dayKey){
      e.preventDefault();
      const active = document.activeElement;
      if(active && active.classList.contains('set-dot')){ active.click(); return; }
      const firstUndone = document.querySelector('.set-dot:not(.done)');
      if(firstUndone) firstUndone.click();
      return;
    }
    if(e.key === 'r' || e.key === 'R'){
      if(document.getElementById('restChip').style.display === 'block') stopRest();
      else if(session.dayKey){
        const defaultRest = cfg('rest');
        startRest(defaultRest);
        toast('Pause ' + defaultRest + ' Sek');
      }
      return;
    }
    if(e.key >= '1' && e.key <= '5'){
      const tabs = ['train', 'history', 'library', 'plan', 'milestones'];
      showTab(tabs[parseInt(e.key) - 1]);
    }
  });
}

/* ================= Trainingstag wählen ================= */
function renderDaySelect(){
  const sug = nextSuggestedKey();
  document.getElementById('daySelect').innerHTML = getDays().map(d =>
    /* Der Tag-Key stammt aus einer Nutzereingabe und darf nicht in einen
       JS-String im Attribut interpoliert werden – esc() hilft dort nicht,
       weil der HTML-Parser die Entities vor der JS-Auswertung zurueckwandelt.
       Deshalb data-key + delegierter Listener (siehe unten). */
    '<button class="day-btn' + (session.dayKey === d.key ? ' active' : '') + '" data-key="' + esc(d.key) + '">' +
    (d.key === sug && !session.dayKey ? '<span class="badge">dran</span>' : '') +
    '<div class="tag">' + esc(d.key) + ' · ' + esc(d.title) + '</div>' +
    '<div class="sub">' + esc(d.sub || (d.ex.length + ' Übungen')) + '</div></button>'
  ).join('') || '<div class="empty-hint">' + __('noPlanDays') + ' – lege im Tab „Plan" einen an.</div>';
}
document.getElementById('daySelect').addEventListener('click', e => {
  const btn = e.target.closest('.day-btn[data-key]');
  if(btn) selectDay(btn.dataset.key);
});

/* ================= Sätze & Ziele berechnen ================= */
function parseTarget(target){ return parseTargetPure(target, cfg('setsMode')); }
function lvlOf(ex){ return Math.min(state.levels[ex.id] || 0, ex.levels.length - 1); }
function restFor(ex){ return (cfg('perExRest') && ex.rest) ? ex.rest : cfg('rest'); }

/* ================= Workout rendern ================= */
function selectDay(key){
  cancelHold(); stopRest();
  session = { dayKey: key, sets: {}, top: {}, reps: {} };
  persistSession();
  renderDaySelect(); renderWorkout(); requestWakeLock();
}

function renderWorkout(){
  const day = getDay(session.dayKey);
  if(!day) return;
  const need = cfg('streak');
  let html = '';

  day.ex.forEach(id => {
    const ex = EX_BY_ID[id];
    if(!ex) return;
    const lvl = lvlOf(ex), level = ex.levels[lvl], maxed = lvl >= ex.levels.length - 1;
    const t = parseTarget(level.target), streak = state.streaks[ex.id] || 0;

    let rungs = '';
    ex.levels.forEach((l, i) => {
      if(i > 0) rungs += '<div class="rung-line' + (i <= lvl ? ' done' : '') + '"></div>';
      /* title allein wird nicht zuverlaessig angesagt und auf Touch nie
         angezeigt – die Leiter transportierte ihren Zustand rein farblich. */
      rungs += '<div class="rung' + (i < lvl ? ' done' : (i === lvl ? ' current' : '')) + '" title="' + esc(l.stage) + '" aria-hidden="true"></div>';
    });

    let dots = '';
    for(let s = 0; s < t.sets; s++){
      const repKey = ex.id + '-' + s;
      /* aria-pressed statt reiner Farbcodierung: der Erledigt-Zustand war
         nur ueber eine CSS-Klasse sichtbar und das Label statisch.
         aria-live auf dem Punkt, damit der Countdown einer Halteuebung
         ueberhaupt angesagt wird – er aendert nur den Textinhalt. */
      dots += '<button class="set-dot" id="set-' + repKey + '"' +
        ' onclick="tapSet(\'' + ex.id + '\',' + s + ')"' +
        ' aria-pressed="' + (session.sets[repKey] ? 'true' : 'false') + '"' +
        (t.isHold ? ' aria-live="polite"' : '') +
        ' aria-label="' + esc(ex.name) + ', Satz ' + (s + 1) + ' von ' + t.sets + '">' + (s + 1) + '</button>';
      if(!t.isHold && t.maxReps){
        dots += '<input class="rep-input" id="rep-' + repKey + '" type="number" min="0" max="' + (t.maxReps + 10) + '"' +
          ' placeholder="' + (t.minReps + '-' + t.maxReps) + '"' +
          ' aria-label="Wiederholungen, ' + esc(ex.name) + ', Satz ' + (s + 1) + '"' +
          ' value="' + ((session.reps || {})[repKey] || '') + '" oninput="setRep(\'' + repKey + '\',this.value)">';
      }
    }

    let hint;
    if(maxed && streak >= need) hint = '<span class="streak-hint hot">Höchste Stufe erreicht – stark!</span>';
    else if(streak === need - 1 && streak > 0) hint = '<span class="streak-hint hot">' + streak + '/' + need + ' – noch 1× oberes Limit bis zur nächsten Stufe!</span>';
    else hint = '<span class="streak-hint">' + streak + '/' + need + ' Einheiten am oberen Limit bis zum Aufstieg</span>';

    const note = (state.notes || {})[ex.id];
    const pr = (state.prs || {})[ex.id];

    html += '<div class="ex" data-exid="' + ex.id + '">' +
      '<div class="ex-top"><span class="rung-label">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length +
        ' <span class="cat-chip">' + CATS[ex.cat].name + '</span></span>' +
        '<span class="lvl-adjust"><button onclick="adjustLevel(\'' + ex.id + '\',-1)" title="Stufe verringern" aria-label="Stufe verringern">−</button>' +
        '<button onclick="adjustLevel(\'' + ex.id + '\',1)" title="Stufe erhöhen" aria-label="Stufe erhöhen">+</button></span></div>' +
      '<div class="rungs" role="img" aria-label="Stufe ' + (lvl + 1) + ' von ' + ex.levels.length +
        ': ' + esc(level.stage) + '">' + rungs + '</div>' +
      '<div class="ex-head"><div class="ex-name">' + esc(ex.name) + '</div><div class="ex-target">' + esc(level.target) + '</div></div>' +
      '<div class="ex-stage">Aktuell: <b>' + esc(level.stage) + '</b></div>' +
      (pr ? '<div class="pr-line">' + __('best') + ': ' + esc(pr.v) + ' (' + fmtDate(pr.d) + ')</div>' : '') +
      (note ? '<div class="last-note">Letztes Mal (' + fmtDate(note.d) + '): „' + esc(note.t) + '"</div>' : '') +
      '<div class="sets">' + dots + '</div>' +
      (t.isHold ? '<span class="hold-hint">Tipp auf einen Satz startet den ' + t.holdSecs + '-Sek-Timer · Pause ' + restFor(ex) + ' Sek</span>'
                : '<span class="hold-hint">Pause ' + restFor(ex) + ' Sek</span>') +
      '<label class="toplimit" id="top-' + ex.id + '"><input type="checkbox" onchange="toggleTop(\'' + ex.id + '\',this.checked)"><span>' + __('topLimit') + '</span></label>' +
      hint +
      '<textarea class="note-input" id="note-' + ex.id + '" rows="1" placeholder="' + __('notes') + ' (z. B. „6 Sek Negativ geschafft") – optional"></textarea>' +
      '<button class="tip-btn" onclick="toggleTips(\'' + ex.id + '\')">' + __('tips') + '</button>' +
      '<ul class="tips" id="tips-' + ex.id + '">' + ex.tips.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<button class="sub-btn" onclick="substituteExercise(\'' + ex.id + '\')">↻ ' + __('substitute') + '</button>' +
      '<button class="tip-btn" onclick="showExHistory(\'' + ex.id + '\')">📊 ' + __('perExercise') + '</button>' +
      '</div>';
  });

  document.getElementById('content').innerHTML = html;
  document.getElementById('finishBar').style.display = 'block';
  updateFinish();
}

function snapshotNotes(){
  const n = {};
  const day = getDay(session.dayKey);
  if(day) day.ex.forEach(id => {
    const el = document.getElementById('note-' + id);
    if(el) n[id] = el.value;
  });
  return n;
}
function restoreSession(notes, reps){
  Object.keys(session.sets).forEach(k => {
    if(session.sets[k]){
      const el = document.getElementById('set-' + k);
      if(el){ el.classList.add('done'); el.setAttribute('aria-pressed', 'true'); }
    }
  });
  Object.keys(session.top).forEach(id => {
    if(session.top[id]){
      const l = document.getElementById('top-' + id);
      if(l){ l.classList.add('checked'); l.querySelector('input').checked = true; }
    }
  });
  Object.keys(notes || {}).forEach(id => {
    const el = document.getElementById('note-' + id); if(el) el.value = notes[id];
  });
  Object.keys(reps || {}).forEach(k => {
    const el = document.getElementById('rep-' + k); if(el && reps[k]) el.value = reps[k];
  });
  updateFinish();
}

function adjustLevel(id, d){
  const ex = EX_BY_ID[id]; if(!ex) return;
  const cur = state.levels[id] || 0;
  const next = Math.max(0, Math.min(ex.levels.length - 1, cur + d));
  if(next === cur) return;
  state.levels[id] = next; state.streaks[id] = 0;
  save(); renderStats();
  /* cancelHold() zuerst: sonst laeuft ein Countdown gegen das alte,
     nach renderWorkout() abgehaengte Element weiter und markiert einen
     Satz, den man nicht mehr sieht. */
  if(session.dayKey){ cancelHold(); const n = snapshotNotes(); const r = session.reps; renderWorkout(); restoreSession(n, r); }
  if(!document.getElementById('view-library').hidden) renderLibrary();
  toast(ex.name + ': Stufe "' + ex.levels[next].stage + '"');
}

/* ================= Substitute Exercise ================= */
async function substituteExercise(id){
  const ex = EX_BY_ID[id]; if(!ex) return;
  const sameCat = EXERCISES.filter(e => e.cat === ex.cat && e.id !== id);
  if(!sameCat.length){ toast('Keine Alternative in dieser Kategorie gefunden.'); return; }

  /* Frueher wurde die Liste in ein prompt() gerendert und der Nutzer musste
     eine Nummer eintippen. Jetzt eine anklickbare Auswahl mit der jeweils
     aktuellen Stufe als Zusatzinfo. */
  const gewaehlt = await askChoice('Ersatz für „' + ex.name + '“', sameCat.map(e => ({
    value: e.id,
    name: e.name,
    sub: e.levels[lvlOf(e)].stage + ' · ' + e.levels[lvlOf(e)].target
  })));
  if(!gewaehlt) return;

  const p = ensureCustom();
  const day = p.days.find(d => d.key === session.dayKey);
  if(!day) return;
  const ei = day.ex.indexOf(id);
  if(ei >= 0) day.ex[ei] = gewaehlt;
  save();
  const n = snapshotNotes(); const r = session.reps;
  session.sets = {}; session.top = {};
  persistSession();
  renderWorkout(); restoreSession(n, r);
  toast(EX_BY_ID[gewaehlt].name + ' als Ersatz eingetragen.');
}

/* ================= Per-Exercise History ================= */
function showExHistory(id){
  const ex = EX_BY_ID[id]; if(!ex) return;
  const logEntries = (state.log || []).filter(l => {
    const day = getDay(l.day);
    return day && day.ex.includes(id);
  }).slice(-15).reverse();
  /* role/aria-modal fehlten hier komplett – anders als beim statischen
     Einstellungsdialog wurde dieses Overlay als gewoehnliches div angesagt. */
  let html = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(ex.name) + ' – Verlauf"' +
    ' style="max-width:400px;padding:16px"><div class="modal-head">' +
    esc(ex.name) + ' · Verlauf<button onclick="closeExHistory()" aria-label="Schließen">✕</button></div>';
  if(!logEntries.length) html += '<div class="muted">Noch keine Einträge.</div>';
  else {
    /* Spalte hiess "Level", zeigte aber die Zahl der Level-Ups dieser Einheit.
       Titel angepasst statt Inhalt geaendert – die Angabe ist die nuetzlichere. */
    html += '<table style="width:100%;font-size:13px"><tr><th>Datum</th><th>Sätze</th><th>Top</th><th>Level-Up</th></tr>';
    logEntries.forEach(l => {
      html += '<tr><td>' + fmtDate(l.d) + '</td><td>' + l.sets + '</td><td>' + (l.tops ? '✓' : '') + '</td><td>' +
        (l.ups && l.ups.length ? '▲' + l.ups.length : '') + '</td></tr>';
    });
    html += '</table>';
  }
  html += '</div>';
  const overlay = document.getElementById('exHistoryOverlay') || (() => {
    const o = document.createElement('div'); o.id = 'exHistoryOverlay';
    o.className = 'overlay'; o.onclick = function(e){ if(e.target === this) closeExHistory(); };
    document.body.appendChild(o); return o;
  })();
  overlay.innerHTML = html;
  openDialog(overlay);
}
function closeExHistory(){
  const o = document.getElementById('exHistoryOverlay');
  if(o) closeDialog(o);
}

/* ================= Satz-Interaktion ================= */
function tapSet(id, s){
  const ex = EX_BY_ID[id];
  const t = parseTarget(ex.levels[lvlOf(ex)].target);
  const key = id + '-' + s;
  const el = document.getElementById('set-' + key);

  if(holdTimer && holdTimer.key === key){ cancelHold(); return; }

  if(session.sets[key]){
    session.sets[key] = false;
    el.classList.remove('done'); el.setAttribute('aria-pressed', 'false'); el.textContent = s + 1;
    updateFinish(); persistSession(); return;
  }

  if(t.isHold){
    cancelHold();
    let rem = t.holdSecs;
    el.classList.add('running'); el.textContent = rem;
    holdTimer = { key, el, id, s, interval: setInterval(() => {
      rem--;
      if(rem <= 0){
        clearInterval(holdTimer.interval); holdTimer = null;
        el.classList.remove('running');
        markDone(key, el, s, ex);
        signal(true);
      } else el.textContent = rem;
    }, 1000) };
  } else {
    markDone(key, el, s, ex);
  }
}
function markDone(key, el, s, ex){
  session.sets[key] = true;
  el.classList.add('done'); el.setAttribute('aria-pressed', 'true'); el.textContent = s + 1;
  updateFinish(); persistSession();
  if(cfg('autoRest')) startRest(restFor(ex));
}
function cancelHold(){
  if(!holdTimer) return;
  clearInterval(holdTimer.interval);
  holdTimer.el.classList.remove('running');
  holdTimer.el.textContent = holdTimer.s + 1;
  holdTimer = null;
}
function toggleTop(id, on){
  session.top[id] = on;
  document.getElementById('top-' + id).classList.toggle('checked', on);
  persistSession();
}
function toggleTips(id){ document.getElementById('tips-' + id).classList.toggle('open'); }

/* Die Uebungen der laufenden Einheit. Faellt auf die Session selbst zurueck,
   wenn der Trainingstag zwischenzeitlich aus dem Plan geloescht wurde –
   sonst geht die halb fertige Einheit verloren. */
function sessionExerciseIds(){
  const day = getDay(session.dayKey);
  if(day) return day.ex;
  const fromSets = Object.keys(session.sets).map(k => k.slice(0, k.lastIndexOf('-')));
  return [...new Set(Object.keys(session.top).concat(fromSets))].filter(id => EX_BY_ID[id]);
}

function updateFinish(){
  const ids = sessionExerciseIds(); if(!ids.length) return;
  const done = Object.values(session.sets).filter(Boolean).length;
  const total = ids.reduce((a, id) => {
    const ex = EX_BY_ID[id];
    return ex ? a + parseTarget(ex.levels[lvlOf(ex)].target).sets : a;
  }, 0);
  document.getElementById('finishCount').textContent = done + '/' + total + ' ' + __('sets');
  document.getElementById('finishBtn').disabled = done === 0;
}

/* ================= Pausen-Timer ================= */
function startRest(secs){
  stopRest();
  let rem = secs || cfg('rest');
  const chip = document.getElementById('restChip'), out = document.getElementById('restTime');
  const f = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  out.textContent = f(rem); chip.style.display = 'block';
  restTimer = setInterval(() => {
    rem--;
    if(rem <= 0){ stopRest(); signal(false); toast('Pause vorbei – nächster Satz!'); }
    else out.textContent = f(rem);
  }, 1000);
}
function stopRest(){
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
  document.getElementById('restChip').style.display = 'none';
}

/* ================= Signal (Ton + Vibration) ================= */
let audioCtx = null;
function signal(double){
  if(cfg('vibrate') && navigator.vibrate){
    /* Vibration ist auf Desktop und in manchen Browsern nicht verfuegbar –
       ein Fehlschlag darf das Signal nicht abbrechen. */
    try{ navigator.vibrate(double ? [120, 80, 120] : 150); }catch{ /* nicht unterstuetzt */ }
  }
  if(!cfg('sound')) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    /* Ein ausserhalb einer Nutzergeste erzeugter Kontext bleibt "suspended";
       ohne resume() blieb jeder Timer-Ton lautlos – genau dann, wenn er
       gebraucht wird, naemlich beim automatischen Ablauf der Pause. */
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const play = (t, f) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(.001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.25, audioCtx.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + t + .28);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + .3);
    };
    play(0, 880); if(double) play(.35, 1174);
  }catch{ /* Web Audio blockiert oder nicht verfuegbar – dann eben stumm */ }
}

/* ================= Bildschirm wach halten ================= */
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator && !wakeLock){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  }catch{ /* Wake Lock nicht unterstuetzt oder vom System verweigert */ }
}
function releaseWakeLock(){
  if(wakeLock){
    try{ wakeLock.release(); }catch{ /* bereits freigegeben */ }
    wakeLock = null;
  }
}

/* ================= Training abschließen mit Undo ================= */
async function finishWorkout(){
  cancelHold(); stopRest(); releaseWakeLock();
  const exIds = sessionExerciseIds();
  if(!exIds.length){ toast('Keine Übungen in dieser Einheit – nichts zu speichern.'); return; }
  const need = cfg('streak');
  const ups = [];
  let tops = 0;

  /* Snapshot VOR der Mutationsschleife. Er wurde frueher danach gezogen und
     enthielt damit bereits die neuen Werte – levels, streaks, prs und notes
     liessen sich also gar nicht zurueckrollen, obwohl undoWorkout() sie
     zuzuweisen schien. */
  lastWorkoutSnapshot = {
    levels: JSON.parse(JSON.stringify(state.levels)),
    streaks: JSON.parse(JSON.stringify(state.streaks)),
    prs: JSON.parse(JSON.stringify(state.prs)),
    notes: JSON.parse(JSON.stringify(state.notes)),
    byDay: JSON.parse(JSON.stringify(state.byDay || {})),
    session: JSON.parse(JSON.stringify(session)),
    workouts: state.workouts || 0,
    lastDate: state.lastDate,
    deloadDismissed: state.deloadDismissed,
    entry: null            /* wird nach dem Anlegen des Log-Eintrags gesetzt */
  };

  exIds.forEach(id => {
    const ex = EX_BY_ID[id]; if(!ex) return;
    const lvl = state.levels[id] || 0;
    const maxed = lvl >= ex.levels.length - 1;
    if(session.top[id]){
      tops++;
      state.streaks[id] = (state.streaks[id] || 0) + 1;
      if(!maxed && state.streaks[id] >= need){
        state.levels[id] = lvl + 1; state.streaks[id] = 0;
        ups.push(ex.name + ' → ' + ex.levels[lvl + 1].stage);
      }
    } else state.streaks[id] = 0;

    const nEl = document.getElementById('note-' + id);
    if(nEl && nEl.value.trim()){
      state.notes[id] = { t: nEl.value.trim().slice(0, 160), d: today() };
    }

    /* Per-set rep tracking */
    const t = parseTarget(ex.levels[lvl].target);
    if(!t.isHold && t.maxReps){
      for(let s = 0; s < t.sets; s++){
        const repEl = document.getElementById('rep-' + id + '-' + s);
        if(repEl && repEl.value){
          const v = parseInt(repEl.value, 10);
          if(v && v > prNumber(state.prs[id])){
            state.prs[id] = { v: v + ' ' + __('reps'), n: v, d: today() };
          }
        }
      }
    }
  });

  const sets = Object.values(session.sets).filter(Boolean).length;
  const now = today();
  const entry = { d: now, day: session.dayKey, sets, tops, ups, reps: { ...session.reps } };

  lastWorkoutSnapshot.entry = entry;

  state.workouts = (state.workouts || 0) + 1;
  state.byDay[session.dayKey] = (state.byDay[session.dayKey] || 0) + 1;
  state.lastDate = now;

  state.log.push(entry);
  if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);
  await save();

  clearSession();
  document.getElementById('finishBar').style.display = 'none';
  renderAll();

  if(ups.length){ signal(true); toast('LEVEL-UP! ' + ups.join(' · '), true); }
  else toast('Training gespeichert – ' + state.workouts + ' Einheiten insgesamt.');

  /* Offer undo for 5 seconds */
  clearTimeout(undoTimeout);
  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  undoBtn.textContent = '↩ ' + __('undo');
  undoBtn.onclick = undoWorkout;
  document.getElementById('content').appendChild(undoBtn);
  /* Den Button zusammen mit dem Snapshot entfernen – sonst bleibt eine
     Schaltflaeche stehen, die nach 5 s wortlos nichts mehr tut. */
  undoTimeout = setTimeout(() => {
    lastWorkoutSnapshot = null;
    undoBtn.remove();
  }, 5000);
}

function undoWorkout(){
  const snap = lastWorkoutSnapshot;
  if(!snap) return;
  state.levels = snap.levels;
  state.streaks = snap.streaks;
  state.prs = snap.prs;
  state.notes = snap.notes;
  state.byDay = snap.byDay;
  state.workouts = snap.workouts;
  state.lastDate = snap.lastDate;
  state.deloadDismissed = snap.deloadDismissed;
  /* Identitaetsvergleich statt Suche ueber (Datum, Tag): zwei Einheiten
     desselben Tages am selben Datum sind zulaessig, und der Suchtreffer
     waere dann der falsche Eintrag. */
  const idx = state.log.lastIndexOf(snap.entry);
  if(idx >= 0) state.log.splice(idx, 1);
  save();
  clearTimeout(undoTimeout);
  lastWorkoutSnapshot = null;
  document.querySelector('.undo-btn')?.remove();
  clearSession();
  document.getElementById('finishBar').style.display = 'none';
  renderAll();
  toast(__('undoWorkout'));
}

/* ================= Verlauf ================= */
function weekLabel(w){ return w.split('-')[1]; }

function renderHistory(){
  /* Week chart */
  const byWeek = {}, volWeek = {};
  (state.log || []).forEach(l => {
    const w = isoWeek(l.d);
    byWeek[w] = (byWeek[w] || 0) + 1;
    volWeek[w] = (volWeek[w] || 0) + (l.sets || 0);
  });
  const weeks = Object.keys(byWeek).sort().slice(-8);
  const goal = cfg('weekGoal');

  const wc = document.getElementById('weekChart');
  if(!weeks.length){
    wc.innerHTML = '<div class="empty-hint" style="width:100%">' + __('noHistory') + ' – dein erstes abgeschlossenes Training erscheint hier.</div>';
    document.getElementById('weekLegend').textContent = '';
    document.getElementById('volChart').innerHTML = '';
  } else {
    /* Die Diagramme sind div-Stapel ohne Textalternative: die Zielerreichung
       steckte allein in der Balkenfarbe. Jeder Balken bekommt daher ein
       sprechendes Label, das Diagramm selbst eine Rolle und Beschriftung. */
    const max = Math.max(goal, ...weeks.map(w => byWeek[w]));
    wc.setAttribute('role', 'img');
    wc.setAttribute('aria-label', 'Trainings pro Woche, ' +
      (weeks.length === 1 ? 'letzte Woche' : 'letzte ' + weeks.length + ' Wochen') + ': ' +
      weeks.map(w => weekLabel(w) + ' ' + byWeek[w] + (byWeek[w] >= goal ? ' (Ziel erreicht)' : '')).join(', '));
    wc.innerHTML = weeks.map(w => {
      const n = byWeek[w];
      return '<div class="bar-col" aria-hidden="true"><span class="bar-num">' + n + '</span>' +
        '<div class="bar' + (n >= goal ? ' goal-met' : '') + '" style="height:' + Math.round(n / max * 100) + '%"></div>' +
        '<span class="bar-lbl">' + weekLabel(w) + '</span></div>';
    }).join('');
    document.getElementById('weekLegend').textContent = 'Grün = Wochenziel von ' + goal + ' Trainings erreicht.';

    const vmax = Math.max(...weeks.map(w => volWeek[w]), 1);
    const vc = document.getElementById('volChart');
    vc.setAttribute('role', 'img');
    vc.setAttribute('aria-label', 'Sätze pro Woche: ' +
      weeks.map(w => weekLabel(w) + ' ' + volWeek[w]).join(', '));
    vc.innerHTML = weeks.map(w =>
      '<div class="bar-col" aria-hidden="true"><span class="bar-num">' + volWeek[w] + '</span>' +
      '<div class="bar" style="height:' + Math.round(volWeek[w] / vmax * 100) + '%"></div>' +
      '<span class="bar-lbl">' + weekLabel(w) + '</span></div>').join('');
  }

  renderWeight();
  renderMeasurements();

  const list = document.getElementById('logList');
  const log = (state.log || []).slice(-25).reverse();
  list.innerHTML = log.length ? log.map(l => {
    const d = getDay(l.day);
    return '<div class="log-item"><span class="log-date">' + fmtDate(l.d) + '</span>' +
      '<span class="log-day">' + esc(l.day) + (d ? ' · ' + esc(d.title) : '') + '</span>' +
      '<span class="muted">' + l.sets + ' ' + __('sets') + ' · ' + l.tops + '× Top</span>' +
      '<span class="log-ups">' + (l.ups && l.ups.length ? '▲' + l.ups.length : '') + '</span></div>';
  }).join('') : '<div class="empty-hint">' + __('noLogs') + '</div>';

  /* Calendar view */
  renderCalendar();
}

function renderCalendar(){
  const cal = document.getElementById('calendarView') || (() => {
    const el = document.createElement('div');
    el.id = 'calendarView';
    document.getElementById('view-history').appendChild(el);
    return el;
  })();
  if(!state.log || !state.log.length){ cal.innerHTML = ''; return; }

  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const workoutDays = new Set(state.log.map(l => l.d));

  const monatsName = now.toLocaleDateString('de', { month: 'long', year: 'numeric' });
  let html = '<div class="section-title">' + __('calendar') + ' ' + monatsName + '</div>' +
    '<div class="calendar-grid" role="list" aria-label="Trainingstage im ' + monatsName + '">';
  ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(d => { html += '<div class="cal-header" aria-hidden="true">' + d + '</div>'; });
  const offset = (first + 6) % 7;
  for(let i = 0; i < offset; i++) html += '<div class="cal-day empty" aria-hidden="true"></div>';
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isWorkout = workoutDays.has(dateStr);
    const isToday = dateStr === today();
    /* Trainingstage waren nur gruen eingefaerbt – ohne Datum, ohne Label.
       Jetzt tragen sie den vollen Tag samt Zustand als Textalternative. */
    const label = d + '. ' + monatsName + (isWorkout ? ', trainiert' : '') + (isToday ? ', heute' : '');
    html += '<div class="cal-day' + (isWorkout ? ' workout' : '') + (isToday ? ' today' : '') + '"' +
      ' role="listitem" aria-label="' + label + '"><span aria-hidden="true">' + d + '</span></div>';
  }
  html += '</div>';
  cal.innerHTML = html;
}

/* ================= Body Measurements ================= */
async function addMeasurement(){
  const parts = ['chest', 'waist', 'arm', 'thigh'];
  const m = state.measurements || {};
  if(!m._dates) m._dates = [];
  const entry = { d: today() };
  parts.forEach(p => {
    const el = document.getElementById('meas-' + p);
    const v = parseFloat(el?.value);
    if(v && v > 0 && v < 200) entry[p] = v;
  });
  if(Object.keys(entry).length < 2){ toast('Bitte mindestens ein Maß eingeben.'); return; }
  m._dates.push(entry);
  if(m._dates.length > MAX_SERIES_ENTRIES) m._dates = m._dates.slice(-MAX_SERIES_ENTRIES);
  state.measurements = m;
  parts.forEach(p => { const el = document.getElementById('meas-' + p); if(el) el.value = ''; });
  await save(); renderMeasurements(); toast(__('addMeasurement') + '.');
}

function renderMeasurements(){
  const container = document.getElementById('measContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'measContainer';
    const parent = document.getElementById('weightSpark')?.parentElement;
    if(parent) parent.after(el);
    return el;
  })();
  const m = state.measurements || {};
  const dates = m._dates || [];
  const parts = ['chest', 'waist', 'arm', 'thigh'];
  const labels = { chest: __('chest'), waist: __('waist'), arm: __('arm'), thigh: __('thigh') };

  let html = '<div class="section-title">' + __('measurements') + '</div><div class="card">';
  html += '<div class="inline-row">';
  parts.forEach(p => {
    const last = dates.length ? (dates[dates.length - 1][p] || '') : '';
    html += '<div style="flex:1"><small>' + esc(labels[p]) + '</small><input id="meas-' + p + '" type="number" step="0.5" min="0" max="200" placeholder="' + esc(last) + ' ' + __('cm') + '" style="width:100%;padding:5px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)"></div>';
  });
  html += '<button onclick="addMeasurement()" style="align-self:flex-end">' + __('save') + '</button>';
  html += '</div>';

  if(dates.length){
    html += '<div style="margin-top:10px;font-size:12px;color:var(--ink-soft)">';
    const last = dates[dates.length - 1];
    parts.forEach(p => {
      if(last[p]) html += esc(labels[p]) + ': <b>' + last[p] + ' ' + __('cm') + '</b> · ';
    });
    html += fmtDate(last.d);
    html += '</div>';
    if(dates.length > 1){
      /* Die Zahlen stehen direkt darüber im Text – die Kurve ist reine
         Dekoration und wird deshalb ausgeblendet statt doppelt vorgelesen. */
      html += '<svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
      parts.forEach((p, pi) => {
        const vals = dates.map(d => d[p]).filter(v => v);
        if(vals.length < 2) return;
        const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
        const pts = vals.map((v, i) =>
          (i / (vals.length - 1) * 296 + 2).toFixed(1) + ',' + (66 - (v - min) / (max - min) * 62).toFixed(1)).join(' ');
        const colors = ['var(--accent)', 'var(--success)', 'var(--warn)', 'var(--ink-soft)'];
        html += '<polyline points="' + pts + '" fill="none" stroke="' + colors[pi % 4] + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>';
      });
      html += '</svg>';
    }
  }
  html += '</div>';
  container.innerHTML = html;
}

/* ================= Weight ================= */
async function addWeight(){
  const inp = document.getElementById('weightInput');
  const v = parseFloat(String(inp.value).replace(',', '.'));
  if(!v || v < 30 || v > 250){ toast('Bitte ein plausibles Gewicht in kg eingeben.'); return; }
  state.weights.push({ d: today(), kg: Math.round(v * 10) / 10 });
  if(state.weights.length > MAX_SERIES_ENTRIES) state.weights = state.weights.slice(-MAX_SERIES_ENTRIES);
  inp.value = '';
  await save(); renderWeight(); toast('Gewicht gespeichert.');
}
function renderWeight(){
  const svg = document.getElementById('weightSpark'), meta = document.getElementById('weightMeta');
  const ws = state.weights || [];
  if(!ws.length){
    svg.innerHTML = '';
    meta.innerHTML = 'Noch kein Eintrag. Trag dein Gewicht etwa 1× pro Woche ein – bei Hebel-Skills wie der Planche entscheidet das Verhältnis von Kraft zu Körpergewicht.';
    return;
  }
  if(ws.length === 1){
    svg.innerHTML = '';
    meta.innerHTML = 'Start: <b>' + ws[0].kg + ' kg</b> (' + fmtDate(ws[0].d) + ') – ab dem zweiten Eintrag entsteht hier deine Kurve.';
    return;
  }
  const kgs = ws.map(w => w.kg);
  const min = Math.min(...kgs) - 1, max = Math.max(...kgs) + 1;
  const pts = ws.map((w, i) =>
    (i / (ws.length - 1) * 296 + 2).toFixed(1) + ',' + (66 - (w.kg - min) / (max - min) * 62).toFixed(1)).join(' ');
  /* var(--accent) statt des aufgeloesten Wertes: sonst bleibt die Kurve nach
     einem Theme-Wechsel in der alten Farbe, bis zufaellig neu gerendert wird.
     Die Messwert-Kurve daneben macht es bereits so. */
  svg.innerHTML = '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  const delta = Math.round((kgs[kgs.length - 1] - kgs[0]) * 10) / 10;
  meta.innerHTML = 'Aktuell <b>' + kgs[kgs.length - 1] + ' kg</b> · seit Start <b>' + (delta > 0 ? '+' : '') + delta + ' kg</b> · ' + ws.length + ' Einträge';
}

/* ================= Bibliothek ================= */
function renderCatFilter(){
  const cats = ['all'].concat(Object.keys(CATS));
  document.getElementById('catFilter').innerHTML = cats.map(c =>
    '<button class="chip' + (libFilter === c ? ' active' : '') + '" onclick="setLibFilter(\'' + c + '\')">' +
    (c === 'all' ? __('all') : CATS[c].name) + '</button>').join('');
}
function setLibFilter(c){ libFilter = c; renderCatFilter(); renderLibrary(); }

function renderLibrary(){
  const q = (document.getElementById('libSearch').value || '').toLowerCase().trim();
  const list = EXERCISES.filter(e =>
    (libFilter === 'all' || e.cat === libFilter) &&
    (!q || e.name.toLowerCase().includes(q) || e.levels.some(l => l.stage.toLowerCase().includes(q))));

  const planIds = new Set(getDays().flatMap(d => d.ex));

  document.getElementById('libList').innerHTML = list.length ? list.map(ex => {
    const lvl = lvlOf(ex), open = libOpen[ex.id];
    const pr = (state.prs || {})[ex.id];
    return '<div class="lib-item">' +
      /* Echter Button statt eines klickbaren div: der Kopf ist die
         Hauptinteraktion dieses Tabs und war per Tastatur unerreichbar. */
      '<button type="button" class="lib-head" onclick="toggleLib(\'' + ex.id + '\')"' +
        ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="libbody-' + ex.id + '">' +
        '<span class="lib-name">' + esc(ex.name) + (planIds.has(ex.id) ? ' <span class="cat-chip">' + __('inPlan') + '</span>' : '') + '</span>' +
        '<span class="lib-meta">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length + ' <span aria-hidden="true">' + (open ? '−' : '+') + '</span></span>' +
      '</button>' +
      '<div class="lib-body' + (open ? ' open' : '') + '" id="libbody-' + ex.id + '">' +
        '<div class="muted">' + CATS[ex.cat].name + ' · Equipment: ' + ex.equip.map(eq => EQUIP_NAMES[eq] || eq).join(', ') +
          (ex.rest ? ' · Pause ' + ex.rest + ' Sek' : '') + '</div>' +
        '<ul class="lvl-list">' + ex.levels.map((l, i) =>
          '<li class="' + (i === lvl ? 'at' : (i < lvl ? 'passed' : '')) + '"><span>' + (i + 1) + '. ' + esc(l.stage) + '</span><span class="t">' + esc(l.target) + '</span></li>').join('') + '</ul>' +
        '<div class="inline-row"><button onclick="adjustLevel(\'' + ex.id + '\',-1)">− ' + __('level') + '</button>' +
          '<button onclick="adjustLevel(\'' + ex.id + '\',1)">+ ' + __('level') + '</button></div>' +
        '<div class="inline-row"><input id="pr-' + ex.id + '" placeholder="' + __('best') + ', z. B. 24 Sek oder 7 Wdh" value="' + (pr ? esc(pr.v) : '') + '">' +
          '<button onclick="savePR(\'' + ex.id + '\')">' + __('save') + '</button></div>' +
        (pr ? '<div class="pr-line">Zuletzt aktualisiert: ' + fmtDate(pr.d) + '</div>' : '') +
        '<ul class="tips open" style="margin-top:10px">' + ex.tips.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
        '<button class="tip-btn" onclick="showExHistory(\'' + ex.id + '\')">📊 ' + __('perExercise') + '</button>' +
      '</div></div>';
  }).join('') : '<div class="empty-hint">' + __('noExercises') + '</div>';
}
const EQUIP_NAMES = { none: 'kein Gerät', parallettes: 'Parallettes', bar: 'Klimmzugstange', chair: 'Stuhl/Tisch' };
function toggleLib(id){ libOpen[id] = !libOpen[id]; renderLibrary(); }
/* Der Zahlenwert einer Bestleistung, oder -Infinity wenn keiner ermittelbar ist.
   Das Feld erlaubt Freitext ("sauber!"); frueher lieferte parseInt() dann NaN
   und jeder Vergleich  v > NaN  war false – die automatische PR-Erfassung war
   fuer diese Uebung dauerhaft tot. Ein nicht lesbarer Wert darf nicht blockieren. */
function prNumber(pr){
  if(!pr) return -Infinity;
  const n = typeof pr.n === 'number' ? pr.n : parseInt(pr.v, 10);
  return Number.isFinite(n) ? n : -Infinity;
}

async function savePR(id){
  const v = (document.getElementById('pr-' + id).value || '').trim().slice(0, 40);
  if(!v){
    delete state.prs[id];
  } else {
    const n = parseInt(v, 10);
    state.prs[id] = Number.isFinite(n) ? { v, n, d: today() } : { v, d: today() };
  }
  await save(); renderLibrary(); toast(v ? 'Bestleistung gespeichert.' : 'Bestleistung gelöscht.');
}

/* ================= Plan-Editor mit Drag & Drop ================= */
let dragSrcId = null, dragSrcIdx = null;

function renderPlanTab(){
  const sel = document.getElementById('planSelect');
  sel.innerHTML = Object.entries(PLAN_TEMPLATES).map(([k, v]) =>
    '<option value="' + k + '"' + (!state.customPlan && state.planId === k ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
    (state.customPlan ? '<option value="custom" selected>' + __('customPlan') + '</option>' : '');
  document.getElementById('planDesc').textContent = state.customPlan ? __('customPlan') : (PLAN_TEMPLATES[state.planId] || {}).desc || '';

  const days = getDays();
  document.getElementById('planEditor').innerHTML = days.map((d, di) =>
    '<div class="plan-day">' +
      '<div class="plan-day-head"><span class="plan-day-title">' + esc(d.key) + ' · ' + esc(d.title) + '</span>' +
        '<span><button class="mini-btn" onclick="renameDay(' + di + ')" title="' + __('rename') + '">✎</button> ' +
        '<button class="mini-btn danger" onclick="removeDay(' + di + ')" title="' + __('remove') + '">✕</button></span></div>' +
      d.ex.map((id, ei) => {
        const ex = EX_BY_ID[id];
        return '<div class="plan-ex" draggable="true" ondragstart="dragStart(event,' + di + ',' + ei + ')" ondragover="dragOver(event)" ondrop="dragDrop(' + di + ',' + ei + ')" ondragend="dragEnd()">' +
          '<span class="drag-handle">⠿</span>' +
          '<span class="nm">' + (ex ? esc(ex.name) : '<i>unbekannt: ' + esc(id) + '</i>') +
          '</span><button class="mini-btn" onclick="moveEx(' + di + ',' + ei + ',-1)" title="' + __('moveUp') + '">↑</button>' +
          '<button class="mini-btn" onclick="moveEx(' + di + ',' + ei + ',1)" title="' + __('moveDown') + '">↓</button>' +
          '<button class="mini-btn danger" onclick="removeEx(' + di + ',' + ei + ')" title="' + __('remove') + '">✕</button></div>';
      }).join('') +
      '<div class="inline-row"><select id="add-' + di + '">' +
        Object.keys(CATS).map(c => '<optgroup label="' + CATS[c].name + '">' +
          EXERCISES.filter(e => e.cat === c).map(e => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join('') +
          '</optgroup>').join('') +
      '</select><button onclick="addEx(' + di + ')">' + __('addExercise') + '</button></div>' +
    '</div>').join('') || '<div class="empty-hint">' + __('noPlanDays') + '</div>';
}

/* event explizit entgegennehmen: das implizite globale window.event ist
   nicht standardisiert (in Firefox nicht vorhanden) und existiert unter
   Modulen/strict mode ohnehin nicht. */
function dragStart(e, di, ei){
  dragSrcId = di; dragSrcIdx = ei;
  if(e && e.dataTransfer){
    e.dataTransfer.effectAllowed = 'move';
    /* Firefox startet einen Drag nur, wenn Daten gesetzt sind. */
    e.dataTransfer.setData('text/plain', di + ':' + ei);
  }
}
function dragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function dragDrop(di, ei){
  if(dragSrcId === null || dragSrcIdx === null) return;
  if(dragSrcId === di && dragSrcIdx === ei) return;
  const p = ensureCustom();
  const arr = p.days[dragSrcId].ex;
  const item = arr.splice(dragSrcIdx, 1)[0];
  if(dragSrcId === di && dragSrcIdx < ei) ei--;
  p.days[di].ex.splice(ei, 0, item);
  dragSrcId = null; dragSrcIdx = null;
  save(); renderPlanTab();
}
function dragEnd(){ dragSrcId = null; dragSrcIdx = null; }

function ensureCustom(){
  if(!state.customPlan){
    const base = PLAN_TEMPLATES[state.planId] || PLAN_TEMPLATES.ab4;
    state.customPlan = JSON.parse(JSON.stringify({ name: __('customPlan'), desc: 'Von dir angepasst', days: base.days }));
  }
  return state.customPlan;
}
function changePlan(v){
  if(v === 'custom'){ ensureCustom(); }
  else { state.customPlan = null; state.planId = v; }
  save(); renderPlanTab(); renderStats(); renderDaySelect();
  toast('Plan gewechselt: ' + getPlan().name);
}
async function resetPlan(){
  const ok = await askConfirm('Plan zurücksetzen',
    'Der Plan wird auf die gewählte Vorlage zurückgesetzt. Deine eigenen Änderungen am Plan gehen verloren – der Trainingsfortschritt bleibt erhalten.',
    'Zurücksetzen', true);
  if(!ok) return;
  state.customPlan = null; save(); renderPlanTab(); renderDaySelect(); toast('Plan zurückgesetzt.');
}
async function addPlanDay(){
  const p = ensureCustom();
  const key = sanitizeDayKey(await askText('Trainingstag hinzufügen',
    'Kurzbezeichnung (max. 6 Zeichen, z. B. C)', String.fromCharCode(65 + p.days.length), 6));
  if(!key) return;
  const title = (await askText('Trainingstag hinzufügen', 'Titel', __('addDay'), 40)) || __('addDay');
  p.days.push({ key, title: title.slice(0, 40), sub: '', ex: [] });
  save(); renderPlanTab(); renderDaySelect();
}
async function renameDay(di){
  const p = ensureCustom(), d = p.days[di];
  const key = await askText('Tag umbenennen', 'Kurzbezeichnung (max. 6 Zeichen)', d.key, 6);
  if(key === null) return;
  const title = await askText('Tag umbenennen', 'Titel', d.title, 40);
  if(title === null) return;
  const sub = await askText('Tag umbenennen', 'Untertitel (optional)', d.sub || '', 60);
  if(sub === null) return;
  d.key = sanitizeDayKey(key) || d.key;
  d.title = title.slice(0, 40) || d.title;
  d.sub = sub.slice(0, 60);
  save(); renderPlanTab(); renderDaySelect();
}
async function removeDay(di){
  const p = ensureCustom();
  const ok = await askConfirm('Trainingstag entfernen',
    'Soll „' + p.days[di].title + '“ aus dem Plan entfernt werden? Der Stufenfortschritt der Übungen bleibt erhalten.',
    'Entfernen', true);
  if(!ok) return;
  p.days.splice(di, 1); save(); renderPlanTab(); renderDaySelect();
}
function addEx(di){
  const p = ensureCustom();
  const id = document.getElementById('add-' + di).value;
  if(p.days[di].ex.includes(id)){ toast('Übung ist an diesem Tag schon enthalten.'); return; }
  p.days[di].ex.push(id); save(); renderPlanTab();
  toast(EX_BY_ID[id].name + ' hinzugefügt.');
}
function removeEx(di, ei){
  const p = ensureCustom(); p.days[di].ex.splice(ei, 1); save(); renderPlanTab();
}
function moveEx(di, ei, d){
  const p = ensureCustom(), arr = p.days[di].ex;
  const t = ei + d; if(t < 0 || t >= arr.length) return;
  [arr[ei], arr[t]] = [arr[t], arr[ei]];
  save(); renderPlanTab();
}

/* ================= Meilensteine & Fahrplan ================= */
function renderMilestones(){
  const search = (document.getElementById('msSearch')?.value || '').toLowerCase();
  let list = MILESTONES;
  if(search) list = list.filter(m => m.name.toLowerCase().includes(search));

  document.getElementById('msList').innerHTML = list.map(m => {
    const d = (state.milestones || {})[m.id];
    return '<label class="ms' + (d ? ' done' : '') + '"><input type="checkbox" ' + (d ? 'checked' : '') +
      ' onchange="toggleMilestone(\'' + m.id + '\',this.checked)"><span><span class="ms-name">' + esc(m.name) + '</span>' +
      (d ? '<br><span class="ms-date">geschafft am ' + fmtDate(d) + '</span>' : '') + '</span></label>';
  }).join('');
}
async function toggleMilestone(id, on){
  if(on){
    state.milestones[id] = today(); signal(true);
    toast('Meilenstein: ' + MILESTONES.find(m => m.id === id).name, true);
  } else delete state.milestones[id];
  await save(); renderStats(); renderMilestones();
}
function renderRoadmap(){
  const skills = EXERCISES.filter(e => e.cat === 'skill' || ['planche_lean', 'wall_hs', 'front_lever'].includes(e.id));
  document.getElementById('roadmap').innerHTML = skills.map(ex => {
    const lvl = lvlOf(ex);
    const pct = Math.round(lvl / (ex.levels.length - 1) * 100);
    return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
      '<div class="lib-head" style="cursor:default"><span class="lib-name">' + esc(ex.name) + '</span>' +
      '<span class="lib-meta">' + pct + '%</span></div>' +
      '<div class="muted">Aktuell: ' + esc(ex.levels[lvl].stage) + ' → nächste Stufe: ' +
      (lvl < ex.levels.length - 1 ? esc(ex.levels[lvl + 1].stage) : 'Ziel erreicht') + '</div></div>';
  }).join('');
}

/* ================= Einstellungen ================= */
/* ================= Dialog-Fokus =================
   Beide Overlays haben bisher nur eine CSS-Klasse umgeschaltet: der Fokus
   wanderte nie hinein, wurde nicht gefangen und beim Schliessen nicht
   zurueckgegeben. Ein Screenreader lief am Dialog vorbei in die Seite
   dahinter, und mit der Tabulatortaste landete man hinter dem Dialog. */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Ein Stapel, kein einzelner Dialog: eine Rueckfrage kann ueber dem
   Einstellungsdialog liegen ("Backup importieren?"). Mit nur einer Variablen
   haette das Schliessen der oberen Ebene inert vom Hintergrund genommen und
   den Fokus an der falschen Stelle abgelegt, waehrend die untere noch offen
   ist. */
const dialogStack = [];
const openDialogEl = { get current(){ return dialogStack.length ? dialogStack[dialogStack.length - 1].el : null; } };

function trapTab(e){
  const top = dialogStack[dialogStack.length - 1];
  if(e.key !== 'Tab' || !top) return;
  const items = [...top.el.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if(!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

function openDialog(overlay){
  const unten = dialogStack[dialogStack.length - 1];
  /* Die darunterliegende Ebene wird selbst unerreichbar. */
  if(unten) unten.el.setAttribute('inert', '');
  else document.querySelector('.wrap')?.setAttribute('inert', '');

  dialogStack.push({ el: overlay, rueckfokus: document.activeElement });
  overlay.classList.add('open');
  const first = overlay.querySelector(FOCUSABLE);
  if(first) first.focus();
  if(dialogStack.length === 1) document.addEventListener('keydown', trapTab, true);
}

function closeDialog(overlay){
  const i = dialogStack.findIndex(d => d.el === overlay);
  if(i < 0){ overlay.classList.remove('open'); return; }
  const [eintrag] = dialogStack.splice(i, 1);
  overlay.classList.remove('open');

  const unten = dialogStack[dialogStack.length - 1];
  if(unten) unten.el.removeAttribute('inert');
  else {
    document.querySelector('.wrap')?.removeAttribute('inert');
    document.removeEventListener('keydown', trapTab, true);
  }
  /* Fokus dorthin zurueck, wo er herkam. */
  if(eintrag.rueckfokus && document.contains(eintrag.rueckfokus)) eintrag.rueckfokus.focus();
}

/* ================= Eigene Dialoge =================
   Ersetzt prompt() und confirm(). Diese blockieren den Browser, sind in
   plattformübergreifenden PWAs unterschiedlich zuverlaessig, lassen sich
   nicht gestalten und waren hier der Grund fuer eine Auswahl per
   eingetippter Nummer. Alle drei Funktionen liefern ein Promise und nutzen
   dasselbe Fokus-Management wie die uebrigen Dialoge. */

function askDialog(build){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    let done = false;
    const finish = wert => {
      if(done) return;
      done = true;
      closeDialog(overlay);
      overlay.remove();
      resolve(wert);
    };

    overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
    const modal = overlay.firstChild;
    build(modal, finish);

    overlay.addEventListener('click', e => { if(e.target === overlay) finish(null); });
    overlay.addEventListener('keydown', e => { if(e.key === 'Escape'){ e.stopPropagation(); finish(null); } });
    document.body.appendChild(overlay);
    openDialog(overlay);
  });
}

function dialogKopf(titel){
  return '<div class="modal-head"><span>' + esc(titel) + '</span>' +
    '<button data-dlg="abbrechen" aria-label="Schließen">✕</button></div>';
}
function dialogFuss(okText, gefahr){
  return '<div class="dlg-actions">' +
    '<button data-dlg="abbrechen">Abbrechen</button>' +
    '<button data-dlg="ok" class="primary' + (gefahr ? ' danger' : '') + '">' + esc(okText) + '</button></div>';
}

/* Freitexteingabe – Ersatz fuer prompt() */
function askText(titel, label, vorgabe = '', maxLen = 80){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<label class="dlg-label" for="dlg-input">' + esc(label) + '</label>' +
      '<input id="dlg-input" class="dlg-input" maxlength="' + maxLen + '" value="' + esc(vorgabe) + '">' +
      dialogFuss('Übernehmen');
    const input = modal.querySelector('#dlg-input');
    const ok = () => finish(input.value);
    modal.querySelector('[data-dlg=ok]').onclick = ok;
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
    input.onkeydown = e => { if(e.key === 'Enter') ok(); };
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

/* Rueckfrage – Ersatz fuer confirm() */
function askConfirm(titel, text, okText = 'OK', gefahr = false){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(text).replace(/\n/g, '<br>') + '</p>' +
      dialogFuss(okText, gefahr);
    modal.querySelector('[data-dlg=ok]').onclick = () => finish(true);
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(false); });
  });
}

/* Auswahlliste – ersetzt die frühere Eingabe einer Nummer per prompt() */
function askChoice(titel, optionen){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<div class="dlg-list" role="group">' +
      optionen.map((o, i) =>
        '<button class="dlg-choice" data-i="' + i + '"><span class="dlg-choice-name">' + esc(o.name) + '</span>' +
        (o.sub ? '<span class="dlg-choice-sub">' + esc(o.sub) + '</span>' : '') + '</button>').join('') +
      '</div><div class="dlg-actions"><button data-dlg="abbrechen">Abbrechen</button></div>';
    modal.querySelectorAll('.dlg-choice').forEach(b => {
      b.onclick = () => finish(optionen[parseInt(b.dataset.i, 10)].value);
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

/* Nur-Lese-Text zum Markieren und Kopieren */
function showTextDialog(titel, text){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<textarea class="dlg-area" readonly rows="12"></textarea>' +
      '<div class="dlg-actions"><button data-dlg="abbrechen" class="primary">Schließen</button></div>';
    modal.querySelector('.dlg-area').value = text;
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
    setTimeout(() => { const a = modal.querySelector('.dlg-area'); a.focus(); a.select(); }, 0);
  });
}

function openSettings(){
  ['setsMode', 'rest', 'perExRest', 'autoRest', 'sound', 'vibrate', 'streak', 'weekGoal', 'deload', 'regress'].forEach(k => {
    const el = document.getElementById('cfg-' + k); if(!el) return;
    if(el.type === 'checkbox') el.checked = !!cfg(k); else el.value = String(cfg(k));
  });
  document.getElementById('storageInfo').textContent = 'Speicherort: ' + store.mode + '.';
  openDialog(document.getElementById('settingsOverlay'));
}
function closeSettings(){ closeDialog(document.getElementById('settingsOverlay')); }
/* Escape wird in addKeyboardShortcuts() behandelt – ein zweiter Listener hier
   hat closeSettings() pro Tastendruck doppelt aufgerufen. */

function updateSetting(k, v){
  state.settings[k] = v; save();
  if(k === 'lang'){ setLang(v); document.title = __('appName') + ' – Calisthenics Tracker'; }
  if(session.dayKey && ['setsMode', 'streak', 'perExRest', 'rest'].includes(k)){
    if(k === 'setsMode'){
      Object.keys(session.sets).forEach(key => {
        const id = key.slice(0, key.lastIndexOf('-'));
        const ex = EX_BY_ID[id]; if(!ex) return;
        const max = parseTarget(ex.levels[lvlOf(ex)].target).sets;
        if(parseInt(key.split('-').pop(), 10) >= max) delete session.sets[key];
      });
    }
    const n = snapshotNotes(); cancelHold(); renderWorkout(); restoreSession(n, session.reps);
  }
  renderAll();
}

/* ================= Backup ================= */
function download(name, content, type){
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportJSON(){
  try{
    download('progression-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('Backup heruntergeladen.');
  }catch(err){ console.error('[exportJSON]', err); toast('Export fehlgeschlagen.'); }
}
function exportCSV(){
  download('progression-verlauf-' + today() + '.csv', '\uFEFF' + serializeLog(state.log), 'text/csv');
  toast('CSV heruntergeladen.');
}
function exportText(){
  const lines = ['PROGRESSION · Stand ' + fmtDate(today()),
    'Plan: ' + getPlan().name, 'Trainings: ' + (state.workouts || 0), '', '— Aktuelle Stufen —'];
  getDays().forEach(d => {
    lines.push('', '[' + d.key + '] ' + d.title);
    d.ex.forEach(id => {
      const ex = EX_BY_ID[id]; if(!ex) return;
      const l = lvlOf(ex);
      lines.push('  ' + ex.name + ': Stufe ' + (l + 1) + '/' + ex.levels.length + ' – ' + ex.levels[l].stage + ' (' + ex.levels[l].target + ')');
    });
  });
  const ms = Object.keys(state.milestones || {});
  if(ms.length){
    lines.push('', '— Meilensteine —');
    ms.forEach(id => { const m = MILESTONES.find(x => x.id === id); if(m) lines.push('  ✔ ' + m.name + ' (' + fmtDate(state.milestones[id]) + ')'); });
  }
  const ws = state.weights || [];
  if(ws.length) lines.push('', 'Gewicht: ' + ws[0].kg + ' kg → ' + ws[ws.length - 1].kg + ' kg');
  const text = lines.join('\n');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(() => toast('In die Zwischenablage kopiert.'))
      .catch(() => showTextDialog('Zum Kopieren markieren', text));
  } else showTextDialog('Zum Kopieren markieren', text);
}
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/* Beschneidet ein importiertes Backup auf die bekannte Form.
   Bewusst kappen statt ablehnen: ein Validator, der die eigenen aelteren
   Backups des Nutzers zurueckweist, waere ein Datenverlust-Bug. */
function clampBackup(data){
  const known = Object.keys(DEFAULT_STATE());
  const out = {};
  known.forEach(k => { if(data[k] !== undefined && data[k] !== null) out[k] = data[k]; });

  if(out.customPlan && typeof out.customPlan === 'object'){
    const days = Array.isArray(out.customPlan.days) ? out.customPlan.days : [];
    out.customPlan.days = days.filter(d => d && typeof d === 'object').slice(0, 20).map(d => ({
      key: sanitizeDayKey(d.key) || '?',
      title: String(d.title == null ? '' : d.title).slice(0, 40),
      sub: String(d.sub == null ? '' : d.sub).slice(0, 60),
      ex: (Array.isArray(d.ex) ? d.ex : []).filter(id => EX_BY_ID[id]).slice(0, 30)
    }));
  }
  if(Array.isArray(out.warmupCustom)){
    out.warmupCustom = out.warmupCustom.slice(0, 30).map(w => String(w == null ? '' : w).slice(0, 80));
  }
  if(out.notes && typeof out.notes === 'object'){
    Object.keys(out.notes).forEach(id => {
      const n = out.notes[id];
      if(!n || typeof n !== 'object'){ delete out.notes[id]; return; }
      n.t = String(n.t == null ? '' : n.t).slice(0, 160);
    });
  }
  if(out.prs && typeof out.prs === 'object'){
    Object.keys(out.prs).forEach(id => {
      const p = out.prs[id];
      if(!p || typeof p !== 'object'){ delete out.prs[id]; return; }
      p.v = String(p.v == null ? '' : p.v).slice(0, 40);
    });
  }
  if(Array.isArray(out.log)) out.log = out.log.filter(l => l && typeof l === 'object').slice(-MAX_LOG_ENTRIES);
  if(Array.isArray(out.weights)) out.weights = out.weights.filter(w => w && typeof w === 'object').slice(-MAX_SERIES_ENTRIES);
  return out;
}

function importJSON(input){
  const file = input.files && input.files[0]; if(!file) return;
  if(file.size > MAX_BACKUP_BYTES){
    toast('Datei ist zu groß für ein Backup (über 5 MB).'); input.value = ''; return;
  }
  const r = new FileReader();
  r.onload = async e => {
    try{
      const data = JSON.parse(e.target.result);
      if(!data || typeof data !== 'object' || Array.isArray(data) ||
         (data.levels === undefined && data.workouts === undefined)) throw new Error('invalid');
      const ok = await askConfirm('Backup importieren',
        'Der aktuelle Stand auf diesem Gerät wird vollständig überschrieben. Lade vorher ein Backup herunter, wenn du ihn behalten willst.',
        'Importieren', true);
      if(!ok){ input.value = ''; return; }
      cancelHold(); stopRest();
      state = Object.assign(DEFAULT_STATE(), clampBackup(data));
      clearSession();          /* vor dem Speichern: sonst landet eine aus dem
                                  Backup stammende Einheit kurz im Speicher */
      await save();
      document.getElementById('finishBar').style.display = 'none';
      applyTheme(); closeSettings(); showTab('train'); renderAll();
      toast('Backup importiert – willkommen zurück!', true);
    }catch(err){
      console.error('[importJSON]', err);
      toast('Import fehlgeschlagen – keine gültige Backup-Datei.');
    }
    input.value = '';
  };
  r.onerror = () => { toast('Datei konnte nicht gelesen werden.'); input.value = ''; };
  r.readAsText(file);
}

/* ================= CSV Import ================= */

/* Echter CSV-Parser fuer das von exportCSV() erzeugte Format:
   Semikolon-getrennt, Felder in Anfuehrungszeichen, "" als maskiertes ".
   Der frueher genutzte line.split(';') + replace(/"/g,'') zerlegte jede
   Zeile falsch, sobald ein Feld selbst ein Semikolon enthielt – der
   Roundtrip des eigenen Exports war damit nicht verlustfrei. */
function importCSV(input){
  const file = input.files && input.files[0]; if(!file) return;
  if(file.size > MAX_BACKUP_BYTES){
    toast('Datei ist zu groß (über 5 MB).'); input.value = ''; return;
  }
  const r = new FileReader();
  r.onload = async e => {
    try{
      const { entries: imported, skipped } = parseLog(e.target.result, sanitizeDayKey);
      if(!imported.length) throw new Error('keine gültigen Zeilen gefunden');

      const msg = imported.length + ' Einträge werden importiert. Bereits vorhandene Einträge werden übersprungen.' +
        (skipped ? '\n\n' + skipped + ' Zeile(n) werden ausgelassen (ungültiges Datum oder keine Sätze).' : '');
      if(!await askConfirm('Verlauf importieren', msg, 'Importieren')) return;

      const existing = new Set((state.log || []).map(l => l.d + '-' + l.day));
      let added = 0;
      imported.forEach(en => {
        const key = en.d + '-' + en.day;
        if(!existing.has(key)){ state.log.push(en); existing.add(key); added++; }
      });
      state.log.sort((a, b) => a.d.localeCompare(b.d));
      if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);
      save(); renderAll(); renderHistory();
      toast(added + ' von ' + imported.length + ' Einträgen importiert.');
    }catch(err){
      toast('CSV-Import fehlgeschlagen: ' + err.message);
    }finally{
      /* Immer zuruecksetzen – bei einem return im try-Block blieb der Wert
         sonst stehen und dieselbe Datei loeste kein change-Event mehr aus. */
      input.value = '';
    }
  };
  r.onerror = () => { toast('Datei konnte nicht gelesen werden.'); input.value = ''; };
  r.readAsText(file);
}

async function resetAll(){
  const ok = await askConfirm('Alles zurücksetzen',
    'Stufen, Verlauf, Notizen, Bestleistungen, Meilensteine, Gewichtsdaten und Maße werden gelöscht.\n\n' +
    'Einstellungen, Design und Plan bleiben erhalten. Das lässt sich nicht rückgängig machen.',
    'Alles löschen', true);
  if(!ok) return;
  cancelHold(); stopRest();
  const keep = { theme: state.theme, settings: state.settings, planId: state.planId, customPlan: state.customPlan };
  /* Ohne catch bricht ein Fehler in store.clear() die async-Funktion mitten
     im Zuruecksetzen ab – ohne Meldung und mit halb geleertem Speicher. */
  try{
    await store.clear();
  }catch(err){
    console.error('[resetAll]', err);
    toast('Zurücksetzen fehlgeschlagen – der Speicher ließ sich nicht leeren.');
    return;
  }
  state = Object.assign(DEFAULT_STATE(), keep);
  clearSession();
  await save();
  document.getElementById('finishBar').style.display = 'none';
  closeSettings(); showTab('train'); renderAll();
  toast('Fortschritt zurückgesetzt – neuer Zyklus!');
}

/* ================= Helfer ================= */
/* today(), isoDaysAgo(), fmtDate(), esc() und sanitizeDayKey() liegen in
   js/domain/ und werden oben importiert. */

let toastTimer = null;
function toast(msg, big){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('levelup', !!big);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), big ? 5000 : 3200);
}

/* Ungespeichertes Training beim Verlassen abfangen */
window.addEventListener('beforeunload', e => {
  if(session.dayKey && Object.values(session.sets).some(Boolean)){
    e.preventDefault(); e.returnValue = '';
  }
});

/* =========================================================
   TEMPORÄRE BRÜCKE – wird mit der Umstellung auf data-action gelöscht.

   Seit der ES-Modul-Umstellung liegen diese Funktionen im Modul-Scope und
   sind für die Inline-Handler in index.html und in den generierten
   HTML-Strings nicht mehr erreichbar. Die Liste schrumpft mit jedem auf
   Event-Delegation umgestellten Bereich – nichts hinzufügen.
   ========================================================= */
Object.assign(window, {
  showTab, toggleTheme, selectDay, tapSet, toggleTop, toggleTips,
  adjustLevel, substituteExercise, showExHistory, closeExHistory,
  setRep, finishWorkout, undoWorkout, stopRest, dismissDeload,
  addWarmupItem, removeWarmupItem,
  addWeight, addMeasurement,
  setLibFilter, toggleLib, savePR,
  dragStart, dragOver, dragDrop, dragEnd, changePlan, resetPlan,
  addPlanDay, renameDay, removeDay, addEx, removeEx, moveEx,
  toggleMilestone,
  openSettings, closeSettings, updateSetting,
  exportJSON, exportCSV, exportText, importJSON, importCSV, resetAll
});
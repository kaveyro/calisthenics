/* =========================================================
   PROGRESSION – App-Logik
   ========================================================= */

import { CATS, EXERCISES, PLAN_TEMPLATES, MILESTONES, WARMUP, WARMUP_PFLICHT, EX_BY_ID } from './exercises.js';
import { store, STORAGE_KEY } from './storage.js';
import { today, fmtDate as fmtDatePure, isoWeek, tageZwischen, calcGlobalStreak as streakOf } from './domain/dates.js';
import { esc, sanitizeDayKey } from './domain/escape.js';
import { parseTarget as parseTargetPure } from './domain/target.js';
import { serializeLog, parseLog } from './domain/csv.js';
import { detectPlateaus as plateausOf } from './domain/plateau.js';
import { entryHasExercise, repsOf, lastRepsByExercise, letztesDatumJeUebung } from './domain/log.js';
import { backupFaellig } from './domain/backup.js';
import {
  SETTINGS_DEFAULTS, STATE_VERSION, MAX_LOG_ENTRIES, MAX_SERIES_ENTRIES, MAX_WORKOUT_SECS,
  DEFAULT_STATE, migrateState, besserePR, clampBackup as clampBackupPure
} from './domain/state.js';
import { mergeStates } from './domain/merge.js';
import { EQUIP, exMoeglich, levelMoeglich, fehlendeGeraete } from './domain/equipment.js';
import { buildPlan } from './domain/planbuilder.js';
import { einstiegsFragen, startStufen } from './domain/einstieg.js';
import { meilensteinStatus, erkannteMeilensteine } from './domain/milestones.js';
import { volumenJeGruppe } from './domain/volume.js';
import { installDelegation, zahl } from './ui/delegate.js';
import {
  __, setLang, getLang, LANGS, applyStaticTexts,
  catName, exName, exStage, exTips, msName, warmupText,
  planName, planDesc, dayTitle, daySub
} from './i18n/index.js';

let state = DEFAULT_STATE();
/* Alles, was zur laufenden Einheit gehoert – an einer Stelle, damit keine
   Sammlung beim Zuruecksetzen vergessen wird. */
const leereSession = () => ({
  dayKey: null, sets: {}, top: {}, reps: {}, notes: {},
  /* Nur fuer heute: origId -> ersatzId bzw. origId -> true. Beides steht
     bewusst in der Session und nicht im Plan – wer eine Uebung heute nicht
     machen kann, will deswegen nicht seinen Plan umbauen. */
  subs: {}, skip: {},
  /* Abgehakte Aufwaermpunkte, nach Position in der Liste. */
  warm: {},
  /* Zeitstempel des ERSTEN Hakens, nicht der Tagesauswahl: zwischen "Tag
     angetippt" und "erster Satz" liegen Umziehen und Aufwaermen, und beides
     ist keine Trainingszeit. null, solange nichts geschafft ist. */
  start: null
});
let session = leereSession();
let holdTimer = null, restTimer = null, wakeLock = null;
/* Beide Timer richten sich nach einem absoluten Zielzeitpunkt statt nach
   heruntergezaehlten Ticks. Browser drosseln setInterval im Hintergrund auf
   mindestens eine Sekunde und frieren ihn auf Mobilgeraeten ganz ein: eine
   90-Sekunden-Pause, waehrend der das Handy gesperrt war, ging vorher um
   genau die Sperrzeit nach. Der Tick zeichnet nur noch. */
const TAKT = 250;
let restEnde = 0;
/* Zuletzt angekuendigte Restsekunde – gegen vier Toene pro Sekunde. */
let restLetzteSek = 0;
let libFilter = 'all';
let libNurMachbar = false;
const libOpen = {};
let storageOK = true, lastWorkoutSnapshot = null, undoTimeout = null;

function cfg(k){
  return (state.settings && state.settings[k] !== undefined) ? state.settings[k] : SETTINGS_DEFAULTS[k];
}

/* ================= Start =================
   Exportiert statt sofort ausgefuehrt. Solange sich dieses Modul beim Import
   selbst startete, konnte kein Test es laden – und damit lag der weitaus
   groesste Teil des Codes ausserhalb jeder Pruefung, waehrend js/domain/
   vollstaendig abgedeckt war. Aufgerufen wird start() von js/main.js, dem
   Einstiegspunkt in index.html. */
export async function start(){
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
      setTimeout(() => toast(__('storageCorrupt'), true), 400);
    }
    setLang(cfg('lang'));
    applyLanguage();
    applyTheme();
    applyRegression();     /* vor dem ersten Rendern, damit die Stufen stimmen */
    renderAll();
    /* Einen Tab aus der Adresse uebernehmen – so funktionieren die
       Verknuepfungen im Manifest und ein geteilter Link. replaceState gibt
       dem ersten Eintrag seinen Zustand, damit popstate spaeter etwas
       vorfindet, statt auf den Rueckfall zurueckzugreifen. */
    const ausAdresse = location.hash.replace('#', '');
    aktiverTab = TABS.includes(ausAdresse) ? ausAdresse : 'train';
    history.replaceState({ tab: aktiverTab }, '', '#' + aktiverTab);
    if(aktiverTab !== 'train') showTab(aktiverTab, true);
    restoreActiveSession();
    registerSW();
    speicherSichern();
    installDelegation(actions);
    installPlanDragAndDrop();
    addKeyboardShortcuts();
    addTablistNavigation();
    installGlobalListeners();
  }catch(err){
    /* Ohne diesen Zweig bliebe der Ladehinweis dauerhaft stehen und der
       Fehler landete nur als unbehandelte Promise-Rejection in der Konsole. */
    console.error('[boot]', err);
    const el = document.getElementById('content');
    if(el) el.innerHTML =
      '<div class="empty-hint"><b>' + esc(__('bootFailed')) + '</b><br><br>' +
      esc(String(err && err.message || err)) +
      '<br><br>' + esc(__('bootHint')) + '</div>';
  }
}

/* Ein einmaliger Toast reichte nicht: wer ihn verpasst, trainiert
   wochenlang weiter, ohne dass etwas ankommt. Der Hinweis bleibt jetzt
   sichtbar, solange Schreiben fehlschlaegt, und verschwindet von selbst,
   sobald es wieder klappt. */
function updateStorageWarning(){
  const el = document.getElementById('storageWarn');
  if(el) el.hidden = storageOK;
}

/* ================= Dauerhaftigkeit und Installation =================
   Der gesamte Verlauf liegt unter einem localStorage-Schluessel. Ohne
   navigator.storage.persist() darf der Browser ihn unter Speicherdruck
   raeumen, und iOS loescht die Daten einer nicht installierten Seite nach
   sieben Tagen ohne Nutzung. Beides zusammen ist das groesste Datenrisiko
   der App – deshalb wird die Zusage angefordert UND zur Installation
   eingeladen, denn sie ist die Bedingung, unter der die Zusage haelt. */
let dauerhaft = null;        /* true | false | null (nicht unterstuetzt) */
let installAngebot = null;

async function speicherSichern(){
  dauerhaft = await store.persist();
  zeigeSpeicherinfo();
}

async function zeigeSpeicherinfo(){
  const el = document.getElementById('storageInfo');
  if(!el) return;
  const teile = [__('storageLocation', { mode: __('storageLocal') })];
  if(dauerhaft === true) teile.push(__('storagePersisted'));
  else if(dauerhaft === false) teile.push(__('storageBestEffort'));
  const bytes = await store.estimate();
  if(bytes !== null) teile.push(__('storageUsage', { size: byteText(bytes) }));
  el.textContent = teile.join(' · ');
}

function byteText(bytes){
  const mb = bytes / (1024 * 1024);
  return (mb >= 1 ? mb.toFixed(1) : (bytes / 1024).toFixed(0) + ' k').replace('.', ',') +
    (mb >= 1 ? ' MB' : 'B');
}

function zeigeInstallSchalter(){
  const b = document.getElementById('installBtn');
  if(b) b.hidden = !installAngebot;
}

async function appInstallieren(){
  if(!installAngebot) return;
  installAngebot.prompt();
  await installAngebot.userChoice;
  /* Ein Angebot laesst sich nur einmal ausloesen. */
  installAngebot = null;
  zeigeInstallSchalter();
}

async function save(){
  try{
    /* Vor dem Schreiben hochzaehlen: ein anderes Fenster erkennt am Zaehler,
       dass der Stand im Speicher neuer ist als sein eigener. */
    state.rev = (state.rev || 0) + 1;
    const res = await store.save(state);
    if(!res) throw new Error('no result');
    if(!storageOK){
      storageOK = true; updateStorageWarning();
      toast(__('saveWorksAgain'));
    }
  }catch(err){
    console.error('[save]', err);
    if(storageOK){
      storageOK = false; updateStorageWarning();
      toast(__('saveFailed'));
    }
  }
}

/* ================= Laufende Einheit sichern =================
   session lebte bisher nur im Arbeitsspeicher. Schickt das Handy die PWA in
   den Hintergrund und der Browser entlaedt sie, war die halb fertige Einheit
   weg – beforeunload feuert beim App-Wechsel auf Mobilgeraeten nicht.
   Deshalb wird sie bei jeder Aenderung mitgeschrieben.

   Geschrieben wird ueber drei Wege:
     persistSession()        sofort – fuer einzelne Interaktionen
     persistSessionSpaeter() entprellt – fuer Tastendruck-Ereignisse
     flushSession()          holt einen ausstehenden Schreibvorgang nach
*/
const SCHREIB_VERZOEGERUNG = 500;
let schreibTimer = null;

/* Kennung dieses Fensters, nur zur Laufzeit. Sie steht in der laufenden
   Einheit mit, damit ein anderes Fenster erkennt, ob die gespeicherte Einheit
   seine eigene ist – siehe den storage-Listener. */
const fensterId = (globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID().slice(0, 8)
  : String(Date.now()).slice(-8);

/* Uebertraegt die Session in den Zustand, ohne zu schreiben. */
function spiegleSession(){
  state.activeSession = session.dayKey
    ? {
      dayKey: session.dayKey, d: today(), tab: fensterId,
      sets: { ...session.sets }, top: { ...session.top },
      reps: { ...session.reps }, notes: { ...session.notes },
      subs: { ...session.subs }, skip: { ...session.skip },
      warm: { ...session.warm }, start: session.start || null,
      /* Absoluter Zeitpunkt, damit eine laufende Pause ein Neuladen
         uebersteht – eine Restdauer waere nach dem Laden wertlos. */
      restEnde: restEnde || null
    }
    : null;
}

function persistSession(){
  spiegleSession();
  /* Ein noch anstehender entprellter Schreibvorgang ist damit erledigt –
     sonst folgte gleich ein zweiter mit demselben Inhalt. */
  clearTimeout(schreibTimer);
  schreibTimer = null;
  save();
}

/* Entprellte Variante fuer haeufige Ereignisse.

   setRep() haengt am input-Ereignis, feuert also bei JEDEM Tastendruck.
   Jeder davon serialisierte bisher den kompletten Zustand und schrieb ihn
   synchron in localStorage – bei bis zu 2000 Log-Eintraegen spuerbar.

   Der Zustand wird weiterhin sofort aktualisiert, damit ein Re-Render den
   Wert sieht; nur das Schreiben wartet. */
function persistSessionSpaeter(){
  spiegleSession();
  clearTimeout(schreibTimer);
  schreibTimer = setTimeout(() => { schreibTimer = null; save(); }, SCHREIB_VERZOEGERUNG);
}

/* Ausstehendes Schreiben sofort ausfuehren. Muss vor jedem Ersetzen oder
   Auslesen des Zustands laufen – sonst geht genau die letzte Eingabe
   verloren, die die Persistenz retten soll. */
function flushSession(){
  if(schreibTimer === null) return;
  clearTimeout(schreibTimer);
  schreibTimer = null;
  save();
}

function clearSession(){
  /* Verwerfen, nicht ausspuelen: der Zustand wird ohnehin gleich ersetzt,
     ein ausstehender Schreibvorgang wuerde die alte Session zurueckholen. */
  clearTimeout(schreibTimer);
  schreibTimer = null;
  session = leereSession();
  state.activeSession = null;
}
function restoreActiveSession(){
  const a = state.activeSession;
  if(!a || !a.dayKey) return false;
  /* Eine Einheit von gestern ist keine laufende Einheit mehr. */
  if(a.d && a.d !== today()){ state.activeSession = null; return false; }
  if(!getDay(a.dayKey)) { state.activeSession = null; return false; }
  session = {
    dayKey: a.dayKey, sets: a.sets || {}, top: a.top || {},
    reps: a.reps || {}, notes: a.notes || {},
    subs: a.subs || {}, skip: a.skip || {},
    warm: a.warm || {},
    /* Ein verbogener Zeitstempel wuerde eine absurde Dauer ergeben; die
       Plausibilitaet prueft dauerJetzt() beim Abschliessen. */
    start: Number.isFinite(Number(a.start)) ? Number(a.start) : null
  };
  renderWarmup();
  renderDaySelect(); renderWorkout(); restoreSession(session.reps);

  /* Eine Pause, die beim Neuladen noch lief, laeuft weiter. Die Obergrenze
     faengt einen verbogenen Zeitstempel ab: ohne sie stuende dort eine
     Pause ueber Stunden. */
  const offen = Number(a.restEnde) - Date.now();
  if(Number.isFinite(offen) && offen > 0 && offen <= 60 * 60 * 1000) restBis(Number(a.restEnde));

  requestWakeLock();
  toast(__('sessionRestored'));
  return true;
}

function setRep(key, value){
  const n = parseInt(value, 10);
  session.reps[key] = Number.isFinite(n) ? n : null;
  /* Entprellt: hier feuert jeder Tastendruck. Satz-Tap, Top-Haekchen und
     Tagwechsel schreiben weiterhin sofort – dort ist ein Schreibvorgang pro
     Interaktion angemessen. */
  persistSessionSpaeter();
}

/* Notizen gehoeren zur laufenden Einheit wie Saetze und Wiederholungen.
   Bisher lebten sie ausschliesslich im Textfeld: eine wiederhergestellte
   Einheit kam ohne sie zurueck, und ein Undo warf sie weg. */
function setNote(id, value){
  session.notes[id] = value;
  persistSessionSpaeter();
}

/* ================= Service Worker und Update-Zustellung =================
   Die neue Version uebernimmt nicht mehr von selbst, sondern meldet sich und
   wartet. Erst der Klick auf "Neu laden" schickt ihr SKIP_WAITING; das
   anschliessende controllerchange laedt die Seite genau einmal neu.

   Ohne diesen Weg lief die App nach einem Deploy mit neuem Cache und altem
   JavaScript weiter, ohne dass irgendetwas darauf hingewiesen haette. */
let swWartend = null;
let swLaedtNeu = false;
let swLetztePruefung = 0;
const SW_PRUEFABSTAND = 30 * 60 * 1000;

function registerSW(){
  if(!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  /* updateViaCache: 'none' – sonst gilt der Standard 'imports', und
     ausgerechnet sw-manifest.js, in dem die Version ueberhaupt erst steht,
     kaeme bei der Update-Pruefung aus dem HTTP-Cache. Auf GitHub Pages
     verzoegert das die Erkennung um dessen max-age. */
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
    swLetztePruefung = Date.now();
    if(reg.waiting && navigator.serviceWorker.controller) updateAnbieten(reg.waiting);

    reg.addEventListener('updatefound', () => {
      const neu = reg.installing;
      if(!neu) return;
      neu.addEventListener('statechange', () => {
        /* Ohne die Pruefung auf controller meldet auch die Erstinstallation
           ein "Update" – dort gibt es aber keine alte Version. */
        if(neu.state === 'installed' && navigator.serviceWorker.controller) updateAnbieten(neu);
      });
    });
  }).catch(() => { /* Ohne Service Worker laeuft die App weiter, nur ohne Offline-Cache */ });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!swLaedtNeu) return;      /* Schutz vor einer Neulade-Schleife */
    swLaedtNeu = false;
    location.reload();
  });
}

function updateAnbieten(worker){
  swWartend = worker;
  toast(__('updateAvailable'), true, { text: __('updateReload'), action: 'sw:update' });
}

function updateAnwenden(){
  if(!swWartend) return;
  swLaedtNeu = true;
  swWartend.postMessage({ type: 'SKIP_WAITING' });
  swWartend = null;
}

/* Eine installierte PWA wird tagelang nicht neu geladen und erfaehrt sonst
   nie von einem Deploy. Beim Zurueckkehren nachsehen, hoechstens halbstuendlich. */
function swPruefen(){
  if(!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistration().then(reg => {
    if(!reg) return;
    /* Einen bereits wartenden Worker erneut anbieten – der Hinweis kann
       waehrend der Abwesenheit weggeblendet worden sein. */
    if(reg.waiting && navigator.serviceWorker.controller) updateAnbieten(reg.waiting);
    if(Date.now() - swLetztePruefung < SW_PRUEFABSTAND) return;
    swLetztePruefung = Date.now();
    return reg.update();
  }).catch(() => {});
}

function renderAll(){
  /* Auch die Aufwaermliste: ihre Haken gehoeren zur Einheit, und die endet
     hier (Abschluss, Rueckgaengig, Import, Zuruecksetzen). Ohne das blieben
     sie nach dem Abschluss stehen und die naechste Einheit begaenne mit
     einem fertig abgehakten Aufwaermen. */
  renderWarmup();
  renderStats(); renderPhase(); renderBanners(); renderDaySelect();
  /* Ein laufendes Training nicht ueberschreiben. Alle Aufrufer, die eine
     Einheit beenden oder verwerfen, setzen session.dayKey vorher auf null. */
  if(session.dayKey) return;
  document.getElementById('content').innerHTML =
    '<div class="empty-hint">' + esc(__('selectDay')) + '.<br><br>' +
    esc(__('selectDayHint')) + '</div>';
}

/* Setzt alles, was ausserhalb der Render-Funktionen von der Sprache abhaengt. */
function applyLanguage(){
  document.documentElement.lang = getLang();
  document.title = __('appName') + ' – ' + __('appTagline');
  applyStaticTexts();
  /* Sprachnamen bleiben in ihrer eigenen Sprache – „Deutsch" heisst auch auf
     einer englischen Oberflaeche Deutsch. */
  const sel = document.getElementById('cfg-lang');
  if(sel) sel.innerHTML = Object.entries(LANGS)
    .map(([k, name]) => '<option value="' + k + '">' + esc(name) + '</option>').join('');
  /* Wird sonst nur beim Oeffnen der Einstellungen gesetzt und bliebe nach
     einem Sprachwechsel in der alten Sprache stehen. */
  zeigeSpeicherinfo();
  /* Zuletzt: applyStaticTexts() hat die Beschriftung der Theme-Schaltflaeche
     gerade auf den statischen Schluessel zurueckgesetzt, applyTheme() traegt
     den aktuellen Modus wieder ein. */
  applyTheme();
}

/* ================= Theme =================
   state.theme === null heisst "dem System folgen". Genau dorthin fuehrte
   aber kein Weg zurueck: toggleTheme() schaltete nur zwischen hell und
   dunkel um, und wer die Schaltflaeche einmal beruehrt hatte, war fuer immer
   festgelegt. Jetzt ein Dreierzyklus – und ein Listener, damit ein
   Systemwechsel bei geoeffneter App ankommt statt bis zum Neuladen zu warten. */
const THEMES = [null, 'light', 'dark'];
const THEME_ZEICHEN = { null: '◐', light: '☀', dark: '☾' };
const THEME_TEXT = { null: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

const systemDunkel = () =>
  !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);

function applyTheme(){
  const wunsch = state.theme === 'light' || state.theme === 'dark' ? state.theme : null;
  const t = wunsch || (systemDunkel() ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;

  const btn = document.getElementById('themeBtn');
  if(btn){
    /* Das Zeichen benennt den AKTUELLEN Zustand, nicht den naechsten Schritt.
       Bei drei Moeglichkeiten waere "was passiert beim Tippen" nicht mehr
       aus einem Symbol ablesbar. */
    btn.textContent = THEME_ZEICHEN[wunsch];
    btn.setAttribute('aria-label', __('themeCurrent', { mode: __(THEME_TEXT[wunsch]) }));
    btn.setAttribute('title', __(THEME_TEXT[wunsch]));
  }
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.setAttribute('content', t === 'dark' ? '#14161A' : '#F3F4F1');
}

function toggleTheme(){
  const i = THEMES.indexOf(state.theme === 'light' || state.theme === 'dark' ? state.theme : null);
  state.theme = THEMES[(i + 1) % THEMES.length];
  applyTheme(); save();
  toast(__(THEME_TEXT[state.theme]));
}


/* ================= Plan ================= */
function getPlan(){
  if(state.customPlan) return state.customPlan;
  return PLAN_TEMPLATES[state.planId] || PLAN_TEMPLATES.ab4;
}
function getDays(){ return getPlan().days || []; }
function getDay(key){ return getDays().find(d => d.key === key); }

/* Anzeigename des Plans. Ein eigener Plan traegt einen vom Nutzer gewaehlten
   bzw. uebernommenen Namen und wird nicht uebersetzt. */
function planLabel(){
  return state.customPlan ? __('customPlan') : planName(state.planId, getPlan().name);
}
/* Titel und Untertitel eines Vorlagen-Tages. Bei einem eigenen Plan stammen
   sie vom Nutzer und bleiben unveraendert. */
function dayTitleOf(d){
  return state.customPlan ? d.title : dayTitle(state.planId, d.key, d.title);
}
function daySubOf(d){
  return state.customPlan ? d.sub : daySub(state.planId, d.key, d.sub);
}

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
  document.getElementById('planName').textContent = planLabel();
}
function statBox(n, l){
  return '<div class="stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>';
}
function renderPhase(){
  const perWeek = Math.max(2, cfg('weekGoal'));
  const w = Math.min(8, Math.floor((state.workouts || 0) / perWeek) + 1);
  let phase = __('phase1');
  if(w >= 3) phase = __('phase3');
  if(w >= 5) phase = __('phase5');
  if(w >= 7) phase = __('phase7');
  let extra = '';
  const gs = calcGlobalStreak();
  if(gs >= 7) extra += __('streakLine', { n: gs });
  document.getElementById('phaseLine').innerHTML =
    __('weekOf', { w, phase: esc(phase) }) +
    (state.lastDate ? __('lastTrained', { date: fmtDate(state.lastDate) }) : '') + extra;
}

/* ================= Global Streak & Plateau Detection ================= */
/* Duenne Huellen um die reinen Funktionen aus js/domain/, damit die vielen
   Aufrufstellen unveraendert bleiben. */
function calcGlobalStreak(){ return streakOf(state.log); }

function detectPlateaus(){
  return plateausOf(getDays(), state.log || [], state.levels, EX_BY_ID)
    .map(id => exName(EX_BY_ID[id]));
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
    namen.push(exName(ex));
  });

  state.regressedFor = state.lastDate;
  if(namen.length){
    save();
    setTimeout(() => toast(__('regressedCount', { n: namen.length }), true), 600);
  }
}

/* ================= Entlastungswoche =================
   Das Banner erinnerte bisher an eine Deload-Woche und hielt danach nur einen
   Zaehler fest – halbiert hat nie etwas. Jetzt ist es ein Zustand mit
   Enddatum: state.deload = { bis: 'YYYY-MM-DD' }. */
const DELOAD_TAGE = 7;

function deloadAktiv(){
  return !!(state.deload && state.deload.bis && today() <= state.deload.bis);
}
/* Abgelaufene Woche aufraeumen. Wird aus renderBanners() gerufen, also bei
   jedem Neuzeichnen – ein Datumsvergleich, kein Timer. */
function deloadAufraeumen(){
  if(!state.deload || deloadAktiv()) return false;
  state.deload = null;
  save();
  setTimeout(() => toast(__('deloadEnded')), 400);
  return true;
}
function startDeload(due){
  const ende = new Date(today());
  ende.setDate(ende.getDate() + DELOAD_TAGE - 1);
  state.deload = { bis: ende.toISOString().slice(0, 10) };
  /* Die Erinnerung hat ihren Zweck erfuellt und soll nicht daneben stehen. */
  if(due) state.deloadDismissed = due;
  beendeDeloadUmstellung();
  toast(__('deloadStarted'));
}
function endDeload(){
  state.deload = null;
  beendeDeloadUmstellung();
}
/* Die Satzzahl aendert sich in beide Richtungen mitten in einer laufenden
   Einheit – dieselbe Nacharbeit wie beim Satz-Modus. */
function beendeDeloadUmstellung(){
  if(session.dayKey){
    verwerfeUeberzaehligeSaetze();
    cancelHold();
    persistSession();
    renderWorkout(); restoreSession(session.reps);
  } else save();
  renderAll();
}

function renderBanners(){
  const el = document.getElementById('banners');
  let html = '';
  deloadAufraeumen();

  /* Ganz oben und als Erstes: ohne den Einstieg beginnt jeder bei Stufe 1
     von allen 42 Uebungen.

     Bewusst ein Banner und kein Dialog beim Start. Eine App, die einen
     begruesst, bevor man sie gesehen hat, wird weggeklickt; hier steht die
     Einladung ueber der Tagesauswahl und laesst sich lesen, waehrend man
     sich umsieht. Es ist ausserdem dasselbe Muster wie bei der
     Entlastungswoche und der faelligen Sicherung. */
  if(!state.onboarded){
    html += '<div class="banner info"><b>' + esc(__('welcomeTitle')) + '</b> ' +
      esc(__('welcomeBody')) +
      '<br><button data-action="onboarding:start">' + esc(__('welcomeStart')) + '</button> ' +
      '<button data-action="onboarding:skip">' + esc(__('later')) + '</button></div>';
  }

  if(deloadAktiv()){
    html += '<div class="banner info"><b>' + esc(__('deloadActive', { date: fmtDate(state.deload.bis) })) + '</b> ' +
      esc(__('deloadHint')) +
      '<br><button data-action="deload:end">' + esc(__('deloadEnd')) + '</button></div>';
  }
  const every = cfg('deload');
  if(every > 0 && !deloadAktiv()){
    const due = Math.floor((state.workouts || 0) / every) * every;
    if(due > 0 && due > (state.deloadDismissed || 0)){
      html += '<div class="banner warn"><b>' + esc(__('deloadTitle')) + '</b> ' +
        esc(__('deloadBody', { n: state.workouts })) +
        '<br><button data-action="deload:start" data-due="' + due + '">' + esc(__('deloadStart')) + '</button> ' +
        '<button data-action="deload:dismiss" data-due="' + due + '">' + esc(__('understood')) + '</button></div>';
    }
  }
  if(state.lastDate){
    const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
    if(days >= 7){
      html += '<div class="banner info"><b>' + esc(__('layoffTitle', { n: days })) + '</b> ' +
        esc(__('layoffBody')) + '</div>';
    }
  }
  const plateaus = detectPlateaus();
  if(plateaus.length){
    html += '<div class="banner warn">' + esc(__('plateauDetected')) + ': ' + esc(plateaus.join(', ')) +
      '.<br><small>' + esc(__('plateauMsg')) + '</small></div>';
  }
  /* Der Verlauf liegt nur in diesem Browser. Exportieren konnte man ihn
     immer, aber nichts hielt fest, wann das zuletzt geschah, und nichts
     erinnerte daran. */
  const backup = backupFaellig(state, today());
  if(backup){
    html += '<div class="banner warn"><b>' + esc(__('backupDueTitle')) + '</b> ' +
      esc(__('backupDue' + backup.grund[0].toUpperCase() + backup.grund.slice(1), { n: backup.n })) +
      '<br><button data-action="backup:exportJSON">' + esc(__('downloadBackup')) + '</button> ' +
      '<button data-action="backup:remindLater">' + esc(__('later')) + '</button></div>';
  }
  el.innerHTML = html;
}
function dismissDeload(n){ state.deloadDismissed = n; save(); renderBanners(); }
function backupSpaeter(){ state.backupDismissed = state.workouts || 0; save(); renderBanners(); }

function renderWarmup(){
  /* Nur die Standardliste wird übersetzt – eigene Einträge des Nutzers
     stehen in state.warmupCustom und bleiben so, wie er sie geschrieben hat. */
  const items = state.warmupCustom || WARMUP.map((w, i) => warmupText(i, w));
  const el = document.getElementById('warmupList');
  el.innerHTML = items.map((w, i) =>
    /* Merkmal aus den Daten statt aus einem deutschen Teilstring – die
       fruehere Pruefung w.includes('Pflicht') fiel auf Englisch stumm aus.
       Bei einer selbst zusammengestellten Liste laesst sich die Zuordnung
       nicht halten, dort entfaellt die Hervorhebung. */
    '<li' + (!state.warmupCustom && WARMUP_PFLICHT.has(i) ? ' class="pflicht"' : '') + '>' +
    /* Abhakbar wie alles andere auch. Die App zaehlt jeden Satz der
       Haupteinheit und misst Haltezeiten auf die Sekunde – das Aufwaermen
       war als einziges eine Liste zum Lesen. */
    '<label class="warm-item"><input type="checkbox"' + (session.warm[i] ? ' checked' : '') +
      ' data-action-change="warmup:toggle" data-i="' + i + '">' +
      '<span>' + esc(w) + '</span></label>' +
    ' <button class="mini-btn mini-btn--inline" data-action="warmup:remove" data-i="' + i + '"' +
    ' aria-label="' + esc(__('warmupRemoveAria', { item: w })) + '">✕</button></li>'
  ).join('');
}
function toggleWarmupItem(i, on){
  if(on) session.warm[i] = true; else delete session.warm[i];
  /* Ohne gewaehlten Tag gibt es keine activeSession, in die das mitgehen
     koennte – die Haken leben dann nur bis zum Neuladen. Mit Tag gehen sie
     denselben Weg wie jeder Satz. */
  if(session.dayKey) persistSession();
}
function removeWarmupItem(i){
  if(!state.warmupCustom) state.warmupCustom = [...WARMUP];
  state.warmupCustom.splice(i, 1);
  /* Die Haken haengen an der Position. Ohne dieses Nachruecken wandert
     jeder Haken hinter der geloeschten Zeile eine Zeile nach oben und sitzt
     danach an einem Punkt, den niemand abgehakt hat. */
  const verschoben = {};
  Object.keys(session.warm).forEach(k => {
    const n = Number(k);
    if(n < i) verschoben[n] = true;
    else if(n > i) verschoben[n - 1] = true;
  });
  session.warm = verschoben;
  save(); renderWarmup();
}
async function addWarmupItem(){
  const t = await askText(__('warmupExtend'), __('warmupNew'), '', 80);
  if(!t || !t.trim()) return;
  if(!state.warmupCustom) state.warmupCustom = [...WARMUP];
  state.warmupCustom.push(t.trim());
  save(); renderWarmup();
}

/* ================= Tabs ================= */
const TABS = ['train', 'history', 'library', 'plan', 'milestones'];
let aktiverTab = 'train';

/* Der zweite Parameter ist nur fuer den popstate-Listener da: von dort kommt
   der Wechsel bereits aus der History und darf keinen neuen Eintrag anlegen.

   Ohne diese Eintraege schloss die Zurueck-Geste auf Android die ganze App,
   statt einen Tab zurueckzugehen – bei einer installierten PWA ist das der
   erwartete Weg. */
function showTab(t, ausHistory = false){
  if(!TABS.includes(t)) t = 'train';
  if(!ausHistory && t !== aktiverTab) history.pushState({ tab: t }, '', '#' + t);
  aktiverTab = t;
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
  if(t === 'milestones') { renderMilestones(); renderBests(); renderRoadmap(); }
  window.scrollTo({ top: 0, behavior: wenigerBewegung() ? 'auto' : 'smooth' });
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
/* Fokus auf den ersten offenen Satz einer Uebungskarte – das ist die Stelle,
   an der es weitergeht. Ist alles geschafft, genuegt der erste Punkt: die
   Karte soll auch dann erreichbar sein, um einen Haken zurueckzunehmen. */
function fokusAufKarte(karte){
  if(!karte) return;
  const ziel = karte.querySelector('.set-dot:not(.done)') ||
    karte.querySelector('.set-dot') ||
    karte.querySelector(FOCUSABLE);
  if(!ziel) return;
  ziel.focus({ preventScroll: true });
  ziel.scrollIntoView({ block: 'center', behavior: wenigerBewegung() ? 'auto' : 'smooth' });
}

function addKeyboardShortcuts(){
  document.addEventListener('keydown', e => {
    /* Was ein anderer Zuhoerer schon behandelt hat, hier nicht ein zweites
       Mal ausfuehren. Die Tableiste faengt die waagerechten Pfeile ab, und
       jede Taste, die dort verbraucht wurde, ist hier keine mehr. */
    if(e.defaultPrevented) return;
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
      if(document.getElementById('restChip').style.display === 'flex'){
        stopRest(); persistSession();
      } else if(session.dayKey){
        const defaultRest = cfg('rest');
        startRest(defaultRest);
        persistSession();
        toast(__('restLabel', { sec: defaultRest }));
      }
      return;
    }
    /* Zwischen den Uebungen einer Einheit springen.

       Die Leertaste trifft immer den ersten offenen Satz der ganzen Seite –
       das ist der richtige Weg durch eine Einheit, die man der Reihe nach
       abarbeitet. Wer eine Uebung ueberspringen oder zu einer frueheren
       zurueck will, hatte bisher nur die Maus. Hoch und runter statt links
       und rechts: die Tableiste hoert schon auf die waagerechten Pfeile. */
    if((e.key === 'ArrowDown' || e.key === 'ArrowUp') && session.dayKey){
      const karten = [...document.querySelectorAll('#content .ex:not(.ex--skipped)')];
      if(!karten.length) return;
      e.preventDefault();
      /* Ausgangspunkt ist der Fokus, nicht e.target: das Ereignis wird hier
         am document abgefangen, und ohne Fokus in einer Karte gibt es keinen
         Bezugspunkt. */
      const aktiv = document.activeElement;
      const i = karten.indexOf(aktiv && aktiv.closest ? aktiv.closest('.ex') : null);
      const schritt = e.key === 'ArrowDown' ? 1 : -1;
      /* Ohne Ausgangspunkt am jeweiligen Ende beginnen, sonst umlaufend. */
      fokusAufKarte(i < 0
        ? karten[schritt > 0 ? 0 : karten.length - 1]
        : karten[(i + schritt + karten.length) % karten.length]);
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
    '<button class="day-btn' + (session.dayKey === d.key ? ' active' : '') +
      '" data-action="day:select" data-key="' + esc(d.key) + '">' +
    (d.key === sug && !session.dayKey ? '<span class="badge">' + esc(__('upNext')) + '</span>' : '') +
    '<div class="tag">' + esc(d.key) + ' · ' + esc(dayTitleOf(d)) + '</div>' +
    '<div class="sub">' + esc(daySubOf(d) || __('exercisesCount', { n: d.ex.length })) + '</div></button>'
  ).join('') || '<div class="empty-hint">' + esc(__('noPlanDays') + __('noPlanDaysHint')) + '</div>';
}
/* Der frühere Sonder-Listener für #daySelect ist entfallen – die Tag-Buttons
   laufen jetzt über dieselbe Aktionstabelle wie alles andere. */

/* ================= Sätze & Ziele berechnen ================= */
/* Der einzige Ort, an dem der Satz-Modus angewandt wird – und damit auch der
   richtige fuer die Entlastungswoche. */
function parseTarget(target){
  const t = parseTargetPure(target, cfg('setsMode'));
  if(!deloadAktiv()) return t;
  /* Halbe Saetze, unveraenderte Wiederholungen und Haltezeiten: im Deload
     sinkt das Volumen, nicht die Intensitaet. Genau so ist eine
     Entlastungswoche gemeint. */
  return { ...t, sets: Math.max(1, Math.ceil(t.sets / 2)) };
}
/* Zielangaben wie '4 × 10–20 Sek' fuer die Anzeige uebersetzen.

   Nicht in content.en.js gespiegelt, und zwar mit Absicht: parseTarget()
   erkennt Halteuebungen an 'Sek' (js/domain/target.js). Uebersetzte Ziele in
   den Daten wuerden die Satz- und Halteerkennung fuer alle 141 Stufen
   zerlegen. Sprachabhaengig sind ohnehin nur die zwei Einheitenwoerter –
   '×' und '–' sind neutral. Also nur beim Ausgeben ersetzen, waehrend
   parseTarget() weiterhin die deutsche Quelle bekommt. */
function zielText(target){
  return String(target == null ? '' : target)
    .replace(/\bSek\b/g, __('secShort'))
    .replace(/\bVersuche\b/g, __('attempts'));
}

/* Wochentagskuerzel in der Sprache der Oberflaeche, Montag zuerst. */
function wochentage(){
  const f = new Intl.DateTimeFormat(getLang(), { weekday: 'short' });
  /* 2024-01-01 war ein Montag. */
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/* Datum in der Sprache der Oberflaeche. Die Domaenenschicht kennt die
   aktuelle Sprache nicht, also wird sie hier hereingereicht. */
function fmtDate(iso){ return fmtDatePure(iso, getLang()); }

/* Sekunden als lesbare Dauer. Unter einer Stunde nur Minuten, darueber
   Stunden und Minuten – "78 Min" liest sich schlechter als "1 Std 18 Min".
   Aufgerundet auf die nächste Minute: eine Einheit von 40 Sekunden ist
   "1 Min" und nicht "0 Min". */
function dauerText(sek){
  const min = Math.max(1, Math.round(sek / 60));
  if(min < 60) return __('durationMin', { n: min });
  return __('durationHours', { h: Math.floor(min / 60), m: min % 60 });
}

function lvlOf(ex){ return Math.min(state.levels[ex.id] || 0, ex.levels.length - 1); }
function restFor(ex){ return (cfg('perExRest') && ex.rest) ? ex.rest : cfg('rest'); }

/* ================= Workout rendern ================= */
function selectDay(key){
  cancelHold(); stopRest();
  session = { ...leereSession(), dayKey: key };
  persistSession();
  /* Neue Einheit, neues Aufwaermen: die Haken der vorigen duerfen nicht
     stehen bleiben. */
  renderWarmup();
  renderDaySelect(); renderWorkout(); requestWakeLock();
}

function renderWorkout(){
  const day = getDay(session.dayKey);
  if(!day) return;
  const need = cfg('streak');
  let html = '';

  /* Was beim letzten Mal geschafft wurde. Die Zahlen liegen seit jeher in
     jedem Log-Eintrag (entry.reps) und wurden nirgends gelesen – man
     trainierte also ohne jede Sicht auf die vorige Einheit, obwohl die App
     sie mitschreibt. Einmal fuer den ganzen Tag ermittelt, nicht je Uebung. */
  /* Was heute wirklich drankommt: der Plan-Tag, durch die Ersetzungen dieser
     Einheit gereicht. session.subs bleibt dabei unangetastet – der Plan auch. */
  const heute = day.ex.map(origId => ({ origId, id: session.subs[origId] || origId }));
  const letzte = lastRepsByExercise(state.log, heute.map(h => h.id), getDay);

  heute.forEach(({ origId, id }) => {
    const ex = EX_BY_ID[id];
    if(!ex) return;

    if(session.skip[origId]){
      html += '<div class="ex ex--skipped" data-exid="' + ex.id + '">' +
        '<div class="ex-head"><div class="ex-name">' + esc(exName(ex)) + '</div></div>' +
        '<div class="ex-stage">' + esc(__('skippedToday')) + '</div>' +
        '<button class="tip-btn" data-action="exercise:unskip" data-ex="' + origId + '">↩ ' + __('undoSkip') + '</button>' +
        '</div>';
      return;
    }
    const lvl = lvlOf(ex), level = ex.levels[lvl], maxed = lvl >= ex.levels.length - 1;
    const t = parseTarget(level.target), streak = state.streaks[ex.id] || 0;

    let rungs = '';
    ex.levels.forEach((l, i) => {
      if(i > 0) rungs += '<div class="rung-line' + (i <= lvl ? ' done' : '') + '"></div>';
      /* title allein wird nicht zuverlaessig angesagt und auf Touch nie
         angezeigt – die Leiter transportierte ihren Zustand rein farblich. */
      rungs += '<div class="rung' + (i < lvl ? ' done' : (i === lvl ? ' current' : '')) + '" title="' + esc(exStage(ex, i)) + '" aria-hidden="true"></div>';
    });

    let dots = '';
    for(let s = 0; s < t.sets; s++){
      const repKey = ex.id + '-' + s;
      /* aria-pressed statt reiner Farbcodierung: der Erledigt-Zustand war
         nur ueber eine CSS-Klasse sichtbar und das Label statisch.

         Hier stand zusaetzlich aria-live="polite" fuer Halteuebungen, damit
         der Countdown ueberhaupt angesagt wird. Angesagt wurde damit aber
         JEDE einzelne Sekunde. Beginn und Ende meldet jetzt melde() ueber
         #srStatus, der Punkt selbst bleibt still. */
      dots += '<button class="set-dot" id="set-' + repKey + '"' +
        ' data-action="set:tap" data-ex="' + ex.id + '" data-set="' + s + '"' +
        ' aria-pressed="' + (session.sets[repKey] ? 'true' : 'false') + '"' +
        ' aria-label="' + esc(__('setAria', { ex: exName(ex), n: s + 1, total: t.sets })) + '">' + (s + 1) + '</button>';
      if(!t.isHold && t.maxReps){
        dots += '<input class="rep-input" id="rep-' + repKey + '" type="number" min="0" max="' + (t.maxReps + 10) + '"' +
          ' placeholder="' + (t.minReps + '-' + t.maxReps) + '"' +
          ' aria-label="' + esc(__('repsAria', { ex: exName(ex), n: s + 1 })) + '"' +
          ' value="' + (session.reps[repKey] ?? '') + '" data-action-input="set:reps" data-key="' + repKey + '">';
      }
    }

    let hint;
    if(maxed && streak >= need) hint = '<span class="streak-hint hot">' + esc(__('maxLevelReached')) + '</span>';
    else if(streak === need - 1 && streak > 0) hint = '<span class="streak-hint hot">' + esc(__('oneMoreToLevel', { n: streak, need })) + '</span>';
    else hint = '<span class="streak-hint">' + esc(__('towardsLevel', { n: streak, need })) + '</span>';

    const note = (state.notes || {})[ex.id];
    const pr = (state.prs || {})[ex.id];

    html += '<div class="ex" data-exid="' + ex.id + '">' +
      '<div class="ex-top"><span class="rung-label">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length +
        ' <span class="cat-chip">' + esc(catName(ex.cat, CATS[ex.cat].name)) + '</span></span>' +
        '<span class="lvl-adjust"><button data-action="level:adjust" data-ex="' + ex.id +
        '" data-delta="-1" title="' + esc(__('levelDown')) + '" aria-label="' + esc(__('levelDown')) + '">−</button>' +
        '<button data-action="level:adjust" data-ex="' + ex.id +
        '" data-delta="1" title="' + esc(__('levelUp')) + '" aria-label="' + esc(__('levelUp')) + '">+</button></span></div>' +
      '<div class="rungs" role="img" aria-label="' +
        esc(__('levelOfNamed', { n: lvl + 1, total: ex.levels.length, stage: exStage(ex, lvl) })) +
        '">' + rungs + '</div>' +
      '<div class="ex-head"><div class="ex-name">' + esc(exName(ex)) + '</div><div class="ex-target">' + esc(zielText(level.target)) + '</div></div>' +
      '<div class="ex-stage">' + esc(__('currentStage')) + ': <b>' + esc(exStage(ex, lvl)) + '</b></div>' +
      /* Nur ein Hinweis, keine Sperre – der Ersetzen-Knopf steht weiter
         unten in derselben Karte. Wer sein Gerät heute nicht dabei hat,
         soll die Übung sehen und selbst entscheiden. */
      (fehlt(ex, lvl).length
        ? '<div class="equip-warn">' + esc(__('needsEquip', { list: equipListe(fehlt(ex, lvl)) })) + '</div>'
        : '') +
      (pr ? '<div class="pr-line">' + esc(__('best')) + ': ' + esc(pr.v) + ' (' + fmtDate(pr.d) + ')</div>' : '') +
      (letzte[ex.id]
        ? '<div class="last-reps">' + esc(__('lastReps', {
          reps: letzte[ex.id].reps.join(' · '), date: fmtDate(letzte[ex.id].d)
        })) + '</div>'
        : '') +
      (note ? '<div class="last-note">' + esc(__('lastNote', { date: fmtDate(note.d), text: note.t })) + '</div>' : '') +
      '<div class="sets">' + dots + '</div>' +
      '<span class="hold-hint">' +
        (t.isHold ? esc(__('holdHint', { sec: t.holdSecs })) + ' · ' : '') +
        esc(__('restOf', { sec: restFor(ex) })) + '</span>' +
      '<label class="toplimit" id="top-' + ex.id + '"><input type="checkbox" data-action-change="set:top" data-ex="' + ex.id + '"><span>' + __('topLimit') + '</span></label>' +
      hint +
      '<textarea class="note-input" id="note-' + ex.id + '" rows="1"' +
        ' data-action-input="note:set" data-ex="' + ex.id + '"' +
        ' placeholder="' + esc(__('notePlaceholder')) + '">' +
        esc(session.notes[ex.id] || '') + '</textarea>' +
      '<button class="tip-btn" data-action="tips:toggle" data-ex="' + ex.id + '">' + __('tips') + '</button>' +
      '<ul class="tips" id="tips-' + ex.id + '">' + exTips(ex).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      /* Ersetzen und Auslassen greifen auf die PLAN-Zeile zu, nicht auf die
         gerade angezeigte Uebung – sonst liesse sich eine Ersetzung nicht
         zurueckdrehen. */
      '<button class="sub-btn" data-action="exercise:substitute" data-ex="' + origId + '">↻ ' + __('substitute') + '</button>' +
      '<button class="sub-btn" data-action="exercise:skip" data-ex="' + origId + '">⤳ ' + __('skipToday') + '</button>' +
      '<button class="tip-btn" data-action="exercise:history" data-ex="' + ex.id + '">📊 ' + __('perExercise') + '</button>' +
      '</div>';
  });

  document.getElementById('content').innerHTML = html;
  document.getElementById('finishBar').style.display = 'block';
  updateFinish();
}

/* Stellt nach einem Neuzeichnen des Trainings wieder her, was nicht im
   Markup steckt. Notizen brauchen das nicht mehr: sie stehen in
   session.notes und werden von renderWorkout() direkt ausgegeben – das
   fruehere snapshotNotes() ist damit ueberfluessig geworden. */
function restoreSession(reps){
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
  /* Gegen null pruefen, nicht gegen Falsy: 0 Wiederholungen sind eine
     gueltige Eingabe, die setRep() bewusst speichert. Sie verschwand hier
     und beim Rendern des Feldes bei jedem Neuzeichnen. */
  Object.keys(reps || {}).forEach(k => {
    const el = document.getElementById('rep-' + k);
    if(el && reps[k] != null) el.value = reps[k];
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
  if(session.dayKey){ cancelHold(); renderWorkout(); restoreSession(session.reps); }
  if(!document.getElementById('view-library').hidden) renderLibrary();
  toast(__('levelSetTo', { name: exName(ex), stage: exStage(ex, next) }));
}

/* ================= Substitute Exercise ================= */
/* origId ist die Uebung, wie sie im PLAN steht. Was gerade angezeigt wird,
   kann davon abweichen – dann liegt hier schon eine Ersetzung fuer heute. */
async function substituteExercise(origId){
  const id = session.subs[origId] || origId;
  const ex = EX_BY_ID[id]; if(!ex) return;
  /* Nur Alternativen, die mit der vorhandenen Ausruestung auch gehen. Genau
     dafuer ist dieser Knopf da: "ich stehe heute ohne Stange da" soll eine
     Liste liefern, aus der man ohne Nachdenken waehlen kann. */
  const sameCat = EXERCISES.filter(e => e.cat === ex.cat && e.id !== id && machbar(e));
  if(!sameCat.length){ toast(__('noAlternative')); return; }

  /* Frueher wurde die Liste in ein prompt() gerendert und der Nutzer musste
     eine Nummer eintippen. Jetzt eine anklickbare Auswahl mit der jeweils
     aktuellen Stufe als Zusatzinfo. */
  const gewaehlt = await askChoice(__('substituteFor', { name: exName(ex) }), sameCat.map(e => ({
    value: e.id,
    name: exName(e),
    sub: exStage(e, lvlOf(e)) + ' · ' + zielText(e.levels[lvlOf(e)].target)
  })));
  if(!gewaehlt) return;

  /* Frueher landete jede Ersetzung ueber ensureCustom() dauerhaft im Plan und
     zog den Nutzer von seiner Vorlage auf "Eigener Plan" – auch wenn er nur
     heute ohne Stange dastand. */
  const dauer = await askChoice(__('substituted', { name: exName(EX_BY_ID[gewaehlt]) }), [
    { name: __('subOnce'), sub: __('subOnceSub'), value: 'heute' },
    { name: __('subPermanent'), sub: __('subPermanentSub'), value: 'immer' }
  ]);
  if(!dauer) return;

  if(dauer === 'immer'){
    const p = ensureCustom();
    const day = p.days.find(d => d.key === session.dayKey);
    if(!day) return;
    const ei = day.ex.indexOf(origId);
    if(ei >= 0) day.ex[ei] = gewaehlt;
    delete session.subs[origId];
    save();
  } else {
    /* Ueber die Plan-ID abgelegt, nicht ueber die angezeigte: ein zweites
       Ersetzen derselben Zeile ueberschreibt die erste und bildet keine Kette.
       Zurueck zum Original heisst: gar kein Eintrag. */
    if(gewaehlt === origId) delete session.subs[origId];
    else session.subs[origId] = gewaehlt;
  }

  /* cancelHold() zuerst, wie in adjustLevel(): der Countdown haelt den alten
     DOM-Knoten fest und lief nach dem Neuzeichnen dagegen weiter – am Ende
     hakte er einen Satz ab, den es nicht mehr gab, und startete eine Pause. */
  cancelHold();
  vergissUebung(id);
  persistSession();
  renderWorkout(); restoreSession(session.reps);
  toast(__('substituted', { name: exName(EX_BY_ID[gewaehlt]) }));
}

/* Alles aus der laufenden Einheit entfernen, was zu EINER Uebung gehoert.

   Hier stand  session.sets = {}; session.top = {};  – die Schluessel sind aber
   nach Uebung benannt ("pushup-0"). Wer die vierte Uebung ersetzte, nachdem
   drei fertig waren, verlor damit ALLE Haken der Einheit, waehrend die
   Wiederholungsfelder gefuellt blieben, weil restoreSession() sie zurueckholt.
   reps und notes muessen mit weg, sonst tauchen sie wieder auf, falls dieselbe
   ID spaeter noch einmal im Tag steht. */
function vergissUebung(id){
  const zurUebung = k => k.slice(0, k.lastIndexOf('-')) === id;
  Object.keys(session.sets).forEach(k => { if(zurUebung(k)) delete session.sets[k]; });
  Object.keys(session.reps).forEach(k => { if(zurUebung(k)) delete session.reps[k]; });
  delete session.top[id];
  delete session.notes[id];
}

/* Heute auslassen – ohne den Plan anzufassen und ohne die Uebung zu
   verstecken: die Karte bleibt stehen und laesst sich zurueckholen. */
function skipExercise(origId){
  cancelHold();
  session.skip[origId] = true;
  vergissUebung(session.subs[origId] || origId);
  persistSession();
  renderWorkout(); restoreSession(session.reps);
  updateFinish();
}
function unskipExercise(origId){
  delete session.skip[origId];
  persistSession();
  renderWorkout(); restoreSession(session.reps);
  updateFinish();
}

/* ================= Per-Exercise History ================= */
function showExHistory(id){
  const ex = EX_BY_ID[id]; if(!ex) return;
  /* Der Eintrag selbst weiss seit v6, welche Uebungen trainiert wurden. Der
     Plan-Tag dient nur noch als Rueckfall fuer Altbestaende – vorher war er
     die einzige Quelle, und damit war diese Liste nach jeder Ersetzung, jedem
     Plan-Reset und jedem CSV-Import falsch. */
  const logEntries = (state.log || [])
    .filter(l => entryHasExercise(l, id, getDay(l.day)))
    .slice(-15).reverse();
  /* role/aria-modal fehlten hier komplett – anders als beim statischen
     Einstellungsdialog wurde dieses Overlay als gewoehnliches div angesagt. */
  let html = '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(__('exerciseHistory', { name: exName(ex) })) + '"' +
    ' style="max-width:400px;padding:16px"><div class="modal-head">' +
    esc(__('exerciseHistory', { name: exName(ex) })) +
    '<button data-action="exHistory:close" aria-label="' + esc(__('close')) + '">✕</button></div>';
  if(!logEntries.length) html += '<div class="muted">' + esc(__('noLogs')) + '</div>';
  else {
    html += topsatzKurve(logEntries, id);
    /* Spalte hiess "Level", zeigte aber die Zahl der Level-Ups dieser Einheit.
       Titel angepasst statt Inhalt geaendert – die Angabe ist die nuetzlichere. */
    /* Die Wiederholungsspalte ist die einzige Angabe hier, die sich wirklich
       auf DIESE Uebung bezieht – Saetze und Top zaehlen die ganze Einheit. */
    html += '<table style="width:100%;font-size:13px"><tr><th>' + esc(__('colDate')) + '</th><th>' +
      esc(__('colReps')) + '</th><th>' +
      esc(__('colSets')) + '</th><th>' + esc(__('colTop')) + '</th><th>' + esc(__('colLevelUp')) + '</th></tr>';
    logEntries.forEach(l => {
      html += '<tr><td>' + fmtDate(l.d) + '</td><td>' + esc(repsOf(l, id).join(' · ')) + '</td><td>' +
        l.sets + '</td><td>' + (l.tops ? '✓' : '') + '</td><td>' +
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
/* Der beste Satz je Einheit als Kurve, in zeitlicher Reihenfolge – die
   Tabelle darunter ist umgekehrt sortiert.

   Der Verlauf je Uebung war eine reine Zahlentabelle. Ob es aufwaerts geht,
   ist der Grund, ueberhaupt hineinzuschauen, und genau das liest man aus
   fuenfzehn Zeilen schlechter ab als aus einer Linie.

   aria-hidden wie bei den Messwerten: dieselben Zahlen stehen direkt
   darunter in der Tabelle und wuerden sonst zweimal vorgelesen. Bei
   Halteuebungen sind es Sekunden statt Wiederholungen – die Kurve zeigt
   beides, gerade weil sie unbeschriftet bleibt. */
function topsatzKurve(logEntries, id){
  const werte = [...logEntries].reverse()
    .map(l => repsOf(l, id))
    .filter(r => r.length)
    .map(r => Math.max(...r));
  if(werte.length < 2) return '';

  const min = Math.min(...werte), max = Math.max(...werte);
  /* Immer derselbe Wert: eine Linie auf halber Hoehe statt einer Division
     durch null. Am Boden saehe sie nach dem schlechtesten Ergebnis aus. */
  const y = v => max === min ? 35 : 66 - (v - min) / (max - min) * 62;
  const pts = werte.map((v, i) =>
    (i / (werte.length - 1) * 296 + 2).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');

  return '<svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

function closeExHistory(){
  const o = document.getElementById('exHistoryOverlay');
  if(o) closeDialog(o);
}

/* ================= Satz-Interaktion ================= */
function tapSet(id, s){
  const ex = EX_BY_ID[id]; if(!ex) return;   /* wie in allen Nachbarfunktionen */
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
    zeitNehmen();
    el.classList.add('running');
    holdTimer = { key, el, id, s, ex, ende: Date.now() + t.holdSecs * 1000, interval: null };
    haltenAnzeigen();
    holdTimer.interval = setInterval(haltenAnzeigen, TAKT);
    melde(__('holdStarted', { sec: t.holdSecs }));
  } else {
    markDone(key, el, s, ex);
  }
}

/* Zeigt die Restzeit der Haltezeit an und schliesst den Satz ab, sobald der
   Zielzeitpunkt erreicht ist.

   Bewusst so: ist der Zeitpunkt waehrend eines App-Wechsels verstrichen,
   gilt die Haltezeit als geschafft. Die Uhr lief weiter, und ein Tipp auf
   den Punkt bricht jederzeit ab. Das ist KEIN Fehler – bitte nicht in ein
   Weiterzaehlen ab dem eingefrorenen Stand zurueckbauen. */
function haltenAnzeigen(){
  if(!holdTimer) return;
  const rem = Math.ceil((holdTimer.ende - Date.now()) / 1000);
  if(rem > 0){
    if(holdTimer.el.textContent !== String(rem)) holdTimer.el.textContent = rem;
    return;
  }
  const { key, el, s, ex } = holdTimer;
  clearInterval(holdTimer.interval);
  holdTimer = null;
  el.classList.remove('running');
  markDone(key, el, s, ex);
  signal(true);
  melde(__('holdOver'));
}

/* Startpunkt der Trainingszeit. Genommen wird der erste Satz – bei
   Halteuebungen sein Beginn, nicht sein Ende, sonst fehlte die Haltezeit
   selbst. Danach steht der Wert fest; ein abgewaehlter Haken macht ihn
   nicht rueckgaengig. */
function zeitNehmen(){
  if(!session.start) session.start = Date.now();
}

/* Die bisherige Dauer der laufenden Einheit in Sekunden, oder 0. Prueft
   dieselbe Obergrenze wie die Migration: eine ueber Nacht offen gebliebene
   Einheit hat keine brauchbare Dauer, und eine erfundene waere schlechter
   als gar keine. */
function dauerJetzt(){
  if(!session.start) return 0;
  const s = Math.round((Date.now() - session.start) / 1000);
  return (s > 0 && s <= MAX_WORKOUT_SECS) ? s : 0;
}

function markDone(key, el, s, ex){
  zeitNehmen();
  session.sets[key] = true;
  el.classList.add('done'); el.setAttribute('aria-pressed', 'true'); el.textContent = s + 1;
  /* Die Pause vor dem Speichern starten, damit ihr Zielzeitpunkt im selben
     Schreibvorgang mitgeht statt einen zweiten zu erzwingen. */
  if(cfg('autoRest')) startRest(restFor(ex));
  updateFinish(); persistSession();
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
  /* Durch die Ersetzungen dieser Einheit gereicht, Ausgelassenes heraus. Ohne
     das stuende im Log die Uebung, die gerade NICHT gemacht wurde, und die
     Progression am Ende von finishWorkout() liefe auf die falsche Leiter. */
  if(day) return day.ex.filter(id => !session.skip[id]).map(id => session.subs[id] || id);
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

/* ================= Pausen-Timer =================
   Wie die Haltezeit an einem absoluten Zielzeitpunkt haengend. Der Tick
   zeichnet nur noch, er zaehlt nicht mehr. */
function startRest(secs){
  restBis(Date.now() + (secs || cfg('rest')) * 1000);
}
function restBis(ende){
  stopRest();
  restEnde = ende;
  pauseAnzeigen();
  if(!restEnde) return;
  restTimer = setInterval(pauseAnzeigen, TAKT);
  /* Der Chip erscheint sichtbar; ohne Ansage bliebe der Beginn der Pause
     fuer einen Screenreader unbemerkt. Das Ende meldet ohnehin ein Toast. */
  melde(__('restStarted', { sec: Math.ceil((restEnde - Date.now()) / 1000) }));
}
function pauseAnzeigen(){
  const rem = Math.ceil((restEnde - Date.now()) / 1000);
  if(rem <= 0){
    stopRest();
    persistSession();
    signal(false); toast(__('restOver'));
    return;
  }
  /* Drei kurze Toene vor dem Ende. Der Tick laeuft viermal pro Sekunde,
     deshalb die Merkvariable – sonst piepste es bei jedem Durchlauf. */
  if(rem <= 3 && rem !== restLetzteSek){
    restLetzteSek = rem;
    tick();
  }

  const out = document.getElementById('restTime');
  const txt = Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0');
  if(out.textContent !== txt) out.textContent = txt;
  document.getElementById('restChip').style.display = 'flex';
}
function stopRest(){
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
  restEnde = 0;
  restLetzteSek = 0;
  document.getElementById('restChip').style.display = 'none';
}

/* Pause verlaengern. Ein Satz, der schlecht lief, braucht mehr Zeit – der
   Chip konnte die Pause bisher nur abbrechen. Laeuft gerade keine, faengt
   die Verlaengerung bei jetzt an, damit die Schaltflaeche nie ins Leere tippt. */
function restVerlaengern(sek){
  const basis = restEnde > Date.now() ? restEnde : Date.now();
  restBis(basis + sek * 1000);
  persistSession();
}

/* Nach der Rueckkehr aus dem Hintergrund stimmen beide Anzeigen sofort, und
   ein waehrenddessen verstrichener Zielzeitpunkt wird jetzt abgearbeitet –
   nicht erst nach so vielen gedrosselten Ticks, wie er zurueckliegt. */
function zeitgeberAbgleichen(){
  if(holdTimer) haltenAnzeigen();
  if(restTimer) pauseAnzeigen();
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

/* Kurzer, leiser Ton fuer die letzten drei Sekunden der Pause. Bewusst nicht
   signal(): das ist das Ende-Signal und deutlich lauter. Bisher kam ueber-
   haupt erst bei null ein Ton – wer nicht hinsah, verpasste den Einstieg. */
function tick(){
  if(!cfg('sound')) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 660; o.connect(g); g.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime;
    g.gain.setValueAtTime(.001, t0);
    g.gain.exponentialRampToValueAtTime(.08, t0 + .01);
    g.gain.exponentialRampToValueAtTime(.001, t0 + .09);
    o.start(t0); o.stop(t0 + .1);
  }catch{ /* Web Audio blockiert oder nicht verfuegbar */ }
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

/* Der Pflichtpunkt der Aufwaermliste – die Handgelenksvorbereitung – war
   bisher nur rot eingefaerbt und hatte keinerlei Wirkung.

   Gefragt wird NUR, wenn ueberhaupt etwas abgehakt wurde. Wer die Liste gar
   nicht benutzt, hat sich damit nicht gegen das Aufwaermen entschieden – die
   App weiss darueber nichts und haette kein Recht, ihn bei jedem Abschluss
   zu ermahnen. Wer sie benutzt und ausgerechnet den Pflichtpunkt auslaesst,
   hat ihn vermutlich uebersehen.

   Bei einer selbst zusammengestellten Liste entfaellt die Pruefung, wie
   schon die Hervorhebung in renderWarmup(): die Zuordnung ueber den Index
   traegt dort nicht mehr. */
async function warmupGeprueft(){
  if(state.warmupCustom) return true;
  if(!Object.keys(session.warm).length) return true;
  const offen = [...WARMUP_PFLICHT].filter(i => i < WARMUP.length && !session.warm[i]);
  if(!offen.length) return true;
  return askConfirm(
    __('warmupMissingTitle'),
    __('warmupMissingBody', { list: offen.map(i => warmupText(i, WARMUP[i])).join(', ') }),
    __('finishAnyway'));
}

/* ================= Training abschließen mit Undo ================= */
async function finishWorkout(){
  /* Erst pruefen, dann abraeumen: cancelHold(), stopRest() und die Freigabe
     des Wake Locks standen frueher hier oben. Wer die Rueckfrage unten
     abbricht, stuende sonst mit abgebrochener Haltezeit und beendeter Pause
     wieder in einer Einheit, die weitergehen soll. */
  const exIds = sessionExerciseIds();
  if(!exIds.length){ toast(__('nothingToSave')); return; }
  if(!await warmupGeprueft()) return;

  cancelHold(); stopRest(); releaseWakeLock();
  const need = cfg('streak');
  const ups = [];
  /* Aufstiege, die an fehlendem Geraet haengen – sie werden am Ende gemeldet,
     sonst bliebe die Stufe ohne jede Erklaerung stehen. */
  const gesperrt = [];
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
    /* lvlOf() statt roher Zugriff: der gespeicherte Wert kann ueber der
       Stufenleiter liegen (importiertes Backup, gekuerzte Leiter nach einem
       Inhalts-Update). Unten greift ex.levels[lvl].target darauf zu und warf
       dann mitten in dieser Schleife – also nachdem streaks und levels
       bereits geschrieben waren und bevor save() lief. */
    const lvl = lvlOf(ex);
    const maxed = lvl >= ex.levels.length - 1;
    /* In der Entlastungswoche zaehlt das obere Limit nicht: es bezieht sich
       auf halbierte Saetze und ist damit nicht dasselbe wie sonst. Der Streak
       bleibt stehen statt zu wachsen oder genullt zu werden – die Woche soll
       die Progression weder beschleunigen noch bestrafen. Notizen und
       Bestleistungen weiter unten sind davon nicht betroffen. */
    if(deloadAktiv()){
      if(session.top[id]) tops++;
    } else if(session.top[id]){
      tops++;
      state.streaks[id] = (state.streaks[id] || 0) + 1;
      if(!maxed && state.streaks[id] >= need){
        /* Die naechste Stufe kann ein Geraet verlangen, das nicht da ist –
           bei Dips wechselt sie von der Bank auf die Parallettes. Ein
           Aufstieg dorthin waere kein Fortschritt, sondern eine Uebung, die
           sich nicht mehr ausfuehren laesst.

           Der Streak wird gedeckelt statt genullt: sobald das Geraet
           dazukommt, steigt die Stufe beim naechsten Abschluss sofort. */
        if(!stufeMachbar(ex, lvl + 1)){
          state.streaks[id] = need;
          gesperrt.push({ name: exName(ex), fehlt: fehlt(ex, lvl + 1) });
        } else {
          state.levels[id] = lvl + 1; state.streaks[id] = 0;
          ups.push(exName(ex) + ' → ' + exStage(ex, lvl + 1));
        }
      }
    } else state.streaks[id] = 0;

    const notiz = (session.notes[id] || '').trim();
    if(notiz) state.notes[id] = { t: notiz.slice(0, 160), d: today() };

    /* Bestleistung aus den Wiederholungen der Einheit. Quelle ist
       session.reps und nicht mehr das Eingabefeld: der Zustand ueberlebt ein
       Neuzeichnen, das Feld nicht. */
    const t = parseTarget(ex.levels[lvl].target);
    if(!t.isHold && t.maxReps){
      for(let s = 0; s < t.sets; s++){
        const v = session.reps[id + '-' + s];
        /* art und lvl gehoeren dazu: ohne sie vergleicht besserePR()
           Sekunden mit Wiederholungen. Sieben Leitern wechseln unterwegs
           die Masseinheit. */
        const kandidat = { v: v + ' ' + __('reps'), n: v, d: today(), art: 'reps', lvl };
        if(v && besserePR(state.prs[id], kandidat)) state.prs[id] = kandidat;
      }
    } else if(t.isHold && t.holdSecs){
      /* Halteuebungen bekamen nie automatisch eine Bestleistung: die Schleife
         darueber lief nur fuer Wiederholungen. Fuer einen Front Lever musste
         man sie also in der Bibliothek von Hand eintippen, obwohl die App die
         Sekunden kennt – ein abgeschlossener Satz IST die gehaltene Zeit.
         Es genuegt ein geschaffter Satz; die weiteren aendern die Zeit nicht. */
      const geschafft = Array.from({ length: t.sets }, (_, s) => session.sets[id + '-' + s]).some(Boolean);
      const kandidat = {
        v: t.holdSecs + ' ' + __('secShort'), n: t.holdSecs, d: today(), art: 'sek', lvl
      };
      if(geschafft && besserePR(state.prs[id], kandidat)) state.prs[id] = kandidat;
    }
  });

  const sets = Object.values(session.sets).filter(Boolean).length;
  const now = today();
  /* ex: die tatsaechlich trainierten Uebungen. Ohne dieses Feld liess sich
     nur im heutigen Plan nachschlagen, welche Uebungen zu einer Einheit
     gehoerten – nach einer Ersetzung oder einem Plan-Reset also falsch. */
  const entry = {
    d: now, day: session.dayKey, ex: [...exIds], sets, tops, ups,
    reps: { ...session.reps }, dauer: dauerJetzt()
  };

  lastWorkoutSnapshot.entry = entry;

  state.workouts = (state.workouts || 0) + 1;
  state.byDay[session.dayKey] = (state.byDay[session.dayKey] || 0) + 1;
  state.lastDate = now;

  state.log.push(entry);
  if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);

  /* clearSession() VOR save(): es nullt state.activeSession nur im
     Arbeitsspeicher, und danach folgte kein weiterer Schreibvorgang. Im
     Speicher blieb also die gerade abgeschlossene Einheit stehen, und ein
     Neuladen am selben Tag holte sie mit allen Haken zurueck ("Einheit
     wiederhergestellt") – ein zweites "Fertig" schrieb sie ein zweites Mal
     ins Log. importJSON() und resetAll() hatten die Reihenfolge schon. */
  clearSession();
  await save();

  document.getElementById('finishBar').style.display = 'none';
  renderAll();

  if(ups.length){ signal(true); toast(__('levelUpToast', { list: ups.join(' · ') }), true); }
  else toast(__('workoutSaved', { n: state.workouts }));

  /* Nach dem eigentlichen Ergebnis, nicht statt seiner: der Abschluss soll
     zuerst den Erfolg melden. Verzoegert, damit der erste Toast lesbar bleibt. */
  if(gesperrt.length){
    const g = gesperrt[0];
    setTimeout(() => toast(__('levelBlockedByEquip', {
      name: g.name, list: equipListe(g.fehlt)
    }), true), 2600);
  }

  /* Ein Meilenstein, dessen Bedingung jetzt erfuellt ist. Nur ein Hinweis –
     abgehakt wird im Ziele-Tab, und zwar von Hand. Nur der erste, sonst
     stapeln sich nach dem Einstieg drei Toaste uebereinander. */
  const neuErkannt = erkannteMs();
  if(neuErkannt.length){
    const m = MILESTONES.find(x => x.id === neuErkannt[0]);
    if(m) setTimeout(() => toast(__('msDetectedToast', { name: msName(m) }), true),
      gesperrt.length ? 5200 : 2600);
  }

  /* Offer undo for 5 seconds */
  clearTimeout(undoTimeout);
  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  undoBtn.textContent = '↩ ' + __('undo');
  undoBtn.dataset.action = 'workout:undo';
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
  clearTimeout(undoTimeout);
  lastWorkoutSnapshot = null;
  document.querySelector('.undo-btn')?.remove();

  /* Die Einheit zurueckholen statt sie wegzuwerfen. Der Snapshot enthaelt
     sie seit jeher – gelesen wurde das Feld nie, stattdessen lief hier ein
     clearSession(). Wer versehentlich "Fertig" tippte, verlor damit jeden
     Haken, jede Wiederholung und jede Notiz und musste die ganze Einheit von
     Hand neu eintragen. Genau das soll "Rueckgaengig" verhindern. */
  if(snap.session && snap.session.dayKey){
    session = snap.session;
    persistSession();
    renderAll();                   /* kehrt vor dem Leeren von #content zurueck */
    renderWorkout(); restoreSession(session.reps);
  } else {
    clearSession();
    save();
    document.getElementById('finishBar').style.display = 'none';
    renderAll();
  }
  toast(__('undoWorkout'));
}

/* Wie sich die Wiederholungen der letzten Woche auf die Kategorien verteilen.

   Ein Streifen mit Zahlen daneben, kein reines Farbdiagramm: die Aufteilung
   ist die eigentliche Aussage ("zu viel Drücken, zu wenig Ziehen") und muss
   auch dann ankommen, wenn die Farben nicht unterscheidbar sind. */
function renderVolSplit(woche, monat = false){
  const el = document.getElementById('volSplit');
  if(!el) return;
  const jeKat = (woche && woche.jeKat) || {};
  const summe = Object.values(jeKat).reduce((a, b) => a + b, 0);
  if(!summe){ el.innerHTML = ''; return; }

  const teile = Object.keys(CATS).filter(k => jeKat[k] > 0);
  el.innerHTML = '<div class="vol-legend">' + esc(__(monat ? 'volumeSplitMonth' : 'volumeSplit')) + '</div>' +
    '<div class="vol-split" role="img" aria-label="' + esc(__('volumeSplitAria', {
      data: teile.map(k => catName(k, CATS[k].name) + ' ' + jeKat[k]).join(', ')
    })) + '">' +
    teile.map(k => '<span class="vol-part vol-' + k + '" style="flex:' + jeKat[k] + '"></span>').join('') +
    '</div>' +
    '<div class="vol-keys" aria-hidden="true">' + teile.map(k =>
      '<span><i class="vol-' + k + '"></i>' + esc(catName(k, CATS[k].name)) + ' ' + jeKat[k] + '</span>').join('') +
    '</div>';
}

/* ================= Verlauf ================= */
/* '2026-KW31' -> 'KW31' bzw. 'W31'. Der Schluessel bleibt deutsch, weil er
   in Diagrammen und CSV als Gruppierung dient; nur die Achse wird uebersetzt. */
function weekLabel(w){ return __('weekShort') + w.split('-')[1].replace('KW', ''); }

/* '2026-07-14' -> '2026-07'. Gegenstueck zu isoWeek() fuer lange Zeitraeume. */
const isoMonat = iso => /^\d{4}-\d{2}/.test(String(iso)) ? String(iso).slice(0, 7) : '';
function monatLabel(m){
  const [j, mo] = m.split('-').map(Number);
  return new Date(j, mo - 1, 1).toLocaleDateString(getLang(), { month: 'short', year: '2-digit' });
}
const spaltenLabel = k => k.includes('KW') ? weekLabel(k) : monatLabel(k);

/* Der gezeigte Zeitraum.

   Die Diagramme standen fest auf den letzten acht Wochen, die Liste auf den
   letzten 25 Eintraegen. Nach einem Jahr Training war damit genau die Sicht
   unerreichbar, fuer die man ein Jahr lang mitschreibt – die Daten lagen
   vollstaendig im Speicher und liessen sich nur nicht ansehen.

   Ab einem Jahr wird nach Monaten gruppiert: drei Jahre waeren sonst ueber
   150 Balken auf der Breite eines Handys. */
const HIST_RANGES = {
  '8w':  { spalten: 8,        monatlich: false },
  '26w': { spalten: 26,       monatlich: false },
  '12m': { spalten: 12,       monatlich: true },
  all:   { spalten: Infinity, monatlich: true }
};
/* Obergrenze der Liste. Anders als die frueheren 25 ist sie keine stille
   Kappung: wird sie erreicht, sagt eine Zeile darunter, wie viele Eintraege
   der Zeitraum insgesamt hat. */
const LOG_MAX_ZEILEN = 100;
let histRange = '8w';
const histBereich = () => HIST_RANGES[histRange] || HIST_RANGES['8w'];
const histMonatlich = () => histBereich().monatlich;
const histSpalten = () => histBereich().spalten;
function setHistRange(v){
  histRange = HIST_RANGES[v] ? v : '8w';
  renderHistory();
}

function renderHistory(){
  /* Week chart */
  const gruppe = histMonatlich() ? isoMonat : isoWeek;
  const byWeek = {};
  (state.log || []).forEach(l => {
    const k = gruppe(l.d);
    if(k) byWeek[k] = (byWeek[k] || 0) + 1;
  });
  /* Volumen sind jetzt die Wiederholungen, nicht die Haekchen: 4 × 5 und
     4 × 15 sahen im alten Diagramm gleich aus. */
  const volWeek = volumenJeGruppe(state.log || [], EX_BY_ID, gruppe);
  const weeks = Object.keys(byWeek).sort().slice(-histSpalten());
  const goal = histMonatlich() ? cfg('weekGoal') * 4 : cfg('weekGoal');

  const wc = document.getElementById('weekChart');
  if(!weeks.length){
    wc.innerHTML = '<div class="empty-hint" style="width:100%">' + esc(__('noHistory') + __('noHistoryHint')) + '</div>';
    document.getElementById('weekLegend').textContent = '';
    document.getElementById('volChart').innerHTML = '';
    renderVolSplit(null);
  } else {
    /* Die Diagramme sind div-Stapel ohne Textalternative: die Zielerreichung
       steckte allein in der Balkenfarbe. Jeder Balken bekommt daher ein
       sprechendes Label, das Diagramm selbst eine Rolle und Beschriftung. */
    const monat = histMonatlich();
    const max = Math.max(goal, ...weeks.map(w => byWeek[w]));
    wc.setAttribute('role', 'img');
    wc.setAttribute('aria-label', __('chartWorkoutsAria', {
      range: monat
        ? (weeks.length === 1 ? __('lastMonthSingular') : __('lastMonthsPlural', { n: weeks.length }))
        : (weeks.length === 1 ? __('lastWeekSingular') : __('lastWeeksPlural', { n: weeks.length })),
      data: weeks.map(w => spaltenLabel(w) + ' ' + byWeek[w] + (byWeek[w] >= goal ? __('goalMet') : '')).join(', ')
    }));
    wc.innerHTML = weeks.map(w => {
      const n = byWeek[w];
      return '<div class="bar-col" aria-hidden="true"><span class="bar-num">' + n + '</span>' +
        '<div class="bar' + (n >= goal ? ' goal-met' : '') + '" style="height:' + Math.round(n / max * 100) + '%"></div>' +
        '<span class="bar-lbl">' + esc(spaltenLabel(w)) + '</span></div>';
    }).join('');
    /* Bei Monaten ist das Wochenziel hochgerechnet – sonst waere jeder
       Balken gruen und die Farbe saegte nichts mehr aus. */
    document.getElementById('weekLegend').textContent =
      __(monat ? 'monthLegend' : 'weekLegend', { n: goal });

    const reps = w => (volWeek[w] || {}).reps || 0;
    const vmax = Math.max(...weeks.map(reps), 1);
    const vc = document.getElementById('volChart');
    vc.setAttribute('role', 'img');
    vc.setAttribute('aria-label', __('chartVolumeAria', {
      data: weeks.map(w => spaltenLabel(w) + ' ' + reps(w)).join(', ')
    }));
    vc.innerHTML = weeks.map(w =>
      '<div class="bar-col" aria-hidden="true"><span class="bar-num">' + reps(w) + '</span>' +
      '<div class="bar" style="height:' + Math.round(reps(w) / vmax * 100) + '%"></div>' +
      '<span class="bar-lbl">' + esc(spaltenLabel(w)) + '</span></div>').join('');

    renderVolSplit(volWeek[weeks[weeks.length - 1]], monat);
  }

  renderWeight();
  renderMeasurements();

  const list = document.getElementById('logList');
  /* Mit dem echten Index, nicht dem der Ansicht: geloescht wird in state.log,
     angezeigt wird eine gefilterte und umgekehrte Auswahl. */
  const abGruppe = weeks.length ? weeks[0] : null;
  const imZeitraum = (state.log || []).map((l, i) => ({ l, i }))
    /* Dieselbe Grenze wie im Diagramm: was oben zu sehen ist, steht auch
       unten. Frueher zeigte die Liste 25 Eintraege, egal welcher Zeitraum. */
    .filter(({ l }) => !abGruppe || gruppe(l.d) >= abGruppe);
  const log = imZeitraum.slice(-LOG_MAX_ZEILEN).reverse();
  list.innerHTML = log.length ? log.map(({ l, i }) => {
    const d = getDay(l.day);
    return '<div class="log-item"><span class="log-date">' + fmtDate(l.d) + '</span>' +
      '<span class="log-day">' + esc(l.day) + (d ? ' · ' + esc(dayTitleOf(d)) : '') + '</span>' +
      /* Die Dauer nur, wenn sie gemessen wurde: Eintraege von vor v9, CSV-
         Importe und nachgetragene Einheiten haben keine, und "0 Min" waere
         eine Behauptung. */
      '<span class="muted">' + l.sets + ' ' + __('sets') + ' · ' + l.tops + '× Top' +
        (l.dauer ? ' · ' + esc(dauerText(l.dauer)) : '') + '</span>' +
      '<span class="log-ups">' + (l.ups && l.ups.length ? '▲' + l.ups.length : '') + '</span>' +
      '<button class="mini-btn danger" data-action="log:remove" data-i="' + i + '"' +
      ' aria-label="' + esc(__('logRemoveAria', { date: fmtDate(l.d), day: l.day })) + '">✕</button></div>';
  }).join('') : '<div class="empty-hint">' + __('noLogs') + '</div>';

  renderLogSummary(imZeitraum.length, log.length);

  /* Calendar view */
  renderCalendar();
}

/* Die durchschnittliche Trainingsdauer.

   Gemittelt wird nur ueber Einheiten, die eine Dauer tragen – die anderen
   sind nicht "0 Minuten lang", sondern ungemessen, und sie einzurechnen
   wuerde den Schnitt mit jedem alten Eintrag nach unten ziehen. Deshalb
   steht auch dabei, aus wie vielen Einheiten er stammt. */
function renderLogSummary(imZeitraum = 0, gezeigt = 0){
  const el = document.getElementById('logSummary');
  if(!el) return;
  const teile = [];
  const dauern = (state.log || []).map(l => l.dauer).filter(d => d > 0);
  if(dauern.length){
    const schnitt = Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length);
    teile.push(__('avgDuration', { v: dauerText(schnitt), n: dauern.length }));
  }
  /* Keine stille Kappung: wer 300 Einheiten im Zeitraum hat, soll nicht
     glauben, es waeren 100. */
  if(gezeigt < imZeitraum) teile.push(__('logShowing', { n: gezeigt, gesamt: imZeitraum }));
  el.textContent = teile.join(' ');
  el.hidden = !teile.length;
}

/* ================= Eine Einheit nachtragen =================
   Der Verlauf konnte Eintraege nur loeschen. Wer ohne Handy trainiert hat,
   bekam die Einheit nur ueber eine von Hand gebaute CSV wieder hinein, und
   ein falsches Datum liess sich gar nicht korrigieren – nur loeschen und
   neu anlegen, was ebenfalls nicht ging.

   Bewusst schmal: Datum, Trainingstag, Satzzahl. Stufen, Serien und
   Bestleistungen bleiben unberuehrt, wie schon beim Loeschen – aus einer
   nachgetragenen Satzzahl laesst sich nicht ableiten, was an dem Tag am
   oberen Limit lag. Der Dialog sagt das. */
function geplanteSaetze(key){
  const day = getDay(key);
  if(!day) return 0;
  return day.ex.reduce((summe, id) => {
    const ex = EX_BY_ID[id];
    return ex ? summe + parseTarget(ex.levels[lvlOf(ex)].target).sets : summe;
  }, 0);
}

function askLogEntry(){
  const tage = getDays();
  return askDialog((modal, finish) => {
    const titel = __('addLogEntry');
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(__('addLogEntryBody')) + '</p>' +
      '<div class="set-row"><span><label class="lbl2" for="le-datum">' + esc(__('logDate')) + '</label></span>' +
        '<input type="date" id="le-datum" max="' + today() + '" value="' + today() + '"></div>' +
      '<div class="set-row"><span><label class="lbl2" for="le-tag">' + esc(__('logDay')) + '</label></span>' +
        '<select id="le-tag">' + tage.map(d =>
          '<option value="' + esc(d.key) + '">' + esc(d.key + ' · ' + dayTitleOf(d)) + '</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="le-saetze">' + esc(__('logSets')) + '</label></span>' +
        '<input type="number" id="le-saetze" min="1" max="99" inputmode="numeric"></div>' +
      dialogFuss(__('save'));

    const datum = modal.querySelector('#le-datum');
    const tag = modal.querySelector('#le-tag');
    const saetze = modal.querySelector('#le-saetze');
    /* Vorbelegt mit dem, was der Plan fuer diesen Tag vorsieht – in aller
       Regel ist genau das die Antwort, und der Rest ist ein Tippen. */
    const vorbelegen = () => { saetze.value = String(geplanteSaetze(tag.value) || 1); };
    tag.onchange = vorbelegen;
    vorbelegen();

    modal.querySelector('[data-dlg=ok]').onclick = () => finish({
      d: datum.value, day: tag.value, sets: parseInt(saetze.value, 10)
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

async function addLogEntry(){
  if(!getDays().length){ toast(__('noPlanDays')); return; }
  const eingabe = await askLogEntry();
  if(!eingabe) return;

  /* Ein leeres Datumsfeld liefert '' – und ein Datum in der Zukunft laesst
     sich trotz max-Attribut eintippen. */
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.d) || eingabe.d > today()){
    toast(__('logDateInvalid')); return;
  }
  const day = getDay(eingabe.day);
  if(!day) return;
  const sets = Math.min(99, Math.max(1, Number.isFinite(eingabe.sets) ? eingabe.sets : 1));

  const doppelt = (state.log || []).some(l => l.d === eingabe.d && l.day === eingabe.day);
  if(doppelt && !await askConfirm(__('logDuplicateTitle'),
    __('logDuplicateBody', { date: fmtDate(eingabe.d), day: eingabe.day }), __('save'))) return;

  /* ex aus dem Plan: eine Vermutung, aber die bestmoegliche. Ohne sie waere
     der Eintrag fuer "zuletzt trainiert" und die Uebungshistorie unsichtbar,
     und der Rueckfall in domain/log.js kaeme spaeter zum selben Ergebnis –
     nur dann anhand des DANN gueltigen Plans. Lieber jetzt festhalten.
     dauer bleibt 0: nachgetragen heisst nicht gemessen. */
  const entry = {
    d: eingabe.d, day: eingabe.day, ex: [...day.ex],
    sets, tops: 0, ups: [], reps: {}, dauer: 0
  };
  state.log.push(entry);
  /* Nach Datum einsortieren wie beim CSV-Import: der Verlauf zeigt die
     letzten Eintraege ueber die Position in der Liste. */
  state.log.sort((a, b) => a.d.localeCompare(b.d));
  if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);

  state.workouts = (state.workouts || 0) + 1;
  state.byDay[eingabe.day] = (state.byDay[eingabe.day] || 0) + 1;
  /* Das groesste Datum, nicht das neueste Element – nachgetragen wird meist
     rueckwaerts. */
  state.lastDate = state.log.reduce((a, e) => (!a || e.d > a) ? e.d : a, null);

  await save();
  renderAll(); renderHistory();
  toast(__('logAdded', { date: fmtDate(eingabe.d) }));
}

/* Einen einzelnen Eintrag entfernen.

   Das Undo nach "Fertig" lebt fuenf Sekunden; danach war ein Fehleintrag nur
   noch ueber ein von Hand bearbeitetes JSON-Backup loszuwerden.

   Zurueckgerechnet werden Zaehler, Tagesstatistik und das Datum der letzten
   Einheit. Stufen, Serien und Bestleistungen bleiben, wie sie sind: aus einem
   Log-Eintrag laesst sich nicht ableiten, welcher Stand vor ihm galt. Der
   Bestaetigungsdialog sagt das ausdruecklich. */
async function removeLogEntry(i){
  const l = (state.log || [])[i];
  if(!l) return;
  const ok = await askConfirm(__('logRemoveTitle'),
    __('logRemoveBody', { date: fmtDate(l.d), day: l.day }), __('remove'), true);
  if(!ok) return;

  state.log.splice(i, 1);
  state.workouts = Math.max(0, (state.workouts || 0) - 1);
  if(state.byDay && state.byDay[l.day]) state.byDay[l.day] = Math.max(0, state.byDay[l.day] - 1);
  /* Das groesste verbliebene Datum, nicht das letzte Element: ein CSV-Import
     kann aeltere Eintraege hinten angehaengt haben. */
  state.lastDate = state.log.reduce((a, e) => (!a || e.d > a) ? e.d : a, null);

  await save();
  renderAll(); renderHistory();
  toast(__('logRemoved'));
}

/* Angezeigter Monat, relativ zum laufenden. 0 = dieser Monat. */
let kalenderVersatz = 0;

function renderCalendar(){
  const cal = document.getElementById('calendarView') || (() => {
    const el = document.createElement('div');
    el.id = 'calendarView';
    document.getElementById('view-history').appendChild(el);
    return el;
  })();
  if(!state.log || !state.log.length){ cal.innerHTML = ''; return; }

  /* Der Kalender stand fest auf new Date() – zurueckblaettern ging nicht,
     und ein mehrjaehriger Verlauf war damit im laufenden Monat eingesperrt. */
  const now = new Date();
  const gezeigt = new Date(now.getFullYear(), now.getMonth() + kalenderVersatz, 1);
  const year = gezeigt.getFullYear(), month = gezeigt.getMonth();
  const first = gezeigt.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const workoutDays = new Set(state.log.map(l => l.d));

  /* Vorwaerts endet die Reise im laufenden Monat, rueckwaerts beim ersten
     aufgezeichneten Training – dahinter gibt es nichts zu sehen. */
  const erster = state.log.reduce((a, e) => (!a || e.d < a) ? e.d : a, null) || '';
  const grenzeZurueck = erster.slice(0, 7) >= (year + '-' + String(month + 1).padStart(2, '0'));

  /* Monatsname und Wochentage aus Intl statt fest verdrahtet – sonst steht
     im englischen Kalender "Juli" und darueber "Mo Di Mi". */
  const monatsName = gezeigt.toLocaleDateString(getLang(), { month: 'long', year: 'numeric' });
  let html = '<div class="section-title cal-title"><span>' + esc(__('calendar')) + ' ' + esc(monatsName) + '</span>' +
    /* aria-disabled statt disabled: die Schaltflaeche wird an der Grenze
       unwirksam, aber genau dann liegt der Fokus auf ihr. Ein deaktiviertes
       Element kann keinen Fokus halten – er fiele auf <body>, und die
       Tastaturnavigation risse ab. Die Sperre prueft der Handler. */
    '<span class="cal-nav">' +
      '<button class="mini-btn" data-action="calendar:shift" data-delta="-1"' +
      (grenzeZurueck ? ' aria-disabled="true"' : '') +
      ' aria-label="' + esc(__('calPrev')) + '">‹</button> ' +
      '<button class="mini-btn" data-action="calendar:shift" data-delta="1"' +
      (kalenderVersatz >= 0 ? ' aria-disabled="true"' : '') +
      ' aria-label="' + esc(__('calNext')) + '">›</button>' +
    '</span></div>' +
    '<div class="calendar-grid" role="list" aria-label="' + esc(__('calendarAria', { month: monatsName })) + '">';
  wochentage().forEach(d => { html += '<div class="cal-header" aria-hidden="true">' + esc(d) + '</div>'; });
  const offset = (first + 6) % 7;
  for(let i = 0; i < offset; i++) html += '<div class="cal-day empty" aria-hidden="true"></div>';
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isWorkout = workoutDays.has(dateStr);
    const isToday = dateStr === today();
    /* Trainingstage waren nur gruen eingefaerbt – ohne Datum, ohne Label.
       Jetzt tragen sie den vollen Tag samt Zustand als Textalternative. */
    const label = __('calendarDay', { d, month: monatsName }) +
      (isWorkout ? __('calendarTrained') : '') + (isToday ? __('calendarToday') : '');
    html += '<div class="cal-day' + (isWorkout ? ' workout' : '') + (isToday ? ' today' : '') + '"' +
      ' role="listitem" aria-label="' + esc(label) + '"><span aria-hidden="true">' + d + '</span></div>';
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
  if(Object.keys(entry).length < 2){ toast(__('measurementEmpty')); return; }
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
    /* <small> ist keine Beschriftung – ein Screenreader las hier bisher
       nur "Eingabefeld". */
    html += '<div style="flex:1"><label for="meas-' + p + '"><small>' + esc(labels[p]) + '</small></label>' +
      '<input id="meas-' + p + '" type="number" step="0.5" min="0" max="200"' +
      ' placeholder="' + esc(last) + ' ' + esc(__('cm')) + '"' +
      ' style="width:100%;padding:5px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)"></div>';
  });
  html += '<button data-action="measurement:add" style="align-self:flex-end">' + __('save') + '</button>';
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
  if(!v || v < 30 || v > 250){ toast(__('weightImplausible')); return; }
  state.weights.push({ d: today(), kg: Math.round(v * 10) / 10 });
  if(state.weights.length > MAX_SERIES_ENTRIES) state.weights = state.weights.slice(-MAX_SERIES_ENTRIES);
  inp.value = '';
  await save(); renderWeight(); toast(__('weightSaved'));
}
function renderWeight(){
  const svg = document.getElementById('weightSpark'), meta = document.getElementById('weightMeta');
  const ws = state.weights || [];
  if(!ws.length){
    svg.innerHTML = '';
    meta.textContent = __('weightEmpty');
    return;
  }
  if(ws.length === 1){
    svg.innerHTML = '';
    meta.innerHTML = __('weightFirst', { kg: ws[0].kg, date: fmtDate(ws[0].d) });
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
  meta.innerHTML = __('weightMeta', { kg: kgs[kgs.length - 1], delta: (delta > 0 ? '+' : '') + delta, n: ws.length });
}

/* ================= Bibliothek ================= */
function renderCatFilter(){
  const cats = ['all'].concat(Object.keys(CATS));
  document.getElementById('catFilter').innerHTML = cats.map(c =>
    '<button class="chip' + (libFilter === c ? ' active' : '') + '" data-action="library:filter" data-cat="' + c + '">' +
    esc(c === 'all' ? __('all') : catName(c, CATS[c].name)) + '</button>').join('');
}
function setLibFilter(c){ libFilter = c; renderCatFilter(); renderLibrary(); }

/* Ab wann eine Uebung als liegen geblieben gilt. Zwei Wochen sind bei zwei
   bis vier Einheiten pro Woche eine Luecke, die kein Plan mehr erklaert. */
const LIB_STALE_TAGE = 14;

/* Sortierung der Bibliothek. Die Reihenfolge nach Kategorie und Datei ist
   die bisherige und bleibt die Vorgabe; sie beantwortet aber nicht die
   Frage, die sich nach ein paar Monaten stellt – was faellt hinten runter?

   Vergleichsfunktionen bekommen { ex, i, lvl, zuletzt } und fallen bei
   Gleichstand immer auf die Dateireihenfolge zurueck, damit die Liste bei
   gleichen Werten nicht bei jedem Aufbau anders aussieht. */
const LIB_SORT = {
  standard: (a, b) => a.i - b.i,
  /* Nie trainiert zuerst: das ist die groesste Luecke, nicht die kleinste. */
  alt: (a, b) => String(a.zuletzt || '').localeCompare(String(b.zuletzt || '')) || (a.i - b.i),
  fortschritt: (a, b) => (anteil(b) - anteil(a)) || (a.i - b.i)
};
const anteil = e => e.ex.levels.length > 1 ? e.lvl / (e.ex.levels.length - 1) : 0;
let libSort = 'standard';
function setLibSort(v){ libSort = LIB_SORT[v] ? v : 'standard'; renderLibrary(); }

/* Aufbau und Suche sind getrennt.

   renderLibrary() baute frueher bei JEDEM Tastendruck im Suchfeld alle 36
   Uebungen mit ihren 141 Stufen neu auf. Wer bei einer Uebung eine
   Bestleistung halb eingetippt hatte und dann suchte, fand sie danach nicht
   mehr vor – das Feld war ein anderes. Gesucht wird jetzt, indem vorhandene
   Eintraege aus- und wieder eingeblendet werden. */
function renderLibrary(){
  /* Einmal fuer die ganze Liste, nicht je Uebung: der Log fasst bis zu 2000
     Eintraege, und 42 Einzelabfragen liefen ihn 42-mal durch. */
  const zuletztAlle = letztesDatumJeUebung(state.log || [], getDay);
  const list = EXERCISES
    .map((ex, i) => ({ ex, i, lvl: lvlOf(ex), zuletzt: zuletztAlle[ex.id] || null }))
    .filter(e => libFilter === 'all' || e.ex.cat === libFilter)
    .sort(LIB_SORT[libSort] || LIB_SORT.standard);

  const planIds = new Set(getDays().flatMap(d => d.ex));

  document.getElementById('libList').innerHTML = list.length ? list.map(({ ex, lvl, zuletzt }) => {
    const open = libOpen[ex.id];
    const herTage = zuletzt ? tageZwischen(zuletzt, today()) : null;
    /* Nur melden, was auffaellt: eine Uebung von vorgestern braucht keinen
       Hinweis, und ein Chip an jeder der 42 Zeilen waere keiner mehr. */
    const liegt = herTage === null || herTage >= LIB_STALE_TAGE;
    const pr = (state.prs || {})[ex.id];
    /* Der Suchtext wird beim Aufbau festgeschrieben, damit filterLibrary()
       weder die Uebungsdaten noch die Uebersetzung erneut durchgehen muss.
       Ein Sprachwechsel laeuft ueber renderAll() und baut ohnehin neu auf. */
    const suchtext = [exName(ex), ...ex.levels.map((l, i) => exStage(ex, i))]
      .join(' ').toLowerCase();
    /* Nicht machbare Uebungen verschwinden nicht von selbst: sie bekommen
       einen Hinweis und lassen sich ueber das Kontrollkaestchen ausblenden.
       Wer die Ausruestung gerade erst eingetragen hat, soll nicht raten
       muessen, warum die Haelfte der Bibliothek fehlt. */
    const geht = machbar(ex);
    return '<div class="lib-item" data-exid="' + ex.id + '" data-such="' + esc(suchtext) +
      '" data-eqok="' + (geht ? '1' : '0') + '">' +
      /* Echter Button statt eines klickbaren div: der Kopf ist die
         Hauptinteraktion dieses Tabs und war per Tastatur unerreichbar. */
      '<button type="button" class="lib-head" data-action="library:toggle" data-ex="' + ex.id + '"' +
        ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="libbody-' + ex.id + '">' +
        '<span class="lib-name">' + esc(exName(ex)) +
          (planIds.has(ex.id) ? ' <span class="cat-chip">' + esc(__('inPlan')) + '</span>' : '') +
          (geht ? '' : ' <span class="cat-chip warn">' + esc(__('equipMissing')) + '</span>') +
          (liegt ? ' <span class="cat-chip stale">' + esc(herTage === null
            ? __('neverTrained')
            : __('staleDays', { n: herTage })) + '</span>' : '') + '</span>' +
        '<span class="lib-meta">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length + ' <span aria-hidden="true">' + (open ? '−' : '+') + '</span></span>' +
      '</button>' +
      '<div class="lib-body' + (open ? ' open' : '') + '" id="libbody-' + ex.id + '">' +
        '<div class="muted">' + esc(catName(ex.cat, CATS[ex.cat].name)) + ' · ' + esc(__('equipment')) + ': ' + esc(equipListe(ex.equip)) +
          (ex.rest ? ' · ' + esc(__('restOf', { sec: ex.rest })) : '') +
          ' · ' + esc(zuletzt ? __('lastTrainedOn', { date: fmtDate(zuletzt) }) : __('neverTrained')) + '</div>' +
        /* Je Stufe, nicht je Uebung: bei Dips sind die ersten beiden Stufen
           an der Bank machbar und erst die spaeteren brauchen Parallettes.
           Genau das soll hier ablesbar sein. */
        '<ul class="lvl-list">' + ex.levels.map((l, i) => {
          const luecke = fehlt(ex, i);
          return '<li class="' + (i === lvl ? 'at' : (i < lvl ? 'passed' : '')) + (luecke.length ? ' gesperrt' : '') + '">' +
            '<span>' + (i + 1) + '. ' + esc(exStage(ex, i)) +
            (luecke.length ? ' <small>(' + esc(__('needsEquip', { list: equipListe(luecke) })) + ')</small>' : '') +
            '</span><span class="t">' + esc(zielText(l.target)) + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="inline-row"><button data-action="level:adjust" data-ex="' + ex.id + '" data-delta="-1">− ' + __('level') + '</button>' +
          '<button data-action="level:adjust" data-ex="' + ex.id + '" data-delta="1">+ ' + __('level') + '</button></div>' +
        /* Der Platzhalter war die einzige Beschriftung; er verschwindet beim
           Tippen und wird nicht von jedem Screenreader angesagt. */
        '<div class="inline-row"><input id="pr-' + ex.id + '" placeholder="' + esc(__('bestPlaceholder')) + '"' +
          ' aria-label="' + esc(__('bestAria', { name: exName(ex) })) + '"' +
          ' value="' + (pr ? esc(pr.v) : '') + '">' +
          '<button data-action="pr:save" data-ex="' + ex.id + '">' + __('save') + '</button></div>' +
        (pr ? '<div class="pr-line">' + esc(__('prUpdated')) + ' ' + fmtDate(pr.d) + '</div>' : '') +
        '<ul class="tips open" style="margin-top:10px">' + exTips(ex).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
        '<button class="tip-btn" data-action="exercise:history" data-ex="' + ex.id + '">📊 ' + __('perExercise') + '</button>' +
      '</div></div>';
  }).join('') : '';
  filterLibrary();
}

/* Blendet aus, was nicht zur Suche passt – ohne die Liste anzufassen. Damit
   ueberleben halb getippte Bestleistungen in anderen Eintraegen, der auf- und
   zugeklappte Zustand bleibt, und pro Tastendruck faellt kein Neuaufbau an. */
function filterLibrary(){
  const q = (document.getElementById('libSearch').value || '').toLowerCase().trim();
  const eintraege = document.querySelectorAll('#libList .lib-item');
  let sichtbar = 0;
  eintraege.forEach(el => {
    const passt = (!q || (el.dataset.such || '').includes(q)) &&
      (!libNurMachbar || el.dataset.eqok === '1');
    el.hidden = !passt;
    if(passt) sichtbar++;
  });
  const leer = document.getElementById('libEmpty');
  if(leer) leer.hidden = sichtbar > 0;
}

const EQUIP_KEYS = {
  none: 'equipNone', chair: 'equipChair', bar: 'equipBar',
  parallettes: 'equipParallettes', rings: 'equipRings', band: 'equipBand'
};
const equipName = eq => EQUIP_KEYS[eq] ? __(EQUIP_KEYS[eq]) : eq;
/* Eine Kombination wie 'bar+band' wird als "Klimmzugstange + Widerstandsband"
   gelesen – im Datenformat trennt das Pluszeichen, in der Anzeige verbindet es. */
const equipLabel = eq => String(eq).split('+').map(equipName).join(' + ');
const equipListe = arr => (arr || []).map(equipLabel).join(', ');

/* Kurzform fuer die vielen Aufrufstellen: geprueft wird immer gegen das, was
   der Nutzer in den Einstellungen angehakt hat. */
const machbar = ex => exMoeglich(ex, state.equipment);
const stufeMachbar = (ex, i) => levelMoeglich(ex, i, state.equipment);
const fehlt = (ex, i) => fehlendeGeraete(ex, i, state.equipment);

function toggleEquipment(eq){
  if(!EQUIP.includes(eq) || eq === 'none') return;
  const da = new Set(state.equipment || []);
  if(da.has(eq)) da.delete(eq); else da.add(eq);
  /* In der Reihenfolge des Vokabulars ablegen, nicht in Klickreihenfolge –
     sonst sieht ein Backup je nach Bedienweg anders aus. */
  state.equipment = EQUIP.filter(e => e !== 'none' && da.has(e));
  save();
  /* Der Filter wirkt in mehreren Ansichten gleichzeitig; die verborgenen
     Tabs behielten sonst ihren alten Stand, bis man sie zufaellig neu baut. */
  renderLibrary(); renderPlanTab();
  if(session.dayKey){ cancelHold(); renderWorkout(); restoreSession(session.reps); }
}
function toggleLib(id){ libOpen[id] = !libOpen[id]; renderLibrary(); }

async function savePR(id){
  const v = (document.getElementById('pr-' + id).value || '').trim().slice(0, 40);
  if(!v){
    delete state.prs[id];
  } else {
    const n = parseInt(v, 10);
    /* Eine Handeingabe gewinnt immer – sie ist ausdruecklich gewollt. art und
       lvl gehoeren trotzdem dazu, sonst bewertet besserePR() den naechsten
       automatischen Eintrag falsch: ohne Stufe stuende die Eingabe auf 0 und
       jede Masseinheit-Aenderung wuerde sie sofort ueberschreiben. */
    const ex = EX_BY_ID[id];
    const art = /\bsek|\bsec/i.test(v) ? 'sek' : 'reps';
    const lvl = ex ? lvlOf(ex) : 0;
    state.prs[id] = Number.isFinite(n)
      ? { v, n, d: today(), art, lvl }
      : { v, d: today(), art, lvl };
  }
  await save(); renderLibrary(); toast(v ? __('bestSaved') : __('bestDeleted'));
}

/* ================= Plan-Editor mit Drag & Drop ================= */
let dragSrcId = null, dragSrcIdx = null;

function renderPlanTab(){
  const sel = document.getElementById('planSelect');
  sel.innerHTML = Object.entries(PLAN_TEMPLATES).map(([k, v]) =>
    '<option value="' + k + '"' + (!state.customPlan && state.planId === k ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
    (state.customPlan ? '<option value="custom" selected>' + __('customPlan') + '</option>' : '');
  document.getElementById('planDesc').textContent = state.customPlan
    /* Die eigene Beschreibung, wenn es eine gibt: ein erzeugter Plan sagt
       damit, woher er kommt, statt pauschal "von dir angepasst". */
    ? (state.customPlan.desc || __('customPlanDesc'))
    : planDesc(state.planId, (PLAN_TEMPLATES[state.planId] || {}).desc || '');

  const days = getDays();
  document.getElementById('planEditor').innerHTML = days.map((d, di) =>
    '<div class="plan-day">' +
      '<div class="plan-day-head"><span class="plan-day-title">' + esc(d.key) + ' · ' + esc(dayTitleOf(d)) + '</span>' +
        '<span><button class="mini-btn" data-action="planDay:rename" data-day="' + di + '" title="' + __('rename') + '">✎</button> ' +
        '<button class="mini-btn danger" data-action="planDay:remove" data-day="' + di + '" title="' + __('remove') + '">✕</button></span></div>' +
      d.ex.map((id, ei) => {
        const ex = EX_BY_ID[id];
        /* Drag & Drop laeuft ueber einen eigenen, auf #planEditor begrenzten
           Listener statt ueber die allgemeine Aktionstabelle: dragover feuert
           ununterbrochen und muss jedes Mal preventDefault() aufrufen – das
           gehoert nicht durch einen Namens-Lookup am document. */
        return '<div class="plan-ex" draggable="true" data-day="' + di + '" data-i="' + ei + '">' +
          '<span class="drag-handle">⠿</span>' +
          '<span class="nm">' + (ex ? esc(exName(ex)) : '<i>' + esc(__('unknownExercise', { id })) + '</i>') +
          '</span><button class="mini-btn" data-action="planEx:move" data-day="' + di + '" data-i="' + ei + '" data-delta="-1" title="' + __('moveUp') + '">↑</button>' +
          '<button class="mini-btn" data-action="planEx:move" data-day="' + di + '" data-i="' + ei + '" data-delta="1" title="' + __('moveDown') + '">↓</button>' +
          '<button class="mini-btn danger" data-action="planEx:remove" data-day="' + di + '" data-i="' + ei + '" title="' + __('remove') + '">✕</button></div>';
      }).join('') +
      /* Nicht machbare Uebungen werden gesperrt statt entfernt: ein verkuerztes
         Menue laesst offen, warum eine Uebung fehlt – ein ausgegrauter Eintrag
         mit Grund erklaert sich selbst. */
      '<div class="inline-row"><select id="add-' + di + '">' +
        Object.keys(CATS).map(c => '<optgroup label="' + esc(catName(c, CATS[c].name)) + '">' +
          EXERCISES.filter(e => e.cat === c).map(e => {
            const geht = machbar(e);
            return '<option value="' + e.id + '"' + (geht ? '' : ' disabled') + '>' +
              esc(exName(e)) + (geht ? '' : ' (' + esc(__('equipMissing')) + ')') + '</option>';
          }).join('') +
          '</optgroup>').join('') +
      '</select><button data-action="planEx:add" data-day="' + di + '">' + __('addExercise') + '</button></div>' +
    '</div>').join('') || '<div class="empty-hint">' + __('noPlanDays') + '</div>';
}

/* Ein Listener fuer den ganzen Plan-Editor. Die Zeilen tragen nur noch
   data-day und data-i; das Event kommt als Parameter statt aus dem
   impliziten globalen window.event (nicht standardisiert, in Firefox nicht
   vorhanden und unter Modulen ohnehin nicht verfuegbar). */
function installPlanDragAndDrop(){
  const editor = document.getElementById('planEditor');
  const zeile = ev => ev.target.closest('.plan-ex[data-day]');

  editor.addEventListener('dragstart', ev => {
    const el = zeile(ev); if(!el) return;
    dragSrcId = zahl(el.dataset.day); dragSrcIdx = zahl(el.dataset.i);
    ev.dataTransfer.effectAllowed = 'move';
    /* Firefox startet einen Drag nur, wenn Daten gesetzt sind. */
    ev.dataTransfer.setData('text/plain', dragSrcId + ':' + dragSrcIdx);
  });

  editor.addEventListener('dragover', ev => {
    if(!zeile(ev) || dragSrcId === null) return;
    ev.preventDefault();                       /* macht die Zeile erst ablegbar */
    ev.dataTransfer.dropEffect = 'move';
  });

  editor.addEventListener('drop', ev => {
    const el = zeile(ev); if(!el) return;
    ev.preventDefault();
    dragDrop(zahl(el.dataset.day), zahl(el.dataset.i));
  });

  editor.addEventListener('dragend', () => { dragSrcId = null; dragSrcIdx = null; });
}

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

/* Huelle um buildPlan(): reicht Uebungen, Ausruestung und die uebersetzten
   Bezeichnungen hinein. Das Modul selbst bleibt damit ohne Sprachwissen. */
function planAusAusruestung(tage, fokus){
  return buildPlan({
    exercises: EXERCISES,
    equipment: state.equipment,
    tage, fokus,
    texte: {
      name: __('customPlan'),
      desc: __('generatedPlanDesc'),
      sub: __('generatedDaySub'),
      ganzkoerper: __('fullBody'),
      kat: Object.fromEntries(Object.keys(CATS).map(k => [k, catName(k, CATS[k].name)]))
    }
  });
}

async function generatePlan(){
  const plan = await askPlanBuilder();
  if(!plan || !plan.days.length) return;
  /* Ein eigener Plan wird ueberschrieben – das ist Arbeit, die verloren geht,
     also nicht ohne Rueckfrage. */
  if(state.customPlan){
    const ok = await askConfirm(__('buildPlan'), __('overwriteCustomPlan'), __('apply'), true);
    if(!ok) return;
  }
  state.customPlan = plan;
  save();
  renderPlanTab(); renderStats(); renderDaySelect(); renderLibrary();
  toast(__('planBuilt', { n: plan.days.length }));
}

function ensureCustom(){
  if(!state.customPlan){
    const base = PLAN_TEMPLATES[state.planId] || PLAN_TEMPLATES.ab4;
    state.customPlan = JSON.parse(JSON.stringify({ name: __('customPlan'), desc: __('customPlanDesc'), days: base.days }));
  }
  return state.customPlan;
}
function changePlan(v){
  if(v === 'custom'){ ensureCustom(); }
  else { state.customPlan = null; state.planId = v; }
  save(); renderPlanTab(); renderStats(); renderDaySelect();
  toast(__('planChanged', { name: planLabel() }));
}
async function resetPlan(){
  const ok = await askConfirm(__('planResetTitle'), __('planResetBody'), __('reset'), true);
  if(!ok) return;
  state.customPlan = null; save(); renderPlanTab(); renderDaySelect(); toast(__('planReset'));
}
async function addPlanDay(){
  const p = ensureCustom();
  const key = sanitizeDayKey(await askText(__('addDay'), __('dayKeyLabel'),
    String.fromCharCode(65 + p.days.length), 6));
  if(!key) return;
  const title = (await askText(__('addDay'), __('dayTitle'), __('addDay'), 40)) || __('addDay');
  p.days.push({ key, title: title.slice(0, 40), sub: '', ex: [] });
  save(); renderPlanTab(); renderDaySelect();
}
async function renameDay(di){
  const p = ensureCustom(), d = p.days[di];
  const key = await askText(__('renameDayTitle'), __('dayKeyShort'), d.key, 6);
  if(key === null) return;
  const title = await askText(__('renameDayTitle'), __('dayTitle'), d.title, 40);
  if(title === null) return;
  const sub = await askText(__('renameDayTitle'), __('daySub'), d.sub || '', 60);
  if(sub === null) return;
  d.key = sanitizeDayKey(key) || d.key;
  d.title = title.slice(0, 40) || d.title;
  d.sub = sub.slice(0, 60);
  save(); renderPlanTab(); renderDaySelect();
}
async function removeDay(di){
  const p = ensureCustom();
  const ok = await askConfirm(__('removeDayTitle'),
    __('removeDayBody', { name: p.days[di].title }), __('remove'), true);
  if(!ok) return;
  p.days.splice(di, 1); save(); renderPlanTab(); renderDaySelect();
}
function addEx(di){
  const p = ensureCustom();
  const id = document.getElementById('add-' + di).value;
  if(p.days[di].ex.includes(id)){ toast(__('exerciseAlreadyIn')); return; }
  p.days[di].ex.push(id); save(); renderPlanTab();
  toast(__('exerciseAdded', { name: exName(EX_BY_ID[id]) }));
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
/* Der Stand eines Meilensteins gegen den aktuellen Zustand. */
const msStatus = m => meilensteinStatus(m, {
  levels: state.levels, prs: state.prs, exById: EX_BY_ID
});

/* Was fehlt, in Worten: "Stufe 4 und 5 Wdh" – oder nur der Teil, der
   tatsaechlich aussteht. Aus der blossen Liste wird damit eine
   Wegbeschreibung. */
function fehltText(fehlt){
  if(!fehlt) return '';
  const teile = [];
  if(fehlt.lvl !== undefined) teile.push(__('msNeedsLevel', { n: fehlt.lvl + 1 }));
  if(fehlt.wert !== undefined){
    teile.push(__(fehlt.art === 'sek' ? 'msNeedsSecs' : 'msNeedsReps', { n: fehlt.wert }));
  }
  return teile.length ? __('msNeeds', { list: teile.join(__('andJoin')) }) : '';
}

function renderMilestones(){
  const search = (document.getElementById('msSearch')?.value || '').toLowerCase();
  let list = MILESTONES;
  if(search) list = list.filter(m => msName(m).toLowerCase().includes(search));

  document.getElementById('msList').innerHTML = list.map(m => {
    const d = (state.milestones || {})[m.id];
    const s = d ? null : msStatus(m);
    /* Erkannt, aber nicht eingetragen: die App schlaegt vor und hakt nicht
       ab. "Sauber geschafft" folgt aus keiner Zahl. */
    const erkannt = s && s.bekannt && s.erfuellt;
    /* Der Knopf steht NEBEN dem Label, nicht darin: ein Button in einem
       Label wird beim Klick doppelt wirksam – er loest aus UND schaltet das
       Kontrollkaestchen um. Dieselbe Falle wie frueher beim Warm-up-Knopf
       im <summary>. */
    return '<div class="ms-row' + (erkannt ? ' erkannt' : '') + '">' +
      '<label class="ms' + (d ? ' done' : '') + '">' +
      '<input type="checkbox" ' + (d ? 'checked' : '') +
      ' data-action-change="milestone:toggle" data-id="' + m.id + '"><span>' +
      '<span class="ms-name">' + esc(msName(m)) +
        (erkannt ? ' <span class="cat-chip">' + esc(__('msLooksDone')) + '</span>' : '') + '</span>' +
      (d ? '<br><span class="ms-date">' + esc(__('msAchievedOn')) + ' ' + fmtDate(d) + '</span>' : '') +
      (!d && s && s.bekannt && !erkannt
        ? '<br><span class="ms-need">' + esc(fehltText(s.fehlt)) + '</span>' : '') +
      '</span></label>' +
      (erkannt ? '<button type="button" class="mini-btn" data-action="milestone:accept" data-id="' +
        m.id + '">' + esc(__('msAccept')) + '</button>' : '') +
      '</div>';
  }).join('');
}

/* Alle erkannten, noch nicht eingetragenen Meilensteine. */
const erkannteMs = () => erkannteMeilensteine(MILESTONES, {
  levels: state.levels, prs: state.prs, exById: EX_BY_ID, milestones: state.milestones
});

/* Alle Bestleistungen an einer Stelle.

   Erfasst werden sie seit jeher automatisch, angezeigt wurden sie nur im
   jeweiligen Bibliothekseintrag – nach einem halben Jahr ist das die
   Zahlenreihe, die man sehen will, und die einzige, die man 42-mal
   aufklappen musste. Neueste zuerst. */
function renderBests(){
  const el = document.getElementById('bestsList');
  if(!el) return;
  const liste = Object.keys(state.prs || {})
    .map(id => ({ id, ex: EX_BY_ID[id], pr: state.prs[id] }))
    /* Eine Uebung, die es nicht mehr gibt, hat auch keinen Namen. */
    .filter(e => e.ex && e.pr && typeof e.pr === 'object')
    .sort((a, b) => String(b.pr.d || '').localeCompare(String(a.pr.d || '')) ||
      exName(a.ex).localeCompare(exName(b.ex)));

  el.innerHTML = liste.length ? liste.map(({ ex, pr }) =>
    '<div class="log-item"><span class="log-day">' + esc(exName(ex)) + '</span>' +
    '<span class="best-val">' + esc(pr.v) + '</span>' +
    '<span class="log-date">' + esc(pr.d ? fmtDate(pr.d) : '') + '</span></div>').join('')
    : '<div class="empty-hint">' + esc(__('bestsEmpty')) + '</div>';
}
async function toggleMilestone(id, on){
  if(on){
    state.milestones[id] = today(); signal(true);
    /* Mit Guard und ueber msName(): der Name kam bisher roh aus den deutschen
       Daten, und ein Eintrag, der aus MILESTONES verschwindet, aber noch in
       state.milestones steht, liess find() undefined liefern. */
    const m = MILESTONES.find(x => x.id === id);
    if(m) toast(__('milestoneToast', { name: msName(m) }), true);
  } else delete state.milestones[id];
  await save(); renderStats(); renderMilestones();
}
function renderRoadmap(){
  const skills = EXERCISES.filter(e => e.cat === 'skill' || ['planche_lean', 'wall_hs', 'front_lever'].includes(e.id));
  document.getElementById('roadmap').innerHTML = skills.map(ex => {
    const lvl = lvlOf(ex);
    const pct = Math.round(lvl / (ex.levels.length - 1) * 100);
    return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
      '<div class="lib-head" style="cursor:default"><span class="lib-name">' + esc(exName(ex)) + '</span>' +
      '<span class="lib-meta">' + pct + '%</span></div>' +
      '<div class="muted">' + esc(__('nextStage', { name: exStage(ex, lvl), stage: '' })).replace(/\s*$/, ' ') +
      (lvl < ex.levels.length - 1 ? esc(exStage(ex, lvl + 1)) : esc(__('maxLevelReached'))) + '</div></div>';
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

/* Alles, was bei offenem Dialog unerreichbar sein muss. Es genuegt nicht,
   .wrap zu nehmen: die Abschlussleiste, der Pausen-Chip und der Toast liegen
   ausserhalb davon. Ein Klick kam durch den z-index zwar nicht durch, aber im
   Browse-Modus eines Screenreaders blieb "Training abschliessen" erreichbar,
   waehrend eine Rueckfrage offen stand. */
const HINTERGRUND = ['.wrap', '#finishBar', '#restChip', '#toast'];
const hintergrundInert = an => HINTERGRUND.forEach(sel => {
  const el = document.querySelector(sel);
  if(!el) return;
  if(an) el.setAttribute('inert', ''); else el.removeAttribute('inert');
});

function openDialog(overlay){
  /* Dasselbe Overlay zweimal oeffnen: showExHistory() benutzt einen
     wiederverwendeten Knoten. Ohne diese Zeile setzt er inert auf sich selbst
     und closeDialog() loest nur den ersten Stapeleintrag – .wrap bliebe
     dauerhaft unerreichbar. */
  if(dialogStack.some(d => d.el === overlay)) return;

  const unten = dialogStack[dialogStack.length - 1];
  /* Die darunterliegende Ebene wird selbst unerreichbar. */
  if(unten) unten.el.setAttribute('inert', '');
  else hintergrundInert(true);

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
    hintergrundInert(false);
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
    '<button data-dlg="abbrechen" aria-label="' + esc(__('close')) + '">✕</button></div>';
}
function dialogFuss(okText, gefahr){
  return '<div class="dlg-actions">' +
    '<button data-dlg="abbrechen">' + esc(__('cancel')) + '</button>' +
    '<button data-dlg="ok" class="primary' + (gefahr ? ' danger' : '') + '">' + esc(okText) + '</button></div>';
}

/* Freitexteingabe – Ersatz fuer prompt() */
function askText(titel, label, vorgabe = '', maxLen = 80){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<label class="dlg-label" for="dlg-input">' + esc(label) + '</label>' +
      '<input id="dlg-input" class="dlg-input" maxlength="' + maxLen + '" value="' + esc(vorgabe) + '">' +
      dialogFuss(__('apply'));
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
      '</div><div class="dlg-actions"><button data-dlg="abbrechen">' + esc(__('cancel')) + '</button></div>';
    modal.querySelectorAll('.dlg-choice').forEach(b => {
      b.onclick = () => finish(optionen[parseInt(b.dataset.i, 10)].value);
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

/* Plangenerator – zwei Auswahlfelder mit sofortiger Vorschau.

   askChoice() reicht dafuer nicht: dort ist jede Option ein Endergebnis, hier
   sind zwei Angaben zu kombinieren und das Ergebnis will vor dem Uebernehmen
   gesehen werden. Geruest, Fokusfalle und Promise kommen unveraendert aus
   askDialog(). */
function askPlanBuilder(){
  const FOKUS = ['kraft', 'ausgewogen', 'skill'];
  const FOKUS_KEYS = { kraft: 'focusStrength', ausgewogen: 'focusBalanced', skill: 'focusSkills' };
  return askDialog((modal, finish) => {
    const titel = __('buildPlan');
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(__('buildPlanBody')) + '</p>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-tage">' + esc(__('daysPerWeek')) + '</label></span>' +
        '<select id="pb-tage">' + [2, 3, 4, 5, 6].map(n =>
          '<option value="' + n + '"' + (n === cfg('weekGoal') ? ' selected' : '') + '>' + n + '×</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-fokus">' + esc(__('focus')) + '</label></span>' +
        '<select id="pb-fokus">' + FOKUS.map(f =>
          '<option value="' + f + '"' + (f === 'ausgewogen' ? ' selected' : '') + '>' + esc(__(FOKUS_KEYS[f])) + '</option>').join('') +
        '</select></div>' +
      '<div id="pb-vorschau" class="pb-preview"></div>' +
      dialogFuss(__('apply'));

    const tage = modal.querySelector('#pb-tage'), fokus = modal.querySelector('#pb-fokus');
    const vorschau = modal.querySelector('#pb-vorschau');
    /* Der Plan wird beim Zeichnen der Vorschau erzeugt und beim Uebernehmen
       genau dieser genommen – nicht ein zweites Mal gebaut. Die Funktion ist
       zwar deterministisch, aber wer die Vorschau bestaetigt, soll auch das
       bekommen, was er gesehen hat. */
    let plan = null;
    const zeichnen = () => {
      plan = planAusAusruestung(zahl(tage.value), fokus.value);
      vorschau.innerHTML = plan.days.map(d =>
        '<div class="pb-day"><b>' + esc(d.key) + ' · ' + esc(d.title) + '</b><span>' +
        esc(d.ex.map(id => exName(EX_BY_ID[id])).join(' · ')) + '</span></div>').join('') ||
        '<div class="empty-hint">' + esc(__('noExercises')) + '</div>';
    };
    tage.onchange = zeichnen; fokus.onchange = zeichnen;
    zeichnen();

    modal.querySelector('[data-dlg=ok]').onclick = () => finish(plan);
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

/* Einstieg: Ausruestung und Selbsteinschaetzung in einem Dialog.

   Die Stufenfragen haengen an der Ausruestung – ohne Stange ist der Klimmzug
   keine sinnvolle Frage, und eine Stufe, die Parallettes braucht, darf nicht
   zur Wahl stehen. Deshalb werden sie bei jeder Aenderung der Haken neu
   aufgebaut. Bereits gegebene Antworten bleiben dabei erhalten, soweit die
   Stufe weiterhin machbar ist; alles andere waere eine Strafe dafuer, dass
   man die Reihenfolge falsch geraten hat. */
function askEinstieg(){
  return askDialog((modal, finish) => {
    const titel = __('welcomeTitle');
    const gewaehlt = new Set(state.equipment || []);
    const antworten = {};

    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(__('onboardEquipBody')) + '</p>' +
      '<div id="ob-equip"></div>' +
      '<p class="dlg-text">' + esc(__('onboardLevelBody')) + '</p>' +
      '<div id="ob-fragen"></div>' +
      dialogFuss(__('welcomeStart'));

    const equipEl = modal.querySelector('#ob-equip');
    const fragenEl = modal.querySelector('#ob-fragen');

    equipEl.innerHTML = EQUIP.filter(e => e !== 'none').map(e =>
      '<label class="set-row" style="cursor:pointer"><span>' + esc(equipName(e)) + '</span>' +
      '<input type="checkbox" data-ob-eq="' + e + '"' + (gewaehlt.has(e) ? ' checked' : '') + '></label>').join('');

    const fragenZeichnen = () => {
      const vorhanden = EQUIP.filter(e => e !== 'none' && gewaehlt.has(e));
      const fragen = einstiegsFragen(EXERCISES, vorhanden);
      fragenEl.innerHTML = fragen.map(({ kat, ex, stufen }) =>
        '<div class="set-row"><span><label class="lbl2" for="ob-' + kat + '">' +
          esc(exName(ex)) + '</label></span>' +
        '<select id="ob-' + kat + '" data-ob-kat="' + kat + '">' +
          /* Erste Wahl ist immer "ganz von vorn" – das ist die ehrlichste
             Vorgabe und der bisherige Zustand. */
          stufen.map(i => '<option value="' + i + '">' +
            esc((i + 1) + '. ' + exStage(ex, i) + ' · ' + zielText(ex.levels[i].target)) +
            '</option>').join('') +
        '</select></div>').join('') ||
        '<div class="empty-hint">' + esc(__('noExercises')) + '</div>';

      /* Fruehere Antworten wieder einsetzen, soweit die Stufe es noch gibt. */
      fragenEl.querySelectorAll('[data-ob-kat]').forEach(sel => {
        const alt = antworten[sel.dataset.obKat];
        if(alt !== undefined && sel.querySelector('option[value="' + alt + '"]')) sel.value = String(alt);
        else antworten[sel.dataset.obKat] = Number(sel.value);
        sel.onchange = () => { antworten[sel.dataset.obKat] = Number(sel.value); };
      });
    };

    equipEl.querySelectorAll('[data-ob-eq]').forEach(box => {
      box.onchange = () => {
        if(box.checked) gewaehlt.add(box.dataset.obEq); else gewaehlt.delete(box.dataset.obEq);
        fragenZeichnen();
      };
    });
    fragenZeichnen();

    modal.querySelector('[data-dlg=ok]').onclick = () => finish({
      equipment: EQUIP.filter(e => e !== 'none' && gewaehlt.has(e)),
      antworten
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

async function einstiegLaufen(){
  const res = await askEinstieg();
  /* Auch ein Abbruch beendet den Einstieg. Ein Banner, das nach jedem
     Wegklicken wiederkommt, ist keine Einladung mehr – wer ihn spaeter doch
     will, findet ihn in den Einstellungen. */
  if(!res){ einstiegBeenden(true); return; }

  state.equipment = res.equipment;
  const stufen = startStufen({
    exercises: EXERCISES, equipment: state.equipment, antworten: res.antworten
  });
  Object.assign(state.levels, stufen);
  einstiegBeenden(false);
  toast(__('onboardDone', { n: Object.keys(stufen).length }), true);
}

function einstiegBeenden(stumm){
  state.onboarded = true;
  save();
  renderAll(); renderLibrary(); renderPlanTab();
  if(stumm) toast(__('onboardSkipped'));
}

/* Nur-Lese-Text zum Markieren und Kopieren */
function showTextDialog(titel, text){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<textarea class="dlg-area" readonly rows="12"></textarea>' +
      '<div class="dlg-actions"><button data-dlg="abbrechen" class="primary">' + esc(__('close')) + '</button></div>';
    modal.querySelector('.dlg-area').value = text;
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
    setTimeout(() => { const a = modal.querySelector('.dlg-area'); a.focus(); a.select(); }, 0);
  });
}

function openSettings(){
  ['setsMode', 'rest', 'perExRest', 'autoRest', 'sound', 'vibrate', 'streak', 'weekGoal', 'deload', 'regress', 'lang'].forEach(k => {
    const el = document.getElementById('cfg-' + k); if(!el) return;
    if(el.type === 'checkbox') el.checked = !!cfg(k); else el.value = String(cfg(k));
  });
  const da = new Set(state.equipment || []);
  EQUIP.filter(e => e !== 'none').forEach(e => {
    const el = document.getElementById('eq-' + e);
    if(el) el.checked = da.has(e);
  });
  zeigeSpeicherinfo();
  zeigeInstallSchalter();
  openDialog(document.getElementById('settingsOverlay'));
}
function closeSettings(){ closeDialog(document.getElementById('settingsOverlay')); }
/* Escape wird in addKeyboardShortcuts() behandelt – ein zweiter Listener hier
   hat closeSettings() pro Tastendruck doppelt aufgerufen. */

function updateSetting(k, v){
  state.settings[k] = v; save();
  if(k === 'lang'){
    setLang(v);
    applyLanguage();
    /* Alle Ansichten neu aufbauen, nicht nur die sichtbare: die verborgenen
       Tabs behielten sonst die alte Sprache, bis man sie zufaellig neu
       rendert. */
    renderWarmup(); renderCatFilter(); renderLibrary();
    renderPlanTab(); renderMilestones(); renderBests(); renderRoadmap(); renderHistory();
  }
  if(session.dayKey && ['setsMode', 'streak', 'perExRest', 'rest'].includes(k)){
    if(k === 'setsMode') verwerfeUeberzaehligeSaetze();
    cancelHold(); renderWorkout(); restoreSession(session.reps);
  }
  renderAll();
}

/* Haken, die es nach einer geaenderten Satzzahl nicht mehr gibt.

   Frueher nur beim Satz-Modus noetig; die Entlastungswoche halbiert die
   Saetze ebenfalls und kann mitten in einer laufenden Einheit beginnen. */
function verwerfeUeberzaehligeSaetze(){
  Object.keys(session.sets).forEach(key => {
    const id = key.slice(0, key.lastIndexOf('-'));
    const ex = EX_BY_ID[id]; if(!ex) return;
    const max = parseTarget(ex.levels[lvlOf(ex)].target).sets;
    if(parseInt(key.split('-').pop(), 10) >= max) delete session.sets[key];
  });
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
    /* Erst nach dem erfolgreichen Erzeugen buchen – sonst verstummt die
       Erinnerung fuer eine Sicherung, die es gar nicht gibt. Der Stand
       selbst enthaelt die Buchung noch nicht; das ist richtig so, denn er
       war zum Zeitpunkt des Exports ungesichert. */
    state.lastBackup = today();
    state.backupWorkouts = state.workouts || 0;
    state.backupDismissed = 0;
    save(); renderBanners();
    toast(__('backupDownloaded'));
  }catch(err){ console.error('[exportJSON]', err); toast(__('exportFailed')); }
}
function exportCSV(){
  download('progression-verlauf-' + today() + '.csv', '\uFEFF' + serializeLog(state.log), 'text/csv');
  toast(__('csvDownloaded'));
}
function exportText(){
  const lines = [__('textHeader', { date: fmtDate(today()) }),
    __('textPlan', { name: planLabel() }),
    __('textWorkouts', { n: state.workouts || 0 }), '', __('textLevels')];
  getDays().forEach(d => {
    lines.push('', '[' + d.key + '] ' + d.title);
    d.ex.forEach(id => {
      const ex = EX_BY_ID[id]; if(!ex) return;
      const l = lvlOf(ex);
      lines.push('  ' + exName(ex) + ': ' + __('level') + ' ' + (l + 1) + '/' + ex.levels.length +
        ' – ' + exStage(ex, l) + ' (' + zielText(ex.levels[l].target) + ')');
    });
  });
  const ms = Object.keys(state.milestones || {});
  if(ms.length){
    lines.push('', __('textMilestones'));
    ms.forEach(id => { const m = MILESTONES.find(x => x.id === id); if(m) lines.push('  ✔ ' + msName(m) + ' (' + fmtDate(state.milestones[id]) + ')'); });
  }
  const ws = state.weights || [];
  if(ws.length) lines.push('', __('textWeight', { from: ws[0].kg, to: ws[ws.length - 1].kg }));
  const text = lines.join('\n');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(() => toast(__('copiedToClipboard')))
      .catch(() => showTextDialog(__('copyDialogTitle'), text));
  } else showTextDialog(__('copyDialogTitle'), text);
}
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

/* Der Uebungsbestand ist die einzige Aussenabhaengigkeit von clampBackup und
   wird ihm deshalb hereingereicht – die Domaenenschicht importiert nichts. */
const clampBackup = data => clampBackupPure(data, EX_BY_ID);

function importJSON(input){
  const file = input.files && input.files[0]; if(!file) return;
  if(file.size > MAX_BACKUP_BYTES){
    toast(__('fileTooBig')); input.value = ''; return;
  }
  const r = new FileReader();
  r.onload = async e => {
    try{
      const data = JSON.parse(e.target.result);
      if(!data || typeof data !== 'object' || Array.isArray(data) ||
         (data.levels === undefined && data.workouts === undefined)) throw new Error('invalid');
      /* Ersetzen war bisher die einzige Moeglichkeit – und fuer den
         haeufigsten Fall die falsche: wer auf dem Handy trainiert und danach
         das Backup vom Rechner einspielt, verlor jede Einheit, die seit dem
         Backup dazukam. Zusammenfuehren steht deshalb zuerst, es ist die
         verlustfreie Wahl. */
      const wahl = await askChoice(__('importTitle'), [
        { name: __('importMerge'), sub: __('importMergeSub'), value: 'merge' },
        { name: __('importReplace'), sub: __('importReplaceSub'), value: 'replace' }
      ]);
      if(!wahl){ input.value = ''; return; }
      cancelHold(); stopRest();
      /* Durch BEIDE Stufen: clampBackup kappt Laengen und Fremdfelder,
         migrateState normalisiert Typen und setzt die Version. Frueher stand
         hier ein Object.assign(DEFAULT_STATE(), …) – also genau der flache
         Merge, den migrateState ersetzt hat. Boot- und Importpfad pruefen
         seitdem unterschiedlich streng, obwohl es dieselben Daten sind.

         mergeStates() sitzt dazwischen: es entscheidet, welcher Wert gewinnt,
         nicht ob er eine gueltige Form hat. */
      const sauber = clampBackup(data);
      state = migrateState(wahl === 'merge' ? mergeStates(state, sauber) : sauber);
      clearSession();          /* vor dem Speichern: sonst landet eine aus dem
                                  Backup stammende Einheit kurz im Speicher */
      await save();
      document.getElementById('finishBar').style.display = 'none';
      applyTheme(); closeSettings(); showTab('train'); renderAll();
      toast(__('imported'), true);
    }catch(err){
      console.error('[importJSON]', err);
      toast(__('importFailed'));
    }
    input.value = '';
  };
  r.onerror = () => { toast(__('fileUnreadable')); input.value = ''; };
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
    toast(__('fileTooBig')); input.value = ''; return;
  }
  const r = new FileReader();
  r.onload = async e => {
    try{
      const { entries: imported, skipped } = parseLog(e.target.result, sanitizeDayKey);
      if(!imported.length) throw new Error(__('csvNoValidRows'));

      const msg = __('csvImportBody', { n: imported.length }) +
        (skipped ? __('csvSkipped', { n: skipped }) : '');
      if(!await askConfirm(__('csvImportTitle'), msg, __('importAction'))) return;

      const existing = new Set((state.log || []).map(l => l.d + '-' + l.day));
      let added = 0;
      imported.forEach(en => {
        const key = en.d + '-' + en.day;
        if(!existing.has(key)){ state.log.push(en); existing.add(key); added++; }
      });
      state.log.sort((a, b) => a.d.localeCompare(b.d));
      if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);
      save(); renderAll(); renderHistory();
      toast(__('csvImported', { added, total: imported.length }));
    }catch(err){
      toast(__('csvImportFailed', { msg: err.message }));
    }finally{
      /* Immer zuruecksetzen – bei einem return im try-Block blieb der Wert
         sonst stehen und dieselbe Datei loeste kein change-Event mehr aus. */
      input.value = '';
    }
  };
  r.onerror = () => { toast(__('fileUnreadable')); input.value = ''; };
  r.readAsText(file);
}

async function resetAll(){
  const ok = await askConfirm(__('resetAllTitle'), __('resetAllBody'), __('resetAllAction'), true);
  if(!ok) return;
  cancelHold(); stopRest();
  const keep = { theme: state.theme, settings: state.settings, planId: state.planId, customPlan: state.customPlan };
  /* Ohne catch bricht ein Fehler in store.clear() die async-Funktion mitten
     im Zuruecksetzen ab – ohne Meldung und mit halb geleertem Speicher. */
  try{
    await store.clear();
  }catch(err){
    console.error('[resetAll]', err);
    toast(__('resetFailed'));
    return;
  }
  state = Object.assign(DEFAULT_STATE(), keep);
  clearSession();
  await save();
  document.getElementById('finishBar').style.display = 'none';
  closeSettings(); showTab('train'); renderAll();
  toast(__('resetDone'));
}

/* ================= Helfer ================= */
/* today(), isoDaysAgo(), fmtDate(), esc() und sanitizeDayKey() liegen in
   js/domain/ und werden oben importiert. */

/* Ansage nur fuer Screenreader. Fuer Ereignisse, die sichtbar ohnehin
   erkennbar sind und deshalb keinen Toast rechtfertigen. */
function melde(text){
  const el = document.getElementById('srStatus');
  if(!el) return;
  /* Zweimal derselbe Text wuerde sonst nicht erneut vorgelesen. */
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 30);
}

/* Haelt den Fokus ueber ein Neuzeichnen hinweg.

   Die Render-Funktionen ersetzen ganze Container per innerHTML. Das gerade
   betaetigte Element ist danach weg und der Fokus faellt auf <body> – bei
   Tastatur- und Screenreader-Bedienung reisst die Navigation jedes Mal ab.
   Fuer Dialoge gibt es laengst einen Fokus-Trap mit Rueckgabe; fuer Renders
   gab es nichts.

   Bewusst an den Aktionen aufgerufen und nicht in den Render-Funktionen: so
   steht an der Stelle, welche Interaktion den Fokus halten soll. */

/* Wiedererkennungsmerkmal eines Bedienelements ueber ein Neuzeichnen hinweg.
   Eine id haben laengst nicht alle – Bibliothekskoepfe, Meilenstein-Haken und
   die Plan-Schaltflaechen tragen nur ihre data-Attribute. Die sind aber
   stabil und eindeutig, also dienen sie als Kennung. */
const FOKUS_DATEN = ['ex', 'day', 'i', 'set', 'key', 'cat', 'id', 'delta'];
function fokusKennung(el){
  if(!el || el === document.body) return null;
  if(el.id) return '#' + CSS.escape(el.id);
  const art = el.dataset.action ? '' : el.dataset.actionChange ? '-change' : el.dataset.actionInput ? '-input' : null;
  if(art === null) return null;
  const name = el.dataset.action || el.dataset.actionChange || el.dataset.actionInput;
  let sel = '[data-action' + art + '="' + name + '"]';
  for(const k of FOKUS_DATEN){
    const v = el.dataset[k];
    if(v === undefined || v.includes('"')) continue;
    sel += '[data-' + k + '="' + v + '"]';
  }
  return sel;
}

/* async, weil mehrere Aktionen erst nach einem await neu zeichnen
   (toggleMilestone speichert, renameDay oeffnet einen Dialog). Wuerde hier
   nicht gewartet, liefe die Wiederherstellung vor dem Neuzeichnen. */
async function mitFokus(fn){
  const alt = document.activeElement;
  const kennung = fokusKennung(alt);
  const pos = alt && typeof alt.selectionStart === 'number' ? alt.selectionStart : null;
  await fn();
  if(!kennung) return;
  let neu;
  try{ neu = document.querySelector(kennung); }catch{ return; }
  if(!neu || neu === document.activeElement) return;
  neu.focus({ preventScroll: true });
  if(pos !== null && typeof neu.setSelectionRange === 'function'){
    try{ neu.setSelectionRange(pos, pos); }catch{ /* Feldtyp erlaubt keine Auswahl */ }
  }
}

/* Vom Nutzer abgelehnte Bewegung gilt auch fuer JavaScript-Animationen –
   die CSS-Regel in style.css erreicht window.scrollTo nicht. */
const wenigerBewegung = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let toastTimer = null;
/* aktion: optional { text, action } – haengt eine Schaltflaeche an, die ueber
   die Aktionstabelle laeuft wie jedes andere Element auch. Bewusst
   createElement statt innerHTML: so stellt sich die Frage nach dem Escapen
   gar nicht erst. */
function toast(msg, big, aktion){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('levelup', !!big);
  if(aktion){
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = aktion.text;
    b.dataset.action = aktion.action;
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), aktion ? 12000 : big ? 5000 : 3200);
}

/* Listener am Fenster und am Dokument. Aus start() heraus registriert und
   nicht mehr im Modulrumpf: sonst haengt schon der blosse Import Handler an
   die Umgebung, und das Modul waere weiterhin nicht ohne Nebenwirkung zu
   laden. */
function installGlobalListeners(){
  /* Ausstehendes Schreiben abschliessen, bevor die Seite verschwindet.

     visibilitychange auf 'hidden' ist auf Mobilgeraeten das verlaessliche
     Signal – beforeunload feuert dort beim App-Wechsel nicht. Beide sind
     registriert, weil visibilitychange beim reinen Schliessen am Desktop
     nicht garantiert ist. */
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'hidden'){ flushSession(); return; }

    /* Zurueck im Vordergrund: beide Zeitgeber sofort abgleichen, statt die
       Anzeige um die Zeit der Drosselung nachlaufen zu lassen. */
    zeitgeberAbgleichen();

    /* Der Browser gibt die Bildschirmsperre frei, sobald das Dokument
       unsichtbar wird. Angefordert wurde sie bisher nur in selectDay() – nach
       dem ersten App-Wechsel schlief der Bildschirm fuer den Rest der Einheit
       wieder ein. requestWakeLock() ist idempotent. */
    if(session.dayKey) requestWakeLock();

    swPruefen();
  });

  /* Ungespeichertes Training beim Verlassen abfangen */
  window.addEventListener('beforeunload', e => {
    flushSession();
    if(session.dayKey && Object.values(session.sets).some(Boolean)){
      e.preventDefault(); e.returnValue = '';
    }
  });

  /* Der Browser meldet die Installierbarkeit mit diesem Ereignis, statt
     selbst zu fragen. preventDefault() unterdrueckt nur seinen eigenen
     Hinweisstreifen; das Ereignis wird aufgehoben und spaeter ueber die
     Schaltflaeche ausgeloest – prompt() ist ausserhalb einer Nutzergeste
     ohnehin nicht erlaubt. */
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installAngebot = e;
    zeigeInstallSchalter();
  });
  window.addEventListener('appinstalled', () => {
    installAngebot = null;
    zeigeInstallSchalter();
    /* Eine installierte App bekommt die Dauerhaftigkeit haeufig erst jetzt. */
    speicherSichern();
  });

  /* Zurueck-Taste und Zurueck-Geste wechseln den Tab, statt die App zu
     schliessen. Dialoge bleiben bewusst aussen vor: sie ueber die History zu
     schliessen verwickelt openDialog/closeDialog mit ihrem Stapel in
     Rueckwaertsspruenge, die sie selbst ausloesen. Escape und ✕ tun es. */
  window.addEventListener('popstate', e => {
    showTab((e.state && e.state.tab) || 'train', true);
  });

  /* Ein zweites Fenster derselben App hat geschrieben.

     Bisher gab es dafuer gar nichts: zwei offene Tabs ueberschrieben sich
     gegenseitig vollstaendig, und zwar still. Ein Fenster von gestern Abend,
     das noch offenlag, machte beim naechsten Tipp den ganzen heutigen
     Verlauf zunichte – der komplette Zustand haengt an einem einzigen
     Schluessel, es gibt keine Teilschreibvorgaenge.

     Die Aufloesung ist in beiden Faellen dieselbe: den fremden Stand
     uebernehmen und die hier laufende Einheit wieder anhaengen. Das einzige,
     was dieses Fenster exklusiv hat, ist session – alles andere ist laengst
     geschrieben. Damit geht in keiner Richtung etwas verloren. */
  window.addEventListener('storage', e => {
    if(e.key !== STORAGE_KEY || !e.newValue) return;
    let fremd;
    try{ fremd = migrateState(JSON.parse(e.newValue)); }
    catch{ return; }                       /* fremder Schrott geht uns nichts an */
    /* Tragend, nicht beilaeufig: Safari hat storage historisch auch im
       schreibenden Fenster ausgeloest. Ohne den Vergleich uebernaehmen sich
       zwei Fenster gegenseitig im Wechsel, ohne je stillzustehen. */
    if(!(fremd.rev > (state.rev || 0))) return;

    state = fremd;

    /* Die hier laufende Einheit muss zurueck in den Speicher – der fremde
       Stand kennt sie nicht. Genau dieser Schreibvorgang loest drueben aber
       die naechste Uebernahme aus, und trainiert man dort ebenfalls, ginge
       das endlos hin und her: es gibt nur einen Platz fuer die laufende
       Einheit, und beide wollen ihn.

       Deshalb die Fensterkennung: steht dort bereits die Einheit eines
       ANDEREN Fensters, ueberschreiben wir sie nicht. Damit ist nach einer
       Antwort Schluss, ohne dass eine Sperre stehen bleibt – und der
       haeufige Fall (ein Fenster trainiert, das andere liegt nur offen)
       schreibt die Einheit jedes Mal verlaesslich zurueck. */
    const fremdeEinheit = state.activeSession;
    const fremdLaeuft = !!(fremdeEinheit && fremdeEinheit.dayKey &&
      fremdeEinheit.tab && fremdeEinheit.tab !== fensterId);
    if(session.dayKey && !fremdLaeuft) persistSession();
    applyTheme();
    /* Der Inhaltsbereich bleibt bei laufender Einheit unberuehrt – renderAll()
       kehrt dafuer frueh zurueck. Ein Neuzeichnen wuerde den Halte-Timer von
       seinem DOM-Knoten trennen und die Haken mitnehmen. */
    renderAll();
    toast(__('syncedFromOtherTab'));
  });

  /* Systemwechsel hell/dunkel – nur wirksam, solange dem System gefolgt wird. */
  const dunkelAbfrage = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  if(dunkelAbfrage && dunkelAbfrage.addEventListener){
    dunkelAbfrage.addEventListener('change', () => { if(!state.theme) applyTheme(); });
  }
}

/* =========================================================
   AKTIONEN
   Die einzige Verbindung zwischen Markup und Logik. Jeder Eintrag bekommt
   (dataset, event, element). dataset-Werte sind immer Strings – die
   Umwandlung passiert hier an der Grenze, nicht im Markup.
   ========================================================= */
export const actions = {
  /* Kopfbereich und Navigation */
  'settings:open':      () => openSettings(),
  'settings:close':     () => closeSettings(),
  /* Nur schliessen, wenn wirklich der Hintergrund getroffen wurde. Aus einem
     Listener am document heraus waere stopPropagation() wirkungslos, deshalb
     ist dieser Vergleich hier tragend und nicht mehr beilaeufig. */
  'settings:closeOnBackdrop': (d, ev, el) => { if(ev.target === el) closeSettings(); },
  'theme:toggle':       () => toggleTheme(),
  'tab:show':           d => showTab(d.tab),

  /* Training */
  'day:select':         d => selectDay(d.key),
  'set:tap':            d => tapSet(d.ex, zahl(d.set)),
  'set:reps':           (d, ev, el) => setRep(d.key, el.value),
  'note:set':           (d, ev, el) => setNote(d.ex, el.value),
  'set:top':            (d, ev, el) => toggleTop(d.ex, el.checked),
  /* mitFokus(): diese Aktionen zeichnen ihren Container neu, das gerade
     betaetigte Element verschwindet dabei und der Fokus fiele auf <body>. */
  'level:adjust':       d => mitFokus(() => adjustLevel(d.ex, zahl(d.delta))),
  'tips:toggle':        d => toggleTips(d.ex),
  'exercise:substitute': d => substituteExercise(d.ex),
  'exercise:skip':      d => skipExercise(d.ex),
  'exercise:unskip':    d => unskipExercise(d.ex),
  'exercise:history':   d => showExHistory(d.ex),
  'exHistory:close':    () => closeExHistory(),
  'workout:finish':     () => finishWorkout(),
  'workout:undo':       () => undoWorkout(),
  'rest:stop':          () => { stopRest(); persistSession(); },
  'rest:extend':        d => restVerlaengern(zahl(d.sec) || 30),
  'sw:update':          () => updateAnwenden(),
  'app:install':        () => appInstallieren(),
  'deload:dismiss':     d => dismissDeload(zahl(d.due)),
  'deload:start':       d => startDeload(zahl(d.due)),
  'deload:end':         () => endDeload(),

  /* Warm-up */
  'warmup:add':         () => addWarmupItem(),
  'warmup:remove':      d => removeWarmupItem(zahl(d.i)),   /* Eintrag ist danach weg – kein Fokusziel */
  'warmup:toggle':      (d, ev, el) => toggleWarmupItem(zahl(d.i), el.checked),

  /* Verlauf */
  'weight:add':         () => addWeight(),
  'measurement:add':    () => addMeasurement(),
  'history:range':      (d, ev, el) => mitFokus(() => setHistRange(el.value)),
  'log:add':            () => addLogEntry(),
  'log:remove':         d => removeLogEntry(zahl(d.i)),
  'calendar:shift':     (d, ev, el) => {
    if(el.getAttribute('aria-disabled') === 'true') return;
    return mitFokus(() => { kalenderVersatz += zahl(d.delta); renderCalendar(); });
  },

  /* Bibliothek */
  'library:filter':     d => mitFokus(() => setLibFilter(d.cat)),
  'library:toggle':     d => mitFokus(() => toggleLib(d.ex)),
  /* Kein mitFokus mehr: das Suchfeld wird nicht mehr ersetzt. */
  'library:search':     () => filterLibrary(),
  'library:sort':       (d, ev, el) => mitFokus(() => setLibSort(el.value)),
  'library:onlyAvailable': (d, ev, el) => { libNurMachbar = el.checked; filterLibrary(); },
  'pr:save':            d => mitFokus(() => savePR(d.ex)),

  /* Plan */
  'plan:change':        (d, ev, el) => changePlan(el.value),
  'plan:reset':         () => resetPlan(),
  'plan:build':         () => generatePlan(),
  'planDay:add':        () => addPlanDay(),
  'planDay:rename':     d => mitFokus(() => renameDay(zahl(d.day))),
  'planDay:remove':     d => removeDay(zahl(d.day)),
  'planEx:add':         d => addEx(zahl(d.day)),
  'planEx:remove':      d => removeEx(zahl(d.day), zahl(d.i)),
  'planEx:move':        d => mitFokus(() => moveEx(zahl(d.day), zahl(d.i), zahl(d.delta))),

  /* Ziele */
  'milestone:toggle':   (d, ev, el) => mitFokus(() => toggleMilestone(d.id, el.checked)),
  'milestone:accept':   d => mitFokus(() => toggleMilestone(d.id, true)),
  'milestone:search':   () => mitFokus(() => renderMilestones()),

  /* Einstellungen */
  'setting:update':     (d, ev, el) => {
    const wert = el.type === 'checkbox' ? el.checked
      : d.type === 'int' ? zahl(el.value)
      : el.value;
    updateSetting(d.key, wert);
  },
  /* Eigene Aktion statt setting:update: dort liegen Skalare in
     state.settings, hier ein Array auf oberster Ebene. */
  'equipment:toggle':   d => toggleEquipment(d.eq),
  'onboarding:start':   () => einstiegLaufen(),
  'onboarding:skip':    () => einstiegBeenden(true),
  'onboarding:again':   () => { closeSettings(); einstiegLaufen(); },

  /* Backup */
  'backup:exportJSON':  () => exportJSON(),
  'backup:exportCSV':   () => exportCSV(),
  'backup:exportText':  () => exportText(),
  'backup:importJSON':  (d, ev, el) => importJSON(el),
  'backup:importCSV':   (d, ev, el) => importCSV(el),
  'backup:remindLater': () => backupSpaeter(),
  'backup:resetAll':    () => resetAll()
};
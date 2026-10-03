/* =========================================================
   PROGRESSION – Start, Training und Aktionstabelle
   Die Tabs Verlauf, Uebungen, Plan und Ziele, Einstellungen, Sicherung und
   Einstieg liegen unter js/features/, Dialoge und Rueckmeldungen unter
   js/ui/, der gemeinsame Zustand in js/core/kern.js (README, Abschnitt 5).
   ========================================================= */

import { backupFaellig } from './domain/backup.js';
import { fmtDate as fmtDatePure, isoWeek, calcGlobalStreak as streakOf, today } from './domain/dates.js';
import { esc } from './domain/escape.js';
import { fokusNachSatz, fokusStart } from './domain/fokus.js';
import { entryHasExercise, repsOf, sekOf, verlaufJeUebung } from './domain/log.js';
import { tagFuerWochentag } from './domain/plan.js';
import { planPruefen, tagesDauerSek, uebungErsetzen, vorlageAufloesen } from './domain/planbuilder.js';
import { detectPlateaus as plateausOf } from './domain/plateau.js';
import { wochenRueckblick } from './domain/rueckblick.js';
import { MAX_LOG_ENTRIES, MAX_WORKOUT_SECS, STATE_VERSION, besserePR, migrateState } from './domain/state.js';
import { gueltigePaare, partnerVon, pauseNachSatz } from './domain/supersatz.js';
import { ZU_SCHWER_NACH, einstiegsziel, halteziel, limitErreicht, tagesziel, zielAuswerten, zielText as zielTextPure, zuSchwer } from './domain/target.js';
import { anlaufSatz, passtZumTag, tagesMerkmale } from './domain/warmup.js';
import { CATS, EXERCISES, EX_BY_ID, MILESTONES, PLAN_TEMPLATES, WARMUP, WARMUP_PFLICHT, WARMUP_WANN } from './exercises.js';
import { LANGS, __, applyStaticTexts, catName, daySub, dayTitle, exName, exStage, exTips, getLang, msName, planName, setLang, warmupText } from './i18n/index.js';
import { STORAGE_KEY, store } from './storage.js';
import { installDelegation, zahl } from './ui/delegate.js';
import { an, cfg, lauf, leereSession, session, setSession, setState, state } from './core/kern.js';
import { equipListe, fehlt, machbar, stufeMachbar, toggleEquipment } from './features/ausruestung.js';
import { exportCSV, exportICS, exportJSON, exportText, importCSV, importJSON, resetAll, shareJSON } from './features/backup.js';
import { filterLibrary, nurMachbarSetzen, renderCatFilter, renderLibrary, savePR, setLibFilter, setLibSort, toggleLib } from './features/bibliothek.js';
import { closeSettings, einstellungZuruecknehmen, erinnerungAbsagen, erinnerungErlauben, erinnerungPlanen, erinnerungTimer, openSettings, settingsUndoTimeout, updateSetting, verwerfeUeberzaehligeSaetze } from './features/einstellungen.js';
import { einstiegBeenden, einstiegLaufen } from './features/einstieg.js';
import { addEx, addPlanDay, changePlan, ensureCustom, generatePlan, installPlanDragAndDrop, moveEx, paarRueckgaengig, paarSchalten, planTempo, removeDay, removeEx, renameDay, renderPlanTab, resetPlan, setWeekPlan } from './features/planeditor.js';
import { addLogEntry, addMeasurement, addWeight, kalenderVerschieben, removeLogEntry, renderHistory, setHistRange } from './features/verlauf.js';
import { addCustomMilestone, erkannteMs, removeCustomMilestone, renderBests, renderMilestones, renderRoadmap, toggleMilestone } from './features/ziele.js';
import { FOCUSABLE, askChoice, askConfirm, askText, closeDialog, openDialog, openDialogEl } from './ui/dialoge.js';
import { ikon, melde, mitFokus, toast, toastTimer, wenigerBewegung } from './ui/hinweise.js';

let holdTimer = null, restTimer = null, wakeLock = null;
let gestoppt = false;
/* Beide Timer richten sich nach einem absoluten Zielzeitpunkt statt nach
   heruntergezaehlten Ticks. Browser drosseln setInterval im Hintergrund auf
   mindestens eine Sekunde und frieren ihn auf Mobilgeraeten ganz ein: eine
   90-Sekunden-Pause, waehrend der das Handy gesperrt war, ging vorher um
   genau die Sperrzeit nach. Der Tick zeichnet nur noch. */
const TAKT = 250;
let restEnde = 0;
/* Wann die laufende Pause begann – fuer den Ring im Fokus-Modus, der den
   Anteil der verbleibenden Zeit zeigt. Eine Verlaengerung behaelt den
   Beginn, sonst sprange der Ring bei +30 auf voll. */
let restStart = 0;
/* Der Schritt, der im Fokus-Modus zu sehen ist, oder null: dann der erste
   offene (fokusStart()). Nur zur Laufzeit – nach dem Neuladen geht es beim
   ersten offenen weiter, und das ist in aller Regel derselbe. */
let fokusIdx = null;
/* Zuletzt angekuendigte Restsekunde – gegen vier Toene pro Sekunde. */
let restLetzteSek = 0;
let storageOK = true, lastWorkoutSnapshot = null, undoTimeout = null;
/* Das Abschlussblatt der zuletzt beendeten Einheit, bis es geschlossen oder
   ein neuer Tag gewaehlt wird. Kennungen statt Texte: ein Sprachwechsel soll
   es nicht in der alten Sprache stehen lassen. */
let abschluss = null;
/* Waehrend einer Einheit ist die Tagesauswahl zu einer Zeile eingeklappt;
   aufgeklappt wird sie nur ueber "Tag wechseln". */
let tagWahlOffen = false;
/* Die zuletzt verworfene Einheit, solange der Toast sie zurueckholen kann. */
let verworfen = null, verworfenTimeout = null;

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
      setState(migrateState(loaded));
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
    installDelegation(actions, document, lauf.signal);
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

/* Raeumt diese Instanz ab: Listener, Timer, ausstehende Schreibvorgaenge.
   Nur fuer die Tests, die die App je Test neu starten – siehe `lauf`. */
export function stop(){
  gestoppt = true;
  lauf.abort();
  clearTimeout(schreibTimer); schreibTimer = null;
  if(holdTimer){ clearInterval(holdTimer.interval); holdTimer = null; }
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
  [undoTimeout, erinnerungTimer, settingsUndoTimeout, toastTimer].forEach(t => clearTimeout(t));
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

export async function zeigeSpeicherinfo(){
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

export function zeigeInstallSchalter(){
  const b = document.getElementById('installBtn');
  if(b) b.hidden = !installAngebot;
}

/* Kann dieses Geraet Dateien teilen? Gefragt wird mit einer Beispieldatei,
   nicht nur nach dem Vorhandensein von navigator.share: Desktop-Browser
   kennen share() haeufig, canShare({files}) aber nicht – ein Knopf, der
   dort ins Leere liefe, waere schlimmer als keiner. */
export function kannTeilen(){
  try{
    return !!(navigator.canShare && navigator.share &&
      navigator.canShare({ files: [new File(['{}'], 'p.json', { type: 'application/json' })] }));
  }catch{
    return false;
  }
}
export function zeigeTeilenSchalter(){
  const b = document.getElementById('shareBtn');
  if(b) b.hidden = !kannTeilen();
}

async function appInstallieren(){
  if(!installAngebot) return;
  installAngebot.prompt();
  await installAngebot.userChoice;
  /* Ein Angebot laesst sich nur einmal ausloesen. */
  installAngebot = null;
  zeigeInstallSchalter();
}

export async function save(){
  /* Eine abgeraeumte Instanz schreibt nichts mehr – auch kein Speichern,
     das vor stop() angestossen wurde und erst danach dran ist. */
  if(gestoppt) return;
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
      reps: { ...session.reps }, sek: { ...session.sek }, notes: { ...session.notes },
      subs: { ...session.subs }, skip: { ...session.skip },
      warm: { ...session.warm }, an: { ...session.an }, start: session.start || null,
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

export function clearSession(){
  /* Verwerfen, nicht ausspuelen: der Zustand wird ohnehin gleich ersetzt,
     ein ausstehender Schreibvorgang wuerde die alte Session zurueckholen. */
  clearTimeout(schreibTimer);
  schreibTimer = null;
  setSession(leereSession());
  state.activeSession = null;
}
function restoreActiveSession(){
  const a = state.activeSession;
  if(!a || !a.dayKey) return false;
  /* Eine Einheit von gestern ist keine laufende Einheit mehr. */
  if(a.d && a.d !== today()){ state.activeSession = null; return false; }
  if(!getDay(a.dayKey)) { state.activeSession = null; return false; }
  setSession({
    dayKey: a.dayKey, sets: a.sets || {}, top: a.top || {},
    reps: a.reps || {}, sek: a.sek || {}, notes: a.notes || {},
    subs: a.subs || {}, skip: a.skip || {},
    warm: a.warm || {},
    an: a.an && typeof a.an === 'object' ? a.an : {},
    /* Ein verbogener Zeitstempel wuerde eine absurde Dauer ergeben; die
       Plausibilitaet prueft dauerJetzt() beim Abschliessen. */
    start: Number.isFinite(Number(a.start)) ? Number(a.start) : null
  });
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
  /* Wer eine Zahl aendert, sieht sofort, ob das Limit damit steht. */
  topLimitAktualisieren(key.slice(0, key.lastIndexOf('-')));
  /* Entprellt: hier feuert jeder Tastendruck. Satz-Tap, Top-Haekchen und
     Tagwechsel schreiben weiterhin sofort – dort ist ein Schreibvorgang pro
     Interaktion angemessen. */
  persistSessionSpaeter();
}

/* Gehaltene Sekunden von Hand, etwa wenn mit einer anderen Uhr gestoppt
   wurde oder der Countdown zu frueh beendet war. Wie setRep(): der Satz
   wird dadurch nicht abgehakt. */
function setSek(key, value){
  const n = parseInt(value, 10);
  if(Number.isFinite(n) && n > 0) session.sek[key] = n; else delete session.sek[key];
  topLimitAktualisieren(key.slice(0, key.lastIndexOf('-')));
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

export function renderAll(){
  /* Auch die Aufwaermliste: ihre Haken gehoeren zur Einheit, und die endet
     hier (Abschluss, Rueckgaengig, Import, Zuruecksetzen). Ohne das blieben
     sie nach dem Abschluss stehen und die naechste Einheit begaenne mit
     einem fertig abgehakten Aufwaermen. */
  renderWarmup();
  renderStats(); renderPhase(); renderBanners(); renderDaySelect();
  /* Ein laufendes Training nicht ueberschreiben. Alle Aufrufer, die eine
     Einheit beenden oder verwerfen, setzen session.dayKey vorher auf null. */
  if(session.dayKey){ fokusAnwenden(); return; }
  fokusIdx = null;
  document.getElementById('content').innerHTML = abschlussHtml() +
    '<div class="empty-hint">' + esc(__('selectDay')) + '.<br><br>' +
    esc(__('selectDayHint')) + '</div>';
  fokusAnwenden();
}

/* Abschlussblatt: was die Einheit gebracht hat, auf einen Blick.

   Bisher kam nach "Fertig" ein Toast und, je nachdem, zwei weitere im
   Abstand von 2,6 Sekunden – ein Aufstieg, eine an fehlendem Geraet
   haengende Stufe, ein erkannter Meilenstein. Wer beim ersten wegsah, bekam
   den Rest nicht mit, und wie die Einheit im Vergleich zur letzten lief,
   stand nirgends. Jetzt steht alles zusammen da, bis man es schliesst. */
function abschlussHtml(){
  const a = abschluss;
  if(!a) return '';
  const day = getDay(a.day);
  const titel = esc(a.day) + (day ? ' · ' + esc(dayTitleOf(day)) : '');
  const differenz = (jetzt, vorher) => {
    if(vorher == null) return '';
    const d = jetzt - vorher;
    return '<small>' + esc(__('summaryVsLast', { d: d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '±0' })) + '</small>';
  };
  const v = a.vorher;
  const kachel = (wert, label, diff) => '<div class="fertig-zahl"><b>' + wert + '</b><span>' + esc(label) + '</span>' + diff + '</div>';
  const minuten = s => Math.round(s / 60);
  const kacheln = [
    a.dauer ? kachel(minuten(a.dauer), __('summaryMinutes'), v && v.dauer ? differenz(minuten(a.dauer), minuten(v.dauer)) : '') : '',
    kachel(a.sets, __('summarySets'), differenz(a.sets, v && v.sets)),
    a.reps ? kachel(a.reps, __('summaryReps'), differenz(a.reps, v && v.reps || null))
      : a.sek ? kachel(a.sek, __('summarySecs'), differenz(a.sek, v && v.sek || null)) : ''
  ].join('');
  const punkte = [
    ...a.ups.map(u => EX_BY_ID[u.id] ? '<li class="fertig-up">' + ikon('levelup') + esc(__('summaryLevelUp', {
      name: exName(EX_BY_ID[u.id]), stufe: exStage(EX_BY_ID[u.id], u.lvl)
    })) + '</li>' : ''),
    ...a.prs.map(id => EX_BY_ID[id] && state.prs[id] ? '<li class="fertig-pr">' + ikon('goals') + esc(__('summaryPR', {
      name: exName(EX_BY_ID[id]), v: state.prs[id].v
    })) + '</li>' : ''),
    ...a.gesperrt.map(g => EX_BY_ID[g.id] ? '<li>' + esc(__('levelBlockedByEquip', {
      name: exName(EX_BY_ID[g.id]), list: equipListe(g.fehlt)
    })) + '</li>' : ''),
    ...a.ms.map(id => { const m = MILESTONES.find(x => x.id === id); return m ? '<li>' + esc(__('msDetectedToast', { name: msName(m) })) + '</li>' : ''; })
  ].join('');
  return '<section class="card fertig" id="abschluss" aria-labelledby="abschluss-titel">' +
    '<div class="fertig-kopf"><h2 id="abschluss-titel" tabindex="-1">' + esc(__('summaryTitle')) + ' <span>' + titel + '</span></h2>' +
    '<button type="button" class="icon-btn" data-action="summary:close" aria-label="' + esc(__('summaryClose')) + '">' + ikon('close') + '</button></div>' +
    '<div class="fertig-zahlen">' + kacheln + '</div>' +
    (punkte ? '<ul class="fertig-liste">' + punkte + '</ul>' : '') +
    '<div class="fertig-aktionen"></div></section>';
}
function abschlussSchliessen(){
  abschluss = null;
  renderAll();
}

/* Setzt alles, was ausserhalb der Render-Funktionen von der Sprache abhaengt. */
export function applyLanguage(){
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
const THEME_ZEICHEN = { null: 'auto', light: 'sun', dark: 'moon' };
const THEME_TEXT = { null: 'themeSystem', light: 'themeLight', dark: 'themeDark' };

const systemDunkel = () =>
  !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);

export function applyTheme(){
  const wunsch = state.theme === 'light' || state.theme === 'dark' ? state.theme : null;
  const t = wunsch || (systemDunkel() ? 'dark' : 'light');
  document.documentElement.dataset.theme = t;

  const btn = document.getElementById('themeBtn');
  if(btn){
    /* Das Zeichen benennt den AKTUELLEN Zustand, nicht den naechsten Schritt.
       Bei drei Moeglichkeiten waere "was passiert beim Tippen" nicht mehr
       aus einem Symbol ablesbar. */
    btn.innerHTML = ikon(THEME_ZEICHEN[wunsch]);
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
  return vorlageFuerAusruestung(state.planId);
}

/* Die Vorlage, aufgeloest fuer die eigene Ausruestung: nicht machbare
   Uebungen sind durch solche mit demselben Muster ersetzt. Gemerkt je Plan
   und Ausruestung – getPlan() laeuft bei jedem Rendern. */
let vorlageCache = { schluessel: null, plan: null };
export function vorlageFuerAusruestung(planId){
  const vorlage = PLAN_TEMPLATES[planId] || PLAN_TEMPLATES.ab4;
  const schluessel = planId + '|' + (state.equipment || []).join(',');
  if(vorlageCache.schluessel !== schluessel){
    vorlageCache = { schluessel, plan: vorlageAufloesen(vorlage, EXERCISES, state.equipment) };
  }
  return vorlageCache.plan;
}
export function getDays(){ return getPlan().days || []; }
export function getDay(key){ return getDays().find(d => d.key === key); }

/* Anzeigename des Plans. Ein eigener Plan traegt einen vom Nutzer gewaehlten
   bzw. uebernommenen Namen und wird nicht uebersetzt. */
export function planLabel(){
  return state.customPlan ? __('customPlan') : planName(state.planId, getPlan().name);
}
/* Titel und Untertitel eines Vorlagen-Tages. Bei einem eigenen Plan stammen
   sie vom Nutzer und bleiben unveraendert. */
export function dayTitleOf(d){
  return state.customPlan ? d.title : dayTitle(state.planId, d.key, d.title);
}
function daySubOf(d){
  return state.customPlan ? d.sub : daySub(state.planId, d.key, d.sub);
}

/* Der Plan-Tag von heute laut Wochenrhythmus, oder null. Null heisst
   entweder "kein Rhythmus eingerichtet" oder "heute ist Ruhetag" – fuer die
   Anzeige unterscheidet das heuteIstRuhetag(). */
export function heutigerPlanTag(){
  const key = tagFuerWochentag(state.wochenplan, today());
  return (key && getDay(key)) ? key : null;
}
export const rhythmusAktiv = () => Object.keys(state.wochenplan || {}).length > 0;

function nextSuggestedKey(){
  const days = getDays();
  if(!days.length) return null;
  /* Der feste Rhythmus geht vor: wer Mo/Mi/Fr traegt, will am Mittwoch den
     Mittwochs-Tag vorgeschlagen bekommen und nicht den, der in der Rotation
     als naechster dran waere. */
  const heute = heutigerPlanTag();
  if(heute) return heute;
  const last = (state.log || []).slice(-1)[0];
  if(!last) return days[0].key;
  const i = days.findIndex(d => d.key === last.day);
  return days[(i + 1) % days.length].key;
}

/* ================= Kopfbereich ================= */
const einheitenDieseWoche = () => (state.log || []).filter(l => isoWeek(l.d) === isoWeek(today())).length;
export function renderStats(){
  /* Echte Level-Ups aus dem Log zaehlen. Frueher wurde die Summe der
     Stufen-Indizes gebildet, sodass jede manuelle Korrektur ueber die
     +/--Buttons den Zaehler mit aufgeblaeht hat. */
  const ups = (state.log || []).reduce((a, l) => a + ((l.ups && l.ups.length) || 0), 0);
  const ms = Object.keys(state.milestones || {}).length;
  const thisWeek = einheitenDieseWoche();
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
  /* Ohne Entlastungswoche ausgewertet: Deload-Einheiten zaehlen dort
     ohnehin nicht mit, und die uebrigen hatten die vollen Saetze. */
  const ziel = (ex, lvl) => zielAuswerten(ex.levels[lvl], cfg('setsMode'));
  return plateausOf(getDays(), state.log || [], state.levels, EX_BY_ID, ziel)
    .map(id => exName(EX_BY_ID[id]));
}

/* Nach einer laengeren Pause eine Stufe zurueckgehen.

   Die Funktion existierte vollstaendig, wurde aber nie aufgerufen – das
   Feature war unsichtbar. Zwei Dinge fehlten fuer den produktiven Einsatz:
   eine Abschaltmoeglichkeit und ein Schutz gegen mehrfaches Ausloesen.
   Ohne den zweiten wuerde jeder App-Start waehrend derselben Pause erneut
   eine Stufe abziehen. */
const REGRESSION_DAYS = 14;
/* Beweglichkeit baut nicht ab wie Kraft. Zurueckgestuft wurde bisher jede
   Uebung in state.levels – nach einem Urlaub fielen also auch die
   Handgelenks-Routine, die Pike-Vorbeuge und die Bruecke je eine Stufe.
   Ausgerechnet die Aufwaermroutine zurueckzunehmen ist das Gegenteil dessen,
   wozu die App sonst raet, und eine Grundspanne bleibt nach zwei Wochen
   ohnehin. Skills fallen weiter mit: beim Handstand ist ein Schritt zurueck
   nach der Pause keine Strafe, sondern Vorsicht. */
const REGRESSION_AUSGENOMMEN = new Set(['mobility']);

function applyRegression(){
  if(!cfg('regress') || !state.lastDate) return;
  /* Pro Pause nur einmal: gemerkt wird das Datum der letzten Einheit. */
  if(state.regressedFor === state.lastDate) return;

  const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
  if(days < REGRESSION_DAYS) return;

  const namen = [];
  Object.keys(state.levels).forEach(id => {
    const ex = EX_BY_ID[id];
    if(!ex || REGRESSION_AUSGENOMMEN.has(ex.cat) || !(state.levels[id] > 0)) return;
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

export function renderBanners(){
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
    html += hinweis('info', __('welcomeTitle'), esc(__('welcomeBody')),
      knopf('onboarding:start', __('welcomeStart'), true) + knopf('onboarding:skip', __('later')));
  }

  if(deloadAktiv()){
    html += hinweis('info', __('deloadActive', { date: fmtDate(state.deload.bis) }), esc(__('deloadHint')),
      knopf('deload:end', __('deloadEnd')));
  }
  const every = cfg('deload');
  if(every > 0 && !deloadAktiv()){
    const due = Math.floor((state.workouts || 0) / every) * every;
    if(due > 0 && due > (state.deloadDismissed || 0)){
      html += hinweis('warn', __('deloadTitle'), esc(__('deloadBody', { n: state.workouts })),
        knopf('deload:start', __('deloadStart'), true, ' data-due="' + due + '"') +
        knopf('deload:dismiss', __('understood'), false, ' data-due="' + due + '"'));
    }
  }
  if(state.lastDate){
    const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
    if(days >= 7){
      html += hinweis('info', __('layoffTitle', { n: days }), esc(__('layoffBody')), '');
    }
  }
  const plateaus = detectPlateaus();
  if(plateaus.length){
    html += hinweis('warn', __('plateauDetected') + ': ' + plateaus.join(', ') + '.', esc(__('plateauMsg')), '');
    /* Deload-Vorschlag: mehrere stagnierende Uebungen sind ein Zeichen fuer
       eine Entlastungswoche – die Erinnerung zaehlt nur Einheiten. */
    if(plateaus.length >= 2 && !deloadAktiv() && !state.deloadPlateauDismissed){
      html += hinweis('info', __('deloadPlateauTitle'), esc(__('deloadPlateauBody')),
        knopf('deload:start', __('deloadStart'), true) + knopf('deload:plateauDismiss', __('understood')));
    }
  }
  /* Plan-Check: nur zwischen den Einheiten – mitten im Training den Plan
     umzubauen, waere eine Stoerung. Immer nur ein Vorschlag, der naechste
     kommt nach der Antwort. */
  const vorschlag = session.dayKey ? null : planVorschlag();
  if(vorschlag){
    const alt = EX_BY_ID[vorschlag.alt], neu = EX_BY_ID[vorschlag.neu];
    html += hinweis('info', __('planCheckTitle'),
      esc(__(vorschlag.grund === 'hilfeFertig' ? 'planCheckHelper' : 'planCheckMaxed', { alt: exName(alt), neu: exName(neu) })),
      knopf('planCheck:apply', __('planCheckApply'), true, ' data-alt="' + vorschlag.alt + '" data-neu="' + vorschlag.neu + '"') +
      knopf('planCheck:dismiss', __('planCheckKeep'), false, ' data-alt="' + vorschlag.alt + '" data-neu="' + vorschlag.neu + '"'));
  }
  /* Der Verlauf liegt nur in diesem Browser. Exportieren konnte man ihn
     immer, aber nichts hielt fest, wann das zuletzt geschah, und nichts
     erinnerte daran. */
  const backup = backupFaellig(state, today());
  if(backup){
    html += hinweis('warn', __('backupDueTitle'),
      esc(__('backupDue' + backup.grund[0].toUpperCase() + backup.grund.slice(1), { n: backup.n })),
      knopf('backup:exportJSON', __('downloadBackup'), true) + knopf('backup:remindLater', __('later')));
  }
  el.innerHTML = html;
}

/* Ein Hinweis ueber der Tagesauswahl: Titel, Erklaerung, Knoepfe.

   Vorher war jeder eine volle farbige Flaeche mit Knoepfen darunter. Nach 30
   Einheiten standen zwei davon (Entlastungswoche, Sicherung) uebereinander
   und schoben die Tagesauswahl auf dem Handy unter die erste
   Bildschirmhoehe. Jetzt traegt nur ein Randstreifen die Farbe, die
   Erklaerung steht leiser darunter, und die Knoepfe sitzen daneben, wo
   Platz ist. Weg sind die Hinweise damit nicht – nur leiser.
   text kommt schon maskiert herein, titel nicht. */
function hinweis(art, titel, text, knoepfe){
  return '<div class="banner ' + art + '"><div class="banner-text"><b>' + esc(titel) + '</b>' +
    (text ? ' <span class="banner-body">' + text + '</span>' : '') + '</div>' +
    (knoepfe ? '<div class="banner-actions">' + knoepfe + '</div>' : '') + '</div>';
}
export function knopf(aktion, beschriftung, haupt = false, extra = ''){
  return '<button data-action="' + aktion + '"' + extra + (haupt ? ' class="haupt"' : '') + '>' +
    esc(beschriftung) + '</button>';
}
function planVorschlag(){
  const aus = new Set(state.planHinweiseAus || []);
  return planPruefen(getDays(), EXERCISES, state.equipment, state.levels)
    .find(v => !aus.has(v.alt + '>' + v.neu)) || null;
}
function planCheckAnwenden(alt, neu){
  /* Nur einen Vorschlag, den der Check auch macht – nicht, was im
     data-Attribut steht. */
  if(!planPruefen(getDays(), EXERCISES, state.equipment, state.levels).some(v => v.alt === alt && v.neu === neu)) return;
  const p = ensureCustom();
  p.days = uebungErsetzen(p.days, alt, neu);
  save();
  renderBanners(); renderDaySelect(); renderPlanTab();
  toast(__('planCheckDone', { neu: exName(EX_BY_ID[neu]) }), true);
}
function planCheckAblehnen(alt, neu){
  if(!EX_BY_ID[alt] || !EX_BY_ID[neu]) return;
  state.planHinweiseAus = [...(state.planHinweiseAus || []), alt + '>' + neu];
  save(); renderBanners();
}
function dismissDeload(n){ state.deloadDismissed = n; save(); renderBanners(); }
function backupSpaeter(){ state.backupDismissed = state.workouts || 0; save(); renderBanners(); }

export function renderWarmup(){
  /* Nur die Standardliste wird übersetzt – eigene Einträge des Nutzers
     stehen in state.warmupCustom und bleiben so, wie er sie geschrieben hat. */
  const items = state.warmupCustom || WARMUP.map((w, i) => warmupText(i, w));
  const el = document.getElementById('warmupList');
  /* Mit gewaehltem Tag nur, was zu ihm passt (js/domain/warmup.js). Ohne
     Tag die ganze Liste. Eine eigene Liste behaelt die Zuordnung fuer
     die Punkte, die aus der Vorgabe stammen; selbst geschriebene kommen
     immer dran. Der Index bleibt der der ganzen Liste – an ihm haengen
     die Haken und das Entfernen. */
  const day = session.dayKey ? getDay(session.dayKey) : null;
  const zeigen = warmupPasst(items);
  const aus = zeigen.filter(z => !z).length;
  el.innerHTML = items.map((w, i) => !zeigen[i] ? '' :
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
    ' aria-label="' + esc(__('warmupRemoveAria', { item: w })) + '">' + ikon('close') + '</button></li>'
  ).join('') + anlaufHtml() +
    (aus ? '<li class="warm-note">' + esc(__('warmupFiltered', { day: day.key, n: aus })) + '</li>' : '');
}
/* Der Anlaufsatz zur ersten Kraftuebung des gewaehlten Tags
   (js/domain/warmup.js). Er steht zuletzt, direkt vor der ersten Uebung,
   und laesst sich nicht entfernen: er ist keine Zeile der Liste, sondern
   folgt dem Stand. Sein Haken heisst "anlauf" statt einer Zahl, damit ihn
   das Nachruecken beim Entfernen nicht verschiebt. */
function anlaufHtml(){
  const day = session.dayKey ? getDay(session.dayKey) : null;
  const a = day && anlaufSatz(day.ex.map(id => session.subs[id] || id), EX_BY_ID, state.levels);
  if(!a) return '';
  const ex = EX_BY_ID[a.id];
  const menge = __(a.art === 'sek' ? 'rampSek' : a.art === 'versuche' ? 'rampVersuche' : 'rampWdh', { n: a.menge });
  const text = __(a.leichter ? 'warmupRamp' : 'warmupRampSame', { menge, stufe: exStage(ex, a.stufe) });
  return '<li class="warm-anlauf"><label class="warm-item"><input type="checkbox"' +
    (session.warm.anlauf ? ' checked' : '') + ' data-action-change="warmup:ramp">' +
    '<span>' + esc(text) + '</span></label></li>';
}
/* Je Punkt, ob er zum gewaehlten Tag passt; ohne Tag alle. */
function warmupPasst(items){
  const day = session.dayKey ? getDay(session.dayKey) : null;
  if(!day) return items.map(() => true);
  const merkmale = tagesMerkmale(day.ex.map(id => session.subs[id] || id), EX_BY_ID);
  return items.map((w, i) =>
    passtZumTag(state.warmupCustom ? warmupWannFuer(w) : WARMUP_WANN[i], merkmale, state.equipment));
}
/* Die Bedingung eines Punkts aus einer eigenen Liste: die des gleich
   lautenden Vorgabepunkts, in welcher Sprache er auch kopiert wurde. */
function warmupWannFuer(text){
  const j = WARMUP.findIndex((w, i) => w === text || warmupText(i, w) === text);
  return j >= 0 ? WARMUP_WANN[j] : 'immer';
}
function toggleWarmupItem(i, on){
  if(on) session.warm[i] = true; else delete session.warm[i];
  /* Ohne gewaehlten Tag gibt es keine activeSession, in die das mitgehen
     koennte – die Haken leben dann nur bis zum Neuladen. Mit Tag gehen sie
     denselben Weg wie jeder Satz. */
  if(session.dayKey) persistSession();
}
/* Die Kopie der Vorgabe in der Sprache der Oberflaeche. Bisher wurde die
   deutsche Liste kopiert, und wer in der englischen Oberflaeche einen
   Punkt entfernte, hatte danach ein deutsches Aufwaermen. */
const warmupKopie = () => WARMUP.map((w, i) => warmupText(i, w));
function removeWarmupItem(i){
  if(!state.warmupCustom) state.warmupCustom = warmupKopie();
  state.warmupCustom.splice(i, 1);
  /* Die Haken haengen an der Position. Ohne dieses Nachruecken wandert
     jeder Haken hinter der geloeschten Zeile eine Zeile nach oben und sitzt
     danach an einem Punkt, den niemand abgehakt hat. */
  const verschoben = session.warm.anlauf ? { anlauf: true } : {};
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
  if(!state.warmupCustom) state.warmupCustom = warmupKopie();
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
export function showTab(t, ausHistory = false){
  if(!TABS.includes(t)) t = 'train';
  if(!ausHistory && t !== aktiverTab) history.pushState({ tab: t }, '', '#' + t);
  aktiverTab = t;
  /* Fuer das Stylesheet: auf dem Handy stehen die Kennzahlen nur im
     Training (siehe css/style.css). */
  document.body.dataset.tab = t;
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

/* Ab dieser Breite steht die Tableiste als Schiene links neben dem Inhalt
   (siehe den min-width-Block in css/style.css). Zwei Dinge haengen daran, die
   ein Stylesheet nicht setzen kann: aria-orientation und die Frage, welche
   Pfeiltasten navigieren. Das ARIA-Tabs-Muster verlangt fuer eine senkrechte
   Leiste ↑/↓ – waagerechte Pfeile tun dort nichts.

   matchMedia kann fehlen (jsdom kennt es nicht); ohne die Abfrage bleibt es
   bei der waagerechten Leiste, also beim bisherigen Verhalten. */
const SCHIENE_AB = '(min-width:1040px)';
const schienenAbfrage = globalThis.matchMedia ? matchMedia(SCHIENE_AB) : null;
const senkrechteLeiste = () => !!(schienenAbfrage && schienenAbfrage.matches);

function tablistAusrichten(){
  const leiste = document.querySelector('.tabs');
  if(!leiste) return;
  /* Waagerecht ist die Vorgabe des Musters und braucht kein Attribut – es zu
     setzen waere Rauschen, es stehenzulassen waere falsch. */
  if(senkrechteLeiste()) leiste.setAttribute('aria-orientation', 'vertical');
  else leiste.removeAttribute('aria-orientation');
}

/* Pfeiltasten-Navigation innerhalb der Tableiste (ARIA-Tabs-Muster). */
function addTablistNavigation(){
  tablistAusrichten();
  /* Wer das Fenster verkleinert, soll nicht mit einer Leiste dastehen, die
     sich noch fuer senkrecht haelt. */
  if(schienenAbfrage && schienenAbfrage.addEventListener){
    an(schienenAbfrage, 'change', tablistAusrichten);
  }
  an(document.querySelector('.tabs'), 'keydown', e => {
    const keys = senkrechteLeiste()
      ? { ArrowDown: 1, ArrowUp: -1, Home: 'first', End: 'last' }
      : { ArrowRight: 1, ArrowLeft: -1, Home: 'first', End: 'last' };
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
  an(document, 'keydown', e => {
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
      /* Im Fokus-Modus der naechste Satz der sichtbaren Uebung. */
      const firstUndone = document.querySelector('#content.fokus .fokus-aktiv .set-dot:not(.done)') ||
        document.querySelector('.set-dot:not(.done)');
      if(firstUndone) firstUndone.click();
      return;
    }
    if(e.key === 'r' || e.key === 'R'){
      if(restEnde > 0){
        stopRest(); persistSession();
      } else if(session.dayKey){
        const defaultRest = cfg('rest');
        startRest(defaultRest);
        persistSession();
        toast(__('restLabel', { sec: defaultRest }));
        /* Screenreader-Ansage: der Toast ist sichtbar, aber nicht hoerbar. */
        melde(__('shortcutRest', { sec: defaultRest }));
      }
      return;
    }
    /* Zwischen den Uebungen einer Einheit springen.

       Die Leertaste trifft immer den ersten offenen Satz der ganzen Seite –
       das ist der richtige Weg durch eine Einheit, die man der Reihe nach
       abarbeitet. Wer eine Uebung ueberspringen oder zu einer frueheren
       zurueck will, hatte bisher nur die Maus.

       Die Tableiste hoert je nach Ausrichtung auf die waagerechten ODER die
       senkrechten Pfeile und verbraucht die Taste dann per preventDefault.
       Der Sprung hier oben ist auf defaultPrevented abgesichert, es kommt
       also auch in der Schiene zu keiner doppelten Wirkung. */
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
      const ziel = tabs[parseInt(e.key) - 1];
      showTab(ziel);
      melde(__('shortcutTab', { name: __(ziel) }));
    }
  });
}

/* ================= Trainingstag wählen ================= */
export function renderDaySelect(){
  const sug = nextSuggestedKey();
  renderRueckblick();
  renderHeuteKarte(sug);
  const sel = document.getElementById('daySelect');
  /* Waehrend einer Einheit standen hier alle Tage gross ueber dem Training,
     und ein Tipp auf einen davon ersetzte die laufende Einheit wortlos durch
     eine leere. Jetzt steht nur eine Zeile mit dem laufenden Tag da; die
     Tage erscheinen erst nach "Tag wechseln", und der Wechsel fragt nach. */
  const laeuft = session.dayKey ? getDay(session.dayKey) : null;
  if(!laeuft) tagWahlOffen = false;
  const zeile = laeuft ? '<div class="tag-laeuft">' +
    '<span class="tl-name"><small>' + esc(__('dayRunning')) + '</small>' +
      esc(laeuft.key) + ' · ' + esc(dayTitleOf(laeuft)) + '</span>' +
    '<button type="button" class="tl-btn" data-action="day:change" aria-expanded="' + tagWahlOffen + '">' +
      ikon('swap') + esc(__(tagWahlOffen ? 'dayChangeClose' : 'dayChange')) + '</button>' +
    '<button type="button" class="tl-btn tl-weg" data-action="workout:discard" aria-label="' + esc(__('workoutDiscardAria')) +
      '" title="' + esc(__('workoutDiscardAria')) + '">' + ikon('close') + '</button></div>' : '';
  /* Neben der Heute-Karte werden die Tage klein: gewaehlt wird dort nur,
     wer heute etwas anderes machen will. */
  sel.classList.toggle('klein', (!session.dayKey && !!sug) || tagWahlOffen);
  if(laeuft && !tagWahlOffen){ sel.innerHTML = zeile; renderHeute(); return; }
  sel.innerHTML = zeile + getDays().map(d =>
    /* Der Tag-Key stammt aus einer Nutzereingabe und darf nicht in einen
       JS-String im Attribut interpoliert werden – esc() hilft dort nicht,
       weil der HTML-Parser die Entities vor der JS-Auswertung zurueckwandelt.
       Deshalb data-key + delegierter Listener (siehe unten). */
    '<button class="day-btn' + (session.dayKey === d.key ? ' active' : '') +
      '" data-action="day:select" data-key="' + esc(d.key) + '">' +
    '<div class="tag">' + esc(d.key) + ' · ' + esc(dayTitleOf(d)) + '</div>' +
    '<div class="sub">' + esc(daySubOf(d) || __('exercisesCount', { n: d.ex.length })) + '</div></button>'
  ).join('') || '<div class="empty-hint">' + esc(__('noPlanDays') + __('noPlanDaysHint')) + '</div>';
  renderHeute();
}

/* Der Wochenrueckblick (js/domain/rueckblick.js) ueber der Heute-Karte:
   was die letzte volle Woche gebracht hat, gegen die Woche davor.

   Er steht, bis er geschlossen wird oder die erste Einheit der neuen Woche
   fertig ist – danach ist das Abschlussblatt die frischere Nachricht. Nie
   waehrend einer Einheit. Ohne Training in der letzten Woche gibt es keinen:
   eine Karte "0 Einheiten" am Montag waere ein Vorwurf. */
function renderRueckblick(){
  const el = document.getElementById('rueckblick');
  if(!el) return;
  const woche = isoWeek(today());
  const r = !session.dayKey && state.rueckblickZu !== woche &&
    !(state.log || []).some(l => isoWeek(l.d) === woche) ? wochenRueckblick(state.log) : null;
  if(!r){ el.innerHTML = ''; return; }
  const v = r.vorwoche;
  /* Vier schmale Kacheln in einer Zeile; die Differenz steht als Zahl
     neben dem Wert, wogegen verglichen wird, einmal in der Unterzeile. */
  const differenz = (jetzt, vorher) => {
    if(vorher == null) return '';
    const d = jetzt - vorher;
    return ' <small>' + (d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '±0') + '</small>';
  };
  const kachel = (wert, label, diff) => '<div class="fertig-zahl"><b>' + wert + diff + '</b><span>' + esc(label) + '</span></div>';
  const minuten = s => Math.round(s / 60);
  const kacheln = [
    kachel(r.einheiten, __('reviewSessions'), differenz(r.einheiten, v && v.einheiten)),
    kachel(r.saetze, __('summarySets'), differenz(r.saetze, v && v.saetze)),
    r.wdh ? kachel(r.wdh, __('reviewReps'), v && v.wdh ? differenz(r.wdh, v.wdh) : '') : '',
    r.dauer ? kachel(minuten(r.dauer), __('reviewMinutes'), v && v.dauer ? differenz(minuten(r.dauer), minuten(v.dauer)) : '') : ''
  ].join('');
  const unterzeile = __('reviewWeek', { kw: Number(r.woche.slice(-2)) }) +
    (v ? ' · ' + __('reviewVsPrev', { kw: Number(r.davor.slice(-2)) }) : '');
  /* Hoechstens vier Aufstiege mit Namen, der Rest als Zahl. */
  const ups = r.ups.filter(id => EX_BY_ID[id]);
  const namen = ups.slice(0, 4).map(id => exName(EX_BY_ID[id])).join(', ') +
    (ups.length > 4 ? ' ' + __('reviewMore', { n: ups.length - 4 }) : '');
  el.innerHTML = '<section class="card fertig rueckblick" aria-labelledby="rueckblick-titel">' +
    '<div class="fertig-kopf"><h2 id="rueckblick-titel">' + esc(__('reviewTitle')) +
      ' <span>' + esc(unterzeile) + '</span></h2>' +
    '<button type="button" class="icon-btn" data-action="review:close" aria-label="' + esc(__('reviewClose')) + '">' + ikon('close') + '</button></div>' +
    '<div class="fertig-zahlen">' + kacheln + '</div>' +
    '<ul class="fertig-liste">' + (ups.length
      ? '<li class="fertig-up">' + ikon('levelup') + esc(__(ups.length === 1 ? 'reviewUpsOne' : 'reviewUpsMany', { n: ups.length, list: namen })) + '</li>'
      : '<li>' + esc(__('reviewNoUps')) + '</li>') + '</ul></section>';
}
function rueckblickSchliessen(){
  state.rueckblickZu = isoWeek(today());
  save(); renderRueckblick();
  /* Der Knopf ist weg; der Fokus geht an den Start der naechsten Einheit. */
  document.querySelector('#heuteKarte .heute-karte, #daySelect .day-btn')?.focus({ preventScroll: true });
}

/* Der faellige Tag als grosse Karte, solange keine Einheit laeuft.

   Vorher waren alle Tage gleich grosse Knoepfe, der faellige trug nur ein
   kleines "dran". Was man oeffnet, um zu trainieren, ist aber fast immer
   genau dieser eine – er soll der erste und groesste Knopf sein. Die Dauer
   ist die Schaetzung des Generators, mit dem eigenen Tempo verrechnet. */
function renderHeuteKarte(sug){
  const el = document.getElementById('heuteKarte');
  if(!el) return;
  const d = !session.dayKey && sug ? getDay(sug) : null;
  if(!d){ el.innerHTML = ''; return; }
  const tempo = planTempo();
  const sek = tagesDauerSek(d, EX_BY_ID, cfg('setsMode')) * (tempo ? tempo.faktor : 1);
  const meta = [__('exercisesCount', { n: d.ex.length }), sek ? __('aboutMinutes', { n: Math.round(sek / 60) }) : ''].filter(Boolean).join(' · ');
  el.innerHTML = '<button class="heute-karte" data-action="day:select" data-key="' + esc(d.key) + '">' +
    '<span class="hk-label">' + esc(__(heutigerPlanTag() === d.key ? 'todayPlanned' : 'upNextLong')) + '</span>' +
    '<span class="hk-titel">' + esc(d.key) + ' · ' + esc(dayTitleOf(d)) + '</span>' +
    (daySubOf(d) ? '<span class="hk-sub">' + esc(daySubOf(d)) + '</span>' : '') +
    '<span class="hk-meta">' + esc(meta) + '</span>' +
    wochenRingHtml(einheitenDieseWoche(), cfg('weekGoal')) +
    '<span class="hk-los" aria-hidden="true">' + esc(__('startDay')) + '</span></button>';
}

/* Der Wochenring: wie viel vom Wochenziel schon geschafft ist, als Ring
   ueber dem Start. Die Zahl stand bisher nur klein in der Kennzahlenzeile;
   am Ring sieht man vor dem Start, ob die Einheit heute das Ziel schliesst.
   Voll wird er gruen. Ohne Einheit bleibt nur die Bahn – ein Bogen der
   Laenge 0 zeichnete mit runden Enden einen Punkt. Fuer den Screenreader
   steht derselbe Stand als Satz im Knopf. */
function wochenRingHtml(n, ziel){
  const anteil = ziel > 0 ? Math.min(n / ziel, 1) : 0;
  const umfang = 2 * Math.PI * 18;
  return '<span class="hk-ring' + (ziel > 0 && n >= ziel ? ' voll' : '') + '" aria-hidden="true">' +
    '<svg viewBox="0 0 44 44" focusable="false"><circle class="hk-ring-bahn" cx="22" cy="22" r="18"/>' +
    (anteil > 0 ? '<circle class="hk-ring-wert" cx="22" cy="22" r="18" stroke-dasharray="' +
      (anteil * umfang).toFixed(1) + ' ' + umfang.toFixed(1) + '"/>' : '') + '</svg>' +
    '<span class="hk-ring-zahl">' + n + '/' + ziel + '</span></span>' +
    '<span class="sr-only">' + esc(__('weekRingSr', { n, ziel })) + '</span>';
}

/* Was heute ansteht – nur bei eingerichtetem Wochenrhythmus.

   Ausdruecklich KEINE Sperre: am Ruhetag laesst sich jeder Tag antippen und
   abschliessen, und der Satz sagt das auch. Die App plant, sie verwaltet
   nicht. */
function renderHeute(){
  const el = document.getElementById('heuteHinweis');
  if(!el) return;
  if(!rhythmusAktiv()){ el.textContent = ''; el.hidden = true; return; }
  el.hidden = false;
  const key = heutigerPlanTag();
  const d = key && getDay(key);
  el.textContent = d
    ? __('todayIs', { day: d.key + ' · ' + dayTitleOf(d) })
    : __('restDay');
}
/* Der frühere Sonder-Listener für #daySelect ist entfallen – die Tag-Buttons
   laufen jetzt über dieselbe Aktionstabelle wie alles andere. */

/* ================= Sätze & Ziele berechnen ================= */
/* Der einzige Ort, an dem der Satz-Modus angewandt wird – und damit auch der
   richtige fuer die Entlastungswoche. Bekommt die Stufe selbst, nicht mehr
   ihren Zieltext: die Zahlen stehen seit der Umstellung als Daten darin. */
export function zielVon(level){
  const t = zielAuswerten(level, cfg('setsMode'));
  if(!deloadAktiv()) return t;
  /* Halbe Saetze, unveraenderte Wiederholungen und Haltezeiten: im Deload
     sinkt das Volumen, nicht die Intensitaet. Genau so ist eine
     Entlastungswoche gemeint. */
  return { ...t, sets: Math.max(1, Math.ceil(t.sets / 2)) };
}
/* Zielangabe fuer die Anzeige, etwa '4 × 10–20 Sek'.

   Hier stand eine Textersetzung: das Ziel war ein deutscher Text, die
   Halteerkennung hing am Wort 'Sek', und uebersetzte Ziele haetten sie
   zerlegt. Also wurde erst beim Ausgeben ersetzt. Seit die Einheit ein Feld
   ist, baut zielText() den Text aus den Zahlen, und uebersetzt werden nur
   noch die beiden Woerter, die hier hineingehen. */
export function zielText(level){
  return zielTextPure(level, { sek: __('secShort'), versuche: __('attempts') });
}

/* Die eingetragenen Wiederholungen einer Uebung, Satz fuer Satz. */
function repsDerEinheit(id, saetze){
  return Array.from({ length: saetze }, (_, s) => session.reps[id + '-' + s]);
}
function sekDerEinheit(id, saetze){
  return Array.from({ length: saetze }, (_, s) => session.sek[id + '-' + s]);
}

/* Ob das obere Limit einer Uebung in dieser Einheit erreicht ist.

   Liegen fuer jeden Satz Zahlen vor, entscheiden die – das Haekchen ist dann
   eine Anzeige und laesst sich nicht setzen. Bisher entschied allein das
   Haekchen, und die Zahlen daneben zaehlten nur fuer Bestleistungen und
   Volumen. Fehlt eine Zahl, bleibt es beim Haekchen: dort weiss die App es
   nicht besser als der Nutzer. Bei Halteuebungen sind die Zahlen seit v16
   die gehaltenen Sekunden.

   abgeleitet ist true, false oder null (siehe limitErreicht()); erreicht ist
   das, was am Ende zaehlt. */
function limitStand(ex){
  const t = zielVon(ex.levels[lvlOf(ex)]);
  const reps = t.isHold ? sekDerEinheit(ex.id, t.sets) : repsDerEinheit(ex.id, t.sets);
  const abgeleitet = limitErreicht(t, reps);
  return { t, reps, abgeleitet, erreicht: abgeleitet === null ? !!session.top[ex.id] : abgeleitet };
}

/* Das Haekchen samt Begruendung. Als eigene Funktion, weil es sich bei jeder
   eingetippten Zahl aendern kann – neu gebaut wird dann nur dieses Label,
   nicht die Karte, sonst verloere das Eingabefeld den Fokus. */
/* Seit ein Tipp auf den Satz die Vorgabe eintraegt, entscheiden fast immer
   die Zahlen. Das Haekchen stand trotzdem als eigener Kasten auf jeder
   Karte – als abgeschaltete Checkbox, die niemand bedienen konnte. Jetzt:
     Zahlen vollstaendig    eine Zeile, die sagt, was die Zahlen ergeben
     ein abgehakter Satz    das Haekchen zum Selbersetzen, mit dem Hinweis,
     steht ohne Zahl da     dass die App es sonst nicht weiss
     sonst                  nichts (das Element bleibt als Anker stehen)
   Saetze, die nur noch nicht dran waren, zaehlen nicht als fehlend – sonst
   stuende das Haekchen nach dem ersten Satz wieder auf jeder Karte.
   Fehlende Zahlen gibt es, wenn die App keine Vorgabe kennt: Eintraege
   ohne Stufe (vor v15, CSV, nachgetragen) liefern keine. */
function toplimitHtml(ex){
  const { t, reps, abgeleitet, erreicht } = limitStand(ex);
  const grenze = t.isHold ? t.holdSecs : t.maxReps;
  const klasse = 'toplimit' + (erreicht ? ' checked' : '') + (abgeleitet !== null ? ' abgeleitet' : '');
  if(abgeleitet !== null){
    const grund = __('topLimitDerived', {
      reps: reps.join(' · '), max: t.isHold ? grenze + ' ' + __('secShort') : grenze
    });
    return '<div class="' + klasse + '" id="top-' + ex.id + '">' +
      (erreicht ? '<span>' + ikon('levelup') + esc(__('topLimit')) + '</span>' : '') +
      '<small class="toplimit-grund">' + esc(grund) + '</small></div>';
  }
  const ohneZahl = reps.some((n, s) => session.sets[ex.id + '-' + s] && !Number.isInteger(n));
  if(!ohneZahl && !session.top[ex.id]) return '<div class="toplimit" id="top-' + ex.id + '" hidden></div>';
  /* Nur, wenn schon etwas eingetragen ist: dann fehlt wirklich nur der
     Rest. Nach Saetzen ganz ohne Zahlen waere der Hinweis falsch. */
  const grund = grenze && reps.some(n => Number.isInteger(n)) ? __('topLimitMissing') : '';
  return '<label class="' + klasse + ' hand" id="top-' + ex.id + '">' +
    '<input type="checkbox" data-action-change="set:top" data-ex="' + ex.id + '"' + (erreicht ? ' checked' : '') + '>' +
    '<span>' + __('topLimit') +
      (grund ? '<small class="toplimit-grund">' + esc(grund) + '</small>' : '') + '</span></label>';
}
/* Ob schon ein Satz dieser Uebung abgehakt ist. Die Uebung ist der Teil des
   Schluessels vor dem LETZTEN Bindestrich. */
function uebungBegonnen(id){
  return Object.keys(session.sets).some(k => session.sets[k] && k.slice(0, k.lastIndexOf('-')) === id);
}

/* Was letztes Mal ging, und was heute ansteht.

   Das Tagesziel erscheint nur, wenn die letzte Einheit auf DERSELBEN Stufe
   lag. Nach einem Aufstieg stammen die Zahlen von der leichteren Variante –
   "10 · 10 · 10 · 10" von den Knie-Liegestuetzen waere als Vorgabe fuer
   volle Liegestuetze falscher Rat, und zwar genau dann, wenn er am meisten
   zaehlt. Dasselbe nach einer Rueckstufung oder einer Aenderung von Hand.
   Dann nennt die Zeile die andere Stufe beim Namen, statt ihre Zahlen als
   Vorgabe auszugeben.

   Eintraege, die ihre Stufe nicht kennen (vor v15, CSV, nachgetragen),
   bekommen die Zeile wie bisher, aber kein Tagesziel: ob die Zahlen passen,
   laesst sich dann nicht sagen. */
/* Zahlen einer Einheit mit ihrer Masseinheit: Sekunden tragen "Sek" mit,
   Wiederholungen nichts – so war die Zeile schon vorher. */
const mitEinheit = (werte, sek) => werte.join(' · ') + (sek ? ' ' + __('secShort') : '');

/* Die heutige Vorgabe je Satz: { werte, allesOben, einstieg } oder null.

   Aus der letzten Einheit derselben Stufe (tagesziel/halteziel), nach einem
   Stufenwechsel oder ohne Vorgeschichte die Untergrenze (einstiegsziel).
   Ein Eintrag, der seine Stufe nicht kennt, ergibt keine Vorgabe – ob er
   zur heutigen Stufe gehoert, laesst sich nicht sagen. Eine Stelle fuer die
   Zeile "Heute", die Platzhalter, den Countdown und das Eintragen per Tipp,
   damit die vier nie etwas Verschiedenes sagen. */
function heuteVorgabe(ex, lvl, t, letzte){
  const bekannt = !!letzte && Number.isInteger(letzte.lvl) && letzte.lvl < ex.levels.length;
  if(bekannt && letzte.lvl === lvl){
    const z = t.isHold ? halteziel(t, letzte.sek, letzte.an) : tagesziel(t, letzte.reps, letzte.an);
    return z ? { werte: z.secs || z.reps, allesOben: z.allesOben, einstieg: false, an: letzte.an || null } : null;
  }
  if(letzte && !bekannt) return null;
  const e = einstiegsziel(t);
  return e ? { werte: e, allesOben: false, einstieg: true } : null;
}
/* Dasselbe fuer eine einzelne Uebung ausserhalb von renderWorkout(). */
function vorgabeFuer(ex){
  const lvl = lvlOf(ex), t = zielVon(ex.levels[lvl]);
  const v = verlaufJeUebung(state.log, [ex.id], 1, getDay)[ex.id];
  return heuteVorgabe(ex, lvl, t, v && v[0]);
}

function letzteZeilen(ex, lvl, t, letzte){
  const bekannt = !!letzte && Number.isInteger(letzte.lvl) && letzte.lvl < ex.levels.length;
  const andere = bekannt && letzte.lvl !== lvl;
  let html = '';
  if(letzte){
    const alsSek = !!(letzte.sek && letzte.sek.length);
    const reps = mitEinheit(alsSek ? letzte.sek : letzte.reps, alsSek), date = fmtDate(letzte.d);
    /* Mit Nummer und Ziel: 18 Stufen tragen denselben Namen wie ihre
       Nachbarin ("Volle Liegestuetze", erst 5-10, dann 10-15). Nur mit dem
       Namen nannte die Zeile dann die aktuelle Stufe als die andere. */
    html += '<div class="last-reps">' + esc(andere
      ? __('lastRepsOtherStage', {
        n: letzte.lvl + 1, stage: exStage(ex, letzte.lvl),
        target: zielText(ex.levels[letzte.lvl]), reps, date
      })
      : __('lastReps', { reps, date })) + '</div>';
  }
  /* Die Zahlen selbst stehen seit der Satzspalte unter jedem Satz. Diese
     Zeile bleibt fuer das, was sich dort nicht zeigen laesst: dass es eine
     neue Stufe ist, oder dass alle Saetze schon oben waren. */
  const heute = heuteVorgabe(ex, lvl, t, letzte);
  if(heute && (heute.allesOben || heute.einstieg)){
    html += '<div class="last-reps heute">' + esc(heute.allesOben
      ? __('todayAllTop')
      /* Ohne Zahlen: die stehen als Vorgabe in den Feldern darunter. */
      : __('todayEntry')) + '</div>';
  } else if(heute && (heute.an === 'l' || heute.an === 'h')){
    /* Warum die Vorgabe heute anders steigt als sonst. */
    html += '<div class="last-reps heute">' + esc(__(heute.an === 'l' ? 'effortEasyNext' : 'effortHardNext')) + '</div>';
  }
  return html;
}

/* Wie war's? Drei Knoepfe, einer davon gedrueckt oder keiner. Freiwillig:
   ohne Angabe steigt die Vorgabe wie bisher um einen Schritt. */
const ANSTRENGUNG_TEXT = { l: 'effortEasy', p: 'effortOk', h: 'effortHard' };
function anstrengungHtml(ex){
  const jetzt = session.an[ex.id];
  return '<div class="effort" role="group" aria-label="' + esc(__('effortAria', { ex: exName(ex) })) + '">' +
    '<span class="effort-q">' + esc(__('effortQuestion')) + '</span>' +
    Object.entries(ANSTRENGUNG_TEXT).map(([v, k]) =>
      '<button type="button" class="effort-btn" data-action="effort:set" data-ex="' + ex.id + '" data-v="' + v + '"' +
      ' aria-pressed="' + (jetzt === v ? 'true' : 'false') + '">' + esc(__(k)) + '</button>').join('') +
    '</div>';
}
/* Noch einmal tippen nimmt die Angabe zurueck. */
function setAnstrengung(id, v){
  if(!EX_BY_ID[id] || !ANSTRENGUNG_TEXT[v] || !session.dayKey) return;
  if(session.an[id] === v) delete session.an[id]; else session.an[id] = v;
  persistSession();
  document.querySelectorAll('.effort-btn[data-ex="' + id + '"]').forEach(b =>
    b.setAttribute('aria-pressed', session.an[id] === b.dataset.v ? 'true' : 'false'));
}

/* Worauf der Countdown je Satz heute laeuft. Ohne Vorgabe – ein Eintrag
   ohne bekannte Stufe – die Untergrenze, und ohne die die Obergrenze wie
   frueher: ein Countdown braucht eine Zahl. */
function halteSekunden(ex, t, vorgabe){
  return (vorgabe && vorgabe.werte) || einstiegsziel(t) || Array.from({ length: t.sets }, () => t.holdSecs);
}

/* Der Vorschlag, eine Stufe zurueckzugehen – mit dem Knopf, den die Karte
   ohnehin hat (level:adjust), nur ausgesprochen. Auf Stufe 1 gibt es nichts
   Leichteres, dort schweigt er. */
function zuSchwerHtml(ex, lvl, t, verlauf){
  if(!(lvl > 0) || !zuSchwer(t, verlauf, lvl)) return '';
  return '<div class="zu-schwer">' + esc(__('tooHard', { n: ZU_SCHWER_NACH, min: t.minReps })) +
    ' <button class="tip-btn" data-action="level:adjust" data-ex="' + ex.id + '" data-delta="-1">' +
    esc(__('easierStage')) + '</button></div>';
}

function topLimitAktualisieren(id){
  const alt = document.getElementById('top-' + id);
  const ex = EX_BY_ID[id];
  if(alt && ex) alt.outerHTML = toplimitHtml(ex);
}

/* Wochentagskuerzel in der Sprache der Oberflaeche, Montag zuerst. */
export function wochentage(){
  const f = new Intl.DateTimeFormat(getLang(), { weekday: 'short' });
  /* 2024-01-01 war ein Montag. */
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/* Datum in der Sprache der Oberflaeche. Die Domaenenschicht kennt die
   aktuelle Sprache nicht, also wird sie hier hereingereicht. */
export function fmtDate(iso){ return fmtDatePure(iso, getLang()); }

/* Sekunden als lesbare Dauer. Unter einer Stunde nur Minuten, darueber
   Stunden und Minuten – "78 Min" liest sich schlechter als "1 Std 18 Min".
   Aufgerundet auf die nächste Minute: eine Einheit von 40 Sekunden ist
   "1 Min" und nicht "0 Min". */
export function dauerText(sek){
  const min = Math.max(1, Math.round(sek / 60));
  if(min < 60) return __('durationMin', { n: min });
  return __('durationHours', { h: Math.floor(min / 60), m: min % 60 });
}

export function lvlOf(ex){ return Math.min(state.levels[ex.id] || 0, ex.levels.length - 1); }
function restFor(ex){ return (cfg('perExRest') && ex.rest) ? ex.rest : cfg('rest'); }

/* ================= Workout rendern ================= */
const erledigteSaetze = () => Object.values(session.sets).filter(Boolean).length;

/* Der Weg ueber die Knoepfe. Ein Tipp auf den laufenden Tag klappt nur zu;
   ein anderer Tag ersetzt die Einheit erst nach Rueckfrage, wenn darin schon
   etwas abgehakt ist – und laesst sich danach noch zurueckholen. */
async function tagWaehlen(key){
  if(session.dayKey === key){ tagWahlOffen = false; renderDaySelect(); return; }
  if(session.dayKey && erledigteSaetze()){
    if(!await askConfirm(__('switchDayTitle'), __('switchDayBody', { n: erledigteSaetze() }), __('switchDayOk'), true)) return;
    einheitMerken();
  }
  tagWahlOffen = false;
  selectDay(key);
}
function tagWahlUmschalten(){
  tagWahlOffen = !tagWahlOffen;
  renderDaySelect();
  document.querySelector('#daySelect [data-action="day:change"]')?.focus({ preventScroll: true });
}

/* Die laufende Einheit zuruecklegen, bevor sie ersetzt oder verworfen wird.
   Der Toast bietet sie so lange an, wie er steht. */
function einheitMerken(){
  clearTimeout(verworfenTimeout);
  verworfen = JSON.parse(JSON.stringify(session));
  verworfenTimeout = setTimeout(() => { verworfen = null; }, 12000);
}
function einheitAnbieten(){
  const d = getDay(verworfen.dayKey);
  toast(__('workoutDiscarded', { day: d ? d.key + ' · ' + dayTitleOf(d) : verworfen.dayKey }), false,
    { text: __('undo'), action: 'workout:restore' });
}

async function einheitVerwerfen(){
  if(!session.dayKey) return;
  if(erledigteSaetze() &&
    !await askConfirm(__('discardTitle'), __('discardBody', { n: erledigteSaetze() }), __('workoutDiscard'), true)) return;
  einheitMerken();
  cancelHold(); stopRest(); releaseWakeLock();
  abschluss = null;
  clearSession();
  save();
  document.getElementById('finishBar').style.display = 'none';
  renderAll();
  einheitAnbieten();
  document.querySelector('#heuteKarte .heute-karte, #daySelect .day-btn')?.focus({ preventScroll: true });
}
function einheitZurueckholen(){
  const v = verworfen;
  if(!v || !getDay(v.dayKey)) return;
  clearTimeout(verworfenTimeout);
  verworfen = null;
  cancelHold(); stopRest();
  abschluss = null;
  fokusIdx = null;
  tagWahlOffen = false;
  setSession(v);
  persistSession();
  renderWarmup(); renderBanners();
  renderDaySelect(); renderWorkout(); restoreSession(session.reps);
  requestWakeLock();
  document.getElementById('toast').classList.remove('show');
  melde(__('workoutRestored'));
}

function selectDay(key){
  cancelHold(); stopRest();
  abschluss = null;
  fokusIdx = null;
  setSession({ ...leereSession(), dayKey: key });
  persistSession();
  /* Neue Einheit, neues Aufwaermen: die Haken der vorigen duerfen nicht
     stehen bleiben. */
  renderWarmup();
  /* Auch die Hinweise: der Plan-Check schweigt waehrend der Einheit. */
  renderBanners();
  renderDaySelect(); renderWorkout(); requestWakeLock();
  if(verworfen) einheitAnbieten();
}

export function renderWorkout(){
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
  const verlauf = verlaufJeUebung(state.log, heute.map(h => h.id), ZU_SCHWER_NACH, getDay);
  const letzte = Object.fromEntries(Object.keys(verlauf).map(id => [id, verlauf[id][0]]));

  /* Supersaetze: die beiden Karten eines Paares in einer Klammer. Das Paar
     haengt an den Plan-Kennungen, eine Ersetzung fuer heute bleibt also im
     Paar. */
  const paare = gueltigePaare(day);
  const oeffnen = new Map(paare.map(p => [p[0], p[1]]));
  const schliessen = new Set(paare.map(p => p[1]));
  const angezeigt = o => EX_BY_ID[session.subs[o] || o];
  const karteZeichnen = ({ origId, id }) => {
    const ex = EX_BY_ID[id];
    if(!ex) return;

    if(session.skip[origId]){
      html += '<div class="ex ex--skipped" data-exid="' + ex.id + '">' +
        '<div class="ex-head"><div class="ex-name">' + esc(exName(ex)) + '</div></div>' +
        '<div class="ex-stage">' + esc(__('skippedToday')) + '</div>' +
        '<button class="tip-btn" data-action="exercise:unskip" data-ex="' + origId + '">' + ikon('undo') + ' ' + __('undoSkip') + '</button>' +
        '</div>';
      return;
    }
    const lvl = lvlOf(ex), level = ex.levels[lvl], maxed = lvl >= ex.levels.length - 1;
    const t = zielVon(level), streak = state.streaks[ex.id] || 0;

    let rungs = '';
    ex.levels.forEach((l, i) => {
      if(i > 0) rungs += '<div class="rung-line' + (i <= lvl ? ' done' : '') + '"></div>';
      /* title allein wird nicht zuverlaessig angesagt und auf Touch nie
         angezeigt – die Leiter transportierte ihren Zustand rein farblich. */
      rungs += '<div class="rung' + (i < lvl ? ' done' : (i === lvl ? ' current' : '')) + '" title="' + esc(exStage(ex, i)) + '" aria-hidden="true"></div>';
    });

    const heute = heuteVorgabe(ex, lvl, t, letzte[ex.id]);
    const vorgabe = t.isHold ? halteSekunden(ex, t, heute) : (heute && heute.werte);
    let dots = '';
    for(let s = 0; s < t.sets; s++){
      const repKey = ex.id + '-' + s;
      /* aria-pressed statt reiner Farbcodierung: der Erledigt-Zustand war
         nur ueber eine CSS-Klasse sichtbar und das Label statisch.

         Hier stand zusaetzlich aria-live="polite" fuer Halteuebungen, damit
         der Countdown ueberhaupt angesagt wird. Angesagt wurde damit aber
         JEDE einzelne Sekunde. Beginn und Ende meldet jetzt melde() ueber
         #srStatus, der Punkt selbst bleibt still. */
      /* Je Satz eine Spalte: Punkt, Feld und darunter die Vorgabe. Vorher
         standen Punkte und Felder abwechselnd in einer Reihe, die bei vier
         Saetzen auf dem Handy umbrach – dann stand "3" am Zeilenende und
         sein Feld in der naechsten Zeile. Und die Vorgabe stand in einer
         eigenen Zeile ueber allem statt an dem Satz, fuer den sie gilt. */
      const ziel = vorgabe && Number.isInteger(vorgabe[s]) ? vorgabe[s] : null;
      const zielId = 'ziel-' + repKey;
      dots += '<div class="satz">';
      dots += '<button class="set-dot" id="set-' + repKey + '"' +
        ' data-action="set:tap" data-ex="' + ex.id + '" data-set="' + s + '"' +
        ' aria-pressed="' + (session.sets[repKey] ? 'true' : 'false') + '"' +
        ' aria-label="' + esc(__('setAria', { ex: exName(ex), n: s + 1, total: t.sets })) + '">' + (s + 1) + '</button>';
      if(!t.isHold && t.maxReps){
        dots += '<input class="rep-input" id="rep-' + repKey + '" type="number" min="0" max="' + (t.maxReps + 10) + '"' +
          /* Die heutige Vorgabe statt der Spanne: die Spanne steht oben
             auf der Karte, die Vorgabe ist die Zahl fuer DIESEN Satz. */
          ' placeholder="' + (vorgabe ? vorgabe[s] : t.minReps + '-' + t.maxReps) + '"' +
          ' aria-label="' + esc(__('repsAria', { ex: exName(ex), n: s + 1 })) + '"' +
          (ziel !== null ? ' aria-describedby="' + zielId + '"' : '') +
          ' value="' + (session.reps[repKey] ?? '') + '" data-action-input="set:reps" data-key="' + repKey + '">';
      } else if(t.isHold){
        /* Die gehaltene Zeit: der Countdown traegt sie ein, von Hand laesst
           sie sich korrigieren. Der Platzhalter ist die heutige Vorgabe. */
        dots += '<input class="sek-input" id="sek-' + repKey + '" type="number" min="0" max="3600"' +
          ' placeholder="' + vorgabe[s] + '"' +
          ' aria-label="' + esc(__('secsAria', { ex: exName(ex), n: s + 1 })) + '"' +
          (ziel !== null ? ' aria-describedby="' + zielId + '"' : '') +
          ' value="' + (session.sek[repKey] ?? '') + '" data-action-input="set:sek" data-key="' + repKey + '">';
      }
      /* Sichtbar steht die Vorgabe als Platzhalter im Feld, und ein Tipp auf
         den Satz traegt sie ein. Die Zeile "Ziel 8" darunter wiederholte
         sie; sie bleibt fuer den Screenreader, der den Platzhalter nicht
         zuverlaessig ansagt. */
      if(ziel !== null){
        dots += '<span class="satz-ziel sr-only" id="' + zielId + '">' +
          esc(__('setTarget', { n: ziel + (t.isHold ? ' ' + __('secShort') : '') })) + '</span>';
      }
      dots += '</div>';
    }

    let hint;
    if(maxed && streak >= need) hint = '<span class="streak-hint hot">' + esc(__('maxLevelReached')) + '</span>';
    else if(streak === need - 1 && streak > 0) hint = '<span class="streak-hint hot">' + esc(__('oneMoreToLevel', { n: streak, need })) + '</span>';
    else hint = '<span class="streak-hint">' + esc(__('towardsLevel', { n: streak, need })) + '</span>';

    const note = (state.notes || {})[ex.id];
    const pr = (state.prs || {})[ex.id];

    /* begonnen: mindestens ein Satz ist abgehakt. Daran haengen der
       Halte-Hinweis (nur davor) und "Wie war's?" (erst danach) – beides
       per CSS, damit markDone() die Karte nicht neu zeichnen muss. */
    html += '<div class="ex' + (uebungBegonnen(ex.id) ? ' begonnen' : '') + '" data-exid="' + ex.id + '" data-cat="' + ex.cat + '">' +
      /* Kategorie, Leiter, Stufe und ± in einer Zeile. Die Leiter stand
         darunter in einer eigenen; bei hoechstens sieben Sprossen passt sie
         auch auf 320px neben den Rest. */
      '<div class="ex-top"><span class="cat-chip kat">' + esc(catName(ex.cat, CATS[ex.cat].name)) + '</span>' +
        /* --sprossen: so breit muss die Leiter mindestens sein (14px je
           Sprosse plus 2px Linie), sonst bricht die Zeile um. */
        '<div class="rungs" style="--sprossen:' + ex.levels.length + '" role="img" aria-label="' +
          esc(__('levelOfNamed', { n: lvl + 1, total: ex.levels.length, stage: exStage(ex, lvl) })) +
          '">' + rungs + '</div>' +
        '<span class="rung-label" aria-hidden="true">' + (lvl + 1) + '/' + ex.levels.length + '</span>' +
        '<span class="lvl-adjust"><button data-action="level:adjust" data-ex="' + ex.id +
        '" data-delta="-1" title="' + esc(__('levelDown')) + '" aria-label="' + esc(__('levelDown')) + '">−</button>' +
        '<button data-action="level:adjust" data-ex="' + ex.id +
        '" data-delta="1" title="' + esc(__('levelUp')) + '" aria-label="' + esc(__('levelUp')) + '">+</button></span></div>' +
      '<div class="ex-head"><div class="ex-name">' + esc(exName(ex)) + '</div><div class="ex-target">' + esc(zielText(level)) + '</div></div>' +
      '<div class="ex-stage"><span>' + esc(__('currentStage')) + ': <b>' + esc(exStage(ex, lvl)) + '</b></span>' +
        '<span class="ex-rest">' + esc(__('restOf', { sec: restFor(ex) })) + '</span></div>' +
      /* Nur ein Hinweis, keine Sperre – der Ersetzen-Knopf steht weiter
         unten in derselben Karte. Wer sein Gerät heute nicht dabei hat,
         soll die Übung sehen und selbst entscheiden. */
      (fehlt(ex, lvl).length
        ? '<div class="equip-warn">' + esc(__('needsEquip', { list: equipListe(fehlt(ex, lvl)) })) + '</div>'
        : '') +
      letzteZeilen(ex, lvl, t, letzte[ex.id]) +
      zuSchwerHtml(ex, lvl, t, verlauf[ex.id]) +
      (note ? '<div class="last-note">' + esc(__('lastNote', { date: fmtDate(note.d), text: note.t })) + '</div>' : '') +
      '<div class="sets" style="--saetze:' + t.sets + '">' + dots + '</div>' +
      (t.isHold ? '<span class="hold-hint">' + esc(__('holdHint')) + '</span>' : '') +
      toplimitHtml(ex) +
      hint +
      /* Bei Mobility gibt es nichts zu steigern, also auch nichts zu
         bewerten – die Handgelenks-Routine hatte "Wie war's?" trotzdem. */
      (ex.cat === 'mobility' ? '' : anstrengungHtml(ex)) +
      /* Alles, was man nicht in jedem Satz braucht, hinter "Mehr". Die Karte
         hatte 17 Zeilen und war auf dem Handy 528px hoch; bei sieben Uebungen
         lag die letzte ueber 3500px tief. Offen bleibt der Bereich, solange
         eine Notiz darin steht oder man ihn geoeffnet hat – ein Neuzeichnen
         nach jeder Stufenaenderung klappte ihn sonst jedes Mal zu. */
      '<details class="ex-mehr" data-ex="' + ex.id + '"' +
        (offeneMehr.has(ex.id) || session.notes[ex.id] ? ' open' : '') + '>' +
      '<summary>' + esc(__('moreOnCard')) + '</summary>' +
      (pr ? '<div class="pr-line">' + esc(__('best')) + ': ' + esc(pr.v) + ' (' + fmtDate(pr.d) + ')</div>' : '') +
      '<textarea class="note-input" id="note-' + ex.id + '" rows="1"' +
        ' data-action-input="note:set" data-ex="' + ex.id + '"' +
        ' placeholder="' + esc(__('notePlaceholder')) + '">' +
        esc(session.notes[ex.id] || '') + '</textarea>' +
      '<button class="tip-btn" data-action="tips:toggle" data-ex="' + ex.id + '">' + __('tips') + '</button>' +
      '<ul class="tips" id="tips-' + ex.id + '">' + exTips(ex).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      /* Ersetzen und Auslassen greifen auf die PLAN-Zeile zu, nicht auf die
         gerade angezeigte Uebung – sonst liesse sich eine Ersetzung nicht
         zurueckdrehen. */
      '<button class="sub-btn" data-action="exercise:substitute" data-ex="' + origId + '">' + ikon('swap') + ' ' + __('substitute') + '</button>' +
      '<button class="sub-btn" data-action="exercise:skip" data-ex="' + origId + '">' + ikon('skip') + ' ' + __('skipToday') + '</button>' +
      '<button class="tip-btn" data-action="exercise:history" data-ex="' + ex.id + '">' + ikon('chart') + ' ' + __('perExercise') + '</button>' +
      '</details>' +
      '</div>';
  };
  heute.forEach(h => {
    if(oeffnen.has(h.origId)){
      const a = angezeigt(h.origId), b = angezeigt(oeffnen.get(h.origId));
      html += '<div class="supersatz" role="group" aria-label="' + esc(__('supersetGroupAria', {
        a: a ? exName(a) : h.origId, b: b ? exName(b) : oeffnen.get(h.origId)
      })) + '"><div class="ss-kopf"><span class="cat-chip">' + esc(__('supersetLabel')) + '</span>' +
        '<span>' + esc(__('supersetHint')) + '</span></div>';
    }
    karteZeichnen(h);
    if(schliessen.has(h.origId)) html += '</div>';
  });

  const content = document.getElementById('content');
  content.innerHTML = html;
  /* toggle steigt nicht auf, deshalb je Element. Die Elemente sind nach
     jedem Rendern neu, es haeufen sich also keine Listener an. */
  content.querySelectorAll('details.ex-mehr').forEach(d => d.addEventListener('toggle', () => {
    if(d.open) offeneMehr.add(d.dataset.ex); else offeneMehr.delete(d.dataset.ex);
  }));
  document.getElementById('finishBar').style.display = 'block';
  updateFinish();
  fokusAnwenden();
}

/* ================= Fokus-Modus =================
   Die lange Liste ist fuer den Ueberblick gut und fuer das Training selbst
   zu viel: zwischen zwei Saetzen scrollt man durch sieben Karten, um die
   eine zu finden, die dran ist. Im Fokus-Modus steht nur sie da – bei einem
   Supersatz beide Karten seiner Klammer –, oben eine Leiste mit dem Schritt
   und den Pfeilen, und die Pause laeuft als grosser Ring statt als Chip.

   Gebaut ist das als Schicht ueber der Liste: renderWorkout() zeichnet alle
   Karten wie bisher, fokusAnwenden() blendet die uebrigen aus. So gilt
   alles, was an einer Karte haengt – Haltezeit, Supersatz, oberes Limit,
   Notizen –, im Fokus genauso, ohne zweiten Weg.

   Weiter geht es nicht sofort nach dem letzten Satz: dann verschwaende die
   Karte, bevor man die Wiederholungen des letzten Satzes eintragen kann.
   Die Leiste zeigt, dass der Schritt fertig ist; zur naechsten Uebung geht
   es mit dem Pfeil oder, wenn die Pause endet oder weggetippt wird, von
   selbst (fokusWeiter()). */
const fokusAn = () => !!cfg('fokus') && !!session.dayKey;
const fokusSchritte = () =>
  [...document.getElementById('content').children].filter(el => el.matches('.ex, .supersatz'));
/* Fertig ist ein Schritt ohne offenen Satz – auch einer, der heute
   ausgelassen wird und gar keine Saetze hat. */
const schrittFertig = el => !el.querySelector('.set-dot:not(.done)');
const schrittName = el => [...el.querySelectorAll('.ex-name')].map(n => n.textContent.trim()).join(' + ');
/* Schritte, ihr Stand und der sichtbare. Solange nicht geblaettert wurde,
   ist das der erste offene – aus dem Stand abgeleitet und nicht gemerkt,
   weil restoreSession() die erledigten Saetze erst nach dem Zeichnen
   wiederherstellt. */
function fokusStand(){
  const schritte = session.dayKey ? fokusSchritte() : [];
  const status = schritte.map(el => ({ fertig: schrittFertig(el) }));
  const idx = fokusIdx !== null && fokusIdx < schritte.length ? fokusIdx : fokusStart(status);
  return { schritte, status, idx };
}

function fokusAnwenden(){
  const nav = document.getElementById('fokusNav'), content = document.getElementById('content');
  if(!nav || !content) return;
  const { schritte, status, idx } = fokusStand();
  const an = fokusAn() && schritte.length > 0;
  content.classList.toggle('fokus', an);
  schritte.forEach(el => el.classList.remove('fokus-aktiv'));
  if(!schritte.length){ nav.innerHTML = ''; pauseOrt(); return; }
  if(!an){
    nav.innerHTML = '<div class="fokus-leiste fokus-leiste--aus">' +
      '<button type="button" class="fokus-schalter" data-action="focus:toggle" aria-pressed="false">' +
      ikon('focus') + '<span>' + esc(__('focusOn')) + '</span></button></div>';
    pauseOrt();
    return;
  }
  schritte[idx].classList.add('fokus-aktiv');
  const letzter = idx === schritte.length - 1;
  const bereit = status[idx].fertig && !letzter;
  nav.innerHTML = '<div class="fokus-leiste" role="group" aria-label="' + esc(__('focusNavAria')) + '">' +
    '<button type="button" class="fokus-pfeil" data-action="focus:step" data-delta="-1" aria-label="' + esc(__('focusPrev')) + '"' +
      (idx === 0 ? ' disabled' : '') + '>' + ikon('prev') + '</button>' +
    '<div class="fokus-mitte"><span class="fokus-zahl">' + esc(__('focusCount', { i: idx + 1, n: schritte.length })) + '</span>' +
      '<span class="fokus-punkte" aria-hidden="true">' + status.map((s, i) =>
        '<i class="' + (i === idx ? 'jetzt' : s.fertig ? 'fertig' : '') + '"></i>').join('') + '</span></div>' +
    '<button type="button" class="fokus-pfeil' + (bereit ? ' bereit' : '') + '" data-action="focus:step" data-delta="1" aria-label="' +
      esc(bereit ? __('focusNextReady', { name: schrittName(schritte[idx + 1]) }) : __('focusNext')) + '"' +
      (letzter ? ' disabled' : '') + '>' + ikon('next') + '</button>' +
    '<button type="button" class="fokus-schalter" data-action="focus:toggle" aria-pressed="true" aria-label="' + esc(__('focusOffAria')) + '">' +
      ikon('list') + '<span>' + esc(__('focusOff')) + '</span></button></div>';
  pauseOrt();
}

/* Einen Schritt vor oder zurueck. Die Karte beginnt oben; der Fokus bleibt
   auf dem Pfeil (mitFokus), und die Ansage nennt, was jetzt dran ist. */
function fokusSchritt(delta){
  const { schritte, idx } = fokusStand();
  if(!fokusAn() || !schritte.length) return;
  const neu = Math.max(0, Math.min(schritte.length - 1, idx + delta));
  if(neu === idx) return;
  fokusIdx = neu;
  fokusAnwenden();
  fokusZeigen();
}
function fokusZeigen(){
  const { schritte, idx } = fokusStand();
  const el = schritte[idx];
  if(!el) return;
  document.getElementById('fokusNav').scrollIntoView?.({ block: 'start', behavior: wenigerBewegung() ? 'auto' : 'smooth' });
  melde(__('focusNow', { name: schrittName(el), i: idx + 1, n: schritte.length }));
}
/* Nach der Pause – abgelaufen oder weggetippt – zur naechsten offenen
   Uebung, wenn die aktuelle fertig ist. */
function fokusWeiter(){
  if(!fokusAn()) return;
  const { schritte, status, idx } = fokusStand();
  if(!schritte.length) return;
  const neu = fokusNachSatz(status, idx);
  if(neu === idx) return;
  fokusIdx = neu;
  fokusAnwenden();
  fokusZeigen();
}
function fokusUmschalten(){
  state.settings.fokus = !cfg('fokus');
  save();
  fokusAnwenden();
  if(fokusAn()) fokusZeigen();
  /* Der Schalter wird neu gezeichnet; der Fokus geht an den neuen. */
  document.querySelector('#fokusNav .fokus-schalter')?.focus({ preventScroll: true });
}

/* Stellt nach einem Neuzeichnen des Trainings wieder her, was nicht im
   Markup steckt. Notizen brauchen das nicht mehr: sie stehen in
   session.notes und werden von renderWorkout() direkt ausgegeben – das
   fruehere snapshotNotes() ist damit ueberfluessig geworden. */
export function restoreSession(reps){
  Object.keys(session.sets).forEach(k => {
    if(session.sets[k]){
      const el = document.getElementById('set-' + k);
      if(el){ el.classList.add('done'); el.setAttribute('aria-pressed', 'true'); }
    }
  });
  /* Hier wurde das Haekchen blind aus session.top gesetzt. Seit die Zahlen
     entscheiden, wo sie vollstaendig sind, kann ein frueher gesetztes
     Haekchen falsch sein – das Label rechnet deshalb selbst nach. */
  document.querySelectorAll('#content .toplimit').forEach(l => topLimitAktualisieren(l.id.slice(4)));
  /* Gegen null pruefen, nicht gegen Falsy: 0 Wiederholungen sind eine
     gueltige Eingabe, die setRep() bewusst speichert. Sie verschwand hier
     und beim Rendern des Feldes bei jedem Neuzeichnen. */
  Object.keys(reps || {}).forEach(k => {
    const el = document.getElementById('rep-' + k);
    if(el && reps[k] != null) el.value = reps[k];
  });
  updateFinish();
  fokusAnwenden();
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
    sub: exStage(e, lvlOf(e)) + ' · ' + zielText(e.levels[lvlOf(e)])
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
  Object.keys(session.sek).forEach(k => { if(zurUebung(k)) delete session.sek[k]; });
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
  let html = '<div class="modal modal--narrow" role="dialog" aria-modal="true" aria-label="' + esc(__('exerciseHistory', { name: exName(ex) })) + '">' +
    '<div class="modal-head">' +
    esc(__('exerciseHistory', { name: exName(ex) })) +
    '<button data-action="exHistory:close" aria-label="' + esc(__('close')) + '">' + ikon('close') + '</button></div>';
  if(!logEntries.length) html += '<div class="muted">' + esc(__('noLogs')) + '</div>';
  else {
    html += topsatzKurve(logEntries, id);
    /* Jede Spalte bezieht sich jetzt auf DIESE Uebung. Vorher standen hier
       Saetze, Top und Level-Ups der ganzen Einheit – "▲2" hiess, dass
       irgendwelche zwei Uebungen aufgestiegen waren, nicht diese. Und die
       Wiederholungsspalte blieb bei Halteuebungen leer, obwohl die Sekunden
       seit v16 im Eintrag stehen. */
    html += '<table><tr><th>' + esc(__('colDate')) + '</th><th>' + esc(__('colStage')) + '</th><th>' +
      esc(__('colResult')) + '</th><th>' + esc(__('colLevelUp')) + '</th></tr>';
    logEntries.forEach(l => {
      const lvl = l.lv && Number.isInteger(l.lv[id]) ? l.lv[id] : null;
      const sek = sekOf(l, id);
      html += '<tr><td>' + fmtDate(l.d) + '</td><td>' + (lvl === null ? '–' : lvl + 1) + '</td><td>' +
        esc(sek.length ? mitEinheit(sek, true) : repsOf(l, id).join(' · ')) + '</td><td>' +
        (Array.isArray(l.ups) && l.ups.includes(id)
          ? '<span class="aufstieg" title="' + esc(__('colLevelUp')) + '">' + ikon('levelup') + '</span>' : '') + '</td></tr>';
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
/* Der beste Satz je Einheit, aber nur seit dem letzten Stufenwechsel.
   Ueber mehrere Stufen gezogen fiel die Kurve nach jedem Aufstieg ab – die
   neue Variante ist schwerer, die Zahl also kleiner – und sah damit genau
   dann nach Rueckschritt aus, wenn es voranging. Bei einem Wechsel der
   Masseinheit (Sekunden zu Wiederholungen) mischte sie ausserdem beides.
   Eintraege ohne bekannte Stufe zaehlen mit; sie lassen sich nicht zuordnen,
   und ohne sie haette ein alter Bestand gar keine Kurve. */
function topsatzKurve(logEntries, id){
  const neueste = logEntries.find(l => l.lv && Number.isInteger(l.lv[id]));
  const stufe = neueste ? neueste.lv[id] : null;
  const seitWechsel = [];
  for(const l of logEntries){
    if(stufe !== null && l.lv && Number.isInteger(l.lv[id]) && l.lv[id] !== stufe) break;
    seitWechsel.push(l);
  }
  const werte = seitWechsel.reverse()
    .map(l => { const s = sekOf(l, id); return s.length ? s : repsOf(l, id); })
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
    '</svg><div class="spark-caption">' + esc(__('sparkCaption')) + '</div>';
}

function closeExHistory(){
  const o = document.getElementById('exHistoryOverlay');
  if(o) closeDialog(o);
}

/* ================= Satz-Interaktion ================= */
function tapSet(id, s){
  const ex = EX_BY_ID[id]; if(!ex) return;   /* wie in allen Nachbarfunktionen */
  const t = zielVon(ex.levels[lvlOf(ex)]);
  const key = id + '-' + s;
  const el = document.getElementById('set-' + key);

  /* Ein Tipp waehrend des Countdowns beendet den Satz mit der Zeit, die
     bis dahin gehalten wurde. Bisher brach er ihn ab, und die Zeit war
     verloren – dabei ist "bei 14 von 20 Sekunden abgesetzt" genau die
     Angabe, aus der die naechste Vorgabe entsteht. Unter einer Sekunde war
     es ein versehentlicher Doppeltipp, dann bleibt es beim Abbruch. */
  if(holdTimer && holdTimer.key === key){
    const gehalten = Math.floor((Date.now() - holdTimer.start) / 1000);
    if(gehalten < 1){ cancelHold(); return; }
    clearInterval(holdTimer.interval);
    holdTimer = null;
    el.classList.remove('running');
    halteZeitEintragen(key, gehalten);
    markDone(key, el, s, ex);
    melde(__('holdStopped', { sec: gehalten }));
    return;
  }

  if(session.sets[key]){
    session.sets[key] = false;
    el.classList.remove('done'); el.setAttribute('aria-pressed', 'false'); el.textContent = s + 1;
    /* Die Haltezeit gehoert zum Satz: wer ihn zuruecknimmt, nimmt sie mit.
       Wiederholungen bleiben dagegen stehen, sie sind eine eigene Eingabe. */
    if(t.isHold && session.sek[key] != null) halteZeitEintragen(key, null);
    updateFinish(); persistSession(); return;
  }

  if(t.isHold){
    cancelHold();
    zeitNehmen();
    el.classList.add('running');
    const secs = halteSekunden(ex, t, vorgabeFuer(ex))[s] || t.holdSecs;
    const start = Date.now();
    holdTimer = { key, el, id, s, ex, secs, start, ende: start + secs * 1000, interval: null };
    haltenAnzeigen();
    holdTimer.interval = setInterval(haltenAnzeigen, TAKT);
    melde(__('holdStarted', { sec: secs }));
  } else {
    /* Ein leerer Satz bekommt beim Abhaken die heutige Vorgabe eingetragen.
       Bisher hiess ein Tipp nur "erledigt", und die Zahl musste man
       zusaetzlich eintippen – wer es liess, hatte keine Zahlen, und das obere
       Limit blieb eine Handeingabe. So reicht ein Tipp je Satz, und nur eine
       Abweichung wird getippt. Eine schon eingetragene Zahl bleibt stehen. */
    if(session.reps[key] == null && t.maxReps){
      const v = vorgabeFuer(ex);
      const n = v && v.werte[s];
      if(Number.isInteger(n)){
        session.reps[key] = n;
        const feld = document.getElementById('rep-' + key);
        if(feld) feld.value = n;
        topLimitAktualisieren(id);
      }
    }
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
  const { key, el, s, ex, secs } = holdTimer;
  clearInterval(holdTimer.interval);
  holdTimer = null;
  el.classList.remove('running');
  halteZeitEintragen(key, secs);
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
  el.closest('.ex')?.classList.add('begonnen');
  el.classList.add('done'); el.setAttribute('aria-pressed', 'true'); el.textContent = s + 1;
  /* Die kurze Bestaetigung nur hier, nicht in restoreSession(): sonst
     huepften nach jedem Neuzeichnen alle erledigten Saetze. */
  el.classList.add('eben');
  el.addEventListener('animationend', () => el.classList.remove('eben'), { once: true });
  /* Die Pause vor dem Speichern starten, damit ihr Zielzeitpunkt im selben
     Schreibvorgang mitgeht statt einen zweiten zu erzwingen. */
  if(cfg('autoRest')){
    /* Im Supersatz geht es ohne Pause zum Partner; erst wenn die Runde durch
       ist, kommt die Pause – die laengere der beiden, weil sie fuer beide
       Uebungen reichen muss. Eine noch laufende Pause der letzten Runde
       endet, sobald man weitermacht. */
    const ss = supersatzNachSatz(ex, s);
    if(ss && ss.weiter){
      stopRest();
      melde(__('supersetNext', { ex: exName(ss.partnerEx) }));
      document.querySelector('#content .ex[data-exid="' + ss.partnerEx.id + '"]')?.scrollIntoView?.({
        block: 'nearest', behavior: wenigerBewegung() ? 'auto' : 'smooth'
      });
    } else startRest(ss && ss.gemeinsam ? Math.max(restFor(ex), restFor(ss.partnerEx)) : restFor(ex));
  }
  /* Der erste Satz kann das Haekchen erst sichtbar machen – dann, wenn die
     App keine Vorgabe eintragen konnte (siehe toplimitHtml()). */
  topLimitAktualisieren(ex.id);
  updateFinish(); persistSession();
  if(fokusAn()){
    /* Den sichtbaren Schritt festhalten: sonst sprange die Ansicht, sobald
       sein letzter Satz erledigt ist, zum naechsten offenen. */
    const { schritte, idx } = fokusStand();
    fokusIdx = idx;
    fokusAnwenden();
    if(schritte[idx] && schrittFertig(schritte[idx])) melde(__('focusStepDone'));
  }
}
/* Wie es nach Satz s dieser Uebung im Supersatz weitergeht, oder null,
   wenn sie heute in keinem steht (oder der Partner ausgelassen ist). */
function supersatzNachSatz(ex, s){
  const day = getDay(session.dayKey);
  if(!day) return null;
  const origId = day.ex.find(o => (session.subs[o] || o) === ex.id);
  const pp = origId && partnerVon(gueltigePaare(day), origId);
  if(!pp || session.skip[pp.partner]) return null;
  const partnerEx = EX_BY_ID[session.subs[pp.partner] || pp.partner];
  if(!partnerEx) return null;
  const r = pauseNachSatz(partnerEx.id, s, (id, k) => !!session.sets[id + '-' + k],
    id => zielVon(EX_BY_ID[id].levels[lvlOf(EX_BY_ID[id])]).sets);
  return { ...r, partnerEx };
}

/* Traegt eine Haltezeit in die Einheit und ins Feld daneben ein (null
   loescht sie) und rechnet das obere Limit nach. */
function halteZeitEintragen(key, sek){
  if(sek == null) delete session.sek[key]; else session.sek[key] = sek;
  const feld = document.getElementById('sek-' + key);
  if(feld) feld.value = sek == null ? '' : sek;
  topLimitAktualisieren(key.slice(0, key.lastIndexOf('-')));
}

export function cancelHold(){
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
/* Welche Karten ihren Bereich "Mehr" offen haben – nur zur Laufzeit, eine
   Einheit spaeter ist er wieder zu. */
const offeneMehr = new Set();

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
    return ex ? a + zielVon(ex.levels[lvlOf(ex)]).sets : a;
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
function restBis(ende, beginn = Date.now()){
  stopRest();
  restEnde = ende;
  restStart = Math.min(beginn, Date.now());
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
    fokusWeiter();
    return;
  }
  /* Drei kurze Toene vor dem Ende. Der Tick laeuft viermal pro Sekunde,
     deshalb die Merkvariable – sonst piepste es bei jedem Durchlauf. */
  if(rem <= 3 && rem !== restLetzteSek){
    restLetzteSek = rem;
    tick();
  }

  const txt = Math.floor(rem / 60) + ':' + String(rem % 60).padStart(2, '0');
  for(const id of ['restTime', 'fokusPauseZeit']){
    const out = document.getElementById(id);
    if(out && out.textContent !== txt) out.textContent = txt;
  }
  /* Der Ring zeigt den Anteil, der noch bleibt: voll zu Beginn, leer am Ende. */
  const bogen = document.getElementById('fokusPauseBogen');
  if(bogen){
    const gesamt = Math.max(1, restEnde - restStart), umfang = 2 * Math.PI * 54;
    const rest = Math.max(0, Math.min(1, (restEnde - Date.now()) / gesamt));
    bogen.setAttribute('stroke-dasharray', umfang.toFixed(1));
    bogen.setAttribute('stroke-dashoffset', (umfang * (1 - rest)).toFixed(1));
  }
  pauseOrt();
}
/* Wo die laufende Pause steht: im Fokus-Modus als Ring ueber der Karte,
   sonst als Chip unten. Ohne Pause nirgends. restEnde statt restTimer:
   pauseAnzeigen() laeuft einmal, bevor das Intervall steht. */
function pauseOrt(){
  const laeuft = restEnde > 0;
  const ring = fokusAn();
  document.getElementById('restChip').style.display = laeuft && !ring ? 'flex' : 'none';
  const fp = document.getElementById('fokusPause');
  if(fp) fp.hidden = !(laeuft && ring);
}
export function stopRest(){
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
  restEnde = 0;
  restLetzteSek = 0;
  pauseOrt();
}

/* Pause verlaengern. Ein Satz, der schlecht lief, braucht mehr Zeit – der
   Chip konnte die Pause bisher nur abbrechen. Laeuft gerade keine, faengt
   die Verlaengerung bei jetzt an, damit die Schaltflaeche nie ins Leere tippt. */
function restVerlaengern(sek){
  const laeuft = restEnde > Date.now();
  restBis((laeuft ? restEnde : Date.now()) + sek * 1000, laeuft ? restStart : Date.now());
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
export function signal(double){
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
  /* Nur, was heute auch angezeigt wird: mit der Handgelenks-Routine im Tag
     steht der Pflichtpunkt gar nicht in der Liste. */
  const sichtbar = warmupPasst(WARMUP);
  const offen = [...WARMUP_PFLICHT].filter(i => i < WARMUP.length && sichtbar[i] && !session.warm[i]);
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
  /* Im Log stehen seit v14 die Kennungen, nicht die Anzeigetexte. Der Text
     war dreifach im Weg: die Stagnationserkennung konnte aus
     "Liegestuetze -> Diamant-Liegestuetze" keine Uebung herauslesen und
     musste sich deshalb damit begnuegen, ob UEBERHAUPT jemand aufgestiegen
     ist; ein Sprachwechsel liess deutsche Aufstiege in einem englischen
     Verlauf stehen; und angezeigt wurde der Text nie, gezaehlt wurde immer
     nur seine Laenge. Fuer die Meldung unten entsteht der Satz frisch. */
  const ups = [];
  const upsText = [];
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
    session: JSON.parse(JSON.stringify(session)),
    workouts: state.workouts || 0,
    lastDate: state.lastDate,
    deloadDismissed: state.deloadDismissed,
    entry: null            /* wird nach dem Anlegen des Log-Eintrags gesetzt */
  };

  /* Die Stufe, auf der die Zahlen dieser Einheit entstanden sind. VOR der
     Schleife, die bei einem Aufstieg state.levels veraendert – sonst stuende
     im Log die neue Stufe neben den Zahlen der alten. */
  const lv = {};
  exIds.forEach(id => { const ex = EX_BY_ID[id]; if(ex) lv[id] = lvlOf(ex); });

  exIds.forEach(id => {
    const ex = EX_BY_ID[id]; if(!ex) return;
    /* lvlOf() statt roher Zugriff: der gespeicherte Wert kann ueber der
       Stufenleiter liegen (importiertes Backup, gekuerzte Leiter nach einem
       Inhalts-Update). Unten greift ex.levels[lvl] darauf zu und warf
       dann mitten in dieser Schleife – also nachdem streaks und levels
       bereits geschrieben waren und bevor save() lief. */
    const lvl = lvlOf(ex);
    const maxed = lvl >= ex.levels.length - 1;
    /* Aus den Zahlen, wo sie fuer jeden Satz vorliegen, sonst aus dem
       Haekchen. Vor den Aenderungen an levels gerechnet, damit die Stufe
       dieser Einheit zaehlt und nicht die naechste. */
    const oben = limitStand(ex).erreicht;
    /* In der Entlastungswoche zaehlt das obere Limit nicht: es bezieht sich
       auf halbierte Saetze und ist damit nicht dasselbe wie sonst. Der Streak
       bleibt stehen statt zu wachsen oder genullt zu werden – die Woche soll
       die Progression weder beschleunigen noch bestrafen. Notizen und
       Bestleistungen weiter unten sind davon nicht betroffen. */
    if(deloadAktiv()){
      if(oben) tops++;
    } else if(oben){
      tops++;
      state.streaks[id] = (state.streaks[id] || 0) + 1;
      /* Oben und leicht: kein zweites Mal abwarten. Die Serie soll zeigen,
         dass die Obergrenze kein Zufall war – wer sie mit Reserven schafft,
         hat das schon gezeigt. */
      if(session.an[id] === 'l') state.streaks[id] = Math.max(state.streaks[id], need);
      if(!maxed && state.streaks[id] >= need){
        /* Die naechste Stufe kann ein Geraet verlangen, das nicht da ist –
           bei Dips wechselt sie von der Bank auf die Parallettes. Ein
           Aufstieg dorthin waere kein Fortschritt, sondern eine Uebung, die
           sich nicht mehr ausfuehren laesst.

           Der Streak wird gedeckelt statt genullt: sobald das Geraet
           dazukommt, steigt die Stufe beim naechsten Abschluss sofort. */
        if(!stufeMachbar(ex, lvl + 1)){
          state.streaks[id] = need;
          gesperrt.push({ id, fehlt: fehlt(ex, lvl + 1) });
        } else {
          state.levels[id] = lvl + 1; state.streaks[id] = 0;
          ups.push(id);
          upsText.push(exName(ex) + ' → ' + exStage(ex, lvl + 1));
        }
      }
    } else state.streaks[id] = 0;

    const notiz = (session.notes[id] || '').trim();
    if(notiz) state.notes[id] = { t: notiz.slice(0, 160), d: today() };

    /* Bestleistung aus den Wiederholungen der Einheit. Quelle ist
       session.reps und nicht mehr das Eingabefeld: der Zustand ueberlebt ein
       Neuzeichnen, das Feld nicht. */
    const t = zielVon(ex.levels[lvl]);
    if(!t.isHold && t.maxReps){
      for(let s = 0; s < t.sets; s++){
        const v = session.reps[id + '-' + s];
        /* art und lvl gehoeren dazu: ohne sie vergleicht besserePR()
           Sekunden mit Wiederholungen. Sieben Leitern wechseln unterwegs
           die Masseinheit. */
        const kandidat = { v: v + ' ' + __('reps'), n: v, d: today(), art: 'reps', lvl };
        if(v && besserePR(state.prs[id], kandidat)) state.prs[id] = kandidat;
      }
    } else if(t.isHold){
      /* Die laengste tatsaechlich gehaltene Zeit. Bis v16 stand hier die
         Zielzeit der Stufe, sobald ein Satz abgehakt war – also das, was die
         App verlangt hatte, nicht das, was gehalten wurde. */
      const laengste = Math.max(0, ...sekDerEinheit(id, t.sets).filter(Number.isInteger));
      const kandidat = {
        v: laengste + ' ' + __('secShort'), n: laengste, d: today(), art: 'sek', lvl
      };
      if(laengste > 0 && besserePR(state.prs[id], kandidat)) state.prs[id] = kandidat;
    }
  });

  const sets = Object.values(session.sets).filter(Boolean).length;
  const now = today();
  /* ex: die tatsaechlich trainierten Uebungen. Ohne dieses Feld liess sich
     nur im heutigen Plan nachschlagen, welche Uebungen zu einer Einheit
     gehoerten – nach einer Ersetzung oder einem Plan-Reset also falsch. */
  const entry = {
    d: now, day: session.dayKey, ex: [...exIds], sets, tops, ups,
    reps: { ...session.reps }, sek: { ...session.sek }, lv, dl: deloadAktiv(), dauer: dauerJetzt(),
    an: Object.fromEntries(exIds.filter(id => session.an[id]).map(id => [id, session.an[id]]))
  };

  lastWorkoutSnapshot.entry = entry;

  state.workouts = (state.workouts || 0) + 1;
  state.lastDate = now;

  /* Die vorige Einheit desselben Tags, fuer den Vergleich im Abschlussblatt. */
  const vorige = [...state.log].reverse().find(l => l && l.day === entry.day);
  const summe = obj => Object.values(obj || {}).reduce((s, n) => s + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  state.log.push(entry);
  if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);

  const vorherPRs = lastWorkoutSnapshot.prs;
  abschluss = {
    day: entry.day, dauer: entry.dauer, sets, reps: summe(entry.reps), sek: summe(entry.sek),
    vorher: vorige ? { dauer: vorige.dauer || 0, sets: vorige.sets || 0, reps: summe(vorige.reps), sek: summe(vorige.sek) } : null,
    ups: ups.map(id => ({ id, lvl: state.levels[id] })),
    /* Nur, was einen bestehenden Rekord verbessert: in der ersten Einheit
       waere sonst jede Uebung eine Bestleistung. */
    prs: exIds.filter(id => state.prs[id] && vorherPRs[id] && JSON.stringify(state.prs[id]) !== JSON.stringify(vorherPRs[id])),
    gesperrt,
    /* Nur der erste – sonst stehen nach dem Einstieg drei untereinander. */
    ms: erkannteMs().slice(0, 1)
  };

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

  /* Der Aufstieg bleibt zusaetzlich ein Toast mit Signal – er ist das, was
     man auch aus dem Augenwinkel mitbekommen soll. Alles andere steht im
     Abschlussblatt, das renderAll() gerade gezeichnet hat. Die Ueberschrift
     bekommt den Fokus: der Knopf "Fertig" ist weg, und ein Screenreader
     liest so vor, was die Einheit gebracht hat. */
  if(upsText.length){ signal(true); toast(__('levelUpToast', { list: upsText.join(' · ') }), true); }
  const kopf = document.getElementById('abschluss-titel');
  if(kopf){
    kopf.focus({ preventScroll: true });
    kopf.closest('#abschluss').scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  /* Offer undo for 5 seconds */
  clearTimeout(undoTimeout);
  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  undoBtn.innerHTML = ikon('undo') + ' ' + esc(__('undo'));
  undoBtn.dataset.action = 'workout:undo';
  (document.querySelector('#abschluss .fertig-aktionen') || document.getElementById('content')).appendChild(undoBtn);
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
  abschluss = null;
  document.querySelector('.undo-btn')?.remove();

  /* Die Einheit zurueckholen statt sie wegzuwerfen. Der Snapshot enthaelt
     sie seit jeher – gelesen wurde das Feld nie, stattdessen lief hier ein
     clearSession(). Wer versehentlich "Fertig" tippte, verlor damit jeden
     Haken, jede Wiederholung und jede Notiz und musste die ganze Einheit von
     Hand neu eintragen. Genau das soll "Rueckgaengig" verhindern. */
  if(snap.session && snap.session.dayKey){
    setSession(snap.session);
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
  an(document, 'visibilitychange', () => {
    if(document.visibilityState === 'hidden'){ flushSession(); erinnerungPlanen(); return; }

    erinnerungAbsagen();

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
  an(window, 'beforeunload', e => {
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
  an(window, 'beforeinstallprompt', e => {
    e.preventDefault();
    installAngebot = e;
    zeigeInstallSchalter();
  });
  an(window, 'appinstalled', () => {
    installAngebot = null;
    zeigeInstallSchalter();
    /* Eine installierte App bekommt die Dauerhaftigkeit haeufig erst jetzt. */
    speicherSichern();
  });

  /* Zurueck-Taste und Zurueck-Geste wechseln den Tab, statt die App zu
     schliessen. Dialoge bleiben bewusst aussen vor: sie ueber die History zu
     schliessen verwickelt openDialog/closeDialog mit ihrem Stapel in
     Rueckwaertsspruenge, die sie selbst ausloesen. Escape und ✕ tun es. */
  an(window, 'popstate', e => {
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
  an(window, 'storage', e => {
    if(e.key !== STORAGE_KEY || !e.newValue) return;
    let fremd;
    try{ fremd = migrateState(JSON.parse(e.newValue)); }
    catch{ return; }                       /* fremder Schrott geht uns nichts an */
    /* Tragend, nicht beilaeufig: Safari hat storage historisch auch im
       schreibenden Fenster ausgeloest. Ohne den Vergleich uebernaehmen sich
       zwei Fenster gegenseitig im Wechsel, ohne je stillzustehen. */
    if(!(fremd.rev > (state.rev || 0))) return;

    setState(fremd);

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
    an(dunkelAbfrage, 'change', () => { if(!state.theme) applyTheme(); });
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
  'day:select':         d => tagWaehlen(d.key),
  'day:change':         () => tagWahlUmschalten(),
  'workout:discard':    () => einheitVerwerfen(),
  'workout:restore':    () => einheitZurueckholen(),
  'set:tap':            d => tapSet(d.ex, zahl(d.set)),
  'set:reps':           (d, ev, el) => setRep(d.key, el.value),
  'set:sek':            (d, ev, el) => setSek(d.key, el.value),
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
  'summary:close':      () => abschlussSchliessen(),
  'rest:stop':          () => { stopRest(); persistSession(); fokusWeiter(); },
  'rest:extend':        d => restVerlaengern(zahl(d.sec) || 30),
  'sw:update':          () => updateAnwenden(),
  'app:install':        () => appInstallieren(),
  'deload:dismiss':     d => dismissDeload(zahl(d.due)),
  'deload:start':       d => startDeload(zahl(d.due)),
  'deload:end':         () => endDeload(),
  'deload:plateauDismiss': () => { state.deloadPlateauDismissed = true; save(); renderBanners(); },

  /* Warm-up */
  'warmup:add':         () => addWarmupItem(),
  'warmup:remove':      d => removeWarmupItem(zahl(d.i)),   /* Eintrag ist danach weg – kein Fokusziel */
  'warmup:toggle':      (d, ev, el) => toggleWarmupItem(zahl(d.i), el.checked),
  'warmup:ramp':        (d, ev, el) => toggleWarmupItem('anlauf', el.checked),

  /* Verlauf */
  'weight:add':         () => addWeight(),
  'measurement:add':    () => addMeasurement(),
  'history:range':      (d, ev, el) => mitFokus(() => setHistRange(el.value)),
  'log:add':            () => addLogEntry(),
  'log:remove':         d => removeLogEntry(zahl(d.i)),
  'calendar:shift':     (d, ev, el) => {
    if(el.getAttribute('aria-disabled') === 'true') return;
    return mitFokus(() => kalenderVerschieben(zahl(d.delta)));
  },

  /* Bibliothek */
  'library:filter':     d => mitFokus(() => setLibFilter(d.cat)),
  'library:toggle':     d => mitFokus(() => toggleLib(d.ex)),
  /* Kein mitFokus mehr: das Suchfeld wird nicht mehr ersetzt. */
  'library:search':     () => filterLibrary(),
  'library:sort':       (d, ev, el) => mitFokus(() => setLibSort(el.value)),
  'library:onlyAvailable': (d, ev, el) => nurMachbarSetzen(el.checked),
  'pr:save':            d => mitFokus(() => savePR(d.ex)),

  /* Plan */
  'plan:change':        (d, ev, el) => changePlan(el.value),
  'weekplan:set':       (d, ev, el) => mitFokus(() => setWeekPlan(d.wd, el.value)),
  'plan:reset':         () => resetPlan(),
  'plan:build':         () => generatePlan(),
  'planCheck:apply':     d => planCheckAnwenden(d.alt, d.neu),
  'effort:set':          d => setAnstrengung(d.ex, d.v),
  'planCheck:dismiss':   d => planCheckAblehnen(d.alt, d.neu),
  'planDay:add':        () => addPlanDay(),
  'planDay:rename':     d => mitFokus(() => renameDay(zahl(d.day))),
  'planDay:remove':     d => removeDay(zahl(d.day)),
  'planEx:add':         d => addEx(zahl(d.day)),
  'planEx:remove':      d => removeEx(zahl(d.day), zahl(d.i)),
  'planEx:pair':        d => paarSchalten(zahl(d.day), zahl(d.i)),
  'planEx:pairUndo':    () => paarRueckgaengig(),
  'review:close':       () => rueckblickSchliessen(),
  'focus:toggle':       () => fokusUmschalten(),
  'focus:step':         d => mitFokus(() => fokusSchritt(zahl(d.delta))),
  /* Ohne mitFokus(): moveEx() setzt den Fokus selbst, auf die gewanderte
     Uebung statt auf die, die jetzt an ihrem alten Platz steht. */
  'planEx:move':        d => moveEx(zahl(d.day), zahl(d.i), zahl(d.delta)),

  /* Ziele */
  'milestone:toggle':   (d, ev, el) => mitFokus(() => toggleMilestone(d.id, el.checked)),
  'milestone:accept':   d => mitFokus(() => toggleMilestone(d.id, true)),
  'milestone:search':   () => mitFokus(() => renderMilestones()),
  'milestone:add':      () => addCustomMilestone(),
  'milestone:removeCustom': d => removeCustomMilestone(d.id),

  /* Einstellungen */
  'setting:update':     (d, ev, el) => {
    const wert = el.type === 'checkbox' ? el.checked
      : d.type === 'int' ? zahl(el.value)
      : el.value;
    updateSetting(d.key, wert);
  },
  'setting:undo':       () => einstellungZuruecknehmen(),
  'reminder:enable':    () => erinnerungErlauben(),
  'plan:ics':           () => exportICS(),
  /* Eigene Aktion statt setting:update: dort liegen Skalare in
     state.settings, hier ein Array auf oberster Ebene. */
  'equipment:toggle':   d => toggleEquipment(d.eq),
  'onboarding:start':   () => einstiegLaufen(),
  'onboarding:skip':    () => einstiegBeenden(true),
  'onboarding:again':   () => { closeSettings(); einstiegLaufen(); },

  /* Backup */
  'backup:exportJSON':  () => exportJSON(),
  'backup:shareJSON':   () => shareJSON(),
  'backup:exportCSV':   () => exportCSV(),
  'backup:exportText':  () => exportText(),
  'backup:importJSON':  (d, ev, el) => importJSON(el),
  'backup:importCSV':   (d, ev, el) => importCSV(el),
  'backup:remindLater': () => backupSpaeter(),
  'backup:resetAll':    () => resetAll()
};

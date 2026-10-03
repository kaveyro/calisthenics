/* Einstellungen: Dialog, Aenderungen mit Rueckgaengig und die
   Trainingserinnerung. */

import { today } from '../domain/dates.js';
import { EQUIP } from '../domain/equipment.js';
import { SETTINGS_DEFAULTS } from '../domain/state.js';
import { EX_BY_ID } from '../exercises.js';
import { __, setLang } from '../i18n/index.js';
import { applyLanguage, cancelHold, dayTitleOf, getDay, heutigerPlanTag, lvlOf, renderAll, renderWarmup, renderWorkout, restoreSession, save, zeigeInstallSchalter, zeigeSpeicherinfo, zeigeTeilenSchalter, zielVon } from '../app.js';
import { cfg, session, state } from '../core/kern.js';
import { renderCatFilter, renderLibrary } from './bibliothek.js';
import { renderPlanTab } from './planeditor.js';
import { renderHistory } from './verlauf.js';
import { renderBests, renderMilestones, renderRoadmap } from './ziele.js';
import { closeDialog, openDialog } from '../ui/dialoge.js';
import { toast } from '../ui/hinweise.js';

export function openSettings(){
  /* Alle Schluessel der Vorgabe, keine eigene Liste: die stand hier von Hand
     und vergass den Vorlauf-Schalter – er zeigte "aus", obwohl er an war.
     Dass jeder Schluessel einen Schalter hat, prueft test/schema.test.js. */
  Object.keys(SETTINGS_DEFAULTS).forEach(k => {
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
  zeigeTeilenSchalter();
  openDialog(document.getElementById('settingsOverlay'));
}
export function closeSettings(){ closeDialog(document.getElementById('settingsOverlay')); }
/* Escape wird in addKeyboardShortcuts() behandelt – ein zweiter Listener hier
   hat closeSettings() pro Tastendruck doppelt aufgerufen. */

/* ================= Trainingserinnerungen (Notification API) =================
   Der Wochenrhythmus weiss, welche Tage trainiert werden. Eine Erinnerung
   nutzt die Notification API – der Pausenton erreicht zwar keinen gesperrten
   Bildschirm, aber eine Systembenachrichtigung schon. Bewusst dezent: nur
   ein Hinweis, keine Sperre, und nur wenn ein Rhythmus eingerichtet ist. */
function erinnerungAktiv(){
  return !!(state.settings && state.settings.reminder);
}
export function erinnerungErlauben(){
  if(!('Notification' in window)){ toast(__('reminderDenied')); return; }
  if(Notification.permission === 'granted') return;
  Notification.requestPermission().then(p => {
    if(p === 'granted') toast(__('reminderEnabled'));
    else toast(__('reminderDenied'));
  });
}
/* Die Erinnerung lief bisher aus start(): wer die App an einem
   Trainingstag oeffnete, bekam eine Systemmeldung, dass er heute trainieren
   solle – waehrend er auf die App schaute, und bei jedem Neuladen erneut.
   Das ist keine Erinnerung, das ist Laerm.

   Jetzt gilt: hoechstens einmal am Tag, und nur wenn die Seite gerade nicht
   sichtbar ist. Angesetzt wird sie, wenn die App in den Hintergrund geht –
   wer sie offen hatte und ohne Training wieder verlaesst, ist genau der
   Fall, fuer den sie gedacht ist. Kommt er vorher zurueck, faellt sie aus.

   Mehr ist ohne Server nicht drin: eine geschlossene oder eingefrorene Seite
   kann nicht benachrichtigen. Wer eine verlaessliche Erinnerung will, nimmt
   den Kalender-Export – der Handy-Kalender braucht die App nicht. */
const ERINNERUNG_VERZOEGERUNG = 2 * 60 * 1000;
export let erinnerungTimer = null;

function erinnerungFaellig(){
  if(!erinnerungAktiv() || !('Notification' in window)) return false;
  if(Notification.permission !== 'granted') return false;
  const heute = today();
  /* Einmal am Tag reicht. Gemerkt wird das Datum, nicht ein Zaehler – so
     ueberlebt die Sperre auch einen Neustart. */
  if(state.erinnertAm === heute) return false;
  if(!heutigerPlanTag()) return false;
  return !(state.log || []).some(l => l.d === heute);
}

export function erinnerungPlanen(){
  clearTimeout(erinnerungTimer);
  erinnerungTimer = erinnerungFaellig() ? setTimeout(erinnerungSenden, ERINNERUNG_VERZOEGERUNG) : null;
}

export function erinnerungAbsagen(){
  clearTimeout(erinnerungTimer);
  erinnerungTimer = null;
}

function erinnerungSenden(){
  erinnerungTimer = null;
  /* Zwischen Ansetzen und Ausloesen kann sich alles geaendert haben: die
     Seite ist wieder da, die Einheit ist abgeschlossen, der Tag ist um. */
  if(document.visibilityState === 'visible') return;
  if(!erinnerungFaellig()) return;
  const d = getDay(heutigerPlanTag());
  if(!d) return;
  try{
    new Notification(__('reminderTitle'), {
      body: __('reminderBody', { day: d.key + ' · ' + dayTitleOf(d) }),
      icon: 'icons/icon-192.png'
    });
    state.erinnertAm = today(); save();
  }catch{ /* Benachrichtigung nicht moeglich – dann eben nicht */ }
}

/* ================= Undo fuer Einstellungsaenderungen =================
   Eine Aenderung in den Einstellungen wird sofort gespeichert. Ein
   versehentlicher Klick liess sich bisher nicht zuruecknehmen. Der Toast
   bietet deshalb kurzzeitig ein Rueckgaengig an – wie beim Workout-Undo. */
let settingsUndo = null;
export let settingsUndoTimeout = null;
export function updateSetting(k, v){
  /* Vorherigen Wert merken, falls der Nutzer zurueck will. */
  const vorher = state.settings[k];
  state.settings[k] = v; save();
  /* Rueckgaengig anbieten – aber nicht fuer die Sprache (dort wuerde ein
     Undo die Oberflaeche mitten im Wechsel zurueckreissen). */
  if(k !== 'lang'){
    clearTimeout(settingsUndoTimeout);
    settingsUndo = { k, vorher };
    settingsUndoTimeout = setTimeout(() => { settingsUndo = null; }, 5000);
    toast(__('settingChanged'), false, { text: __('undo'), action: 'setting:undo' });
  }
  if(k === 'lang'){
    setLang(v);
    applyLanguage();
    /* Alle Ansichten neu aufbauen, nicht nur die sichtbare: die verborgenen
       Tabs behielten sonst die alte Sprache, bis man sie zufaellig neu
       rendert. Die laufende Einheit fehlte hier lange – ihre Karten blieben
       in der alten Sprache, bis die Einheit vorbei war. Sie steht deshalb
       unten mit in der Liste, die das Neuzeichnen samt Wiederherstellen der
       Eintraege uebernimmt. */
    renderWarmup(); renderCatFilter(); renderLibrary();
    renderPlanTab(); renderMilestones(); renderBests(); renderRoadmap(); renderHistory();
  }
  if(session.dayKey && ['setsMode', 'streak', 'perExRest', 'rest', 'lang'].includes(k)){
    if(k === 'setsMode') verwerfeUeberzaehligeSaetze();
    cancelHold(); renderWorkout(); restoreSession(session.reps);
  }
  renderAll();
}

export function einstellungZuruecknehmen(){
  if(!settingsUndo) return;
  state.settings[settingsUndo.k] = settingsUndo.vorher;
  settingsUndo = null;
  clearTimeout(settingsUndoTimeout);
  save(); renderAll();
  toast(__('settingUndone'));
}

/* Haken, die es nach einer geaenderten Satzzahl nicht mehr gibt.

   Frueher nur beim Satz-Modus noetig; die Entlastungswoche halbiert die
   Saetze ebenfalls und kann mitten in einer laufenden Einheit beginnen. */
export function verwerfeUeberzaehligeSaetze(){
  Object.keys(session.sets).forEach(key => {
    const id = key.slice(0, key.lastIndexOf('-'));
    const ex = EX_BY_ID[id]; if(!ex) return;
    const max = zielVon(ex.levels[lvlOf(ex)]).sets;
    if(parseInt(key.split('-').pop(), 10) >= max) delete session.sets[key];
  });
}

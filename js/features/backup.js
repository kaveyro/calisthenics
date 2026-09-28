/* Sicherung: JSON- und CSV-Export und -Import, Kalender-Export, Zuruecksetzen. */

import { parseLog, serializeLog } from '../domain/csv.js';
import { isoWeek, today } from '../domain/dates.js';
import { sanitizeDayKey } from '../domain/escape.js';
import { wochenplanAlsIcs } from '../domain/ics.js';
import { mergeStates } from '../domain/merge.js';
import { DEFAULT_STATE, MAX_LOG_ENTRIES, clampBackup as clampBackupPure, migrateState } from '../domain/state.js';
import { EX_BY_ID, MILESTONES } from '../exercises.js';
import { __, exName, exStage, msName } from '../i18n/index.js';
import { store } from '../storage.js';
import { applyTheme, cancelHold, clearSession, dayTitleOf, fmtDate, getDay, getDays, kannTeilen, lvlOf, planLabel, renderAll, renderBanners, save, showTab, stopRest, zielText } from '../app.js';
import { setState, state } from '../core/kern.js';
import { closeSettings } from './einstellungen.js';
import { renderHistory } from './verlauf.js';
import { askChoice, askConfirm, askText, showTextDialog } from '../ui/dialoge.js';
import { toast } from '../ui/hinweise.js';

/* ================= Backup ================= */
function download(name, content, type){
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function exportJSON(){
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

/* Dieselbe Sicherung, nur ueber das Systemblatt statt in den Download-Ordner.

   Auf dem Handy ist das der Unterschied zwischen "liegt irgendwo" und "ist
   in der Cloud" – und die Sicherung ist laut eigener Ansage das groesste
   Datenrisiko dieser App.

   Gebucht wird NUR nach erfolgreichem Teilen. Bricht der Nutzer das Blatt
   ab, wirft share() einen AbortError; dann bleibt die Erinnerung stehen,
   denn ein abgebrochenes Teilen ist keine Sicherung. Dieselbe Regel wie
   oben, nur schaerfer. */
export async function shareJSON(){
  if(!kannTeilen()) return;
  const name = 'progression-backup-' + today() + '.json';
  try{
    await navigator.share({
      files: [new File([JSON.stringify(state, null, 2)], name, { type: 'application/json' })],
      title: name
    });
  }catch(err){
    /* Der Abbruch ist kein Fehler und braucht keine Meldung. */
    if(!(err && err.name === 'AbortError')){
      console.error('[shareJSON]', err);
      toast(__('shareFailed'));
    }
    return;
  }
  state.lastBackup = today();
  state.backupWorkouts = state.workouts || 0;
  state.backupDismissed = 0;
  await save(); renderBanners();
  toast(__('backupShared'));
}

/* Der Wochenrhythmus als Kalenderdatei.

   Die Trainingserinnerung der App kann nur greifen, solange die Seite lebt
   (siehe erinnerungPlanen()). Der Kalender des Geraets braucht sie nicht:
   ein woechentlicher Termin mit Vorwarnung erinnert auch dann, wenn die App
   seit Wochen zu ist. Deshalb steht der Export im Plan-Tab direkt unter dem
   Rhythmus – dort, wo die Tage festgelegt werden.

   Geteilt statt heruntergeladen, wo das Geraet es kann: eine .ics im
   Download-Ordner muss man erst suchen, das Systemblatt bietet den Kalender
   direkt an. Dieselbe Abwaegung wie beim Backup. */
export async function exportICS(){
  const plan = state.wochenplan || {};
  if(!Object.keys(plan).length){ toast(__('icsNoPlan')); return; }

  const uhrzeit = await askText(__('icsTimeTitle'), __('icsTimeLabel'), '18:00', 5);
  if(uhrzeit === null) return;

  const inhalt = wochenplanAlsIcs(plan, key => {
    const d = getDay(key);
    return d ? d.key + ' · ' + dayTitleOf(d) : key;
  }, { von: today(), stempel: stempelJetzt(), uhrzeit: String(uhrzeit).trim() });

  if(!inhalt){ toast(__('icsBadTime')); return; }

  const name = 'progression-trainingstage.ics';
  if(kannTeilen()){
    try{
      await navigator.share({
        files: [new File([inhalt], name, { type: 'text/calendar' })],
        title: name
      });
      toast(__('icsShared'));
    }catch(err){
      if(!(err && err.name === 'AbortError')){
        console.error('[exportICS]', err);
        toast(__('shareFailed'));
      }
    }
    return;
  }
  try{
    download(name, inhalt, 'text/calendar');
    toast(__('icsDownloaded'));
  }catch(err){ console.error('[exportICS]', err); toast(__('icsFailed')); }
}

/* DTSTAMP in UTC. Steht hier und nicht in domain/ics.js: die Schicht ruft
   kein new Date(). */
function stempelJetzt(){
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

export function exportCSV(){
  download('progression-verlauf-' + today() + '.csv', '\uFEFF' + serializeLog(state.log), 'text/csv');
  toast(__('csvDownloaded'));
}
export function exportText(){
  const lines = [__('textHeader', { date: fmtDate(today()) }),
    __('textPlan', { name: planLabel() }),
    __('textWorkouts', { n: state.workouts || 0 }), '', __('textLevels')];
  /* Wochenzusammenfassung: wie viele Einheiten diese Woche. */
  const dieseWoche = (state.log || []).filter(l => isoWeek(l.d) === isoWeek(today())).length;
  if(dieseWoche > 0) lines.push('', __('textWeekSummary'), __('textWeekWorkouts', { n: dieseWoche }));
  getDays().forEach(d => {
    lines.push('', '[' + d.key + '] ' + d.title);
    d.ex.forEach(id => {
      const ex = EX_BY_ID[id]; if(!ex) return;
      const l = lvlOf(ex);
      lines.push('  ' + exName(ex) + ': ' + __('level') + ' ' + (l + 1) + '/' + ex.levels.length +
        ' – ' + exStage(ex, l) + ' (' + zielText(ex.levels[l]) + ')');
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

export function importJSON(input){
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
      setState(migrateState(wahl === 'merge' ? mergeStates(state, sauber) : sauber));
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
export function importCSV(input){
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

export async function resetAll(){
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
  setState(Object.assign(DEFAULT_STATE(), keep));
  clearSession();
  await save();
  document.getElementById('finishBar').style.display = 'none';
  closeSettings(); showTab('train'); renderAll();
  toast(__('resetDone'));
}

/* Wann eine Sicherung faellig ist – reine Logik, kein DOM, kein Zustand.

   Der ganze Verlauf liegt unter einem einzigen localStorage-Schluessel. Die
   App konnte ihn zwar exportieren, hat aber nie festgehalten, wann das
   zuletzt geschah, und nie daran erinnert. Wer den Menuepunkt nicht von sich
   aus findet, traegt sein einziges Exemplar jahrelang ungesichert mit sich. */

/* Nach so vielen Einheiten ohne Sicherung wird erinnert … */
export const BACKUP_NACH_EINHEITEN = 10;
/* … und spaetestens nach so vielen Tagen, sofern seither trainiert wurde. */
export const BACKUP_NACH_TAGEN = 30;

/* Ganze Tage zwischen zwei ISO-Daten. Mittags gerechnet, damit ein
   Sommerzeitwechsel dazwischen das Ergebnis nicht um einen Tag verschiebt. */
function tageZwischen(vonIso, bisIso){
  const von = new Date(vonIso + 'T12:00:00'), bis = new Date(bisIso + 'T12:00:00');
  if(Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime())) return null;
  return Math.round((bis - von) / 864e5);
}

/* Liefert null (nichts zu tun) oder { grund, n } fuer die Meldung:

     'nie'       – noch nie gesichert, n = Zahl der Einheiten
     'einheiten' – n Einheiten seit der letzten Sicherung
     'zeit'      – die letzte Sicherung ist n Tage her

   Erwartet die Felder lastBackup (ISO-Datum), backupWorkouts und
   backupDismissed (Zaehlerstand von workouts zum jeweiligen Zeitpunkt).
   Der Zaehlerstand statt eines Datums, weil nur Trainieren neue Daten
   erzeugt: wer zwei Monate pausiert, braucht keine Erinnerung. */
export function backupFaellig(state, heute){
  if(!state || typeof state !== 'object') return null;

  const workouts = Number(state.workouts) || 0;
  if(workouts <= 0) return null;                       /* nichts zu sichern */

  /* "Spaeter" verstummt fuer dieselbe Spanne wie eine echte Sicherung –
     dasselbe Muster wie deloadDismissed. */
  const seitHinweis = workouts - (Number(state.backupDismissed) || 0);
  if(seitHinweis < BACKUP_NACH_EINHEITEN) return null;

  const letzte = typeof state.lastBackup === 'string' ? state.lastBackup : null;
  if(!letzte) return { grund: 'nie', n: workouts };

  const seitSicherung = workouts - (Number(state.backupWorkouts) || 0);
  if(seitSicherung >= BACKUP_NACH_EINHEITEN) return { grund: 'einheiten', n: seitSicherung };

  /* Die Zeitschiene greift nur, wenn seither ueberhaupt etwas dazukam. */
  const tage = typeof heute === 'string' ? tageZwischen(letzte, heute) : null;
  if(tage !== null && tage >= BACKUP_NACH_TAGEN && seitSicherung > 0) {
    return { grund: 'zeit', n: tage };
  }
  return null;
}

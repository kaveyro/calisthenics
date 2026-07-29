/* Auswertung der Zielangaben aus exercises.js, z. B.
     '3 × 8–12'          -> 3 Saetze, 8 bis 12 Wiederholungen
     '4 × 10–20 Sek'     -> 4 Saetze Halteuebung, 20 Sekunden Countdown
     '4 × 5–8 Versuche'  -> 4 Saetze, 5 bis 8 Wiederholungen

   Bindestrich und Halbgeviertstrich werden beide akzeptiert, und eine
   nachgestellte Einheit ist erlaubt: mit dem frueheren, auf das Zeilenende
   verankerten Muster lieferte '4 × 5–8 Versuche' keine Wiederholungszahl,
   wodurch weder Eingabefelder noch PR-Erfassung erschienen. */

const SETS = /^(\d+)\s*×/;
const HOLD = /(\d+)(?:[–-](\d+))?\s*Sek/;
const REPS = /(\d+)(?:[–-](\d+))?\s*(?:Wdh|Versuche|Reps)?\.?$/;

/* setsMode: 'light' deckelt auf 3 Saetze, 'hard' legt einen drauf. */
export function parseTarget(target, setsMode = 'standard'){
  const str = String(target == null ? '' : target);
  const sm = str.match(SETS);
  const hm = str.match(HOLD);
  const rm = str.match(REPS);

  let sets = sm ? parseInt(sm[1], 10) : 3;
  if(setsMode === 'light') sets = Math.min(sets, 3);
  if(setsMode === 'hard') sets = sets + 1;

  let minReps = null, maxReps = null;
  if(rm && !hm){
    minReps = parseInt(rm[1], 10);
    maxReps = rm[2] ? parseInt(rm[2], 10) : minReps;
  }
  return {
    sets,
    isHold: !!hm,
    holdSecs: hm ? parseInt(hm[2] || hm[1], 10) : 0,
    minReps,
    maxReps
  };
}

/* Auswertung des Trainingslogs – reine Logik, kein DOM, kein Zustand.

   Hintergrund: ein Log-Eintrag hielt bisher nur { d, day, sets, tops, ups,
   reps } fest, also KEINE Uebungen. Wer wissen wollte, welche Uebungen zu
   einer Einheit gehoerten, schlug sie im *heutigen* Plan nach:

     state.log.filter(l => getDay(l.day).ex.includes(id))

   Das ist auf drei erreichbaren Wegen falsch. Nach einer Ersetzung verliert
   die alte Uebung ihre gesamte Historie und die neue erbt eine, die sie nie
   hatte. Nach "Auf Vorlage zuruecksetzen" liefert getDay() fuer jeden eigenen
   Tagesschluessel undefined und die Historie ist leer. Und ein CSV-Import
   bringt Tagesschluessel mit, die im Plan gar nicht vorkommen.

   Seit v6 traegt jeder neue Eintrag seine Uebungen selbst. Fuer die
   Altbestaende bleiben die beiden Rueckfaelle unten. */

/* Uebungs-IDs aus den Wiederholungsschluesseln ('pushup-0' -> 'pushup').
   Die IDs selbst enthalten nie ein '-', der Satzindex haengt hinten an. */
function idsAusReps(reps){
  if(!reps || typeof reps !== 'object') return [];
  const ids = new Set();
  Object.keys(reps).forEach(k => {
    const i = k.lastIndexOf('-');
    if(i > 0) ids.add(k.slice(0, i));
  });
  return [...ids];
}

/* Die Uebungen eines Log-Eintrags.

   planDay ist der Trainingstag, wie er HEUTE im Plan steht – also eine
   Vermutung, kein Beleg. Er wird nur fuer Altbestaende herangezogen, und dann
   zusammen mit den Wiederholungsschluesseln: die sind harte Belege, decken
   aber nur Uebungen mit Wiederholungsfeld ab (Halteuebungen haben keins).
   Die Vereinigung ist damit fuer alte Eintraege besser als jede der beiden
   Quellen allein. */
export function entryExercises(entry, planDay){
  if(!entry || typeof entry !== 'object') return [];
  if(Array.isArray(entry.ex) && entry.ex.length) return [...entry.ex];

  const belegt = idsAusReps(entry.reps);
  const geplant = (planDay && Array.isArray(planDay.ex)) ? planDay.ex : [];
  return [...new Set([...geplant, ...belegt])];
}

export function entryHasExercise(entry, exId, planDay){
  return entryExercises(entry, planDay).includes(exId);
}

/* Die Wiederholungen einer Uebung innerhalb eines Eintrags, nach Satznummer
   sortiert. Luecken sind zulaessig: wer den zweiten Satz leer laesst, hat
   trotzdem einen ersten und dritten. */
export function repsOf(entry, exId){
  const reps = entry && entry.reps;
  if(!reps || typeof reps !== 'object') return [];
  const paare = [];
  Object.keys(reps).forEach(k => {
    const i = k.lastIndexOf('-');
    if(i <= 0 || k.slice(0, i) !== exId) return;
    const nr = parseInt(k.slice(i + 1), 10);
    const wert = reps[k];
    if(Number.isFinite(nr) && typeof wert === 'number' && Number.isFinite(wert)) paare.push([nr, wert]);
  });
  return paare.sort((a, b) => a[0] - b[0]).map(p => p[1]);
}

/* Die letzte Einheit, in der diese Uebung mit Wiederholungen vorkam.
   Liefert { d, reps: [12, 10, 8] } oder null.

   dayOf loest einen Tagesschluessel im Plan auf und wird nur fuer die
   Rueckfaelle in entryExercises() gebraucht; die Schicht kennt den Plan nicht.
   ausser erlaubt es, die gerade laufende Einheit auszunehmen. */
export function lastRepsFor(log, exId, dayOf = () => null, ausser = null){
  if(!Array.isArray(log)) return null;
  for(let i = log.length - 1; i >= 0; i--){
    const l = log[i];
    if(l === ausser) continue;
    if(!entryHasExercise(l, exId, dayOf(l && l.day))) continue;
    const reps = repsOf(l, exId);
    if(reps.length) return { d: l.d, reps };
  }
  return null;
}

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

/* Die zuletzt notierten Wiederholungen je Uebung: { pushup: { d, reps } }.

   Ein einziger Durchlauf rueckwaerts fuer ALLE gefragten Uebungen, und er
   bricht ab, sobald keine mehr offen ist. Je Uebung einzeln zu suchen waere
   der bequemere Weg, aber renderWorkout() laeuft bei jeder Interaktion und
   das Log fasst bis zu 2000 Eintraege – eine nie trainierte Uebung liesse
   jedes Mal das ganze Log durchlaufen. detectPlateaus() wurde aus demselben
   Grund schon einmal umgestellt.

   dayOf loest einen Tagesschluessel im Plan auf und wird nur fuer die
   Rueckfaelle in entryExercises() gebraucht; die Schicht kennt den Plan nicht.
   ausser nimmt einen einzelnen Eintrag aus – etwa den gerade geschriebenen. */
export function lastRepsByExercise(log, exIds, dayOf = () => null, ausser = null){
  const out = {};
  if(!Array.isArray(log) || !exIds) return out;
  const offen = new Set(exIds);

  for(let i = log.length - 1; i >= 0 && offen.size; i--){
    const l = log[i];
    if(l === ausser) continue;
    for(const id of entryExercises(l, dayOf(l && l.day))){
      if(!offen.has(id)) continue;
      const reps = repsOf(l, id);
      /* Eine Einheit, in der die Uebung nur abgehakt wurde, hilft nicht
         weiter – gesucht sind Zahlen zum Vergleichen. Also offen lassen. */
      if(!reps.length) continue;
      out[id] = { d: l.d, reps };
      offen.delete(id);
    }
  }
  return out;
}

/* Einzelabfrage. Liefert { d, reps: [12, 10, 8] } oder null. */
export function lastRepsFor(log, exId, dayOf, ausser){
  return lastRepsByExercise(log, [exId], dayOf, ausser)[exId] || null;
}

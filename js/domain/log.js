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
  return werteAus(entry && entry.reps, exId);
}

/* Dasselbe für die gehaltenen Sekunden einer Halteübung (seit v16). Sie
   stehen in einem eigenen Feld, damit Volumendiagramm, CSV-Spalte und alles
   andere, was Wiederholungen zählt, keine Sekunden mitzählt. */
export function sekOf(entry, exId){
  return werteAus(entry && entry.sek, exId);
}

function werteAus(reps, exId){
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
  const gefunden = sammle(log, exIds, 1, dayOf, ausser, (reps, sek, lvl, d) =>
    reps.length ? { d, reps, lvl } : null);
  Object.keys(gefunden).forEach(id => { out[id] = gefunden[id][0]; });
  return out;
}

/* Die letzten `anzahl` Einheiten mit Zahlen je Uebung, neueste zuerst:
   { pushup: [{ d, reps, sek, lvl }, …] }. Uebungen ohne jede Zahl fehlen.
   Anders als lastRepsByExercise() zaehlen hier auch gehaltene Sekunden –
   die Karte braucht fuer eine Halteuebung genau die.

   Derselbe rueckwaertige Durchlauf wie oben beschrieben, nur dass er je
   Uebung mehr als einen Eintrag einsammelt – der Hinweis auf eine zu
   schwere Stufe braucht zwei Einheiten, nicht eine. */
export function verlaufJeUebung(log, exIds, anzahl = 1, dayOf = () => null, ausser = null){
  /* an: wie sich die Uebung angefuehlt hat ('l', 'p', 'h'), seit v17;
     null, wo nichts angetippt wurde. */
  return sammle(log, exIds, anzahl, dayOf, ausser, (reps, sek, lvl, d, an) =>
    (reps.length || sek.length) ? { d, reps, sek, lvl, an } : null);
}

/* nimm(reps, sek, lvl, d) entscheidet, ob ein Eintrag zaehlt, und baut ihn. */
function sammle(log, exIds, anzahl, dayOf, ausser, nimm){
  const out = {};
  if(!Array.isArray(log) || !exIds || !(anzahl > 0)) return out;
  const offen = new Set(exIds);

  for(let i = log.length - 1; i >= 0 && offen.size; i--){
    const l = log[i];
    if(l === ausser) continue;
    for(const id of entryExercises(l, dayOf(l && l.day))){
      if(!offen.has(id)) continue;
      /* Die Stufe gehoert dazu: nach einem Aufstieg stammen die Zahlen von
         der leichteren Variante und taugen nicht als Vorgabe fuer die neue.
         null, wo der Eintrag sie nicht kennt (vor v15, CSV, nachgetragen). */
      const lvl = l.lv && Number.isInteger(l.lv[id]) ? l.lv[id] : null;
      /* Eine Einheit, in der die Uebung nur abgehakt wurde, hilft nicht
         weiter – gesucht sind Zahlen zum Vergleichen. Also offen lassen. */
      const an = l.an && typeof l.an[id] === 'string' ? l.an[id] : null;
      const treffer = nimm(repsOf(l, id), sekOf(l, id), lvl, l.d, an);
      if(!treffer) continue;
      (out[id] = out[id] || []).push(treffer);
      if(out[id].length >= anzahl) offen.delete(id);
    }
  }
  return out;
}

/* Wann jede Uebung zuletzt drankam: { pushup: '2026-07-30', … }.

   Die Bibliothek listete 42 Uebungen nach Kategorie und Dateireihenfolge und
   verschwieg dabei die eine Angabe, die im Log seit jeher steht. Gerade im
   Zusammenspiel mit dem Plangenerator ist sie die interessante: er baut den
   Plan, und hier steht, was er dabei liegen laesst.

   Anders als lastRepsByExercise() zaehlt hier jede Teilnahme, nicht nur eine
   mit notierten Wiederholungen – "wann war das dran" ist auch dann
   beantwortet, wenn nur abgehakt wurde. Ein Durchlauf ueber das ganze Log;
   ein Abbruch waere nicht moeglich, weil jede Uebung gefragt sein kann. */
export function letztesDatumJeUebung(log, dayOf = () => null){
  const out = {};
  if(!Array.isArray(log)) return out;
  log.forEach(l => {
    if(!l || typeof l.d !== 'string') return;
    entryExercises(l, dayOf(l.day)).forEach(id => {
      if(!out[id] || l.d > out[id]) out[id] = l.d;
    });
  });
  return out;
}

/* Wie oft jeder Plan-Tag dran war: { A: 30, B: 12 }.

   Ersetzt state.byDay. Der Zaehler wurde bei jedem Abschluss hochgezaehlt,
   beim Loeschen zurueckgerechnet, im Undo gesichert und beim Zusammenfuehren
   gemischt – gelesen hat ihn nie jemand. Und er konnte gar nicht stimmen:
   mergeStates() nahm das Maximum beider Geraete, ein CSV-Import zaehlte
   nicht mit, und ein geloeschter Eintrag rechnete nur teilweise zurueck.

   Aus dem Log gezaehlt stimmt es per Konstruktion – dort stehen Importe,
   Nachtraege und Loeschungen ohnehin alle drin. */
export function zaehleJeTag(log){
  const out = {};
  (Array.isArray(log) ? log : []).forEach(l => {
    if(!l || typeof l !== 'object' || typeof l.day !== 'string' || !l.day) return;
    out[l.day] = (out[l.day] || 0) + 1;
  });
  return out;
}

/* Einzelabfrage. Liefert { d, reps: [12, 10, 8] } oder null. */
export function lastRepsFor(log, exId, dayOf, ausser){
  return lastRepsByExercise(log, [exId], dayOf, ausser)[exId] || null;
}

/* Auswertung der Zielangaben aus exercises.js.

   Eine Stufe trägt ihr Ziel als Daten:
     { saetze: 4, wdh: [6, 10] }                   Wiederholungen
     { saetze: 4, sek: [10, 20] }                  Halteübung
     { saetze: 4, wdh: [5, 8], art: 'versuche' }   Versuche
   Ein fester Wert steht als [n, n].

   Bis hierher war das ein Text wie '4 × 6–10', den drei reguläre Ausdrücke
   zerlegten. Das Muster musste Binde- und Halbgeviertstrich kennen, eine
   nachgestellte Einheit dulden und Halteübungen am Wort 'Sek' erkennen – und
   ein Tippfehler in einer der 166 Stufen ergab still „3 Sätze, keine
   Wiederholungen": keine Fehlermeldung, nur eine Übung ohne Eingabefelder.
   stufeGueltig() macht daraus eine Aussage, die sich prüfen lässt, und
   test/target.test.js prüft damit den ganzen Katalog.

   Die Übersetzung wurde dabei gleich mit einfacher. Die Anzeige ersetzte
   bisher 'Sek' und 'Versuche' im fertigen Text, weil die Halteerkennung am
   deutschen Wort hing und übersetzte Ziele sie zerlegt hätten. Jetzt ist die
   Einheit ein Feld, und zielText() bekommt die Wörter herein.

   Rein: kein DOM, kein Zustand, keine Übersetzung. */

/* [min, max] aus ganzen Zahlen größer null, min nicht über max. */
const paar = v => Array.isArray(v) && v.length === 2 &&
  Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[0] > 0 && v[0] <= v[1];

/* Ob eine Stufe ein brauchbares Ziel trägt: eine Satzzahl, genau eines von
   wdh und sek, und art nur als 'versuche' an Wiederholungen. */
export function stufeGueltig(level){
  if(!level || typeof level !== 'object') return false;
  if(!Number.isInteger(level.saetze) || level.saetze < 1) return false;
  const hatWdh = level.wdh !== undefined, hatSek = level.sek !== undefined;
  if(hatWdh === hatSek) return false;
  if(!paar(hatWdh ? level.wdh : level.sek)) return false;
  if(level.art !== undefined && (level.art !== 'versuche' || !hatWdh)) return false;
  return true;
}

/* Sätze und Zielzahlen einer Stufe. setsMode: 'light' deckelt auf 3 Sätze,
   'hard' legt einen drauf.

   Die Form des Ergebnisses ist dieselbe wie beim früheren parseTarget(), damit
   sich an den Aufrufern nur der Eingang ändert. Neu ist allein `art`. */
export function zielAuswerten(level, setsMode = 'standard'){
  const l = level && typeof level === 'object' ? level : {};
  /* Rückfall statt Absturz: eine unbrauchbare Stufe ergibt drei Sätze ohne
     Zahlen. Das ist dasselbe stille Verhalten wie früher – nur dass der
     Katalogtest es jetzt verhindert, bevor es ausgeliefert wird. */
  let sets = Number.isInteger(l.saetze) && l.saetze > 0 ? l.saetze : 3;
  if(setsMode === 'light') sets = Math.min(sets, 3);
  if(setsMode === 'hard') sets = sets + 1;

  const isHold = paar(l.sek);
  const wdh = !isHold && paar(l.wdh) ? l.wdh : null;
  return {
    sets,
    isHold,
    /* Heruntergezählt wird die Obergrenze, wie bisher: 10–20 Sek hält 20. */
    holdSecs: isHold ? l.sek[1] : 0,
    minReps: wdh ? wdh[0] : null,
    maxReps: wdh ? wdh[1] : null,
    art: isHold ? 'sek' : (wdh && l.art === 'versuche' ? 'versuche' : 'wdh')
  };
}

/* Anzeigetext, etwa '4 × 6–10', '4 × 10–20 Sek' oder '4 × 5–8 Versuche'.
   Die Einheitenwörter kommen herein; ohne sie stehen die deutschen. Ein
   fester Wert erscheint einmal: '2 × 60 Sek', nicht '2 × 60–60 Sek'. */
export function zielText(level, woerter = {}){
  const l = level && typeof level === 'object' ? level : {};
  const spanne = v => paar(v) ? (v[0] === v[1] ? String(v[0]) : v[0] + '–' + v[1]) : '';
  const saetze = Number.isInteger(l.saetze) && l.saetze > 0 ? l.saetze : 3;
  if(paar(l.sek)) return saetze + ' × ' + spanne(l.sek) + ' ' + (woerter.sek || 'Sek');
  const text = saetze + ' × ' + spanne(l.wdh);
  return l.art === 'versuche' ? text + ' ' + (woerter.versuche || 'Versuche') : text;
}

/* Ob das obere Limit in allen Sätzen erreicht ist – aus den eingetragenen
   Zahlen statt aus einem Häkchen, das der Nutzer selbst setzt.

   Bisher entschied allein dieses Häkchen („Oberes Limit in allen Sätzen
   geschafft") über den Aufstieg, während die Wiederholungen daneben in
   denselben Sätzen standen und für Bestleistungen und Volumen ausgewertet
   wurden – nur für die Progression nie. Man konnte 4 × 12 in einer 6–10-
   Spanne eintragen und stieg nicht auf, oder 4 × 4 eintragen, das Häkchen
   setzen und stieg auf.

   Drei Antworten, nicht zwei. true und false nur, wenn sich das aus den
   Zahlen ergibt. null heißt „lässt sich nicht entscheiden": eine
   Halteübung, deren gehaltene Sekunden die App nicht je Satz erfasst, oder
   ein Satz ohne Zahl. Dann bleibt es bei der Handeingabe – die App soll
   nichts behaupten, was sie nicht weiß.

   ziel ist das Ergebnis von zielAuswerten(), also schon mit Satz-Modus und
   Entlastungswoche: gezählt werden die Sätze, die heute wirklich anstehen. */
export function limitErreicht(ziel, repsJeSatz){
  if(!ziel || ziel.isHold || !Number.isInteger(ziel.maxReps) || !(ziel.sets > 0)) return null;
  const reps = Array.isArray(repsJeSatz) ? repsJeSatz.slice(0, ziel.sets) : [];
  /* 0 ist eine gültige Zahl – ein Satz, der nicht ging –, und kein
     fehlender Eintrag. */
  if(reps.length < ziel.sets || reps.some(n => !Number.isInteger(n) || n < 0)) return null;
  return reps.every(n => n >= ziel.maxReps);
}

/* Was heute in jedem Satz ansteht, aus der letzten Einheit derselben Stufe.

   Je Satz eine Wiederholung mehr als beim letzten Mal, gedeckelt auf die
   Obergrenze. Das ist die Doppelprogression, die im Modell längst steckt –
   erst die Spanne hinauf, dann die nächste Stufe –, nur stand bisher in jeder
   Einheit dieselbe Spanne da, obwohl die App wusste, was letztes Mal ging.

   Standen alle Sätze schon oben, heißt das NICHT, dass die Stufe ansteht:
   aufgestiegen wird erst nach so vielen Einheiten in Folge, wie die
   Einstellung verlangt (Vorgabe zwei). Dann lautet das Ziel, es noch einmal
   zu schaffen – allesOben sagt das dem Aufrufer.

   Nicht für Halteübungen: ihr Countdown steht fest, „eine Sekunde mehr" gibt
   es dort nicht. Und nicht ohne Zahlen. Ob die Zahlen zur heutigen Stufe
   gehören, prüft der Aufrufer – hier kommen nur Zahlen an.

   Hatte die letzte Einheit weniger Sätze als heute, gilt für die
   zusätzlichen dasselbe wie für den letzten bekannten. */
/* Die Vorgabe für die erste Einheit auf einer Stufe: die Untergrenze in
   jedem Satz. Nach einem Aufstieg schweigt tagesziel() zu Recht – die Zahlen
   der leichteren Variante taugen nicht als Vorgabe. Gerade dort ist „fang
   unten an" aber der nützlichste Satz: wer nach dem Aufstieg gleich die
   Obergrenze versucht, verreißt die Form in der Variante, die er gerade
   erst lernt. Nicht für Halteübungen und nicht ohne Spanne. */
export function einstiegsziel(ziel){
  if(!ziel || ziel.isHold || !Number.isInteger(ziel.minReps) || !(ziel.sets > 0)) return null;
  return Array.from({ length: ziel.sets }, () => ziel.minReps);
}

export function tagesziel(ziel, letzte){
  if(!ziel || ziel.isHold || !Number.isInteger(ziel.maxReps) || !(ziel.sets > 0)) return null;
  const werte = (Array.isArray(letzte) ? letzte : []).filter(n => Number.isInteger(n) && n >= 0);
  if(!werte.length) return null;
  const vorher = s => werte[Math.min(s, werte.length - 1)];
  const allesOben = werte.length >= ziel.sets &&
    werte.slice(0, ziel.sets).every(n => n >= ziel.maxReps);
  return {
    reps: Array.from({ length: ziel.sets }, (_, s) => Math.min(ziel.maxReps, vorher(s) + 1)),
    allesOben
  };
}

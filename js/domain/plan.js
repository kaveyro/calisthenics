/* Fester Wochenrhythmus – reine Logik, kein DOM, kein Zustand.

   Die App wusste bisher nicht, ob heute ein Trainingstag ist.
   nextSuggestedKey() rotierte stur weiter: nach der letzten Einheit kommt
   der naechste Plan-Tag, egal ob Montag oder Sonntag. Wer feste Tage hat,
   bekam weder eine Ansage noch eine Vorschau, und das Wochenziel in den
   Statistiken war eine Zahl ohne Bezug.

   Der Wochenplan ist eine Zuordnung Wochentag -> Plan-Tag:

     { '1': 'A', '3': 'B', '5': 'A' }    0 = Sonntag … 6 = Samstag

   Die Zaehlung folgt Date.getDay(), damit hier nicht umgerechnet werden
   muss; die Oberflaeche zeigt trotzdem Montag zuerst.

   Ein leerer Plan heisst "kein fester Rhythmus" und liefert ueberall null
   bzw. eine leere Liste – die Rotation bleibt dann unveraendert zustaendig.

   Datum kommt herein statt new Date() zu rufen, wie ueberall in
   js/domain/dates.js. */

const objekt = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
/* Lokal formatieren, nicht ueber toISOString – sonst rutscht das Datum je
   nach Zeitzone auf den Vor- oder Folgetag. */
const lokalIso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
  '-' + String(d.getDate()).padStart(2, '0');

/* Der Plan-Tag fuer ein Datum, oder null.

   Geprueft wird nur die Zuordnung, nicht ob es den Tag im Plan noch gibt –
   das entscheidet der Aufrufer ueber getDay(). Ein Plan darf wechseln,
   ohne dass die Zuordnung dabei geloescht wird. */
export function tagFuerWochentag(wochenplan, iso){
  const d = new Date(String(iso) + 'T12:00:00');
  if(Number.isNaN(d.getTime())) return null;
  const key = objekt(wochenplan)[String(d.getDay())];
  return typeof key === 'string' && key ? key : null;
}

/* Die geplanten Termine ab einem Datum, `tage` Tage weit (einschliesslich
   des Starttags): [{ d: '2026-08-03', key: 'A' }, …].

   Fuer den Kalender, der bisher nur Vergangenheit zeigte. */
export function naechsteTermine(wochenplan, vonIso, tage){
  const out = [];
  const n = Math.max(0, Math.min(400, Math.round(Number(tage))|| 0));
  const start = new Date(String(vonIso) + 'T12:00:00');
  if(Number.isNaN(start.getTime()) || !Object.keys(objekt(wochenplan)).length) return out;

  for(let i = 0; i < n; i++){
    const d = new Date(start.getTime());
    d.setDate(d.getDate() + i);
    const key = objekt(wochenplan)[String(d.getDay())];
    if(!key) continue;
    out.push({ d: lokalIso(d), key });
  }
  return out;
}

/* Feste Wochentage fuer einen erzeugten Plan: Tag-Keys in Planreihenfolge
   -> { '1': 'A', '3': 'B', … }. Mehr als sechs Tage oder keiner ergeben
   einen leeren Plan, also keinen Rhythmus.

   Der Generator baute bisher die Tage, verteilte sie aber nicht auf die
   Woche – und die Reihenfolge der Plan-Tage ist nur dann gut, wenn man
   sie auch mit Pausen dazwischen trainiert:
     2 Tage  Mo, Do          zwei Ruhetage zwischen den Ganzkoerpertagen
     3 Tage  Mo, Mi, Fr      je ein Ruhetag
     4 Tage  Mo, Di, Do, Fr  Ober- und Unterkoerper im Wechsel, derselbe
                             Tagestyp drei Tage auseinander
     5 Tage  Mo, Di, Mi, Fr, Sa
     6 Tage  Mo bis Sa       der Sonntag bleibt frei
   Zwei gleiche Tagestypen folgen so nie direkt aufeinander. */
const VORSCHLAG = {
  1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6]
};
export function wochentageVorschlag(keys){
  const liste = Array.isArray(keys) ? keys.filter(k => typeof k === 'string' && k) : [];
  const tage = VORSCHLAG[liste.length];
  if(!tage) return {};
  return Object.fromEntries(tage.map((wd, i) => [String(wd), liste[i]]));
}

/* Die laufende Woche Montag bis Sonntag, fuer die Wochenleiste auf der
   Heute-Karte: je Tag das Datum, ob an ihm trainiert wurde, ob er laut
   Rhythmus geplant ist und ob er heute ist.

   Trainiert heisst: mindestens ein Eintrag im Log mit diesem Datum. Zwei
   Einheiten an einem Tag sind ein Haken – gezaehlt wird die Zahl der
   Einheiten daneben, nicht hier. */
export function wochenStand(log, wochenplan, heuteIso){
  const heute = new Date(String(heuteIso) + 'T12:00:00');
  if(Number.isNaN(heute.getTime())) return [];
  const montag = new Date(heute.getTime());
  montag.setDate(heute.getDate() - (heute.getDay() + 6) % 7);
  const trainiert = new Set((Array.isArray(log) ? log : []).map(l => l && l.d));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(montag.getTime());
    d.setDate(montag.getDate() + i);
    const iso = lokalIso(d);
    return { d: iso, trainiert: trainiert.has(iso), geplant: !!tagFuerWochentag(wochenplan, iso), heute: iso === heuteIso };
  });
}

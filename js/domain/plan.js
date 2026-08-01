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
    /* Lokal formatieren, nicht ueber toISOString – sonst rutscht das Datum
       je nach Zeitzone auf den Vor- oder Folgetag. */
    out.push({
      d: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0'),
      key
    });
  }
  return out;
}

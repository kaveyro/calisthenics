/* Stagnationserkennung: welche Übungen kommen seit mehreren Einheiten nicht
   voran? Reine Logik – kein DOM, kein Zustand, keine Übersetzung. Zurück
   kommen Übungs-IDs; den Anzeigenamen bestimmt der Aufrufer.

   Regel (unverändert gegenüber der vorherigen Fassung): eine Übung gilt als
   stagnierend, wenn unter ihren letzten fünf Einheiten mindestens vier
   liegen und in keiner davon ein Level-Up stattfand. Übungen auf der
   höchsten Stufe sind ausgenommen – dort gibt es nichts mehr zu erreichen.
*/

/* Wie viele der letzten Einheiten betrachtet werden und wie viele davon
   mindestens vorliegen müssen, damit die Aussage etwas wert ist. */
const FENSTER = 5;
const MINDESTENS = 4;

export function detectPlateaus(days, log, levels, exById){
  if(!Array.isArray(days) || !Array.isArray(log) || !log.length) return [];

  /* Tag-Key -> enthaltene Übungen. Ersetzt das lineare getDay() im
     Filter, das früher pro Log-Eintrag erneut über alle Tage suchte. */
  const uebungenProTag = new Map();
  for(const d of days){
    if(d && typeof d.key === 'string' && Array.isArray(d.ex)) uebungenProTag.set(d.key, d.ex);
  }

  /* Kandidaten in der Reihenfolge ihres ersten Auftretens, ohne Dopplung.
     Eine Übung, die an zwei Tagen steht, wurde früher zweimal gemeldet und
     erschien doppelt im Banner. */
  const kandidaten = [];
  const gesehen = new Set();
  for(const d of days){
    if(!d || !Array.isArray(d.ex)) continue;
    for(const id of d.ex){
      if(gesehen.has(id)) continue;
      gesehen.add(id);
      const ex = exById[id];
      if(!ex) continue;
      const lvl = (levels && levels[id]) || 0;
      if(lvl >= ex.levels.length - 1) continue;   /* höchste Stufe erreicht */
      kandidaten.push(id);
    }
  }
  if(!kandidaten.length) return [];

  /* Das Log EINMAL von hinten durchlaufen und je Kandidat die letzten
     FENSTER Einträge einsammeln. Früher wurde es je Übung komplett
     gefiltert – bei 2000 Einträgen und 7 Übungen ein Vielfaches an Arbeit,
     und das bei jedem Render. */
  const treffer = new Map(kandidaten.map(id => [id, []]));
  let offen = kandidaten.length;

  for(let i = log.length - 1; i >= 0 && offen > 0; i--){
    const eintrag = log[i];
    if(!eintrag) continue;
    const tagUebungen = uebungenProTag.get(eintrag.day);
    if(!tagUebungen) continue;                    /* Tag existiert nicht mehr */

    for(const id of tagUebungen){
      const liste = treffer.get(id);
      if(!liste || liste.length >= FENSTER) continue;
      liste.push(eintrag);
      if(liste.length === FENSTER) offen--;
    }
  }

  return kandidaten.filter(id => {
    const liste = treffer.get(id);
    return liste.length >= MINDESTENS && !liste.some(l => l.ups && l.ups.length);
  });
}

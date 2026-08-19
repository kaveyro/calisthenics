/* Stagnationserkennung: welche Übungen kommen seit mehreren Einheiten nicht
   voran? Reine Logik – kein DOM, kein Zustand, keine Übersetzung. Zurück
   kommen Übungs-IDs; den Anzeigenamen bestimmt der Aufrufer.

   Regel: eine Übung gilt als stagnierend, wenn unter ihren letzten fünf
   Einheiten mindestens vier liegen und in keiner davon SIE aufgestiegen ist.
   Übungen auf der höchsten Stufe sind ausgenommen – dort gibt es nichts mehr
   zu erreichen.

   Das „sie" war der Fehler. Geprüft wurde `l.ups.length`, also ob in der
   Einheit überhaupt irgendjemand aufgestiegen ist – und weil ein Log-Eintrag
   seine Aufstiege bis v14 als übersetzten Anzeigetext festhielt, ging es
   auch gar nicht anders. Auf einem Tag mit sieben Übungen genügte damit eine
   einzige, die sich bewegt, und für die übrigen sechs schwieg die Erkennung.
   Genau die Lage, für die es sie gibt. Umgekehrt wurde an einem Tag ohne
   jeden Aufstieg pauschal alles gemeldet.

   Zweite Korrektur an derselben Stelle: welche Übungen zu einer Einheit
   gehörten, stand hier im HEUTIGEN Plan – eine gestern hinzugefügte Übung
   bekam damit fünf alte Einheiten angerechnet, in denen sie nie vorkam, und
   war sofort „stagnierend". entryExercises() nimmt stattdessen, was der
   Eintrag selbst mitschreibt, und fällt nur für Altbestände auf den Plan
   zurück.
*/

import { entryExercises } from './log.js';

/* Wie viele der letzten Einheiten betrachtet werden und wie viele davon
   mindestens vorliegen müssen, damit die Aussage etwas wert ist. */
const FENSTER = 5;
const MINDESTENS = 4;

export function detectPlateaus(days, log, levels, exById){
  if(!Array.isArray(days) || !Array.isArray(log) || !log.length) return [];

  /* Tag-Key -> Plan-Tag. Ein Nachschlagen statt der linearen Suche, die
     früher pro Log-Eintrag erneut über alle Tage lief. Gebraucht wird er nur
     noch als Rückfall für Einträge ohne eigene Übungsliste. */
  const tagNachKey = new Map();
  for(const d of days){
    if(d && typeof d.key === 'string') tagNachKey.set(d.key, d);
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

    for(const id of entryExercises(eintrag, tagNachKey.get(eintrag.day))){
      const liste = treffer.get(id);
      if(!liste || liste.length >= FENSTER) continue;
      liste.push(eintrag);
      if(liste.length === FENSTER) offen--;
    }
  }

  return kandidaten.filter(id => {
    const liste = treffer.get(id);
    return liste.length >= MINDESTENS &&
      !liste.some(l => Array.isArray(l.ups) && l.ups.includes(id));
  });
}

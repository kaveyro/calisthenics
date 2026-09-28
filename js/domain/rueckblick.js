/* Wochenrückblick: was die letzte volle Woche gebracht hat, neben der
   Woche davor.

   Das Abschlussblatt sagt nach jeder Einheit, wie sie war; der Verlauf
   zeigt Balken über Wochen. Dazwischen fehlte der Blick, den man am
   Montag hat: Wie war die Woche – mehr oder weniger als die davor, und
   was ist aufgestiegen?

   Gezählt wird aus dem Log wie im Jahresrückblick: Sätze, Wiederholungen
   und gehaltene Sekunden, wie sie eingetragen wurden, Aufstiege über
   ups, die Dauer nur aus gemessenen Einheiten. Nachgetragene Einheiten
   zählen mit ihren Sätzen, haben aber keine Wiederholungen und keine
   Dauer – der Vergleich bleibt damit ehrlich, nur ärmer.

   Rein: kein DOM, kein Zustand. */

import { isoWeek, isoDaysAgo } from './dates.js';

/* Die Summen einer Woche. */
export function wochenSumme(eintraege){
  let saetze = 0, wdh = 0, sek = 0, dauer = 0;
  const ups = [];
  for(const l of Array.isArray(eintraege) ? eintraege : []){
    if(Number.isFinite(l.sets) && l.sets > 0) saetze += l.sets;
    Object.values(l.reps || {}).forEach(v => { if(v > 0) wdh += v; });
    Object.values(l.sek || {}).forEach(v => { if(v > 0) sek += v; });
    if(Number.isFinite(l.dauer) && l.dauer > 0) dauer += l.dauer;
    (Array.isArray(l.ups) ? l.ups : []).forEach(id => { if(typeof id === 'string' && !ups.includes(id)) ups.push(id); });
  }
  return { einheiten: Array.isArray(eintraege) ? eintraege.length : 0, saetze, wdh, sek, dauer, ups };
}

/* Der Rückblick auf die letzte volle Woche oder null, wenn in ihr nicht
   trainiert wurde – eine Karte „0 Einheiten" am Montag wäre ein Vorwurf,
   kein Rückblick. vorwoche ist null, wenn die Woche davor leer war; dann
   gibt es nichts zu vergleichen. woche und davor sind Wochenschlüssel
   wie '2026-KW39'. */
export function wochenRueckblick(log, now = new Date()){
  const eintraege = Array.isArray(log) ? log.filter(l => l && typeof l.d === 'string') : [];
  const letzte = isoWeek(isoDaysAgo(7, now));
  const davor = isoWeek(isoDaysAgo(14, now));
  const jene = eintraege.filter(l => isoWeek(l.d) === letzte);
  if(!jene.length) return null;
  const vor = eintraege.filter(l => isoWeek(l.d) === davor);
  return { woche: letzte, davor, ...wochenSumme(jene), vorwoche: vor.length ? wochenSumme(vor) : null };
}

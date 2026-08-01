/* Trainingsvolumen je Woche.

   Die Wiederholungen liegen seit v6 in jedem Log-Eintrag (entry.reps) und
   wurden nirgends ausgewertet. Das Volumendiagramm zaehlte stattdessen
   abgehakte Saetze – darin sehen 4 × 5 und 4 × 15 gleich aus, und genau der
   Unterschied ist das, was ueber die Wochen steigen soll.

   Rein: kein DOM, kein Modulzustand, keine Importe nach aussen. exById wird
   hereingereicht, wie bei clampBackup() und detectPlateaus().

   Halteuebungen haben keine reps-Eintraege; ihre Zeit unter Spannung liesse
   sich nur ueber die Zielangabe schaetzen, und eine geschaetzte Zahl neben
   gezaehlten waere irrefuehrend. Sie zaehlen deshalb weiter ueber `saetze`
   mit und bleiben aus `reps` heraus. Ein reiner Skill-Tag sieht im
   Wiederholungsdiagramm also mager aus – das ist er auch. */

import { isoWeek } from './dates.js';

const zahl = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function volumenJeWoche(log, exById = {}){
  const out = {};
  (Array.isArray(log) ? log : []).forEach(l => {
    if(!l || typeof l !== 'object' || typeof l.d !== 'string') return;
    const w = isoWeek(l.d);
    const eintrag = out[w] || (out[w] = { reps: 0, saetze: 0, jeKat: {} });
    eintrag.saetze += zahl(l.sets);

    const reps = (l.reps && typeof l.reps === 'object') ? l.reps : {};
    Object.keys(reps).forEach(key => {
      const n = zahl(reps[key]);
      if(!n) return;
      eintrag.reps += n;
      /* Der Schluessel ist "uebung-satznummer"; die Uebung steht vor dem
         LETZTEN Bindestrich, damit IDs mit Bindestrich heil bleiben. */
      const ex = exById[key.slice(0, key.lastIndexOf('-'))];
      if(!ex || !ex.cat) return;
      eintrag.jeKat[ex.cat] = (eintrag.jeKat[ex.cat] || 0) + n;
    });
  });
  return out;
}

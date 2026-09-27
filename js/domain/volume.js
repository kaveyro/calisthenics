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
   Wiederholungsdiagramm also mager aus – das ist er auch.

   jeKat zaehlt dagegen SAETZE je Kategorie, und zwar Wiederholungs- wie
   Haltesaetze (seit v16 stehen deren Sekunden in entry.sek). Bis hierher
   zaehlte es Wiederholungen: "Druecken 48, Ziehen 138" las sich wie ein
   Ungleichgewicht, lag aber daran, dass der Drucktag vor allem aus
   Halteuebungen besteht, die dort nicht vorkamen. Fuer die Frage "trainiere
   ich beide Seiten gleich viel" ist der Satz die ehrliche Einheit – ein Satz
   Front Lever und ein Satz Rudern sind vergleichbarer als 20 Sekunden und
   12 Wiederholungen. */

import { isoWeek } from './dates.js';

const zahl = v => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/* Nach Kalenderwoche – der Regelfall und die urspruengliche Form. */
export function volumenJeWoche(log, exById = {}){
  return volumenJeGruppe(log, exById, isoWeek);
}

/* Dieselbe Auswertung ueber eine frei gewaehlte Gruppierung: die Funktion
   bekommt ein ISO-Datum und liefert den Schluessel. Fuer lange Zeitraeume
   zeigt der Verlauf Monate statt Wochen – bei drei Jahren waeren das sonst
   ueber 150 Balken. Die Gruppierung kommt als Parameter herein, damit die
   Schicht rein bleibt; isoWeek liegt daneben in dates.js. */
export function volumenJeGruppe(log, exById = {}, gruppe = isoWeek){
  const out = {};
  (Array.isArray(log) ? log : []).forEach(l => {
    if(!l || typeof l !== 'object' || typeof l.d !== 'string') return;
    const w = gruppe(l.d);
    /* isoWeek() liefert fuer ein unlesbares Datum '' – daraus entstuende
       sonst eine namenlose Gruppe, die im Diagramm als leerer Balken steht. */
    if(!w) return;
    const eintrag = out[w] || (out[w] = { reps: 0, saetze: 0, jeKat: {} });
    eintrag.saetze += zahl(l.sets);

    /* Der Schluessel ist "uebung-satznummer"; die Uebung steht vor dem
       LETZTEN Bindestrich, damit IDs mit Bindestrich heil bleiben. */
    const satzZaehlen = key => {
      const ex = exById[key.slice(0, key.lastIndexOf('-'))];
      if(ex && ex.cat) eintrag.jeKat[ex.cat] = (eintrag.jeKat[ex.cat] || 0) + 1;
    };
    const reps = (l.reps && typeof l.reps === 'object') ? l.reps : {};
    Object.keys(reps).forEach(key => {
      const n = zahl(reps[key]);
      if(!n) return;
      eintrag.reps += n;
      satzZaehlen(key);
    });
    const sek = (l.sek && typeof l.sek === 'object') ? l.sek : {};
    Object.keys(sek).forEach(key => { if(zahl(sek[key])) satzZaehlen(key); });
  });
  return out;
}

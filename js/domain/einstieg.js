/* Startstufen aus einer Selbsteinschaetzung.

   Ohne den Einstieg beginnt jeder bei Stufe 1 von allen 42 Uebungen. Wer
   schon 20 saubere Liegestuetze schafft, bekommt in seiner ersten Einheit
   "Wandliegestuetze 3 × 10" und muss sich ueber die ±-Knoepfe einzeln
   hocharbeiten – 42-mal. Das ist der erste Eindruck der App.

   Gefragt wird NICHT nach Wiederholungen. Die Leitern steigen ueber den
   Hebel, nicht ueber die Zahl: bei den Liegestuetzen steht in fast jeder
   Stufe "4 × 6–10", vom Tisch bis zum einarmigen. Aus "20 Liegestuetze"
   liesse sich die Stufe also gar nicht ableiten. Gefragt wird stattdessen
   direkt nach der Stufe – der Nutzer sieht die Leiter mit Namen und Ziel
   und waehlt, was er sauber schafft. Das ist genau, braucht keine Heuristik,
   ueberlebt jede Aenderung an den Uebungsdaten und erklaert nebenbei das
   Grundprinzip der App.

   Rein: kein DOM, kein Modulzustand, keine Importe nach aussen. Die Importe
   aus equipment.js sind domain -> domain und damit erlaubt. */

import { exMoeglich, levelMoeglich, hoechsteStufe } from './equipment.js';

/* Je Kategorie eine Ankeruebung, nach Vorliebe geordnet: die erste, die mit
   der vorhandenen Ausruestung ueberhaupt machbar ist, gewinnt. Beim Ziehen
   sind das zwei – ohne Stange ist der Klimmzug keine sinnvolle Frage, das
   Rudern am Tisch schon. */
export const ANKER = [
  { kat: 'push', ids: ['pushup'] },
  { kat: 'pull', ids: ['pullup', 'row'] },
  { kat: 'legs', ids: ['squat'] },
  { kat: 'core', ids: ['plank'] }
];

/* Wie stark die Einschaetzung auf die uebrigen Uebungen derselben Kategorie
   uebertragen wird. Bewusst nur zur Haelfte: zu niedrig kostet eine Einheit
   mit zu leichtem Ziel, zu hoch bedeutet eine Uebung, die sich nicht sauber
   ausfuehren laesst – und eine Progression, die auf einer Luege aufbaut. */
const DAEMPFUNG = 0.5;

/* Skills bleiben unangetastet. Planche, Front Lever und Handstand sind die
   Uebungen, bei denen eine zu hohe Startstufe nicht nur unpassend, sondern
   gefaehrlich ist – und niemand faengt bei ihnen woanders an als vorn. */
const NICHT_UEBERTRAGEN = new Set(['skill']);

const liste = v => Array.isArray(v) ? v : [];

/* Die Ankeruebung einer Kategorie, oder null. */
export function ankerUebung(kat, exercises, equipment){
  const eintrag = ANKER.find(a => a.kat === kat);
  if(!eintrag) return null;
  for(const id of eintrag.ids){
    const ex = liste(exercises).find(e => e && e.id === id);
    if(ex && exMoeglich(ex, equipment)) return ex;
  }
  return null;
}

/* Die Fragen des Einstiegs: je Kategorie die Ankeruebung und die Stufen, die
   mit der vorhandenen Ausruestung ueberhaupt in Frage kommen.

   Eine Stufe, die ein fehlendes Geraet braucht, steht nicht zur Wahl – sonst
   liesse sich der Einstieg auf einer Stufe beginnen, die die App danach
   sofort als gesperrt meldet. */
export function einstiegsFragen(exercises, equipment){
  return ANKER.map(({ kat }) => {
    const ex = ankerUebung(kat, exercises, equipment);
    if(!ex) return null;
    const stufen = ex.levels
      .map((l, i) => i)
      .filter(i => levelMoeglich(ex, i, equipment));
    return stufen.length ? { kat, ex, stufen } : null;
  }).filter(Boolean);
}

/* Aus den Antworten die Startstufen aller betroffenen Uebungen.

   antworten ist { push: 2, pull: 0, … } – der gewaehlte Stufenindex der
   jeweiligen Ankeruebung. Eine fehlende oder unbrauchbare Antwort laesst die
   Kategorie unberuehrt; das Ergebnis enthaelt nur Uebungen, fuer die
   tatsaechlich etwas anderes als 0 herauskommt. */
export function startStufen({ exercises, equipment, antworten } = {}){
  const alle = liste(exercises);
  const ant = (antworten && typeof antworten === 'object') ? antworten : {};
  const out = {};

  ANKER.forEach(({ kat }) => {
    const anker = ankerUebung(kat, alle, equipment);
    if(!anker) return;
    const roh = Number(ant[kat]);
    if(!Number.isInteger(roh) || roh < 0) return;

    /* Nie ueber das hinaus, was die Ausruestung hergibt – und nie ueber das
       Ende der Leiter, falls eine Antwort aus einer aelteren Fassung kommt. */
    const grenze = hoechsteStufe(anker, equipment);
    if(grenze < 0) return;
    const stufe = Math.min(roh, anker.levels.length - 1, grenze);
    if(stufe > 0) out[anker.id] = stufe;

    const anteil = anker.levels.length > 1 ? stufe / (anker.levels.length - 1) : 0;
    if(!anteil) return;

    alle.forEach(ex => {
      if(!ex || ex.id === anker.id || ex.cat !== kat) return;
      if(NICHT_UEBERTRAGEN.has(ex.cat)) return;
      const eigeneGrenze = hoechsteStufe(ex, equipment);
      if(eigeneGrenze < 0) return;
      const ziel = Math.min(
        Math.floor(anteil * (ex.levels.length - 1) * DAEMPFUNG),
        eigeneGrenze);
      if(ziel > 0) out[ex.id] = ziel;
    });
  });

  return out;
}

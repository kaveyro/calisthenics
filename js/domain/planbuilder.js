/* Baut aus der vorhandenen Ausruestung einen Trainingsplan.

   Die vier Vorlagen in js/exercises.js sind fest verdrahtet und geraete-arm
   gehalten. Wer eine Klimmzugstange hat, bekommt darin keine einzige
   Ringuebung angeboten; wer keine hat, bekommt in jeder Vorlage drei
   Zuguebungen an der Stange und muss den Plan von Hand umbauen. Diese
   Funktion nimmt ihm das ab.

   Rein: kein DOM, kein Modulzustand, keine Importe nach aussen. Die
   Uebungsliste und die Texte werden hereingereicht – dieselbe Einspeisung
   wie bei clampBackup(data, exById) und detectPlateaus(...).

   Deterministisch: gleiche Eingabe, gleicher Plan. Kein Zufall, damit der
   Nutzer die Vorschau im Dialog wiedererkennt, wenn er sie uebernimmt. */

import { exMoeglich } from './equipment.js';

/* Welche Kategorien an welchem Tag drankommen. Bewusst eine Tabelle und
   keine Rechnung: Trainingssplits sind Konvention, nicht Arithmetik.

   Bei sechs Tagen tauchen Push, Pull und Beine zweimal auf – jeweils mit
   einer anderen zweiten Kategorie, damit die beiden Tage nicht dieselbe
   Liste bekommen. */
const MUSTER = {
  2: [['push', 'core'], ['pull', 'legs']],
  3: [['push'], ['pull'], ['legs', 'core']],
  4: [['push', 'core'], ['pull'], ['legs'], ['skill', 'mobility']],
  5: [['push'], ['pull'], ['legs'], ['core', 'mobility'], ['skill']],
  6: [['push'], ['pull'], ['legs', 'core'], ['push', 'skill'], ['pull', 'core'], ['legs', 'mobility']]
};
const TAGE_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

/* Mehr passt nicht in eine Einheit, die man auch wirklich zu Ende macht. */
const MAX_PRO_TAG = 7;

/* Pflichtprogramm vor jeder Druck- und Skill-Einheit; steht deshalb ganz
   vorn statt irgendwo zwischen den Mobility-Uebungen (siehe WARMUP_PFLICHT). */
const HANDGELENKE = 'wrist_prep';

const prioOf = e => Number.isFinite(e.prio) ? e.prio : 2;

export function buildPlan({ exercises, equipment, tage, fokus, texte } = {}){
  const alle = Array.isArray(exercises) ? exercises : [];
  /* Nicht  Number(tage) || 3 : eine 0 waere damit eine 3 statt der 2, auf die
     sie gehoert. Gemeint ist "keine Zahl", nicht "keine Wahrheit". */
  const roh = Number(tage);
  const t = Math.min(6, Math.max(2, Number.isFinite(roh) ? Math.round(roh) : 3));
  const schwerpunkt = ['kraft', 'skill', 'ausgewogen'].includes(fokus) ? fokus : 'ausgewogen';
  const texts = texte || {};

  /* Reihenfolge einmal festlegen: erst Grunduebungen, dann Ergaenzungen, bei
     Gleichstand die Reihenfolge aus exercises.js. Ein stabiles sort() gibt es
     erst seit ES2019 zuverlaessig – der Index als zweiter Schluessel macht
     die Sortierung unabhaengig davon. */
  const machbare = alle
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => exMoeglich(e, equipment))
    .filter(({ e }) => !(schwerpunkt === 'kraft' && e.cat === 'skill' && e.id !== HANDGELENKE))
    .sort((a, b) => (prioOf(a.e) - prioOf(b.e)) || (a.i - b.i))
    .map(({ e }) => e);

  if(!machbare.length) return { name: texts.name || '', desc: texts.desc || '', days: [] };

  const muster = MUSTER[t] || MUSTER[3];
  const skills = machbare.filter(e => e.cat === 'skill');
  const days = muster.map((kats, di) => {
    const push = kats.includes('push') || kats.includes('skill');

    let liste = machbare.filter(e => kats.includes(e.cat));
    /* Kein leerer Tag: ohne jede Ausruestung ist die ganze Kategorie "Ziehen"
       unmoeglich, und ein Plan mit einem leeren Tag darin waere kaputt.
       Dann wird aus allem gefuellt, was geht – und der Tag heisst danach
       "Ganzkoerper" und nicht mehr "Ziehen". Ein Titel, der eine Kategorie
       verspricht, die nicht drinsteht, ist schlimmer als der Ersatz selbst. */
    const ersatz = !liste.length;
    if(ersatz) liste = machbare.slice();

    const ids = [];
    if(push && machbare.some(e => e.id === HANDGELENKE)) ids.push(HANDGELENKE);
    /* Beim Skill-Schwerpunkt bekommt jeder Tag eine Skill-Uebung nach vorn:
       im frischen Zustand geuebt wird sie besser als am Ende. Reihum, damit
       nicht an jedem Tag dieselbe steht. */
    if(schwerpunkt === 'skill' && skills.length) ids.push(skills[di % skills.length].id);

    /* Aus jeder genannten Kategorie zuerst die wichtigste Uebung, dann erst
       nach Rang auffuellen. Ohne diesen Schritt schneidet die Obergrenze die
       zweite Kategorie einfach ab: "Drücken & Skills" bekaeme sieben
       Drueckuebungen und keinen einzigen Skill – und waere Zeichen fuer
       Zeichen derselbe Tag wie das reine "Drücken" daneben. */
    if(!ersatz) kats.forEach(k => {
      const erste = liste.find(e => e.cat === k && !ids.includes(e.id));
      if(erste) ids.push(erste.id);
    });

    liste.forEach(e => {
      if(ids.length >= MAX_PRO_TAG || ids.includes(e.id)) return;
      ids.push(e.id);
    });

    return {
      key: TAGE_KEYS[di],
      title: ersatz
        ? (texts.ganzkoerper || 'Ganzkörper')
        : kats.map(k => (texts.kat || {})[k] || k).join(' & '),
      sub: texts.sub || '',
      ex: ids
    };
  });

  return { name: texts.name || '', desc: texts.desc || '', days };
}

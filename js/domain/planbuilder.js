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

import { exMoeglich, levelMoeglich } from './equipment.js';
import { istSkill } from './skills.js';

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

/* Hoechstens so viele Kraftsaetze je Kategorie an einem Tag. Der
   Zusatznutzen weiterer Saetze sinkt schnell; pro Muskelgruppe und Einheit
   bringt mehr als etwa zehn harte Saetze kaum noch etwas, mehr Volumen
   gehoert auf weitere Tage. Vorher kamen Drucktage auf 20 Saetze.

   Halteuebungen zaehlen mit: vier Saetze Stuetzhalte sind echte Arbeit fuer
   Schultern und Trizeps. Skills und Mobility zaehlen nicht, ein Satz
   Handstand ist Techniktraining, kein Kraftsatz. Gezaehlt wird die erste
   Stufe, weil der Plan die Stufe des Nutzers nicht kennt.

   Weil der Plan in Katalogreihenfolge auffuellt, entscheidet die Reihenfolge
   in exercises.js mit, was die Grenze uebersteht. Der Klimmzug steht deshalb
   vor dem Rudern – sonst fiel er hinter Haengen, Scapula Pull-ups und
   Rudern aus dem Zugtag heraus. */
export const KRAFTSAETZE_JE_KATEGORIE = 12;
export function kraftsaetze(ex){
  const l = ex && ex.levels && ex.levels[0];
  if(!l || istSkill(ex) || ex.cat === 'mobility') return 0;
  return l.saetze || 0;
}

/* Pflichtprogramm vor jeder Druck- und Skill-Einheit; steht deshalb ganz
   vorn statt irgendwo zwischen den Mobility-Uebungen (siehe WARMUP_PFLICHT). */
const HANDGELENKE = 'wrist_prep';

const prioOf = e => Number.isFinite(e.prio) ? e.prio : 2;

/* Die Bewegungsmuster aus exercises.js (Feld muster). */
export const MUSTER_NAMEN = [
  'h_druecken', 'dip', 'v_druecken', 'v_ziehen', 'h_ziehen', 'schulter',
  'kniebeuge', 'huefte', 'wade', 'rumpf_vorn', 'rumpf_seite', 'mobility',
  'handstand', 'planche', 'front_lever', 'back_lever', 'muscle_up', 'lsit', 'elbow_lever'
];

/* Rangfolge unter mehreren machbaren Uebungen: Grunduebung vor Ergaenzung,
   dann was sich von der ersten Stufe an machen laesst, dann die Reihenfolge
   im Katalog. */
function rang(equipment, index){
  return (a, b) => (prioOf(a) - prioOf(b)) ||
    (Number(!levelMoeglich(a, 0, equipment)) - Number(!levelMoeglich(b, 0, equipment))) ||
    (index.get(a.id) - index.get(b.id));
}

/* Ersatz fuer eine Uebung, die mit dieser Ausruestung nicht geht: zuerst
   eine mit demselben Muster, sonst eine aus derselben Kategorie. Nie eine,
   die schon im Tag steht. null, wenn es nichts gibt.

   Ein Skill wird nur innerhalb seiner eigenen Linie ersetzt: ein L-Sit, der
   ohne Parallettes und Stuehle nicht geht, wird nicht zum freien Handstand –
   das waere ein anderes Ziel, kein Ersatz. Dann entfaellt er. */
export function ersatzFuer(ex, exercises, equipment, schonDa = new Set()){
  const alle = Array.isArray(exercises) ? exercises : [];
  const index = new Map(alle.map((e, i) => [e.id, i]));
  const frei = alle.filter(e => e.id !== ex.id && !schonDa.has(e.id) && exMoeglich(e, equipment));
  const sortiert = liste => liste.slice().sort(rang(equipment, index));
  const gleich = sortiert(frei.filter(e => e.muster && e.muster === ex.muster));
  if(gleich.length) return gleich[0];
  if(istSkill(ex)) return null;
  const verwandt = sortiert(frei.filter(e => e.cat === ex.cat && !istSkill(e)));
  return verwandt[0] || null;
}

/* Eine Vorlage fuer diese Ausruestung. Die Vorlagen in exercises.js sind
   feste Listen; wer keine Parallettes hatte, bekam trotzdem Dips auf
   Parallettes und musste den Plan von Hand umbauen. Jetzt wird jede nicht
   machbare Uebung durch die beste machbare mit demselben Muster ersetzt.
   Mit voller Ausruestung bleibt die Vorlage, wie sie ist. */
export function vorlageAufloesen(plan, exercises, equipment){
  if(!plan || !Array.isArray(plan.days)) return plan;
  const alle = Array.isArray(exercises) ? exercises : [];
  const byId = new Map(alle.map(e => [e.id, e]));
  const days = plan.days.map(d => {
    const ids = [];
    const geplant = new Set(d.ex || []);
    (d.ex || []).forEach(id => {
      const ex = byId.get(id);
      if(!ex) return;
      if(exMoeglich(ex, equipment)){ if(!ids.includes(id)) ids.push(id); return; }
      const e = ersatzFuer(ex, alle, equipment, new Set([...geplant, ...ids]));
      if(e) ids.push(e.id);
    });
    return { ...d, ex: ids };
  });
  return { ...plan, days };
}

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
    /* Bei gleichem Rang zuerst, was sich von der ersten Stufe an machen
       laesst. Seit die Saetze je Kategorie begrenzt sind, passt oft nur noch
       eine Ruderuebung: wer nur Ringe hat, bekaeme sonst das Rudern, das am
       Tisch beginnt, statt der Ring-Rows. */
    .sort((a, b) => (prioOf(a.e) - prioOf(b.e)) ||
      (Number(!levelMoeglich(a.e, 0, equipment)) - Number(!levelMoeglich(b.e, 0, equipment))) ||
      (a.i - b.i))
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
    const saetze = {};
    /* Nimmt eine Uebung auf, wenn sie die Obergrenze ihrer Kategorie nicht
       sprengt. */
    const nimm = e => {
      const n = kraftsaetze(e);
      if(n && (saetze[e.cat] || 0) + n > KRAFTSAETZE_JE_KATEGORIE) return false;
      saetze[e.cat] = (saetze[e.cat] || 0) + n;
      ids.push(e.id);
      return true;
    };
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
      if(erste) nimm(erste);
    });

    liste.forEach(e => {
      if(ids.length >= MAX_PRO_TAG || ids.includes(e.id)) return;
      nimm(e);
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

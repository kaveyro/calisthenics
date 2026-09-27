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
import { zielAuswerten } from './target.js';

/* Tagesarten als Liste von Plaetzen, in der Reihenfolge ihrer Wichtigkeit.
   Jeder Platz ist ein Bewegungsmuster und wird mit der besten machbaren
   Uebung dieses Musters gefuellt.

   Vorher waren es Kategorien je Tag (Druecken / Ziehen / Beine & Rumpf),
   und bei 2 bis 5 Tagen kam jede Muskelgruppe genau einmal pro Woche dran.
   Mit hoechstens 12 Saetzen je Einheit hiess das hoechstens 12 Saetze pro
   Muskelgruppe und Woche – am unteren Rand dessen, was sinnvoll ist. Jetzt
   kommt jede mindestens zweimal pro Woche dran (siehe AUFTEILUNG).

   Der Rumpf steht im Ganzkoerpertag vor dem zweiten Druck- und Zugplatz:
   am Ende fiel er der Hoechstzahl von sieben Uebungen fast immer zum Opfer.
   Plaetze zu denselben Mustern stehen in den Varianten A/B/C an anderer
   Stelle, damit die Tage nicht dieselbe Liste bekommen, und die Uebung
   wechselt, wenn ein Muster in der Woche mehrfach vorkommt. */
const TAGESARTEN = {
  gkA:  { titel: 'gk',   plaetze: ['h_druecken', 'v_ziehen', 'kniebeuge', 'huefte', 'rumpf_vorn', 'dip', 'h_ziehen'] },
  gkB:  { titel: 'gk',   plaetze: ['v_druecken', 'h_ziehen', 'kniebeuge', 'huefte', 'rumpf_seite', 'h_druecken', 'v_ziehen'] },
  gkC:  { titel: 'gk',   plaetze: ['dip', 'v_ziehen', 'kniebeuge', 'huefte', 'rumpf_vorn', 'h_druecken', 'h_ziehen'] },
  okA:  { titel: 'ok',   plaetze: ['h_druecken', 'v_ziehen', 'v_druecken', 'h_ziehen', 'dip', 'schulter'] },
  okB:  { titel: 'ok',   plaetze: ['dip', 'h_ziehen', 'h_druecken', 'v_ziehen', 'v_druecken', 'schulter'] },
  ukA:  { titel: 'uk',   plaetze: ['kniebeuge', 'huefte', 'kniebeuge', 'rumpf_vorn', 'wade', 'rumpf_seite'] },
  ukB:  { titel: 'uk',   plaetze: ['huefte', 'kniebeuge', 'huefte', 'rumpf_seite', 'rumpf_vorn'] },
  push: { titel: 'push', plaetze: ['h_druecken', 'v_druecken', 'dip', 'h_druecken', 'rumpf_seite'] },
  pull: { titel: 'pull', plaetze: ['v_ziehen', 'h_ziehen', 'v_ziehen', 'h_ziehen', 'schulter', 'rumpf_vorn'] },
  legs: { titel: 'legs', plaetze: ['kniebeuge', 'huefte', 'kniebeuge', 'huefte', 'wade', 'rumpf_seite'] }
};

/* Welche Tagesarten bei wie vielen Tagen. Bis drei Tage Ganzkoerper, bei
   vier Ober- und Unterkoerper im Wechsel, bei fuenf beides plus je ein Tag
   Druecken, Ziehen, Beine, bei sechs Druecken/Ziehen/Beine zweimal. */
export const AUFTEILUNG = {
  2: ['gkA', 'gkB'],
  3: ['gkA', 'gkB', 'gkC'],
  4: ['okA', 'ukA', 'okB', 'ukB'],
  5: ['okA', 'ukA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs']
};
/* Zeitbudget je Einheit. Geschaetzt wird aus Saetzen, Arbeitszeit und
   Pause: je Satz die Obergrenze der Haltezeit oder drei Sekunden je
   Wiederholung plus zehn fuer das Einrichten, dazwischen die Pause der
   Uebung, dazu eine Minute fuer den Wechsel. Eine Schaetzung, keine
   Stoppuhr – sie soll Tage mit 19 und 65 Minuten in derselben Woche
   verhindern, nicht auf die Minute genau sein. */
export const MINUTEN = [30, 45, 60];
export function dauerSek(ex, setsMode = 'standard'){
  const l = ex && ex.levels && ex.levels[0];
  if(!l) return 0;
  const z = zielAuswerten(l, setsMode);
  const arbeit = z.isHold ? z.holdSecs : (z.maxReps || 8) * 3 + 10;
  const pause = ex.rest || 90;
  return z.sets * arbeit + Math.max(0, z.sets - 1) * pause + 60;
}
/* Die ersten Plaetze eines Tages sind Pflicht, das Budget kuerzt nur die
   Ergaenzungen dahinter. Schon Liegestuetze, Klimmzuege und Kniebeugen
   brauchen mit ihren Pausen rund eine halbe Stunde; ein strenges Budget
   haette bei 30 Minuten die Beine aus dem Ganzkoerpertag geworfen. */
const PFLICHT_PLAETZE = 3;

/* Ziel-Skills und an welchen Tagen sie vorn stehen. Handstand, Planche,
   L-Sit und Elbow Lever tragen die Druckmuskulatur, Front Lever, Back Lever
   und Muscle-up die Zugmuskulatur. Beintage bekommen keinen Skill.

   Bis hierher gab es nur einen Schwerpunkt "Skills", der reihum irgendeinen
   Skill vor jeden Tag stellte – an einem Tag Handstand, am naechsten Front
   Lever. Wer auf einen Skill hinarbeitet, braucht ihn aber regelmaessig. */
export const ZIELE = {
  handstand: 'druck', planche: 'druck', lsit: 'druck', elbow_lever: 'druck',
  front_lever: 'zug', back_lever: 'zug', muscle_up: 'zug'
};
const ZUG_MUSTER = new Set(['v_ziehen', 'h_ziehen']);

/* Welche Ziele mit dieser Ausruestung ueberhaupt gehen – fuer die Auswahl
   im Dialog. */
export function moeglicheZiele(exercises, equipment){
  const alle = Array.isArray(exercises) ? exercises : [];
  return Object.keys(ZIELE).filter(z => alle.some(e => e.muster === z && exMoeglich(e, equipment)));
}

const TITEL_VORGABE = {
  gk: 'Ganzkörper', ok: 'Oberkörper', uk: 'Unterkörper & Rumpf',
  push: 'Drücken', pull: 'Ziehen', legs: 'Beine & Rumpf'
};
/* An Tagen ohne Druecken und ohne Skill gehoert das Handgelenk-Aufwaermen
   nicht an den Anfang. */
const DRUECK_MUSTER = new Set(['h_druecken', 'dip', 'v_druecken']);

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

export function buildPlan({ exercises, equipment, tage, ziel, minuten, setsMode, texte } = {}){
  const alle = Array.isArray(exercises) ? exercises : [];
  /* Nicht  Number(tage) || 3 : eine 0 waere damit eine 3 statt der 2, auf die
     sie gehoert. Gemeint ist "keine Zahl", nicht "keine Wahrheit". */
  const roh = Number(tage);
  const t = Math.min(6, Math.max(2, Number.isFinite(roh) ? Math.round(roh) : 3));
  const zielArt = ZIELE[ziel] || null;
  const texts = texte || {};
  const titel = { ...TITEL_VORGABE, ...(texts.tage || {}) };
  /* Ohne Angabe gilt kein Budget – dann entscheiden Plaetze und Grenzen. */
  const budget = MINUTEN.includes(Number(minuten)) ? Number(minuten) * 60 : Infinity;

  const index = new Map(alle.map((e, i) => [e.id, i]));
  const machbare = alle.filter(e => exMoeglich(e, equipment)).sort(rang(equipment, index));
  if(!machbare.length) return { name: texts.name || '', desc: texts.desc || '', days: [] };

  /* Die Uebung zum Ziel: die beste machbare seiner Linie, etwa der
     Wand-Handstand vor dem freien. */
  const zielUebung = zielArt ? machbare.find(e => e.muster === ziel) || null : null;
  /* Wie oft ein Muster in dieser Woche schon vergeben wurde – daran wechselt
     die Uebung. */
  const nutzung = new Map();

  const days = AUFTEILUNG[t].map((art, di) => {
    const tag = TAGESARTEN[art];
    const ids = [];
    const saetze = {};
    let zeit = 0, plaetze = 0;
    const nimm = (e, pflicht = true) => {
      if(ids.includes(e.id) || ids.length >= MAX_PRO_TAG) return false;
      const n = kraftsaetze(e);
      if(n && (saetze[e.cat] || 0) + n > KRAFTSAETZE_JE_KATEGORIE) return false;
      const d = dauerSek(e, setsMode);
      if(!pflicht && zeit + d > budget) return false;
      saetze[e.cat] = (saetze[e.cat] || 0) + n;
      zeit += d;
      ids.push(e.id);
      return true;
    };

    const passt = zielArt === 'druck' ? tag.plaetze.some(m => DRUECK_MUSTER.has(m))
      : zielArt === 'zug' ? tag.plaetze.some(m => ZUG_MUSTER.has(m)) : false;
    const skill = zielUebung && passt ? zielUebung : null;
    const handgelenke = machbare.find(e => e.id === HANDGELENKE);
    if((skill || tag.plaetze.some(m => DRUECK_MUSTER.has(m))) && handgelenke) nimm(handgelenke);
    /* Der Skill vorn: im frischen Zustand geuebt wird er besser als am Ende.
       Er zaehlt zur Zeit, faellt aber dem Budget nicht zum Opfer – er ist das
       erklaerte Ziel. */
    if(skill) nimm(skill);

    tag.plaetze.forEach(muster => {
      const kandidaten = machbare.filter(e => e.muster === muster && !ids.includes(e.id));
      if(!kandidaten.length) return;
      /* Gewechselt wird unter den Grund- und Ergaenzungsuebungen des
         Musters; eine fortgeschrittene kommt nur, wenn es sonst nichts gibt.
         Sonst stuende nach der zweiten Nutzung der einarmige Liegestuetz im
         Plan eines Einsteigers. */
      const besterRang = prioOf(kandidaten[0]);
      const pool = kandidaten.filter(e => prioOf(e) <= Math.max(besterRang, 2));
      const n = nutzung.get(muster) || 0;
      const pflicht = plaetze < PFLICHT_PLAETZE;
      for(let k = 0; k < pool.length; k++){
        if(nimm(pool[(n + k) % pool.length], pflicht)){ nutzung.set(muster, n + 1); plaetze++; return; }
      }
    });

    /* Kein Tag ohne Uebung: bleibt kein einziger Platz fuellbar, wird aus
       allem Machbaren gefuellt, und der Tag heisst "Ganzkoerper". */
    const ersatz = !ids.some(id => id !== HANDGELENKE);
    if(ersatz) machbare.forEach(e => { if(e.cat !== 'mobility') nimm(e); });

    return {
      key: TAGE_KEYS[di],
      title: ersatz ? (texts.ganzkoerper || titel.gk) : titel[tag.titel],
      sub: texts.sub || '',
      ex: ids,
      /* Geschaetzte Dauer fuer die Vorschau. Beim Laden faellt das Feld weg
         (migrateState kennt es nicht), gebraucht wird es nur dort. */
      min: Math.round(zeit / 60)
    };
  });

  return { name: texts.name || '', desc: texts.desc || '', days };
}

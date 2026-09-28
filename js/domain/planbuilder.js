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
   Der zweite Zugplatz steht vor dem zweiten Druckplatz: faellt einer davon
   dem Zeitbudget zum Opfer, dann besser ein Drucksatz – die Wochenbilanz
   (bilanz.js) meldete sonst bei zwei und drei Tagen mit Stange deutlich
   mehr Druecken als Ziehen. Aus demselben Grund stehen im Oberkoerpertag
   beide Zugplaetze gleich nach dem ersten Druckplatz. Bei 30 Minuten
   passen nur drei Uebungen und eine vierte kurze; das ist der Rumpf, nicht
   die Hueftbeuge – die Vorschau im Dialog sagt dann, dass sie fehlt.
   Plaetze zu denselben Mustern stehen in den Varianten A/B/C an anderer
   Stelle, damit die Tage nicht dieselbe Liste bekommen, und die Uebung
   wechselt, wenn ein Muster in der Woche mehrfach vorkommt. */
const TAGESARTEN = {
  gkA:  { titel: 'gk',   plaetze: ['h_druecken', 'v_ziehen', 'kniebeuge', 'rumpf_vorn', 'huefte', 'h_ziehen', 'dip'] },
  gkB:  { titel: 'gk',   plaetze: ['v_druecken', 'h_ziehen', 'kniebeuge', 'rumpf_seite', 'huefte', 'v_ziehen', 'h_druecken'] },
  gkC:  { titel: 'gk',   plaetze: ['dip', 'v_ziehen', 'kniebeuge', 'rumpf_vorn', 'huefte', 'h_ziehen', 'h_druecken'] },
  okA:  { titel: 'ok',   plaetze: ['h_druecken', 'v_ziehen', 'h_ziehen', 'v_druecken', 'dip', 'schulter'] },
  okB:  { titel: 'ok',   plaetze: ['dip', 'h_ziehen', 'v_ziehen', 'h_druecken', 'v_druecken', 'schulter'] },
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
/* Findet ein Platz keine Uebung, weicht er auf ein verwandtes Muster
   derselben Muskelgruppe aus. Ohne Stange gibt es kein senkrechtes Ziehen;
   der Platz blieb leer, und der Ganzkoerpertag A hatte ohne Geraet gar keine
   Zuguebung. Die Hueftbeuge weicht nicht aus: sie geht immer (Glute
   Bridge), und eine zweite Kniebeuge ersetzt sie nicht. */
const AUSWEICHMUSTER = {
  v_ziehen: ['h_ziehen', 'schulter'],
  h_ziehen: ['v_ziehen', 'schulter'],
  v_druecken: ['h_druecken', 'dip'],
  dip: ['h_druecken', 'v_druecken'],
  h_druecken: ['dip', 'v_druecken'],
  rumpf_vorn: ['rumpf_seite'],
  rumpf_seite: ['rumpf_vorn']
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
/* Wie schnell der Nutzer wirklich trainiert, als Faktor auf die Schaetzung.

   Die App misst die Dauer jeder Einheit (log[].dauer, vom ersten Satz bis
   zum Abschluss), der Generator schaetzte trotzdem aus festen Werten. Wer
   seine Pausen ueberzieht, bekam einen 45-Minuten-Plan, der eine Stunde
   dauerte – und strich dann von Hand, meist am Ende, also Rumpf und
   Hueftbeuge.

   Verglichen wird je Satz: die gemessene Zeit je erledigtem Satz gegen die
   geschaetzte je geplantem. So zaehlt eine abgebrochene Einheit nicht als
   schnelle. Ausgelassen werden Einheiten ohne Messung (nachgetragen), die
   Entlastungswoche (halbe Saetze, andere Pausen) und alles unter vier
   Saetzen. Der Median der letzten acht, ab drei; zwischen 0,9 und 1,1 bleibt
   es bei 1 – so wenig Abweichung ist Rauschen, und der Plan soll nicht
   wegen zwei Minuten anders aussehen. Gedeckelt auf 0,75 bis 1,5. */
export const TEMPO_GRENZEN = [0.75, 1.5];
const TEMPO_EINHEITEN = 8;
export function tempoFaktor(log, exercises, setsMode = 'standard'){
  const byId = new Map((Array.isArray(exercises) ? exercises : []).map(e => [e.id, e]));
  const werte = [];
  const liste = Array.isArray(log) ? log : [];
  for(let i = liste.length - 1; i >= 0 && werte.length < TEMPO_EINHEITEN; i--){
    const l = liste[i];
    if(!l || !(l.dauer > 0) || l.dl || !Array.isArray(l.ex) || !(l.sets >= 4)) continue;
    const exs = l.ex.map(id => byId.get(id)).filter(e => e && e.levels && e.levels[0]);
    const geplant = exs.reduce((s, e) => s + zielAuswerten(e.levels[0], setsMode).sets, 0);
    const schaetzung = exs.reduce((s, e) => s + dauerSek(e, setsMode), 0);
    if(!geplant || !schaetzung) continue;
    werte.push((l.dauer / l.sets) / (schaetzung / geplant));
  }
  if(werte.length < 3) return null;
  werte.sort((a, b) => a - b);
  const mitte = werte.length >> 1;
  const roh = werte.length % 2 ? werte[mitte] : (werte[mitte - 1] + werte[mitte]) / 2;
  const [unten, oben] = TEMPO_GRENZEN;
  const gerundet = Math.round(Math.min(oben, Math.max(unten, roh)) * 20) / 20;
  return { faktor: Math.abs(gerundet - 1) < 0.1 ? 1 : gerundet, n: werte.length };
}

/* Die ersten Plaetze eines Tages sind Pflicht, das Budget kuerzt nur die
   Ergaenzungen dahinter. Schon Liegestuetze, Klimmzuege und Kniebeugen
   brauchen mit ihren Pausen rund eine halbe Stunde; ein strenges Budget
   haette bei 30 Minuten die Beine aus dem Ganzkoerpertag geworfen. */
const PFLICHT_PLAETZE = 3;

/* Vorstufen fortgeschrittener Uebungen (prio 3): [Uebung, Mindeststufe],
   Stufen ab 0 gezaehlt. Der Generator nimmt eine solche Uebung erst, wenn
   die Vorstufe sitzt oder man sie selbst schon begonnen hat. Ohne das stand
   nach dem zweiten Wechsel im Muster der einarmige Liegestuetz im Plan
   eines Einsteigers. Die Indizes zeigen auf die Leitern in exercises.js;
   test/planbuilder.test.js prueft, dass es sie gibt und dass jede Uebung
   mit prio 3 hier steht. */
export const VORSTUFEN = {
  archer_push: ['pushup', 4],        /* volle Liegestuetze, 10–15 */
  one_arm_push: ['archer_push', 2],
  planche_lean: ['pushup', 3],       /* volle Liegestuetze */
  elbow_lever: ['pushup', 3],
  front_lever: ['pullup', 3],        /* Klimmzuege */
  back_lever: ['pullup', 2],         /* erster Klimmzug */
  muscle_up: ['pullup', 4],
  pistol: ['squat', 3],              /* Bulgarian Split Squat */
  shrimp_squat: ['squat', 3],
  dragon_flag: ['hollow', 2],
  handstand: ['wall_hs', 3],         /* Brust zur Wand, lang */
  planche: ['planche_lean', 2],
  hspu: ['pike', 3],                 /* Pike Push-ups */
  lsit_hs: ['lsit', 3]
};

/* Hilfsuebungen, die nur bis zu einer Stufe sinnvoll sind: [Uebung, Stufe].
   Wer echte Klimmzuege schafft, braucht das Band nicht mehr. Ohne diese
   Grenze bekam ein Fortgeschrittener mit ausgereizten Klimmzuegen die
   Klimmzuege mit Band – die leichtere Variante statt der naechsten Stufe. */
export const NUR_BIS = {
  band_pullup: ['pullup', 3]
};

/* Notbehelfe ohne Geraet: nur, wenn das Muster sonst nichts hergibt. Ohne
   diese Regel stand bei Stange und Tisch am zweiten Oberkoerpertag das
   Tuerrahmen-Rudern, weil im Muster gewechselt wird – obwohl man an der
   Stange besser rudert. */
export const NOTBEHELF = new Set(['towel_row']);

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


/* Mehr passt nicht in eine Einheit, die man auch wirklich zu Ende macht.
   Die Handgelenks-Routine zaehlt nicht mit: sie ist Aufwaermen. Sonst
   kostete sie an jedem Drucktag den letzten Platz, und das war im
   Ganzkoerpertag der zweite Zugplatz. */
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

/* Rangfolge unter mehreren machbaren Uebungen:
   1. die naechste Stufe zuerst – eine fortgeschrittene Uebung, deren
      Vorstufe auf ihrer hoechsten Stufe steht (Archer-Liegestuetze, wenn
      die Liegestuetze ausgereizt sind),
   2. was nicht schon selbst auf der hoechsten Stufe steht,
   3. Grunduebung vor Ergaenzung,
   4. was sich von der ersten Stufe an machen laesst,
   5. die Reihenfolge im Katalog.
   "Ausgereizt nach hinten" allein fuehrte zur naechstLEICHTEREN Uebung
   statt zur naechsten Stufe. Ohne Stufen (Vorlagen) fallen 1 und 2 weg. */
function rang(equipment, index, levels = {}, byId = new Map()){
  const oben = e => Number((levels[e.id] || 0) >= e.levels.length - 1);
  const nachfolger = e => {
    const vor = VORSTUFEN[e.id];
    const v = vor && byId.get(vor[0]);
    return Number(!(v && (levels[v.id] || 0) >= v.levels.length - 1));
  };
  return (a, b) => (nachfolger(a) - nachfolger(b)) || (oben(a) - oben(b)) || (prioOf(a) - prioOf(b)) ||
    (Number(!levelMoeglich(a, 0, equipment)) - Number(!levelMoeglich(b, 0, equipment))) ||
    (index.get(a.id) - index.get(b.id));
}

/* Darf diese Uebung in den Plan? Ja, wenn sie keine Vorstufe hat, wenn man
   sie schon begonnen hat oder wenn die Vorstufe sitzt. */
export function bereit(ex, levels = {}){
  const bis = NUR_BIS[ex.id];
  if(bis && (levels[bis[0]] || 0) >= bis[1]) return false;
  const vor = VORSTUFEN[ex.id];
  if(!vor) return true;
  if((levels[ex.id] || 0) > 0) return true;
  return (levels[vor[0]] || 0) >= vor[1];
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

export function buildPlan({ exercises, equipment, tage, ziel, minuten, setsMode, levels, texte, tempo } = {}){
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
  /* Aus tempoFaktor(): die Schaetzung je Uebung mal diesem Faktor. */
  const [tUnten, tOben] = TEMPO_GRENZEN;
  const faktor = Number.isFinite(tempo) ? Math.min(tOben, Math.max(tUnten, tempo)) : 1;

  const stand = levels && typeof levels === 'object' ? levels : {};
  const index = new Map(alle.map((e, i) => [e.id, i]));
  const byId = new Map(alle.map(e => [e.id, e]));
  const machbare = alle.filter(e => exMoeglich(e, equipment)).sort(rang(equipment, index, stand, byId));
  if(!machbare.length) return { name: texts.name || '', desc: texts.desc || '', days: [] };

  /* Die Uebung zum Ziel: die am weitesten fortgeschrittene seiner Linie,
     fuer die man bereit ist – der Wand-Handstand, bis er sitzt, danach der
     freie. Man arbeitet auf das Ziel hin, also gewinnt die freigeschaltete
     Uebung vor der Vorstufe. Ist man fuer keine bereit, die leichteste: das
     Ziel ist ausdruecklich gewaehlt. */
  const linie = zielArt ? machbare.filter(e => e.muster === ziel) : [];
  /* Unter den freigeschalteten zuerst die, deren Vorstufe selbst in der
     Linie liegt: die Planche kommt nach dem Planche Lean, nicht davor. */
  const inLinie = e => Number(linie.some(x => x.id === VORSTUFEN[e.id][0]));
  const freigeschaltet = linie.filter(e => VORSTUFEN[e.id] && bereit(e, stand))
    .sort((a, b) => inLinie(b) - inLinie(a));
  const zielUebung = freigeschaltet[0] || linie.find(e => bereit(e, stand)) || linie[0] || null;
  /* Wie oft ein Muster in dieser Woche schon vergeben wurde – daran wechselt
     die Uebung. */
  const nutzung = new Map();

  const days = AUFTEILUNG[t].map((art, di) => {
    const tag = TAGESARTEN[art];
    const ids = [];
    const saetze = {};
    let zeit = 0, plaetze = 0;
    const nimm = (e, pflicht = true) => {
      if(ids.includes(e.id) || ids.filter(id => id !== HANDGELENKE).length >= MAX_PRO_TAG) return false;
      const n = kraftsaetze(e);
      if(n && (saetze[e.cat] || 0) + n > KRAFTSAETZE_JE_KATEGORIE) return false;
      const d = dauerSek(e, setsMode) * faktor;
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

    tag.plaetze.forEach(platz => {
      const frei = m => machbare.filter(e => e.muster === m && !ids.includes(e.id));
      const muster = [platz, ...(AUSWEICHMUSTER[platz] || [])].find(m => frei(m).length);
      if(!muster) return;
      const kandidaten = frei(muster);
      /* Gewechselt wird unter den Uebungen, fuer die man bereit ist; eine
         fortgeschrittene kommt erst, wenn ihre Vorstufe sitzt (VORSTUFEN).
         Gibt es fuer das Muster sonst nichts, auch eine andere. */
      const bereite = kandidaten.filter(e => bereit(e, stand));
      const gute = bereite.length ? bereite : kandidaten;
      const echte = gute.filter(e => !NOTBEHELF.has(e.id));
      const pool = echte.length ? echte : gute;
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

/* Plan-Check nach Fortschritt.

   Der Generator beruecksichtigt den eigenen Stand nur beim Erstellen. Danach
   blieb der Plan stehen, waehrend man besser wurde: wer echte Klimmzuege
   schaffte, hatte weiter die Klimmzuege mit Band im Plan, und wer die
   Liegestuetze ausgereizt hatte, trainierte sie auf der letzten Stufe
   weiter, statt zu den Archer-Liegestuetzen zu wechseln. Die Regeln dafuer
   stehen schon oben (VORSTUFEN, NUR_BIS) – hier werden sie auf einen
   bestehenden Plan angewendet.

   Zurueck kommen Vorschlaege { alt, neu, grund }, je Uebung hoechstens
   einer, in der Reihenfolge des Plans:
     hilfeFertig  eine Hilfsuebung wird nicht mehr gebraucht (NUR_BIS) –
                  ersetzt durch die Uebung, auf die sie hinfuehrt
     ausgereizt   die Uebung steht auf ihrer hoechsten Stufe – ersetzt durch
                  ihre Fortsetzung, die beste machbare, die noch nicht im
                  Plan steht
   Fortsetzung heisst: dieselbe Bewegung, schwerer. Ausgereizte Klimmzuege
   fuehren nicht zum Front Lever – der braucht sie als Voraussetzung, ist
   aber ein anderes Ziel. Deshalb nur Nachfolger mit demselben Muster, und
   der Handstand-Liegestuetz als Fortsetzung der Pike Push-ups. */
const FORTSETZUNG_MUSTER = { v_druecken: 'handstand' };
export function planPruefen(days, exercises, equipment, levels = {}){
  const alle = Array.isArray(exercises) ? exercises : [];
  const stand = levels && typeof levels === 'object' ? levels : {};
  const byId = new Map(alle.map(e => [e.id, e]));
  const index = new Map(alle.map((e, i) => [e.id, i]));
  const imPlan = new Set((Array.isArray(days) ? days : []).flatMap(d => Array.isArray(d && d.ex) ? d.ex : []));
  const frei = e => e && !imPlan.has(e.id) && exMoeglich(e, equipment);
  const out = [];
  const schonNeu = new Set();

  for(const id of imPlan){
    const ex = byId.get(id);
    if(!ex || !Array.isArray(ex.levels) || !ex.levels.length) continue;
    let neu = null, grund = null;

    const bis = NUR_BIS[id];
    if(bis && (stand[bis[0]] || 0) >= bis[1] && frei(byId.get(bis[0]))){
      neu = byId.get(bis[0]); grund = 'hilfeFertig';
    } else if((stand[id] || 0) >= ex.levels.length - 1){
      const nachfolger = alle.filter(e => VORSTUFEN[e.id] && VORSTUFEN[e.id][0] === id && frei(e) &&
        (e.muster === ex.muster || FORTSETZUNG_MUSTER[ex.muster] === e.muster))
        .sort(rang(equipment, index, stand, byId));
      if(nachfolger.length){ neu = nachfolger[0]; grund = 'ausgereizt'; }
    }
    /* Zwei Uebungen, die zur selben Fortsetzung fuehren, bekommen sie nur
       einmal vorgeschlagen. */
    if(neu && !schonNeu.has(neu.id)){
      schonNeu.add(neu.id);
      out.push({ alt: id, neu: neu.id, grund });
    }
  }
  return out;
}

/* Einen Vorschlag anwenden: in jedem Tag mit der alten Uebung steht an ihrer
   Stelle die neue; steht die neue dort schon, faellt die alte nur weg. Gibt
   neue Tage zurueck, die alten bleiben unveraendert. */
export function uebungErsetzen(days, alt, neu){
  return (Array.isArray(days) ? days : []).map(d => {
    const ex = Array.isArray(d.ex) ? d.ex : [];
    if(!ex.includes(alt)) return d;
    return { ...d, ex: ex.includes(neu) ? ex.filter(id => id !== alt) : ex.map(id => id === alt ? neu : id) };
  });
}

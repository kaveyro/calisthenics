/* Zwei Staende zu einem zusammenfuehren.

   Der Import ersetzte bisher immer alles. Fuer den haeufigsten Fall ist das
   genau falsch herum: wer auf dem Handy trainiert und danach das Backup vom
   Rechner einspielt, verliert damit jede Einheit, die seit dem Backup
   dazukam. Ein Ersetzen bleibt richtig, wenn man ein Geraet neu aufsetzt –
   aber es darf nicht die einzige Wahl sein.

   Rein: kein DOM, kein Modulzustand, keine Importe nach aussen. Beide
   Eingaben bleiben unveraendert; zusammengesetzt wird immer ein neues Objekt.

   Aufgerufen wird das vor migrateState() und nach clampBackup(): hier wird
   entschieden, welcher Wert gewinnt, nicht ob er eine gueltige Form hat. */

import { MAX_LOG_ENTRIES, MAX_SERIES_ENTRIES, prNumber } from './state.js';

const objekt = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
const liste = v => Array.isArray(v) ? v : [];
const zahl = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const nachDatum = (a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0;

/* Der Leitgedanke der Aufteilung: der Verlauf wird vereinigt, die Einrichtung
   des Geraets bleibt. Einstellungen, Design, Plan, Warm-up, die laufende
   Einheit, der Revisionszaehler und alles rund um die letzte Sicherung
   gehoeren zu diesem Geraet – sie stehen in `eigen` und werden nicht
   angefasst. Alles darunter ist Verlauf und wird zusammengelegt. */
export function mergeStates(eigen, fremd){
  const a = objekt(eigen), b = objekt(fremd);
  const out = { ...a };

  out.log = mischeLog(liste(a.log), liste(b.log));
  out.levels = hoechsterWert(objekt(a.levels), objekt(b.levels));
  out.streaks = hoechsterWert(objekt(a.streaks), objekt(b.streaks));
  out.byDay = hoechsterWert(objekt(a.byDay), objekt(b.byDay));
  out.prs = mischePrs(objekt(a.prs), objekt(b.prs));
  out.notes = juengeresGewinnt(objekt(a.notes), objekt(b.notes));
  out.milestones = mischeMeilensteine(objekt(a.milestones), objekt(b.milestones));
  out.weights = mischeReihe(liste(a.weights), liste(b.weights));
  out.workouts = Math.max(zahl(a.workouts), zahl(b.workouts));

  const messA = objekt(a.measurements);
  const messdaten = mischeReihe(liste(messA._dates), liste(objekt(b.measurements)._dates));
  /* Nicht blind ein leeres _dates anlegen – ein Stand ohne Messwerte soll
     nach dem Zusammenfuehren derselbe Stand sein. */
  out.measurements = messdaten.length ? { ...messA, _dates: messdaten } : { ...messA };

  const spaeter = [a.lastDate, b.lastDate].filter(d => typeof d === 'string').sort();
  out.lastDate = spaeter.length ? spaeter[spaeter.length - 1] : (a.lastDate ?? null);

  return out;
}

/* Zwei Log-Listen vereinigen.

   Entdoppelt wird ueber Datum, Plan-Tag und Satzzahl. Das ist eine
   Heuristik und keine Identitaet: zwei Einheiten am selben Tag im selben
   Plan-Tag mit derselben Satzzahl sind nicht auseinanderzuhalten, und der
   Eintrag traegt keine eindeutige Kennung. Der Fehler in diese Richtung ist
   der harmlosere – lieber eine Einheit zu wenig als jede Einheit doppelt,
   sobald man dieselbe Datei zweimal einspielt. */
function mischeLog(a, b){
  const gesehen = new Set();
  const alle = [];
  /* eigen zuerst: bei gleichem Schluessel gewinnt der hiesige Eintrag. */
  [...a, ...b].forEach(l => {
    if(!l || typeof l !== 'object' || typeof l.d !== 'string') return;
    const schluessel = l.d + '|' + l.day + '|' + l.sets;
    if(gesehen.has(schluessel)) return;
    gesehen.add(schluessel);
    alle.push(l);
  });
  return alle.sort(nachDatum).slice(-MAX_LOG_ENTRIES);
}

/* Gewichte und Messwerte: eine Reihe von { d, … } mit hoechstens einem
   Eintrag je Datum. */
function mischeReihe(a, b){
  const proTag = new Map();
  /* fremd zuerst eintragen, eigen ueberschreibt es danach. */
  [...b, ...a].forEach(e => {
    if(e && typeof e === 'object' && typeof e.d === 'string') proTag.set(e.d, e);
  });
  return [...proTag.values()].sort(nachDatum).slice(-MAX_SERIES_ENTRIES);
}

/* Stufen, Serien und die Zaehler je Plan-Tag: der weitere Stand gewinnt.
   Eine Stufe wieder zu verlieren, weil das Backup aelter war, waere der
   sichtbarste Verlust ueberhaupt. */
function hoechsterWert(a, b){
  const out = { ...a };
  Object.keys(b).forEach(k => {
    const vb = ganzzahl(b[k]);
    if(vb === null) return;
    const va = ganzzahl(a[k]);
    out[k] = va === null ? vb : Math.max(va, vb);
  });
  return out;
}

/* Wie in migrateState(): "3" gilt, null und true nicht. Number() waere hier
   falsch – Number(null) ist 0 und wuerde eine geloeschte Stufe als Stufe 0
   wieder einfuehren. */
function ganzzahl(v){
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/* Bestleistungen: die hoehere Zahl gewinnt. Bei Gleichstand – und das
   schliesst zwei reine Freitexte ein, die beide -Infinity ergeben – der
   juengere Eintrag. */
function mischePrs(a, b){
  const out = { ...a };
  Object.keys(b).forEach(id => {
    const neu = b[id], alt = out[id];
    if(!neu || typeof neu !== 'object') return;
    if(!alt || typeof alt !== 'object'){ out[id] = neu; return; }
    const na = prNumber(alt), nb = prNumber(neu);
    if(nb > na || (nb === na && String(neu.d || '') > String(alt.d || ''))) out[id] = neu;
  });
  return out;
}

/* Notizen: es gibt je Uebung genau eine, und das ist die letzte. */
function juengeresGewinnt(a, b){
  const out = { ...a };
  Object.keys(b).forEach(id => {
    const neu = b[id], alt = out[id];
    if(!neu || typeof neu !== 'object') return;
    if(!alt || typeof alt !== 'object' || String(neu.d || '') > String(alt.d || '')) out[id] = neu;
  });
  return out;
}

/* Meilensteine: hier gewinnt das FRUEHERE Datum. Gespeichert ist, wann er
   zum ersten Mal geschafft wurde – ein zweites Mal gibt es nicht. */
function mischeMeilensteine(a, b){
  const out = { ...a };
  Object.keys(b).forEach(id => {
    const neu = b[id];
    if(typeof neu !== 'string') return;
    const alt = out[id];
    if(typeof alt !== 'string' || neu < alt) out[id] = neu;
  });
  return out;
}

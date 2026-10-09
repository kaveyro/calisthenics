/* Meilensteine gegen den Stand pruefen – reine Logik, kein DOM, kein Zustand.

   Der Ziele-Tab war eine Handliste, obwohl die App alles weiss: sie schreibt
   bei jedem Abschluss Stufe und Bestleistung mit. Wer seinen ersten Klimmzug
   macht, bekommt ein Level-Up gemeldet – der Meilenstein daneben blieb leer,
   bis er selbst daran dachte.

   Erkannt heisst NICHT abgehakt. Ein Meilenstein ist die Behauptung "sauber
   geschafft", und die folgt aus keiner Zahl. Die App schlaegt vor, eintragen
   muss der Nutzer. Deshalb heisst das Ergebnis hier auch `erfuellt` und nicht
   `erreicht`.

   Die Bedingung steht als `when` am Meilenstein in js/exercises.js; exById
   wird hereingereicht wie bei clampBackup() und detectPlateaus(). */

import { prNumber } from './state.js';

const objekt = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

/* Der Stand eines einzelnen Meilensteins.

   `fehlt` nennt nur, was tatsaechlich fehlt – daraus wird in der Oberflaeche
   eine Wegbeschreibung ("braucht Stufe 4 und 5 Wdh"). Ein Meilenstein ohne
   brauchbares `when` liefert bekannt: false und wird nirgends vorgeschlagen:
   eine Luecke in den Daten darf nicht als "nicht geschafft" durchgehen. */
export function meilensteinStatus(ms, { levels, prs, exById } = {}){
  const w = objekt(ms && ms.when);
  const ex = objekt(exById)[w.ex];
  const zielWert = Number.isFinite(w.reps) ? w.reps : (Number.isFinite(w.sek) ? w.sek : null);
  const art = Number.isFinite(w.reps) ? 'reps' : 'sek';
  if(!w.ex || !ex || zielWert === null || !Number.isInteger(w.lvl) || w.lvl < 0){
    return { bekannt: false, erfuellt: false, fehlt: null };
  }

  const stufe = Number(objekt(levels)[w.ex]) || 0;
  const pr = objekt(prs)[w.ex];
  /* Nur eine Bestleistung derselben Masseinheit zaehlt. Sieben Leitern
     wechseln unterwegs von Sekunden auf Wiederholungen; "8 Versuche" sagt
     ueber eine Haltezeit nichts aus (siehe besserePR in state.js). */
  const wert = (pr && pr.art === art) ? prNumber(pr) : -Infinity;

  const lvlOk = stufe >= w.lvl;
  const wertOk = wert >= zielWert;
  return {
    bekannt: true,
    erfuellt: lvlOk && wertOk,
    lvlOk,
    wertOk,
    art,
    /* Was noch aussteht, in den Einheiten der Bedingung. */
    fehlt: (lvlOk && wertOk) ? null : {
      ...(lvlOk ? {} : { lvl: w.lvl }),
      ...(wertOk ? {} : { wert: zielWert, art })
    }
  };
}

/* Die IDs der Meilensteine, deren Bedingung erfuellt ist, die aber noch
   nicht eingetragen sind. Reihenfolge wie in der Liste. */
export function erkannteMeilensteine(milestones, { levels, prs, exById, milestones: eingetragen } = {}){
  const schon = objekt(eingetragen);
  return (Array.isArray(milestones) ? milestones : [])
    .filter(ms => ms && ms.id && !schon[ms.id])
    .filter(ms => meilensteinStatus(ms, { levels, prs, exById }).erfuellt)
    .map(ms => ms.id);
}

/* Die naechsten offenen Meilensteine: die, zu denen am wenigsten fehlt.
   Fuer "Als Naechstes" oben im Ziele-Tab – eine Liste von zwanzig
   Haekchen sagt nicht, worauf man gerade hinarbeitet.

   Nur bekannte, nicht eingetragene und noch nicht erfuellte (die
   erfuellten stehen dort ohnehin, mit "Uebernehmen"). Sortiert nach dem
   Abstand in Stufen, bei gleichem Abstand nach dem Anteil, den die
   Bestleistung vom Zielwert schon hat, dann in Listenreihenfolge.

   Zurueck: [{ id, abstand, anteil }], hoechstens n. */
export function naechsteMeilensteine(milestones, { levels, prs, exById, milestones: eingetragen } = {}, n = 3){
  const schon = objekt(eingetragen);
  return (Array.isArray(milestones) ? milestones : [])
    .map((ms, i) => ({ ms, i, s: ms && ms.id && !schon[ms.id] ? meilensteinStatus(ms, { levels, prs, exById }) : null }))
    .filter(({ s }) => s && s.bekannt && !s.erfuellt)
    .map(({ ms, i, s }) => {
      const w = ms.when;
      const stufe = Number(objekt(levels)[w.ex]) || 0;
      const zielWert = s.art === 'reps' ? w.reps : w.sek;
      const pr = objekt(prs)[w.ex];
      const wert = (pr && pr.art === s.art) ? prNumber(pr) : 0;
      return {
        id: ms.id, i,
        abstand: Math.max(0, w.lvl - stufe),
        anteil: zielWert > 0 ? Math.max(0, Math.min(1, wert / zielWert)) : 0
      };
    })
    .sort((a, b) => a.abstand - b.abstand || b.anteil - a.anteil || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map(({ id, abstand, anteil }) => ({ id, abstand, anteil }));
}


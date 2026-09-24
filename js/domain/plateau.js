/* Stagnationserkennung: welche Übungen kommen auf ihrer Stufe nicht mehr
   voran? Reine Logik – kein DOM, kein Zustand, keine Übersetzung. Zurück
   kommen Übungs-IDs; den Anzeigenamen bestimmt der Aufrufer.

   Regel: betrachtet werden die Einheiten auf der AKTUELLEN Stufe, seit die
   Übung auf ihr steht. Festgefahren ist sie, wenn davon mindestens vier
   vorliegen und die letzten drei nicht über der besten Satzsumme davor
   liegen. Eine Einheit, in der jeder Satz die Obergrenze erreichte, zählt
   als Fortschritt – dort kann die Summe nicht mehr steigen, und die Stufe
   wartet nur auf die Serie. Übungen auf der höchsten Stufe sind
   ausgenommen, Einheiten einer Entlastungswoche zählen nicht mit.

   Bis hierher lautete die Regel „in vier der letzten fünf Einheiten nicht
   aufgestiegen". Das maß den Aufstieg, nicht den Fortschritt, und der
   Aufstieg braucht länger: eine Spanne 6–10 mit einer Wiederholung mehr je
   Einheit und einer Serie von 2 dauert mindestens sechs Einheiten
   (6·7·8·9·10·10). Für 70 von 102 Wiederholungsstufen im Katalog galt damit
   „festgefahren", während man alles richtig machte – und ab zwei solchen
   Übungen kam der Vorschlag einer Entlastungswoche dazu. Seit v15 kennt ein
   Eintrag die Stufe je Übung, und damit lässt sich fragen, was die Regel
   eigentlich wissen wollte.

   Welche Übungen zu einer Einheit gehörten, kommt aus dem Eintrag selbst
   (entryExercises) und nicht aus dem heutigen Plan – eine gestern
   hinzugefügte Übung bekam sonst alte Einheiten angerechnet. Einträge ohne
   Stufe (vor v15, CSV, nachgetragen) sagen nichts über die aktuelle Stufe
   und bleiben außen vor. */

import { entryExercises, repsOf, sekOf } from './log.js';
import { limitErreicht } from './target.js';

/* Wie viele Einheiten auf der Stufe ohne Verbesserung als Stillstand gelten,
   und wie viele davor mindestens den Vergleichswert liefern. */
const OHNE_FORTSCHRITT = 3;
const VERGLEICH = 1;

const summe = werte => werte.reduce((a, b) => a + b, 0);

/* ziel(ex, lvl) liefert die ausgewertete Zielangabe (zielAuswerten) – sie
   wird hereingereicht, weil der Satz-Modus eine Einstellung ist und die
   Schicht keine Einstellungen kennt. Ohne sie zählt keine Einheit als
   „alle Sätze oben". */
export function detectPlateaus(days, log, levels, exById, ziel = () => null){
  if(!Array.isArray(days) || !Array.isArray(log) || !log.length) return [];

  /* Tag-Key -> Plan-Tag, nur als Rückfall für Einträge ohne eigene Liste. */
  const tagNachKey = new Map();
  for(const d of days){
    if(d && typeof d.key === 'string') tagNachKey.set(d.key, d);
  }

  /* Kandidaten in der Reihenfolge ihres ersten Auftretens, ohne Dopplung –
     eine Übung an zwei Tagen erschien sonst doppelt im Banner. */
  const kandidaten = new Map();
  for(const d of days){
    if(!d || !Array.isArray(d.ex)) continue;
    for(const id of d.ex){
      if(kandidaten.has(id)) continue;
      const ex = exById[id];
      if(!ex) continue;
      const lvl = (levels && levels[id]) || 0;
      if(lvl >= ex.levels.length - 1) continue;   /* höchste Stufe erreicht */
      kandidaten.set(id, { ex, lvl, werte: [], fertig: false });
    }
  }
  if(!kandidaten.size) return [];

  /* Ein Durchlauf von hinten. Je Kandidat endet er am ersten Eintrag auf
     einer ANDEREN Stufe: davor lag ein Aufstieg, eine Rückstufung oder eine
     Änderung von Hand, und was dort geschah, misst etwas anderes. */
  let offen = kandidaten.size;
  for(let i = log.length - 1; i >= 0 && offen > 0; i--){
    const eintrag = log[i];
    if(!eintrag || eintrag.dl === true) continue;
    const lv = eintrag.lv && typeof eintrag.lv === 'object' ? eintrag.lv : {};

    for(const id of entryExercises(eintrag, tagNachKey.get(eintrag.day))){
      const k = kandidaten.get(id);
      if(!k || k.fertig) continue;
      if(!Number.isInteger(lv[id])) continue;
      if(lv[id] !== k.lvl){ k.fertig = true; offen--; continue; }
      /* Eine Stufe hat genau eine Masseinheit: bei einer Halteuebung
         zaehlen die gehaltenen Sekunden (seit v16), sonst Wiederholungen. */
      const sek = sekOf(eintrag, id);
      const werte = sek.length ? sek : repsOf(eintrag, id);
      if(werte.length) k.werte.unshift(werte);
    }
  }

  const raus = [];
  for(const [id, k] of kandidaten){
    if(k.werte.length < OHNE_FORTSCHRITT + VERGLEICH) continue;
    const zuletzt = k.werte.slice(-OHNE_FORTSCHRITT);
    const bestwert = Math.max(...k.werte.slice(0, -OHNE_FORTSCHRITT).map(summe));
    const z = ziel(k.ex, k.lvl);
    const voran = zuletzt.some(w => summe(w) > bestwert || limitErreicht(z, w) === true);
    if(!voran) raus.push(id);
  }
  return raus;
}

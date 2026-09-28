/* Welche Punkte des Aufwärmens zu einem Trainingstag passen.

   Das Aufwärmen war eine feste Liste für jeden Tag: am Beintag stand
   „Bei Pull-Tagen: an der Stange hängen“ darin und die Handgelenke als
   Pflicht, während Hüfte und Knie gar nicht vorkamen. Und an jedem Drucktag
   standen die Handgelenke doppelt da – einmal im Aufwärmen, einmal als
   Handgelenks-Routine am Anfang der Übungen.

   Jeder Punkt trägt eine Bedingung (WARMUP_WANN in exercises.js):
     immer       jeder Tag
     oben        Drücken oder Ziehen
     druck       Drücken, Stützen oder ein Handstand-, Planche-, L-Sit-Skill
     handgelenk  wie druck, aber nur ohne Handgelenks-Routine im Tag
     haengen     Ziehen, und es gibt Stange oder Ringe
     zugboden    Ziehen ohne Stange und Ringe – statt des Hängens
     beine       Kniebeuge, Hüftbeuge oder Wade

   Dazu kommt der Anlaufsatz (anlaufSatz): ein lockerer Satz der ersten
   Kraftübung des Tages, eine Stufe leichter. Er hängt am Stand des
   Nutzers und steht deshalb nicht in der festen Liste.

   Rein: kein DOM, kein Zustand. */

import { zielAuswerten } from './target.js';

const DRUCK = new Set(['h_druecken', 'dip', 'v_druecken', 'handstand', 'planche', 'lsit', 'elbow_lever']);
const ZUG = new Set(['v_ziehen', 'h_ziehen', 'schulter', 'front_lever', 'back_lever', 'muscle_up']);
const BEINE = new Set(['kniebeuge', 'huefte', 'wade']);
export const HANDGELENK_ROUTINE = 'wrist_prep';
export const BEDINGUNGEN = ['immer', 'oben', 'druck', 'handgelenk', 'haengen', 'zugboden', 'beine'];

/* Was ein Tag enthält: { druck, zug, beine, routine }. */
export function tagesMerkmale(exIds, exById = {}){
  const ids = Array.isArray(exIds) ? exIds : [];
  const muster = new Set(ids.map(id => exById[id] && exById[id].muster).filter(Boolean));
  const hat = set => [...muster].some(m => set.has(m));
  return { druck: hat(DRUCK), zug: hat(ZUG), beine: hat(BEINE), routine: ids.includes(HANDGELENK_ROUTINE) };
}

/* Ob ein Punkt mit dieser Bedingung an diesem Tag drankommt. Eine
   unbekannte Bedingung gilt wie „immer“: ein Punkt, den man nicht zuordnen
   kann, wird lieber gezeigt als verschluckt. */
export function passtZumTag(wann, merkmale, equipment = []){
  const m = merkmale || {};
  switch(wann){
    case 'oben': return !!(m.druck || m.zug);
    case 'druck': return !!m.druck;
    case 'handgelenk': return !!m.druck && !m.routine;
    case 'haengen': return !!m.zug && hatStange(equipment);
    case 'zugboden': return !!m.zug && !hatStange(equipment);
    case 'beine': return !!m.beine;
    default: return true;
  }
}
const hatStange = equipment => Array.isArray(equipment) &&
  (equipment.includes('bar') || equipment.includes('rings'));

/* Der Anlaufsatz: vor dem ersten harten Satz einmal dieselbe Bewegung,
   leichter und mit der halben Menge. Das allgemeine Aufwärmen macht warm,
   aber es bereitet nicht auf genau diese Übung vor – wer mit Archer-
   Liegestützen beginnt, hat bis dahin keinen einzigen Liegestütz gemacht.

   Gemeint ist die erste Kraftübung des Tages; Handgelenks-Routine und
   Mobility zählen nicht. Genommen wird die Stufe unter der eigenen, auf
   der ersten Stufe diese selbst. Die Menge ist die Hälfte der Untergrenze,
   aber mindestens 3 Wiederholungen oder 5 Sekunden: genug, um die
   Bewegung zu spüren, zu wenig, um zu ermüden.

   Zurück kommt { id, stufe, leichter, menge, art } oder null; art ist
   'wdh', 'sek' oder 'versuche' wie in zielAuswerten(). */
export function anlaufSatz(exIds, exById = {}, levels = {}){
  const ids = Array.isArray(exIds) ? exIds : [];
  const ex = ids.map(id => exById[id]).find(e => e && e.id !== HANDGELENK_ROUTINE &&
    e.cat !== 'mobility' && Array.isArray(e.levels) && e.levels.length);
  if(!ex) return null;
  const roh = levels && Number.isInteger(levels[ex.id]) ? levels[ex.id] : 0;
  const eigene = Math.max(0, Math.min(roh, ex.levels.length - 1));
  const stufe = Math.max(0, eigene - 1);
  const z = zielAuswerten(ex.levels[stufe]);
  const unten = z.isHold ? z.minSecs : z.minReps;
  if(!unten) return null;
  return {
    id: ex.id, stufe, leichter: stufe < eigene,
    menge: Math.max(z.isHold ? 5 : 3, Math.round(unten / 2)),
    art: z.art
  };
}

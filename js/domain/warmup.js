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
     beine       Kniebeuge, Hüftbeuge oder Wade

   Rein: kein DOM, kein Zustand. */

const DRUCK = new Set(['h_druecken', 'dip', 'v_druecken', 'handstand', 'planche', 'lsit', 'elbow_lever']);
const ZUG = new Set(['v_ziehen', 'h_ziehen', 'schulter', 'front_lever', 'back_lever', 'muscle_up']);
const BEINE = new Set(['kniebeuge', 'huefte', 'wade']);
export const HANDGELENK_ROUTINE = 'wrist_prep';
export const BEDINGUNGEN = ['immer', 'oben', 'druck', 'handgelenk', 'haengen', 'beine'];

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
    case 'haengen': return !!m.zug && Array.isArray(equipment) &&
      (equipment.includes('bar') || equipment.includes('rings'));
    case 'beine': return !!m.beine;
    default: return true;
  }
}

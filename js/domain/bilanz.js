/* Wochenbilanz eines Plans: wie viele Kraftsätze und an wie vielen Tagen
   jede Muskelgruppe pro Woche drankommt, und was daran auffällt.

   Der Generator achtet darauf, dass jede Gruppe mindestens zweimal pro
   Woche drankommt. Ein von Hand umgebauter Plan bekam bisher keine
   Rückmeldung: wer am Beintag die Kniebeugen strich, sah nirgends, dass die
   Beine jetzt ganz fehlen. Und die festen Vorlagen hatten selbst Lücken –
   der A/B-Split kam auf acht Sätze Beine pro Woche und keine Hüftbeuge.

   Rein: kein DOM, kein Zustand, keine Übersetzung. Zurück kommen Zahlen und
   Warnungen als Kennungen; den Text bestimmt der Aufrufer. */

import { istSkill } from './skills.js';
import { zielAuswerten } from './target.js';

/* Muskelgruppen als Bewegungsmuster. Die Schulterübungen (Hängen, Scapula
   Pull-ups, Face Pulls, Y-T-W) zählen zum Ziehen: sie arbeiten mit den
   Muskeln, die das Drücken ausgleichen. Skills und Mobility zählen nicht –
   wie beim Satzdeckel im Generator ist ein Satz Handstand Techniktraining,
   kein Kraftsatz. */
export const GRUPPEN = {
  druecken: ['h_druecken', 'dip', 'v_druecken'],
  ziehen: ['v_ziehen', 'h_ziehen', 'schulter'],
  beine: ['kniebeuge', 'huefte', 'wade'],
  rumpf: ['rumpf_vorn', 'rumpf_seite']
};
const GRUPPE_VON = new Map(Object.entries(GRUPPEN).flatMap(([g, m]) => m.map(x => [x, g])));

/* Unter so vielen Sätzen pro Woche bringt eine Gruppe kaum Fortschritt.
   Zwei harte Sätze an drei Tagen sind sechs – das untere Ende dessen, was
   sich in Studien noch lohnt. */
export const MIN_SAETZE_WOCHE = 6;

/* Zug- zu Drucksätzen: darunter wird gewarnt. Wer deutlich mehr drückt als
   zieht, zieht die Schultern nach vorn; ausgeglichen oder mehr Ziehen ist
   das Ziel, drei Viertel die Grenze, ab der es auffällt. */
export const ZUG_ANTEIL = 0.75;

const objekt = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};

/* Die Plan-Tage einer Woche, in Reihenfolge. Mit festem Wochenrhythmus die
   zugeordneten Tage, sonst die ersten `einheiten` der Rotation – bei
   A/B und vier Einheiten also A, B, A, B. */
export function wochenTage(days, wochenplan, einheiten){
  const liste = Array.isArray(days) ? days.filter(d => d && typeof d.key === 'string') : [];
  if(!liste.length) return [];
  const byKey = new Map(liste.map(d => [d.key, d]));
  const plan = objekt(wochenplan);
  const fest = ['1', '2', '3', '4', '5', '6', '0'].map(wd => byKey.get(plan[wd])).filter(Boolean);
  if(fest.length) return fest;
  const n = Math.max(1, Math.min(7, Math.round(Number(einheiten)) || liste.length));
  return Array.from({ length: n }, (_, i) => liste[i % liste.length]);
}

/* Die Bilanz einer Woche.

   woche:     Plan-Tage aus wochenTage()
   exById:    Katalog
   levels:    Stufen des Nutzers – gezählt werden die Sätze der Stufe, die
              er gerade trainiert, nicht die der ersten
   setsMode:  wie in zielAuswerten()

   Zurück: { einheiten, gruppen: { druecken: { saetze, tage }, … },
             huefte: bool, warnungen: [{ art, gruppe? }] } */
export function wochenbilanz(woche, exById = {}, levels = {}, setsMode = 'standard'){
  const tage = Array.isArray(woche) ? woche : [];
  const stand = objekt(levels);
  const gruppen = Object.fromEntries(Object.keys(GRUPPEN).map(g => [g, { saetze: 0, tage: 0 }]));
  let huefte = false;

  for(const d of tage){
    const heute = new Set();
    for(const id of Array.isArray(d.ex) ? d.ex : []){
      const ex = exById[id];
      const g = ex && GRUPPE_VON.get(ex.muster);
      if(!g || istSkill(ex) || !Array.isArray(ex.levels) || !ex.levels.length) continue;
      const lvl = Math.min(ex.levels.length - 1, Math.max(0, Number(stand[id]) || 0));
      const n = zielAuswerten(ex.levels[lvl], setsMode).sets;
      gruppen[g].saetze += n;
      heute.add(g);
      if(ex.muster === 'huefte') huefte = true;
    }
    heute.forEach(g => { gruppen[g].tage++; });
  }

  const warnungen = [];
  if(tage.length){
    for(const [g, w] of Object.entries(gruppen)){
      if(!w.saetze) warnungen.push({ art: 'fehlt', gruppe: g });
      /* Einmal pro Woche ist nur bei mehreren Einheiten eine Lücke. */
      else if(w.tage < 2 && tage.length >= 2) warnungen.push({ art: 'selten', gruppe: g });
      else if(w.saetze < MIN_SAETZE_WOCHE) warnungen.push({ art: 'wenig', gruppe: g });
    }
    /* Nur Kniebeugen trainieren die Vorderseite; Beinbeuger und Gesäß
       brauchen die Hüftbeuge. */
    if(gruppen.beine.saetze && !huefte) warnungen.push({ art: 'huefte' });
    if(gruppen.druecken.saetze && gruppen.ziehen.saetze &&
      gruppen.ziehen.saetze < gruppen.druecken.saetze * ZUG_ANTEIL) warnungen.push({ art: 'zugWenig' });
  }
  return { einheiten: tage.length, gruppen, huefte, warnungen };
}

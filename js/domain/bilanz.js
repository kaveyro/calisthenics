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
import { isoWeek, isoDaysAgo } from './dates.js';

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

/* Ist-Bilanz: die tatsächlich gemachten Kraftsätze je Gruppe und Woche.

   Die Wochenbilanz sagt, was der Plan vorsieht. Ob er auch so trainiert
   wird, stand nirgends: wer jede Woche die Einheit mit den Beinen ausließ,
   hatte eine Bilanz ohne Warnung und trotzdem kaum Beine im Training.

   Gezählt wird je Übung, was im Log steht: jeder Satz mit Wiederholungen
   oder gehaltenen Sekunden. Nachgetragene Einheiten haben keine Zahlen;
   für sie gelten die Sätze ihrer Stufe, als wäre die Einheit wie geplant
   gelaufen – sie ganz wegzulassen, sähe aus wie eine ausgefallene Woche.

   wochen: so viele Kalenderwochen bis einschließlich der laufenden. Wochen
   vor der ersten Einheit überhaupt fehlen: vor dem Anfang wurde nichts
   ausgelassen. Der Schnitt nimmt nur abgeschlossene Wochen.

   Zurück: { wochen: [{ key, laufend, einheiten, gruppen: { druecken: n, … } }],
             schnitt: { druecken: n, … } | null, geschaetzt: bool } */
export function istBilanz(log, exById = {}, { wochen = 4, levels = {}, setsMode = 'standard', now = new Date() } = {}){
  const liste = (Array.isArray(log) ? log : []).filter(l => l && typeof l.d === 'string' && isoWeek(l.d));
  const stand = objekt(levels);
  const keys = [];
  for(let i = Math.max(1, Math.round(wochen)) - 1; i >= 0; i--) keys.push(isoWeek(isoDaysAgo(7 * i, now)));
  const erste = liste.length ? liste.map(l => isoWeek(l.d)).sort()[0] : null;
  const leer = () => Object.fromEntries(Object.keys(GRUPPEN).map(g => [g, 0]));
  const out = keys.filter(k => erste && k >= erste).map(key => ({
    key, laufend: key === keys[keys.length - 1], einheiten: 0, gruppen: leer()
  }));
  const byKey = new Map(out.map(w => [w.key, w]));
  let geschaetzt = false;

  for(const l of liste){
    const w = byKey.get(isoWeek(l.d));
    if(!w) continue;
    w.einheiten++;
    const saetze = new Map();
    const zaehlen = obj => Object.keys(objekt(obj)).forEach(key => {
      const n = Number(obj[key]);
      if(!(Number.isFinite(n) && n > 0)) return;
      const id = key.slice(0, key.lastIndexOf('-'));
      saetze.set(id, (saetze.get(id) || 0) + 1);
    });
    zaehlen(l.reps); zaehlen(l.sek);
    if(!saetze.size && Array.isArray(l.ex)){
      l.ex.forEach(id => {
        const ex = exById[id];
        if(!ex || !Array.isArray(ex.levels) || !ex.levels.length) return;
        const lv = objekt(l.lv)[id] ?? stand[id] ?? 0;
        const lvl = Math.min(ex.levels.length - 1, Math.max(0, Number(lv) || 0));
        saetze.set(id, zielAuswerten(ex.levels[lvl], setsMode).sets);
        geschaetzt = true;
      });
    }
    saetze.forEach((n, id) => {
      const ex = exById[id];
      const g = ex && GRUPPE_VON.get(ex.muster);
      if(g && !istSkill(ex)) w.gruppen[g] += n;
    });
  }

  const fertig = out.filter(w => !w.laufend);
  const schnitt = fertig.length
    ? Object.fromEntries(Object.keys(GRUPPEN).map(g => [g, Math.round(fertig.reduce((s, w) => s + w.gruppen[g], 0) / fertig.length)]))
    : null;
  return { wochen: out, schnitt, geschaetzt };
}

/* Welche Gruppen im Schnitt deutlich unter dem Plan bleiben: unter drei
   Vierteln der geplanten Sätze oder unter dem Minimum. Ohne Plan für die
   Gruppe keine Aussage. Eine ausgelassene von vier Einheiten löst es noch
   nicht aus – das ist eine Woche, kein Muster –, zwei schon. */
export const IST_ANTEIL = 0.75;
export function istLuecken(schnitt, soll){
  if(!schnitt || !soll) return [];
  return Object.keys(GRUPPEN).filter(g => {
    const plan = soll[g] ? soll[g].saetze : 0;
    return plan > 0 && (schnitt[g] < plan * IST_ANTEIL || schnitt[g] < Math.min(plan, MIN_SAETZE_WOCHE));
  });
}

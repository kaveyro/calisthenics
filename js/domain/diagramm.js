/* Kleine Liniendiagramme als SVG-Pfad – reine Logik, kein DOM.

   Bisher baute jede Kurve ihre Punkte selbst (Topsaetze, Gewicht, Masse).
   Die Treppe ist die erste, die an zwei Stellen gebraucht wird: im
   Uebungsblatt und im Verlauf. */

const ms = iso => new Date(String(iso) + 'T12:00:00').getTime();
const rund = n => Math.round(n * 10) / 10;

/* Eine Treppenlinie fuer Stufen ueber die Zeit, als `d` eines <path>.

   punkte:  [{ d: 'YYYY-MM-DD', lvl }] (stufenVerlauf), Reihenfolge egal
   von/bis: der gezeigte Zeitraum; ohne Angabe der erste und letzte Punkt
   maxLvl:  die hoechste Stufe der Leiter (oben im Bild); ohne Angabe die
            hoechste erreichte
   breite/hoehe/rand: Masse der viewBox

   Waagerecht bleibt die Stufe, bis sie wechselt; dann geht es senkrecht
   hoch oder runter. Stand die Stufe schon vor `von` fest, beginnt die Linie
   am linken Rand auf dieser Stufe. Sie endet immer am rechten Rand: die
   Stufe gilt bis heute. Ohne Punkt im oder vor dem Zeitraum: ''. */
export function treppenPfad(punkte, { von, bis, maxLvl, breite = 300, hoehe = 40, rand = 3 } = {}){
  const liste = (Array.isArray(punkte) ? punkte : [])
    .filter(p => p && Number.isInteger(p.lvl) && !Number.isNaN(ms(p.d)))
    .map((p, i) => ({ t: ms(p.d), lvl: p.lvl, i }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  if(!liste.length) return '';
  const t0 = von ? ms(von) : liste[0].t;
  const t1 = bis ? ms(bis) : liste[liste.length - 1].t;
  if(Number.isNaN(t0) || Number.isNaN(t1) || t1 < t0) return '';
  const oben = Math.max(1, Number.isInteger(maxLvl) ? maxLvl : Math.max(...liste.map(p => p.lvl)));
  const spanne = Math.max(1, t1 - t0);
  const x = t => rund(Math.min(breite, Math.max(0, (t - t0) / spanne * breite)));
  const y = l => rund(hoehe - rand - Math.max(0, Math.min(l, oben)) / oben * (hoehe - 2 * rand));

  const vorher = liste.filter(p => p.t < t0).pop();
  const drin = liste.filter(p => p.t >= t0 && p.t <= t1);
  const start = vorher || drin[0];
  if(!start) return '';
  let pfad = 'M' + x(vorher ? t0 : start.t) + ' ' + y(start.lvl);
  let lvl = start.lvl;
  for(const p of drin){
    if(p.lvl === lvl) continue;
    pfad += 'H' + x(p.t) + 'V' + y(p.lvl);
    lvl = p.lvl;
  }
  return pfad + 'H' + breite;
}

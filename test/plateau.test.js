import { describe, it, expect } from 'vitest';
import { detectPlateaus } from '../js/domain/plateau.js';

/* Je Tag genau eine Übung, damit jede Zusicherung eindeutig ist.
   `kurz` hat nur zwei Stufen – ab Stufe 1 ist dort das Ende erreicht. */
const EX = {
  pushup: { id: 'pushup', levels: [{}, {}, {}] },
  dips:   { id: 'dips',   levels: [{}, {}, {}] },
  kurz:   { id: 'kurz',   levels: [{}, {}] }
};
const TAGE = [
  { key: 'A', ex: ['pushup'] },
  { key: 'B', ex: ['dips'] },
  { key: 'C', ex: ['kurz'] }
];

/* n Einheiten für einen Tag, standardmäßig ohne Level-Up. */
const log = (tag, n, ups = []) =>
  Array.from({ length: n }, (_, i) => ({ d: '2026-01-' + String(i + 1).padStart(2, '0'), day: tag, sets: 10, ups }));

describe('detectPlateaus', () => {
  it('meldet nichts ohne Log', () => {
    expect(detectPlateaus(TAGE, [], {}, EX)).toEqual([]);
    expect(detectPlateaus(TAGE, null, {}, EX)).toEqual([]);
  });

  it('meldet nichts bei weniger als vier Einheiten', () => {
    expect(detectPlateaus(TAGE, log('A', 3), {}, EX)).toEqual([]);
  });

  it('meldet eine Übung nach vier Einheiten ohne Level-Up', () => {
    expect(detectPlateaus(TAGE, log('A', 4), {}, EX)).toEqual(['pushup']);
  });

  it('meldet nicht, wenn im Fenster ein Level-Up liegt', () => {
    const eintraege = log('A', 5);
    eintraege[2].ups = ['Liegestütze → Voll'];
    expect(detectPlateaus(TAGE, eintraege, {}, EX)).toEqual([]);
  });

  it('betrachtet nur die letzten fünf Einheiten', () => {
    /* Das Level-Up liegt weit zurück und darf die aktuelle Stagnation
       nicht mehr überdecken. */
    const eintraege = [...log('A', 1, ['altes Level-Up']), ...log('A', 5)];
    expect(detectPlateaus(TAGE, eintraege, {}, EX)).toEqual(['pushup']);
  });

  it('nimmt Übungen auf der höchsten Stufe aus', () => {
    /* kurz hat zwei Stufen – auf Index 1 gibt es nichts mehr zu erreichen. */
    expect(detectPlateaus(TAGE, log('C', 5), { kurz: 1 }, EX)).toEqual([]);
    /* Eine Stufe darunter wird dieselbe Übung sehr wohl gemeldet. */
    expect(detectPlateaus(TAGE, log('C', 5), { kurz: 0 }, EX)).toEqual(['kurz']);
  });

  it('berücksichtigt den aktuellen Stufenstand', () => {
    /* pushup hat drei Stufen; auf Index 2 ist die höchste erreicht. */
    expect(detectPlateaus(TAGE, log('A', 5), { pushup: 2 }, EX)).toEqual([]);
    expect(detectPlateaus(TAGE, log('A', 5), { pushup: 1 }, EX)).toEqual(['pushup']);
  });

  it('trennt die Tage sauber', () => {
    /* Nur Tag B wurde trainiert, also kann nur dips stagnieren. */
    expect(detectPlateaus(TAGE, log('B', 5), {}, EX)).toEqual(['dips']);
  });

  it('ignoriert Einträge für einen gelöschten Tag', () => {
    expect(detectPlateaus(TAGE, log('Weg', 9), {}, EX)).toEqual([]);
  });

  it('ignoriert unbekannte Übungs-IDs im Plan', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'gibtsnicht'] }];
    expect(detectPlateaus(tage, log('A', 5), {}, EX)).toEqual(['pushup']);
  });

  /* Regression: eine Übung an zwei Tagen wurde zweimal gemeldet und
     erschien doppelt im Banner ("Liegestütze, Liegestütze"). */
  it('meldet eine Übung an mehreren Tagen nur einmal', () => {
    const tage = [{ key: 'A', ex: ['pushup'] }, { key: 'B', ex: ['pushup'] }];
    expect(detectPlateaus(tage, log('A', 5), {}, EX)).toEqual(['pushup']);
  });

  it('kommt mit fehlerhaften Einträgen zurecht', () => {
    const eintraege = [null, { day: 'A' }, ...log('A', 4)];
    expect(() => detectPlateaus(TAGE, eintraege, {}, EX)).not.toThrow();
  });
});

/* Naive Referenzimplementierung – bewusst die frühere, langsame Fassung.
   Sie belegt, dass die Optimierung dasselbe Ergebnis liefert, statt es nur
   zu behaupten. Einziger gewollter Unterschied: die alte Fassung konnte
   Duplikate produzieren, hier über einen Set abgefangen. */
function referenz(days, log, levels, exById){
  const raus = [];
  days.forEach(d => {
    d.ex.forEach(id => {
      const ex = exById[id]; if(!ex) return;
      const recent = log.filter(l => {
        const day = days.find(x => x.key === (l && l.day));
        return day && day.ex.includes(id);
      }).slice(-5);
      if(recent.length >= 4 && !recent.some(l => l.ups && l.ups.length)){
        const lvl = levels[id] || 0;
        if(lvl < ex.levels.length - 1) raus.push(id);
      }
    });
  });
  return [...new Set(raus)];
}

describe('detectPlateaus – Äquivalenz zur naiven Fassung', () => {
  it('stimmt über 200 zufällige Logs mit der Referenz überein', () => {
    /* Deterministischer Generator: ein fehlschlagender Lauf muss
       reproduzierbar sein. */
    let saat = 12345;
    const zufall = n => (saat = (saat * 1103515245 + 12345) & 0x7fffffff) % n;

    for(let runde = 0; runde < 200; runde++){
      const eintraege = Array.from({ length: zufall(40) }, () => ({
        d: '2026-01-01',
        day: ['A', 'B', 'C', 'Weg'][zufall(4)],
        sets: 10,
        ups: zufall(4) === 0 ? ['x'] : []
      }));
      const levels = { pushup: zufall(3), dips: zufall(3), kurz: zufall(2) };
      expect(detectPlateaus(TAGE, eintraege, levels, EX), `Runde ${runde}`)
        .toEqual(referenz(TAGE, eintraege, levels, EX));
    }
  });

  it('liefert bei 2000 Einträgen dasselbe wie die Referenz', () => {
    const eintraege = Array.from({ length: 2000 }, (_, i) => ({
      d: '2026-01-01',
      day: i % 2 ? 'A' : 'B',
      sets: 10,
      ups: i < 1990 && i % 7 === 0 ? ['x'] : []
    }));
    expect(detectPlateaus(TAGE, eintraege, {}, EX)).toEqual(referenz(TAGE, eintraege, {}, EX));
  });
});

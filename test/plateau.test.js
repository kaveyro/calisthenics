import { describe, it, expect } from 'vitest';
import { detectPlateaus } from '../js/domain/plateau.js';
import { zielAuswerten } from '../js/domain/target.js';

/* Je Tag genau eine Übung, damit jede Zusicherung eindeutig ist.
   `kurz` hat nur zwei Stufen – ab Stufe 1 ist dort das Ende erreicht.
   Jede Stufe hat 4 Sätze in der Spanne 6–10. */
const STUFE = { stage: 'x', saetze: 4, wdh: [6, 10] };
const EX = {
  pushup: { id: 'pushup', levels: [STUFE, STUFE, STUFE] },
  dips:   { id: 'dips',   levels: [STUFE, STUFE, STUFE] },
  kurz:   { id: 'kurz',   levels: [STUFE, STUFE] }
};
const TAGE = [
  { key: 'A', ex: ['pushup'] },
  { key: 'B', ex: ['dips'] },
  { key: 'C', ex: ['kurz'] }
];
const ZIEL = (ex, lvl) => zielAuswerten(ex.levels[lvl]);

/* Eine Einheit mit denselben Wiederholungen in jedem Satz. */
const einheit = (id, reps, lvl = 0, extra = {}) => ({
  d: '2026-01-01', day: { pushup: 'A', dips: 'B', kurz: 'C' }[id], sets: 4,
  ex: [id], ups: [], lv: { [id]: lvl },
  reps: Object.fromEntries([0, 1, 2, 3].map(s => [id + '-' + s, reps])),
  ...extra
});
const reihe = (id, folge, lvl = 0) => folge.map(r => einheit(id, r, lvl));
const pruefe = (log, levels = {}) => detectPlateaus(TAGE, log, levels, EX, ZIEL);

describe('detectPlateaus', () => {
  it('meldet nichts ohne Log', () => {
    expect(pruefe([])).toEqual([]);
    expect(detectPlateaus(TAGE, null, {}, EX, ZIEL)).toEqual([]);
  });

  /* Der Fehler, um den es ging. Die alte Regel meldete eine Übung, die in
     vier Einheiten nicht aufgestiegen war – bei 6–10 und einer
     Wiederholung mehr je Einheit ist das der Normalfall, kein Stillstand. */
  it('hält stetigen Fortschritt nicht für Stillstand', () => {
    expect(pruefe(reihe('pushup', [6, 7, 8, 9]))).toEqual([]);
    expect(pruefe(reihe('pushup', [6, 6, 7, 7, 8, 8, 9]))).toEqual([]);
  });

  it('meldet drei Einheiten ohne bessere Satzsumme', () => {
    expect(pruefe(reihe('pushup', [8, 8, 8, 8]))).toEqual(['pushup']);
    expect(pruefe(reihe('pushup', [6, 9, 8, 7, 9]))).toEqual(['pushup']);
  });

  it('braucht vier Einheiten auf der Stufe', () => {
    expect(pruefe(reihe('pushup', [8, 8, 8]))).toEqual([]);
  });

  it('zählt eine Verbesserung in einem einzigen Satz', () => {
    const log = reihe('pushup', [8, 8, 8, 8]);
    log[3].reps['pushup-2'] = 9;
    expect(pruefe(log)).toEqual([]);
  });

  /* Oben angekommen kann die Summe nicht mehr steigen; die Stufe wartet
     nur auf die Serie. Bei einer eingestellten Serie von drei oder mehr
     wäre das sonst selbst „Stillstand". */
  it('wertet alle Sätze an der Obergrenze als Fortschritt', () => {
    expect(pruefe(reihe('pushup', [10, 10, 10, 10]))).toEqual([]);
  });

  it('beginnt nach einem Stufenwechsel von vorn', () => {
    const log = [...reihe('pushup', [8, 8, 8, 8], 0), ...reihe('pushup', [6, 6], 1)];
    expect(pruefe(log, { pushup: 1 })).toEqual([]);
  });

  it('betrachtet nur die Zeit seit dem letzten Wechsel auf diese Stufe', () => {
    /* Stufe 1, dann zurück auf 0, dann wieder 1: die alte Zeit auf Stufe 1
       endet am Wechsel und zählt nicht mehr. */
    const log = [
      ...reihe('pushup', [8, 8, 8], 1),
      ...reihe('pushup', [7], 0),
      ...reihe('pushup', [8], 1)
    ];
    expect(pruefe(log, { pushup: 1 })).toEqual([]);
  });

  it('lässt Einheiten einer Entlastungswoche außen vor', () => {
    const log = [
      ...reihe('pushup', [8]),
      einheit('pushup', 8, 0, { dl: true }),
      einheit('pushup', 8, 0, { dl: true }),
      einheit('pushup', 8, 0, { dl: true }),
      ...reihe('pushup', [9])
    ];
    expect(pruefe(log)).toEqual([]);
  });

  it('überspringt Einträge ohne Stufe oder ohne Zahlen', () => {
    const ohneStufe = { ...einheit('pushup', 8), lv: {} };
    const ohneZahlen = { ...einheit('pushup', 8), reps: {} };
    expect(pruefe([...reihe('pushup', [8, 8, 8]), ohneStufe, ohneZahlen])).toEqual([]);
    expect(pruefe([ohneStufe, ...reihe('pushup', [8, 8, 8, 8]), ohneZahlen])).toEqual(['pushup']);
  });

  it('lässt sich von einer anderen Übung derselben Einheit nicht täuschen', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'dips'] }];
    const log = [8, 8, 8, 8].map((r, i) => ({
      d: '2026-01-01', day: 'A', ex: ['pushup', 'dips'], ups: [],
      lv: { pushup: 0, dips: 0 },
      reps: { 'pushup-0': 6 + i, 'dips-0': r }
    }));
    expect(detectPlateaus(tage, log, {}, EX, ZIEL)).toEqual(['dips']);
  });

  it('rechnet einer neu hinzugefügten Übung keine alten Einheiten an', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'dips'] }];
    expect(detectPlateaus(tage, reihe('pushup', [8, 8, 8, 8]), {}, EX, ZIEL)).toEqual(['pushup']);
  });

  it('nimmt Übungen auf der höchsten Stufe aus', () => {
    expect(pruefe(reihe('kurz', [8, 8, 8, 8], 1), { kurz: 1 })).toEqual([]);
    expect(pruefe(reihe('kurz', [8, 8, 8, 8], 0), { kurz: 0 })).toEqual(['kurz']);
  });

  it('meldet eine Übung an mehreren Tagen nur einmal', () => {
    const tage = [{ key: 'A', ex: ['pushup'] }, { key: 'B', ex: ['pushup'] }];
    expect(detectPlateaus(tage, reihe('pushup', [8, 8, 8, 8]), {}, EX, ZIEL)).toEqual(['pushup']);
  });

  it('ignoriert unbekannte Übungen im Plan', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'gibtsnicht'] }];
    expect(detectPlateaus(tage, reihe('pushup', [8, 8, 8, 8]), {}, EX, ZIEL)).toEqual(['pushup']);
  });

  it('kommt ohne Zielauswertung aus', () => {
    /* Dann zählt keine Einheit als „alle oben" – nur die Summe entscheidet. */
    expect(detectPlateaus(TAGE, reihe('pushup', [10, 10, 10, 10]), {}, EX)).toEqual(['pushup']);
  });

  it('kommt mit fehlerhaften Einträgen zurecht', () => {
    const log = [null, { day: 'A' }, { d: 'x', lv: 'kaputt' }, ...reihe('pushup', [8, 8, 8, 8])];
    expect(pruefe(log)).toEqual(['pushup']);
  });
});

/* Naive Referenz: dieselbe Regel, geradeheraus geschrieben – je Übung das
   Log filtern, am letzten Wechsel abschneiden, nachsehen. Sie belegt, dass
   der eine rückwärtige Durchlauf mit Frühabbruch dasselbe liefert. Bewusst
   ohne die Hilfsfunktionen des Moduls, sonst prüft der Vergleich nur sich
   selbst. */
function referenz(days, log, levels){
  const raus = [];
  for(const id of [...new Set(days.flatMap(d => d.ex))]){
    const ex = EX[id]; if(!ex) continue;
    const lvl = levels[id] || 0;
    if(lvl >= ex.levels.length - 1) continue;
    const eigene = log.filter(l => l && !l.dl && (l.ex || []).includes(id) &&
      l.lv && Number.isInteger(l.lv[id]));
    let start = 0;
    eigene.forEach((l, i) => { if(l.lv[id] !== lvl) start = i + 1; });
    const werte = eigene.slice(start)
      .map(l => [0, 1, 2, 3].map(s => l.reps[id + '-' + s]).filter(n => typeof n === 'number'))
      .filter(w => w.length);
    if(werte.length < 4) continue;
    const sum = w => w.reduce((a, b) => a + b, 0);
    const best = Math.max(...werte.slice(0, -3).map(sum));
    const oben = w => w.length === 4 && w.every(n => n >= 10);
    if(!werte.slice(-3).some(w => sum(w) > best || oben(w))) raus.push(id);
  }
  return raus;
}

describe('detectPlateaus – Äquivalenz zur naiven Fassung', () => {
  it('stimmt über 300 zufällige Logs mit der Referenz überein', () => {
    let saat = 12345;
    /* Die oberen Bits: die unteren eines LCG laufen mit kurzer Periode um,
       zufall(2) wechselte sonst streng ab. */
    const zufall = n => ((saat = (saat * 1103515245 + 12345) & 0x7fffffff) >>> 16) % n;
    let gemeldet = 0;

    for(let runde = 0; runde < 300; runde++){
      const log = Array.from({ length: zufall(40) }, () => {
        const id = ['pushup', 'dips', 'kurz'][zufall(3)];
        const e = einheit(id, 6 + zufall(zufall(4) === 0 ? 5 : 3), zufall(8) === 0 ? 1 : 0);
        if(zufall(6) === 0) e.dl = true;
        if(zufall(8) === 0) e.lv = {};
        if(zufall(8) === 0) delete e.reps[id + '-' + zufall(4)];
        return e;
      });
      const levels = { pushup: zufall(2), dips: zufall(2), kurz: zufall(2) };
      const ist = pruefe(log, levels);
      gemeldet += ist.length;
      expect(ist, `Runde ${runde}`).toEqual(referenz(TAGE, log, levels));
    }
    /* Sicherung gegen einen Generator, der nie etwas Meldenswertes baut
       und den Vergleich damit trivial grün macht. */
    expect(gemeldet).toBeGreaterThan(20);
  });
});

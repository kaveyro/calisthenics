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
    eintraege[2].ups = ['pushup'];
    expect(detectPlateaus(TAGE, eintraege, {}, EX)).toEqual([]);
  });

  /* Der Fehler, um den es ging: geprüft wurde, ob in der Einheit ÜBERHAUPT
     jemand aufgestiegen ist. Auf einem Tag mit sieben Übungen genügte eine
     einzige, die sich bewegt, und für die übrigen sechs schwieg die
     Erkennung – genau die Lage, für die es sie gibt. */
  it('lässt sich vom Aufstieg einer anderen Übung nicht täuschen', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'dips'] }];
    const eintraege = Array.from({ length: 5 }, (_, i) => ({
      d: '2026-01-0' + (i + 1), day: 'A', sets: 10,
      ex: ['pushup', 'dips'], ups: ['pushup']       /* nur pushup steigt */
    }));
    expect(detectPlateaus(tage, eintraege, {}, EX)).toEqual(['dips']);
  });

  /* Umgekehrt: ein Tag ohne jeden Aufstieg meldete früher pauschal alles. */
  it('meldet an einem Tag ohne Aufstieg beide, aber jede aus eigenem Grund', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'dips'] }];
    const eintraege = Array.from({ length: 5 }, (_, i) => ({
      d: '2026-01-0' + (i + 1), day: 'A', sets: 10, ex: ['pushup', 'dips'], ups: []
    }));
    expect(detectPlateaus(tage, eintraege, {}, EX)).toEqual(['pushup', 'dips']);
  });

  /* Zweite Korrektur: die Zugehörigkeit stand im HEUTIGEN Plan. Eine gestern
     hinzugefügte Übung bekam damit fünf alte Einheiten angerechnet, in denen
     sie nie vorkam, und galt sofort als stagnierend. */
  it('rechnet einer neu hinzugefügten Übung keine alten Einheiten an', () => {
    const tage = [{ key: 'A', ex: ['pushup', 'dips'] }];
    const eintraege = Array.from({ length: 5 }, (_, i) => ({
      d: '2026-01-0' + (i + 1), day: 'A', sets: 10, ex: ['pushup'], ups: []
    }));
    /* dips steht erst seit heute im Plan und war in keiner der Einheiten. */
    expect(detectPlateaus(tage, eintraege, {}, EX)).toEqual(['pushup']);
  });

  /* Ehrlich zur Schemagrenze: ein Eintrag von vor v14 hält seinen Aufstieg
     als Anzeigetext fest und lässt sich keiner Übung zuordnen. Er zählt
     deshalb als Einheit ohne Aufstieg – die Erkennung ist auf altem Bestand
     eher zu laut als zu leise. */
  it('kann einen Aufstieg von vor v14 keiner Übung zuordnen', () => {
    const eintraege = log('A', 5).map(l => ({ ...l, ex: ['pushup'] }));
    eintraege[2].ups = ['Liegestütze → Voll'];
    expect(detectPlateaus(TAGE, eintraege, {}, EX)).toEqual(['pushup']);
  });

  it('betrachtet nur die letzten fünf Einheiten', () => {
    /* Das Level-Up liegt weit zurück und darf die aktuelle Stagnation
       nicht mehr überdecken. */
    const eintraege = [...log('A', 1, ['pushup']), ...log('A', 5)];
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

/* Naive Referenzimplementierung – dieselbe Regel, geradeheraus geschrieben:
   je Übung das Log filtern, die letzten fünf nehmen, nachsehen. Sie belegt,
   dass der eine rückwärtige Durchlauf mit Frühabbruch dasselbe liefert,
   statt es nur zu behaupten.

   Bewusst eigenständig, auch bei der Zugehörigkeit: nicht entryExercises()
   aufrufen, sonst prüft der Vergleich nur sich selbst. */
function uebungenVon(eintrag, days){
  if(!eintrag || typeof eintrag !== 'object') return [];
  if(Array.isArray(eintrag.ex) && eintrag.ex.length) return [...eintrag.ex];
  const tag = days.find(x => x.key === eintrag.day);
  const ausReps = Object.keys(eintrag.reps || {})
    .map(k => k.slice(0, k.lastIndexOf('-'))).filter(Boolean);
  return [...new Set([...(tag ? tag.ex : []), ...ausReps])];
}

function referenz(days, log, levels, exById){
  const raus = [];
  days.forEach(d => {
    d.ex.forEach(id => {
      const ex = exById[id]; if(!ex) return;
      const recent = log.filter(l => uebungenVon(l, days).includes(id)).slice(-5);
      if(recent.length >= 4 &&
         !recent.some(l => Array.isArray(l.ups) && l.ups.includes(id))){
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
      const eintraege = Array.from({ length: zufall(40) }, () => {
        const tag = ['A', 'B', 'C', 'Weg'][zufall(4)];
        /* Mal mit eigener Übungsliste, mal ohne – letzteres ist der
           Rückfall auf den Plan. Und Aufstiege mal der eigenen Übung, mal
           einer fremden, mal als alter Anzeigetext. */
        const eigen = zufall(2) === 0;
        const ups = [[], ['pushup'], ['dips'], ['kurz'], ['Liegestütze → Voll']][zufall(5)];
        const e = { d: '2026-01-01', day: tag, sets: 10, ups };
        if(eigen) e.ex = [['pushup'], ['dips'], ['pushup', 'dips'], ['kurz']][zufall(4)];
        return e;
      });
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
      ups: i < 1990 && i % 7 === 0 ? ['pushup'] : []
    }));
    expect(detectPlateaus(TAGE, eintraege, {}, EX)).toEqual(referenz(TAGE, eintraege, {}, EX));
  });
});

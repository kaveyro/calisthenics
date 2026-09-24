import { describe, it, expect } from 'vitest';
import {
  entryExercises, entryHasExercise, repsOf, lastRepsFor, lastRepsByExercise, verlaufJeUebung, sekOf,
  letztesDatumJeUebung, zaehleJeTag
} from '../js/domain/log.js';

/* Die Zuordnung Eintrag -> Übung war der Grund für diese Datei: sie lief über
   den heutigen Plan und war damit nach jeder Planänderung falsch. */

const TAG_A = { key: 'A', ex: ['pushup', 'squat'] };

describe('entryExercises', () => {
  it('nimmt die Liste aus dem Eintrag, wenn sie da ist', () => {
    const e = { d: '2026-07-01', day: 'A', ex: ['dips', 'row'], reps: {} };
    expect(entryExercises(e, TAG_A)).toEqual(['dips', 'row']);
  });

  it('ignoriert den Plan, sobald der Eintrag selbst Bescheid weiß', () => {
    /* Genau der Fall nach einer Ersetzung: der Plan führt heute etwas
       anderes, der Eintrag bleibt bei dem, was trainiert wurde. */
    const e = { d: '2026-07-01', day: 'A', ex: ['pushup'], reps: {} };
    expect(entryExercises(e, { key: 'A', ex: ['dips'] })).toEqual(['pushup']);
  });

  it('fällt bei Altbeständen auf Plan und Wiederholungsschlüssel zurück', () => {
    /* Der Plan kennt die Halteübung, die Reps-Schlüssel belegen eine dritte,
       inzwischen ersetzte Übung. Beides gehört dazu. */
    const alt = { d: '2026-06-01', day: 'A', reps: { 'pushup-0': 12, 'dips-0': 8 } };
    expect(entryExercises(alt, TAG_A).sort()).toEqual(['dips', 'pushup', 'squat']);
  });

  it('kommt ohne Plan-Tag aus', () => {
    const alt = { d: '2026-06-01', day: 'X', reps: { 'pushup-0': 12, 'pushup-1': 10 } };
    expect(entryExercises(alt, undefined)).toEqual(['pushup']);
    expect(entryExercises(alt, null)).toEqual(['pushup']);
  });

  it('liefert für unbrauchbare Eingaben eine leere Liste', () => {
    expect(entryExercises(null, TAG_A)).toEqual([]);
    expect(entryExercises(undefined, TAG_A)).toEqual([]);
    expect(entryExercises('text', TAG_A)).toEqual([]);
    expect(entryExercises({ d: '2026-06-01' }, null)).toEqual([]);
  });

  it('behandelt eine leere ex-Liste wie einen Altbestand', () => {
    /* migrateState() setzt [] für alte Einträge – das darf den Rückfall
       nicht abschneiden. */
    const e = { d: '2026-06-01', day: 'A', ex: [], reps: {} };
    expect(entryExercises(e, TAG_A)).toEqual(['pushup', 'squat']);
  });

  it('gibt keine Referenz auf die gespeicherte Liste heraus', () => {
    const e = { d: '2026-07-01', day: 'A', ex: ['dips'] };
    entryExercises(e, TAG_A).push('fremd');
    expect(e.ex).toEqual(['dips']);
  });
});

describe('entryHasExercise', () => {
  const eintrag = { d: '2026-07-01', day: 'A', ex: ['pushup'] };

  it('erkennt eine trainierte Übung', () => {
    expect(entryHasExercise(eintrag, 'pushup', TAG_A)).toBe(true);
  });

  it('verneint eine Übung, die nur heute im Plan steht', () => {
    /* Vorher lieferte genau das ein true – die neue Übung erbte die
       Historie der ersetzten. */
    expect(entryHasExercise(eintrag, 'squat', TAG_A)).toBe(false);
  });
});

describe('repsOf', () => {
  const e = { reps: { 'pushup-1': 10, 'pushup-0': 12, 'pushup-2': 8, 'dips-0': 6 } };

  it('sortiert nach Satznummer, nicht nach Schlüsselreihenfolge', () => {
    expect(repsOf(e, 'pushup')).toEqual([12, 10, 8]);
  });

  it('trennt die Übungen sauber', () => {
    expect(repsOf(e, 'dips')).toEqual([6]);
  });

  it('verwechselt keine Übung mit einem Namenspräfix', () => {
    const p = { reps: { 'pushup-0': 12, 'pushup_wide-0': 9 } };
    expect(repsOf(p, 'pushup')).toEqual([12]);
    expect(repsOf(p, 'pushup_wide')).toEqual([9]);
  });

  it('nimmt Lücken hin', () => {
    expect(repsOf({ reps: { 'pushup-0': 12, 'pushup-2': 8 } }, 'pushup')).toEqual([12, 8]);
  });

  it('lässt 0 stehen und wirft Unbrauchbares weg', () => {
    const roh = { reps: { 'pushup-0': 0, 'pushup-1': null, 'pushup-2': 'x', 'pushup-3': 7 } };
    expect(repsOf(roh, 'pushup')).toEqual([0, 7]);
  });

  it('kommt mit fehlenden reps zurecht', () => {
    expect(repsOf({}, 'pushup')).toEqual([]);
    expect(repsOf({ reps: null }, 'pushup')).toEqual([]);
    expect(repsOf(null, 'pushup')).toEqual([]);
  });
});

describe('lastRepsFor', () => {
  const log = [
    { d: '2026-07-01', day: 'A', ex: ['pushup'], reps: { 'pushup-0': 10 } },
    { d: '2026-07-03', day: 'B', ex: ['dips'], reps: { 'dips-0': 8 } },
    { d: '2026-07-05', day: 'A', ex: ['pushup'], reps: { 'pushup-0': 12, 'pushup-1': 11 } }
  ];

  it('findet die jüngste Einheit mit dieser Übung', () => {
    expect(lastRepsFor(log, 'pushup')).toEqual({ d: '2026-07-05', reps: [12, 11], lvl: null });
  });

  it('überspringt Einträge ohne Wiederholungen', () => {
    /* Eine Einheit, in der die Übung nur abgehakt wurde, hilft nicht weiter –
       gesucht sind Zahlen zum Vergleichen. */
    const mitLuecke = [...log, { d: '2026-07-07', day: 'A', ex: ['pushup'], reps: {} }];
    expect(lastRepsFor(mitLuecke, 'pushup')).toEqual({ d: '2026-07-05', reps: [12, 11], lvl: null });
  });

  it('lässt einen bestimmten Eintrag aus', () => {
    expect(lastRepsFor(log, 'pushup', () => null, log[2]))
      .toEqual({ d: '2026-07-01', reps: [10], lvl: null });
  });

  it('nutzt den Plan-Rückfall für Altbestände', () => {
    const alt = [{ d: '2026-06-01', day: 'A', reps: { 'squat-0': 20 } }];
    expect(lastRepsFor(alt, 'squat', k => (k === 'A' ? TAG_A : null)))
      .toEqual({ d: '2026-06-01', reps: [20], lvl: null });
  });

  it('liefert null, wenn nichts passt', () => {
    expect(lastRepsFor(log, 'unbekannt')).toBeNull();
    expect(lastRepsFor([], 'pushup')).toBeNull();
    expect(lastRepsFor(null, 'pushup')).toBeNull();
  });
});

describe('lastRepsByExercise', () => {
  const log = [
    { d: '2026-07-01', day: 'A', ex: ['pushup', 'dips'], reps: { 'pushup-0': 10, 'dips-0': 5 } },
    { d: '2026-07-05', day: 'A', ex: ['pushup', 'dips'], reps: { 'pushup-0': 12 } }
  ];

  it('holt für jede Übung ihre jeweils jüngste Einheit', () => {
    /* dips kommt in der jüngeren Einheit vor, aber ohne Zahlen – der Wert
       muss aus der älteren stammen, nicht wegfallen. */
    expect(lastRepsByExercise(log, ['pushup', 'dips'])).toEqual({
      pushup: { d: '2026-07-05', reps: [12], lvl: null },
      dips: { d: '2026-07-01', reps: [5], lvl: null }
    });
  });

  it('lässt nie trainierte Übungen einfach weg', () => {
    expect(lastRepsByExercise(log, ['unbekannt'])).toEqual({});
  });

  it('hört auf zu suchen, sobald alles gefunden ist', () => {
    /* Der Grund für die Sammelabfrage: renderWorkout() läuft bei jeder
       Interaktion, das Log fasst bis zu 2000 Einträge. Ein Proxy zählt die
       tatsächlich betrachteten Einträge. */
    const besucht = new Set();
    const lang = Array.from({ length: 500 }, (_, i) => ({
      d: '2026-01-01', day: 'A', ex: ['pushup'], reps: { 'pushup-0': i }
    })).map(e => new Proxy(e, { get(t, k){ besucht.add(t); return t[k]; } }));

    expect(lastRepsByExercise(lang, ['pushup']).pushup.reps).toEqual([499]);
    expect(besucht.size).toBe(1);
  });

  it('kommt mit unbrauchbaren Eingaben zurecht', () => {
    expect(lastRepsByExercise(null, ['pushup'])).toEqual({});
    expect(lastRepsByExercise(log, null)).toEqual({});
    expect(lastRepsByExercise(log, [])).toEqual({});
  });
});

describe('letztesDatumJeUebung', () => {
  it('nennt je Übung das jüngste Datum', () => {
    const out = letztesDatumJeUebung([
      { d: '2026-07-01', day: 'A', ex: ['pushup', 'dips'] },
      { d: '2026-07-20', day: 'A', ex: ['pushup'] },
      { d: '2026-07-10', day: 'B', ex: ['row'] }
    ]);
    expect(out).toEqual({ pushup: '2026-07-20', dips: '2026-07-01', row: '2026-07-10' });
  });

  /* Nicht die Reihenfolge im Log entscheidet, sondern das Datum: ein
     CSV-Import kann ältere Einheiten hinten angehängt haben. */
  it('lässt sich von der Reihenfolge im Log nicht täuschen', () => {
    const out = letztesDatumJeUebung([
      { d: '2026-07-20', day: 'A', ex: ['pushup'] },
      { d: '2026-01-05', day: 'A', ex: ['pushup'] }
    ]);
    expect(out.pushup).toBe('2026-07-20');
  });

  /* Anders als lastRepsByExercise() zählt hier jede Teilnahme – "wann war
     das dran" ist auch ohne notierte Wiederholungen beantwortet. */
  it('zählt eine Einheit ohne Wiederholungen mit', () => {
    const out = letztesDatumJeUebung([{ d: '2026-07-01', day: 'A', ex: ['front_lever'], reps: {} }]);
    expect(out.front_lever).toBe('2026-07-01');
  });

  it('greift für Altbestände auf Plan und Wiederholungsschlüssel zurück', () => {
    const out = letztesDatumJeUebung(
      [{ d: '2026-07-01', day: 'A', reps: { 'dips-0': 8 } }],
      key => (key === 'A' ? TAG_A : null));
    expect(out).toEqual({ pushup: '2026-07-01', squat: '2026-07-01', dips: '2026-07-01' });
  });

  it('verträgt kaputte Eingaben', () => {
    expect(letztesDatumJeUebung(null)).toEqual({});
    expect(letztesDatumJeUebung('nein')).toEqual({});
    expect(letztesDatumJeUebung([null, 5, {}, { d: 7, ex: ['x'] }])).toEqual({});
  });

  it('verändert das Log nicht', () => {
    const log = [{ d: '2026-07-01', day: 'A', ex: ['pushup'] }];
    const kopie = JSON.parse(JSON.stringify(log));
    letztesDatumJeUebung(log);
    expect(log).toEqual(kopie);
  });
});

describe('zaehleJeTag', () => {
  it('zählt die Einheiten je Plan-Tag', () => {
    expect(zaehleJeTag([
      { d: '2026-07-01', day: 'A' }, { d: '2026-07-03', day: 'B' },
      { d: '2026-07-05', day: 'A' }, { d: '2026-07-08', day: 'A' }
    ])).toEqual({ A: 3, B: 1 });
  });

  /* Genau der Vorteil gegenüber dem früheren Zähler: gelöschte Einträge,
     CSV-Importe und zusammengeführte Stände stimmen automatisch, weil
     gezählt wird, was tatsächlich dasteht. */
  it('zählt, was im Log steht – nicht mehr und nicht weniger', () => {
    const log = [{ d: '2026-07-01', day: 'A' }, { d: '2026-07-03', day: 'A' }];
    expect(zaehleJeTag(log).A).toBe(2);
    log.splice(0, 1);
    expect(zaehleJeTag(log).A).toBe(1);
  });

  it('lässt Einträge ohne brauchbaren Tag aus', () => {
    expect(zaehleJeTag([
      { d: '2026-07-01', day: 'A' }, { d: '2026-07-02' },
      { d: '2026-07-03', day: '' }, { d: '2026-07-04', day: 5 }, null, 'nein'
    ])).toEqual({ A: 1 });
  });

  it('verträgt kaputte Eingaben', () => {
    expect(zaehleJeTag(null)).toEqual({});
    expect(zaehleJeTag('nein')).toEqual({});
    expect(zaehleJeTag([])).toEqual({});
  });

  it('verändert das Log nicht', () => {
    const log = [{ d: '2026-07-01', day: 'A' }];
    const kopie = JSON.parse(JSON.stringify(log));
    zaehleJeTag(log);
    expect(log).toEqual(kopie);
  });
});

/* Seit v15 traegt ein Eintrag die Stufe je Uebung. Ohne sie hielt das
   Tagesziel nach einem Aufstieg die Zahlen der leichteren Variante fuer die
   der neuen. */
describe('lastRepsByExercise – Stufe', () => {
  it('liefert die Stufe mit, auf der die Zahlen entstanden sind', () => {
    const log = [{ d: '2026-07-05', day: 'A', ex: ['pushup'], reps: { 'pushup-0': 10 }, lv: { pushup: 3 } }];
    expect(lastRepsByExercise(log, ['pushup']).pushup).toEqual({ d: '2026-07-05', reps: [10], lvl: 3 });
  });

  it('nimmt die Stufe 0 ernst', () => {
    const log = [{ d: '2026-07-05', day: 'A', ex: ['pushup'], reps: { 'pushup-0': 10 }, lv: { pushup: 0 } }];
    expect(lastRepsByExercise(log, ['pushup']).pushup.lvl).toBe(0);
  });

  it('laesst die Stufe offen, wo der Eintrag sie nicht kennt', () => {
    const log = [{ d: '2026-07-05', day: 'A', ex: ['pushup'], reps: { 'pushup-0': 10 }, lv: { dips: 2 } }];
    expect(lastRepsByExercise(log, ['pushup']).pushup.lvl).toBeNull();
  });
});

describe('verlaufJeUebung', () => {
  const eintrag = (d, reps, lvl) => ({ d, day: 'A', ex: ['pushup'], reps: { 'pushup-0': reps }, lv: { pushup: lvl } });

  it('sammelt die letzten Einheiten neueste zuerst', () => {
    const log = [eintrag('2026-07-01', 5, 1), eintrag('2026-07-03', 6, 1), eintrag('2026-07-05', 7, 2)];
    expect(verlaufJeUebung(log, ['pushup'], 2).pushup).toEqual([
      { d: '2026-07-05', reps: [7], sek: [], lvl: 2 },
      { d: '2026-07-03', reps: [6], sek: [], lvl: 1 }
    ]);
  });

  it('ueberspringt Einheiten ohne Zahlen und laesst Uebungen ohne Zahlen weg', () => {
    const ohne = { d: '2026-07-04', day: 'A', ex: ['pushup', 'dips'], reps: {} };
    const log = [eintrag('2026-07-01', 5, 1), ohne];
    expect(verlaufJeUebung(log, ['pushup', 'dips'], 2)).toEqual({
      pushup: [{ d: '2026-07-01', reps: [5], sek: [], lvl: 1 }]
    });
  });

  it('liefert fuer eine unsinnige Anzahl nichts', () => {
    expect(verlaufJeUebung([eintrag('2026-07-01', 5, 1)], ['pushup'], 0)).toEqual({});
    expect(verlaufJeUebung(null, ['pushup'], 2)).toEqual({});
  });
});

/* Seit v16 stehen die gehaltenen Sekunden einer Halteuebung in log[].sek. */
describe('Haltezeiten im Log', () => {
  const halt = (d, sek, lvl) => ({ d, day: 'A', ex: ['lever'], reps: {}, sek, lv: { lever: lvl } });

  it('liest die Sekunden eines Eintrags nach Satz', () => {
    expect(sekOf({ sek: { 'lever-1': 12, 'lever-0': 15, 'andere-0': 9 } }, 'lever')).toEqual([15, 12]);
    expect(sekOf({}, 'lever')).toEqual([]);
  });

  it('nimmt Haltezeiten in den Verlauf auf', () => {
    const log = [halt('2026-07-01', { 'lever-0': 12 }, 0)];
    expect(verlaufJeUebung(log, ['lever'], 1).lever).toEqual([
      { d: '2026-07-01', reps: [], sek: [12], lvl: 0 }
    ]);
  });

  it('haelt lastRepsByExercise bei Wiederholungen', () => {
    /* Die Zeile "Letztes Mal" fuer Wiederholungen darf keine Sekunden
       als Wiederholungen ausgeben. */
    const log = [halt('2026-07-01', { 'lever-0': 12 }, 0)];
    expect(lastRepsByExercise(log, ['lever'])).toEqual({});
  });
});

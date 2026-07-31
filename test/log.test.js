import { describe, it, expect } from 'vitest';
import {
  entryExercises, entryHasExercise, repsOf, lastRepsFor, lastRepsByExercise
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
    expect(lastRepsFor(log, 'pushup')).toEqual({ d: '2026-07-05', reps: [12, 11] });
  });

  it('überspringt Einträge ohne Wiederholungen', () => {
    /* Eine Einheit, in der die Übung nur abgehakt wurde, hilft nicht weiter –
       gesucht sind Zahlen zum Vergleichen. */
    const mitLuecke = [...log, { d: '2026-07-07', day: 'A', ex: ['pushup'], reps: {} }];
    expect(lastRepsFor(mitLuecke, 'pushup')).toEqual({ d: '2026-07-05', reps: [12, 11] });
  });

  it('lässt einen bestimmten Eintrag aus', () => {
    expect(lastRepsFor(log, 'pushup', () => null, log[2]))
      .toEqual({ d: '2026-07-01', reps: [10] });
  });

  it('nutzt den Plan-Rückfall für Altbestände', () => {
    const alt = [{ d: '2026-06-01', day: 'A', reps: { 'squat-0': 20 } }];
    expect(lastRepsFor(alt, 'squat', k => (k === 'A' ? TAG_A : null)))
      .toEqual({ d: '2026-06-01', reps: [20] });
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
      pushup: { d: '2026-07-05', reps: [12] },
      dips: { d: '2026-07-01', reps: [5] }
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

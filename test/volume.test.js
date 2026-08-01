import { describe, it, expect } from 'vitest';
import { volumenJeWoche } from '../js/domain/volume.js';

const EX = {
  pushup: { id: 'pushup', cat: 'push' },
  pullup: { id: 'pullup', cat: 'pull' },
  ring_row: { id: 'ring_row', cat: 'pull' },
  lsit: { id: 'lsit', cat: 'skill' }
};
/* 2026-08-03 ist ein Montag, 2026-08-10 der darauffolgende. */
const eintrag = (d, reps, sets = 0) => ({ d, day: 'A', sets, tops: 0, ups: [], ex: [], reps });

describe('volumenJeWoche', () => {
  it('summiert die Wiederholungen je Woche', () => {
    const out = volumenJeWoche([
      eintrag('2026-08-03', { 'pushup-0': 10, 'pushup-1': 8 }),
      eintrag('2026-08-05', { 'pushup-0': 12 }),
      eintrag('2026-08-10', { 'pushup-0': 5 })
    ], EX);
    const wochen = Object.keys(out).sort();
    expect(wochen).toHaveLength(2);
    expect(out[wochen[0]].reps).toBe(30);
    expect(out[wochen[1]].reps).toBe(5);
  });

  /* Der Grund fuer die Umstellung: 4 × 5 und 4 × 15 hatten dieselbe Satzzahl
     und sahen im alten Diagramm gleich aus. */
  it('unterscheidet, was die Satzzahl nicht unterscheidet', () => {
    const leicht = volumenJeWoche([eintrag('2026-08-03', { 'pushup-0': 5, 'pushup-1': 5 }, 2)], EX);
    const schwer = volumenJeWoche([eintrag('2026-08-03', { 'pushup-0': 15, 'pushup-1': 15 }, 2)], EX);
    const w = Object.keys(leicht)[0];
    expect(leicht[w].saetze).toBe(schwer[w].saetze);
    expect(leicht[w].reps).toBe(10);
    expect(schwer[w].reps).toBe(30);
  });

  it('teilt nach Kategorie auf', () => {
    const out = volumenJeWoche([
      eintrag('2026-08-03', { 'pushup-0': 10, 'pullup-0': 4, 'ring_row-0': 8 })
    ], EX);
    const w = Object.keys(out)[0];
    expect(out[w].jeKat).toEqual({ push: 10, pull: 12 });
  });

  /* Die ID kann selbst Bindestriche haben – getrennt wird am letzten. */
  it('liest die Uebung vor dem letzten Bindestrich', () => {
    const out = volumenJeWoche([eintrag('2026-08-03', { 'ring_row-2': 9 })], EX);
    expect(Object.values(out)[0].jeKat).toEqual({ pull: 9 });
  });

  it('zaehlt die Saetze weiter mit', () => {
    const out = volumenJeWoche([eintrag('2026-08-03', {}, 12)], EX);
    const w = Object.keys(out)[0];
    expect(out[w].saetze).toBe(12);
    expect(out[w].reps).toBe(0);
  });

  it('ignoriert leere, negative und unlesbare Werte', () => {
    const out = volumenJeWoche([
      eintrag('2026-08-03', { 'pushup-0': 0, 'pushup-1': null, 'pushup-2': -5, 'pushup-3': 'viel', 'pushup-4': 7 })
    ], EX);
    const w = Object.keys(out)[0];
    expect(out[w].reps).toBe(7);
  });

  it('laesst unbekannte Uebungen aus der Aufteilung, nicht aus der Summe', () => {
    const out = volumenJeWoche([eintrag('2026-08-03', { 'gibtsnicht-0': 6, 'pushup-0': 4 })], EX);
    const w = Object.keys(out)[0];
    expect(out[w].reps).toBe(10);
    expect(out[w].jeKat).toEqual({ push: 4 });
  });

  it('vertraegt kaputte Eingaben', () => {
    expect(volumenJeWoche(null)).toEqual({});
    expect(volumenJeWoche('nein')).toEqual({});
    expect(volumenJeWoche([null, 42, {}, { d: 5 }])).toEqual({});
    expect(volumenJeWoche([eintrag('2026-08-03', null)], EX)).toEqual({
      '2026-KW32': { reps: 0, saetze: 0, jeKat: {} }
    });
  });

  it('kommt ohne Uebungsliste aus', () => {
    const out = volumenJeWoche([eintrag('2026-08-03', { 'pushup-0': 10 })]);
    const w = Object.keys(out)[0];
    expect(out[w].reps).toBe(10);
    expect(out[w].jeKat).toEqual({});
  });

  it('veraendert das Log nicht', () => {
    const log = [eintrag('2026-08-03', { 'pushup-0': 10 }, 3)];
    const kopie = JSON.parse(JSON.stringify(log));
    volumenJeWoche(log, EX);
    expect(log).toEqual(kopie);
  });
});

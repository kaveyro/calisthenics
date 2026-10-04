import { describe, it, expect } from 'vitest';
import { EXERCISES, MUSKELN } from '../js/exercises.js';

/* Die Muskeln je Übung (exercises.js, Feld muskeln). Geprüft wird die Form,
   nicht die Anatomie: jede Übung nennt mindestens einen Hauptmuskel, nur
   bekannte Kennungen, keinen doppelt. Die Übersetzung prüft i18n.test.js. */
describe('Muskeln je Übung', () => {
  it('nennt bei jeder Übung mindestens einen Hauptmuskel', () => {
    const ohne = EXERCISES.filter(e => !e.muskeln || !Array.isArray(e.muskeln.haupt) || !e.muskeln.haupt.length).map(e => e.id);
    expect(ohne).toEqual([]);
  });

  it('verwendet nur Kennungen aus MUSKELN', () => {
    const fremd = EXERCISES.flatMap(e => [...e.muskeln.haupt, ...e.muskeln.neben]
      .filter(k => !Object.hasOwn(MUSKELN, k)).map(k => e.id + ':' + k));
    expect(fremd).toEqual([]);
  });

  it('fuehrt keinen Muskel doppelt', () => {
    const doppelt = EXERCISES.filter(e => {
      const alle = [...e.muskeln.haupt, ...e.muskeln.neben];
      return new Set(alle).size !== alle.length;
    }).map(e => e.id);
    expect(doppelt).toEqual([]);
  });

  it('hat keine Muskelgruppe ohne Übung', () => {
    const benutzt = new Set(EXERCISES.flatMap(e => [...e.muskeln.haupt, ...e.muskeln.neben]));
    expect(Object.keys(MUSKELN).filter(k => !benutzt.has(k))).toEqual([]);
  });
});

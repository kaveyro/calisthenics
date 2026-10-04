import { describe, it, expect } from 'vitest';
import { fokusStart, fokusNachSatz, spaeterOrdnen } from '../js/domain/fokus.js';

const schritte = (...fertig) => fertig.map(f => ({ fertig: f }));

describe('fokusStart', () => {
  it('beginnt beim ersten offenen Schritt', () => {
    expect(fokusStart(schritte(false, false))).toBe(0);
    expect(fokusStart(schritte(true, true, false, false))).toBe(2);
  });

  it('bleibt beim letzten, wenn alles fertig ist, und kennt keine leere Liste', () => {
    expect(fokusStart(schritte(true, true, true))).toBe(2);
    expect(fokusStart([])).toBe(0);
    expect(fokusStart(null)).toBe(0);
  });
});

describe('fokusNachSatz', () => {
  it('bleibt, solange der aktuelle Schritt offen ist', () => {
    expect(fokusNachSatz(schritte(true, false, false), 1)).toBe(1);
  });

  it('geht zum naechsten offenen dahinter', () => {
    expect(fokusNachSatz(schritte(false, true, true, false), 1)).toBe(3);
  });

  it('holt einen ausgelassenen Schritt davor nach, wenn dahinter nichts mehr offen ist', () => {
    expect(fokusNachSatz(schritte(false, true, true), 2)).toBe(0);
  });

  it('bleibt stehen, wenn alles fertig ist, und faengt Unsinn ab', () => {
    expect(fokusNachSatz(schritte(true, true), 1)).toBe(1);
    expect(fokusNachSatz(schritte(true, false), 9)).toBe(1);
    expect(fokusNachSatz(schritte(false, true), 'x')).toBe(0);
    expect(fokusNachSatz([], 3)).toBe(0);
  });
});

describe('spaeterOrdnen', () => {
  const tag = ['a', 'b', 'c', 'd', 'e'];
  it('laesst die Reihenfolge ohne Verschobene, wie sie ist', () => {
    expect(spaeterOrdnen(tag, [], [])).toEqual(tag);
    expect(spaeterOrdnen(tag)).toEqual(tag);
  });
  it('stellt Verschobene ans Ende, in der Folge des Verschiebens', () => {
    expect(spaeterOrdnen(tag, ['b'], [])).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(spaeterOrdnen(tag, ['d', 'a'], [])).toEqual(['b', 'c', 'e', 'd', 'a']);
  });
  it('haelt ein Supersatz-Paar beisammen, egal welcher Teil verschoben wird', () => {
    expect(spaeterOrdnen(tag, ['b'], [['b', 'c']])).toEqual(['a', 'd', 'e', 'b', 'c']);
    expect(spaeterOrdnen(tag, ['c'], [['b', 'c']])).toEqual(['a', 'd', 'e', 'b', 'c']);
  });
  it('uebergeht Kennungen, die heute nicht im Plan stehen', () => {
    expect(spaeterOrdnen(tag, ['x', 'a'], [])).toEqual(['b', 'c', 'd', 'e', 'a']);
  });
  it('veraendert die Eingaben nicht', () => {
    const ids = [...tag], sp = ['a'];
    spaeterOrdnen(ids, sp, []);
    expect(ids).toEqual(tag);
    expect(sp).toEqual(['a']);
  });
});

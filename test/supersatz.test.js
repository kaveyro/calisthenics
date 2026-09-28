import { describe, it, expect } from 'vitest';
import { gueltigePaare, partnerVon, paarUmschalten, pauseNachSatz, MAX_PAARE } from '../js/domain/supersatz.js';

const tag = (ex, ss) => ({ key: 'A', title: 'A', sub: '', ex, ss });

describe('gueltigePaare', () => {
  it('nimmt nur Paare, deren zweite Uebung direkt folgt', () => {
    const d = tag(['a', 'b', 'c', 'd'], [['a', 'b'], ['b', 'c'], ['a', 'c'], ['c', 'd']]);
    /* b steht schon im ersten Paar, a und c sind keine Nachbarn. */
    expect(gueltigePaare(d)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('verwirft Unbrauchbares', () => {
    expect(gueltigePaare(tag(['a', 'b'], [['a', 'a'], ['a'], 'ab', [1, 2], ['x', 'b'], null]))).toEqual([]);
    expect(gueltigePaare(tag(['a', 'b']))).toEqual([]);
    expect(gueltigePaare(null)).toEqual([]);
  });

  it('kappt bei der Hoechstzahl', () => {
    const ex = [...Array(30)].map((_, i) => 'e' + i);
    const ss = [...Array(15)].map((_, i) => [ex[2 * i], ex[2 * i + 1]]);
    expect(gueltigePaare(tag(ex, ss))).toHaveLength(MAX_PAARE);
  });
});

describe('partnerVon und paarUmschalten', () => {
  const d = tag(['a', 'b', 'c', 'd'], [['a', 'b']]);

  it('findet den Partner von beiden Seiten', () => {
    expect(partnerVon(gueltigePaare(d), 'a')).toEqual({ partner: 'b', erster: true });
    expect(partnerVon(gueltigePaare(d), 'b')).toEqual({ partner: 'a', erster: false });
    expect(partnerVon(gueltigePaare(d), 'c')).toBeNull();
    expect(partnerVon(null, 'a')).toBeNull();
  });

  it('bildet ein Paar mit der naechsten und loest es wieder', () => {
    expect(paarUmschalten(d, 2)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(paarUmschalten(d, 1)).toEqual([]);
    expect(paarUmschalten(d, 0)).toEqual([]);
  });

  it('bildet keines mit der letzten oder mit einer schon gepaarten', () => {
    expect(paarUmschalten(d, 3)).toEqual([['a', 'b']]);
    expect(paarUmschalten(tag(['x', 'a', 'b'], [['a', 'b']]), 0)).toEqual([['a', 'b']]);
    expect(paarUmschalten(d, 9)).toEqual([['a', 'b']]);
  });
});

describe('pauseNachSatz', () => {
  const erledigt = done => (id, s) => done.includes(id + s);
  const saetze = n => id => n[id];

  it('geht ohne Pause zum Partner, solange er den Satz noch vor sich hat', () => {
    expect(pauseNachSatz('b', 0, erledigt([]), saetze({ b: 4 }))).toEqual({ weiter: 'b', gemeinsam: false });
  });

  it('macht nach der Runde die gemeinsame Pause', () => {
    expect(pauseNachSatz('b', 0, erledigt(['b0']), saetze({ b: 4 }))).toEqual({ weiter: null, gemeinsam: true });
  });

  it('macht die eigene Pause, wenn der Partner weniger Saetze hat', () => {
    expect(pauseNachSatz('b', 3, erledigt([]), saetze({ b: 3 }))).toEqual({ weiter: null, gemeinsam: false });
  });

  it('sagt ohne Partner nichts', () => {
    expect(pauseNachSatz(null, 0, erledigt([]), saetze({}))).toEqual({ weiter: null, gemeinsam: false });
  });
});

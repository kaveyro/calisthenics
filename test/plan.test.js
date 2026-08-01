import { describe, it, expect } from 'vitest';
import { tagFuerWochentag, naechsteTermine } from '../js/domain/plan.js';

/* 2026-08-03 ist ein Montag. 0 = Sonntag … 6 = Samstag (Date.getDay). */
const MO_MI_FR = { 1: 'A', 3: 'B', 5: 'A' };

describe('tagFuerWochentag', () => {
  it('nennt den zugeordneten Tag', () => {
    expect(tagFuerWochentag(MO_MI_FR, '2026-08-03')).toBe('A');   /* Mo */
    expect(tagFuerWochentag(MO_MI_FR, '2026-08-05')).toBe('B');   /* Mi */
    expect(tagFuerWochentag(MO_MI_FR, '2026-08-07')).toBe('A');   /* Fr */
  });

  it('liefert null an einem Tag ohne Zuordnung', () => {
    expect(tagFuerWochentag(MO_MI_FR, '2026-08-04')).toBe(null);  /* Di */
    expect(tagFuerWochentag(MO_MI_FR, '2026-08-09')).toBe(null);  /* So */
  });

  it('behandelt Sonntag als 0', () => {
    expect(tagFuerWochentag({ 0: 'C' }, '2026-08-09')).toBe('C');
  });

  /* Leer heißt "kein fester Rhythmus" – dann bleibt es bei der Rotation. */
  it('liefert null ohne Wochenplan', () => {
    expect(tagFuerWochentag({}, '2026-08-03')).toBe(null);
    expect(tagFuerWochentag(null, '2026-08-03')).toBe(null);
  });

  it('verträgt kaputte Eingaben', () => {
    expect(tagFuerWochentag(MO_MI_FR, 'irgendwas')).toBe(null);
    expect(tagFuerWochentag(MO_MI_FR, '')).toBe(null);
    expect(tagFuerWochentag(MO_MI_FR, null)).toBe(null);
    expect(tagFuerWochentag({ 1: '' }, '2026-08-03')).toBe(null);
    expect(tagFuerWochentag({ 1: 7 }, '2026-08-03')).toBe(null);
  });
});

describe('naechsteTermine', () => {
  it('zählt den Starttag mit', () => {
    expect(naechsteTermine(MO_MI_FR, '2026-08-03', 1)).toEqual([{ d: '2026-08-03', key: 'A' }]);
  });

  it('liefert die Termine eines Zeitraums in Reihenfolge', () => {
    expect(naechsteTermine(MO_MI_FR, '2026-08-03', 7)).toEqual([
      { d: '2026-08-03', key: 'A' },
      { d: '2026-08-05', key: 'B' },
      { d: '2026-08-07', key: 'A' }
    ]);
  });

  it('läuft über den Monatswechsel', () => {
    const t = naechsteTermine({ 1: 'A' }, '2026-08-29', 5);
    expect(t).toEqual([{ d: '2026-08-31', key: 'A' }]);
  });

  /* Nicht über toISOString rechnen: je nach Zeitzone rutscht das Datum
     sonst auf den Vor- oder Folgetag. */
  it('bleibt beim lokalen Datum', () => {
    const t = naechsteTermine({ 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 0: 'G' },
      '2026-08-03', 7);
    expect(t.map(x => x.d)).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
      '2026-08-07', '2026-08-08', '2026-08-09'
    ]);
  });

  it('liefert nichts ohne Wochenplan oder ohne Zeitraum', () => {
    expect(naechsteTermine({}, '2026-08-03', 30)).toEqual([]);
    expect(naechsteTermine(null, '2026-08-03', 30)).toEqual([]);
    expect(naechsteTermine(MO_MI_FR, '2026-08-03', 0)).toEqual([]);
    expect(naechsteTermine(MO_MI_FR, '2026-08-03', -5)).toEqual([]);
  });

  it('verträgt kaputte Eingaben', () => {
    expect(naechsteTermine(MO_MI_FR, 'kein Datum', 7)).toEqual([]);
    expect(naechsteTermine(MO_MI_FR, '2026-08-03', 'viele')).toEqual([]);
  });

  /* Eine Obergrenze, damit ein verbogener Wert keine Endlosschleife wird. */
  it('kappt einen absurd langen Zeitraum', () => {
    expect(naechsteTermine({ 1: 'A' }, '2026-08-03', 100000).length).toBeLessThan(100);
  });
});

import { describe, it, expect } from 'vitest';
import { parseTarget } from '../js/domain/target.js';

describe('parseTarget', () => {
  it('liest Sätze und Wiederholungsbereich', () => {
    expect(parseTarget('4 × 6–10')).toMatchObject({ sets: 4, minReps: 6, maxReps: 10, isHold: false });
  });

  it('behandelt eine feste Wiederholungszahl als Bereich der Breite null', () => {
    expect(parseTarget('3 × 8')).toMatchObject({ minReps: 8, maxReps: 8 });
  });

  it('erkennt Halteübungen und nimmt den oberen Wert als Countdown', () => {
    expect(parseTarget('4 × 10–20 Sek')).toMatchObject({
      sets: 4, isHold: true, holdSecs: 20, minReps: null, maxReps: null
    });
  });

  it('nimmt bei einer einzelnen Sekundenangabe genau diese', () => {
    expect(parseTarget('2 × 60 Sek')).toMatchObject({ isHold: true, holdSecs: 60 });
  });

  /* Regression: '4 × 5–8 Versuche' lieferte mit dem auf das Zeilenende
     verankerten Muster keine Wiederholungszahl. Fuer die Handstand-Kick-ups
     erschienen deshalb weder Eingabefelder noch PR-Erfassung. */
  it('toleriert eine nachgestellte Einheit', () => {
    expect(parseTarget('4 × 5–8 Versuche')).toMatchObject({ sets: 4, minReps: 5, maxReps: 8, isHold: false });
    expect(parseTarget('5 × 3–5 Versuche')).toMatchObject({ sets: 5, minReps: 3, maxReps: 5 });
    expect(parseTarget('3 × 8–12 Wdh')).toMatchObject({ minReps: 8, maxReps: 12 });
  });

  /* Die Daten nutzen den Halbgeviertstrich; ein normaler Bindestrich fiel
     frueher stillschweigend durch. */
  it('akzeptiert Bindestrich wie Halbgeviertstrich', () => {
    expect(parseTarget('3 × 8-12')).toEqual(parseTarget('3 × 8–12'));
    expect(parseTarget('4 × 10-20 Sek')).toEqual(parseTarget('4 × 10–20 Sek'));
  });

  describe('setsMode', () => {
    it('deckelt im leichten Modus auf drei Sätze', () => {
      expect(parseTarget('5 × 8–12', 'light').sets).toBe(3);
      expect(parseTarget('2 × 8–12', 'light').sets).toBe(2);   /* nie erhöhen */
    });
    it('legt im harten Modus einen Satz drauf', () => {
      expect(parseTarget('4 × 8–12', 'hard').sets).toBe(5);
    });
    it('lässt den Standard unverändert', () => {
      expect(parseTarget('4 × 8–12', 'standard').sets).toBe(4);
      expect(parseTarget('4 × 8–12').sets).toBe(4);
    });
  });

  it('fällt ohne Satzangabe auf drei Sätze zurück', () => {
    expect(parseTarget('8–12').sets).toBe(3);
  });

  it('verarbeitet leere und ungültige Eingaben ohne Fehler', () => {
    expect(parseTarget('')).toMatchObject({ sets: 3, isHold: false, minReps: null });
    expect(parseTarget(null)).toMatchObject({ sets: 3 });
    expect(parseTarget(undefined)).toMatchObject({ sets: 3 });
  });
});

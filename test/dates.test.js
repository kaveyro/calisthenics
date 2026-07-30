import { describe, it, expect } from 'vitest';
import { isoDaysAgo, today, fmtDate, isoWeek, calcGlobalStreak } from '../js/domain/dates.js';

/* Fester Bezugspunkt statt der echten Uhr – die Tests sollen nicht davon
   abhaengen, wann sie laufen. */
const NOW = new Date(2026, 6, 29, 14, 30);   /* Mi, 29.07.2026, lokale Zeit */

describe('isoDaysAgo / today', () => {
  it('liefert das lokale Datum, nicht das UTC-Datum', () => {
    /* Bei einem naiven toISOString() waere hier je nach Zeitzone der 28. */
    expect(isoDaysAgo(0, NOW)).toBe('2026-07-29');
    expect(today(NOW)).toBe('2026-07-29');
  });

  it('rechnet Tage korrekt zurück', () => {
    expect(isoDaysAgo(1, NOW)).toBe('2026-07-28');
    expect(isoDaysAgo(29, NOW)).toBe('2026-06-30');   /* über den Monatswechsel */
  });

  it('rechnet über den Jahreswechsel', () => {
    expect(isoDaysAgo(1, new Date(2026, 0, 1, 12))).toBe('2025-12-31');
  });

  it('behandelt den 29. Februar eines Schaltjahres', () => {
    expect(isoDaysAgo(1, new Date(2024, 2, 1, 12))).toBe('2024-02-29');
  });
});

describe('fmtDate', () => {
  it('formatiert ISO nach deutschem Kurzformat', () => {
    expect(fmtDate('2026-07-29')).toBe('29.07.26');
    expect(fmtDate('2025-01-05')).toBe('05.01.25');
  });
  it('liefert bei leerer oder unvollständiger Eingabe einen leeren String', () => {
    expect(fmtDate('')).toBe('');
    expect(fmtDate(null)).toBe('');
    expect(fmtDate('kaputt')).toBe('');
  });
});

describe('isoWeek', () => {
  it('ordnet einen Tag der richtigen Kalenderwoche zu', () => {
    expect(isoWeek('2026-07-29')).toBe('2026-KW31');
  });

  /* Die Woche gehoert zu dem Jahr, in dem ihr Donnerstag liegt. */
  it('ordnet den Jahreswechsel nach ISO-8601 zu', () => {
    expect(isoWeek('2024-12-30')).toBe('2025-KW01');   /* Mo der KW1/2025 */
    expect(isoWeek('2021-01-01')).toBe('2020-KW53');   /* Fr in KW53/2020 */
  });

  it('liefert bei ungültigem Datum einen leeren String statt NaN-KWNaN', () => {
    expect(isoWeek('01.02.2026')).toBe('');
    expect(isoWeek('quatsch')).toBe('');
  });
});

describe('calcGlobalStreak', () => {
  const log = ds => ds.map(d => ({ d }));

  it('zählt aufeinanderfolgende Tage ab heute', () => {
    expect(calcGlobalStreak(log(['2026-07-29', '2026-07-28', '2026-07-27']), NOW)).toBe(3);
  });

  /* Regression: der Anker war fest auf heute gesetzt, wodurch eine laufende
     Serie jeden Morgen auf 0 fiel und aus dem Kopfbereich verschwand. */
  it('zählt weiter, wenn heute noch nicht trainiert wurde', () => {
    expect(calcGlobalStreak(log(['2026-07-28', '2026-07-27', '2026-07-26']), NOW)).toBe(3);
  });

  it('endet bei einer Lücke', () => {
    expect(calcGlobalStreak(log(['2026-07-29', '2026-07-27', '2026-07-26']), NOW)).toBe(1);
  });

  it('ist 0, wenn der letzte Eintrag älter als gestern ist', () => {
    expect(calcGlobalStreak(log(['2026-07-20']), NOW)).toBe(0);
  });

  it('zählt mehrere Einheiten am selben Tag nur einmal', () => {
    expect(calcGlobalStreak(log(['2026-07-29', '2026-07-29', '2026-07-28']), NOW)).toBe(2);
  });

  it('kommt mit leerem oder fehlendem Log zurecht', () => {
    expect(calcGlobalStreak([], NOW)).toBe(0);
    expect(calcGlobalStreak(null, NOW)).toBe(0);
    expect(calcGlobalStreak(undefined, NOW)).toBe(0);
    expect(calcGlobalStreak([{}, { d: null }], NOW)).toBe(0);
  });
});

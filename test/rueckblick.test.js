import { describe, it, expect } from 'vitest';
import { wochenRueckblick, wochenSumme } from '../js/domain/rueckblick.js';

/* Montag, 28. September 2026 – KW 40. Die letzte volle Woche ist KW 39
   (21.–27.9.), die davor KW 38 (14.–20.9.). */
const JETZT = new Date('2026-09-28T09:00:00');
const e = (d, extra = {}) => ({ d, day: 'A', ex: ['pushup'], sets: 4, reps: {}, ups: [], dauer: 0, ...extra });

describe('wochenRueckblick', () => {
  it('fasst die letzte volle Woche zusammen und stellt die davor daneben', () => {
    const log = [
      e('2026-09-15', { reps: { 'pushup-0': 10 }, dauer: 1800 }),
      e('2026-09-21', { reps: { 'pushup-0': 12, 'pushup-1': 11 }, dauer: 2000, ups: ['pushup'] }),
      e('2026-09-27', { sets: 6, sek: { 'plank-0': 30 }, ups: ['pushup', 'plank'] }),
      /* Heute zaehlt nicht mit, sie gehoert zur neuen Woche. */
      e('2026-09-28', { sets: 99 })
    ];
    const r = wochenRueckblick(log, JETZT);
    expect(r).toMatchObject({ woche: '2026-KW39', davor: '2026-KW38', einheiten: 2, saetze: 10, wdh: 23, sek: 30, dauer: 2000 });
    /* Jeder Aufstieg einmal, in der Reihenfolge des Logs. */
    expect(r.ups).toEqual(['pushup', 'plank']);
    expect(r.vorwoche).toMatchObject({ einheiten: 1, saetze: 4, wdh: 10, dauer: 1800 });
  });

  it('sagt ohne Training in der letzten Woche nichts', () => {
    expect(wochenRueckblick([e('2026-09-15'), e('2026-09-28')], JETZT)).toBeNull();
    expect(wochenRueckblick([], JETZT)).toBeNull();
    expect(wochenRueckblick(null, JETZT)).toBeNull();
  });

  it('vergleicht nicht mit einer leeren Woche davor', () => {
    expect(wochenRueckblick([e('2026-09-22')], JETZT).vorwoche).toBeNull();
  });

  it('uebergeht Unbrauchbares', () => {
    const r = wochenRueckblick([null, { d: 5 }, e('2026-09-22', { sets: -3, dauer: NaN, reps: { a: -1, b: 4 }, ups: [7, 'x'] })], JETZT);
    expect(r).toMatchObject({ einheiten: 1, saetze: 0, wdh: 4, dauer: 0, ups: ['x'] });
    expect(wochenSumme(null)).toEqual({ einheiten: 0, saetze: 0, wdh: 0, sek: 0, dauer: 0, ups: [] });
  });
});

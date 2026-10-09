import { describe, it, expect } from 'vitest';
import { tagFuerWochentag, naechsteTermine, wochentageVorschlag, wochenStand } from '../js/domain/plan.js';
import { AUFTEILUNG } from '../js/domain/planbuilder.js';

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

describe('wochentageVorschlag', () => {
  it('verteilt drei Tage auf Montag, Mittwoch und Freitag', () => {
    expect(wochentageVorschlag(['A', 'B', 'C'])).toEqual({ 1: 'A', 3: 'B', 5: 'C' });
  });

  it('laesst zwischen zwei Tagen mindestens einen Ruhetag, solange es geht', () => {
    for(const n of [2, 3]){
      const tage = Object.keys(wochentageVorschlag(Array.from({ length: n }, (_, i) => 'T' + i))).map(Number);
      tage.slice(1).forEach((t, i) => expect(t - tage[i]).toBeGreaterThanOrEqual(2));
    }
  });

  /* Die Aufteilung des Generators: derselbe Tagestyp nie an zwei
     aufeinanderfolgenden Tagen, auch nicht ueber das Wochenende. */
  it('legt nie zwei gleiche Tagestypen des Generators hintereinander', () => {
    for(const [n, arten] of Object.entries(AUFTEILUNG)){
      const keys = arten.map((_, i) => String(i));
      const plan = wochentageVorschlag(keys);
      expect(Object.keys(plan)).toHaveLength(Number(n));
      /* okA und okB sind derselbe Typ, push und pull nicht. */
      const typ = wd => { const k = plan[String(wd % 7)]; return k === undefined ? null : arten[Number(k)].replace(/[ABC]$/, ''); };
      for(let wd = 0; wd < 7; wd++){
        const a = typ(wd), b = typ(wd + 1);
        if(a && b) expect(a, n + ' Tage, Wochentag ' + wd).not.toBe(b);
      }
    }
  });

  it('gibt ohne passende Tageszahl keinen Rhythmus', () => {
    expect(wochentageVorschlag([])).toEqual({});
    expect(wochentageVorschlag(['A', 'B', 'C', 'D', 'E', 'F', 'G'])).toEqual({});
    expect(wochentageVorschlag(null)).toEqual({});
    expect(wochentageVorschlag(['A', '', 3])).toEqual({ 1: 'A' });
  });
});

describe('wochenStand', () => {
  /* 2026-10-07 ist ein Mittwoch. */
  const HEUTE = '2026-10-07';
  it('liefert Montag bis Sonntag der laufenden Woche', () => {
    const w = wochenStand([], {}, HEUTE);
    expect(w.map(t => t.d)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(w.map(t => t.heute)).toEqual([false, false, true, false, false, false, false]);
  });
  it('markiert trainierte Tage, auch bei zwei Einheiten an einem Tag nur einmal', () => {
    const log = [{ d: '2026-10-05' }, { d: '2026-10-07' }, { d: '2026-10-07' }, { d: '2026-09-30' }];
    expect(wochenStand(log, {}, HEUTE).map(t => t.trainiert)).toEqual([true, false, true, false, false, false, false]);
  });
  it('markiert die Tage des Wochenrhythmus als geplant', () => {
    const w = wochenStand([], { 1: 'A', 4: 'B', 0: 'A' }, HEUTE);
    expect(w.map(t => t.geplant)).toEqual([true, false, false, true, false, false, true]);
  });
  it('beginnt auch am Sonntag beim Montag davor', () => {
    expect(wochenStand([], {}, '2026-10-11')[0].d).toBe('2026-10-05');
  });
  it('liefert bei kaputtem Datum nichts', () => {
    expect(wochenStand([], {}, 'quatsch')).toEqual([]);
    expect(wochenStand(null, null, HEUTE)).toHaveLength(7);
  });
});

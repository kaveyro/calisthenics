import { describe, it, expect } from 'vitest';
import { treppenPfad } from '../js/domain/diagramm.js';
import { stufenVerlauf } from '../js/domain/log.js';

describe('stufenVerlauf', () => {
  it('liest die Stufe je Eintrag, aelteste zuerst, und setzt nach einem Aufstieg eine hoeher', () => {
    const log = [
      { d: '2026-07-10', lv: { pushup: 1 } },
      { d: '2026-07-01', lv: { pushup: 0 }, ups: ['pushup'] },
      { d: '2026-07-05', lv: { squat: 2 } }
    ];
    expect(stufenVerlauf(log, 'pushup')).toEqual([
      { d: '2026-07-01', lvl: 0 }, { d: '2026-07-01', lvl: 1 }, { d: '2026-07-10', lvl: 1 }
    ]);
  });
  it('uebergeht Eintraege ohne bekannte Stufe', () => {
    const log = [{ d: '2026-07-01', reps: { 'pushup-0': 8 } }, { d: '2026-07-02', lv: {} }, { d: '2026-07-03', lv: { pushup: 'x' } }];
    expect(stufenVerlauf(log, 'pushup')).toEqual([]);
    expect(stufenVerlauf(null, 'pushup')).toEqual([]);
  });
});

describe('treppenPfad', () => {
  const p = (d, lvl) => ({ d, lvl });
  it('geht waagerecht bis zum Wechsel, dann senkrecht, und endet am rechten Rand', () => {
    const d = treppenPfad([p('2026-07-01', 0), p('2026-07-11', 1)], { von: '2026-07-01', bis: '2026-07-21', maxLvl: 2, breite: 200, hoehe: 40, rand: 0 });
    expect(d).toBe('M0 40H100V20H200');
  });
  it('beginnt links auf der Stufe, die vor dem Zeitraum galt', () => {
    const d = treppenPfad([p('2026-06-01', 1), p('2026-07-11', 2)], { von: '2026-07-01', bis: '2026-07-21', maxLvl: 2, breite: 200, hoehe: 40, rand: 0 });
    expect(d).toBe('M0 20H100V0H200');
  });
  it('zeichnet gleiche Stufen ohne Stufe und Rueckstufungen nach unten', () => {
    const d = treppenPfad([p('2026-07-01', 2), p('2026-07-06', 2), p('2026-07-11', 1)], { von: '2026-07-01', bis: '2026-07-21', maxLvl: 2, breite: 200, hoehe: 40, rand: 0 });
    expect(d).toBe('M0 0H100V20H200');
  });
  it('liefert ohne Punkte oder mit verdrehtem Zeitraum nichts', () => {
    expect(treppenPfad([], {})).toBe('');
    expect(treppenPfad([p('2026-07-01', 0)], { von: '2026-08-01', bis: '2026-07-01' })).toBe('');
    expect(treppenPfad([p('2026-08-05', 0)], { von: '2026-07-01', bis: '2026-07-31' })).toBe('');
  });
  it('rechnet die Hoehe ohne maxLvl aus der hoechsten erreichten Stufe', () => {
    expect(treppenPfad([p('2026-07-01', 0), p('2026-07-02', 4)], { breite: 10, hoehe: 10, rand: 0 })).toBe('M0 10H10V0H10');
  });
});

import { describe, it, expect } from 'vitest';
import { WARMUP, WARMUP_WANN, WARMUP_PFLICHT, EX_BY_ID } from '../js/exercises.js';
import { tagesMerkmale, passtZumTag, anlaufSatz, BEDINGUNGEN, HANDGELENK_ROUTINE } from '../js/domain/warmup.js';

describe('Aufwaermen je Tag', () => {
  it('hat fuer jeden Punkt eine bekannte Bedingung', () => {
    expect(WARMUP_WANN).toHaveLength(WARMUP.length);
    WARMUP_WANN.forEach(w => expect(BEDINGUNGEN).toContain(w));
    /* Der Pflichtpunkt sind die Handgelenke. */
    [...WARMUP_PFLICHT].forEach(i => expect(WARMUP_WANN[i]).toBe('handgelenk'));
    expect(EX_BY_ID[HANDGELENK_ROUTINE]).toBeDefined();
  });

  it('erkennt Druecken, Ziehen und Beine am Muster', () => {
    expect(tagesMerkmale(['pushup', 'squat'], EX_BY_ID)).toEqual({ druck: true, zug: false, beine: true, routine: false });
    expect(tagesMerkmale(['pullup', 'wrist_prep'], EX_BY_ID)).toEqual({ druck: false, zug: true, beine: false, routine: true });
    /* Handstand und L-Sit belasten die Handgelenke wie Druecken. */
    expect(tagesMerkmale(['handstand'], EX_BY_ID).druck).toBe(true);
    expect(tagesMerkmale(['lsit'], EX_BY_ID).druck).toBe(true);
    expect(tagesMerkmale(['gibtsnicht'], EX_BY_ID)).toEqual({ druck: false, zug: false, beine: false, routine: false });
    expect(tagesMerkmale(null)).toEqual({ druck: false, zug: false, beine: false, routine: false });
  });

  it('entscheidet je Bedingung', () => {
    const druck = { druck: true }, zug = { zug: true }, beine = { beine: true };
    expect(passtZumTag('immer', {})).toBe(true);
    expect(passtZumTag('oben', druck)).toBe(true);
    expect(passtZumTag('oben', beine)).toBe(false);
    expect(passtZumTag('druck', zug)).toBe(false);
    expect(passtZumTag('handgelenk', druck)).toBe(true);
    expect(passtZumTag('handgelenk', { druck: true, routine: true })).toBe(false);
    expect(passtZumTag('haengen', zug, ['bar'])).toBe(true);
    expect(passtZumTag('haengen', zug, ['rings'])).toBe(true);
    expect(passtZumTag('haengen', zug, [])).toBe(false);
    expect(passtZumTag('haengen', zug, null)).toBe(false);
    /* Ohne Stange statt des Haengens die Schulterblaetter. */
    expect(passtZumTag('zugboden', zug, [])).toBe(true);
    expect(passtZumTag('zugboden', zug, null)).toBe(true);
    expect(passtZumTag('zugboden', zug, ['bar'])).toBe(false);
    expect(passtZumTag('zugboden', druck, [])).toBe(false);
    expect(passtZumTag('beine', beine)).toBe(true);
    expect(passtZumTag('beine', druck)).toBe(false);
    /* Unbekannt heisst: lieber zeigen als verschlucken. */
    expect(passtZumTag('quatsch', null)).toBe(true);
  });
});

describe('Anlaufsatz', () => {
  it('nimmt die erste Kraftuebung eine Stufe leichter mit der halben Untergrenze', () => {
    /* Liegestuetze Stufe 2 -> Stufe 1; Handgelenks-Routine zaehlt nicht. */
    const a = anlaufSatz(['wrist_prep', 'pushup', 'squat'], EX_BY_ID, { pushup: 2 });
    expect(a).toMatchObject({ id: 'pushup', stufe: 1, leichter: true, art: 'wdh' });
    expect(a.menge).toBe(Math.max(3, Math.round(EX_BY_ID.pushup.levels[1].wdh[0] / 2)));
  });

  it('bleibt auf der ersten Stufe und sagt es', () => {
    expect(anlaufSatz(['pushup'], EX_BY_ID, {})).toMatchObject({ stufe: 0, leichter: false });
    /* Eine Stufe ueber dem Katalog zaehlt als die hoechste. */
    const n = EX_BY_ID.pushup.levels.length;
    expect(anlaufSatz(['pushup'], EX_BY_ID, { pushup: 99 }).stufe).toBe(n - 2);
  });

  it('rechnet Halteuebungen in Sekunden und mit mindestens 5', () => {
    const halten = { id: 'h', cat: 'core', levels: [{ saetze: 3, sek: [6, 10] }] };
    expect(anlaufSatz(['h'], { h: halten })).toMatchObject({ art: 'sek', menge: 5 });
    const wenig = { id: 'w', cat: 'push', levels: [{ saetze: 3, wdh: [2, 4] }] };
    expect(anlaufSatz(['w'], { w: wenig }).menge).toBe(3);
  });

  it('sagt nichts ohne Kraftuebung', () => {
    const mob = Object.values(EX_BY_ID).find(e => e.cat === 'mobility');
    expect(anlaufSatz([HANDGELENK_ROUTINE, mob.id], EX_BY_ID)).toBeNull();
    expect(anlaufSatz(['gibtsnicht'], EX_BY_ID)).toBeNull();
    expect(anlaufSatz(null)).toBeNull();
    expect(anlaufSatz(['x'], { x: { id: 'x', cat: 'push', levels: [{ saetze: 3 }] } })).toBeNull();
  });
});

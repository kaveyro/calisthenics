import { describe, it, expect } from 'vitest';
import { WARMUP, WARMUP_WANN, WARMUP_PFLICHT, EX_BY_ID } from '../js/exercises.js';
import { tagesMerkmale, passtZumTag, BEDINGUNGEN, HANDGELENK_ROUTINE } from '../js/domain/warmup.js';

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
    expect(passtZumTag('beine', beine)).toBe(true);
    expect(passtZumTag('beine', druck)).toBe(false);
    /* Unbekannt heisst: lieber zeigen als verschlucken. */
    expect(passtZumTag('quatsch', null)).toBe(true);
  });
});

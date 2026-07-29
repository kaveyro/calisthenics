import { describe, it, expect } from 'vitest';
import { esc, sanitizeDayKey } from '../js/domain/escape.js';

describe('esc', () => {
  /* Diese Tests haetten gegen die urspruengliche Fassung fehlgeschlagen:
     dort waren vier der fuenf Ersetzungen Identitaetsoperationen
     (.replace(/&/g,'&')), sodass die Funktion faktisch nichts tat. */
  it('escaped alle fünf HTML-Sonderzeichen', () => {
    expect(esc('&')).toBe('&amp;');
    expect(esc('<')).toBe('&lt;');
    expect(esc('>')).toBe('&gt;');
    expect(esc('"')).toBe('&quot;');
    expect(esc("'")).toBe('&#39;');
  });

  it('entschärft ein Script-Tag', () => {
    expect(esc('<img src=x onerror=alert(1)>'))
      .toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('schließt den Ausbruch aus einem Attributwert', () => {
    expect(esc('" onfocus=alert(1) autofocus x="'))
      .toBe('&quot; onfocus=alert(1) autofocus x=&quot;');
  });

  it('escaped das kaufmännische Und zuerst, ohne doppelt zu escapen', () => {
    /* Falsche Reihenfolge ergaebe hier '&lt;lt;' */
    expect(esc('&lt;')).toBe('&amp;lt;');
  });

  it('verarbeitet Nicht-Strings ohne Fehler', () => {
    expect(esc(null)).toBe('null');
    expect(esc(42)).toBe('42');
    expect(esc(undefined)).toBe('undefined');
  });
});

describe('sanitizeDayKey', () => {
  it('behält Buchstaben, Ziffern und schlichte Trenner', () => {
    expect(sanitizeDayKey('A')).toBe('A');
    expect(sanitizeDayKey('Push_1')).toBe('Push_1');
    expect(sanitizeDayKey('Bein-A')).toBe('Bein-A');
  });

  it('behält Umlaute', () => {
    expect(sanitizeDayKey('Übung')).toBe('Übung');
  });

  it('entfernt die Zeichen eines Injektionsversuchs', () => {
    /* Diese sechs Zeichen genuegten, um aus onclick="selectDay('…')"
       auszubrechen, solange der Key dort interpoliert wurde. */
    expect(sanitizeDayKey("');x(")).toBe('x');
    expect(sanitizeDayKey('<script>')).toBe('script');
  });

  it('kürzt auf sechs Zeichen', () => {
    expect(sanitizeDayKey('ABCDEFGHIJ')).toBe('ABCDEF');
  });

  it('liefert bei leerer Eingabe einen leeren String', () => {
    expect(sanitizeDayKey(null)).toBe('');
    expect(sanitizeDayKey(undefined)).toBe('');
    expect(sanitizeDayKey('   ')).toBe('');
  });
});

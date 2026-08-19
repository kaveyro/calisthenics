import { describe, it, expect } from 'vitest';
import { wochenplanAlsIcs } from '../js/domain/ics.js';

/* Der 2026-08-17 ist ein Montag. Alle Faelle rechnen von dort, damit die
   Wochentage im Ergebnis nachpruefbar sind. */
const MONTAG = '2026-08-17';
const OPT = { von: MONTAG, stempel: '20260817T060000Z' };

const zeilen = txt => txt.split('\r\n');
const feld = (txt, name) => zeilen(txt).filter(z => z.startsWith(name + ':'));

describe('wochenplanAlsIcs – leere Faelle', () => {
  it('liefert nichts ohne Rhythmus', () => {
    expect(wochenplanAlsIcs({}, k => k, OPT)).toBe('');
    expect(wochenplanAlsIcs(null, k => k, OPT)).toBe('');
  });

  it('liefert nichts bei unbrauchbarer Uhrzeit', () => {
    ['', '25:00', '18:60', '6:00', 'abends', null].forEach(uhrzeit => {
      expect(wochenplanAlsIcs({ 1: 'A' }, k => k, { ...OPT, uhrzeit })).toBe('');
    });
  });
});

describe('wochenplanAlsIcs – Aufbau', () => {
  const ics = wochenplanAlsIcs({ 1: 'A', 3: 'B', 5: 'A' },
    k => k + ' · Tag ' + k, { ...OPT, uhrzeit: '18:30' });

  it('rahmt den Kalender vorschriftsmaessig ein', () => {
    expect(zeilen(ics)[0]).toBe('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    /* Auch die letzte Zeile endet mit CRLF. */
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('schreibt einen Termin je belegtem Wochentag', () => {
    expect(feld(ics, 'BEGIN').filter(z => z === 'BEGIN:VEVENT')).toHaveLength(3);
    expect(zeilen(ics).filter(z => z.startsWith('RRULE:'))).toEqual([
      'RRULE:FREQ=WEEKLY;BYDAY=MO',
      'RRULE:FREQ=WEEKLY;BYDAY=WE',
      'RRULE:FREQ=WEEKLY;BYDAY=FR'
    ]);
  });

  it('legt den ersten Termin auf den passenden Wochentag', () => {
    expect(zeilen(ics).filter(z => z.startsWith('DTSTART:'))).toEqual([
      'DTSTART:20260817T183000',   /* Montag */
      'DTSTART:20260819T183000',   /* Mittwoch */
      'DTSTART:20260821T183000'    /* Freitag */
    ]);
  });

  it('setzt das Ende auf Start plus Dauer', () => {
    expect(zeilen(ics)).toContain('DTEND:20260817T193000');
  });

  it('laesst die Zeit ohne Zeitzone stehen', () => {
    /* Kein abschliessendes Z und kein TZID: 18:30 heisst 18:30, wo immer
       das Geraet gerade steht. */
    zeilen(ics).filter(z => z.startsWith('DTSTART')).forEach(z => {
      expect(z).not.toContain('Z');
      expect(z).not.toContain('TZID');
    });
  });

  it('haengt eine Vorwarnung an jeden Termin', () => {
    expect(zeilen(ics).filter(z => z === 'BEGIN:VALARM')).toHaveLength(3);
    expect(zeilen(ics)).toContain('TRIGGER:-PT30M');
  });

  it('rechnet eine andere Dauer mit', () => {
    const ics = wochenplanAlsIcs({ 1: 'A' }, k => k, { ...OPT, uhrzeit: '18:30', dauerMin: 90 });
    expect(ics).toContain('DTSTART:20260817T183000');
    expect(ics).toContain('DTEND:20260817T200000');
  });

  it('faellt bei unbrauchbarer Dauer auf die Untergrenze', () => {
    const ics = wochenplanAlsIcs({ 1: 'A' }, k => k, { ...OPT, uhrzeit: '18:00', dauerMin: 'lang' });
    expect(ics).toContain('DTEND:20260817T180500');
  });

  it('nimmt ohne titelVon den Schluessel', () => {
    expect(wochenplanAlsIcs({ 1: 'A' }, undefined, OPT)).toContain('SUMMARY:A');
  });

  it('laesst die Vorwarnung auf Wunsch weg', () => {
    const ohne = wochenplanAlsIcs({ 1: 'A' }, k => k, { ...OPT, vorlaufMin: 0 });
    expect(ohne).not.toContain('VALARM');
  });

  it('vergibt je Wochentag eine feste Kennung', () => {
    const uids = zeilen(ics).filter(z => z.startsWith('UID:'));
    expect(new Set(uids).size).toBe(3);
    /* Zweimal erzeugt, zweimal dieselben – ein zweiter Import aktualisiert
       die Termine, statt sie zu verdoppeln. */
    const nochmal = wochenplanAlsIcs({ 1: 'A', 3: 'B', 5: 'A' },
      k => k + ' · Tag ' + k, { ...OPT, uhrzeit: '18:30' });
    expect(zeilen(nochmal).filter(z => z.startsWith('UID:'))).toEqual(uids);
  });
});

describe('wochenplanAlsIcs – Text', () => {
  it('maskiert Komma, Semikolon und Backslash im Titel', () => {
    const ics = wochenplanAlsIcs({ 1: 'B' }, () => 'B · Pull, Beine; Core\\Rest', OPT);
    expect(ics).toContain('SUMMARY:B · Pull\\, Beine\\; Core\\\\Rest');
  });

  it('zaehlt ein Emoji als vier Oktette', () => {
    /* Ein Zeichen ausserhalb der BMP ist in UTF-8 vier Bytes und in
       JavaScript zwei Codeeinheiten – wer in Zeichen zaehlt, faltet falsch. */
    const ics = wochenplanAlsIcs({ 1: 'A' }, () => '💪'.repeat(30), OPT);
    zeilen(ics).forEach(z => {
      const bytes = [...z].reduce((a, c) => a + (c.codePointAt(0) < 0x80 ? 1 : 4), 0);
      expect(bytes).toBeLessThanOrEqual(75);
    });
  });

  it('kommt mit einem fehlenden Titel zurecht', () => {
    expect(wochenplanAlsIcs({ 1: 'A' }, () => null, OPT)).toContain('SUMMARY:A');
  });

  it('faellt auf den Schluessel zurueck, wenn es keinen Titel gibt', () => {
    expect(wochenplanAlsIcs({ 1: 'A' }, () => '', OPT)).toContain('SUMMARY:A');
  });

  it('bricht lange Zeilen nach 75 Oktetten um', () => {
    const lang = 'Ü'.repeat(80);          /* 160 Oktette */
    const ics = wochenplanAlsIcs({ 1: 'A' }, () => lang, OPT);
    zeilen(ics).forEach(z => {
      const bytes = [...z].reduce((a, c) => {
        const cp = c.codePointAt(0);
        return a + (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);
      }, 0);
      expect(bytes).toBeLessThanOrEqual(75);
    });
    /* Die Fortsetzung beginnt mit genau einem Leerzeichen. */
    expect(ics).toMatch(/\r\n Ü/);
  });
});

describe('wochenplanAlsIcs – Zeitstempel', () => {
  it('uebernimmt einen gueltigen Stempel', () => {
    expect(wochenplanAlsIcs({ 1: 'A' }, k => k, OPT)).toContain('DTSTAMP:20260817T060000Z');
  });

  it('faellt sonst auf Mitternacht des Starttags zurueck', () => {
    ['', 'jetzt', '2026-08-17', undefined].forEach(stempel => {
      const ics = wochenplanAlsIcs({ 1: 'A' }, k => k, { von: MONTAG, stempel });
      expect(ics).toContain('DTSTAMP:20260817T000000Z');
    });
  });
});

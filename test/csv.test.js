import { describe, it, expect } from 'vitest';
import { serializeLog, parseCSV, parseLog } from '../js/domain/csv.js';

const eintrag = (over = {}) => ({ d: '2026-07-29', day: 'A', sets: 12, tops: 3, ups: [], ...over });

describe('parseCSV', () => {
  it('trennt Felder am Semikolon', () => {
    expect(parseCSV('a;b;c')).toEqual([['a', 'b', 'c']]);
  });

  it('behält Semikolons innerhalb von Anführungszeichen', () => {
    expect(parseCSV('"a;b";c')).toEqual([['a;b', 'c']]);
  });

  it('wandelt doppelte Anführungszeichen in ein einzelnes', () => {
    expect(parseCSV('"sagt ""hallo""";x')).toEqual([['sagt "hallo"', 'x']]);
  });

  it('entfernt ein führendes BOM', () => {
    expect(parseCSV('﻿"a";"b"')).toEqual([['a', 'b']]);
  });

  it('verkraftet CRLF und leere Zeilen', () => {
    expect(parseCSV('a;b\r\n\r\nc;d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('serializeLog / parseLog – Roundtrip', () => {
  /* Kernversprechen: der eigene Export muss sich verlustfrei zurücklesen
     lassen. Mit dem frueheren split(';') plus Quote-Strip war das nicht der
     Fall, sobald ein Feld ein Semikolon oder Anführungszeichen enthielt. */
  it('liest den eigenen Export unverändert zurück', () => {
    const log = [
      eintrag(),
      eintrag({ d: '2026-07-30', day: 'B', sets: 8, tops: 0 }),
      eintrag({ d: '2026-07-31', ups: ['Liegestütze → Voll', 'Dips → Parallettes'] })
    ];
    expect(parseLog(serializeLog(log)).entries).toEqual(log);
  });

  it('übersteht ein Semikolon im Stufennamen', () => {
    const log = [eintrag({ ups: ['Übung; mit Semikolon → Stufe'] })];
    expect(parseLog(serializeLog(log)).entries).toEqual(log);
  });

  it('übersteht Anführungszeichen im Stufennamen', () => {
    const log = [eintrag({ ups: ['Stufe "eng" → Stufe "weit"'] })];
    expect(parseLog(serializeLog(log)).entries).toEqual(log);
  });

  it('erzeugt für ein leeres Log nur den Kopf', () => {
    expect(serializeLog([])).toBe('"Datum";"Tag";"Saetze";"TopSaetze";"LevelUps"');
  });
});

describe('parseLog', () => {
  const kopf = '"Datum";"Tag";"Saetze";"TopSaetze";"LevelUps"';

  /* Frueher waren Saetze und TopSaetze fest auf Index 2 und 3 verdrahtet,
     waehrend Datum und Tag ueber den Kopf gesucht wurden – eine umsortierte
     Datei ergab damit stillschweigend Unsinn. */
  it('löst alle Spalten über den Kopf auf, auch umsortiert', () => {
    const csv = '"TopSaetze";"Saetze";"Tag";"Datum"\n"3";"12";"A";"2026-07-29"';
    expect(parseLog(csv).entries[0]).toMatchObject({ d: '2026-07-29', day: 'A', sets: 12, tops: 3 });
  });

  it('überspringt Zeilen mit nicht-ISO-Datum statt NaN-Wochen zu erzeugen', () => {
    const csv = kopf + '\n"01.02.2026";"A";"12";"3";""\n"2026-07-29";"A";"12";"3";""';
    const { entries, skipped } = parseLog(csv);
    expect(entries).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('überspringt Zeilen ohne Sätze', () => {
    const csv = kopf + '\n"2026-07-29";"A";"0";"0";""';
    expect(parseLog(csv)).toMatchObject({ entries: [], skipped: 1 });
  });

  it('wirft, wenn die Datumsspalte fehlt', () => {
    expect(() => parseLog('"Tag";"Saetze"\n"A";"12"')).toThrow(/Datum/);
  });

  it('wirft bei einer Datei ohne Datenzeilen', () => {
    expect(() => parseLog(kopf)).toThrow(/Datenzeilen/);
  });

  it('setzt einen fehlenden Tag auf A', () => {
    const csv = '"Datum";"Saetze"\n"2026-07-29";"12"';
    expect(parseLog(csv).entries[0].day).toBe('A');
  });

  it('reicht Tag-Keys durch die übergebene Bereinigung', () => {
    const csv = kopf + '\n"2026-07-29";"<script>";"12";"0";""';
    expect(parseLog(csv, s => String(s).replace(/[^A-Za-z]/g, '')).entries[0].day).toBe('script');
  });
});

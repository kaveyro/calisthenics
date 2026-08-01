import { describe, it, expect } from 'vitest';
import { ANKER, ankerUebung, einstiegsFragen, startStufen } from '../js/domain/einstieg.js';

/* Eine kleine, vollstaendig kontrollierte Uebungsliste. Die echten Daten
   stehen in js/exercises.js und aendern sich; hier soll die Rechnung
   geprueft werden, nicht der Inhalt. */
const leiter = n => Array.from({ length: n }, (_, i) => ({ stage: 'S' + i, target: '4 × 8' }));

const EXERCISES = [
  { id: 'pushup', cat: 'push', equip: ['none'], levels: leiter(9) },
  { id: 'dips', cat: 'push', equip: ['chair', 'parallettes'], levels: [
    { stage: 'A', target: '4 × 8', equip: ['chair'] },
    { stage: 'B', target: '4 × 8', equip: ['chair'] },
    { stage: 'C', target: '4 × 8', equip: ['parallettes'] },
    { stage: 'D', target: '4 × 8', equip: ['parallettes'] },
    { stage: 'E', target: '4 × 8', equip: ['parallettes'] }
  ]},
  { id: 'pullup', cat: 'pull', equip: ['bar'], levels: leiter(9) },
  { id: 'row', cat: 'pull', equip: ['chair', 'bar'], levels: leiter(5) },
  { id: 'squat', cat: 'legs', equip: ['none'], levels: leiter(9) },
  { id: 'plank', cat: 'core', equip: ['none'], levels: leiter(5) },
  { id: 'planche', cat: 'skill', equip: ['none'], levels: leiter(7) }
];

const ALLES = ['chair', 'bar', 'parallettes', 'rings', 'band'];

describe('ankerUebung', () => {
  it('nennt je Kategorie eine Uebung', () => {
    ANKER.forEach(({ kat }) => {
      expect(ankerUebung(kat, EXERCISES, ALLES)).not.toBe(null);
    });
  });

  /* Ohne Stange ist der Klimmzug keine sinnvolle Frage, das Rudern am Tisch
     schon – deshalb steht beim Ziehen mehr als ein Kandidat. */
  it('nimmt die erste Uebung, die mit der Ausruestung machbar ist', () => {
    expect(ankerUebung('pull', EXERCISES, ['bar']).id).toBe('pullup');
    expect(ankerUebung('pull', EXERCISES, ['chair']).id).toBe('row');
  });

  it('liefert null, wenn gar nichts geht', () => {
    expect(ankerUebung('pull', EXERCISES, [])).toBe(null);
    expect(ankerUebung('gibtsnicht', EXERCISES, ALLES)).toBe(null);
  });
});

describe('einstiegsFragen', () => {
  it('stellt je Kategorie eine Frage', () => {
    const f = einstiegsFragen(EXERCISES, ALLES);
    expect(f.map(x => x.kat)).toEqual(['push', 'pull', 'legs', 'core']);
  });

  /* Eine Stufe, die ein fehlendes Geraet braucht, darf nicht zur Wahl
     stehen – die App wuerde sie sofort danach als gesperrt melden. */
  it('bietet nur Stufen an, die machbar sind', () => {
    const f = einstiegsFragen(EXERCISES, ['chair']);
    const pull = f.find(x => x.kat === 'pull');
    expect(pull.ex.id).toBe('row');
    expect(pull.stufen.length).toBeGreaterThan(0);
  });

  it('laesst eine Kategorie ohne machbare Uebung weg', () => {
    const f = einstiegsFragen(EXERCISES, []);
    expect(f.map(x => x.kat)).toEqual(['push', 'legs', 'core']);
  });
});

describe('startStufen', () => {
  const stufen = (antworten, equipment = ALLES) =>
    startStufen({ exercises: EXERCISES, equipment, antworten });

  it('setzt die Ankeruebung genau auf die gewaehlte Stufe', () => {
    expect(stufen({ push: 4 }).pushup).toBe(4);
    expect(stufen({ legs: 2 }).squat).toBe(2);
  });

  it('laesst eine Kategorie ohne Antwort in Ruhe', () => {
    const out = stufen({ push: 3 });
    expect(out.pushup).toBe(3);
    expect(out.squat).toBeUndefined();
    expect(out.plank).toBeUndefined();
  });

  /* Stufe 0 ist die Vorgabe – dafuer muss nichts geschrieben werden. */
  it('schreibt keine Nullen', () => {
    expect(stufen({ push: 0, pull: 0, legs: 0, core: 0 })).toEqual({});
  });

  /* Zu hoch angesetzt bedeutet eine Uebung, die sich nicht sauber ausfuehren
     laesst. Die Uebertragung ist deshalb bewusst nur halb so weit. */
  it('uebertraegt gedaempft auf die uebrigen Uebungen der Kategorie', () => {
    /* pushup 8/8 = 100 %, dips hat 5 Stufen -> floor(1 * 4 * 0.5) = 2 */
    expect(stufen({ push: 8 }).dips).toBe(2);
    /* Die Haelfte davon ergibt floor(0.5 * 4 * 0.5) = 1 */
    expect(stufen({ push: 4 }).dips).toBe(1);
  });

  it('laesst Skills unangetastet', () => {
    const out = startStufen({
      exercises: EXERCISES, equipment: ALLES,
      antworten: { push: 8, pull: 8, legs: 8, core: 4 }
    });
    expect(out.planche).toBeUndefined();
  });

  /* Ohne Parallettes enden die Dips bei Stufe 1 – dorthin und nicht weiter. */
  it('kappt an der hoechsten machbaren Stufe', () => {
    expect(stufen({ push: 8 }, ['chair']).dips).toBe(1);
  });

  it('kappt eine zu grosse Antwort an der Leiter', () => {
    expect(stufen({ push: 99 }).pushup).toBe(8);
  });

  it('ignoriert unbrauchbare Antworten', () => {
    [{ push: -1 }, { push: 1.5 }, { push: 'drei' }, { push: null }, {}]
      .forEach(a => expect(stufen(a).pushup).toBeUndefined());
  });

  it('vertraegt kaputte Eingaben', () => {
    expect(startStufen()).toEqual({});
    expect(startStufen({ exercises: null, equipment: null, antworten: null })).toEqual({});
    expect(startStufen({ exercises: EXERCISES, equipment: [], antworten: { pull: 3 } })).toEqual({});
  });

  it('veraendert die Uebungsliste nicht', () => {
    const kopie = JSON.parse(JSON.stringify(EXERCISES));
    stufen({ push: 5, pull: 5, legs: 5, core: 2 });
    expect(EXERCISES).toEqual(kopie);
  });
});

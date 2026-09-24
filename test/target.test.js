import { describe, it, expect } from 'vitest';
import { zielAuswerten, zielText, stufeGueltig, limitErreicht, tagesziel, einstiegsziel, zuSchwer } from '../js/domain/target.js';
import { EXERCISES } from '../js/exercises.js';

/* Bis zur Umstellung auf Daten prüfte diese Datei vor allem, ob der Parser
   Schreibvarianten verkraftet – Binde- statt Halbgeviertstrich, eine
   nachgestellte Einheit, ein fehlendes Satzpräfix. Diese Frage gibt es nicht
   mehr. Geblieben ist, was die Zahlen bedeuten; dazu kommt, was vorher gar
   nicht prüfbar war: ob jede Stufe des Katalogs überhaupt ein Ziel trägt. */

describe('zielAuswerten', () => {
  it('liest Wiederholungen', () => {
    expect(zielAuswerten({ saetze: 4, wdh: [6, 10] }))
      .toEqual({ sets: 4, isHold: false, holdSecs: 0, minReps: 6, maxReps: 10, art: 'wdh' });
  });

  it('liest einen festen Wert', () => {
    expect(zielAuswerten({ saetze: 5, wdh: [1, 1] })).toMatchObject({ minReps: 1, maxReps: 1 });
  });

  it('zählt bei Halteübungen die Obergrenze herunter', () => {
    expect(zielAuswerten({ saetze: 4, sek: [10, 20] }))
      .toEqual({ sets: 4, isHold: true, holdSecs: 20, minReps: null, maxReps: null, art: 'sek' });
    expect(zielAuswerten({ saetze: 2, sek: [60, 60] })).toMatchObject({ isHold: true, holdSecs: 60 });
  });

  it('behandelt Versuche wie Wiederholungen, kennzeichnet sie aber', () => {
    expect(zielAuswerten({ saetze: 4, wdh: [5, 8], art: 'versuche' }))
      .toMatchObject({ sets: 4, minReps: 5, maxReps: 8, isHold: false, art: 'versuche' });
  });

  describe('Satz-Modus', () => {
    it('deckelt Einsteiger auf drei Sätze, erhöht aber nie', () => {
      expect(zielAuswerten({ saetze: 5, wdh: [8, 12] }, 'light').sets).toBe(3);
      expect(zielAuswerten({ saetze: 2, wdh: [8, 12] }, 'light').sets).toBe(2);
    });
    it('legt für Fortgeschrittene einen Satz drauf', () => {
      expect(zielAuswerten({ saetze: 4, wdh: [8, 12] }, 'hard').sets).toBe(5);
    });
    it('lässt die Vorgabe unverändert', () => {
      expect(zielAuswerten({ saetze: 4, wdh: [8, 12] }, 'standard').sets).toBe(4);
      expect(zielAuswerten({ saetze: 4, wdh: [8, 12] }).sets).toBe(4);
    });
    it('rührt Wiederholungen und Haltezeit nicht an', () => {
      expect(zielAuswerten({ saetze: 4, sek: [10, 20] }, 'hard').holdSecs).toBe(20);
      expect(zielAuswerten({ saetze: 4, wdh: [6, 10] }, 'light').maxReps).toBe(10);
    });
  });

  /* Der Rückfall ist dasselbe stille Verhalten wie früher. Er soll nur nicht
     abstürzen – verhindert wird der Fall durch den Katalogtest unten. */
  it('stürzt bei unbrauchbarer Stufe nicht ab', () => {
    [null, undefined, {}, { saetze: 0 }, { saetze: 4, wdh: [10, 6] }, { saetze: 4, wdh: 'viel' }]
      .forEach(l => expect(zielAuswerten(l)).toMatchObject({ sets: expect.any(Number), minReps: null }));
    expect(zielAuswerten({}).sets).toBe(3);
  });
});

describe('zielText', () => {
  it('schreibt eine Spanne mit Halbgeviertstrich', () => {
    expect(zielText({ saetze: 4, wdh: [6, 10] })).toBe('4 × 6–10');
  });

  it('schreibt einen festen Wert nur einmal', () => {
    expect(zielText({ saetze: 5, wdh: [1, 1] })).toBe('5 × 1');
    expect(zielText({ saetze: 2, sek: [60, 60] })).toBe('2 × 60 Sek');
  });

  it('hängt die Einheit an', () => {
    expect(zielText({ saetze: 4, sek: [10, 20] })).toBe('4 × 10–20 Sek');
    expect(zielText({ saetze: 4, wdh: [5, 8], art: 'versuche' })).toBe('4 × 5–8 Versuche');
  });

  /* Früher wurde 'Sek' im fertigen Text ersetzt, weil die Halteerkennung am
     deutschen Wort hing. Jetzt kommen die Wörter herein. */
  it('nimmt die Einheitenwörter von aussen', () => {
    const en = { sek: 'sec', versuche: 'attempts' };
    expect(zielText({ saetze: 4, sek: [10, 20] }, en)).toBe('4 × 10–20 sec');
    expect(zielText({ saetze: 4, wdh: [5, 8], art: 'versuche' }, en)).toBe('4 × 5–8 attempts');
    expect(zielText({ saetze: 4, wdh: [6, 10] }, en)).toBe('4 × 6–10');
  });
});

describe('stufeGueltig', () => {
  it('nimmt die drei Formen an', () => {
    expect(stufeGueltig({ saetze: 4, wdh: [6, 10] })).toBe(true);
    expect(stufeGueltig({ saetze: 4, sek: [10, 20] })).toBe(true);
    expect(stufeGueltig({ saetze: 4, wdh: [5, 8], art: 'versuche' })).toBe(true);
  });

  it('verlangt eine Satzzahl', () => {
    expect(stufeGueltig({ wdh: [6, 10] })).toBe(false);
    expect(stufeGueltig({ saetze: 0, wdh: [6, 10] })).toBe(false);
    expect(stufeGueltig({ saetze: 2.5, wdh: [6, 10] })).toBe(false);
  });

  it('verlangt genau eines von wdh und sek', () => {
    expect(stufeGueltig({ saetze: 4 })).toBe(false);
    expect(stufeGueltig({ saetze: 4, wdh: [6, 10], sek: [10, 20] })).toBe(false);
  });

  it('verlangt eine aufsteigende Spanne aus ganzen Zahlen', () => {
    expect(stufeGueltig({ saetze: 4, wdh: [10, 6] })).toBe(false);
    expect(stufeGueltig({ saetze: 4, wdh: [0, 6] })).toBe(false);
    expect(stufeGueltig({ saetze: 4, wdh: [6] })).toBe(false);
    expect(stufeGueltig({ saetze: 4, sek: ['10', '20'] })).toBe(false);
  });

  it('erlaubt art nur als Versuche an Wiederholungen', () => {
    expect(stufeGueltig({ saetze: 4, sek: [10, 20], art: 'versuche' })).toBe(false);
    expect(stufeGueltig({ saetze: 4, wdh: [6, 10], art: 'irgendwas' })).toBe(false);
  });

  it('weist Unfug ab', () => {
    [null, undefined, 'Stufe', 4].forEach(l => expect(stufeGueltig(l)).toBe(false));
  });
});

/* Der eigentliche Gewinn der Umstellung. Vorher ergab ein Tippfehler in einer
   der 166 Zielangaben still drei Sätze ohne Wiederholungen, und es gab keinen
   Ort, an dem das aufgefallen wäre. */
describe('Zielangaben im Katalog', () => {
  const alle = EXERCISES.flatMap(ex => ex.levels.map((l, i) => ({ ort: ex.id + '[' + i + ']', l })));

  it('prüft wirklich den ganzen Katalog', () => {
    expect(alle.length).toBeGreaterThan(150);
  });

  it('gibt jeder Stufe ein gültiges Ziel', () => {
    const kaputt = alle.filter(({ l }) => !stufeGueltig(l)).map(x => x.ort);
    expect(kaputt).toEqual([]);
  });

  it('führt kein altes Textfeld mehr', () => {
    const alt = alle.filter(({ l }) => 'target' in l).map(x => x.ort);
    expect(alt).toEqual([]);
  });
});

describe('limitErreicht', () => {
  const ziel = zielAuswerten({ saetze: 3, wdh: [6, 10] });

  it('sagt ja, wenn jeder Satz die Obergrenze erreicht', () => {
    expect(limitErreicht(ziel, [10, 10, 10])).toBe(true);
    expect(limitErreicht(ziel, [12, 10, 11])).toBe(true);
  });

  it('sagt nein, sobald ein Satz darunter bleibt', () => {
    expect(limitErreicht(ziel, [10, 10, 9])).toBe(false);
    /* Der Fall, den das Haekchen frueher durchliess: niedrige Zahlen,
       trotzdem als geschafft markiert. */
    expect(limitErreicht(ziel, [4, 4, 4])).toBe(false);
  });

  it('zaehlt 0 als Zahl und nicht als fehlend', () => {
    expect(limitErreicht(ziel, [10, 10, 0])).toBe(false);
  });

  /* Die dritte Antwort ist der Kern: nichts behaupten, was sich aus den
     Zahlen nicht ergibt. */
  it('laesst offen, wenn ein Satz ohne Zahl ist', () => {
    expect(limitErreicht(ziel, [10, 10])).toBeNull();
    expect(limitErreicht(ziel, [10, null, 10])).toBeNull();
    expect(limitErreicht(ziel, [10, undefined, 10])).toBeNull();
    expect(limitErreicht(ziel, [])).toBeNull();
    expect(limitErreicht(ziel, undefined)).toBeNull();
  });

  it('nimmt nur ganze Zahlen, wie setRep() sie ablegt', () => {
    expect(limitErreicht(ziel, [10, '10', 10])).toBeNull();
    expect(limitErreicht(ziel, [10, 10.5, 10])).toBeNull();
    expect(limitErreicht(ziel, [10, -1, 10])).toBeNull();
  });

  it('laesst Halteuebungen offen', () => {
    expect(limitErreicht(zielAuswerten({ saetze: 3, sek: [10, 20] }), [20, 20, 20])).toBeNull();
  });

  it('laesst eine Stufe ohne Zielzahlen offen', () => {
    expect(limitErreicht(zielAuswerten({}), [10, 10, 10])).toBeNull();
    expect(limitErreicht(null, [10])).toBeNull();
  });

  /* Gezaehlt werden die Saetze, die heute anstehen. In der Entlastungswoche
     sind es weniger, und Eintraege aus den gestrichenen Saetzen duerfen
     nicht mitentscheiden. */
  it('wertet nur so viele Saetze, wie das Ziel verlangt', () => {
    const halb = { ...ziel, sets: 2 };
    expect(limitErreicht(halb, [10, 10, 3])).toBe(true);
    expect(limitErreicht(halb, [10, 10])).toBe(true);
  });

  it('behandelt Versuche wie Wiederholungen', () => {
    const versuche = zielAuswerten({ saetze: 4, wdh: [5, 8], art: 'versuche' });
    expect(limitErreicht(versuche, [8, 8, 8, 8])).toBe(true);
    expect(limitErreicht(versuche, [8, 8, 8, 7])).toBe(false);
  });
});

describe('tagesziel', () => {
  const ziel = zielAuswerten({ saetze: 3, wdh: [6, 10] });

  it('legt je Satz eine Wiederholung drauf', () => {
    expect(tagesziel(ziel, [8, 8, 7])).toEqual({ reps: [9, 9, 8], allesOben: false });
  });

  it('deckelt auf die Obergrenze', () => {
    expect(tagesziel(ziel, [10, 9, 10])).toEqual({ reps: [10, 10, 10], allesOben: false });
  });

  /* Alle oben heisst nicht "Stufe steht an": aufgestiegen wird erst nach so
     vielen Einheiten in Folge, wie die Einstellung verlangt. */
  it('meldet, wenn schon alle Saetze oben waren', () => {
    expect(tagesziel(ziel, [10, 10, 10])).toEqual({ reps: [10, 10, 10], allesOben: true });
    expect(tagesziel(ziel, [12, 11, 10]).allesOben).toBe(true);
  });

  /* Unter der Spanne wird nicht auf ihr Minimum gehoben: "letztes Mal 3,
     heute 4" ist ehrlicher als eine Vorgabe, die niemand schafft. Die Spanne
     steht ohnehin daneben. */
  it('hebt unter der Spanne nicht auf ihr Minimum', () => {
    expect(tagesziel(ziel, [3, 3, 2]).reps).toEqual([4, 4, 3]);
  });

  it('fuellt zusaetzliche Saetze mit dem letzten bekannten', () => {
    expect(tagesziel(ziel, [8, 8]).reps).toEqual([9, 9, 9]);
    /* Weniger Saetze als heute: dann kann es nicht "alle oben" gewesen sein. */
    expect(tagesziel(ziel, [10, 10]).allesOben).toBe(false);
  });

  it('wertet nur so viele Saetze, wie heute anstehen', () => {
    const halb = { ...ziel, sets: 2 };
    expect(tagesziel(halb, [8, 8, 7, 6])).toEqual({ reps: [9, 9], allesOben: false });
    expect(tagesziel(halb, [10, 10, 3]).allesOben).toBe(true);
  });

  it('laesst Halteuebungen aus', () => {
    expect(tagesziel(zielAuswerten({ saetze: 3, sek: [10, 20] }), [20, 20, 20])).toBeNull();
  });

  it('braucht Zahlen', () => {
    expect(tagesziel(ziel, [])).toBeNull();
    expect(tagesziel(ziel, null)).toBeNull();
    expect(tagesziel(ziel, ['8', 7.5, -1])).toBeNull();
    expect(tagesziel(zielAuswerten({}), [8, 8])).toBeNull();
    expect(tagesziel(null, [8])).toBeNull();
  });
});

describe('einstiegsziel', () => {
  it('nennt die Untergrenze in jedem Satz', () => {
    expect(einstiegsziel(zielAuswerten({ saetze: 4, wdh: [6, 10] }))).toEqual([6, 6, 6, 6]);
  });

  it('folgt dem Satz-Modus', () => {
    expect(einstiegsziel(zielAuswerten({ saetze: 4, wdh: [6, 10] }, 'light'))).toEqual([6, 6, 6]);
  });

  it('schweigt bei Halteuebungen und ohne Ziel', () => {
    expect(einstiegsziel(zielAuswerten({ saetze: 3, sek: [10, 20] }))).toBeNull();
    expect(einstiegsziel(null)).toBeNull();
    expect(einstiegsziel({ sets: 0, minReps: 5 })).toBeNull();
  });
});

describe('zuSchwer', () => {
  const Z = zielAuswerten({ saetze: 4, wdh: [6, 10] });
  const e = (reps, lvl = 2) => ({ d: '2026-01-01', reps, lvl });

  it('schlaegt nach zwei Einheiten unter der Untergrenze vor', () => {
    expect(zuSchwer(Z, [e([5, 4, 4, 3]), e([5, 5, 4])], 2)).toBe(true);
  });

  it('schweigt, sobald ein Satz die Untergrenze erreicht', () => {
    expect(zuSchwer(Z, [e([6, 4, 4, 3]), e([5, 5, 4])], 2)).toBe(false);
  });

  it('braucht zwei Einheiten', () => {
    expect(zuSchwer(Z, [e([3, 3, 3, 3])], 2)).toBe(false);
    expect(zuSchwer(Z, [], 2)).toBe(false);
    expect(zuSchwer(Z, null, 2)).toBe(false);
  });

  it('zaehlt nur Einheiten auf der aktuellen Stufe', () => {
    /* Die zweite stammt von der Stufe davor - dort war 5 vielleicht
       schon viel. Und eine ohne bekannte Stufe sagt nichts. */
    expect(zuSchwer(Z, [e([3, 3, 3]), e([3, 3, 3], 1)], 2)).toBe(false);
    expect(zuSchwer(Z, [e([3, 3, 3]), e([3, 3, 3], null)], 2)).toBe(false);
  });

  it('schweigt bei Halteuebungen und Versuchen', () => {
    expect(zuSchwer(zielAuswerten({ saetze: 3, sek: [10, 20] }), [e([3]), e([3])], 2)).toBe(false);
    expect(zuSchwer(zielAuswerten({ saetze: 4, wdh: [5, 8], art: 'versuche' }), [e([1]), e([1])], 2)).toBe(false);
    expect(zuSchwer(null, [e([1]), e([1])], 2)).toBe(false);
  });

  it('haelt einem kaputten Eintrag stand', () => {
    expect(zuSchwer(Z, [e([]), e([3])], 2)).toBe(false);
    expect(zuSchwer(Z, [null, e([3])], 2)).toBe(false);
  });
});

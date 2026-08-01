import { describe, it, expect } from 'vitest';
import { mergeStates } from '../js/domain/merge.js';
import { MAX_LOG_ENTRIES, MAX_SERIES_ENTRIES } from '../js/domain/state.js';

/* Der Import ersetzte immer alles. Fuer den haeufigsten Fall – Handy und
   Rechner – war das genau falsch herum: jede Einheit, die seit dem Backup
   dazukam, war danach weg. */

const eintrag = (d, over = {}) =>
  ({ d, day: 'A', sets: 12, tops: 1, ups: [], ex: ['pushup'], reps: {}, ...over });

describe('mergeStates – Trainingslog', () => {
  it('vereinigt beide Listen und sortiert nach Datum', () => {
    const out = mergeStates(
      { log: [eintrag('2026-07-01'), eintrag('2026-07-10')] },
      { log: [eintrag('2026-07-05')] }
    );
    expect(out.log.map(l => l.d)).toEqual(['2026-07-01', '2026-07-05', '2026-07-10']);
  });

  it('entdoppelt ueber Datum, Tag und Satzzahl', () => {
    const out = mergeStates({ log: [eintrag('2026-07-01')] }, { log: [eintrag('2026-07-01')] });
    expect(out.log).toHaveLength(1);
  });

  it('haelt zwei Einheiten am selben Tag auseinander, solange sie sich unterscheiden', () => {
    const out = mergeStates(
      { log: [eintrag('2026-07-01', { sets: 12 })] },
      { log: [eintrag('2026-07-01', { sets: 8 }), eintrag('2026-07-01', { day: 'B' })] }
    );
    expect(out.log).toHaveLength(3);
  });

  it('behaelt bei gleichem Schluessel den eigenen Eintrag', () => {
    const out = mergeStates(
      { log: [eintrag('2026-07-01', { ex: ['hier'] })] },
      { log: [eintrag('2026-07-01', { ex: ['dort'] })] }
    );
    expect(out.log[0].ex).toEqual(['hier']);
  });

  it('wirft unbrauchbare Eintraege weg', () => {
    const out = mergeStates({ log: [null, 'text', { ohneDatum: 1 }] }, { log: [eintrag('2026-07-01')] });
    expect(out.log).toHaveLength(1);
  });

  it('kappt auf die Obergrenze und behaelt die juengsten', () => {
    const viele = Array.from({ length: MAX_LOG_ENTRIES }, (_, i) =>
      eintrag('2020-01-01', { sets: i }));
    const out = mergeStates({ log: viele }, { log: [eintrag('2026-07-01')] });
    expect(out.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(out.log[out.log.length - 1].d).toBe('2026-07-01');
  });
});

describe('mergeStates – Stufen, Serien und Tageszaehler', () => {
  it('nimmt je Uebung den weiteren Stand', () => {
    /* Eine Stufe zu verlieren, weil das Backup aelter war, waere der
       sichtbarste Verlust ueberhaupt. */
    const out = mergeStates(
      { levels: { pushup: 5, squat: 1 }, streaks: { pushup: 0 }, byDay: { A: 10 } },
      { levels: { pushup: 3, dips: 2 }, streaks: { pushup: 2 }, byDay: { A: 4, B: 7 } }
    );
    expect(out.levels).toEqual({ pushup: 5, squat: 1, dips: 2 });
    expect(out.streaks).toEqual({ pushup: 2 });
    expect(out.byDay).toEqual({ A: 10, B: 7 });
  });

  it('ignoriert Werte, die keine Zahl sind', () => {
    const out = mergeStates({ levels: { pushup: 4 } }, { levels: { pushup: 'viele', dips: null } });
    expect(out.levels).toEqual({ pushup: 4 });
  });

  it('uebernimmt einen fremden Wert, wenn der eigene unbrauchbar ist', () => {
    expect(mergeStates({ levels: { pushup: 'x' } }, { levels: { pushup: 3 } }).levels.pushup).toBe(3);
  });
});

describe('mergeStates – Bestleistungen', () => {
  it('laesst die hoehere Zahl gewinnen', () => {
    const out = mergeStates(
      { prs: { pushup: { v: '20', n: 20, d: '2026-01-01' } } },
      { prs: { pushup: { v: '25', n: 25, d: '2025-01-01' } } }
    );
    expect(out.prs.pushup.n).toBe(25);
  });

  it('nimmt bei Gleichstand den juengeren Eintrag', () => {
    const out = mergeStates(
      { prs: { pushup: { v: '20', n: 20, d: '2026-01-01' } } },
      { prs: { pushup: { v: 'sauber', n: 20, d: '2026-06-01' } } }
    );
    expect(out.prs.pushup.v).toBe('sauber');
  });

  /* Freitext ohne Zahl ergibt beidseitig -Infinity – dann entscheidet
     ebenfalls das Datum, statt dass gar nichts passiert. */
  it('vergleicht zwei reine Freitexte ueber das Datum', () => {
    const out = mergeStates(
      { prs: { pushup: { v: 'sauber', d: '2026-01-01' } } },
      { prs: { pushup: { v: 'sehr sauber', d: '2026-06-01' } } }
    );
    expect(out.prs.pushup.v).toBe('sehr sauber');
  });

  it('uebernimmt Uebungen, die nur der andere Stand kennt', () => {
    const out = mergeStates({ prs: {} }, { prs: { dips: { v: '8', n: 8, d: '2026-01-01' } } });
    expect(out.prs.dips.n).toBe(8);
  });

  it('laesst Schrott liegen', () => {
    const out = mergeStates({ prs: { a: { v: '1', n: 1 } } }, { prs: { a: 5, b: null } });
    expect(out.prs).toEqual({ a: { v: '1', n: 1 } });
  });

  /* Dieselbe Regel wie in der App, sonst kaeme ein Import zu einem anderen
     Ergebnis als das Training. Der Handstand zaehlt bis Stufe 1 Versuche und
     ab Stufe 2 Sekunden – "8 Versuche" darf 20 Sekunden nicht blockieren. */
  it('vergleicht Sekunden nicht mit Wiederholungen', () => {
    const out = mergeStates(
      { prs: { handstand: { v: '8 Wdh', n: 8, d: '2026-01-01', art: 'reps', lvl: 1 } } },
      { prs: { handstand: { v: '20 Sek', n: 20, d: '2026-06-01', art: 'sek', lvl: 3 } } }
    );
    expect(out.prs.handstand.v).toBe('20 Sek');
  });

  it('laesst eine niedrigere Stufe die hoehere nicht ueberschreiben', () => {
    const out = mergeStates(
      { prs: { handstand: { v: '30 Sek', n: 30, d: '2026-06-01', art: 'sek', lvl: 4 } } },
      { prs: { handstand: { v: '10 Wdh', n: 10, d: '2026-07-01', art: 'reps', lvl: 1 } } }
    );
    expect(out.prs.handstand.v).toBe('30 Sek');
  });
});

describe('mergeStates – Notizen und Meilensteine', () => {
  it('behaelt je Uebung die juengere Notiz', () => {
    const out = mergeStates(
      { notes: { pushup: { t: 'alt', d: '2026-01-01' }, dips: { t: 'nur hier', d: '2026-01-01' } } },
      { notes: { pushup: { t: 'neu', d: '2026-06-01' }, squat: { t: 'nur dort', d: '2026-01-01' } } }
    );
    expect(out.notes.pushup.t).toBe('neu');
    expect(out.notes.dips.t).toBe('nur hier');
    expect(out.notes.squat.t).toBe('nur dort');
  });

  it('laesst eine juengere Notiz nicht von einer aelteren verdraengen', () => {
    const out = mergeStates(
      { notes: { pushup: { t: 'neu', d: '2026-06-01' } } },
      { notes: { pushup: { t: 'alt', d: '2026-01-01' }, kaputt: 'kein Objekt' } }
    );
    expect(out.notes.pushup.t).toBe('neu');
    expect(out.notes.kaputt).toBeUndefined();
  });

  /* Bei Meilensteinen gewinnt das FRUEHERE Datum – gespeichert ist, wann er
     zum ersten Mal geschafft wurde. */
  it('behaelt beim Meilenstein das fruehere Datum', () => {
    const out = mergeStates(
      { milestones: { pullup: '2026-06-01', dip: '2026-01-01' } },
      { milestones: { pullup: '2026-02-01', hs: '2026-03-01', kaputt: 5 } }
    );
    expect(out.milestones).toEqual({ pullup: '2026-02-01', dip: '2026-01-01', hs: '2026-03-01' });
  });
});

describe('mergeStates – Gewichte und Messwerte', () => {
  it('vereinigt je Datum und sortiert', () => {
    const out = mergeStates(
      { weights: [{ d: '2026-01-01', kg: 80 }, { d: '2026-03-01', kg: 78 }] },
      { weights: [{ d: '2026-02-01', kg: 79 }, { d: '2026-01-01', kg: 99 }] }
    );
    expect(out.weights).toEqual([
      { d: '2026-01-01', kg: 80 },        /* eigen gewinnt beim selben Tag */
      { d: '2026-02-01', kg: 79 },
      { d: '2026-03-01', kg: 78 }
    ]);
  });

  it('kappt die Reihe auf die Obergrenze', () => {
    const viele = Array.from({ length: MAX_SERIES_ENTRIES + 50 }, (_, i) =>
      ({ d: '2026-' + String(i).padStart(4, '0'), kg: 80 }));
    expect(mergeStates({ weights: viele }, {}).weights).toHaveLength(MAX_SERIES_ENTRIES);
  });

  it('legt Messwerte unter _dates zusammen', () => {
    const out = mergeStates(
      { measurements: { _dates: [{ d: '2026-01-01', waist: 80 }] } },
      { measurements: { _dates: [{ d: '2026-02-01', waist: 79 }] } }
    );
    expect(out.measurements._dates.map(m => m.d)).toEqual(['2026-01-01', '2026-02-01']);
  });

  it('legt kein leeres _dates an, wo vorher keins war', () => {
    expect(mergeStates({ measurements: {} }, { measurements: {} }).measurements).toEqual({});
  });

  it('vertraegt eine kaputte Messwert-Struktur', () => {
    expect(mergeStates({ measurements: 'kaputt' }, { measurements: null }).measurements).toEqual({});
  });
});

describe('mergeStates – Zaehler und Einrichtung', () => {
  it('nimmt den hoeheren Zaehler und das spaetere Datum', () => {
    const out = mergeStates(
      { workouts: 12, lastDate: '2026-07-01' },
      { workouts: 30, lastDate: '2026-06-01' }
    );
    expect(out.workouts).toBe(30);
    expect(out.lastDate).toBe('2026-07-01');
  });

  it('kommt ohne lastDate aus', () => {
    expect(mergeStates({ lastDate: null }, { lastDate: null }).lastDate).toBeNull();
    expect(mergeStates({}, { lastDate: '2026-01-01' }).lastDate).toBe('2026-01-01');
  });

  it('vertraegt Zaehler, die keine Zahl sind', () => {
    expect(mergeStates({ workouts: 'viele' }, { workouts: 4 }).workouts).toBe(4);
  });

  /* Die Einrichtung des Geraets gehoert dem Geraet – nur der Verlauf wird
     zusammengelegt. Sonst brächte jedes Backup fremde Einstellungen, einen
     fremden Plan und im schlimmsten Fall eine fremde laufende Einheit mit. */
  it('laesst Einstellungen, Plan und laufende Einheit unangetastet', () => {
    const eigen = {
      settings: { rest: 60 }, theme: 'dark', planId: 'ppl',
      customPlan: { days: [] }, warmupCustom: ['meins'],
      activeSession: { dayKey: 'A' }, rev: 12,
      lastBackup: '2026-07-01', backupWorkouts: 5, backupDismissed: 0
    };
    const out = mergeStates(eigen, {
      settings: { rest: 120 }, theme: 'light', planId: 'ab4',
      customPlan: { days: [{ key: 'X' }] }, warmupCustom: ['fremd'],
      activeSession: { dayKey: 'B' }, rev: 999,
      lastBackup: '2020-01-01', backupWorkouts: 900, backupDismissed: 900
    });
    Object.keys(eigen).forEach(k => expect(out[k]).toEqual(eigen[k]));
  });
});

describe('mergeStates – Vertraege', () => {
  const beispiel = () => ({
    log: [eintrag('2026-01-01'), eintrag('2026-02-01', { sets: 9 })],
    levels: { pushup: 3 }, streaks: { pushup: 1 }, byDay: { A: 2 },
    prs: { pushup: { v: '20', n: 20, d: '2026-01-01' } },
    notes: { pushup: { t: 'x', d: '2026-01-01' } },
    milestones: { pullup: '2026-01-01' },
    weights: [{ d: '2026-01-01', kg: 80 }],
    measurements: { _dates: [{ d: '2026-01-01', waist: 80 }] },
    workouts: 2, lastDate: '2026-02-01', settings: { rest: 60 }
  });

  it('veraendert keine der beiden Eingaben', () => {
    const a = beispiel(), b = beispiel();
    b.log = [eintrag('2026-03-01')];
    const kopieA = JSON.parse(JSON.stringify(a)), kopieB = JSON.parse(JSON.stringify(b));
    mergeStates(a, b);
    expect(a).toEqual(kopieA);
    expect(b).toEqual(kopieB);
  });

  /* Der Fall, den man versehentlich ausloest: dieselbe Datei zweimal
     einspielen. Beim zweiten Mal darf sich nichts mehr ruehren. */
  it('aendert beim zweiten Zusammenfuehren nichts mehr', () => {
    const eigen = beispiel();
    const fremd = { ...beispiel(), log: [eintrag('2026-03-01')], levels: { pushup: 7 } };
    const einmal = mergeStates(eigen, fremd);
    expect(mergeStates(einmal, fremd)).toEqual(einmal);
  });

  it('laesst einen Stand unveraendert, der mit einem leeren zusammengefuehrt wird', () => {
    const eigen = beispiel();
    expect(mergeStates(eigen, {})).toEqual(eigen);
  });

  it('kommt mit unbrauchbaren Eingaben zurecht, statt zu werfen', () => {
    expect(mergeStates(null, null)).toEqual({
      log: [], levels: {}, streaks: {}, byDay: {}, prs: {}, notes: {},
      milestones: {}, weights: [], measurements: {}, workouts: 0, lastDate: null
    });
    expect(mergeStates('text', 42).log).toEqual([]);
  });
});

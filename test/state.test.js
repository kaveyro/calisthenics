import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATE, STATE_VERSION, SETTINGS_DEFAULTS,
  MAX_LOG_ENTRIES, MAX_SERIES_ENTRIES,
  migrateState, clampBackup
} from '../js/domain/state.js';

const EX = { pushup: { id: 'pushup' }, dips: { id: 'dips' } };

describe('migrateState – unbrauchbare Eingaben', () => {
  it('liefert den Default fuer alles, was kein Objekt ist', () => {
    const def = DEFAULT_STATE();
    [null, undefined, 0, '', 'text', 42, true, []].forEach(wert => {
      expect(migrateState(wert)).toEqual(def);
    });
  });

  it('gibt bei jedem Aufruf ein frisches Objekt zurueck', () => {
    const a = migrateState(null), b = migrateState(null);
    expect(a).not.toBe(b);
    a.levels.pushup = 3;
    expect(b.levels).toEqual({});
  });
});

describe('migrateState – Defaults gegen null verteidigen', () => {
  /* Der Absturz, fuer den die Funktion ueberhaupt geschrieben wurde: ein
     flacher Merge liess "notes": null den Default {} ueberschreiben. */
  it('laesst null die Objekt-Defaults nicht ueberschreiben', () => {
    const out = migrateState({ notes: null, levels: null, prs: null, byDay: null });
    expect(out.notes).toEqual({});
    expect(out.levels).toEqual({});
    expect(out.prs).toEqual({});
    expect(out.byDay).toEqual({});
  });

  it('verwirft Werte mit falschem Grundtyp', () => {
    const out = migrateState({ workouts: 'viele', planId: 7, notes: [1, 2], log: { a: 1 } });
    expect(out.workouts).toBe(0);
    expect(out.planId).toBe('ab4');
    expect(out.notes).toEqual({});
    expect(out.log).toEqual([]);
  });

  it('verwirft nicht endliche Zahlen', () => {
    expect(migrateState({ workouts: NaN }).workouts).toBe(0);
    expect(migrateState({ workouts: Infinity }).workouts).toBe(0);
    expect(migrateState({ workouts: 12 }).workouts).toBe(12);
  });

  it('nimmt Felder mit Default null nur in der erwarteten Form an', () => {
    expect(migrateState({ customPlan: { name: 'x' } }).customPlan).toBe(null);
    expect(migrateState({ customPlan: { days: [] } }).customPlan).toEqual({ days: [] });
    expect(migrateState({ warmupCustom: 'nein' }).warmupCustom).toBe(null);
    expect(migrateState({ warmupCustom: ['ja'] }).warmupCustom).toEqual(['ja']);
    expect(migrateState({ activeSession: 5 }).activeSession).toBe(null);
    expect(migrateState({ theme: 'pink' }).theme).toBe(null);
    expect(migrateState({ theme: 'dark' }).theme).toBe('dark');
    expect(migrateState({ lastDate: '2026-01-01' }).lastDate).toBe('2026-01-01');
  });
});

describe('migrateState – Sammlungen normalisieren', () => {
  it('bringt Log-Eintraege in Form und wirft kaputte weg', () => {
    const out = migrateState({ log: [
      null,
      { sets: 3 },                                   /* ohne d – unbrauchbar */
      { d: '2026-01-01' },                           /* nur Datum */
      { d: '2026-01-02', day: 5, sets: '4', tops: '1', ups: ['a', 7], reps: null }
    ]});
    expect(out.log).toEqual([
      { d: '2026-01-01', day: 'A', sets: 0, tops: 0, ups: [], reps: {} },
      { d: '2026-01-02', day: 'A', sets: 4, tops: 1, ups: ['a'], reps: {} }
    ]);
  });

  it('kappt das Log auf MAX_LOG_ENTRIES und behaelt die juengsten', () => {
    const log = Array.from({ length: MAX_LOG_ENTRIES + 25 }, (_, i) => ({ d: 'd' + i, day: 'A' }));
    const out = migrateState({ log });
    expect(out.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(out.log[out.log.length - 1].d).toBe('d' + (MAX_LOG_ENTRIES + 24));
  });

  it('bringt Gewichte in Form und kappt sie', () => {
    const out = migrateState({ weights: [
      { d: '2026-01-01', kg: '82.5' },
      { d: '2026-01-02', kg: 'schwer' },
      { kg: 80 },
      null
    ]});
    expect(out.weights).toEqual([{ d: '2026-01-01', kg: 82.5 }]);

    const viele = Array.from({ length: MAX_SERIES_ENTRIES + 5 }, (_, i) => ({ d: 'd' + i, kg: 80 }));
    expect(migrateState({ weights: viele }).weights).toHaveLength(MAX_SERIES_ENTRIES);
  });

  it('macht aus levels/streaks Zahlen und entfernt Unsinn', () => {
    const out = migrateState({
      levels: { pushup: '3', dips: 2, kaputt: 'x', negativ: -1 },
      streaks: { pushup: '0' }
    });
    expect(out.levels).toEqual({ pushup: 3, dips: 2 });
    expect(out.streaks).toEqual({ pushup: 0 });
  });
});

describe('migrateState – Einstellungen', () => {
  it('uebernimmt bekannte Einstellungen im richtigen Typ', () => {
    const out = migrateState({ settings: { rest: 120, sound: false, setsMode: 'pro' } });
    expect(out.settings).toEqual({ rest: 120, sound: false, setsMode: 'pro' });
  });

  it('laesst unbekannte Schluessel weg', () => {
    expect(migrateState({ settings: { erfunden: 1, rest: 60 } }).settings).toEqual({ rest: 60 });
  });

  /* Ein settings.rest: "abc" ueberlebte frueher bis in startRest() und ergab
     eine Pause ueber NaN Sekunden, die nie ablief. */
  it('verwirft Werte mit falschem Typ und faellt auf den Default zurueck', () => {
    const out = migrateState({ settings: { rest: 'abc', vibrate: 'ja', streak: NaN, lang: 5 } });
    expect(out.settings).toEqual({});
    Object.keys(SETTINGS_DEFAULTS).forEach(k => expect(out.settings[k]).toBeUndefined());
  });

  it('behandelt fehlende Einstellungen wie leere', () => {
    expect(migrateState({}).settings).toEqual({});
    expect(migrateState({ settings: null }).settings).toEqual({});
  });
});

describe('migrateState – Version', () => {
  it('setzt die aktuelle Version, egal was dastand', () => {
    expect(migrateState({ v: 1 }).v).toBe(STATE_VERSION);
    expect(migrateState({ v: 'alt' }).v).toBe(STATE_VERSION);
    expect(migrateState({}).v).toBe(STATE_VERSION);
  });
});

describe('clampBackup', () => {
  it('uebernimmt nur bekannte Felder', () => {
    const out = clampBackup({ workouts: 5, boeses: 'weg', __proto__x: 1 }, EX);
    expect(out.workouts).toBe(5);
    expect(out.boeses).toBeUndefined();
    expect(Object.keys(out)).toEqual(['workouts']);
  });

  it('laesst null und undefined aus', () => {
    const out = clampBackup({ notes: null, levels: undefined, workouts: 0 }, EX);
    expect('notes' in out).toBe(false);
    expect('levels' in out).toBe(false);
    expect(out.workouts).toBe(0);
  });

  /* Frueher war out ein flacher Klon und die Zuweisungen schrieben durch ihn
     hindurch in das geparste JSON des Aufrufers zurueck. */
  it('veraendert die Eingabe nicht', () => {
    const eingabe = {
      customPlan: { days: [{ key: 'A!!', title: 'x'.repeat(60), ex: ['pushup', 'gibtsnicht'] }] },
      notes: { pushup: { t: 'y'.repeat(300), d: '2026-01-01' } },
      prs: { dips: { v: 'z'.repeat(80), n: 12 } },
      warmupCustom: ['w'.repeat(120)]
    };
    const vorher = JSON.parse(JSON.stringify(eingabe));
    clampBackup(eingabe, EX);
    expect(eingabe).toEqual(vorher);
  });

  it('beschneidet den eigenen Plan', () => {
    const out = clampBackup({ customPlan: { days: [
      { key: 'A<script>', title: 't'.repeat(60), sub: 's'.repeat(80), ex: ['pushup', 'nixda', 'dips'] },
      null,
      { }
    ]}}, EX);
    expect(out.customPlan.days).toHaveLength(2);
    expect(out.customPlan.days[0].key).toBe('Ascrip');
    expect(out.customPlan.days[0].title).toHaveLength(40);
    expect(out.customPlan.days[0].sub).toHaveLength(60);
    expect(out.customPlan.days[0].ex).toEqual(['pushup', 'dips']);
    expect(out.customPlan.days[1].key).toBe('?');       /* leerer Key */
    expect(out.customPlan.days[1].ex).toEqual([]);
  });

  it('kappt die Anzahl der Tage auf 20 und die Uebungen auf 30', () => {
    const days = Array.from({ length: 30 }, (_, i) => ({ key: 'T' + i, ex: Array(40).fill('pushup') }));
    const out = clampBackup({ customPlan: { days } }, EX);
    expect(out.customPlan.days).toHaveLength(20);
    expect(out.customPlan.days[0].ex).toHaveLength(30);
  });

  it('verwirft einen Plan ohne Tage-Liste nicht, sondern leert ihn', () => {
    const out = clampBackup({ customPlan: { name: 'x' } }, EX);
    expect(out.customPlan).toEqual({ name: 'x', days: [] });
  });

  it('beschneidet Warm-up, Notizen und Bestleistungen', () => {
    const out = clampBackup({
      warmupCustom: [...Array(40).keys()].map(() => 'w'.repeat(120)),
      notes: { pushup: { t: 'y'.repeat(300) }, kaputt: 'kein Objekt', leer: null },
      prs: { dips: { v: 'z'.repeat(80), n: 12 }, kaputt: 5 }
    }, EX);
    expect(out.warmupCustom).toHaveLength(30);
    expect(out.warmupCustom[0]).toHaveLength(80);
    expect(out.notes.pushup.t).toHaveLength(160);
    expect(out.notes.kaputt).toBeUndefined();
    expect(out.notes.leer).toBeUndefined();
    expect(out.prs.dips).toEqual({ v: 'z'.repeat(40), n: 12 });
    expect(out.prs.kaputt).toBeUndefined();
  });

  it('behandelt fehlende Werte in Notizen und Bestleistungen', () => {
    const out = clampBackup({ notes: { a: {} }, prs: { b: { n: 1 } } }, EX);
    expect(out.notes.a.t).toBe('');
    expect(out.prs.b.v).toBe('');
  });

  it('kappt Log und Gewichte auf die Obergrenzen', () => {
    const out = clampBackup({
      log: Array.from({ length: MAX_LOG_ENTRIES + 10 }, () => ({ d: 'x' })),
      weights: [...Array.from({ length: MAX_SERIES_ENTRIES + 10 }, () => ({ d: 'x', kg: 1 })), null]
    }, EX);
    expect(out.log).toHaveLength(MAX_LOG_ENTRIES);
    expect(out.weights).toHaveLength(MAX_SERIES_ENTRIES);
  });

  it('kommt ohne Uebungsbestand aus', () => {
    const out = clampBackup({ customPlan: { days: [{ key: 'A', ex: ['pushup'] }] } });
    expect(out.customPlan.days[0].ex).toEqual([]);
  });
});

describe('clampBackup + migrateState – der Importpfad', () => {
  it('macht aus einem alten, schlampigen Backup einen gueltigen Stand', () => {
    const backup = {
      v: 2,
      workouts: 7,
      levels: { pushup: '2', weg: 'x' },
      notes: null,
      settings: { rest: 'abc', sound: false, erfunden: 1 },
      log: [{ d: '2026-01-01', sets: '3' }, 'Unsinn'],
      unbekannt: { gross: 'x'.repeat(10000) }
    };
    const out = migrateState(clampBackup(backup, EX));

    expect(out.v).toBe(STATE_VERSION);
    expect(out.workouts).toBe(7);
    expect(out.levels).toEqual({ pushup: 2 });
    expect(out.notes).toEqual({});
    expect(out.settings).toEqual({ sound: false });
    expect(out.log).toEqual([{ d: '2026-01-01', day: 'A', sets: 3, tops: 0, ups: [], reps: {} }]);
    expect(out.unbekannt).toBeUndefined();
  });

  it('liefert auch fuer ein leeres Backup einen vollstaendigen Stand', () => {
    expect(migrateState(clampBackup({}, EX))).toEqual(DEFAULT_STATE());
  });
});

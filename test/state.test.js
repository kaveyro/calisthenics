import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STATE, STATE_VERSION, SETTINGS_DEFAULTS,
  MAX_LOG_ENTRIES, MAX_SERIES_ENTRIES, MAX_EX_PER_ENTRY, MAX_WORKOUT_SECS,
  MAX_CUSTOM_MILESTONES,
  migrateState, clampBackup, prNumber, besserePR
} from '../js/domain/state.js';
import { EQUIP_ALL } from '../js/domain/equipment.js';

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
    const out = migrateState({ notes: null, levels: null, prs: null, milestones: null });
    expect(out.notes).toEqual({});
    expect(out.levels).toEqual({});
    expect(out.prs).toEqual({});
    expect(out.milestones).toEqual({});
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
      { d: '2026-01-01', day: 'A', sets: 0, tops: 0, ups: [], ex: [], reps: {}, lv: {}, dl: false, sek: {}, dauer: 0 },
      { d: '2026-01-02', day: 'A', sets: 4, tops: 1, ups: ['a'], ex: [], reps: {}, lv: {}, dl: false, sek: {}, dauer: 0 }
    ]);
  });

  /* Seit v16: die gehaltenen Sekunden je Satz. Nur ganze Zahlen ueber 0
     bis zu einer Stunde, und nur Schluessel im Satzformat. */
  it('behaelt die Haltezeiten und wirft Unbrauchbares weg', () => {
    const out = migrateState({ log: [
      { d: '2026-01-01', sek: { 'lever-0': 15, 'lever-1': 0, 'lever-2': 12.5, 'lever-3': 4000, lever: 9, 'lever-4': '10' } },
      { d: '2026-01-02', sek: [1, 2] }
    ]});
    expect(out.log.map(l => l.sek)).toEqual([{ 'lever-0': 15 }, {}]);
  });

  /* Seit v16: die Einheit lag in einer Entlastungswoche. Nur ein echtes
     true zaehlt – "ja" aus einem fremden Backup ist keine Aussage. */
  it('behaelt die Entlastungswoche eines Eintrags', () => {
    const out = migrateState({ log: [
      { d: '2026-01-01', dl: true },
      { d: '2026-01-02', dl: 'ja' },
      { d: '2026-01-03' }
    ]});
    expect(out.log.map(l => l.dl)).toEqual([true, false, false]);
  });

  /* Seit v15: die Stufe je Uebung, auf der die Zahlen entstanden sind.
     Log-Eintraege werden hier Feld fuer Feld neu aufgebaut – ein Feld, das
     hier fehlt, ist nach dem naechsten Laden still weg. */
  it('behaelt die Stufe je Uebung und wirft Unbrauchbares weg', () => {
    const out = migrateState({ log: [
      { d: '2026-01-01', lv: { pushup: 3, dips: 0 } },
      { d: '2026-01-02', lv: { pushup: -1, dips: 2.5, squat: '2', row: 1 } },
      { d: '2026-01-03', lv: [3, 4] },
      { d: '2026-01-04', lv: 'viel' }
    ]});
    expect(out.log.map(l => l.lv)).toEqual([
      { pushup: 3, dips: 0 },
      { row: 1 },
      {},
      {}
    ]);
  });

  it('kappt die Stufen eines Eintrags wie seine Uebungen', () => {
    const viele = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['u' + i, 1]));
    const out = migrateState({ log: [{ d: '2026-01-01', lv: viele }] });
    expect(Object.keys(out.log[0].lv).length).toBeLessThanOrEqual(30);
  });

  /* Seit v6 traegt der Eintrag die trainierten Uebungen. Ein leeres Feld ist
     der Normalfall fuer Altbestaende – js/domain/log.js faellt dann zurueck. */
  it('uebernimmt die Uebungsliste und wirft Unbrauchbares daraus weg', () => {
    const out = migrateState({ log: [
      { d: '2026-01-01', day: 'A', ex: ['pushup', 7, '', null, 'squat'] },
      { d: '2026-01-02', day: 'A', ex: 'pushup' },       /* kein Array */
      { d: '2026-01-03', day: 'A' }                      /* Altbestand */
    ]});
    expect(out.log.map(l => l.ex)).toEqual([['pushup', 'squat'], [], []]);
  });

  it('kappt uebermaessig lange Uebungslisten', () => {
    const ex = Array.from({ length: MAX_EX_PER_ENTRY + 10 }, (_, i) => 'ex' + i);
    const out = migrateState({ log: [{ d: '2026-01-01', day: 'A', ex }] });
    expect(out.log[0].ex).toHaveLength(MAX_EX_PER_ENTRY);
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
  /* Die Satz-Modi hiessen bis hierher 'light' (hoechstens 3) und 'hard'
     (+1). 'hard' ist heute 'volumen'; fuer 'light' gibt es keine
     Entsprechung, der Standard sieht fast ueberall 3 Saetze vor. */
  it('setzt die alten Satz-Modi um', () => {
    expect(migrateState({ settings: { setsMode: 'hard' } }).settings.setsMode).toBe('volumen');
    expect(migrateState({ settings: { setsMode: 'light' } }).settings.setsMode).toBe('standard');
    expect(migrateState({ settings: { setsMode: 'kompakt' } }).settings.setsMode).toBe('kompakt');
  });

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

describe('migrateState – Revisionszaehler', () => {
  /* Am Zaehler haengt die Entscheidung, ob ein zweites Fenster den fremden
     Stand uebernimmt. Ein verbogener Wert wuerde sie still verdrehen. */
  it('faengt bei 0 an, wenn nichts dastand', () => {
    expect(migrateState({}).rev).toBe(0);
  });

  it('uebernimmt eine ganze Zahl', () => {
    expect(migrateState({ rev: 42 }).rev).toBe(42);
  });

  it('setzt alles Unbrauchbare auf 0 zurueck', () => {
    [-1, 2.5, NaN, Infinity, '7', null, {}].forEach(wert => {
      expect(migrateState({ rev: wert }).rev).toBe(0);
    });
  });
});

describe('migrateState – Ausruestung', () => {
  /* Ein Stand von vor v8 kennt das Feld nicht. Er muss sich danach genauso
     verhalten wie vorher, also mit allem verfuegbar – nicht mit nichts. */
  it('gibt einem alten Stand die volle Ausruestung', () => {
    expect(migrateState({ workouts: 3 }).equipment).toEqual(EQUIP_ALL);
  });

  it('uebernimmt eine Auswahl', () => {
    expect(migrateState({ equipment: ['bar', 'rings'] }).equipment).toEqual(['bar', 'rings']);
  });

  /* "Ich habe gar nichts" ist eine gueltige Antwort. Faellt sie auf die
     Vorgabe zurueck, verwirft jedes Laden die Einstellung wieder. */
  it('laesst eine leere Auswahl leer', () => {
    expect(migrateState({ equipment: [] }).equipment).toEqual([]);
  });

  it('wirft unbekannte Werte, Doppel und none heraus', () => {
    expect(migrateState({ equipment: ['bar', 'auto', 'bar', 'none'] }).equipment).toEqual(['bar']);
  });

  it('faellt bei einem Nicht-Array auf die Vorgabe zurueck', () => {
    expect(migrateState({ equipment: 'bar' }).equipment).toEqual(EQUIP_ALL);
    expect(migrateState({ equipment: { bar: true } }).equipment).toEqual(EQUIP_ALL);
    expect(migrateState({ equipment: null }).equipment).toEqual(EQUIP_ALL);
  });
});

describe('migrateState – Entlastungswoche', () => {
  it('ist standardmaessig nicht aktiv', () => {
    expect(migrateState({}).deload).toBe(null);
  });

  it('uebernimmt ein Enddatum', () => {
    expect(migrateState({ deload: { bis: '2026-08-08' } }).deload).toEqual({ bis: '2026-08-08' });
  });

  /* Default null laesst oben jeden Typ durch, hier laeuft aber ein
     Datumsvergleich hinein – wie bei lastBackup. */
  it('verwirft alles ohne brauchbares Datum', () => {
    [{ bis: 'bald' }, { bis: 20260808 }, {}, 'ja', 5, []].forEach(wert => {
      expect(migrateState({ deload: wert }).deload).toBe(null);
    });
  });
});

describe('migrateState – Trainingsdauer', () => {
  const mitDauer = v => migrateState({ log: [{ d: '2026-01-01', day: 'A', dauer: v }] }).log[0].dauer;

  it('uebernimmt eine plausible Dauer und rundet sie', () => {
    expect(mitDauer(2712)).toBe(2712);
    expect(mitDauer(2712.6)).toBe(2713);
    expect(mitDauer('1800')).toBe(1800);
  });

  it('macht aus allem Unbrauchbaren eine 0', () => {
    [undefined, null, 0, -60, 'lang', NaN, Infinity, {}].forEach(v => {
      expect(mitDauer(v)).toBe(0);
    });
  });

  /* Lieber "unbekannt" als eine Vierstunden-Einheit im Durchschnitt: wer die
     App offen liegen laesst, erzeugt sonst eine Zahl, die alles verzerrt. */
  it('verwirft eine unrealistisch lange Dauer, statt sie zu kappen', () => {
    expect(mitDauer(MAX_WORKOUT_SECS)).toBe(MAX_WORKOUT_SECS);
    expect(mitDauer(MAX_WORKOUT_SECS + 1)).toBe(0);
  });

  it('gibt Altbestaenden ohne Feld eine 0', () => {
    const out = migrateState({ log: [{ d: '2026-01-01', day: 'A', sets: 12 }] });
    expect(out.log[0].dauer).toBe(0);
  });
});

describe('migrateState – Einstieg', () => {
  it('ist bei einem leeren Stand offen', () => {
    expect(migrateState({}).onboarded).toBe(false);
    expect(DEFAULT_STATE().onboarded).toBe(false);
  });

  /* Der Einstieg fragt nach Startstufen. Wer schon trainiert hat, hat sie
     laengst – ihn danach zu fragen waere ein Rueckschritt. */
  it('gilt bei einem benutzten Stand als erledigt', () => {
    expect(migrateState({ v: 8, workouts: 3 }).onboarded).toBe(true);
    expect(migrateState({ v: 8, log: [{ d: '2026-01-01', day: 'A' }] }).onboarded).toBe(true);
    expect(migrateState({ v: 8, levels: { pushup: 2 } }).onboarded).toBe(true);
  });

  it('bleibt offen, wenn ein alter Stand nur eingerichtet, aber nie benutzt wurde', () => {
    expect(migrateState({ v: 8, settings: { rest: 60 }, theme: 'dark' }).onboarded).toBe(false);
  });

  /* Ein ausdruecklich gespeicherter Wert schlaegt die Vermutung oben. Sonst
     wuerde ein Backup, in dem der Einstieg bewusst offen steht, beim Laden
     stillschweigend als erledigt gelten. */
  it('respektiert einen ausdruecklich gesetzten Wert', () => {
    expect(migrateState({ onboarded: false, workouts: 9 }).onboarded).toBe(false);
    expect(migrateState({ onboarded: true }).onboarded).toBe(true);
    expect(migrateState({ onboarded: 'ja' }).onboarded).toBe(false);
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

  /* Der Zaehler gehoert dem Geraet, nicht der Datei. Kaeme er aus einem
     Backup, stuende nach dem Import ein fremder Stand gegen die Fenster
     dieses Geraets – und je nach Hoehe wuerde er sie ueberschreiben oder
     sofort wieder ueberschrieben. */
  it('uebernimmt den Revisionszaehler nicht aus dem Backup', () => {
    const out = clampBackup({ workouts: 3, rev: 999 }, EX);
    expect('rev' in out).toBe(false);
    expect(migrateState(out).rev).toBe(0);
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
    expect(out.log).toEqual([{ d: '2026-01-01', day: 'A', sets: 3, tops: 0, ups: [], ex: [], reps: {}, lv: {}, dl: false, sek: {}, dauer: 0 }]);
    expect(out.unbekannt).toBeUndefined();
  });

  it('liefert auch fuer ein leeres Backup einen vollstaendigen Stand', () => {
    expect(migrateState(clampBackup({}, EX))).toEqual(DEFAULT_STATE());
  });
});

describe('besserePR', () => {
  const reps = (n, lvl) => ({ v: n + ' Wdh', n, d: '2026-01-01', art: 'reps', lvl });
  const sek = (n, lvl) => ({ v: n + ' Sek', n, d: '2026-01-01', art: 'sek', lvl });

  it('nimmt jede Bestleistung an, wenn noch keine da ist', () => {
    expect(besserePR(null, reps(5, 0))).toBe(true);
    expect(besserePR(undefined, sek(30, 2))).toBe(true);
    expect(besserePR('kaputt', reps(5, 0))).toBe(true);
  });

  it('nimmt nichts an, was keine Bestleistung ist', () => {
    expect(besserePR(reps(5, 0), null)).toBe(false);
    expect(besserePR(reps(5, 0), 'mehr')).toBe(false);
  });

  it('vergleicht bei gleicher Art die Zahl', () => {
    expect(besserePR(reps(8, 1), reps(9, 1))).toBe(true);
    expect(besserePR(reps(8, 1), reps(8, 1))).toBe(false);
    expect(besserePR(reps(8, 3), reps(7, 4))).toBe(false);
  });

  /* Der Fehler, um den es geht: der Handstand zaehlt auf Stufe 0-1 Versuche
     und ab Stufe 2 Sekunden. "8 Versuche" hat einen freien Handstand ueber
     5 und ueber 20 Sekunden dauerhaft blockiert. */
  it('laesst eine andere Masseinheit von einer hoeheren Stufe durch', () => {
    expect(besserePR(reps(8, 1), sek(5, 2))).toBe(true);
    expect(besserePR(reps(8, 1), sek(20, 3))).toBe(true);
  });

  it('laesst eine andere Masseinheit von einer niedrigeren Stufe nicht durch', () => {
    expect(besserePR(sek(30, 3), reps(10, 1))).toBe(false);
  });

  it('laesst die gleiche Stufe durch – die Leiter hat dort die Einheit gewechselt', () => {
    expect(besserePR(reps(8, 2), sek(5, 2))).toBe(true);
  });

  /* Ein Altbestand hat keine Stufe; der neuere Eintrag weiss mehr. */
  it('behandelt eine fehlende Stufe wie Stufe 0', () => {
    expect(besserePR({ v: '8 Wdh', n: 8, art: 'reps' }, sek(5, 0))).toBe(true);
    expect(besserePR({ v: '8 Wdh', n: 8, art: 'reps' }, { v: '5 Sek', n: 5, art: 'sek' })).toBe(true);
  });
});

describe('migrateState – Bestleistungen', () => {
  const pr = roh => migrateState({ prs: { handstand: roh } }).prs.handstand;

  it('erschliesst die Masseinheit aus dem Text', () => {
    expect(pr({ v: '30 Sek', n: 30 }).art).toBe('sek');
    expect(pr({ v: '30 sec', n: 30 }).art).toBe('sek');
    expect(pr({ v: '8 Wdh', n: 8 }).art).toBe('reps');
    expect(pr({ v: 'sauber!' }).art).toBe('reps');
  });

  it('laesst eine vorhandene Angabe stehen', () => {
    expect(pr({ v: '8 Wdh', n: 8, art: 'sek' }).art).toBe('sek');
    expect(pr({ v: '8 Wdh', n: 8, art: 'quatsch' }).art).toBe('reps');
  });

  it('uebernimmt eine brauchbare Stufe und laesst den Rest offen', () => {
    expect(pr({ v: '8 Wdh', n: 8, lvl: 3 }).lvl).toBe(3);
    expect(pr({ v: '8 Wdh', n: 8, lvl: '2' }).lvl).toBe(2);
    expect(pr({ v: '8 Wdh', n: 8, lvl: -1 })).not.toHaveProperty('lvl');
    expect(pr({ v: '8 Wdh', n: 8, lvl: 'oben' })).not.toHaveProperty('lvl');
    expect(pr({ v: '8 Wdh', n: 8 })).not.toHaveProperty('lvl');
  });

  it('wirft kaputte Eintraege weg und laesst die Zahl unangetastet', () => {
    const out = migrateState({ prs: { a: null, b: 'nein', c: { v: '9 Wdh', n: 9 } } });
    expect(Object.keys(out.prs)).toEqual(['c']);
    expect(prNumber(out.prs.c)).toBe(9);
  });
});

describe('migrateState – Wochenrhythmus', () => {
  it('ist standardmaessig leer', () => {
    expect(migrateState({}).wochenplan).toEqual({});
    expect(DEFAULT_STATE().wochenplan).toEqual({});
  });

  it('uebernimmt eine Zuordnung', () => {
    expect(migrateState({ wochenplan: { 1: 'A', 3: 'B' } }).wochenplan).toEqual({ 1: 'A', 3: 'B' });
  });

  it('laesst nur die sieben Wochentage zu', () => {
    expect(migrateState({ wochenplan: { 0: 'A', 6: 'B', 7: 'C', '-1': 'D', mo: 'E' } }).wochenplan)
      .toEqual({ 0: 'A', 6: 'B' });
  });

  /* Dieselbe Bereinigung wie fuer jeden Tagesschluessel: harmlose Zeichen,
     gekuerzt, ohne Rand. Eine Zahl ist ein gueltiger Tagesname – wer seinen
     Plan-Tag "5" nennt, darf ihn auch auf einen Wochentag legen. */
  it('bereinigt den Tagesschluessel und wirft Leeres weg', () => {
    const out = migrateState({ wochenplan: { 1: '  A  ', 2: '', 3: null, 4: 5, 5: '<b>X' } });
    expect(out.wochenplan[1]).toBe('A');
    expect(out.wochenplan[2]).toBeUndefined();
    expect(out.wochenplan[3]).toBeUndefined();
    expect(out.wochenplan[4]).toBe('5');
    expect(out.wochenplan[5]).toBe('bX');
  });

  /* Der Plan darf wechseln, ohne die Zuordnung zu loeschen – gelesen wird
     sie ohnehin nur, wenn getDay() etwas liefert. */
  it('behaelt einen Tag, den der aktuelle Plan nicht kennt', () => {
    expect(migrateState({ wochenplan: { 1: 'Z' } }).wochenplan).toEqual({ 1: 'Z' });
  });

  it('vertraegt kaputte Eingaben', () => {
    expect(migrateState({ wochenplan: 'nein' }).wochenplan).toEqual({});
    expect(migrateState({ wochenplan: [1, 2] }).wochenplan).toEqual({});
    expect(migrateState({ wochenplan: null }).wochenplan).toEqual({});
  });
});

describe('migrateState – byDay ist fort', () => {
  /* Seit v11: der Zaehler wurde nie gelesen und konnte nicht stimmen.
     Gezaehlt wird im Log (zaehleJeTag in domain/log.js). */
  it('uebernimmt einen alten Zaehler nicht', () => {
    expect(migrateState({ v: 10, byDay: { A: 12 } })).not.toHaveProperty('byDay');
  });

  it('laesst ihn auch aus einem Backup nicht herein', () => {
    expect(clampBackup({ byDay: { A: 12 }, workouts: 3 }, EX)).toEqual({ workouts: 3 });
  });
});

/* Beide Felder wurden geschrieben, standen aber nicht in DEFAULT_STATE – und
   migrateState() kopiert ausschliesslich, was dort steht. Ein selbst
   gesetztes Ziel und ein weggeklickter Plateau-Hinweis waren nach dem
   naechsten Laden fort. */
describe('migrateState – eigene Ziele und weggeklickte Hinweise', () => {
  it('behaelt eigene Meilensteine', () => {
    const s = migrateState({ customMilestones: [{ id: 'custom-1', name: 'Muscle-up' }] });
    expect(s.customMilestones).toEqual([{ id: 'custom-1', name: 'Muscle-up' }]);
  });

  it('wirft Eintraege ohne Kennung oder Namen weg', () => {
    const s = migrateState({ customMilestones: [
      { id: 'custom-1', name: 'Bleibt' },
      { id: 'custom-2' },
      { name: 'Ohne Kennung' },
      { id: '', name: 'Leere Kennung' },
      { id: 'custom-3', name: '' },
      'kein Objekt', null
    ] });
    expect(s.customMilestones).toEqual([{ id: 'custom-1', name: 'Bleibt' }]);
  });

  it('kappt die Liste bei MAX_CUSTOM_MILESTONES', () => {
    const viele = Array.from({ length: MAX_CUSTOM_MILESTONES + 20 },
      (_, i) => ({ id: 'custom-' + i, name: 'Ziel ' + i }));
    expect(migrateState({ customMilestones: viele }).customMilestones)
      .toHaveLength(MAX_CUSTOM_MILESTONES);
  });

  it('behaelt das weggeklickte Plateau-Banner, aber nur als echtes true', () => {
    expect(migrateState({ deloadPlateauDismissed: true }).deloadPlateauDismissed).toBe(true);
    ['ja', 1, {}].forEach(wert => {
      expect(migrateState({ deloadPlateauDismissed: wert }).deloadPlateauDismissed).toBe(false);
    });
    expect(migrateState({}).deloadPlateauDismissed).toBe(false);
  });

  it('behaelt abgelehnte Plan-Vorschlaege, nur in der Form alt>neu und ohne Dopplung', () => {
    expect(migrateState({}).planHinweiseAus).toEqual([]);
    expect(migrateState({ planHinweiseAus: ['pushup>archer_push', 'pushup>archer_push', 'kaputt', 3, '<b>>x'] }).planHinweiseAus)
      .toEqual(['pushup>archer_push']);
    expect(migrateState({ planHinweiseAus: 'pushup>archer_push' }).planHinweiseAus).toEqual([]);
    const viele = Array.from({ length: 150 }, (_, i) => 'a' + i + '>b');
    const out = migrateState({ planHinweiseAus: viele }).planHinweiseAus;
    expect(out).toHaveLength(100);
    expect(out[99]).toBe('a149>b');
  });

  it('kuerzt einen ueberlangen Namen beim Import', () => {
    const lang = 'x'.repeat(200);
    const out = clampBackup({ customMilestones: [{ id: 'custom-1', name: lang }] }, EX);
    expect(out.customMilestones[0].name).toHaveLength(60);
  });
});

describe('migrateState – Trainingserinnerung', () => {
  it('behaelt den Schalter', () => {
    /* Der Schluessel fehlte in SETTINGS_DEFAULTS – und was dort nicht steht,
       wird verworfen. Die Erinnerung war nach jedem Neuladen wieder aus. */
    expect(SETTINGS_DEFAULTS.reminder).toBe(false);
    expect(migrateState({ settings: { reminder: true } }).settings.reminder).toBe(true);
  });

  it('nimmt nur ein ISO-Datum als letzte Erinnerung', () => {
    expect(migrateState({ erinnertAm: '2026-08-19' }).erinnertAm).toBe('2026-08-19');
    ['heute', '19.08.2026', 42, true].forEach(wert => {
      expect(migrateState({ erinnertAm: wert }).erinnertAm).toBeNull();
    });
  });
});

import { describe, it, expect } from 'vitest';
import { EXERCISES, EX_BY_ID, PLAN_TEMPLATES } from '../js/exercises.js';
import { GRUPPEN, wochenTage, wochenbilanz, MIN_SAETZE_WOCHE, istBilanz, istLuecken } from '../js/domain/bilanz.js';
import { isoDaysAgo } from '../js/domain/dates.js';
import { zielAuswerten } from '../js/domain/target.js';
import { MUSTER_NAMEN, vorlageAufloesen } from '../js/domain/planbuilder.js';
import { EQUIP_ALL } from '../js/domain/equipment.js';

const arten = b => b.warnungen.map(w => w.art + (w.gruppe ? ':' + w.gruppe : ''));
const tag = (key, ex) => ({ key, title: key, sub: '', ex });

describe('wochenTage', () => {
  const days = [tag('A', []), tag('B', [])];

  it('nimmt ohne Rhythmus die ersten Einheiten der Rotation', () => {
    expect(wochenTage(days, {}, 4).map(d => d.key)).toEqual(['A', 'B', 'A', 'B']);
    expect(wochenTage(days, null, 3).map(d => d.key)).toEqual(['A', 'B', 'A']);
  });

  it('nimmt mit Rhythmus die zugeordneten Tage, Montag zuerst', () => {
    expect(wochenTage(days, { 0: 'A', 1: 'B', 3: 'A' }, 6).map(d => d.key)).toEqual(['B', 'A', 'A']);
  });

  it('uebergeht Zuordnungen auf Tage, die es nicht mehr gibt', () => {
    expect(wochenTage(days, { 1: 'Z' }, 2).map(d => d.key)).toEqual(['A', 'B']);
  });

  it('faellt ohne brauchbares Wochenziel auf einen Durchlauf zurueck', () => {
    expect(wochenTage(days, {}, 'x').length).toBe(2);
    expect(wochenTage(days, {}, 99).length).toBe(7);
    expect(wochenTage([], {}, 3)).toEqual([]);
    expect(wochenTage(null, {}, 3)).toEqual([]);
  });
});

describe('wochenbilanz', () => {
  it('ordnet jedes Kraftmuster genau einer Gruppe zu', () => {
    const zugeordnet = Object.values(GRUPPEN).flat();
    expect(new Set(zugeordnet).size).toBe(zugeordnet.length);
    zugeordnet.forEach(m => expect(MUSTER_NAMEN).toContain(m));
  });

  it('zaehlt Saetze und Tage je Gruppe', () => {
    const woche = [tag('A', ['pushup', 'pullup', 'squat']), tag('B', ['pushup', 'glute_bridge'])];
    const b = wochenbilanz(woche, EX_BY_ID);
    expect(b.einheiten).toBe(2);
    expect(b.gruppen.druecken.tage).toBe(2);
    expect(b.gruppen.ziehen.tage).toBe(1);
    expect(b.gruppen.beine.tage).toBe(2);
    expect(b.gruppen.druecken.saetze).toBe(2 * EX_BY_ID.pushup.levels[0].saetze);
  });

  it('zaehlt die Saetze der eigenen Stufe und des Satz-Modus', () => {
    const woche = [tag('A', ['pushup'])];
    const lvl = EX_BY_ID.pushup.levels.length - 1;
    expect(wochenbilanz(woche, EX_BY_ID, { pushup: lvl }).gruppen.druecken.saetze)
      .toBe(EX_BY_ID.pushup.levels[lvl].saetze);
    expect(wochenbilanz(woche, EX_BY_ID, {}, 'kompakt').gruppen.druecken.saetze).toBe(2);
    /* Eine Stufe jenseits der Leiter zaehlt wie die letzte. */
    expect(wochenbilanz(woche, EX_BY_ID, { pushup: 99 }).gruppen.druecken.saetze)
      .toBe(EX_BY_ID.pushup.levels[lvl].saetze);
  });

  it('laesst Skills, Mobility und Unbekanntes aus', () => {
    const b = wochenbilanz([tag('A', ['handstand', 'wrist_prep', 'gibtsnicht'])], EX_BY_ID);
    Object.values(b.gruppen).forEach(w => expect(w.saetze).toBe(0));
  });

  it('meldet fehlende, seltene und schwach besetzte Gruppen', () => {
    const b = wochenbilanz([tag('A', ['pushup', 'pullup', 'squat', 'glute_bridge']), tag('B', ['pushup', 'pullup', 'hollow'])], EX_BY_ID);
    expect(arten(b)).toContain('selten:beine');
    expect(arten(b)).toContain('selten:rumpf');
    expect(arten(wochenbilanz([tag('A', ['pushup'])], EX_BY_ID))).toEqual(
      expect.arrayContaining(['fehlt:ziehen', 'fehlt:beine', 'fehlt:rumpf']));
    /* Eine einzige Einheit ist keine Luecke in der Haeufigkeit. */
    expect(arten(wochenbilanz([tag('A', ['pushup'])], EX_BY_ID))).not.toContain('selten:druecken');
    const wenig = wochenbilanz([tag('A', ['pushup']), tag('B', ['pushup'])], EX_BY_ID, {}, 'kompakt');
    expect(wenig.gruppen.druecken.saetze).toBeLessThan(MIN_SAETZE_WOCHE);
    expect(arten(wenig)).toContain('wenig:druecken');
  });

  it('meldet Beine ohne Hueftbeuge', () => {
    const ohne = wochenbilanz([tag('A', ['squat']), tag('B', ['squat'])], EX_BY_ID);
    expect(arten(ohne)).toContain('huefte');
    const mit = wochenbilanz([tag('A', ['squat']), tag('B', ['nordic'])], EX_BY_ID);
    expect(arten(mit)).not.toContain('huefte');
    expect(mit.huefte).toBe(true);
  });

  it('meldet deutlich mehr Druecken als Ziehen, nicht umgekehrt', () => {
    const d = [tag('A', ['pushup', 'dips', 'pike', 'row']), tag('B', ['pushup', 'dips', 'pike', 'row'])];
    expect(arten(wochenbilanz(d, EX_BY_ID))).toContain('zugWenig');
    const z = [tag('A', ['pushup', 'pullup', 'row']), tag('B', ['pushup', 'pullup', 'row'])];
    expect(arten(wochenbilanz(z, EX_BY_ID))).not.toContain('zugWenig');
  });

  it('bleibt ohne Woche ohne Warnung', () => {
    expect(wochenbilanz([], EX_BY_ID).warnungen).toEqual([]);
    expect(wochenbilanz(null).einheiten).toBe(0);
  });

  it('kennt jede Uebung im Katalog oder laesst sie aus', () => {
    expect(() => wochenbilanz([tag('A', EXERCISES.map(e => e.id))], EX_BY_ID)).not.toThrow();
  });

  it('zaehlt die Vorlagen ohne Absturz', () => {
    Object.values(PLAN_TEMPLATES).forEach(p => {
      expect(wochenbilanz(wochenTage(p.days, {}, 4), EX_BY_ID).einheiten).toBe(4);
    });
  });
});

describe('Vorlagen', () => {
  /* Die Haeufigkeit, fuer die jede Vorlage gedacht ist (siehe ihr Name). */
  const PRO_WOCHE = { ab4: 4, full3: 3, ppl: 6, skill: 4 };

  it('kennt fuer jede Vorlage ihre Haeufigkeit', () => {
    expect(Object.keys(PRO_WOCHE).sort()).toEqual(Object.keys(PLAN_TEMPLATES).sort());
  });

  /* Ganz ohne Geraet gibt der Katalog nur zwei Zuguebungen her
     (Tuerrahmen-Rudern, Y-T-W); dort bleibt die Warnung ehrlich stehen. */
  it('bleiben mit Geraet ohne Warnung der Wochenbilanz', () => {
    for(const [id, p] of Object.entries(PLAN_TEMPLATES)){
      for(const equipment of [EQUIP_ALL, ['bar'], ['chair'], ['rings']]){
        const days = vorlageAufloesen(p, EXERCISES, equipment).days;
        const b = wochenbilanz(wochenTage(days, {}, PRO_WOCHE[id]), EX_BY_ID);
        expect(arten(b), id + ' ' + equipment.join(',')).toEqual([]);
      }
    }
  });
});

describe('Ist-Bilanz aus dem Log', () => {
  /* Mittwoch, 30.09.2026 – KW40. */
  const NOW = new Date(2026, 8, 30, 12);
  const vor = tage => isoDaysAgo(tage, NOW);
  const saetze = (id, n, feld = 'reps') => ({ [feld]: Object.fromEntries([...Array(n)].map((_, s) => [id + '-' + s, 8])) });
  const eintrag = (d, ...teile) => ({ d, day: 'A', ex: [], sets: 0, reps: {}, sek: {},
    ...teile.reduce((a, t) => ({ reps: { ...a.reps, ...t.reps }, sek: { ...a.sek, ...t.sek } }), {}) });

  it('zaehlt die Saetze je Gruppe, ohne Skills und Mobility', () => {
    const log = [eintrag(vor(7), saetze('pushup', 3), saetze('pullup', 4), saetze('plank', 2, 'sek'),
      saetze('wall_hs', 3, 'sek'), saetze('wrist_prep', 2, 'sek'))];
    log[0].reps['squat-0'] = 0;
    const b = istBilanz(log, EX_BY_ID, { now: NOW });
    const kw39 = b.wochen.find(w => w.key === '2026-KW39');
    expect(kw39.gruppen).toEqual({ druecken: 3, ziehen: 4, beine: 0, rumpf: 2 });
    expect(kw39.einheiten).toBe(1);
  });

  it('beginnt mit der ersten Einheit und schneidet die laufende Woche aus dem Schnitt', () => {
    const log = [
      eintrag(vor(14), saetze('pushup', 4)),
      eintrag(vor(7), saetze('pushup', 2)),
      eintrag(vor(0), saetze('pushup', 9))
    ];
    const b = istBilanz(log, EX_BY_ID, { wochen: 5, now: NOW });
    expect(b.wochen.map(w => w.key)).toEqual(['2026-KW38', '2026-KW39', '2026-KW40']);
    expect(b.wochen.map(w => w.laufend)).toEqual([false, false, true]);
    expect(b.schnitt.druecken).toBe(3);
    expect(b.geschaetzt).toBe(false);
  });

  it('zaehlt eine Woche ohne Training als null, wenn sie nach dem Anfang liegt', () => {
    const b = istBilanz([eintrag(vor(21), saetze('squat', 6))], EX_BY_ID, { wochen: 5, now: NOW });
    expect(b.wochen.map(w => w.gruppen.beine)).toEqual([6, 0, 0, 0]);
    expect(b.schnitt.beine).toBe(2);
  });

  it('rechnet nachgetragene Einheiten mit den Saetzen ihrer Stufe', () => {
    const l = { d: vor(7), day: 'A', ex: ['pushup', 'squat'], sets: 7, reps: {}, dauer: 0, lv: { pushup: 3 } };
    const b = istBilanz([l], EX_BY_ID, { now: NOW, levels: { squat: 1 } });
    const w = b.wochen.find(x => x.key === '2026-KW39');
    expect(w.gruppen.druecken).toBe(zielAuswerten(EX_BY_ID.pushup.levels[3]).sets);
    expect(w.gruppen.beine).toBe(zielAuswerten(EX_BY_ID.squat.levels[1]).sets);
    expect(b.geschaetzt).toBe(true);
  });

  it('hat ohne volle Woche keinen Schnitt und ohne Log keine Wochen', () => {
    expect(istBilanz([eintrag(vor(0), saetze('pushup', 3))], EX_BY_ID, { now: NOW }).schnitt).toBeNull();
    expect(istBilanz([], EX_BY_ID, { now: NOW })).toEqual({ wochen: [], schnitt: null, geschaetzt: false });
    expect(istBilanz(null, EX_BY_ID, { now: NOW }).wochen).toEqual([]);
  });

  it('meldet Gruppen unter drei Vierteln des Plans oder unter dem Minimum', () => {
    const soll = { druecken: { saetze: 20 }, ziehen: { saetze: 20 }, beine: { saetze: 5 }, rumpf: { saetze: 0 } };
    expect(istLuecken({ druecken: 15, ziehen: 14, beine: 4, rumpf: 0 }, soll)).toEqual(['ziehen', 'beine']);
    expect(istLuecken({ druecken: 15, ziehen: 15, beine: 5, rumpf: 0 }, soll)).toEqual([]);
    expect(istLuecken(null, soll)).toEqual([]);
    expect(istLuecken({ druecken: 0 }, null)).toEqual([]);
    expect(MIN_SAETZE_WOCHE).toBe(6);
  });
});

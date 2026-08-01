import { describe, it, expect } from 'vitest';
import { meilensteinStatus, erkannteMeilensteine } from '../js/domain/milestones.js';
import { MILESTONES, EX_BY_ID } from '../js/exercises.js';

const leiter = n => Array.from({ length: n }, (_, i) => ({ stage: 'S' + i, target: '4 × 8' }));
const EX = {
  pullup: { id: 'pullup', levels: leiter(6) },
  hang: { id: 'hang', levels: leiter(5) }
};

const MS = [
  { id: 'pullup1', name: 'Erster Klimmzug', when: { ex: 'pullup', lvl: 2, reps: 1 } },
  { id: 'hang60', name: '60 Sek Dead Hang', when: { ex: 'hang', lvl: 2, sek: 60 } },
  { id: 'ohneBedingung', name: 'Irgendwas' }
];

const reps = (n, lvl) => ({ v: n + ' Wdh', n, art: 'reps', lvl, d: '2026-01-01' });
const sek = (n, lvl) => ({ v: n + ' Sek', n, art: 'sek', lvl, d: '2026-01-01' });
const status = (ms, levels, prs) => meilensteinStatus(ms, { levels, prs, exById: EX });

describe('meilensteinStatus', () => {
  it('erkennt eine erfuellte Wiederholungsbedingung', () => {
    const s = status(MS[0], { pullup: 3 }, { pullup: reps(5, 3) });
    expect(s).toMatchObject({ bekannt: true, erfuellt: true, fehlt: null });
  });

  it('erkennt eine erfuellte Haltebedingung', () => {
    expect(status(MS[1], { hang: 2 }, { hang: sek(60, 2) }).erfuellt).toBe(true);
  });

  /* Auf der Stufe angekommen zu sein heisst nicht, den Wert zu schaffen. */
  it('laesst die Stufe allein nicht reichen', () => {
    const s = status(MS[0], { pullup: 4 }, {});
    expect(s.erfuellt).toBe(false);
    expect(s.lvlOk).toBe(true);
    expect(s.fehlt).toEqual({ wert: 1, art: 'reps' });
  });

  /* 15 Wiederholungen auf Knie-Liegestuetzen sind keine 15 vollen. */
  it('laesst den Wert allein nicht reichen', () => {
    const s = status(MS[0], { pullup: 0 }, { pullup: reps(9, 0) });
    expect(s.erfuellt).toBe(false);
    expect(s.wertOk).toBe(true);
    expect(s.fehlt).toEqual({ lvl: 2 });
  });

  it('nennt beides, wenn beides fehlt', () => {
    expect(status(MS[0], {}, {}).fehlt).toEqual({ lvl: 2, wert: 1, art: 'reps' });
  });

  /* Eine Bestleistung in Sekunden sagt ueber Wiederholungen nichts aus –
     dieselbe Trennung wie in besserePR(). */
  it('zaehlt nur eine Bestleistung derselben Masseinheit', () => {
    expect(status(MS[0], { pullup: 3 }, { pullup: sek(90, 3) }).erfuellt).toBe(false);
    expect(status(MS[1], { hang: 3 }, { hang: reps(90, 3) }).erfuellt).toBe(false);
  });

  /* Eine Luecke in den Daten darf nicht als "nicht geschafft" durchgehen. */
  it('meldet einen Meilenstein ohne Bedingung als unbekannt', () => {
    expect(status(MS[2], { pullup: 5 }, {})).toEqual({ bekannt: false, erfuellt: false, fehlt: null });
  });

  it('meldet eine unbrauchbare Bedingung als unbekannt', () => {
    [
      { when: { ex: 'gibtsnicht', lvl: 0, reps: 1 } },
      { when: { ex: 'pullup', reps: 1 } },
      { when: { ex: 'pullup', lvl: -1, reps: 1 } },
      { when: { ex: 'pullup', lvl: 1 } },
      { when: {} },
      {}
    ].forEach(ms => expect(status(ms, { pullup: 9 }, { pullup: reps(99, 9) }).bekannt).toBe(false));
  });

  it('vertraegt kaputte Eingaben', () => {
    expect(meilensteinStatus(null).bekannt).toBe(false);
    expect(meilensteinStatus(MS[0]).bekannt).toBe(false);
    expect(meilensteinStatus(MS[0], { exById: EX }).erfuellt).toBe(false);
  });
});

describe('erkannteMeilensteine', () => {
  const daten = { levels: { pullup: 3, hang: 2 }, prs: { pullup: reps(5, 3), hang: sek(60, 2) }, exById: EX };

  it('nennt alles Erfuellte in der Reihenfolge der Liste', () => {
    expect(erkannteMeilensteine(MS, daten)).toEqual(['pullup1', 'hang60']);
  });

  it('laesst bereits Eingetragenes weg', () => {
    expect(erkannteMeilensteine(MS, { ...daten, milestones: { pullup1: '2026-01-01' } }))
      .toEqual(['hang60']);
  });

  it('schlaegt nichts ohne Bedingung vor', () => {
    expect(erkannteMeilensteine(MS, daten)).not.toContain('ohneBedingung');
  });

  it('vertraegt kaputte Eingaben', () => {
    expect(erkannteMeilensteine(null, daten)).toEqual([]);
    expect(erkannteMeilensteine(MS)).toEqual([]);
    expect(erkannteMeilensteine([null, {}, { id: 'x' }], daten)).toEqual([]);
  });
});

/* Gegen die echten Daten: eine gekuerzte Leiter oder eine umbenannte Uebung
   soll hier auffallen und nicht erst, wenn ein Meilenstein stumm bleibt. */
describe('MILESTONES gegen die echten Uebungsdaten', () => {
  it('nennt zu jedem Meilenstein eine Bedingung', () => {
    MILESTONES.forEach(m => expect(m.when, m.id).toBeTruthy());
  });

  it('verweist nur auf vorhandene Uebungen und gueltige Stufen', () => {
    MILESTONES.forEach(m => {
      const ex = EX_BY_ID[m.when.ex];
      expect(ex, m.id + ' -> ' + m.when.ex).toBeTruthy();
      expect(m.when.lvl, m.id).toBeLessThan(ex.levels.length);
      expect(m.when.lvl, m.id).toBeGreaterThanOrEqual(0);
    });
  });

  it('nennt je Bedingung genau eine Masseinheit', () => {
    MILESTONES.forEach(m => {
      const hatReps = Number.isFinite(m.when.reps), hatSek = Number.isFinite(m.when.sek);
      expect(hatReps !== hatSek, m.id).toBe(true);
    });
  });

  /* Die geforderte Zahl muss auf der genannten Stufe ueberhaupt erreichbar
     sein – sonst waere der Meilenstein per Konstruktion unerreichbar. */
  it('fordert nichts, was die Leiter dort nicht hergibt', () => {
    MILESTONES.forEach(m => {
      const ex = EX_BY_ID[m.when.ex];
      const erreichbar = ex.levels.slice(m.when.lvl).some(l => {
        const t = String(l.target);
        const zahlen = (t.match(/\d+/g) || []).map(Number);
        const max = Math.max(...zahlen.slice(1), 0);
        return /Sek/.test(t) === Number.isFinite(m.when.sek) &&
          max >= (Number.isFinite(m.when.sek) ? m.when.sek : m.when.reps);
      });
      expect(erreichbar, m.id).toBe(true);
    });
  });
});

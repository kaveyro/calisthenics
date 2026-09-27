import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPlan, KRAFTSAETZE_JE_KATEGORIE, kraftsaetze } from '../js/domain/planbuilder.js';
import { EQUIP_ALL, exMoeglich, levelMoeglich } from '../js/domain/equipment.js';

/* Gegen die ECHTE Uebungsliste geprueft, nicht gegen einen Nachbau: der
   Generator ist nur so gut wie der Bestand, aus dem er waehlt. Ein Plan, der
   auf erfundenen Daten aufgeht und mit den echten einen leeren Tag liefert,
   waere ohne Nutzen. Geladen wie in test/i18n.test.js. */
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const quelle = readFileSync(ROOT + 'js/exercises.js', 'utf8').replace(/^export /gm, '');
const { EXERCISES } = new Function(quelle + '; return { EXERCISES };')();
const EX_BY_ID = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

const TEXTE = {
  name: 'Eigener Plan', desc: 'Aus deiner Ausrüstung', sub: 'generiert',
  ganzkoerper: 'Ganzkörper',
  kat: { push: 'Drücken', pull: 'Ziehen', legs: 'Beine', core: 'Rumpf', skill: 'Skills', mobility: 'Mobility' }
};
const bauen = (opts = {}) => buildPlan({
  exercises: EXERCISES, equipment: EQUIP_ALL, tage: 3, fokus: 'ausgewogen', texte: TEXTE, ...opts
});

describe('Grundzusagen', () => {
  /* Diese vier gelten fuer JEDE Kombination – deshalb ueber alle durchgespielt
     statt an einem Beispiel behauptet. */
  const faelle = [];
  for(const tage of [2, 3, 4, 5, 6]){
    for(const fokus of ['kraft', 'ausgewogen', 'skill']){
      for(const equipment of [[], ['chair'], ['bar'], ['rings'], ['bar', 'band'], EQUIP_ALL]){
        faelle.push({ tage, fokus, equipment });
      }
    }
  }

  it('liefert genau so viele Tage wie verlangt', () => {
    faelle.forEach(f => {
      expect(bauen(f).days, JSON.stringify(f)).toHaveLength(f.tage);
    });
  });

  it('laesst keinen Tag leer', () => {
    faelle.forEach(f => {
      bauen(f).days.forEach(d => {
        expect(d.ex.length, JSON.stringify(f) + ' Tag ' + d.key).toBeGreaterThan(0);
      });
    });
  });

  it('nennt nur Uebungen, die es gibt, und keine zweimal am selben Tag', () => {
    faelle.forEach(f => {
      bauen(f).days.forEach(d => {
        d.ex.forEach(id => expect(EX_BY_ID[id], id).toBeTruthy());
        expect(new Set(d.ex).size).toBe(d.ex.length);
      });
    });
  });

  /* Der eigentliche Zweck: was hier steht, muss der Nutzer auch ausfuehren
     koennen. Mindestens eine Stufe je Uebung muss mit seiner Ausruestung gehen. */
  it('nennt nur Uebungen, die mit der Ausruestung machbar sind', () => {
    faelle.forEach(f => {
      bauen(f).days.forEach(d => {
        d.ex.forEach(id => {
          expect(exMoeglich(EX_BY_ID[id], f.equipment), id + ' bei ' + JSON.stringify(f.equipment))
            .toBe(true);
          const stufen = EX_BY_ID[id].levels.map((_, i) => levelMoeglich(EX_BY_ID[id], i, f.equipment));
          expect(stufen.some(Boolean)).toBe(true);
        });
      });
    });
  });

  it('gibt jedem Tag einen eigenen Schluessel und einen Titel', () => {
    faelle.forEach(f => {
      const p = bauen(f);
      const keys = p.days.map(d => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      p.days.forEach(d => expect(d.title.trim()).not.toBe(''));
    });
  });
});

describe('Tageszahl', () => {
  it('kappt Unsinn auf 2 bis 6', () => {
    expect(bauen({ tage: 0 }).days).toHaveLength(2);
    expect(bauen({ tage: 99 }).days).toHaveLength(6);
    expect(bauen({ tage: 'drei' }).days).toHaveLength(3);   /* Number('drei') || 3 */
    expect(bauen({ tage: undefined }).days).toHaveLength(3);
  });

  /* Bei sechs Tagen kommen Push, Pull und Beine zweimal vor. Die beiden Tage
     duerfen nicht dieselbe Liste bekommen, sonst wirkt der Plan kaputt. */
  it('wiederholt bei sechs Tagen keine identische Liste', () => {
    const listen = bauen({ tage: 6 }).days.map(d => d.ex.join(','));
    expect(new Set(listen).size).toBe(6);
  });
});

describe('Schwerpunkt', () => {
  const ids = p => p.days.flatMap(d => d.ex);

  it('laesst bei Kraft die Skills weg', () => {
    const p = bauen({ tage: 4, fokus: 'kraft' });
    const skills = ids(p).filter(id => EX_BY_ID[id].cat === 'skill');
    expect(skills).toEqual([]);
  });

  it('stellt bei Skills eine Skill-Uebung an den Anfang jedes Tages', () => {
    const p = bauen({ tage: 4, fokus: 'skill' });
    p.days.forEach(d => {
      /* Die Handgelenks-Routine ist Pflicht und steht davor – sie zaehlt nicht. */
      const erste = d.ex[0] === 'wrist_prep' ? d.ex[1] : d.ex[0];
      expect(EX_BY_ID[erste].cat, 'Tag ' + d.key + ': ' + d.ex.join(',')).toBe('skill');
    });
  });

  it('verteilt die Skills ueber die Tage, statt ueberall dieselbe zu nennen', () => {
    const p = bauen({ tage: 4, fokus: 'skill' });
    const erste = p.days.map(d => d.ex[0] === 'wrist_prep' ? d.ex[1] : d.ex[0]);
    expect(new Set(erste).size).toBeGreaterThan(1);
  });

  it('faellt bei unbekanntem Schwerpunkt auf ausgewogen zurueck', () => {
    expect(bauen({ fokus: 'quatsch' })).toEqual(bauen({ fokus: 'ausgewogen' }));
  });
});

describe('Ausruestung', () => {
  it('baut ohne jedes Geraet einen reinen Boden-Plan', () => {
    const p = bauen({ tage: 3, equipment: [] });
    const alle = p.days.flatMap(d => d.ex);
    expect(alle.length).toBeGreaterThan(6);
    alle.forEach(id => expect(EX_BY_ID[id].equip).toEqual(['none']));
    expect(p.days[0].title).toBe('Drücken');
  });

  /* Bis zu Tuerrahmen-Rudern und Y-T-W gab es ohne Geraet keine einzige
     Zuguebung, und der Zugtag hiess "Ganzkörper". */
  it('baut ohne Geraet einen echten Zugtag', () => {
    const p = bauen({ tage: 3, equipment: [] });
    expect(p.days[1].title).toBe('Ziehen');
    expect(p.days[1].ex).toEqual(expect.arrayContaining(['towel_row', 'prone_ytw']));
  });

  it('laesst bei vorhandener Stange die Klimmzuege vorn', () => {
    const zug = bauen({ tage: 3, equipment: ['bar'] }).days[1].ex;
    expect(zug).toContain('pullup');
    /* prio 2 und am Ende der Zugsektion: das Tuerrahmen-Rudern kommt erst
       nach den Uebungen an der Stange, wenn ueberhaupt. */
    if(zug.includes('towel_row')) expect(zug.indexOf('towel_row')).toBeGreaterThan(zug.indexOf('pullup'));
  });

  /* Ist eine Kategorie gar nicht machbar, wird der Tag gefuellt statt leer
     gelassen – und heisst dann nicht mehr nach ihr. Seit es Zuguebungen
     ohne Geraet gibt, laesst sich das nur noch mit einem Bestand zeigen,
     dem sie fehlen. */
  it('fuellt einen unmoeglichen Tag und nennt ihn Ganzkörper', () => {
    const ohneBoden = EXERCISES.filter(e => !['towel_row', 'prone_ytw'].includes(e.id));
    const p = bauen({ tage: 3, equipment: [], exercises: ohneBoden });
    expect(p.days[1].ex.length).toBeGreaterThan(0);
    expect(p.days[1].title).toBe('Ganzkörper');
  });

  /* Umgekehrt: was der Titel nennt, muss auch drinstehen. Die Obergrenze
     schnitt die zweite Kategorie sonst einfach ab. */
  it('liefert zu jeder genannten Kategorie mindestens eine Uebung', () => {
    [2, 4, 5, 6].forEach(tage => {
      bauen({ tage }).days.forEach(d => {
        if(d.title === 'Ganzkörper') return;
        const kats = new Set(d.ex.map(id => EX_BY_ID[id].cat));
        d.title.split(' & ').forEach(name => {
          const kat = Object.keys(TEXTE.kat).find(k => TEXTE.kat[k] === name);
          expect(kats.has(kat), tage + ' Tage, ' + d.key + ': ' + name + ' fehlt').toBe(true);
        });
      });
    });
  });

  it('nutzt Ringe, sobald sie da sind', () => {
    const alle = bauen({ tage: 3, equipment: ['rings'] }).days.flatMap(d => d.ex);
    expect(alle.some(id => id.startsWith('ring_'))).toBe(true);
  });

  /* Seit die Saetze je Tag begrenzt sind, passt der Klimmzug mit Band
     hinter Haengen, Klimmzug und Rudern nicht mehr in den Zugtag. Geprueft
     wird deshalb die Kombination selbst und dass ein Band allein ihn nie in
     den Plan bringt. */
  it('bietet den Klimmzug mit Band erst an, wenn beides da ist', () => {
    const nurBand = bauen({ tage: 3, equipment: ['band'] }).days.flatMap(d => d.ex);
    expect(nurBand).not.toContain('band_pullup');
    expect(exMoeglich(EX_BY_ID.band_pullup, ['band'])).toBe(false);
    expect(exMoeglich(EX_BY_ID.band_pullup, ['bar', 'band'])).toBe(true);
  });

  it('stellt die Handgelenks-Routine an den Anfang der Druecktage', () => {
    bauen({ tage: 4 }).days.forEach(d => {
      const istPush = d.title.includes('Drücken') || d.title.includes('Skills');
      if(istPush) expect(d.ex[0]).toBe('wrist_prep');
    });
  });
});

describe('Vertraeglichkeit', () => {
  it('ist deterministisch', () => {
    expect(bauen({ tage: 5, fokus: 'skill' })).toEqual(bauen({ tage: 5, fokus: 'skill' }));
  });

  it('veraendert die Uebungsliste nicht', () => {
    const kopie = JSON.parse(JSON.stringify(EXERCISES));
    bauen({ tage: 6, fokus: 'skill' });
    expect(EXERCISES).toEqual(kopie);
  });

  it('liefert bei leerer Uebungsliste einen Plan ohne Tage statt zu werfen', () => {
    expect(buildPlan({ exercises: [], equipment: [], texte: TEXTE }).days).toEqual([]);
    expect(buildPlan().days).toEqual([]);
  });

  it('kommt ohne Texte aus', () => {
    const p = buildPlan({ exercises: EXERCISES, equipment: EQUIP_ALL, tage: 2 });
    expect(p.days).toHaveLength(2);
    expect(typeof p.name).toBe('string');
  });
});

/* Der Zusatznutzen weiterer Saetze sinkt schnell; pro Muskelgruppe und
   Einheit bringt mehr als etwa zehn harte Saetze kaum noch etwas. Vorher
   kamen Drucktage auf 20 Saetze. */
describe('Saetze je Kategorie und Tag', () => {
  const zaehle = ex => ex.reduce((acc, id) => {
    const e = EX_BY_ID[id];
    acc[e.cat] = (acc[e.cat] || 0) + kraftsaetze(e);
    return acc;
  }, {});

  it('haelt die Grenze in jedem generierten Plan', () => {
    for(const tage of [2, 3, 4, 5, 6]){
      for(const fokus of ['kraft', 'ausgewogen', 'skill']){
        for(const equipment of [[], ['chair'], ['bar'], ['rings'], ['bar', 'band'], EQUIP_ALL]){
          bauen({ tage, fokus, equipment }).days.forEach(d => {
            Object.entries(zaehle(d.ex)).forEach(([kat, n]) => {
              expect(n, JSON.stringify({ tage, fokus, equipment, tag: d.key, kat })).toBeLessThanOrEqual(KRAFTSAETZE_JE_KATEGORIE);
            });
          });
        }
      }
    }
  });

  it('zaehlt Skills und Mobility nicht mit', () => {
    expect(kraftsaetze(EX_BY_ID.handstand)).toBe(0);
    expect(kraftsaetze(EX_BY_ID.wall_hs)).toBe(0);
    expect(kraftsaetze(EX_BY_ID.wrist_prep)).toBe(0);
    expect(kraftsaetze(EX_BY_ID.pushup)).toBe(4);
    /* Halteuebungen zaehlen: vier Saetze Stuetzhalte sind echte Arbeit. */
    expect(kraftsaetze(EX_BY_ID.support)).toBe(4);
  });

  /* Die Reihenfolge entscheidet mit, was die Grenze uebersteht. Ein Zugtag
     braucht eine senkrechte und eine waagerechte Zuguebung. */
  it('laesst im Zugtag Klimmzug und Rudern', () => {
    expect(bauen({ tage: 3, equipment: ['bar'] }).days[1].ex).toEqual(expect.arrayContaining(['pullup', 'row']));
    expect(bauen({ tage: 3, equipment: EQUIP_ALL }).days[1].ex).toEqual(expect.arrayContaining(['pullup', 'row']));
  });

  /* Wer nur Ringe hat, soll nicht das Rudern bekommen, das am Tisch beginnt. */
  it('nimmt bei gleichem Rang, was von der ersten Stufe an machbar ist', () => {
    const zug = bauen({ tage: 3, equipment: ['rings'] }).days[1].ex;
    expect(zug).toContain('ring_row');
    expect(zug).not.toContain('row');
  });
});

/* Die festen Vorlagen halten dieselbe Grenze. */
describe('Vorlagen', () => {
  const quelleT = readFileSync(ROOT + 'js/exercises.js', 'utf8').replace(/^export /gm, '');
  const { PLAN_TEMPLATES } = new Function(quelleT + '; return { PLAN_TEMPLATES };')();

  it('bleiben je Tag und Kategorie unter der Grenze', () => {
    Object.entries(PLAN_TEMPLATES).forEach(([pid, p]) => p.days.forEach(d => {
      const je = {};
      d.ex.forEach(id => { const e = EX_BY_ID[id]; je[e.cat] = (je[e.cat] || 0) + kraftsaetze(e); });
      Object.entries(je).forEach(([kat, n]) =>
        expect(n, pid + ' ' + d.key + ' ' + kat).toBeLessThanOrEqual(KRAFTSAETZE_JE_KATEGORIE));
    }));
  });
});

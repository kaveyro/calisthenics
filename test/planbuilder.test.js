import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPlan, KRAFTSAETZE_JE_KATEGORIE, kraftsaetze, MUSTER_NAMEN, vorlageAufloesen, ersatzFuer, dauerSek, MINUTEN, moeglicheZiele } from '../js/domain/planbuilder.js';
import { istSkill } from '../js/domain/skills.js';
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
  exercises: EXERCISES, equipment: EQUIP_ALL, tage: 3, texte: TEXTE, ...opts
});

describe('Grundzusagen', () => {
  /* Diese vier gelten fuer JEDE Kombination – deshalb ueber alle durchgespielt
     statt an einem Beispiel behauptet. */
  const faelle = [];
  for(const tage of [2, 3, 4, 5, 6]){
    for(const ziel of ['keiner', 'handstand', 'front_lever', 'muscle_up']){
      for(const equipment of [[], ['chair'], ['bar'], ['rings'], ['bar', 'band'], EQUIP_ALL]){
        faelle.push({ tage, ziel, equipment });
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

describe('Ziel-Skill', () => {
  const ids = p => p.days.flatMap(d => d.ex);
  const ersteNachAufwaermen = d => d.ex[0] === 'wrist_prep' ? d.ex[1] : d.ex[0];

  it('laesst ohne Ziel die Skills weg', () => {
    for(const tage of [2, 4, 6]){
      expect(ids(bauen({ tage, ziel: 'keiner' })).filter(id => istSkill(EX_BY_ID[id]))).toEqual([]);
    }
  });

  it('stellt den Handstand vorn in jeden Tag mit Druecken', () => {
    const p = bauen({ tage: 4, ziel: 'handstand' });
    p.days.forEach(d => {
      const mitDruecken = d.ex.some(id => ['h_druecken', 'dip', 'v_druecken'].includes(EX_BY_ID[id].muster));
      expect(EX_BY_ID[ersteNachAufwaermen(d)].muster === 'handstand', d.key + ' ' + d.ex.join(',')).toBe(mitDruecken);
    });
  });

  it('stellt den Front Lever nur an Tage mit Ziehen', () => {
    const p = bauen({ tage: 6, ziel: 'front_lever' });
    p.days.forEach(d => {
      expect(d.ex.includes('front_lever'), d.title).toBe(d.title === 'Ziehen');
    });
  });

  it('beginnt die Linie bei der leichtesten machbaren Uebung', () => {
    /* Der Wand-Handstand vor dem freien. */
    expect(bauen({ tage: 3, ziel: 'handstand' }).days[0].ex).toContain('wall_hs');
  });

  it('bietet nur Ziele an, die mit der Ausruestung gehen', () => {
    expect(moeglicheZiele(EXERCISES, [])).not.toContain('front_lever');
    expect(moeglicheZiele(EXERCISES, [])).toContain('handstand');
    expect(moeglicheZiele(EXERCISES, EQUIP_ALL)).toEqual(expect.arrayContaining(['front_lever', 'muscle_up', 'lsit']));
  });

  it('behandelt ein unbekanntes oder unmoegliches Ziel wie keines', () => {
    expect(bauen({ ziel: 'quatsch' })).toEqual(bauen({ ziel: 'keiner' }));
    expect(bauen({ ziel: 'front_lever', equipment: [] })).toEqual(bauen({ ziel: 'keiner', equipment: [] }));
  });
});

describe('Ausruestung', () => {
  it('baut ohne jedes Geraet einen reinen Boden-Plan', () => {
    const p = bauen({ tage: 3, equipment: [] });
    const alle = p.days.flatMap(d => d.ex);
    expect(alle.length).toBeGreaterThan(6);
    alle.forEach(id => expect(EX_BY_ID[id].equip).toEqual(['none']));
    expect(p.days[0].title).toBe('Ganzkörper');
  });

  /* Bis zu Tuerrahmen-Rudern und Y-T-W gab es ohne Geraet keine einzige
     Zuguebung, und der Zugtag hiess "Ganzkörper". */
  it('zieht auch ohne Geraet', () => {
    /* Ganzkoerper: jeder der drei Tage hat eine Zuguebung. */
    bauen({ tage: 3, equipment: [] }).days.forEach(d => expect(d.ex, d.key).toContain('towel_row'));
    /* Bei sechs Tagen gibt es einen eigenen Zugtag. */
    const zug = bauen({ tage: 6, equipment: [] }).days[1];
    expect(zug.title).toBe('Ziehen');
    expect(zug.ex).toEqual(expect.arrayContaining(['towel_row', 'prone_ytw']));
  });

  it('laesst bei vorhandener Stange die Klimmzuege vorn', () => {
    const woche = bauen({ tage: 3, equipment: ['bar'] }).days.flatMap(d => d.ex);
    expect(woche).toContain('pullup');
    /* prio 2: das Tuerrahmen-Rudern kommt erst, wenn es sonst nichts gibt. */
    expect(bauen({ tage: 3, equipment: ['bar', 'chair'] }).days[0].ex).not.toContain('towel_row');
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

  /* Bis hierher kam bei 2 bis 5 Tagen jede Muskelgruppe genau einmal pro
     Woche dran. Mit hoechstens 12 Saetzen je Einheit hiess das hoechstens 12
     Saetze pro Woche. */
  it('trainiert jede Muskelgruppe mindestens zweimal pro Woche', () => {
    for(const tage of [2, 3, 4, 5, 6]){
      for(const equipment of [[], ['chair'], ['bar'], ['rings'], EQUIP_ALL]){
        const je = {};
        bauen({ tage, equipment }).days.forEach(d =>
          new Set(d.ex.map(id => EX_BY_ID[id].cat)).forEach(k => { je[k] = (je[k] || 0) + 1; }));
        ['push', 'pull', 'legs'].forEach(k =>
          expect(je[k] || 0, tage + ' Tage ' + JSON.stringify(equipment) + ' ' + k).toBeGreaterThanOrEqual(2));
      }
    }
  });

  it('gibt jedem Ganzkoerpertag einen Rumpfplatz', () => {
    /* Am Ende der Liste fiel er der Hoechstzahl von sieben Uebungen zum Opfer. */
    for(const equipment of [[], EQUIP_ALL]){
      bauen({ tage: 3, equipment }).days.forEach(d =>
        expect(d.ex.some(id => EX_BY_ID[id].cat === 'core'), d.key + ' ' + d.ex.join(',')).toBe(true));
    }
  });

  it('wechselt die Uebung, wenn ein Muster mehrfach vorkommt', () => {
    /* Vier Tage: zweimal Oberkoerper – nicht zweimal dieselben Liegestuetze. */
    const [okA, , okB] = bauen({ tage: 4 }).days;
    const druecken = tag => tag.ex.filter(id => EX_BY_ID[id].muster === 'h_druecken');
    expect(druecken(okA)[0]).not.toBe(druecken(okB)[0]);
  });

  it('nimmt Hueftbeuge und Kniebeuge in jeden Beintag', () => {
    bauen({ tage: 4 }).days.filter(d => d.title.startsWith('Unterkörper')).forEach(d => {
      const muster = d.ex.map(id => EX_BY_ID[id].muster);
      expect(muster).toContain('kniebeuge');
      expect(muster).toContain('huefte');
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
    for(const tage of [3, 4, 6]){
      bauen({ tage }).days.forEach(d => {
        const mitDruecken = d.ex.some(id => ['h_druecken', 'dip', 'v_druecken'].includes(EX_BY_ID[id].muster));
        expect(d.ex[0] === 'wrist_prep', tage + ' ' + d.key).toBe(mitDruecken);
      });
    }
  });
});

describe('Vertraeglichkeit', () => {
  it('ist deterministisch', () => {
    expect(bauen({ tage: 5, ziel: 'handstand' })).toEqual(bauen({ tage: 5, ziel: 'handstand' }));
  });

  it('veraendert die Uebungsliste nicht', () => {
    const kopie = JSON.parse(JSON.stringify(EXERCISES));
    bauen({ tage: 6, ziel: 'planche' });
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
      for(const ziel of ['keiner', 'handstand', 'front_lever']){
        for(const equipment of [[], ['chair'], ['bar'], ['rings'], ['bar', 'band'], EQUIP_ALL]){
          bauen({ tage, ziel, equipment }).days.forEach(d => {
            Object.entries(zaehle(d.ex)).forEach(([kat, n]) => {
              expect(n, JSON.stringify({ tage, ziel, equipment, tag: d.key, kat })).toBeLessThanOrEqual(KRAFTSAETZE_JE_KATEGORIE);
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
    /* Sechs Tage: Tag B ist der Zugtag. */
    expect(bauen({ tage: 6, equipment: ['bar', 'chair'] }).days[1].ex).toEqual(expect.arrayContaining(['pullup', 'row']));
    expect(bauen({ tage: 6, equipment: EQUIP_ALL }).days[1].ex).toEqual(expect.arrayContaining(['pullup', 'row']));
  });

  /* Wer nur Ringe hat, soll nicht das Rudern bekommen, das am Tisch beginnt. */
  it('nimmt bei gleichem Rang, was von der ersten Stufe an machbar ist', () => {
    const zug = bauen({ tage: 6, equipment: ['rings'] }).days[1].ex;
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

describe('Bewegungsmuster', () => {
  it('traegt jede Uebung ein bekanntes Muster', () => {
    EXERCISES.forEach(e => expect(MUSTER_NAMEN, e.id).toContain(e.muster));
  });

  it('gibt Skills ihre Linie und keiner Kraftuebung ein Skill-Muster', () => {
    const skillMuster = ['handstand', 'planche', 'front_lever', 'back_lever', 'muscle_up', 'lsit', 'elbow_lever'];
    EXERCISES.forEach(e => expect(skillMuster.includes(e.muster), e.id).toBe(istSkill(e)));
  });
});

/* Die Vorlagen waren feste Listen: wer keine Parallettes hatte, bekam
   trotzdem Dips auf Parallettes und musste umbauen. */
describe('Vorlagen fuer die eigene Ausruestung', () => {
  const quelleV = readFileSync(ROOT + 'js/exercises.js', 'utf8').replace(/^export /gm, '');
  const { PLAN_TEMPLATES: VORLAGEN } = new Function(quelleV + '; return { PLAN_TEMPLATES };')();

  it('bleiben mit voller Ausruestung, wie sie sind', () => {
    Object.values(VORLAGEN).forEach(p => {
      expect(vorlageAufloesen(p, EXERCISES, EQUIP_ALL).days.map(d => d.ex)).toEqual(p.days.map(d => d.ex));
    });
  });

  it('enthalten fuer jede Ausruestung nur Machbares, ohne Dopplung', () => {
    for(const equipment of [[], ['chair'], ['bar'], ['rings'], ['parallettes'], EQUIP_ALL]){
      Object.entries(VORLAGEN).forEach(([pid, p]) => vorlageAufloesen(p, EXERCISES, equipment).days.forEach(d => {
        d.ex.forEach(id => expect(exMoeglich(EX_BY_ID[id], equipment), pid + ' ' + d.key + ' ' + id).toBe(true));
        expect(new Set(d.ex).size, pid + ' ' + d.key).toBe(d.ex.length);
      }));
    }
  });

  it('ersetzt zuerst durch dasselbe Muster', () => {
    /* Ohne Geraet: Dips gehen nicht, Diamant-Liegestuetze schon – beide
       sind Drueckuebungen, die Dips haben aber kein machbares Geschwister
       im Muster "dip". Der Klimmzug wird zum Tuerrahmen-Rudern. */
    const tagA = vorlageAufloesen(VORLAGEN.ab4, EXERCISES, []).days[0].ex;
    expect(tagA).not.toContain('dips');
    expect(ersatzFuer(EX_BY_ID.pullup, EXERCISES, []).id).toBe('towel_row');
    /* Mit Ringen wird aus dem Rudern am Tisch das Ring-Rudern. */
    expect(ersatzFuer(EX_BY_ID.dips, EXERCISES, ['rings']).id).toBe('ring_dip');
  });

  it('ersetzt einen Skill nie durch einen anderen', () => {
    /* Ohne Stange ist der Front Lever unmoeglich – er entfaellt, statt zum
       Handstand zu werden. */
    expect(ersatzFuer(EX_BY_ID.front_lever, EXERCISES, [])).toBeNull();
    const tagB = vorlageAufloesen(VORLAGEN.skill, EXERCISES, []).days[1].ex;
    expect(tagB).not.toContain('front_lever');
    expect(tagB.filter(id => istSkill(EX_BY_ID[id]))).toEqual([]);
  });
});

/* Tage mit 19 und 65 Minuten in derselben Woche soll es nicht mehr geben. */
describe('Zeitbudget', () => {
  it('schaetzt die Dauer aus Saetzen, Arbeit und Pause', () => {
    /* Liegestuetze Stufe 0: 4 x 6-10, 90 s Pause: 4 x (10 x 3 + 10) + 3 x 90 + 60. */
    expect(dauerSek(EX_BY_ID.pushup)).toBe(4 * 40 + 3 * 90 + 60);
    /* Kompakt: zwei Saetze. */
    expect(dauerSek(EX_BY_ID.pushup, 'kompakt')).toBe(2 * 40 + 90 + 60);
    /* Halteuebung: die Obergrenze der Haltezeit je Satz. */
    expect(dauerSek(EX_BY_ID.support)).toBe(4 * 20 + 3 * 60 + 60);
  });

  it('haelt das Budget bis auf die Pflichtplaetze', () => {
    for(const minuten of MINUTEN){
      for(const tage of [2, 3, 4, 5, 6]){
        for(const equipment of [[], EQUIP_ALL]){
          bauen({ tage, equipment, minuten }).days.forEach(d => {
            /* Wer ueber dem Budget liegt, hat nur Pflichtplaetze: hoechstens
               drei Uebungen ausser dem Handgelenk-Aufwaermen. */
            const ohneAufwaermen = d.ex.filter(id => id !== 'wrist_prep').length;
            if(d.min > minuten) expect(ohneAufwaermen, JSON.stringify({ minuten, tage, tag: d.key })).toBeLessThanOrEqual(3);
          });
        }
      }
    }
  });

  it('wirft bei wenig Zeit nicht die Beine aus dem Ganzkoerpertag', () => {
    bauen({ tage: 3, minuten: 30 }).days.forEach(d =>
      expect(d.ex.some(id => EX_BY_ID[id].cat === 'legs'), d.key + ' ' + d.ex.join(',')).toBe(true));
  });

  it('nimmt bei mehr Zeit nie weniger Uebungen', () => {
    const laenge = m => bauen({ tage: 3, minuten: m }).days.map(d => d.ex.length);
    const [a, b, c] = MINUTEN.map(laenge);
    a.forEach((n, i) => { expect(b[i]).toBeGreaterThanOrEqual(n); expect(c[i]).toBeGreaterThanOrEqual(b[i]); });
  });

  it('gilt ohne Angabe nicht', () => {
    expect(bauen({ tage: 3 }).days.map(d => d.ex)).toEqual(bauen({ tage: 3, minuten: 'viel' }).days.map(d => d.ex));
  });
});

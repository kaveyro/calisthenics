import { describe, it, expect } from 'vitest';
import {
  EQUIP, EQUIP_ALL,
  levelEquip, moeglich, levelMoeglich, exMoeglich, hoechsteStufe, fehlendeGeraete
} from '../js/domain/equipment.js';

/* Nachbau der echten Formen, nicht die echten Daten: der Test soll die Regel
   pruefen, nicht den Inhalt von exercises.js. Fuer den Inhalt gibt es
   test/i18n.test.js und die Stichproben weiter unten. */
const dips = {
  id: 'dips', equip: ['chair', 'parallettes', 'rings'],
  levels: [
    { stage: 'Bank', equip: ['chair'] },
    { stage: 'Bank hoch', equip: ['chair'] },
    { stage: 'Parallettes negativ', equip: ['parallettes', 'rings'] },
    { stage: 'Parallettes', equip: ['parallettes', 'rings'] }
  ]
};
const pushup = {
  id: 'pushup', equip: ['none'],
  levels: [
    { stage: 'Knie' },
    { stage: 'Voll' },
    { stage: 'Parallettes', equip: ['parallettes'] },
    { stage: 'Pseudo-Planche' }
  ]
};
const bandPullup = {
  id: 'band_pullup', equip: ['bar+band', 'rings+band'],
  levels: [{ stage: 'Dickes Band' }, { stage: 'Duennes Band' }]
};

describe('Vokabular', () => {
  it('enthaelt none und die fuenf Anschaffungen', () => {
    expect(EQUIP).toEqual(['none', 'chair', 'bar', 'parallettes', 'rings', 'band']);
  });

  it('EQUIP_ALL laesst none weg – es ist keine Anschaffung', () => {
    expect(EQUIP_ALL).not.toContain('none');
    expect(EQUIP_ALL).toHaveLength(EQUIP.length - 1);
  });
});

describe('levelEquip', () => {
  it('nimmt die Angabe der Stufe, wenn es eine gibt', () => {
    expect(levelEquip(dips, 0)).toEqual(['chair']);
    expect(levelEquip(dips, 2)).toEqual(['parallettes', 'rings']);
  });

  it('faellt ohne Stufenangabe auf die Uebung zurueck', () => {
    expect(levelEquip(pushup, 1)).toEqual(['none']);
    expect(levelEquip(bandPullup, 0)).toEqual(['bar+band', 'rings+band']);
  });

  it('liefert eine leere Liste fuer Unsinn statt zu werfen', () => {
    expect(levelEquip(null, 0)).toEqual([]);
    expect(levelEquip({}, 0)).toEqual([]);
    expect(levelEquip(pushup, 99)).toEqual(['none']);
    expect(levelEquip({ equip: 'bar', levels: [] }, 0)).toEqual([]);
  });
});

describe('moeglich', () => {
  it('ist ein ODER ueber die Liste', () => {
    expect(moeglich(['parallettes', 'rings'], ['rings'])).toBe(true);
    expect(moeglich(['parallettes', 'rings'], ['bar'])).toBe(false);
  });

  it('behandelt none als immer vorhanden', () => {
    expect(moeglich(['none'], [])).toBe(true);
    expect(moeglich(['bar', 'none'], [])).toBe(true);
  });

  it('ohne Angabe ist alles machbar', () => {
    expect(moeglich([], [])).toBe(true);
    expect(moeglich(undefined, [])).toBe(true);
  });

  /* Der Grund, warum es das Trennzeichen ueberhaupt gibt: ein Klimmzug mit
     Band braucht beides. Ohne die Kombination wuerde die Uebung jedem
     angeboten, der nur ein Band besitzt. */
  it('verlangt bei + alle Teile', () => {
    expect(moeglich(['bar+band'], ['bar'])).toBe(false);
    expect(moeglich(['bar+band'], ['band'])).toBe(false);
    expect(moeglich(['bar+band'], ['bar', 'band'])).toBe(true);
  });

  it('mischt Kombination und Einzelwert in derselben Liste', () => {
    expect(moeglich(['bar+band', 'rings+band'], ['rings', 'band'])).toBe(true);
    expect(moeglich(['bar+band', 'rings'], ['rings'])).toBe(true);
  });

  it('vertraegt einen kaputten Vorrat', () => {
    expect(moeglich(['none'], null)).toBe(true);
    expect(moeglich(['bar'], 'bar')).toBe(false);
    expect(moeglich([1, 'bar'], ['bar'])).toBe(true);
  });
});

describe('levelMoeglich und exMoeglich', () => {
  it('prueft die Stufe, nicht die Uebung', () => {
    expect(levelMoeglich(dips, 0, ['chair'])).toBe(true);
    expect(levelMoeglich(dips, 3, ['chair'])).toBe(false);
    expect(levelMoeglich(dips, 3, ['parallettes'])).toBe(true);
  });

  /* Machbar heisst: irgendeine Stufe geht. Wer keine Parallettes hat, soll
     Bank-Dips trotzdem angeboten bekommen. */
  it('eine Uebung ist machbar, sobald eine Stufe machbar ist', () => {
    expect(exMoeglich(dips, ['chair'])).toBe(true);
    expect(exMoeglich(dips, [])).toBe(false);
    expect(exMoeglich(pushup, [])).toBe(true);
  });

  it('eine Uebung ohne Stufen ist nicht machbar', () => {
    expect(exMoeglich({ equip: ['none'], levels: [] }, [])).toBe(false);
    expect(exMoeglich(null, [])).toBe(false);
  });
});

describe('hoechsteStufe', () => {
  it('liefert den Index der letzten machbaren Stufe', () => {
    expect(hoechsteStufe(dips, ['chair'])).toBe(1);
    expect(hoechsteStufe(dips, ['parallettes'])).toBe(3);
    expect(hoechsteStufe(dips, [])).toBe(-1);
  });

  /* Nicht an der ersten Luecke abbrechen: bei den Liegestuetzen verlangt nur
     Stufe 2 Parallettes, Stufe 3 geht wieder am Boden. */
  it('ueberspringt eine Luecke in der Mitte', () => {
    expect(hoechsteStufe(pushup, [])).toBe(3);
    expect(levelMoeglich(pushup, 2, [])).toBe(false);
  });

  it('vertraegt Unsinn', () => {
    expect(hoechsteStufe(null, [])).toBe(-1);
    expect(hoechsteStufe({}, [])).toBe(-1);
  });
});

describe('fehlendeGeraete', () => {
  it('ist leer, wenn die Stufe machbar ist', () => {
    expect(fehlendeGeraete(dips, 0, ['chair'])).toEqual([]);
  });

  it('nennt das fehlende Geraet', () => {
    expect(fehlendeGeraete(dips, 3, ['chair'])).toEqual(['parallettes']);
  });

  it('waehlt die guenstigste Alternative', () => {
    /* Stange fehlt ganz, Ringe sind da – die zweite Alternative kostet nur
       noch das Band. */
    expect(fehlendeGeraete(bandPullup, 0, ['rings'])).toEqual(['band']);
    expect(fehlendeGeraete(bandPullup, 0, [])).toEqual(['bar', 'band']);
  });

  it('liefert bei fehlender Angabe nichts zu meckern', () => {
    expect(fehlendeGeraete({ equip: [], levels: [{}] }, 0, [])).toEqual([]);
  });
});

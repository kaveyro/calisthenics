import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LANG, DEFAULT_LANG } from '../js/i18n/strings.js';
import { CONTENT_EN } from '../js/data/content.en.js';

/* Vollständigkeit ist bei Übersetzungen nicht durch Sorgfalt sicherzustellen –
   eine fehlende Stufe fällt sonst erst auf, wenn jemand die Sprache umstellt
   und dort deutscher Text steht. Deshalb geprüft statt versprochen. */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const exercisesQuelle = readFileSync(ROOT + 'js/exercises.js', 'utf8').replace(/^export /gm, '');
const DATEN = new Function(
  exercisesQuelle + '; return { CATS, EXERCISES, PLAN_TEMPLATES, MILESTONES, WARMUP };')();

describe('Oberflächentexte', () => {
  const sprachen = Object.keys(LANG);

  it('kennt mindestens Deutsch und Englisch', () => {
    expect(sprachen).toContain('de');
    expect(sprachen).toContain('en');
  });

  it('hat in jeder Sprache dieselben Schlüssel', () => {
    const referenz = Object.keys(LANG[DEFAULT_LANG]).sort();
    for(const s of sprachen){
      const fehlend = referenz.filter(k => !(k in LANG[s]));
      const zuviel = Object.keys(LANG[s]).filter(k => !referenz.includes(k));
      expect(fehlend, `In "${s}" fehlen Schlüssel`).toEqual([]);
      expect(zuviel, `In "${s}" stehen unbekannte Schlüssel`).toEqual([]);
    }
  });

  it('lässt keinen Text leer', () => {
    for(const s of sprachen){
      const leer = Object.entries(LANG[s]).filter(([, v]) => !String(v).trim());
      expect(leer.map(([k]) => k), `Leere Texte in "${s}"`).toEqual([]);
    }
  });

  it('verwendet in allen Sprachen dieselben Platzhalter', () => {
    const platzhalter = v => [...String(v).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();
    for(const s of sprachen){
      if(s === DEFAULT_LANG) continue;
      for(const [k, v] of Object.entries(LANG[DEFAULT_LANG])){
        expect(platzhalter(LANG[s][k]), `Platzhalter weichen ab: ${s}.${k}`)
          .toEqual(platzhalter(v));
      }
    }
  });
});

describe('Verdrahtung im Markup', () => {
  const html = readFileSync(ROOT + 'index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');

  it('kennt jeden im Markup verwendeten Schlüssel', () => {
    const verwendet = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([a-zA-Z]+)"/g)].map(m => m[1]);
    const unbekannt = [...new Set(verwendet)].filter(k => !(k in LANG[DEFAULT_LANG]));
    expect(unbekannt, 'Im Markup verwendet, aber nicht übersetzt').toEqual([]);
  });

  /* Ohne diese Prüfung bleibt ein vergessenes data-i18n unsichtbar, bis
     jemand die Sprache umstellt und dort deutscher Text stehen bleibt. */
  it('lässt keinen sichtbaren deutschen Text ohne data-i18n', () => {
    const deutsch = /[äöüßÄÖÜ]|\b(und|oder|nicht|Sätze|Stufe|Übung|Übungen|Training|Trainings|Einheit|Einheiten|Backup|Verlauf|Aus|Woche|Grundwert|Nutzt|Nach)\b/;
    const offen = [];
    for(const m of html.matchAll(/<([a-z0-9]+)([^>]*)>([^<>]{2,})</g)){
      const [, tag, attrs, text] = m;
      if(!text.trim() || !deutsch.test(text)) continue;
      if(attrs.includes('data-i18n=')) continue;
      offen.push(`<${tag}> ${text.trim().slice(0, 60)}`);
    }
    for(const m of html.matchAll(/<[a-z0-9]+([^>]*)>/g)){
      for(const a of m[1].matchAll(/(placeholder|aria-label|title)="([^"]{3,})"/g)){
        if(!deutsch.test(a[2])) continue;
        if(m[1].includes('data-i18n-' + a[1])) continue;
        offen.push(`[${a[1]}] ${a[2].slice(0, 60)}`);
      }
    }
    expect(offen).toEqual([]);
  });
});

describe('Übungsinhalte auf Englisch', () => {
  it('übersetzt jede Kategorie', () => {
    const fehlend = Object.keys(DATEN.CATS).filter(k => !CONTENT_EN.cats[k]);
    expect(fehlend).toEqual([]);
  });

  it('übersetzt jede Übung', () => {
    const fehlend = DATEN.EXERCISES.filter(e => !CONTENT_EN.exercises[e.id]).map(e => e.id);
    expect(fehlend).toEqual([]);
  });

  it('übersetzt jede Stufe jeder Übung', () => {
    const fehler = [];
    for(const e of DATEN.EXERCISES){
      const ue = CONTENT_EN.exercises[e.id];
      if(!ue) continue;
      if(ue.levels.length !== e.levels.length){
        fehler.push(`${e.id}: ${ue.levels.length} statt ${e.levels.length} Stufen`);
      }
      ue.levels.forEach((l, i) => { if(!String(l).trim()) fehler.push(`${e.id} Stufe ${i} leer`); });
    }
    expect(fehler).toEqual([]);
  });

  it('übersetzt jeden Tipp jeder Übung', () => {
    const fehler = [];
    for(const e of DATEN.EXERCISES){
      const ue = CONTENT_EN.exercises[e.id];
      if(!ue) continue;
      if(ue.tips.length !== e.tips.length){
        fehler.push(`${e.id}: ${ue.tips.length} statt ${e.tips.length} Tipps`);
      }
    }
    expect(fehler).toEqual([]);
  });

  it('übersetzt jeden Meilenstein', () => {
    const fehlend = DATEN.MILESTONES.filter(m => !CONTENT_EN.milestones[m.id]).map(m => m.id);
    expect(fehlend).toEqual([]);
  });

  it('übersetzt jeden Warm-up-Eintrag', () => {
    expect(CONTENT_EN.warmup).toHaveLength(DATEN.WARMUP.length);
  });

  it('übersetzt jede Plan-Vorlage samt Tagen', () => {
    const fehler = [];
    for(const [id, p] of Object.entries(DATEN.PLAN_TEMPLATES)){
      const up = CONTENT_EN.plans[id];
      if(!up){ fehler.push(`Plan ${id} fehlt`); continue; }
      if(!up.name || !up.desc) fehler.push(`Plan ${id}: Name oder Beschreibung fehlt`);
      for(const d of p.days){
        const ud = up.days[d.key];
        if(!ud) fehler.push(`Plan ${id}, Tag ${d.key} fehlt`);
        else if(!ud.title) fehler.push(`Plan ${id}, Tag ${d.key}: Titel fehlt`);
      }
    }
    expect(fehler).toEqual([]);
  });

  it('lässt keinen englischen Text unübersetzt stehen', () => {
    /* Grober Schutz gegen kopierte deutsche Zeilen: typische Umlaute und
       Wörter, die im Englischen nicht vorkommen sollten. */
    const verdaechtig = /[äöüßÄÖÜ]|\b(und|oder|nicht|Sätze|Stufe|Übung|Wiederholungen)\b/;
    const treffer = [];
    const pruefe = (pfad, wert) => {
      if(typeof wert === 'string'){ if(verdaechtig.test(wert)) treffer.push(pfad + ': ' + wert); }
      else if(wert && typeof wert === 'object'){
        for(const [k, v] of Object.entries(wert)) pruefe(pfad + '.' + k, v);
      }
    };
    pruefe('CONTENT_EN', CONTENT_EN);
    pruefe('LANG.en', LANG.en);
    expect(treffer).toEqual([]);
  });
});

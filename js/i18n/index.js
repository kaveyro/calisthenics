/* Zugriffsschicht für Sprache: Oberflächentexte und Übungsinhalte.

   Deutsch ist die Quelle und zugleich die Rückfallsprache. Fehlt eine
   englische Entsprechung, erscheint der deutsche Text – nie ein roher
   Schlüsselname und nie eine leere Zeile. */

import { LANG, DEFAULT_LANG, LANGS } from './strings.js';
import { CONTENT_EN } from '../data/content.en.js';

export { LANGS };

const CONTENT = { en: CONTENT_EN };

let aktuell = DEFAULT_LANG;

export function setLang(l){ aktuell = LANG[l] ? l : DEFAULT_LANG; }
export function getLang(){ return aktuell; }

/* Oberflächentext. params füllt Platzhalter: __('setsCount', {done: 3, total: 12}) */
export function __(key, params){
  const text = (LANG[aktuell] && LANG[aktuell][key]) ?? LANG[DEFAULT_LANG][key] ?? key;
  if(!params) return text;
  return String(text).replace(/\{(\w+)\}/g, (treffer, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] : treffer);
}

/* ---------- Übungsinhalte ----------
   Der deutsche Wert steht am Aufrufort zur Verfügung und dient als Rückfall,
   deshalb bekommt jede Funktion das Original mit. */

const inhalt = () => CONTENT[aktuell] || null;

export function catName(key, fallback){
  return inhalt()?.cats?.[key] ?? fallback;
}

export function exName(ex){
  return inhalt()?.exercises?.[ex.id]?.name ?? ex.name;
}

export function exStage(ex, i){
  return inhalt()?.exercises?.[ex.id]?.levels?.[i] ?? ex.levels[i].stage;
}

export function exTips(ex){
  return inhalt()?.exercises?.[ex.id]?.tips ?? ex.tips;
}

export function msName(m){
  return inhalt()?.milestones?.[m.id] ?? m.name;
}

/* Warm-up wird über den Index zugeordnet – eigene Einträge des Nutzers
   bleiben unverändert, weil sie in state.warmupCustom liegen. */
export function warmupText(i, fallback){
  return inhalt()?.warmup?.[i] ?? fallback;
}

export function planName(id, fallback){
  return inhalt()?.plans?.[id]?.name ?? fallback;
}
export function planDesc(id, fallback){
  return inhalt()?.plans?.[id]?.desc ?? fallback;
}
export function dayTitle(planId, dayKey, fallback){
  return inhalt()?.plans?.[planId]?.days?.[dayKey]?.title ?? fallback;
}
export function daySub(planId, dayKey, fallback){
  return inhalt()?.plans?.[planId]?.days?.[dayKey]?.sub ?? fallback;
}

/* ---------- Statisches Markup ----------
   Elemente mit data-i18n bekommen ihren Textinhalt gesetzt, Elemente mit
   data-i18n-<attr> das jeweilige Attribut. So bleiben die Texte in
   index.html an einer Stelle übersetzbar, ohne sie ins JavaScript zu ziehen. */
const ATTRIBUTE = ['placeholder', 'aria-label', 'title', 'label'];

export function applyStaticTexts(root = document){
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const html = el.dataset.i18nHtml !== undefined;
    const text = __(el.dataset.i18n);
    if(html) el.innerHTML = text; else el.textContent = text;
  });
  for(const attr of ATTRIBUTE){
    const daten = 'i18n' + attr.replace(/(^|-)(\w)/g, (m, s, c) => c.toUpperCase());
    root.querySelectorAll('[data-' + 'i18n-' + attr + ']').forEach(el => {
      el.setAttribute(attr, __(el.dataset[daten]));
    });
  }
}

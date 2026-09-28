/* Tab Uebungen: die Bibliothek mit Filter, Suche, Sortierung und Bestleistungen. */

import { tageZwischen, today } from '../domain/dates.js';
import { esc } from '../domain/escape.js';
import { letztesDatumJeUebung } from '../domain/log.js';
import { CATS, EXERCISES, EX_BY_ID } from '../exercises.js';
import { __, catName, exName, exStage, exTips } from '../i18n/index.js';
import { fmtDate, getDay, getDays, lvlOf, save, zielText } from '../app.js';
import { state } from '../core/kern.js';
import { equipListe, fehlt, machbar } from './ausruestung.js';
import { ikon, toast } from '../ui/hinweise.js';

let libFilter = 'all';
let libNurMachbar = false;
const libOpen = {};

/* ================= Bibliothek ================= */
export function renderCatFilter(){
  const cats = ['all'].concat(Object.keys(CATS));
  document.getElementById('catFilter').innerHTML = cats.map(c =>
    '<button class="chip' + (libFilter === c ? ' active' : '') + '" data-action="library:filter" data-cat="' + c + '">' +
    esc(c === 'all' ? __('all') : catName(c, CATS[c].name)) + '</button>').join('');
}
export function setLibFilter(c){ libFilter = c; renderCatFilter(); renderLibrary(); }

/* Ab wann eine Uebung als liegen geblieben gilt. Zwei Wochen sind bei zwei
   bis vier Einheiten pro Woche eine Luecke, die kein Plan mehr erklaert. */
const LIB_STALE_TAGE = 14;

/* Sortierung der Bibliothek. Die Reihenfolge nach Kategorie und Datei ist
   die bisherige und bleibt die Vorgabe; sie beantwortet aber nicht die
   Frage, die sich nach ein paar Monaten stellt – was faellt hinten runter?

   Vergleichsfunktionen bekommen { ex, i, lvl, zuletzt } und fallen bei
   Gleichstand immer auf die Dateireihenfolge zurueck, damit die Liste bei
   gleichen Werten nicht bei jedem Aufbau anders aussieht. */
const LIB_SORT = {
  standard: (a, b) => a.i - b.i,
  /* Nie trainiert zuerst: das ist die groesste Luecke, nicht die kleinste. */
  alt: (a, b) => String(a.zuletzt || '').localeCompare(String(b.zuletzt || '')) || (a.i - b.i),
  fortschritt: (a, b) => (anteil(b) - anteil(a)) || (a.i - b.i)
};
export const anteil = e => e.ex.levels.length > 1 ? e.lvl / (e.ex.levels.length - 1) : 0;
let libSort = 'standard';
export function setLibSort(v){ libSort = LIB_SORT[v] ? v : 'standard'; renderLibrary(); }

/* Aufbau und Suche sind getrennt.

   renderLibrary() baute frueher bei JEDEM Tastendruck im Suchfeld alle 36
   Uebungen mit ihren 141 Stufen neu auf. Wer bei einer Uebung eine
   Bestleistung halb eingetippt hatte und dann suchte, fand sie danach nicht
   mehr vor – das Feld war ein anderes. Gesucht wird jetzt, indem vorhandene
   Eintraege aus- und wieder eingeblendet werden. */
export function renderLibrary(){
  /* Einmal fuer die ganze Liste, nicht je Uebung: der Log fasst bis zu 2000
     Eintraege, und 42 Einzelabfragen liefen ihn 42-mal durch. */
  const zuletztAlle = letztesDatumJeUebung(state.log || [], getDay);
  const list = EXERCISES
    .map((ex, i) => ({ ex, i, lvl: lvlOf(ex), zuletzt: zuletztAlle[ex.id] || null }))
    .filter(e => libFilter === 'all' || e.ex.cat === libFilter)
    .sort(LIB_SORT[libSort] || LIB_SORT.standard);

  const planIds = new Set(getDays().flatMap(d => d.ex));

  document.getElementById('libList').innerHTML = list.length ? list.map(({ ex, lvl, zuletzt }) => {
    const open = libOpen[ex.id];
    const herTage = zuletzt ? tageZwischen(zuletzt, today()) : null;
    /* Nur melden, was auffaellt: eine Uebung von vorgestern braucht keinen
       Hinweis, und ein Chip an jeder der 42 Zeilen waere keiner mehr. */
    const liegt = herTage === null || herTage >= LIB_STALE_TAGE;
    const pr = (state.prs || {})[ex.id];
    /* Der Suchtext wird beim Aufbau festgeschrieben, damit filterLibrary()
       weder die Uebungsdaten noch die Uebersetzung erneut durchgehen muss.
       Ein Sprachwechsel laeuft ueber renderAll() und baut ohnehin neu auf. */
    const suchtext = [exName(ex), ...ex.levels.map((l, i) => exStage(ex, i))]
      .join(' ').toLowerCase();
    /* Nicht machbare Uebungen verschwinden nicht von selbst: sie bekommen
       einen Hinweis und lassen sich ueber das Kontrollkaestchen ausblenden.
       Wer die Ausruestung gerade erst eingetragen hat, soll nicht raten
       muessen, warum die Haelfte der Bibliothek fehlt. */
    const geht = machbar(ex);
    return '<div class="lib-item" data-exid="' + ex.id + '" data-cat="' + ex.cat + '" data-such="' + esc(suchtext) +
      '" data-eqok="' + (geht ? '1' : '0') + '">' +
      /* Echter Button statt eines klickbaren div: der Kopf ist die
         Hauptinteraktion dieses Tabs und war per Tastatur unerreichbar. */
      '<button type="button" class="lib-head" data-action="library:toggle" data-ex="' + ex.id + '"' +
        ' aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="libbody-' + ex.id + '">' +
        '<span class="lib-name">' + esc(exName(ex)) +
          (planIds.has(ex.id) ? ' <span class="cat-chip">' + esc(__('inPlan')) + '</span>' : '') +
          (geht ? '' : ' <span class="cat-chip warn">' + esc(__('equipMissing')) + '</span>') +
          (liegt ? ' <span class="cat-chip stale">' + esc(herTage === null
            ? __('neverTrained')
            : __('staleDays', { n: herTage })) + '</span>' : '') + '</span>' +
        '<span class="lib-meta">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length + ' <span aria-hidden="true">' + (open ? '−' : '+') + '</span></span>' +
      '</button>' +
      '<div class="lib-body' + (open ? ' open' : '') + '" id="libbody-' + ex.id + '">' +
        '<div class="muted">' + esc(catName(ex.cat, CATS[ex.cat].name)) + ' · ' + esc(__('equipment')) + ': ' + esc(equipListe(ex.equip)) +
          (ex.rest ? ' · ' + esc(__('restOf', { sec: ex.rest })) : '') +
          ' · ' + esc(zuletzt ? __('lastTrainedOn', { date: fmtDate(zuletzt) }) : __('neverTrained')) + '</div>' +
        /* Je Stufe, nicht je Uebung: bei Dips sind die ersten beiden Stufen
           an der Bank machbar und erst die spaeteren brauchen Parallettes.
           Genau das soll hier ablesbar sein. */
        '<ul class="lvl-list">' + ex.levels.map((l, i) => {
          const luecke = fehlt(ex, i);
          return '<li class="' + (i === lvl ? 'at' : (i < lvl ? 'passed' : '')) + (luecke.length ? ' gesperrt' : '') + '">' +
            '<span>' + (i + 1) + '. ' + esc(exStage(ex, i)) +
            (luecke.length ? ' <small>(' + esc(__('needsEquip', { list: equipListe(luecke) })) + ')</small>' : '') +
            '</span><span class="t">' + esc(zielText(l)) + '</span></li>';
        }).join('') + '</ul>' +
        '<div class="inline-row"><button data-action="level:adjust" data-ex="' + ex.id + '" data-delta="-1">− ' + __('level') + '</button>' +
          '<button data-action="level:adjust" data-ex="' + ex.id + '" data-delta="1">+ ' + __('level') + '</button></div>' +
        /* Der Platzhalter war die einzige Beschriftung; er verschwindet beim
           Tippen und wird nicht von jedem Screenreader angesagt. */
        '<div class="inline-row"><input id="pr-' + ex.id + '" placeholder="' + esc(__('bestPlaceholder')) + '"' +
          ' aria-label="' + esc(__('bestAria', { name: exName(ex) })) + '"' +
          ' value="' + (pr ? esc(pr.v) : '') + '">' +
          '<button data-action="pr:save" data-ex="' + ex.id + '">' + __('save') + '</button></div>' +
        (pr ? '<div class="pr-line">' + esc(__('prUpdated')) + ' ' + fmtDate(pr.d) + '</div>' : '') +
        '<ul class="tips open tips--inline">' + exTips(ex).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
        '<button class="tip-btn" data-action="exercise:history" data-ex="' + ex.id + '">' + ikon('chart') + ' ' + __('perExercise') + '</button>' +
      '</div></div>';
  }).join('') : '';
  filterLibrary();
}

/* Blendet aus, was nicht zur Suche passt – ohne die Liste anzufassen. Damit
   ueberleben halb getippte Bestleistungen in anderen Eintraegen, der auf- und
   zugeklappte Zustand bleibt, und pro Tastendruck faellt kein Neuaufbau an. */
export function nurMachbarSetzen(wert){
  libNurMachbar = wert;
  filterLibrary();
}
export function filterLibrary(){
  const q = (document.getElementById('libSearch').value || '').toLowerCase().trim();
  const eintraege = document.querySelectorAll('#libList .lib-item');
  let sichtbar = 0;
  eintraege.forEach(el => {
    const passt = (!q || (el.dataset.such || '').includes(q)) &&
      (!libNurMachbar || el.dataset.eqok === '1');
    el.hidden = !passt;
    if(passt) sichtbar++;
  });
  const leer = document.getElementById('libEmpty');
  if(leer) leer.hidden = sichtbar > 0;
}
export function toggleLib(id){ libOpen[id] = !libOpen[id]; renderLibrary(); }

export async function savePR(id){
  const v = (document.getElementById('pr-' + id).value || '').trim().slice(0, 40);
  if(!v){
    delete state.prs[id];
  } else {
    const n = parseInt(v, 10);
    /* Eine Handeingabe gewinnt immer – sie ist ausdruecklich gewollt. art und
       lvl gehoeren trotzdem dazu, sonst bewertet besserePR() den naechsten
       automatischen Eintrag falsch: ohne Stufe stuende die Eingabe auf 0 und
       jede Masseinheit-Aenderung wuerde sie sofort ueberschreiben. */
    const ex = EX_BY_ID[id];
    const art = /\bsek|\bsec/i.test(v) ? 'sek' : 'reps';
    const lvl = ex ? lvlOf(ex) : 0;
    state.prs[id] = Number.isFinite(n)
      ? { v, n, d: today(), art, lvl }
      : { v, d: today(), art, lvl };
  }
  await save(); renderLibrary(); toast(v ? __('bestSaved') : __('bestDeleted'));
}

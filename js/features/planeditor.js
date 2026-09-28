/* Tab Plan: Vorlage, Editor mit Menue, Ziehen und Supersaetzen, Wochenbilanz,
   Wochenrhythmus und der Plangenerator. */

import { wochenTage, wochenbilanz } from '../domain/bilanz.js';
import { esc, sanitizeDayKey } from '../domain/escape.js';
import { zaehleJeTag } from '../domain/log.js';
import { wochentageVorschlag } from '../domain/plan.js';
import { SCHWERPUNKTE, buildPlan, moeglicheZiele, tempoFaktor } from '../domain/planbuilder.js';
import { gueltigePaare, paarUmschalten, partnerVon } from '../domain/supersatz.js';
import { CATS, EXERCISES, EX_BY_ID, PLAN_TEMPLATES } from '../exercises.js';
import { __, catName, exName, planDesc } from '../i18n/index.js';
import { zahl } from '../ui/delegate.js';
import { dayTitleOf, getDay, getDays, planLabel, renderDaySelect, renderStats, rhythmusAktiv, save, vorlageFuerAusruestung, wochentage } from '../app.js';
import { an, cfg, state } from '../core/kern.js';
import { machbar } from './ausruestung.js';
import { renderLibrary } from './bibliothek.js';
import { renderHistory } from './verlauf.js';
import { askConfirm, askDialog, askText, dialogFuss, dialogKopf } from '../ui/dialoge.js';
import { ikon, melde, toast } from '../ui/hinweise.js';

/* Der Wochenrhythmus: je Wochentag ein Plan-Tag oder nichts.

   Gerufen aus renderPlanTab() und nicht aus showTab(): die Auswahl listet
   die Trainingstage, und die aendern sich beim Umbenennen, Hinzufuegen,
   Entfernen und beim Vorlagenwechsel. Aus einer Stelle heraus kann das
   nicht auseinanderlaufen.

   Angezeigt wird Montag zuerst, gespeichert nach Date.getDay() (0 = Sonntag).
   Die Reihenfolge kommt aus wochentage(), damit die Namen und die Anordnung
   dieselbe Quelle haben wie im Kalender. */
const WOCHENTAG_REIHENFOLGE = [1, 2, 3, 4, 5, 6, 0];

function renderWeekPlan(){
  const el = document.getElementById('weekPlan');
  if(!el) return;
  const namen = wochentage();
  const days = getDays();
  el.innerHTML = WOCHENTAG_REIHENFOLGE.map((wd, i) =>
    '<div class="set-row"><span><label class="lbl2" for="wp-' + wd + '">' + esc(namen[i]) + '</label></span>' +
    '<select id="wp-' + wd + '" data-action-change="weekplan:set" data-wd="' + wd + '">' +
      '<option value="">' + esc(__('noDay')) + '</option>' +
      days.map(d => '<option value="' + esc(d.key) + '"' +
        ((state.wochenplan || {})[wd] === d.key ? ' selected' : '') + '>' +
        esc(d.key + ' · ' + dayTitleOf(d)) + '</option>').join('') +
    '</select></div>').join('');
}

export function setWeekPlan(wd, key){
  if(!/^[0-6]$/.test(String(wd))) return;
  const plan = { ...(state.wochenplan || {}) };
  if(key && getDay(key)) plan[wd] = key; else delete plan[wd];
  state.wochenplan = plan;
  save();
  renderBilanz();
  /* Der Rhythmus entscheidet ueber den Vorschlag und die Zeile darueber –
     beides liegt im Trainings-Tab und wird sonst erst zufaellig neu gebaut. */
  renderDaySelect(); renderHistory();
}

/* ================= Plan-Editor mit Drag & Drop ================= */
let dragSrcId = null, dragSrcIdx = null;

export function renderPlanTab(){
  const sel = document.getElementById('planSelect');
  sel.innerHTML = Object.entries(PLAN_TEMPLATES).map(([k, v]) =>
    '<option value="' + k + '"' + (!state.customPlan && state.planId === k ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
    (state.customPlan ? '<option value="custom" selected>' + __('customPlan') + '</option>' : '');
  document.getElementById('planDesc').textContent = state.customPlan
    /* Die eigene Beschreibung, wenn es eine gibt: ein erzeugter Plan sagt
       damit, woher er kommt, statt pauschal "von dir angepasst". */
    ? (state.customPlan.desc || __('customPlanDesc'))
    : planDesc(state.planId, (PLAN_TEMPLATES[state.planId] || {}).desc || '');

  const days = getDays();
  /* Wie oft jeder Tag wirklich dran war. Eine schiefe Rotation – "A 30×,
     B 12×" – heisst, dass die Zugtage regelmaessig ausfallen, und das sieht
     man sonst nirgends. Gezaehlt wird im Log und nicht in einem Zaehler
     daneben: Importe, Nachtraege und Loeschungen stehen dort ohnehin alle. */
  const proTag = zaehleJeTag(state.log || []);
  const meiste = Math.max(0, ...days.map(d => proTag[d.key] || 0));
  const gesamt = days.reduce((a, d) => a + (proTag[d.key] || 0), 0);

  document.getElementById('planEditor').innerHTML = days.map((d, di) => {
    const paare = gueltigePaare(d);
    return '<div class="plan-day" data-tag="' + di + '">' +
      '<div class="plan-day-head"><span class="plan-day-title">' + esc(d.key) + ' · ' + esc(dayTitleOf(d)) +
        /* Erst ab zwei Einheiten: sonst haengt der zweite Tag schon hinterher,
           bevor er ueberhaupt an der Reihe war. */
        (gesamt >= 2
          ? ' <span class="plan-day-count' + ((proTag[d.key] || 0) * 2 < meiste ? ' warn' : '') + '">' +
            esc(__('dayCount', { n: proTag[d.key] || 0 })) + '</span>'
          : '') +
      '</span>' +
        '<span><button class="mini-btn" data-action="planDay:rename" data-day="' + di + '" title="' + __('rename') + '" aria-label="' + __('rename') + '">' + ikon('edit') + '</button> ' +
        '<button class="mini-btn danger" data-action="planDay:remove" data-day="' + di + '" title="' + __('remove') + '" aria-label="' + __('remove') + '">' + ikon('close') + '</button></span></div>' +
      d.ex.map((id, ei) => {
        const ex = EX_BY_ID[id];
        /* Drag & Drop laeuft ueber einen eigenen, auf #planEditor begrenzten
           Listener statt ueber die allgemeine Aktionstabelle: dragover feuert
           ununterbrochen und muss jedes Mal preventDefault() aufrufen – das
           gehoert nicht durch einen Namens-Lookup am document. */
        /* Hoch, runter und entfernen in einem Menue. Als drei Knoepfe
           nebeneinander liessen sie dem Namen auf dem Handy rund 130px, und
           fast jeder brach um. Mit dem Finger zieht man am Griff
           (installTouchZiehen()); hoch und runter bleiben fuer Tastatur und
           Screenreader, und das Menue bleibt nach einem Schritt offen
           (moveEx()). */
        const name = ex ? exName(ex) : id;
        const pp = partnerVon(paare, id);
        const naechsteFrei = ei < d.ex.length - 1 && !partnerVon(paare, d.ex[ei + 1]);
        const knopf = (aktion, delta, symbol, text, aus, extra = '') =>
          '<button type="button"' + extra + ' data-action="' + aktion + '" data-day="' + di + '" data-i="' + ei + '"' +
          (delta ? ' data-delta="' + delta + '"' : '') + (aus ? ' disabled' : '') + '>' + symbol +
          /* Die Texte sind auch Tooltips und stehen dort klein. */
          esc(text.charAt(0).toUpperCase() + text.slice(1)) + '</button>';
        return '<div class="plan-ex' + (pp ? (pp.erster ? ' ss-erster' : ' ss-zweiter') : '') + '" draggable="true" data-day="' + di + '" data-i="' + ei + '"' +
          (ex ? ' data-cat="' + ex.cat + '"' : '') + '>' +
          '<span class="drag-handle">' + ikon('grip') + '</span>' +
          '<span class="nm">' + (ex ? esc(exName(ex)) : '<i>' + esc(__('unknownExercise', { id })) + '</i>') +
            (pp && pp.erster ? ' <span class="cat-chip ss-chip">' + esc(__('supersetLabel')) + '</span>' : '') + '</span>' +
          '<details class="pe-menu" data-day="' + di + '" data-i="' + ei + '">' +
            '<summary class="mini-btn" aria-label="' + esc(__('exActions', { ex: name })) + '" title="' + esc(__('exActions', { ex: name })) + '">' + ikon('more') + '</summary>' +
            '<div class="pe-liste">' +
              knopf('planEx:move', '-1', ikon('up'), __('moveUp'), ei === 0) +
              knopf('planEx:move', '1', ikon('down'), __('moveDown'), ei === d.ex.length - 1) +
              knopf('planEx:pair', '', ikon('swap'), __(pp ? 'pairDissolve' : 'pairWithNext'), !pp && !naechsteFrei) +
              knopf('planEx:remove', '', ikon('close'), __('remove'), false, ' class="danger"') +
            '</div></details></div>';
      }).join('') +
      /* Nicht machbare Uebungen werden gesperrt statt entfernt: ein verkuerztes
         Menue laesst offen, warum eine Uebung fehlt – ein ausgegrauter Eintrag
         mit Grund erklaert sich selbst. */
      '<div class="inline-row"><select id="add-' + di + '">' +
        Object.keys(CATS).map(c => '<optgroup label="' + esc(catName(c, CATS[c].name)) + '">' +
          EXERCISES.filter(e => e.cat === c).map(e => {
            const geht = machbar(e);
            return '<option value="' + e.id + '"' + (geht ? '' : ' disabled') + '>' +
              esc(exName(e)) + (geht ? '' : ' (' + esc(__('equipMissing')) + ')') + '</option>';
          }).join('') +
          '</optgroup>').join('') +
      '</select><button data-action="planEx:add" data-day="' + di + '">' + __('addExercise') + '</button></div>' +
    '</div>';
  }).join('') || '<div class="empty-hint">' + __('noPlanDays') + '</div>';

  renderWeekPlan();
  renderBilanz();
}

/* Wochenbilanz unter dem Plan-Editor. Die Woche kommt aus dem festen
   Rhythmus, sonst aus dem Wochenziel: bei A/B und vier Einheiten also
   A, B, A, B. */
export const BILANZ_KAT = { druecken: 'push', ziehen: 'pull', beine: 'legs', rumpf: 'core' };
function renderBilanz(){
  const el = document.getElementById('planBilanz');
  if(!el) return;
  const woche = wochenTage(getDays(), state.wochenplan, cfg('weekGoal'));
  if(!woche.length){ el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const b = wochenbilanz(woche, EX_BY_ID, state.levels, cfg('setsMode'));
  const auffaellig = new Set(b.warnungen.map(w => w.gruppe).filter(Boolean));
  el.innerHTML =
    '<p class="bil-kopf">' + esc(__(rhythmusAktiv() ? 'bilanzRhythmus' : 'bilanzZiel', { n: b.einheiten })) + '</p>' +
    Object.entries(b.gruppen).map(([g, w]) =>
      '<div class="bil-row' + (auffaellig.has(g) ? ' warn' : '') + '">' +
        '<span class="bil-name"><i class="vol-' + BILANZ_KAT[g] + '" aria-hidden="true"></i>' + esc(bilanzGruppe(g)) + '</span>' +
        '<span class="bil-wert">' + esc(w.saetze === 1 ? __('setsCountOne') : __('setsCountMany', { n: w.saetze })) +
          ' · ' + esc(__('dayCount', { n: w.tage })) + '</span></div>').join('') +
    (bilanzWarnungen(b) || '<p class="bil-ok">' + esc(__('bilanzOk')) + '</p>');
}
export const bilanzGruppe = g => catName(BILANZ_KAT[g], CATS[BILANZ_KAT[g]].name);
/* Die Warnungen als Liste, leer ohne Warnung. Auch fuer die Vorschau im
   Generator-Dialog: bei 30 Minuten passt keine Hueftbeuge mehr, und das
   soll man sehen, bevor man den Plan uebernimmt. */
function bilanzWarnungen(b){
  const text = w => {
    if(w.art === 'huefte') return __('bilanzHuefte');
    if(w.art === 'zugWenig') return __('bilanzZugWenig', { d: b.gruppen.druecken.saetze, z: b.gruppen.ziehen.saetze });
    return __('bilanz_' + w.art, { g: bilanzGruppe(w.gruppe), n: b.gruppen[w.gruppe].saetze });
  };
  return b.warnungen.length
    ? '<ul class="bil-warn">' + b.warnungen.map(w => '<li>' + esc(text(w)) + '</li>').join('') + '</ul>'
    : '';
}

/* Ein Listener fuer den ganzen Plan-Editor. Die Zeilen tragen nur noch
   data-day und data-i; das Event kommt als Parameter statt aus dem
   impliziten globalen window.event (nicht standardisiert, in Firefox nicht
   vorhanden und unter Modulen ohnehin nicht verfuegbar). */
export function installPlanDragAndDrop(){
  const editor = document.getElementById('planEditor');
  const zeile = ev => ev.target.closest('.plan-ex[data-day]');

  /* Die Menues der Plan-Zeilen: immer nur eines offen, ein Tipp daneben
     oder Escape schliesst es. toggle steigt nicht auf, deshalb capture. */
  const menues = () => editor.querySelectorAll('details.pe-menu[open]');
  editor.addEventListener('toggle', ev => {
    if(ev.target.matches && ev.target.matches('details.pe-menu') && ev.target.open){
      menues().forEach(m => { if(m !== ev.target) m.open = false; });
    }
  }, true);
  an(document, 'click', ev => {
    if(!ev.target.closest || !ev.target.closest('details.pe-menu')) menues().forEach(m => { m.open = false; });
  });
  an(editor, 'keydown', ev => {
    const m = ev.key === 'Escape' && ev.target.closest && ev.target.closest('details.pe-menu[open]');
    if(!m) return;
    ev.preventDefault();
    m.open = false;
    m.querySelector('summary').focus();
  });

  an(editor, 'dragstart', ev => {
    const el = zeile(ev); if(!el) return;
    dragSrcId = zahl(el.dataset.day); dragSrcIdx = zahl(el.dataset.i);
    ev.dataTransfer.effectAllowed = 'move';
    /* Firefox startet einen Drag nur, wenn Daten gesetzt sind. */
    ev.dataTransfer.setData('text/plain', dragSrcId + ':' + dragSrcIdx);
  });

  an(editor, 'dragover', ev => {
    if(!zeile(ev) || dragSrcId === null) return;
    ev.preventDefault();                       /* macht die Zeile erst ablegbar */
    ev.dataTransfer.dropEffect = 'move';
  });

  an(editor, 'drop', ev => {
    const el = zeile(ev); if(!el) return;
    ev.preventDefault();
    dragDrop(zahl(el.dataset.day), zahl(el.dataset.i));
  });

  an(editor, 'dragend', () => { dragSrcId = null; dragSrcIdx = null; });

  installTouchZiehen(editor);
}

/* Ziehen mit dem Finger. HTML-Drag-and-Drop kennt keine Beruehrung – auf
   dem Handy blieb nur das Menue, und eine Uebung vom Ende eines Tags an
   den Anfang waren sechs Tipps. Der Griff links an jeder Zeile nimmt
   deshalb Pointer-Ereignisse an, aber nur von Finger und Stift; die Maus
   behaelt das bisherige Drag-and-Drop.

   touch-action:none am Griff (style.css) haelt den Browser davon ab, die
   Geste als Scrollen zu nehmen. Die Zeile folgt dem Finger, eine Linie
   zeigt, wo sie landet: ueber der Zeile unter dem Finger oder darunter, je
   nach Haelfte. Ueber einem Tag ohne Zeile darunter – etwa einem leeren –
   kommt sie ans Ende. Nahe am Rand scrollt die Seite mit. Abgelegt wird
   ueber dragDrop(), also mit demselben Hinweis, wenn dabei ein Supersatz
   zerfaellt. */
const ZIEH_RAND = 80;
function installTouchZiehen(editor){
  let zug = null;
  const markieren = (ziel, nach, tag) => {
    if(!zug) return;
    zug.ziel?.classList.remove('drop-vor', 'drop-nach');
    zug.tagEl?.classList.remove('drop-tag');
    zug.ziel = ziel; zug.nach = nach; zug.tagEl = tag;
    ziel?.classList.add(nach ? 'drop-nach' : 'drop-vor');
    tag?.classList.add('drop-tag');
  };
  const beenden = () => {
    if(!zug) return;
    markieren(null, false, null);
    zug.zeile.classList.remove('zieht');
    zug.zeile.style.transform = '';
    zug = null;
  };

  an(editor, 'pointerdown', ev => {
    if(ev.pointerType === 'mouse' || zug || !ev.target.closest) return;
    const griff = ev.target.closest('.drag-handle');
    const zeile = griff && griff.closest('.plan-ex[data-day]');
    if(!zeile) return;
    ev.preventDefault();
    try{ griff.setPointerCapture(ev.pointerId); }catch{ /* jsdom, alte Browser */ }
    zug = { zeile, griff, id: ev.pointerId, y0: ev.clientY, scroll0: window.scrollY, ziel: null, nach: false, tagEl: null };
    zeile.classList.add('zieht');
  });

  an(editor, 'pointermove', ev => {
    if(!zug || ev.pointerId !== zug.id) return;
    ev.preventDefault();
    if(ev.clientY < ZIEH_RAND) window.scrollBy(0, -12);
    else if(ev.clientY > window.innerHeight - ZIEH_RAND) window.scrollBy(0, 12);
    zug.zeile.style.transform = 'translateY(' + Math.round(ev.clientY - zug.y0 + window.scrollY - zug.scroll0) + 'px)';
    /* Die gezogene Zeile hat pointer-events:none – darunter liegt das Ziel. */
    const unter = document.elementFromPoint ? document.elementFromPoint(ev.clientX, ev.clientY) : null;
    const ziel = unter && unter.closest ? unter.closest('.plan-ex[data-day]') : null;
    if(ziel && ziel !== zug.zeile){
      const r = ziel.getBoundingClientRect();
      markieren(ziel, ev.clientY > r.top + r.height / 2, null);
    } else {
      const tag = !ziel && unter && unter.closest ? unter.closest('#planEditor .plan-day') : null;
      markieren(null, false, tag);
    }
  });

  const loslassen = ev => {
    if(!zug || ev.pointerId !== zug.id) return;
    const { zeile, ziel, nach, tagEl } = zug;
    beenden();
    let di = null, ei = null;
    if(ziel){ di = zahl(ziel.dataset.day); ei = zahl(ziel.dataset.i) + (nach ? 1 : 0); }
    else if(tagEl){ di = zahl(tagEl.dataset.tag); ei = (getDays()[di] || { ex: [] }).ex.length; }
    if(di === null) return;
    const von = zahl(zeile.dataset.day), vonI = zahl(zeile.dataset.i);
    /* Vor oder hinter sich selbst abgelegt: keine Bewegung. */
    if(di === von && (ei === vonI || ei === vonI + 1)) return;
    const ex = EX_BY_ID[(getDays()[von] || { ex: [] }).ex[vonI]];
    dragSrcId = von; dragSrcIdx = vonI;
    dragDrop(di, ei);
    dragSrcId = null; dragSrcIdx = null;
    if(ex) melde(__('movedTo', { name: exName(ex), day: getDays()[di].key }));
  };
  an(editor, 'pointerup', loslassen);
  an(editor, 'pointercancel', ev => { if(zug && ev.pointerId === zug.id) beenden(); });
}

function dragDrop(di, ei){
  if(dragSrcId === null || dragSrcIdx === null) return;
  if(dragSrcId === di && dragSrcIdx === ei) return;
  const p = ensureCustom();
  const vorher = tagesStand(p, [dragSrcId, di]);
  const arr = p.days[dragSrcId].ex;
  const item = arr.splice(dragSrcIdx, 1)[0];
  if(dragSrcId === di && dragSrcIdx < ei) ei--;
  p.days[di].ex.splice(ei, 0, item);
  const weg = [...paareAufraeumen(p.days[dragSrcId]), ...(di !== dragSrcId ? paareAufraeumen(p.days[di]) : [])];
  dragSrcId = null; dragSrcIdx = null;
  save(); renderPlanTab();
  paarVerlustAnbieten(p, vorher, weg);
}

/* Huelle um buildPlan(): reicht Uebungen, Ausruestung und die uebersetzten
   Bezeichnungen hinein. Das Modul selbst bleibt damit ohne Sprachwissen. */
/* Wie schnell die letzten Einheiten wirklich waren (tempoFaktor() in
   js/domain/planbuilder.js), oder null, solange es zu wenige gibt. */
export const planTempo = () => tempoFaktor(state.log, EXERCISES, cfg('setsMode'));
function planAusAusruestung(tage, ziel, minuten, schwerpunkt, supersaetze = false){
  const tempo = planTempo();
  return buildPlan({
    exercises: EXERCISES,
    equipment: state.equipment,
    tage, ziel, minuten, schwerpunkt, supersaetze,
    tempo: tempo ? tempo.faktor : 1,
    setsMode: cfg('setsMode'),
    levels: state.levels,
    texte: {
      name: __('customPlan'),
      desc: __('generatedPlanDesc'),
      sub: __('generatedDaySub'),
      ganzkoerper: __('fullBody'),
      tage: {
        gk: __('fullBody'), ok: __('dayUpper'), uk: __('dayLower'),
        push: __('dayPush'), pull: __('dayPull'), legs: __('dayLegs')
      }
    }
  });
}

export async function generatePlan(){
  const res = await askPlanBuilder();
  const plan = res && res.plan;
  if(!plan || !plan.days.length) return;
  /* Ein eigener Plan wird ueberschrieben – das ist Arbeit, die verloren geht,
     also nicht ohne Rueckfrage. */
  if(state.customPlan){
    const ok = await askConfirm(__('buildPlan'), __('overwriteCustomPlan'), __('apply'), true);
    if(!ok) return;
  }
  state.customPlan = plan;
  /* Die Tag-Keys des neuen Plans bedeuten etwas anderes als die des alten:
     ein alter Rhythmus mit A am Montag zeigte sonst auf den neuen Tag A. */
  if(res.wochenplan) state.wochenplan = res.wochenplan;
  save();
  renderPlanTab(); renderStats(); renderDaySelect(); renderLibrary();
  toast(__('planBuilt', { n: plan.days.length }));
}

export function ensureCustom(){
  if(!state.customPlan){
    /* Von dem aus, was man gerade sieht – also der fuer die Ausruestung
       aufgeloesten Vorlage, nicht der rohen Liste. */
    const base = vorlageFuerAusruestung(state.planId);
    state.customPlan = JSON.parse(JSON.stringify({ name: __('customPlan'), desc: __('customPlanDesc'), days: base.days }));
  }
  return state.customPlan;
}
export function changePlan(v){
  if(v === 'custom'){ ensureCustom(); }
  else { state.customPlan = null; state.planId = v; }
  save(); renderPlanTab(); renderStats(); renderDaySelect();
  toast(__('planChanged', { name: planLabel() }));
}
export async function resetPlan(){
  const ok = await askConfirm(__('planResetTitle'), __('planResetBody'), __('reset'), true);
  if(!ok) return;
  state.customPlan = null; save(); renderPlanTab(); renderDaySelect(); toast(__('planReset'));
}
export async function addPlanDay(){
  const p = ensureCustom();
  const key = sanitizeDayKey(await askText(__('addDay'), __('dayKeyLabel'),
    String.fromCharCode(65 + p.days.length), 6));
  if(!key) return;
  const title = (await askText(__('addDay'), __('dayTitle'), __('addDay'), 40)) || __('addDay');
  p.days.push({ key, title: title.slice(0, 40), sub: '', ex: [] });
  save(); renderPlanTab(); renderDaySelect();
}
export async function renameDay(di){
  const p = ensureCustom(), d = p.days[di];
  const key = await askText(__('renameDayTitle'), __('dayKeyShort'), d.key, 6);
  if(key === null) return;
  const title = await askText(__('renameDayTitle'), __('dayTitle'), d.title, 40);
  if(title === null) return;
  const sub = await askText(__('renameDayTitle'), __('daySub'), d.sub || '', 60);
  if(sub === null) return;
  d.key = sanitizeDayKey(key) || d.key;
  d.title = title.slice(0, 40) || d.title;
  d.sub = sub.slice(0, 60);
  save(); renderPlanTab(); renderDaySelect();
}
export async function removeDay(di){
  const p = ensureCustom();
  const ok = await askConfirm(__('removeDayTitle'),
    __('removeDayBody', { name: p.days[di].title }), __('remove'), true);
  if(!ok) return;
  p.days.splice(di, 1); save(); renderPlanTab(); renderDaySelect();
}
export function addEx(di){
  const p = ensureCustom();
  const id = document.getElementById('add-' + di).value;
  if(p.days[di].ex.includes(id)){ toast(__('exerciseAlreadyIn')); return; }
  p.days[di].ex.push(id); save(); renderPlanTab();
  toast(__('exerciseAdded', { name: exName(EX_BY_ID[id]) }));
}
export function removeEx(di, ei){
  const p = ensureCustom(), vorher = tagesStand(p, [di]);
  p.days[di].ex.splice(ei, 1);
  const weg = paareAufraeumen(p.days[di]);
  save(); renderPlanTab();
  paarVerlustAnbieten(p, vorher, weg);
}
/* Nach jeder Aenderung an der Reihenfolge: ein Paar, dessen Uebungen nicht
   mehr nebeneinander stehen, ist aufgeloest (js/domain/supersatz.js). */
function paareAufraeumen(day){
  if(!day || !day.ss) return [];
  const ss = gueltigePaare(day);
  const behalten = new Set(ss.map(p => p.join('|')));
  /* Gespeichert sind nur gueltige Paare (clampBackup, bisher jeder
     Schritt) – was jetzt fehlt, ist also eben zerfallen. */
  const weg = day.ss.filter(p => Array.isArray(p) && !behalten.has(p.join('|')));
  if(ss.length) day.ss = ss; else delete day.ss;
  return weg;
}

/* Rueckgaengig fuer einen Supersatz, der beim Verschieben oder Entfernen
   zerfallen ist. Das Aufloesen war bisher stumm: wer eine Uebung aus dem
   Paar einen Platz nach unten schob, sah die Klammer im Training nicht
   mehr und wusste nicht, warum. Jetzt sagt es ein Hinweis, und ein Tipp
   stellt den Stand vor dem Schritt wieder her – aber nur, solange sich
   an den betroffenen Tagen seither nichts geaendert hat; sonst ueberschriebe
   das Rueckgaengig einen spaeteren Schritt. */
let paarRueckgabe = null;
function tagesStand(p, tage){
  return [...new Set(tage)].map(di => p.days[di] ? {
    di, ex: [...p.days[di].ex], ss: (p.days[di].ss || []).map(x => [...x])
  } : null);
}
function paarVerlustAnbieten(p, vorher, weg){
  if(!weg.length){ paarRueckgabe = null; return; }
  paarRueckgabe = { vorher, nachher: JSON.stringify(tagesStand(p, vorher.map(v => v.di))) };
  const name = id => EX_BY_ID[id] ? exName(EX_BY_ID[id]) : id;
  const [a, b] = weg[0];
  toast(__(weg.length > 1 ? 'pairsDissolved' : 'pairDissolved', { a: name(a), b: name(b), n: weg.length }),
    false, { text: __('undo'), action: 'planEx:pairUndo' });
}
export function paarRueckgaengig(){
  const r = paarRueckgabe;
  paarRueckgabe = null;
  if(!r) return;
  const p = ensureCustom();
  if(JSON.stringify(tagesStand(p, r.vorher.map(v => v.di))) !== r.nachher){ toast(__('pairUndoStale')); return; }
  r.vorher.forEach(v => {
    const d = p.days[v.di];
    d.ex = v.ex;
    if(v.ss.length) d.ss = v.ss; else delete d.ss;
  });
  save(); renderPlanTab();
  toast(__('pairRestored'));
}
export function paarSchalten(di, ei){
  const p = ensureCustom(), day = p.days[di];
  if(!day || ei < 0 || ei >= day.ex.length) return;
  const ss = paarUmschalten(day, ei);
  if(ss.length) day.ss = ss; else delete day.ss;
  save(); renderPlanTab();
  document.querySelector('#planEditor details.pe-menu[data-day="' + di + '"][data-i="' + ei + '"] summary')?.focus({ preventScroll: true });
}
export function moveEx(di, ei, d){
  const p = ensureCustom(), arr = p.days[di].ex;
  const t = ei + d; if(t < 0 || t >= arr.length) return;
  const vorher = tagesStand(p, [di]);
  [arr[ei], arr[t]] = [arr[t], arr[ei]];
  const weg = paareAufraeumen(p.days[di]);
  save(); renderPlanTab();
  paarVerlustAnbieten(p, vorher, weg);
  /* Das Menue geht an der Uebung wieder auf, die gerade gewandert ist, und
     der Fokus steht auf derselben Richtung: drei Plaetze sind drei Tipps.
     Am Rand ist die Richtung gesperrt, dann die andere. */
  const menu = document.querySelector('#planEditor details.pe-menu[data-day="' + di + '"][data-i="' + t + '"]');
  if(menu){
    menu.open = true;
    const ziel = menu.querySelector('[data-delta="' + d + '"]:not([disabled])') ||
      menu.querySelector('[data-delta]:not([disabled])') || menu.querySelector('summary');
    ziel.focus({ preventScroll: true });
  }
}

/* Plangenerator – zwei Auswahlfelder mit sofortiger Vorschau.

   askChoice() reicht dafuer nicht: dort ist jede Option ein Endergebnis, hier
   sind zwei Angaben zu kombinieren und das Ergebnis will vor dem Uebernehmen
   gesehen werden. Geruest, Fokusfalle und Promise kommen unveraendert aus
   askDialog(). */
function askPlanBuilder(){
  /* Nur Ziele, die mit der eigenen Ausruestung gehen. */
  const ZIELE_HIER = ['keiner', ...moeglicheZiele(EXERCISES, state.equipment)];
  /* Steht nur da, wenn der Generator die Schaetzung tatsaechlich anpasst. */
  const tempo = planTempo();
  const tempoHinweis = tempo && tempo.faktor !== 1
    ? __(tempo.faktor > 1 ? 'tempoSlower' : 'tempoFaster', { n: tempo.n, p: Math.round(Math.abs(tempo.faktor - 1) * 100) })
    : '';
  return askDialog((modal, finish) => {
    const titel = __('buildPlan');
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(__('buildPlanBody')) + '</p>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-tage">' + esc(__('daysPerWeek')) + '</label></span>' +
        '<select id="pb-tage">' + [2, 3, 4, 5, 6].map(n =>
          '<option value="' + n + '"' + (n === cfg('weekGoal') ? ' selected' : '') + '>' + n + '×</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-ziel">' + esc(__('skillGoal')) + '</label>' +
        '<span class="hint" id="hint-pb-ziel">' + esc(__('skillGoalHint')) + '</span></span>' +
        '<select id="pb-ziel" aria-describedby="hint-pb-ziel">' + ZIELE_HIER.map(z =>
          '<option value="' + z + '">' + esc(__('goal_' + z)) + '</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-schwerpunkt">' + esc(__('focusGroup')) + '</label>' +
        '<span class="hint" id="hint-pb-schwerpunkt">' + esc(__('focusGroupHint')) + '</span></span>' +
        '<select id="pb-schwerpunkt" aria-describedby="hint-pb-schwerpunkt">' + SCHWERPUNKTE.map(s =>
          '<option value="' + s + '">' + esc(__('focus_' + s)) + '</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-minuten">' + esc(__('minutesPerSession')) + '</label>' +
        (tempoHinweis ? '<span class="hint" id="hint-pb-minuten">' + esc(tempoHinweis) + '</span>' : '') + '</span>' +
        '<select id="pb-minuten"' + (tempoHinweis ? ' aria-describedby="hint-pb-minuten"' : '') + '>' + [30, 45, 60].map(m =>
          '<option value="' + m + '"' + (m === 45 ? ' selected' : '') + '>' + esc(__('minutesN', { n: m })) + '</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-rhythmus">' + esc(__('setWeekdays')) + '</label>' +
        '<span class="hint" id="hint-pb-rhythmus">' + esc(__(rhythmusAktiv() ? 'setWeekdaysReplace' : 'setWeekdaysHint')) + '</span></span>' +
        '<input type="checkbox" id="pb-rhythmus" checked aria-describedby="hint-pb-rhythmus"></div>' +
      '<div class="set-row"><span><label class="lbl2" for="pb-supersaetze">' + esc(__('setSupersets')) + '</label>' +
        '<span class="hint" id="hint-pb-supersaetze">' + esc(__('setSupersetsHint')) + '</span></span>' +
        '<input type="checkbox" id="pb-supersaetze" aria-describedby="hint-pb-supersaetze"></div>' +
      '<div id="pb-vorschau" class="pb-preview"></div>' +
      dialogFuss(__('apply'));

    const tage = modal.querySelector('#pb-tage'), ziel = modal.querySelector('#pb-ziel');
    const minuten = modal.querySelector('#pb-minuten');
    const schwerpunkt = modal.querySelector('#pb-schwerpunkt');
    const rhythmus = modal.querySelector('#pb-rhythmus');
    const supersaetze = modal.querySelector('#pb-supersaetze');
    const vorschau = modal.querySelector('#pb-vorschau');
    const namen = wochentage();
    /* Der Plan wird beim Zeichnen der Vorschau erzeugt und beim Uebernehmen
       genau dieser genommen – nicht ein zweites Mal gebaut. Die Funktion ist
       zwar deterministisch, aber wer die Vorschau bestaetigt, soll auch das
       bekommen, was er gesehen hat. */
    let plan = null, wochenplan = null;
    const zeichnen = () => {
      plan = planAusAusruestung(zahl(tage.value), ziel.value, zahl(minuten.value), schwerpunkt.value, supersaetze.checked);
      wochenplan = rhythmus.checked ? wochentageVorschlag(plan.days.map(d => d.key)) : null;
      /* Wochentag je Plan-Tag, Montag = 0 in namen[]. */
      const wd = {};
      Object.entries(wochenplan || {}).forEach(([t, key]) => { wd[key] = namen[(Number(t) + 6) % 7]; });
      vorschau.innerHTML = plan.days.map(d =>
        '<div class="pb-day"><b>' + (wd[d.key] ? esc(wd[d.key]) + ' · ' : '') + esc(d.key) + ' · ' + esc(d.title) +
        ' <small class="pb-min">' + esc(__('aboutMinutes', { n: d.min })) + '</small></b><span>' +
        /* Ein Supersatz als "A + B", damit man die Paare vor dem Uebernehmen sieht. */
        esc(d.ex.filter(id => !(d.ss || []).some(p => p[1] === id)).map(id => {
          const p = (d.ss || []).find(x => x[0] === id);
          return exName(EX_BY_ID[id]) + (p ? ' + ' + exName(EX_BY_ID[p[1]]) : '');
        }).join(' · ')) + '</span></div>').join('') +
        /* Die Woche des neuen Plans: so viele Einheiten, wie Tage gewaehlt
           sind – der alte Rhythmus gehoert zum alten Plan. */
        bilanzWarnungen(wochenbilanz(wochenTage(plan.days, {}, plan.days.length), EX_BY_ID, state.levels, cfg('setsMode'))) ||
        '<div class="empty-hint">' + esc(__('noExercises')) + '</div>';
    };
    tage.onchange = zeichnen; ziel.onchange = zeichnen; minuten.onchange = zeichnen;
    schwerpunkt.onchange = zeichnen; rhythmus.onchange = zeichnen; supersaetze.onchange = zeichnen;
    zeichnen();

    modal.querySelector('[data-dlg=ok]').onclick = () => finish({ plan, wochenplan });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

/* Tab Ziele: Meilensteine, Bestleistungen und Skill-Fahrplan. */

import { today } from '../domain/dates.js';
import { esc } from '../domain/escape.js';
import { erkannteMeilensteine, meilensteinStatus } from '../domain/milestones.js';
import { istSkill } from '../domain/skills.js';
import { EXERCISES, EX_BY_ID, MILESTONES } from '../exercises.js';
import { __, exName, exStage, msName } from '../i18n/index.js';
import { fmtDate, lvlOf, renderStats, save, signal } from '../app.js';
import { state } from '../core/kern.js';
import { askConfirm, askText } from '../ui/dialoge.js';
import { ikon, toast } from '../ui/hinweise.js';

/* ================= Meilensteine & Fahrplan ================= */
/* Der Stand eines Meilensteins gegen den aktuellen Zustand. */
const msStatus = m => meilensteinStatus(m, {
  levels: state.levels, prs: state.prs, exById: EX_BY_ID
});

/* Was fehlt, in Worten: "Stufe 4 und 5 Wdh" – oder nur der Teil, der
   tatsaechlich aussteht. Aus der blossen Liste wird damit eine
   Wegbeschreibung. */
function fehltText(fehlt){
  if(!fehlt) return '';
  const teile = [];
  if(fehlt.lvl !== undefined) teile.push(__('msNeedsLevel', { n: fehlt.lvl + 1 }));
  if(fehlt.wert !== undefined){
    teile.push(__(fehlt.art === 'sek' ? 'msNeedsSecs' : 'msNeedsReps', { n: fehlt.wert }));
  }
  return teile.length ? __('msNeeds', { list: teile.join(__('andJoin')) }) : '';
}

/* Eigene Meilensteine: der Nutzer kann sich eigene Ziele setzen, die nicht
   in den Daten stehen. Sie werden in state.customMilestones gehalten und
   wie die festen Meilensteine abgehakt. */
function customMilestones(){
  return state.customMilestones || [];
}
export async function addCustomMilestone(){
  const name = await askText(__('addMilestone'), __('milestoneName'), '', 60);
  if(!name || !name.trim()) return;
  if(!state.customMilestones) state.customMilestones = [];
  state.customMilestones.push({ id: 'custom-' + Date.now(), name: name.trim() });
  await save(); renderMilestones();
  toast(__('milestoneAdded', { name: name.trim() }));
}
export async function removeCustomMilestone(id){
  const m = customMilestones().find(x => x.id === id);
  if(!m) return;
  const ok = await askConfirm(__('milestoneRemoveTitle'),
    __('milestoneRemoveBody', { name: m.name }), __('remove'), true);
  if(!ok) return;
  state.customMilestones = customMilestones().filter(x => x.id !== id);
  delete state.milestones[id];
  await save(); renderMilestones();
}

export function renderMilestones(){
  const search = (document.getElementById('msSearch')?.value || '').toLowerCase();
  let list = MILESTONES;
  if(search) list = list.filter(m => msName(m).toLowerCase().includes(search));

  /* Eigene Meilensteine zuerst – sie sind die persoenlichen Ziele. */
  const eigene = customMilestones().filter(m => !search || m.name.toLowerCase().includes(search));
  let html = eigene.map(m => {
    const d = (state.milestones || {})[m.id];
    return '<div class="ms-row">' +
      '<label class="ms' + (d ? ' done' : '') + '">' +
      '<input type="checkbox" ' + (d ? 'checked' : '') +
      ' data-action-change="milestone:toggle" data-id="' + m.id + '"><span>' +
      '<span class="ms-name">' + esc(m.name) + '</span>' +
      (d ? '<br><span class="ms-date">' + esc(__('msAchievedOn')) + ' ' + fmtDate(d) + '</span>' : '') +
      '</span></label>' +
      '<button type="button" class="mini-btn danger" data-action="milestone:removeCustom" data-id="' +
        m.id + '" title="' + esc(__('remove')) + '" aria-label="' + esc(__('remove')) + '">' + ikon('close') + '</button>' +
      '</div>';
  }).join('');

  html += list.map(m => {
    const d = (state.milestones || {})[m.id];
    const s = d ? null : msStatus(m);
    /* Erkannt, aber nicht eingetragen: die App schlaegt vor und hakt nicht
       ab. "Sauber geschafft" folgt aus keiner Zahl. */
    const erkannt = s && s.bekannt && s.erfuellt;
    /* Der Knopf steht NEBEN dem Label, nicht darin: ein Button in einem
       Label wird beim Klick doppelt wirksam – er loest aus UND schaltet das
       Kontrollkaestchen um. Dieselbe Falle wie frueher beim Warm-up-Knopf
       im <summary>. */
    return '<div class="ms-row' + (erkannt ? ' erkannt' : '') + '">' +
      '<label class="ms' + (d ? ' done' : '') + '">' +
      '<input type="checkbox" ' + (d ? 'checked' : '') +
      ' data-action-change="milestone:toggle" data-id="' + m.id + '"><span>' +
      '<span class="ms-name">' + esc(msName(m)) +
        (erkannt ? ' <span class="cat-chip">' + esc(__('msLooksDone')) + '</span>' : '') + '</span>' +
      (d ? '<br><span class="ms-date">' + esc(__('msAchievedOn')) + ' ' + fmtDate(d) + '</span>' : '') +
      (!d && s && s.bekannt && !erkannt
        ? '<br><span class="ms-need">' + esc(fehltText(s.fehlt)) + '</span>' : '') +
      '</span></label>' +
      (erkannt ? '<button type="button" class="mini-btn" data-action="milestone:accept" data-id="' +
        m.id + '">' + esc(__('msAccept')) + '</button>' : '') +
      '</div>';
  }).join('');

  document.getElementById('msList').innerHTML = html;
}

/* Alle erkannten, noch nicht eingetragenen Meilensteine. */
export const erkannteMs = () => erkannteMeilensteine(MILESTONES, {
  levels: state.levels, prs: state.prs, exById: EX_BY_ID, milestones: state.milestones
});

/* Alle Bestleistungen an einer Stelle.

   Erfasst werden sie seit jeher automatisch, angezeigt wurden sie nur im
   jeweiligen Bibliothekseintrag – nach einem halben Jahr ist das die
   Zahlenreihe, die man sehen will, und die einzige, die man 42-mal
   aufklappen musste. Neueste zuerst. */
export function renderBests(){
  const el = document.getElementById('bestsList');
  if(!el) return;
  const liste = Object.keys(state.prs || {})
    .map(id => ({ id, ex: EX_BY_ID[id], pr: state.prs[id] }))
    /* Eine Uebung, die es nicht mehr gibt, hat auch keinen Namen. */
    .filter(e => e.ex && e.pr && typeof e.pr === 'object')
    .sort((a, b) => String(b.pr.d || '').localeCompare(String(a.pr.d || '')) ||
      exName(a.ex).localeCompare(exName(b.ex)));

  el.innerHTML = liste.length ? liste.map(({ ex, pr }) =>
    '<div class="log-item"><span class="log-day">' + esc(exName(ex)) + '</span>' +
    '<span class="best-val">' + esc(pr.v) + '</span>' +
    '<span class="log-date">' + esc(pr.d ? fmtDate(pr.d) : '') + '</span></div>').join('')
    : '<div class="empty-hint">' + esc(__('bestsEmpty')) + '</div>';
}
export async function toggleMilestone(id, on){
  if(on){
    state.milestones[id] = today(); signal(true);
    /* Mit Guard und ueber msName(): der Name kam bisher roh aus den deutschen
       Daten, und ein Eintrag, der aus MILESTONES verschwindet, aber noch in
       state.milestones steht, liess find() undefined liefern. */
    const m = MILESTONES.find(x => x.id === id);
    if(m) toast(__('milestoneToast', { name: msName(m) }), true);
  } else delete state.milestones[id];
  await save(); renderStats(); renderMilestones();
}
export function renderRoadmap(){
  const skills = EXERCISES.filter(istSkill);
  document.getElementById('roadmap').innerHTML = skills.map(ex => {
    const lvl = lvlOf(ex);
    const pct = Math.round(lvl / (ex.levels.length - 1) * 100);
    return '<div class="roadmap-item">' +
      '<div class="lib-head roadmap-head"><span class="lib-name">' + esc(exName(ex)) + '</span>' +
      '<span class="lib-meta">' + pct + '%</span></div>' +
      '<div class="muted">' + esc(__('nextStage', { name: exStage(ex, lvl), stage: '' })).replace(/\s*$/, ' ') +
      (lvl < ex.levels.length - 1 ? esc(exStage(ex, lvl + 1)) : esc(__('maxLevelReached'))) + '</div></div>';
  }).join('');
}

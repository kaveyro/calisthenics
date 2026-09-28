/* Einstieg: die Selbsteinschaetzung beim ersten Start. */

import { einstiegsFragen, startStufen } from '../domain/einstieg.js';
import { EQUIP } from '../domain/equipment.js';
import { esc } from '../domain/escape.js';
import { EXERCISES } from '../exercises.js';
import { __, exName, exStage } from '../i18n/index.js';
import { renderAll, save, zielText } from '../app.js';
import { state } from '../core/kern.js';
import { equipName } from './ausruestung.js';
import { renderLibrary } from './bibliothek.js';
import { renderPlanTab } from './planeditor.js';
import { askDialog, dialogFuss, dialogKopf } from '../ui/dialoge.js';
import { toast } from '../ui/hinweise.js';

/* Einstieg: Ausruestung und Selbsteinschaetzung in einem Dialog.

   Die Stufenfragen haengen an der Ausruestung – ohne Stange ist der Klimmzug
   keine sinnvolle Frage, und eine Stufe, die Parallettes braucht, darf nicht
   zur Wahl stehen. Deshalb werden sie bei jeder Aenderung der Haken neu
   aufgebaut. Bereits gegebene Antworten bleiben dabei erhalten, soweit die
   Stufe weiterhin machbar ist; alles andere waere eine Strafe dafuer, dass
   man die Reihenfolge falsch geraten hat. */
function askEinstieg(){
  return askDialog((modal, finish) => {
    const titel = __('welcomeTitle');
    const gewaehlt = new Set(state.equipment || []);
    const antworten = {};

    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(__('onboardEquipBody')) + '</p>' +
      '<div id="ob-equip"></div>' +
      '<p class="dlg-text">' + esc(__('onboardLevelBody')) + '</p>' +
      '<div id="ob-fragen"></div>' +
      dialogFuss(__('welcomeStart'));

    const equipEl = modal.querySelector('#ob-equip');
    const fragenEl = modal.querySelector('#ob-fragen');

    equipEl.innerHTML = EQUIP.filter(e => e !== 'none').map(e =>
      '<label class="set-row clickable"><span>' + esc(equipName(e)) + '</span>' +
      '<input type="checkbox" data-ob-eq="' + e + '"' + (gewaehlt.has(e) ? ' checked' : '') + '></label>').join('');

    const fragenZeichnen = () => {
      const vorhanden = EQUIP.filter(e => e !== 'none' && gewaehlt.has(e));
      const fragen = einstiegsFragen(EXERCISES, vorhanden);
      fragenEl.innerHTML = fragen.map(({ kat, ex, stufen }) =>
        '<div class="set-row"><span><label class="lbl2" for="ob-' + kat + '">' +
          esc(exName(ex)) + '</label></span>' +
        '<select id="ob-' + kat + '" data-ob-kat="' + kat + '">' +
          /* Erste Wahl ist immer "ganz von vorn" – das ist die ehrlichste
             Vorgabe und der bisherige Zustand. */
          stufen.map(i => '<option value="' + i + '">' +
            esc((i + 1) + '. ' + exStage(ex, i) + ' · ' + zielText(ex.levels[i])) +
            '</option>').join('') +
        '</select></div>').join('') ||
        '<div class="empty-hint">' + esc(__('noExercises')) + '</div>';

      /* Fruehere Antworten wieder einsetzen, soweit die Stufe es noch gibt. */
      fragenEl.querySelectorAll('[data-ob-kat]').forEach(sel => {
        const alt = antworten[sel.dataset.obKat];
        if(alt !== undefined && sel.querySelector('option[value="' + alt + '"]')) sel.value = String(alt);
        else antworten[sel.dataset.obKat] = Number(sel.value);
        sel.onchange = () => { antworten[sel.dataset.obKat] = Number(sel.value); };
      });
    };

    equipEl.querySelectorAll('[data-ob-eq]').forEach(box => {
      box.onchange = () => {
        if(box.checked) gewaehlt.add(box.dataset.obEq); else gewaehlt.delete(box.dataset.obEq);
        fragenZeichnen();
      };
    });
    fragenZeichnen();

    modal.querySelector('[data-dlg=ok]').onclick = () => finish({
      equipment: EQUIP.filter(e => e !== 'none' && gewaehlt.has(e)),
      antworten
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

export async function einstiegLaufen(){
  const res = await askEinstieg();
  /* Auch ein Abbruch beendet den Einstieg. Ein Banner, das nach jedem
     Wegklicken wiederkommt, ist keine Einladung mehr – wer ihn spaeter doch
     will, findet ihn in den Einstellungen. */
  if(!res){ einstiegBeenden(true); return; }

  state.equipment = res.equipment;
  const stufen = startStufen({
    exercises: EXERCISES, equipment: state.equipment, antworten: res.antworten
  });
  Object.assign(state.levels, stufen);
  einstiegBeenden(false);
  toast(__('onboardDone', { n: Object.keys(stufen).length }), true);
}

export function einstiegBeenden(stumm){
  state.onboarded = true;
  save();
  renderAll(); renderLibrary(); renderPlanTab();
  if(stumm) toast(__('onboardSkipped'));
}

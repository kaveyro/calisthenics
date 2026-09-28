/* Vorhandene Geraete: Namen, Machbarkeit einer Uebung oder Stufe und der
   Schalter in den Einstellungen. */

import { EQUIP, exMoeglich, fehlendeGeraete, levelMoeglich } from '../domain/equipment.js';
import { __ } from '../i18n/index.js';
import { cancelHold, renderWorkout, restoreSession, save } from '../app.js';
import { session, state } from '../core/kern.js';
import { renderLibrary } from './bibliothek.js';
import { renderPlanTab } from './planeditor.js';

const EQUIP_KEYS = {
  none: 'equipNone', chair: 'equipChair', bar: 'equipBar',
  parallettes: 'equipParallettes', rings: 'equipRings', band: 'equipBand'
};
export const equipName = eq => EQUIP_KEYS[eq] ? __(EQUIP_KEYS[eq]) : eq;
/* Eine Kombination wie 'bar+band' wird als "Klimmzugstange + Widerstandsband"
   gelesen – im Datenformat trennt das Pluszeichen, in der Anzeige verbindet es. */
const equipLabel = eq => String(eq).split('+').map(equipName).join(' + ');
export const equipListe = arr => (arr || []).map(equipLabel).join(', ');

/* Kurzform fuer die vielen Aufrufstellen: geprueft wird immer gegen das, was
   der Nutzer in den Einstellungen angehakt hat. */
export const machbar = ex => exMoeglich(ex, state.equipment);
export const stufeMachbar = (ex, i) => levelMoeglich(ex, i, state.equipment);
export const fehlt = (ex, i) => fehlendeGeraete(ex, i, state.equipment);

export function toggleEquipment(eq){
  if(!EQUIP.includes(eq) || eq === 'none') return;
  const da = new Set(state.equipment || []);
  if(da.has(eq)) da.delete(eq); else da.add(eq);
  /* In der Reihenfolge des Vokabulars ablegen, nicht in Klickreihenfolge –
     sonst sieht ein Backup je nach Bedienweg anders aus. */
  state.equipment = EQUIP.filter(e => e !== 'none' && da.has(e));
  save();
  /* Der Filter wirkt in mehreren Ansichten gleichzeitig; die verborgenen
     Tabs behielten sonst ihren alten Stand, bis man sie zufaellig neu baut. */
  renderLibrary(); renderPlanTab();
  if(session.dayKey){ cancelHold(); renderWorkout(); restoreSession(session.reps); }
}

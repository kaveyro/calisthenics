/* Event-Delegation statt Inline-Handler.

   Warum: 64 Inline-`on*=`-Attribute machten eine Content-Security-Policy
   ohne 'unsafe-inline' unmoeglich – und damit die wirksamste Massnahme
   gegen eingeschleusten Code. Ausserdem wurden Werte in JS-Strings
   innerhalb von Attributen interpoliert (onclick="fn('…')"), wo esc()
   grundsaetzlich nicht schuetzt: der HTML-Parser wandelt die Entities
   zurueck, bevor JS den Ausdruck sieht.

   Werte liegen jetzt in data-Attributen. Ein data-Wert kann das Attribut
   hoechstens beenden, aber niemals Code einschleusen.

   Verwendung im Markup:
     <button data-action="tab:show" data-tab="train">
     <select data-action-change="setting:update" data-key="rest" data-type="int">
     <input  data-action-input="library:search">
*/

const TYPEN = {
  click: 'action',
  change: 'actionChange',
  input: 'actionInput'
};

/* dataset-Schluessel -> Attributname: actionChange -> data-action-change */
const attributName = key => 'data-' + key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

export function installDelegation(registry, root = document){
  for(const [eventName, datasetKey] of Object.entries(TYPEN)){
    const selektor = '[' + attributName(datasetKey) + ']';
    root.addEventListener(eventName, ev => {
      const el = ev.target.closest(selektor);
      if(!el) return;
      const name = el.dataset[datasetKey];
      const fn = registry[name];
      if(!fn){
        /* Laut und sofort sichtbar: der typische Fehler beim Umbau ist ein
           Tippfehler im Aktionsnamen, und "Button tut nichts" waere sonst
           schwer zuzuordnen. */
        console.error('[action] unbekannt:', name, el);
        return;
      }
      fn(el.dataset, ev, el);
    });
  }
}

/* Hilfen fuer den Uebergang von Attributwerten (immer Strings) zu Argumenten */
export const zahl = v => parseInt(v, 10);
export const anKreuz = (dataset, ev, el) => el.checked;

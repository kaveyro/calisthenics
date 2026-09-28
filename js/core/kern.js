/* Gemeinsamer Laufzeitzustand: der gespeicherte Stand, die laufende Einheit,
   die Einstellungen und die Lebensdauer der Listener. state und session sind
   live gebundene Exporte; neu gesetzt werden sie nur ueber setState() und
   setSession(), weil ein importierter Name nicht zuweisbar ist. */

import { DEFAULT_STATE, SETTINGS_DEFAULTS } from '../domain/state.js';

export let state = DEFAULT_STATE();
/* Alles, was zur laufenden Einheit gehoert – an einer Stelle, damit keine
   Sammlung beim Zuruecksetzen vergessen wird. */
export const leereSession = () => ({
  dayKey: null, sets: {}, top: {}, reps: {}, sek: {}, notes: {},
  /* Nur fuer heute: origId -> ersatzId bzw. origId -> true. Beides steht
     bewusst in der Session und nicht im Plan – wer eine Uebung heute nicht
     machen kann, will deswegen nicht seinen Plan umbauen. */
  subs: {}, skip: {},
  /* Abgehakte Aufwaermpunkte, nach Position in der Liste. */
  warm: {},
  /* Wie sich jede Uebung angefuehlt hat: id -> 'l' | 'p' | 'h'. */
  an: {},
  /* Zeitstempel des ERSTEN Hakens, nicht der Tagesauswahl: zwischen "Tag
     angetippt" und "erster Satz" liegen Umziehen und Aufwaermen, und beides
     ist keine Trainingszeit. null, solange nichts geschafft ist. */
  start: null
});
export let session = leereSession();

/* Lebensdauer dieser Instanz. Jeder Listener an document und window haengt
   an diesem Signal, damit stop() alle auf einmal abhaengen kann. Im Browser
   gibt es genau eine Instanz, und stop() wird nie gerufen. Die Tests starten
   die App aber je Test neu, und ohne Abraeumen hoerten die Instanzen
   frueherer Tests weiter mit: ein Klick erreichte alle, ein entprelltes
   Speichern schrieb 500 ms spaeter den alten Stand in den naechsten Test.
   Das war der Fehler, der nur in CI auftrat. */
export const lauf = new AbortController();
export const an = (ziel, typ, fn, opts = {}) => ziel.addEventListener(typ, fn, { ...opts, signal: lauf.signal });

export function cfg(k){
  return (state.settings && state.settings[k] !== undefined) ? state.settings[k] : SETTINGS_DEFAULTS[k];
}

/* Neu setzen, nicht nur veraendern: beim Laden, beim Import, beim
   Zuruecksetzen und wenn ein anderes Fenster gespeichert hat. */
export function setState(neu){ state = neu; }
export function setSession(neu){ session = neu; }

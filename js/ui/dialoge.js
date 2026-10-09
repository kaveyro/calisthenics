/* Eigene Dialoge mit Fokus-Trap: Text, Bestaetigung, Auswahl. */

import { esc } from '../domain/escape.js';
import { __ } from '../i18n/index.js';
import { ikon } from './hinweise.js';

/* ================= Dialog-Fokus =================
   Beide Overlays haben bisher nur eine CSS-Klasse umgeschaltet: der Fokus
   wanderte nie hinein, wurde nicht gefangen und beim Schliessen nicht
   zurueckgegeben. Ein Screenreader lief am Dialog vorbei in die Seite
   dahinter, und mit der Tabulatortaste landete man hinter dem Dialog. */

export const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/* Ein Stapel, kein einzelner Dialog: eine Rueckfrage kann ueber dem
   Einstellungsdialog liegen ("Backup importieren?"). Mit nur einer Variablen
   haette das Schliessen der oberen Ebene inert vom Hintergrund genommen und
   den Fokus an der falschen Stelle abgelegt, waehrend die untere noch offen
   ist. */
const dialogStack = [];
export const openDialogEl = { get current(){ return dialogStack.length ? dialogStack[dialogStack.length - 1].el : null; } };

function trapTab(e){
  const top = dialogStack[dialogStack.length - 1];
  if(e.key !== 'Tab' || !top) return;
  const items = [...top.el.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
  if(!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}

/* Alles, was bei offenem Dialog unerreichbar sein muss. Es genuegt nicht,
   .wrap zu nehmen: die Abschlussleiste, der Pausen-Chip und der Toast liegen
   ausserhalb davon. Ein Klick kam durch den z-index zwar nicht durch, aber im
   Browse-Modus eines Screenreaders blieb "Training abschliessen" erreichbar,
   waehrend eine Rueckfrage offen stand. */
const HINTERGRUND = ['.wrap', '#finishBar', '#restChip', '#toast'];
const hintergrundInert = an => HINTERGRUND.forEach(sel => {
  const el = document.querySelector(sel);
  if(!el) return;
  if(an) el.setAttribute('inert', ''); else el.removeAttribute('inert');
});

export function openDialog(overlay){
  /* Dasselbe Overlay zweimal oeffnen: uebungsBlatt() benutzt einen
     wiederverwendeten Knoten. Ohne diese Zeile setzt er inert auf sich selbst
     und closeDialog() loest nur den ersten Stapeleintrag – .wrap bliebe
     dauerhaft unerreichbar. */
  if(dialogStack.some(d => d.el === overlay)) return;

  const unten = dialogStack[dialogStack.length - 1];
  /* Die darunterliegende Ebene wird selbst unerreichbar. */
  if(unten) unten.el.setAttribute('inert', '');
  else hintergrundInert(true);

  dialogStack.push({ el: overlay, rueckfokus: document.activeElement });
  overlay.classList.add('open');
  const first = overlay.querySelector(FOCUSABLE);
  if(first) first.focus();
  if(dialogStack.length === 1) document.addEventListener('keydown', trapTab, true);
}

export function closeDialog(overlay){
  const i = dialogStack.findIndex(d => d.el === overlay);
  if(i < 0){ overlay.classList.remove('open'); return; }
  const [eintrag] = dialogStack.splice(i, 1);
  overlay.classList.remove('open');

  const unten = dialogStack[dialogStack.length - 1];
  if(unten) unten.el.removeAttribute('inert');
  else {
    hintergrundInert(false);
    document.removeEventListener('keydown', trapTab, true);
  }
  /* Fokus dorthin zurueck, wo er herkam. */
  if(eintrag.rueckfokus && document.contains(eintrag.rueckfokus)) eintrag.rueckfokus.focus();
}

/* ================= Eigene Dialoge =================
   Ersetzt prompt() und confirm(). Diese blockieren den Browser, sind in
   plattformübergreifenden PWAs unterschiedlich zuverlaessig, lassen sich
   nicht gestalten und waren hier der Grund fuer eine Auswahl per
   eingetippter Nummer. Alle drei Funktionen liefern ein Promise und nutzen
   dasselbe Fokus-Management wie die uebrigen Dialoge. */

export function askDialog(build){
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';

    let done = false;
    const finish = wert => {
      if(done) return;
      done = true;
      closeDialog(overlay);
      overlay.remove();
      resolve(wert);
    };

    overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
    const modal = overlay.firstChild;
    build(modal, finish);

    overlay.addEventListener('click', e => { if(e.target === overlay) finish(null); });
    overlay.addEventListener('keydown', e => { if(e.key === 'Escape'){ e.stopPropagation(); finish(null); } });
    document.body.appendChild(overlay);
    openDialog(overlay);
  });
}

export function dialogKopf(titel){
  return '<div class="modal-head"><span>' + esc(titel) + '</span>' +
    '<button data-dlg="abbrechen" aria-label="' + esc(__('close')) + '">' + ikon('close') + '</button></div>';
}
export function dialogFuss(okText, gefahr){
  return '<div class="dlg-actions">' +
    '<button data-dlg="abbrechen">' + esc(__('cancel')) + '</button>' +
    '<button data-dlg="ok" class="primary' + (gefahr ? ' danger' : '') + '">' + esc(okText) + '</button></div>';
}

/* Freitexteingabe – Ersatz fuer prompt() */
export function askText(titel, label, vorgabe = '', maxLen = 80){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<label class="dlg-label" for="dlg-input">' + esc(label) + '</label>' +
      '<input id="dlg-input" class="dlg-input" maxlength="' + maxLen + '" value="' + esc(vorgabe) + '">' +
      dialogFuss(__('apply'));
    const input = modal.querySelector('#dlg-input');
    const ok = () => finish(input.value);
    modal.querySelector('[data-dlg=ok]').onclick = ok;
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
    input.onkeydown = e => { if(e.key === 'Enter') ok(); };
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}

/* Rueckfrage – Ersatz fuer confirm() */
export function askConfirm(titel, text, okText = 'OK', gefahr = false){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(text).replace(/\n/g, '<br>') + '</p>' +
      dialogFuss(okText, gefahr);
    modal.querySelector('[data-dlg=ok]').onclick = () => finish(true);
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(false); });
  });
}

/* Auswahlliste – ersetzt die frühere Eingabe einer Nummer per prompt() */
export function askChoice(titel, optionen){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<div class="dlg-list" role="group">' +
      optionen.map((o, i) =>
        '<button class="dlg-choice" data-i="' + i + '"><span class="dlg-choice-name">' + esc(o.name) + '</span>' +
        (o.sub ? '<span class="dlg-choice-sub">' + esc(o.sub) + '</span>' : '') + '</button>').join('') +
      '</div><div class="dlg-actions"><button data-dlg="abbrechen">' + esc(__('cancel')) + '</button></div>';
    modal.querySelectorAll('.dlg-choice').forEach(b => {
      b.onclick = () => finish(optionen[parseInt(b.dataset.i, 10)].value);
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

/* Nur-Lese-Text zum Markieren und Kopieren */
export function showTextDialog(titel, text){
  return askDialog((modal, finish) => {
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<textarea class="dlg-area" readonly rows="12"></textarea>' +
      '<div class="dlg-actions"><button data-dlg="abbrechen" class="primary">' + esc(__('close')) + '</button></div>';
    modal.querySelector('.dlg-area').value = text;
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
    setTimeout(() => { const a = modal.querySelector('.dlg-area'); a.focus(); a.select(); }, 0);
  });
}

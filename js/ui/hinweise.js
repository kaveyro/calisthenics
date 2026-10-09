/* Rueckmeldungen an den Nutzer: Toast, Screenreader-Ansage, Symbole und
   das Halten des Fokus ueber ein Neuzeichnen hinweg. */

/* Ein Symbol aus dem Sprite in index.html. Immer aria-hidden: die
   Bedeutung traegt die Beschriftung daneben oder das aria-label des
   Knopfs. */
export const ikon = name => '<svg class="i" aria-hidden="true" focusable="false"><use href="#i-' + name + '"/></svg>';

/* Ansage nur fuer Screenreader. Fuer Ereignisse, die sichtbar ohnehin
   erkennbar sind und deshalb keinen Toast rechtfertigen. */
export function melde(text){
  const el = document.getElementById('srStatus');
  if(!el) return;
  /* Zweimal derselbe Text wuerde sonst nicht erneut vorgelesen. */
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 30);
}

/* Haelt den Fokus ueber ein Neuzeichnen hinweg.

   Die Render-Funktionen ersetzen ganze Container per innerHTML. Das gerade
   betaetigte Element ist danach weg und der Fokus faellt auf <body> – bei
   Tastatur- und Screenreader-Bedienung reisst die Navigation jedes Mal ab.
   Fuer Dialoge gibt es laengst einen Fokus-Trap mit Rueckgabe; fuer Renders
   gab es nichts.

   Bewusst an den Aktionen aufgerufen und nicht in den Render-Funktionen: so
   steht an der Stelle, welche Interaktion den Fokus halten soll. */

/* Wiedererkennungsmerkmal eines Bedienelements ueber ein Neuzeichnen hinweg.
   Eine id haben laengst nicht alle – Bibliothekskoepfe, Meilenstein-Haken und
   die Plan-Schaltflaechen tragen nur ihre data-Attribute. Die sind aber
   stabil und eindeutig, also dienen sie als Kennung. */
const FOKUS_DATEN = ['ex', 'day', 'i', 'set', 'key', 'cat', 'id', 'delta'];
function fokusKennung(el){
  if(!el || el === document.body) return null;
  /* CSS.escape fehlt in aelteren Umgebungen (und in jsdom); eine id aus
     Buchstaben, Ziffern und Bindestrichen braucht es nicht. */
  if(el.id) return '#' + (globalThis.CSS && CSS.escape ? CSS.escape(el.id) : el.id.replace(/[^\w-]/g, '\\$&'));
  const art = el.dataset.action ? '' : el.dataset.actionChange ? '-change' : el.dataset.actionInput ? '-input' : null;
  if(art === null) return null;
  const name = el.dataset.action || el.dataset.actionChange || el.dataset.actionInput;
  let sel = '[data-action' + art + '="' + name + '"]';
  for(const k of FOKUS_DATEN){
    const v = el.dataset[k];
    if(v === undefined || v.includes('"')) continue;
    sel += '[data-' + k + '="' + v + '"]';
  }
  return sel;
}

/* async, weil mehrere Aktionen erst nach einem await neu zeichnen
   (toggleMilestone speichert, renameDay oeffnet einen Dialog). Wuerde hier
   nicht gewartet, liefe die Wiederherstellung vor dem Neuzeichnen. */
export async function mitFokus(fn){
  const alt = document.activeElement;
  const kennung = fokusKennung(alt);
  const pos = alt && typeof alt.selectionStart === 'number' ? alt.selectionStart : null;
  await fn();
  if(!kennung) return;
  let neu;
  try{ neu = document.querySelector(kennung); }catch{ return; }
  if(!neu || neu === document.activeElement) return;
  neu.focus({ preventScroll: true });
  if(pos !== null && typeof neu.setSelectionRange === 'function'){
    try{ neu.setSelectionRange(pos, pos); }catch{ /* Feldtyp erlaubt keine Auswahl */ }
  }
}

/* Vom Nutzer abgelehnte Bewegung gilt auch fuer JavaScript-Animationen –
   die CSS-Regel in style.css erreicht window.scrollTo nicht. */
export const wenigerBewegung = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export let toastTimer = null;
/* So lange steht ein Hinweis mit Rueckgaengig – und so lange muss das
   Rueckgaengig auch wirken. Die Einstellungen liessen es nach 5 s verfallen,
   waehrend der Knopf noch 7 s weiter dastand. */
export const AKTION_MS = 12000;
/* aktion: optional { text, action } – haengt eine Schaltflaeche an, die ueber
   die Aktionstabelle laeuft wie jedes andere Element auch. Bewusst
   createElement statt innerHTML: so stellt sich die Frage nach dem Escapen
   gar nicht erst. */
export function toast(msg, big, aktion){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('levelup', !!big);
  if(aktion){
    const b = document.createElement('button');
    b.className = 'toast-btn';
    b.textContent = aktion.text;
    b.dataset.action = aktion.action;
    t.appendChild(b);
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), aktion ? AKTION_MS : big ? 5000 : 3200);
}

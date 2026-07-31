// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* Die ersten Tests fuer js/app.js.

   Bis hierher deckten alle Tests js/domain/ ab – rund 500 Zeilen – waehrend
   die gut 2200 Zeilen in app.js ungeprueft blieben: jede Zustandsaenderung,
   jede Render-Funktion, die ganze Aktionstabelle. Moeglich war das nicht,
   weil sich das Modul beim Import selbst startete. Seit start() exportiert
   wird, laesst es sich laden.

   Bewusst durch die Oberflaeche getestet: das Markup aus index.html kommt in
   das jsdom-Dokument, geklickt werden echte Elemente. Damit haengt an jedem
   Test auch die Verdrahtung – eine umbenannte id oder ein verlorenes
   data-action faellt hier auf, nicht erst im Browser. */

/* process.cwd() statt import.meta.url: unter der jsdom-Umgebung liefert
   vitest dort einen /@fs-Pfad, der sich nicht als Dateipfad verwenden laesst.
   Vitest laeuft im Projektwurzelverzeichnis. */
const ROOT = join(process.cwd(), '.');
const SPEICHER = 'progression:v3';

/* Nur der Rumpf, ohne das Modul-Script: start() ruft der Test selbst auf. */
const KOERPER = readFileSync(join(ROOT, 'index.html'), 'utf8')
  .split('<body>')[1].split('</body>')[0]
  .replace(/<script[\s\S]*?<\/script>/g, '');

/* Warten, bis die angestossenen Promises (save(), render nach await)
   durchgelaufen sind. */
const ruhe = () => new Promise(r => setTimeout(r, 0));

async function starten(){
  const app = await import('../js/app.js');
  await app.start();
  await ruhe();
  return app;
}

const gespeichert = () => JSON.parse(localStorage.getItem(SPEICHER) || 'null');

/* Saetze der Uebungen mit Wiederholungsfeld – Halteuebungen starten beim
   Tippen einen Countdown statt sofort abzuhaken. */
function wiederholungsPunkte(){
  const mitFeld = new Set([...document.querySelectorAll('.rep-input')]
    .map(el => el.id.replace(/^rep-/, '')));
  return [...document.querySelectorAll('.set-dot')]
    .filter(d => mitFeld.has(d.id.replace(/^set-/, '')));
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = KOERPER;
  /* jsdom kennt beide nicht. Der Code prueft zwar auf matchMedia, aber ein
     echtes Objekt deckt auch den Zweig ab, der den Listener anhaengt. */
  window.scrollTo = () => {};
  window.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });
});

afterEach(() => { vi.useRealTimers(); });

describe('Start', () => {
  it('rendert Trainingstage und legt einen Stand an', async () => {
    await starten();
    expect(document.getElementById('daySelect').querySelectorAll('.day-btn').length)
      .toBeGreaterThan(0);
    expect(document.getElementById('content').textContent).not.toBe('');
  });

  it('hebt den ersten Ladehinweis auf, statt ihn stehen zu lassen', async () => {
    await starten();
    expect(document.getElementById('content').innerHTML).not.toMatch(/bootFailed/);
  });

  /* Der Importpfad eines alten Standes lief frueher ueber einen flachen
     Merge; migrateState() ist seitdem der einzige Weg herein. */
  it('hebt einen alten Stand auf die aktuelle Version', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 1, workouts: 7, notes: null }));
    await starten();
    const s = gespeichert();
    expect(s.v).toBe(6);
    expect(s.workouts).toBe(7);
    expect(s.notes).toEqual({});
  });
});

describe('Eine Einheit abschliessen', () => {
  async function einheitLaufen(){
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    const punkte = wiederholungsPunkte();
    expect(punkte.length).toBeGreaterThan(0);
    punkte.slice(0, 3).forEach(d => d.click());
    await ruhe();
    return app;
  }

  it('schreibt genau einen Log-Eintrag – mit den trainierten Uebungen', async () => {
    const app = await einheitLaufen();
    await app.actions['workout:finish']();
    await ruhe();

    const s = gespeichert();
    expect(s.log).toHaveLength(1);
    expect(s.log[0].ex.length).toBeGreaterThan(0);
    expect(s.workouts).toBe(1);
  });

  /* Der teuerste Fehler des letzten Durchgangs: clearSession() lief NACH
     save(), also blieb die fertige Einheit im Speicher stehen. Ein Neuladen
     holte sie mit allen Haken zurueck, und ein zweites "Fertig" schrieb sie
     ein zweites Mal ins Log. */
  it('laesst nach dem Neuladen keine fertige Einheit wiederauferstehen', async () => {
    const app = await einheitLaufen();
    await app.actions['workout:finish']();
    await ruhe();
    expect(gespeichert().activeSession).toBeNull();

    /* Zweiter Start auf demselben Speicher – wie ein Neuladen der Seite. */
    vi.resetModules();
    document.body.innerHTML = KOERPER;
    await starten();

    expect(gespeichert().log).toHaveLength(1);
    /* Gar keine Saetze: es wurde ueberhaupt kein Training gerendert, es steht
       wieder die Tagesauswahl da. */
    expect(document.querySelectorAll('.set-dot')).toHaveLength(0);
    expect(document.getElementById('finishBar').style.display).not.toBe('block');
  });

  /* "Rueckgaengig" warf die Einheit weg, obwohl der Snapshot sie seit jeher
     enthielt – wer versehentlich tippte, trug alles von Hand neu ein. */
  it('holt die Einheit beim Rueckgaengigmachen zurueck', async () => {
    const app = await einheitLaufen();
    const vorher = document.querySelectorAll('.set-dot.done').length;
    await app.actions['workout:finish']();
    await ruhe();

    await app.actions['workout:undo']();
    await ruhe();

    const s = gespeichert();
    expect(s.log).toHaveLength(0);
    expect(s.workouts).toBe(0);
    expect(document.querySelectorAll('.set-dot.done')).toHaveLength(vorher);
  });
});

describe('Wiederholungen', () => {
  it('haelt eine 0 ueber ein Neuzeichnen hinweg', async () => {
    /* 0 ist eine gueltige Eingabe. Zwei Falsy-Pruefungen liessen sie beim
       Neuzeichnen verschwinden. */
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();

    const feld = document.querySelector('.rep-input');
    const exId = feld.id.replace(/^rep-/, '').replace(/-\d+$/, '');
    feld.value = '0';
    feld.dispatchEvent(new window.Event('input', { bubbles: true }));
    await ruhe();

    await app.actions['level:adjust']({ ex: exId, delta: '1' });
    await ruhe();

    expect(document.getElementById(feld.id).value).toBe('0');
  });

  it('zeigt beim naechsten Mal, was zuletzt geschafft wurde', async () => {
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();

    const feld = document.querySelector('.rep-input');
    feld.value = '11';
    feld.dispatchEvent(new window.Event('input', { bubbles: true }));
    wiederholungsPunkte()[0].click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    document.querySelector('.day-btn').click();
    await ruhe();
    expect(document.querySelector('.last-reps').textContent).toContain('11');
  });
});

describe('Sicherungshinweis', () => {
  it('meldet sich, wenn lange nicht gesichert wurde', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 6, workouts: 15, log: [] }));
    await starten();
    expect(document.getElementById('banners').textContent).toMatch(/Sicherung|backup/i);
  });

  it('schweigt nach einem "Spaeter"', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 6, workouts: 15, log: [] }));
    const app = await starten();
    app.actions['backup:remindLater']();
    await ruhe();
    expect(document.getElementById('banners').textContent).not.toMatch(/Sicherung/i);
    expect(gespeichert().backupDismissed).toBe(15);
  });
});

describe('Einen Log-Eintrag loeschen', () => {
  it('entfernt ihn samt Zaehler, nach Rueckfrage', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 6, workouts: 2, lastDate: '2026-07-30',
      byDay: { A: 2 },
      log: [
        { d: '2026-07-29', day: 'A', sets: 10, tops: 2, ups: [], ex: ['pushup'], reps: {} },
        { d: '2026-07-30', day: 'A', sets: 12, tops: 3, ups: [], ex: ['pushup'], reps: {} }
      ]
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();

    const knopf = document.querySelector('[data-action="log:remove"]');
    expect(knopf).not.toBeNull();
    knopf.click();
    await ruhe();

    /* Die Rueckfrage bestaetigen. */
    document.querySelector('.overlay [data-dlg=ok]').click();
    await ruhe();

    const s = gespeichert();
    expect(s.log).toHaveLength(1);
    expect(s.workouts).toBe(1);
    expect(s.byDay.A).toBe(1);
    expect(s.lastDate).toBe('2026-07-29');
  });
});

describe('Design', () => {
  it('kehrt im Dreierzyklus zum System zurueck', async () => {
    const app = await starten();
    const gespeichertesTheme = () => (gespeichert() || {}).theme ?? null;

    /* Ein frischer Start schreibt noch nichts – gefolgt wird dem System. */
    expect(gespeichertesTheme()).toBeNull();
    app.actions['theme:toggle'](); await ruhe();
    expect(gespeichertesTheme()).toBe('light');
    app.actions['theme:toggle'](); await ruhe();
    expect(gespeichertesTheme()).toBe('dark');
    app.actions['theme:toggle'](); await ruhe();
    expect(gespeichertesTheme()).toBeNull();
  });
});

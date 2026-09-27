// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isoDaysAgo } from '../js/domain/dates.js';

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

/* Jede Instanz raeumt die vorige ab, bevor sie startet – wie ein Neuladen
   der Seite. Ohne das hoerten die Instanzen frueherer Tests an document
   weiter mit und schrieben in denselben Speicherschluessel. */
let laufendeApp = null;
async function starten(){
  if(laufendeApp) laufendeApp.stop();
  const app = await import('../js/app.js');
  laufendeApp = app;
  await app.start();
  await ruhe();
  return app;
}

const gespeichert = () => JSON.parse(localStorage.getItem(SPEICHER) || 'null');

/* Das Datum, das die App fuer heute haelt: lokal, nicht UTC. Mit
   toISOString() allein rutschte es zwischen Mitternacht und dem UTC-Offset
   auf den Vortag, und die Tests schlugen jede Nacht bis zwei Uhr fehl. */
const heuteLokal = () => isoDaysAgo(0);

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
    expect(s.v).toBe(17);
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
    expect(document.querySelector('.last-reps:not(.heute)').textContent).toContain('11');
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
    expect(s.lastDate).toBe('2026-07-29');
    /* Der Zaehler je Trainingstag steht seit v11 nicht mehr im Stand – er
       wird aus dem Log gezaehlt und geht damit automatisch mit. */
    expect(s.byDay).toBeUndefined();
  });
});

/* Zwei offene Fenster ueberschrieben sich bisher vollstaendig und still: der
   ganze Zustand haengt an einem Schluessel, es gibt keine Teilschreibvorgaenge.
   Ein Fenster von gestern Abend machte beim naechsten Tipp den heutigen
   Verlauf zunichte. */
describe('Abgleich zwischen zwei Fenstern', () => {
  /* Was ein zweites Fenster geschrieben haette. */
  function fremderStand(over = {}){
    return JSON.stringify({
      v: 7, rev: 500, workouts: 3, lastDate: '2026-07-30',
      log: [{ d: '2026-07-30', day: 'A', sets: 12, tops: 1, ups: [], ex: ['pushup'], reps: {} }],
      ...over
    });
  }
  const melden = wert => window.dispatchEvent(
    new window.StorageEvent('storage', { key: SPEICHER, newValue: wert }));

  it('uebernimmt einen neueren Stand aus dem anderen Fenster', async () => {
    const app = await starten();
    expect(document.getElementById('stats').textContent).not.toContain('3');

    melden(fremderStand());
    await ruhe();

    /* Die Kopfzahlen zeigen den fremden Stand … */
    expect(document.getElementById('stats').textContent).toContain('3');
    /* … und der Verlauf kennt die Einheit, die hier nie stattfand. */
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    expect(document.getElementById('logList').textContent).not.toBe('');
    expect(document.querySelectorAll('[data-action="log:remove"]')).toHaveLength(1);
  });

  it('behaelt die hier laufende Einheit und schreibt sie zurueck', async () => {
    await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    wiederholungsPunkte()[0].click();
    await ruhe();
    const haken = document.querySelectorAll('.set-dot.done').length;
    expect(haken).toBeGreaterThan(0);

    melden(fremderStand());
    await ruhe();

    /* Der fremde Verlauf ist da, die eigenen Haken stehen noch, und beides
       liegt zusammen im Speicher – in keiner Richtung ein Verlust. */
    const s = gespeichert();
    expect(s.log).toHaveLength(1);
    expect(s.workouts).toBe(3);
    expect(s.activeSession).not.toBeNull();
    expect(document.querySelectorAll('.set-dot.done')).toHaveLength(haken);
  });

  /* Es gibt nur einen Platz fuer die laufende Einheit. Wird dort schon in
     einem anderen Fenster trainiert, bleibt sie stehen – sonst schrieben
     sich beide gegenseitig endlos ueber. */
  it('ueberschreibt die laufende Einheit eines anderen Fensters nicht', async () => {
    await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    wiederholungsPunkte()[0].click();
    await ruhe();

    const vorher = gespeichert();
    const fremdeEinheit = {
      dayKey: 'A', d: heuteLokal(), tab: 'anderes',
      sets: {}, top: {}, reps: {}, notes: {}
    };
    melden(fremderStand({ activeSession: fremdeEinheit }));
    await ruhe();

    /* Kein Schreibvorgang – im Speicher steht unveraendert, was vorher
       dastand. Genau dadurch bleibt die fremde Einheit unangetastet, und der
       Austausch kommt nach einer Runde zum Stehen. */
    expect(gespeichert()).toEqual(vorher);
    /* Uebernommen wurde der fremde Stand trotzdem: die Kopfzahlen zeigen ihn. */
    expect(document.getElementById('stats').textContent).toContain('3');
    /* Und die eigene Einheit bleibt im Fenster bedienbar. */
    expect(document.querySelectorAll('.set-dot.done').length).toBeGreaterThan(0);
  });

  it('laesst einen aelteren oder gleich alten Stand liegen', async () => {
    const app = await starten();
    app.actions['theme:toggle']();          /* schreibt, rev steigt auf 1 */
    await ruhe();
    const vorher = gespeichert();

    melden(fremderStand({ rev: 0, workouts: 99 }));
    melden(fremderStand({ rev: vorher.rev, workouts: 99 }));
    await ruhe();

    expect(gespeichert()).toEqual(vorher);
  });

  it('ignoriert fremden Schrott, statt den Stand wegzuwerfen', async () => {
    await starten();
    const vorher = document.getElementById('stats').textContent;
    melden('{kein json');
    melden(null);
    await ruhe();
    expect(document.getElementById('stats').textContent).toBe(vorher);
  });
});

/* Der Import ersetzte immer alles – wer auf dem Handy trainierte und danach
   das Backup vom Rechner einspielte, verlor jede Einheit dazwischen. */
describe('Backup importieren', () => {
  /* Feste Daten waren hier eine Zeitbombe: applyRegression() senkt nach
     REGRESSION_DAYS Pause jede Stufe um eins, und irgendwann liegt jedes
     hart notierte Datum weit genug zurueck. Der Test prueft das
     Zusammenfuehren, nicht den Deload – also liegen die Einheiten relativ
     zu heute und damit innerhalb der Pausenfrist. */
  const zwei = n => String(n).padStart(2, '0');
  const tagVor = n => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + zwei(d.getMonth() + 1) + '-' + zwei(d.getDate());
  };
  const HEUTE = tagVor(0), FRUEHER = tagVor(10);
  const HIER = { d: HEUTE, day: 'A', sets: 12, tops: 1, ups: [], ex: ['pushup'], reps: {} };
  const DORT = { d: FRUEHER, day: 'A', sets: 8, tops: 0, ups: [], ex: ['pushup'], reps: {} };

  async function importieren(wahl){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 7, workouts: 1, lastDate: HEUTE, log: [HIER], levels: { pushup: 5 }
    }));
    const app = await starten();

    const inhalt = JSON.stringify({ v: 7, workouts: 1, log: [DORT], levels: { pushup: 2 } });
    const eingabe = { files: [new window.File([inhalt], 'backup.json')], value: '' };
    app.actions['backup:importJSON'](null, null, eingabe);
    /* FileReader arbeitet asynchron. */
    await new Promise(r => setTimeout(r, 20));

    const knopf = [...document.querySelectorAll('.dlg-choice')]
      .find(b => b.textContent.includes(wahl));
    expect(knopf).toBeTruthy();
    knopf.click();
    await ruhe();
    return gespeichert();
  }

  it('fuehrt auf Wunsch zusammen, statt zu ersetzen', async () => {
    const s = await importieren('Zusammenführen');
    expect(s.log.map(l => l.d)).toEqual([FRUEHER, HEUTE]);
    /* Die weitere Stufe gewinnt – sonst kostet ein altes Backup Fortschritt. */
    expect(s.levels.pushup).toBe(5);
  });

  it('ersetzt weiterhin, wenn man es verlangt', async () => {
    const s = await importieren('Ersetzen');
    expect(s.log.map(l => l.d)).toEqual([FRUEHER]);
    expect(s.levels.pushup).toBe(2);
  });
});

/* renderLibrary() baute bei jedem Tastendruck alle 36 Uebungen neu auf – wer
   eine Bestleistung halb eingetippt hatte und dann suchte, fand ein leeres
   Feld vor. */
describe('Suche in der Bibliothek', () => {
  async function bibliothek(){
    const app = await starten();
    app.actions['tab:show']({ tab: 'library' });
    await ruhe();
    return app;
  }
  const suchen = async (app, text) => {
    document.getElementById('libSearch').value = text;
    app.actions['library:search']();
    await ruhe();
  };
  const sichtbare = () =>
    [...document.querySelectorAll('#libList .lib-item')].filter(el => !el.hidden);

  it('blendet aus, was nicht passt – und wieder ein', async () => {
    const app = await bibliothek();
    const alle = sichtbare().length;
    expect(alle).toBeGreaterThan(1);

    await suchen(app, 'liegestütze');
    const gefiltert = sichtbare().length;
    expect(gefiltert).toBeGreaterThan(0);
    expect(gefiltert).toBeLessThan(alle);

    await suchen(app, '');
    expect(sichtbare()).toHaveLength(alle);
  });

  it('findet auch ueber den Namen einer Stufe', async () => {
    const app = await bibliothek();
    await suchen(app, 'negativ');
    expect(sichtbare().length).toBeGreaterThan(0);
  });

  it('zeigt den Hinweis, wenn nichts passt', async () => {
    const app = await bibliothek();
    await suchen(app, 'gibtesnicht');
    expect(sichtbare()).toHaveLength(0);
    expect(document.getElementById('libEmpty').hidden).toBe(false);
  });

  it('laesst eine halb getippte Bestleistung stehen', async () => {
    const app = await bibliothek();
    const feld = document.querySelector('#libList input[id^="pr-"]');
    feld.value = '2';

    await suchen(app, 'a');

    /* Dasselbe Element, derselbe Wert – die Liste wurde nicht neu gebaut. */
    expect(document.getElementById(feld.id)).toBe(feld);
    expect(feld.value).toBe('2');
  });
});

/* Das equip-Feld gab es seit jeher, ausgewertet wurde es nie. Diese Tests
   pruefen, dass die Auswahl in jeder Ansicht ankommt – nicht nur dort, wo
   man zufaellig hinsieht. */
describe('Ausruestung', () => {
  async function mitAusruestung(liste){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 8, equipment: liste }));
    const app = await starten();
    return app;
  }
  const bibliothekOeffnen = async app => {
    app.actions['tab:show']({ tab: 'library' });
    await ruhe();
  };
  const eintrag = id => document.querySelector('#libList .lib-item[data-such*="' + id + '"]');

  it('haelt die Haken in den Einstellungen mit dem Stand zusammen', async () => {
    const app = await mitAusruestung(['bar', 'band']);
    app.actions['settings:open']();
    await ruhe();
    expect(document.getElementById('eq-bar').checked).toBe(true);
    expect(document.getElementById('eq-band').checked).toBe(true);
    expect(document.getElementById('eq-rings').checked).toBe(false);
  });

  it('nimmt ein Geraet dazu und wieder weg', async () => {
    const app = await mitAusruestung([]);
    app.actions['equipment:toggle']({ eq: 'rings' });
    await ruhe();
    expect(gespeichert().equipment).toEqual(['rings']);

    app.actions['equipment:toggle']({ eq: 'rings' });
    await ruhe();
    expect(gespeichert().equipment).toEqual([]);
  });

  it('legt die Auswahl in der Reihenfolge des Vokabulars ab', async () => {
    const app = await mitAusruestung([]);
    ['rings', 'chair', 'bar'].forEach(eq => app.actions['equipment:toggle']({ eq }));
    await ruhe();
    /* Nicht in Klickreihenfolge – sonst sieht ein Backup je nach Bedienweg
       anders aus. */
    expect(gespeichert().equipment).toEqual(['chair', 'bar', 'rings']);
  });

  it('markiert in der Bibliothek, was nicht geht', async () => {
    const app = await mitAusruestung(['chair']);
    await bibliothekOeffnen(app);
    /* Klimmzuege brauchen Stange oder Ringe, Kniebeugen nichts. */
    expect(eintrag('klimmzug-progression').dataset.eqok).toBe('0');
    expect(eintrag('kniebeugen').dataset.eqok).toBe('1');
    expect(eintrag('klimmzug-progression').textContent).toContain('Gerät fehlt');
  });

  /* Der Kern der Sache: Dips sind mit einer Bank machbar und werden erst
     spaeter unmoeglich. Auf Uebungsebene waere das nicht abbildbar. */
  it('nennt je Stufe das fehlende Geraet, nicht je Uebung', async () => {
    const app = await mitAusruestung(['chair']);
    await bibliothekOeffnen(app);
    const dips = eintrag('dips');
    expect(dips.dataset.eqok).toBe('1');
    const stufen = dips.querySelectorAll('.lvl-list li');
    expect(stufen[0].classList.contains('gesperrt')).toBe(false);
    expect(stufen[3].classList.contains('gesperrt')).toBe(true);
    expect(stufen[3].textContent).toContain('Parallettes');
  });

  it('blendet Nichtmachbares nur auf Wunsch aus', async () => {
    const app = await mitAusruestung(['chair']);
    await bibliothekOeffnen(app);
    const sichtbare = () =>
      [...document.querySelectorAll('#libList .lib-item')].filter(el => !el.hidden);
    const alle = sichtbare().length;

    app.actions['library:onlyAvailable']({}, null, { checked: true });
    const gefiltert = sichtbare().length;
    expect(gefiltert).toBeGreaterThan(0);
    expect(gefiltert).toBeLessThan(alle);

    app.actions['library:onlyAvailable']({}, null, { checked: false });
    expect(sichtbare()).toHaveLength(alle);
  });

  it('sperrt nicht machbare Uebungen im Plan-Editor, statt sie zu verstecken', async () => {
    const app = await mitAusruestung(['chair']);
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    const auswahl = document.getElementById('add-0');
    const opt = id => [...auswahl.options].find(o => o.value === id);
    expect(opt('pullup')).toBeTruthy();
    expect(opt('pullup').disabled).toBe(true);
    expect(opt('squat').disabled).toBe(false);
  });

  it('bietet beim Ersetzen nur machbare Alternativen an', async () => {
    const app = await mitAusruestung(['chair']);
    app.actions['day:select']({ key: 'B' });
    await ruhe();
    app.actions['exercise:substitute']({ ex: 'pullup' });
    await ruhe();
    const namen = [...document.querySelectorAll('.dlg-choice')].map(b => b.textContent);
    expect(namen.length).toBeGreaterThan(0);
    expect(namen.join(' ')).not.toContain('Chin-ups');
    expect(namen.join(' ')).toContain('Rudern');
  });

  /* Ohne diese Sperre schiebt die App den Nutzer in eine Stufe, die er nicht
     ausfuehren kann – Dips wechseln von der Bank auf die Parallettes. */
  it('steigt nicht in eine Stufe auf, fuer die das Geraet fehlt', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, equipment: ['chair'],
      levels: { dips: 1 }, streaks: { dips: 1 },
      settings: { streak: 2 }
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    app.actions['set:top']({ ex: 'dips' }, null, { checked: true });
    document.querySelector('.ex[data-exid="dips"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    const s = gespeichert();
    expect(s.levels.dips).toBe(1);
    /* Gedeckelt statt genullt: sobald die Parallettes da sind, steigt die
       Stufe beim naechsten Abschluss sofort. */
    expect(s.streaks.dips).toBe(2);
  });

  it('steigt auf, sobald das Geraet dazukommt', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, equipment: ['chair', 'parallettes'],
      levels: { dips: 1 }, streaks: { dips: 1 },
      settings: { streak: 2 }
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    app.actions['set:top']({ ex: 'dips' }, null, { checked: true });
    document.querySelector('.ex[data-exid="dips"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    expect(gespeichert().levels.dips).toBe(2);
  });

  it('zeigt im Training einen Hinweis, wenn die aktuelle Stufe Geraet braucht', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, equipment: ['chair'], levels: { dips: 3 }
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    const karte = document.querySelector('.ex[data-exid="dips"]');
    expect(karte.querySelector('.equip-warn').textContent).toContain('Parallettes');
  });
});

describe('Ersetzen und Auslassen', () => {
  async function training(){
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const punkteVon = id => [...document.querySelectorAll('.ex[data-exid="' + id + '"] .set-dot')];
  const waehlen = async name => {
    const b = [...document.querySelectorAll('.overlay.open .dlg-choice')]
      .find(x => x.textContent.includes(name));
    expect(b, 'Auswahl "' + name + '" nicht im Dialog').toBeTruthy();
    b.click();
    await ruhe();
  };

  /* Der Fehler: session.sets wurde komplett geleert, obwohl die Schluessel
     nach Uebung benannt sind ("pushup-0"). Wer die vierte Uebung ersetzte,
     nachdem drei fertig waren, verlor ALLE Haken der Einheit. */
  it('laesst beim Ersetzen die Haken der anderen Uebungen stehen', async () => {
    const app = await training();
    punkteVon('pushup').forEach(d => d.click());
    punkteVon('dips').forEach(d => d.click());
    await ruhe();
    const beiPushup = punkteVon('pushup').filter(d => d.classList.contains('done')).length;
    const beiDips = punkteVon('dips').filter(d => d.classList.contains('done')).length;
    expect(beiPushup).toBeGreaterThan(0);
    expect(beiDips).toBeGreaterThan(0);

    const p = app.actions['exercise:substitute']({ ex: 'dips' });
    await ruhe();
    await waehlen('Diamant');
    await waehlen('Nur heute');
    await p; await ruhe();

    /* Nur die ersetzte Uebung faengt bei null an. */
    expect(document.querySelectorAll('.set-dot.done')).toHaveLength(beiPushup);
    expect(punkteVon('pushup').filter(d => d.classList.contains('done')))
      .toHaveLength(beiPushup);
    expect(punkteVon('diamond').filter(d => d.classList.contains('done'))).toHaveLength(0);
  });

  it('ersetzt nur heute, ohne den Plan anzufassen', async () => {
    const app = await training();
    const p = app.actions['exercise:substitute']({ ex: 'pike' });
    await ruhe();
    await waehlen('Diamant');
    await waehlen('Nur heute');
    await p; await ruhe();

    const s = gespeichert();
    expect(s.customPlan == null).toBe(true);
    expect(s.activeSession.subs).toEqual({ pike: 'diamond' });
    expect(document.querySelector('.ex[data-exid="diamond"]')).toBeTruthy();
    expect(document.querySelector('.ex[data-exid="pike"]')).toBeNull();
  });

  it('haelt die Ersetzung ueber ein Neuladen', async () => {
    const app = await training();
    const p = app.actions['exercise:substitute']({ ex: 'pike' });
    await ruhe();
    await waehlen('Diamant');
    await waehlen('Nur heute');
    await p; await ruhe();

    vi.resetModules();
    document.body.innerHTML = KOERPER;
    await starten();
    expect(document.querySelector('.ex[data-exid="diamond"]')).toBeTruthy();
    expect(gespeichert().customPlan == null).toBe(true);
  });

  it('schreibt die Ersetzung auf Wunsch dauerhaft in den Plan', async () => {
    const app = await training();
    const p = app.actions['exercise:substitute']({ ex: 'pike' });
    await ruhe();
    await waehlen('Diamant');
    await waehlen('Dauerhaft');
    await p; await ruhe();

    const s = gespeichert();
    expect(s.customPlan.days[0].ex).toContain('diamond');
    expect(s.customPlan.days[0].ex).not.toContain('pike');
    expect(s.activeSession.subs).toEqual({});
  });

  it('laesst eine Uebung heute aus und holt sie zurueck', async () => {
    const app = await training();
    punkteVon('pike').forEach(d => d.click());
    await ruhe();

    app.actions['exercise:skip']({ ex: 'pike' });
    await ruhe();
    expect(document.querySelector('.ex[data-exid="pike"]').classList.contains('ex--skipped')).toBe(true);
    expect(punkteVon('pike')).toHaveLength(0);
    expect(gespeichert().activeSession.skip).toEqual({ pike: true });

    app.actions['exercise:unskip']({ ex: 'pike' });
    await ruhe();
    expect(punkteVon('pike').length).toBeGreaterThan(0);
    /* Die Haken kommen NICHT zurueck – die Uebung war ausgelassen. */
    expect(punkteVon('pike').filter(d => d.classList.contains('done'))).toHaveLength(0);
  });

  it('nimmt eine ausgelassene Uebung nicht in den Log-Eintrag auf', async () => {
    const app = await training();
    punkteVon('pushup').forEach(d => d.click());
    punkteVon('pike').forEach(d => d.click());
    await ruhe();
    app.actions['exercise:skip']({ ex: 'pike' });
    await ruhe();

    await app.actions['workout:finish']();
    await ruhe();
    const eintrag = gespeichert().log[0];
    expect(eintrag.ex).toContain('pushup');
    expect(eintrag.ex).not.toContain('pike');
  });
});

/* Das Banner erinnerte an eine Deload-Woche und hielt danach nur einen
   Zaehler fest – halbiert hat nie etwas. */
describe('Dialoge und Hintergrund', () => {
  /* inert lag nur auf .wrap. Abschlussleiste, Pausen-Chip und Toast liegen
     ausserhalb – ein Klick kam durch den z-index nicht durch, aber im
     Browse-Modus eines Screenreaders blieb "Training abschliessen"
     erreichbar, waehrend eine Rueckfrage offen stand. */
  it('macht auch die Abschlussleiste unerreichbar', async () => {
    const app = await starten();
    const draussen = ['.wrap', '#finishBar', '#restChip', '#toast'];
    draussen.forEach(sel => expect(document.querySelector(sel).hasAttribute('inert')).toBe(false));

    app.actions['settings:open']();
    await ruhe();
    draussen.forEach(sel =>
      expect(document.querySelector(sel).hasAttribute('inert'), sel).toBe(true));

    app.actions['settings:close']();
    await ruhe();
    draussen.forEach(sel =>
      expect(document.querySelector(sel).hasAttribute('inert'), sel).toBe(false));
  });

  /* showExHistory() benutzt einen wiederverwendeten Knoten. Ohne Schutz setzt
     ein zweiter Aufruf inert auf das Overlay selbst, und closeDialog() loest
     nur den ersten Stapeleintrag – .wrap bliebe dauerhaft unerreichbar. */
  it('oeffnet dasselbe Overlay kein zweites Mal', async () => {
    const app = await starten();
    app.actions['exercise:history']({ ex: 'pushup' });
    app.actions['exercise:history']({ ex: 'pushup' });
    await ruhe();

    const overlay = document.getElementById('exHistoryOverlay');
    expect(overlay.hasAttribute('inert')).toBe(false);
    overlay.querySelector('[data-action="exercise:historyClose"], [data-dlg=abbrechen], button').click();
    await ruhe();
    expect(document.querySelector('.wrap').hasAttribute('inert')).toBe(false);
  });
});

describe('Entlastungswoche', () => {
  const morgen = n => {
    return isoDaysAgo(-n);
  };
  const saetzeVon = id => document.querySelectorAll('.ex[data-exid="' + id + '"] .set-dot').length;

  it('halbiert die Saetze, sobald sie laeuft', async () => {
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    const voll = saetzeVon('pushup');
    expect(voll).toBe(4);

    app.actions['deload:start']({ due: 0 });
    await ruhe();
    expect(saetzeVon('pushup')).toBe(2);

    app.actions['deload:end']();
    await ruhe();
    expect(saetzeVon('pushup')).toBe(voll);
  });

  it('raeumt die Haken ab, die es nach dem Halbieren nicht mehr gibt', async () => {
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    document.querySelectorAll('.ex[data-exid="pushup"] .set-dot').forEach(d => d.click());
    await ruhe();
    expect(Object.keys(gespeichert().activeSession.sets)).toHaveLength(4);

    app.actions['deload:start']({ due: 0 });
    await ruhe();
    /* Ohne Nacharbeit stuenden hier Haken fuer Saetze 3 und 4, die es nicht
       mehr gibt – und die Abschlussleiste zaehlte 4/2. */
    expect(Object.keys(gespeichert().activeSession.sets)).toHaveLength(2);
    expect(document.getElementById('finishCount').textContent).toMatch(/^2\/\d/);
  });

  it('laesst die Stufen waehrend der Woche stehen', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, deload: { bis: morgen(3) },
      levels: { pushup: 1 }, streaks: { pushup: 1 }, settings: { streak: 2 }
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    app.actions['set:top']({ ex: 'pushup' }, null, { checked: true });
    document.querySelector('.ex[data-exid="pushup"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    const s = gespeichert();
    expect(s.levels.pushup).toBe(1);
    /* Weder hoch noch auf null: die Woche beschleunigt die Progression nicht
       und bestraft sie auch nicht. */
    expect(s.streaks.pushup).toBe(1);
    /* Und der Eintrag weiss davon: die Stagnationserkennung laesst ihn aus,
       seine halbierten Saetze waeren sonst Stillstand. */
    expect(s.log[0].dl).toBe(true);
    /* Notizen und Bestleistungen laufen trotzdem durch. */
    expect(s.log).toHaveLength(1);
  });

  it('endet von selbst, wenn das Datum durch ist', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 8, deload: { bis: morgen(-1) } }));
    await starten();
    expect(gespeichert().deload).toBeNull();
    expect(document.getElementById('banners').textContent).not.toContain('Entlastungswoche bis');
  });

  it('zeigt das laufende Banner statt der Erinnerung', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, deload: { bis: morgen(3) }, workouts: 24, settings: { deload: 24 }
    }));
    await starten();
    const text = document.getElementById('banners').textContent;
    expect(text).toContain('Entlastungswoche bis');
    expect(text).not.toContain('Entlastungswoche starten');
  });
});

describe('Plangenerator', () => {
  async function dialogOeffnen(equipment){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 8, equipment }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    const p = app.actions['plan:build']();
    await ruhe();
    return { app, p };
  }
  const uebernehmen = () => document.querySelector('.overlay.open [data-dlg=ok]').click();

  it('zeigt eine Vorschau, die sich mit der Tageszahl aendert', async () => {
    await dialogOeffnen(['bar']);
    const tage = document.getElementById('pb-tage');
    expect(document.querySelectorAll('#pb-vorschau .pb-day'))
      .toHaveLength(parseInt(tage.value, 10));

    tage.value = '5';
    tage.dispatchEvent(new Event('change'));
    expect(document.querySelectorAll('#pb-vorschau .pb-day')).toHaveLength(5);
  });

  it('bietet nur machbare Ziel-Skills an und stellt den gewaehlten vorn', async () => {
    await dialogOeffnen([]);
    const ziel = document.getElementById('pb-ziel');
    const werte = [...ziel.options].map(o => o.value);
    expect(werte[0]).toBe('keiner');
    expect(werte).toContain('handstand');
    /* Ohne Stange gibt es keinen Front Lever. */
    expect(werte).not.toContain('front_lever');
    ziel.value = 'handstand';
    ziel.dispatchEvent(new Event('change'));
    expect(document.querySelector('#pb-vorschau .pb-day span').textContent).toContain('Wand-Handstand');
  });

  it('legt die Wochentage fest und zeigt sie in der Vorschau', async () => {
    const { p } = await dialogOeffnen(['bar']);
    const tage = document.getElementById('pb-tage');
    tage.value = '3';
    tage.dispatchEvent(new Event('change'));
    expect(document.getElementById('pb-rhythmus').checked).toBe(true);
    expect(document.querySelector('#pb-vorschau .pb-day b').textContent).toMatch(/^Mo\.? · A/);
    uebernehmen();
    await p; await ruhe();
    expect(gespeichert().wochenplan).toEqual({ 1: 'A', 3: 'B', 5: 'C' });
  });

  it('laesst den Rhythmus ohne Haken, wie er ist', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, equipment: ['bar'], wochenplan: { 2: 'A' } }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'plan' });
    const p = app.actions['plan:build']();
    await ruhe();
    expect(document.getElementById('hint-pb-rhythmus').textContent).toMatch(/Ersetzt/);
    const haken = document.getElementById('pb-rhythmus');
    haken.checked = false;
    haken.dispatchEvent(new Event('change'));
    expect(document.querySelector('#pb-vorschau .pb-day b').textContent).toMatch(/^A · /);
    uebernehmen();
    await p; await ruhe();
    expect(gespeichert().wochenplan).toEqual({ 2: 'A' });
  });

  it('sagt in der Vorschau, was bei 30 Minuten fehlt', async () => {
    await dialogOeffnen(['bar']);
    const warn = () => document.querySelector('#pb-vorschau .bil-warn');
    const tage = document.getElementById('pb-tage');
    tage.value = '3';
    tage.dispatchEvent(new Event('change'));
    expect(warn()).toBeNull();
    const minuten = document.getElementById('pb-minuten');
    minuten.value = '30';
    minuten.dispatchEvent(new Event('change'));
    expect(warn().textContent).toMatch(/Hüftbeuge/);
  });

  it('fragt nach der Zeit pro Einheit und zeigt die geschaetzte Dauer', async () => {
    await dialogOeffnen(['bar', 'rings', 'chair', 'parallettes', 'band']);
    const minuten = document.getElementById('pb-minuten');
    expect(minuten.value).toBe('45');
    const zaehle = () => [...document.querySelectorAll('#pb-vorschau .pb-day span')]
      .map(el => el.textContent.split(' · ').length);
    const bei45 = zaehle();
    expect(document.querySelector('#pb-vorschau .pb-min').textContent).toMatch(/\d+ Min/);
    minuten.value = '30';
    minuten.dispatchEvent(new Event('change'));
    zaehle().forEach((n, i) => expect(n).toBeLessThanOrEqual(bei45[i]));
    expect(zaehle().reduce((a, b) => a + b)).toBeLessThan(bei45.reduce((a, b) => a + b));
  });

  it('uebernimmt genau das, was in der Vorschau stand', async () => {
    const { p } = await dialogOeffnen(['rings']);
    const gesehen = [...document.querySelectorAll('#pb-vorschau .pb-day')]
      .map(el => el.querySelector('span').textContent);
    uebernehmen();
    await p; await ruhe();

    const plan = gespeichert().customPlan;
    expect(plan.days).toHaveLength(gesehen.length);
    plan.days.forEach((d, i) => {
      /* Der Plan wird beim Zeichnen erzeugt und beim Uebernehmen genau dieser
         genommen – nicht ein zweites Mal gebaut. */
      expect(gesehen[i].split(' · ')).toHaveLength(d.ex.length);
    });
    expect(plan.days.flatMap(d => d.ex).some(id => id.startsWith('ring_'))).toBe(true);
  });

  it('laesst den Plan beim Abbrechen unberuehrt', async () => {
    const { p } = await dialogOeffnen(['bar']);
    document.querySelector('.overlay.open [data-dlg=abbrechen]').click();
    await p; await ruhe();
    /* Nicht toBeNull(): ohne Aenderung laeuft gar kein save(), im Speicher
       steht noch der Stand des Tests – und der kennt das Feld gar nicht. */
    expect(gespeichert().customPlan == null).toBe(true);
    expect(document.getElementById('planSelect').value).toBe('ab4');
  });

  it('fragt nach, bevor ein eigener Plan ueberschrieben wird', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, equipment: ['bar'],
      customPlan: { name: 'Meiner', desc: '', days: [{ key: 'X', title: 'X', sub: '', ex: ['pushup'] }] }
    }));
    const app = await starten();
    const p = app.actions['plan:build']();
    await ruhe();
    uebernehmen();
    await ruhe();

    /* Zweiter Dialog: die Rueckfrage. Abgelehnt bleibt der alte Plan stehen. */
    document.querySelector('.overlay.open [data-dlg=abbrechen]').click();
    await p; await ruhe();
    expect(gespeichert().customPlan.days[0].key).toBe('X');
  });
});

/* Der Verlauf je Uebung war eine reine Zahlentabelle – ob es aufwaerts geht,
   ist aber der Grund, ueberhaupt hineinzuschauen. */
describe('Verlauf je Uebung', () => {
  const eintrag = (d, reps) =>
    ({ d, day: 'A', sets: 12, tops: 0, ups: [], ex: ['pushup'], reps });

  async function oeffnen(log){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 7, workouts: log.length, log }));
    const app = await starten();
    app.actions['exercise:history']({ ex: 'pushup' });
    await ruhe();
    return document.getElementById('exHistoryOverlay');
  }

  it('zeichnet die Topsaetze als Kurve', async () => {
    const overlay = await oeffnen([
      eintrag('2026-07-01', { 'pushup-0': 8, 'pushup-1': 6 }),
      eintrag('2026-07-05', { 'pushup-0': 12 })
    ]);
    const svg = overlay.querySelector('svg.spark polyline');
    expect(svg).not.toBeNull();
    /* Zwei Punkte, aelteste Einheit links – und der bessere Satz liegt
       hoeher, also bei kleinerem y. */
    const [links, rechts] = svg.getAttribute('points').split(' ')
      .map(p => p.split(',').map(Number));
    expect(links[0]).toBeLessThan(rechts[0]);
    expect(rechts[1]).toBeLessThan(links[1]);
  });

  it('bleibt stumm fuer Screenreader – die Zahlen stehen in der Tabelle', async () => {
    const overlay = await oeffnen([
      eintrag('2026-07-01', { 'pushup-0': 8 }),
      eintrag('2026-07-05', { 'pushup-0': 12 })
    ]);
    expect(overlay.querySelector('svg.spark').getAttribute('aria-hidden')).toBe('true');
    expect(overlay.querySelector('table').textContent).toContain('12');
  });

  it('zeigt die gehaltenen Sekunden einer Halteuebung', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, log: [
      { d: '2026-07-01', day: 'A', sets: 4, ex: ['support'], lv: { support: 1 },
        sek: { 'support-0': 24, 'support-1': 22 } }
    ]}));
    const app = await starten();
    app.actions['exercise:history']({ ex: 'support' });
    await ruhe();
    const zeile = document.querySelector('#exHistoryOverlay table tr:nth-child(2)').textContent;
    expect(zeile).toContain('24 · 22');
    /* Stufe 1 gespeichert, also die zweite Stufe. */
    expect(zeile).toContain('2');
  });

  /* Die Spalte zaehlte die Aufstiege der ganzen Einheit. */
  it('markiert nur den Aufstieg dieser Uebung', async () => {
    const overlay = await oeffnen([
      { ...eintrag('2026-07-01', { 'pushup-0': 8 }), ups: ['dips', 'squat'] },
      { ...eintrag('2026-07-05', { 'pushup-0': 9 }), ups: ['pushup'] }
    ]);
    /* Das Zeichen ist seit dem Symbolsatz ein SVG, kein ▲ mehr im Text. */
    const zeilen = [...overlay.querySelectorAll('table tr')].slice(1);
    expect(zeilen[0].querySelector('.aufstieg use').getAttribute('href')).toBe('#i-levelup');
    expect(zeilen[1].querySelector('.aufstieg')).toBeNull();
  });

  /* Nach einem Aufstieg ist die Zahl kleiner, weil die Variante schwerer
     ist. Ueber den Wechsel gezogen saehe die Kurve nach Rueckschritt aus. */
  it('zieht die Kurve nur seit dem letzten Stufenwechsel', async () => {
    const mitStufe = (d, n, lvl) => ({ ...eintrag(d, { 'pushup-0': n }), lv: { pushup: lvl } });
    const overlay = await oeffnen([
      mitStufe('2026-07-01', 12, 0),
      mitStufe('2026-07-03', 6, 1),
      mitStufe('2026-07-05', 7, 1),
      mitStufe('2026-07-07', 8, 1)
    ]);
    const punkte = overlay.querySelector('svg.spark polyline').getAttribute('points').split(' ');
    expect(punkte).toHaveLength(3);
    expect(overlay.querySelector('.spark-caption')).not.toBeNull();
  });

  it('zeichnet nichts bei weniger als zwei Zahlenreihen', async () => {
    const overlay = await oeffnen([
      eintrag('2026-07-01', { 'pushup-0': 8 }),
      eintrag('2026-07-05', {})                 /* nur abgehakt, keine Zahlen */
    ]);
    expect(overlay.querySelector('svg.spark')).toBeNull();
    expect(overlay.querySelector('table')).not.toBeNull();
  });
});

/* Die Tabs erzeugten keinen History-Eintrag: auf Android schloss die
   Zurueck-Geste damit die ganze App, statt einen Tab zurueckzugehen. */
describe('Tabs in der History', () => {
  const sichtbarerTab = () =>
    TABS.find(t => !document.getElementById('view-' + t).hidden);
  const TABS = ['train', 'history', 'library', 'plan', 'milestones'];

  /* jsdom fuehrt die History je Dokument – zwischen den Tests aufraeumen,
     sonst haengen die Eintraege des vorigen noch dran. */
  beforeEach(() => { history.replaceState(null, '', '/'); });

  it('legt je Wechsel einen Eintrag an und geht ihn wieder zurueck', async () => {
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    app.actions['tab:show']({ tab: 'library' });
    await ruhe();
    expect(sichtbarerTab()).toBe('library');
    expect(location.hash).toBe('#library');

    history.back();
    await new Promise(r => setTimeout(r, 20));
    expect(sichtbarerTab()).toBe('history');

    history.back();
    await new Promise(r => setTimeout(r, 20));
    expect(sichtbarerTab()).toBe('train');
  });

  it('legt keinen Eintrag an, wenn der Tab derselbe bleibt', async () => {
    const app = await starten();
    const vorher = history.length;
    app.actions['tab:show']({ tab: 'train' });
    app.actions['tab:show']({ tab: 'train' });
    await ruhe();
    expect(history.length).toBe(vorher);
  });

  it('startet in dem Tab, der in der Adresse steht', async () => {
    history.replaceState(null, '', '/#library');
    await starten();
    expect(sichtbarerTab()).toBe('library');
  });

  it('ignoriert einen unbekannten Tab in der Adresse', async () => {
    history.replaceState(null, '', '/#gibtesnicht');
    await starten();
    expect(sichtbarerTab()).toBe('train');
    expect(location.hash).toBe('#train');
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

describe('Trainingsdauer', () => {
  async function einheit(n = 2){
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    wiederholungsPunkte().slice(0, n).forEach(d => d.click());
    await ruhe();
    return app;
  }

  /* Vorspulen statt warten: die Uhr steht sonst beim Abschluss praktisch
     auf demselben Wert wie beim ersten Haken. */
  function vorspulen(ms){
    const echt = Date.now.bind(Date);
    return vi.spyOn(Date, 'now').mockImplementation(() => echt() + ms);
  }

  it('misst vom ersten Haken bis zum Abschluss', async () => {
    const app = await einheit();
    const spy = vorspulen(27 * 60 * 1000);
    await app.actions['workout:finish']();
    await ruhe();
    spy.mockRestore();

    const dauer = gespeichert().log[0].dauer;
    expect(dauer).toBeGreaterThanOrEqual(27 * 60);
    expect(dauer).toBeLessThan(28 * 60);
  });

  /* Zwischen "Tag angetippt" und "erster Satz" liegen Umziehen und
     Aufwaermen. Wer gar nichts abhakt, hat keine gemessene Dauer. */
  it('zaehlt erst ab dem ersten Satz, nicht ab der Tagesauswahl', async () => {
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    const spy = vorspulen(40 * 60 * 1000);
    await app.actions['workout:finish']();
    await ruhe();
    spy.mockRestore();

    expect(gespeichert().log[0].dauer).toBe(0);
  });

  /* Eine ueber Nacht offen gebliebene Einheit hat keine brauchbare Dauer.
     Lieber "unbekannt" als eine Zahl, die jeden Durchschnitt verdirbt. */
  it('verwirft eine unrealistisch lange Einheit', async () => {
    const app = await einheit();
    const spy = vorspulen(9 * 60 * 60 * 1000);
    await app.actions['workout:finish']();
    await ruhe();
    spy.mockRestore();

    expect(gespeichert().log[0].dauer).toBe(0);
  });

  it('uebersteht ein Neuladen mitten in der Einheit', async () => {
    await einheit();
    const start = gespeichert().activeSession.start;
    expect(start).toBeGreaterThan(0);

    vi.resetModules();
    document.body.innerHTML = KOERPER;
    const app = await starten();
    const spy = vorspulen(15 * 60 * 1000);
    await app.actions['workout:finish']();
    await ruhe();
    spy.mockRestore();

    expect(gespeichert().log[0].dauer).toBeGreaterThanOrEqual(15 * 60);
  });

  it('zeigt Dauer und Durchschnitt im Verlauf, aber nicht ohne Messung', async () => {
    const app = await einheit();
    const spy = vorspulen(32 * 60 * 1000);
    await app.actions['workout:finish']();
    await ruhe();
    spy.mockRestore();

    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    expect(document.getElementById('logList').textContent).toContain('32 Min');
    expect(document.getElementById('logSummary').textContent).toContain('32 Min');

    /* Ein Eintrag ohne Messung darf weder "0 Min" zeigen noch den Schnitt
       nach unten ziehen. */
    const s = gespeichert();
    s.log.push({ ...s.log[0], d: '2026-01-01', dauer: 0 });
    localStorage.setItem(SPEICHER, JSON.stringify(s));
    vi.resetModules();
    document.body.innerHTML = KOERPER;
    const app2 = await starten();
    app2.actions['tab:show']({ tab: 'history' });
    await ruhe();
    /* Genau eine Zeile nennt eine Dauer – nicht auf "0 Min" pruefen, das
       steckt auch in "10 Min". */
    const zeilen = [...document.querySelectorAll('#logList .log-item')];
    expect(zeilen).toHaveLength(2);
    expect(zeilen.filter(z => /\bMin\b/.test(z.textContent))).toHaveLength(1);
    expect(document.getElementById('logSummary').textContent).toContain('32 Min');
  });
});

describe('Aufwaermen abhaken', () => {
  const punkte = () => [...document.querySelectorAll('#warmupList input[type=checkbox]')];
  const offen = () => document.querySelector('.overlay.open');

  async function tagUndAufwaermen(n = 0){
    const app = await starten();
    document.querySelectorAll('.day-btn')[n].click();
    await ruhe();
    return app;
  }
  const indizes = () => punkte().map(p => Number(p.dataset.i));

  it('haengt einen Haken an jeden Eintrag', async () => {
    await starten();
    expect(punkte().length).toBeGreaterThan(0);
    expect(punkte().every(p => !p.checked)).toBe(true);
  });

  it('merkt sich die Haken ueber ein Neuladen', async () => {
    await tagUndAufwaermen();
    punkte()[0].click();
    await ruhe();
    expect(gespeichert().activeSession.warm).toEqual({ 0: true });

    vi.resetModules();
    document.body.innerHTML = KOERPER;
    await starten();
    expect(punkte()[0].checked).toBe(true);
  });

  /* Neue Einheit, neues Aufwaermen – sonst begaenne die naechste mit einer
     fertig abgehakten Liste. */
  it('leert die Haken beim Wechsel des Trainingstags', async () => {
    await tagUndAufwaermen();
    punkte()[0].click();
    await ruhe();
    document.querySelectorAll('.day-btn')[1].click();
    await ruhe();
    expect(punkte().every(p => !p.checked)).toBe(true);
  });

  it('leert die Haken nach dem Abschluss', async () => {
    const app = await tagUndAufwaermen();
    punkte().forEach(p => p.click());
    wiederholungsPunkte()[0].click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    expect(punkte().every(p => !p.checked)).toBe(true);
  });

  /* Wer die Liste gar nicht benutzt, hat sich nicht gegen das Aufwaermen
     entschieden – die App weiss darueber nichts und fragt deshalb nicht. */
  it('fragt nicht, wenn ueberhaupt nichts abgehakt wurde', async () => {
    const app = await tagUndAufwaermen();
    wiederholungsPunkte()[0].click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    expect(offen()).toBeNull();
    expect(gespeichert().log).toHaveLength(1);
  });

  it('fragt nach, wenn der Pflichtpunkt offen blieb', async () => {
    /* Tag B: L-Sit ohne Handgelenks-Routine, der Pflichtpunkt steht da. */
    const app = await tagUndAufwaermen(1);
    expect(indizes()).toContain(3);
    /* Alles ausser dem Pflichtpunkt (Index 3). */
    punkte().forEach(p => { if(p.dataset.i !== '3') p.click(); });
    wiederholungsPunkte()[0].click();
    await ruhe();

    const fertig = app.actions['workout:finish']();
    await ruhe();
    expect(offen()).not.toBeNull();

    /* Abbrechen laesst die Einheit unangetastet weiterlaufen. */
    document.querySelector('.overlay.open [data-dlg=abbrechen]').click();
    await fertig;
    await ruhe();
    expect((gespeichert().log || [])).toHaveLength(0);
    expect(gespeichert().activeSession).not.toBeNull();
  });

  it('schliesst nach dem Bestaetigen trotzdem ab', async () => {
    const app = await tagUndAufwaermen(1);
    punkte().forEach(p => { if(p.dataset.i !== '3') p.click(); });
    wiederholungsPunkte()[0].click();
    await ruhe();

    const fertig = app.actions['workout:finish']();
    await ruhe();
    document.querySelector('.overlay.open [data-dlg=ok]').click();
    await fertig;
    await ruhe();
    expect(gespeichert().log).toHaveLength(1);
  });

  it('zeigt ohne gewaehlten Tag die ganze Liste', async () => {
    const { WARMUP } = await import('../js/exercises.js');
    await starten();
    expect(punkte()).toHaveLength(WARMUP.length);
    expect(document.querySelector('#warmupList .warm-note')).toBeNull();
  });

  /* Tag A der Vorlage beginnt mit der Handgelenks-Routine – die Handgelenke
     stuenden sonst doppelt da. Beine gibt es dort auch. */
  it('laesst an einem Tag mit Handgelenks-Routine die Handgelenke weg', async () => {
    const app = await tagUndAufwaermen(0);
    expect(indizes()).not.toContain(3);
    expect(indizes()).toEqual(expect.arrayContaining([0, 2, 6, 7]));
    expect(document.querySelector('#warmupList .warm-note').textContent).toMatch(/Tag A/);
    /* Und fragt beim Abschluss nicht nach einem Punkt, den es nicht gab. */
    punkte().forEach(p => p.click());
    wiederholungsPunkte()[0].click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    expect(offen()).toBeNull();
    expect(gespeichert().log).toHaveLength(1);
  });

  it('bringt am Beintag Huefte und Knie statt Haengen und Schultern', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, planId: 'custom',
      customPlan: { name: 'Beine', desc: '', days: [{ key: 'L', title: 'Beine', sub: '', ex: ['squat', 'glute_bridge'] }] } }));
    await tagUndAufwaermen(0);
    expect(indizes()).toEqual([0, 4, 6, 7]);
  });

  it('kopiert beim Entfernen die Liste in der Sprache der Oberflaeche', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, settings: { lang: 'en' } }));
    const app = await starten();
    await app.actions['warmup:remove']({ i: '0' });
    await ruhe();
    expect(gespeichert().warmupCustom[0]).toMatch(/^Arm circles/);
  });

  /* Ohne Nachruecken sitzt jeder Haken hinter der geloeschten Zeile
     anschliessend an einem Punkt, den niemand abgehakt hat. */
  it('schiebt die Haken nach, wenn ein Eintrag geloescht wird', async () => {
    const app = await tagUndAufwaermen();
    punkte()[2].click();
    await ruhe();
    await app.actions['warmup:remove']({ i: '0' });
    await ruhe();
    expect(punkte()[1].checked).toBe(true);
    expect(punkte()[2].checked).toBe(false);
  });
});

describe('Bibliothek: was liegen geblieben ist', () => {
  const ids = () => [...document.querySelectorAll('#libList .lib-item')].map(el => el.dataset.exid);
  const eintrag = id => document.querySelector('#libList .lib-item[data-exid="' + id + '"]');

  /* Ein Log mit genau zwei bekannten Uebungen: eine von heute, eine alte.
     Alles andere in der Bibliothek wurde nie trainiert. */
  async function mitLog(){
    const heute = heuteLokal();
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 9, workouts: 2,
      log: [
        { d: '2020-01-05', day: 'A', ex: ['squat'], sets: 4, tops: 0, ups: [], reps: {} },
        { d: heute, day: 'A', ex: ['pushup'], sets: 4, tops: 0, ups: [], reps: {} }
      ]
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'library' });
    await ruhe();
    return app;
  }

  it('nennt bei jeder Uebung, wann sie zuletzt dran war', async () => {
    await mitLog();
    expect(eintrag('pushup').textContent).toMatch(/zuletzt/);
    expect(eintrag('dips').textContent).toMatch(/noch nie/);
  });

  /* Der Hinweis soll auffallen – an allen 42 Zeilen waere er keiner mehr. */
  it('markiert nur, was liegen geblieben ist', async () => {
    await mitLog();
    const chip = id => eintrag(id).querySelector('.cat-chip.stale');
    expect(chip('pushup')).toBeNull();
    expect(chip('squat').textContent).toMatch(/Tagen/);
    expect(chip('dips').textContent).toMatch(/noch nie/);
  });

  it('sortiert auf Wunsch nach dem letzten Mal – Ungetrainiertes zuerst', async () => {
    const app = await mitLog();
    const standard = ids();

    await app.actions['library:sort']({}, null, { value: 'alt' });
    await ruhe();
    const nachAlter = ids();
    expect(nachAlter).not.toEqual(standard);
    expect(nachAlter).toHaveLength(standard.length);
    /* Heute trainiert: ganz hinten. Davor die alte, davor alles Ungeuebte. */
    expect(nachAlter[nachAlter.length - 1]).toBe('pushup');
    expect(nachAlter[nachAlter.length - 2]).toBe('squat');
    expect(nachAlter.indexOf('dips')).toBeLessThan(nachAlter.indexOf('squat'));
  });

  it('kehrt zur Kategorie-Reihenfolge zurueck', async () => {
    const app = await mitLog();
    const standard = ids();
    await app.actions['library:sort']({}, null, { value: 'alt' });
    await ruhe();
    await app.actions['library:sort']({}, null, { value: 'standard' });
    await ruhe();
    expect(ids()).toEqual(standard);
  });

  it('faellt bei einem unbekannten Wert auf die Vorgabe zurueck', async () => {
    const app = await mitLog();
    const standard = ids();
    await app.actions['library:sort']({}, null, { value: 'quatsch' });
    await ruhe();
    expect(ids()).toEqual(standard);
  });
});

describe('Tastatur: zwischen den Uebungen springen', () => {
  /* cancelable: true ist hier nicht Kosmetik. Ohne das bleibt
     defaultPrevented false, und der Schutz gegen doppelte Behandlung
     greift nicht – in diesem Dokument haengt je Test ein weiterer
     keydown-Zuhoerer, weil jeder Start ein frisches Modul laedt. */
  const taste = key => document.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  const karten = () => [...document.querySelectorAll('#content .ex')].map(el => el.dataset.exid);
  const fokusKarte = () => document.activeElement.closest('.ex')?.dataset.exid;

  async function training(){
    const app = await starten();
    /* jsdom kennt scrollIntoView nicht. */
    window.HTMLElement.prototype.scrollIntoView = function(){};
    document.querySelector('.day-btn').click();
    await ruhe();
    return app;
  }

  it('springt ohne Ausgangspunkt in die erste Uebung', async () => {
    await training();
    taste('ArrowDown');
    expect(fokusKarte()).toBe(karten()[0]);
  });

  it('geht vorwaerts und rueckwaerts', async () => {
    await training();
    taste('ArrowDown');
    taste('ArrowDown');
    expect(fokusKarte()).toBe(karten()[1]);
    taste('ArrowUp');
    expect(fokusKarte()).toBe(karten()[0]);
  });

  it('laeuft am Ende um', async () => {
    await training();
    taste('ArrowUp');
    expect(fokusKarte()).toBe(karten()[karten().length - 1]);
  });

  /* Der Fokus soll auf dem Satz landen, an dem es weitergeht. */
  it('zielt auf den ersten offenen Satz', async () => {
    await training();
    taste('ArrowDown');
    const ziel = document.activeElement;
    expect(ziel.classList.contains('set-dot')).toBe(true);
    expect(ziel.classList.contains('done')).toBe(false);
  });

  /* In einem Eingabefeld bewegen die Pfeile den Cursor, nicht die Ansicht. */
  it('haelt sich aus Eingabefeldern heraus', async () => {
    await training();
    const feld = document.querySelector('.rep-input');
    feld.focus();
    feld.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(feld);
  });

  it('tut ohne laufende Einheit nichts', async () => {
    await starten();
    taste('ArrowDown');
    expect(document.activeElement).toBe(document.body);
  });
});

describe('Training nachtragen', () => {
  const dialog = () => document.querySelector('.overlay.open');
  const feld = id => dialog().querySelector('#' + id);
  const klick = w => dialog().querySelector('[data-dlg=' + w + ']').click();

  /* Nicht awaiten: das Promise loest erst auf, wenn der Dialog beantwortet
     ist. Erst oeffnen, dann fuellen, dann bestaetigen, dann warten. */
  async function oeffnen(app){
    const p = app.actions['log:add']();
    await ruhe();
    return p;
  }

  it('schreibt einen Eintrag mit Datum, Tag und Saetzen', async () => {
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    const p = oeffnen(app);
    await ruhe();

    feld('le-datum').value = '2026-05-04';
    feld('le-saetze').value = '9';
    const tag = feld('le-tag').value;
    klick('ok');
    await (await p); await ruhe();

    const log = gespeichert().log;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ d: '2026-05-04', day: tag, sets: 9, tops: 0, dauer: 0 });
    /* Aus dem Plan uebernommen - sonst waere die Einheit fuer "zuletzt
       trainiert" und die Uebungshistorie unsichtbar. */
    expect(log[0].ex.length).toBeGreaterThan(0);
    expect(gespeichert().workouts).toBe(1);
  });

  it('belegt die Satzzahl mit dem vor, was der Plan vorsieht', async () => {
    const app = await starten();
    const p = oeffnen(app);
    await ruhe();
    expect(Number(feld('le-saetze').value)).toBeGreaterThan(0);
    klick('abbrechen');
    await (await p);
  });

  async function nachtragen(app, d, n){
    const p = oeffnen(app);
    await ruhe();
    feld('le-datum').value = d;
    if(n !== undefined) feld('le-saetze').value = n;
    klick('ok');
    await (await p); await ruhe();
  }

  it('sortiert nach Datum ein, statt hinten anzuhaengen', async () => {
    const app = await starten();
    await nachtragen(app, '2026-06-01', '5');
    await nachtragen(app, '2026-03-01', '6');
    expect(gespeichert().log.map(l => l.d)).toEqual(['2026-03-01', '2026-06-01']);
    /* Das groesste Datum, nicht das zuletzt eingetragene. */
    expect(gespeichert().lastDate).toBe('2026-06-01');
  });

  /* Nichts geschrieben heisst hier woertlich nichts: ein frischer Start
     ohne Aenderung legt noch gar keinen Stand an. */
  const keinEintrag = () => {
    const s = gespeichert();
    expect((s && s.log) || []).toHaveLength(0);
    expect(document.getElementById('logList').textContent).toMatch(/noch keine|no entries/i);
  };

  it('weist ein Datum in der Zukunft ab', async () => {
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    await nachtragen(app, '2099-01-01');
    keinEintrag();
  });

  it('weist ein leeres Datum ab', async () => {
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    await nachtragen(app, '');
    keinEintrag();
  });

  it('fragt beim zweiten Eintrag am selben Tag nach', async () => {
    const app = await starten();
    await nachtragen(app, '2026-05-04', '4');
    expect(gespeichert().log).toHaveLength(1);

    const p = oeffnen(app);
    await ruhe();
    feld('le-datum').value = '2026-05-04';
    klick('ok');
    await ruhe();
    /* Jetzt steht die Rueckfrage, nicht mehr der Eingabedialog. */
    expect(feld('le-datum')).toBeNull();
    klick('abbrechen');
    await (await p); await ruhe();
    expect(gespeichert().log).toHaveLength(1);
  });
});

describe('Verlauf ohne Kappung', () => {
  const spalten = () => [...document.querySelectorAll('#weekChart .bar-col')];
  const zeilen = () => document.querySelectorAll('#logList .log-item');
  const beschriftungen = () => spalten().map(c => c.querySelector('.bar-lbl').textContent);

  /* 60 Einheiten im Wochenabstand – gut 14 Monate zurueck. */
  function langesLog(n = 60){
    const log = [];
    for(let i = n - 1; i >= 0; i--){
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      log.push({
        d: new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
        day: 'A', ex: ['pushup'], sets: 4, tops: 0, ups: [], reps: {}, dauer: 0
      });
    }
    return log;
  }

  async function mitVerlauf(log = langesLog()){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 9, workouts: log.length, log }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    return app;
  }

  const stellen = async (app, wert) => {
    await app.actions['history:range']({}, null, { value: wert });
    await ruhe();
  };

  it('zeigt in der Vorgabe acht Wochen', async () => {
    await mitVerlauf();
    expect(spalten()).toHaveLength(8);
    expect(beschriftungen().every(l => /KW|W\d/.test(l))).toBe(true);
  });

  /* Der eigentliche Punkt: der Rest war vorher unerreichbar. */
  it('oeffnet laengere Zeitraeume', async () => {
    const app = await mitVerlauf();
    await stellen(app, '26w');
    expect(spalten()).toHaveLength(26);
  });

  it('gruppiert lange Zeitraeume nach Monaten statt nach Wochen', async () => {
    const app = await mitVerlauf();
    await stellen(app, '12m');
    expect(spalten()).toHaveLength(12);
    expect(beschriftungen().some(l => /KW/.test(l))).toBe(false);

    await stellen(app, 'all');
    /* Gut 14 Monate, also mehr als die zwoelf von eben. */
    expect(spalten().length).toBeGreaterThan(12);
  });

  it('zieht die Liste mit dem Zeitraum mit', async () => {
    const app = await mitVerlauf();
    const kurz = zeilen().length;
    expect(kurz).toBeLessThanOrEqual(9);
    await stellen(app, 'all');
    expect(zeilen().length).toBe(60);
  });

  /* Anders als die frueheren 25 sagt die Kappung, dass sie eine ist. */
  it('nennt die Zahl, wenn nicht alles in die Liste passt', async () => {
    const app = await mitVerlauf(langesLog(130));
    await stellen(app, 'all');
    expect(zeilen()).toHaveLength(100);
    expect(document.getElementById('logSummary').textContent).toMatch(/100/);
    expect(document.getElementById('logSummary').textContent).toMatch(/130/);
  });

  it('faellt bei einem unbekannten Zeitraum auf acht Wochen zurueck', async () => {
    const app = await mitVerlauf();
    await stellen(app, 'all');
    await stellen(app, 'quatsch');
    expect(spalten()).toHaveLength(8);
  });
});

describe('Einstieg', () => {
  const banner = () => document.getElementById('banners').textContent;
  const dialog = () => document.querySelector('.overlay.open');
  const auswahl = kat => dialog().querySelector('#ob-' + kat);
  const geraet = eq => dialog().querySelector('[data-ob-eq="' + eq + '"]');

  it('laedt mit einer Einladung, aber ohne Dialog', async () => {
    await starten();
    expect(banner()).toMatch(/Willkommen/);
    /* Ein Dialog vor der ersten Ansicht wird weggeklickt. */
    expect(dialog()).toBeNull();
  });

  /* Wer schon trainiert, hat seine Stufen laengst. */
  it('schweigt bei einem benutzten Stand', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 8, workouts: 12, log: [{ d: '2026-01-01', day: 'A' }]
    }));
    await starten();
    expect(banner()).not.toMatch(/Willkommen/);
  });

  it('verschwindet nach "Spaeter" und bleibt weg', async () => {
    const app = await starten();
    await app.actions['onboarding:skip']();
    await ruhe();
    expect(banner()).not.toMatch(/Willkommen/);
    expect(gespeichert().onboarded).toBe(true);

    vi.resetModules();
    document.body.innerHTML = KOERPER;
    await starten();
    expect(banner()).not.toMatch(/Willkommen/);
  });

  it('setzt Ausruestung und Startstufen', async () => {
    const app = await starten();
    const p = app.actions['onboarding:start']();
    await ruhe();

    /* Nur Stange behalten. */
    ['chair', 'parallettes', 'rings', 'band'].forEach(e => {
      const box = geraet(e);
      if(box.checked){ box.checked = false; box.dispatchEvent(new window.Event('change')); }
    });
    await ruhe();

    auswahl('push').value = '4';
    auswahl('push').dispatchEvent(new window.Event('change'));
    dialog().querySelector('[data-dlg=ok]').click();
    await p; await ruhe();

    const s = gespeichert();
    expect(s.equipment).toEqual(['bar']);
    expect(s.levels.pushup).toBe(4);
    expect(s.onboarded).toBe(true);
    /* Gedaempft weitergegeben, aber nie an Skills. */
    expect(s.levels.planche).toBeUndefined();
  });

  /* Ohne Stange ist der Klimmzug keine sinnvolle Frage. */
  it('richtet die Fragen nach der Ausruestung', async () => {
    const app = await starten();
    const p = app.actions['onboarding:start']();
    await ruhe();
    expect(auswahl('pull')).not.toBeNull();
    const vorher = auswahl('pull').options.length;

    ['bar', 'rings'].forEach(e => {
      const box = geraet(e);
      if(box.checked){ box.checked = false; box.dispatchEvent(new window.Event('change')); }
    });
    await ruhe();
    /* Jetzt steht dort das Rudern mit weniger Stufen, nicht der Klimmzug. */
    expect(auswahl('pull').options.length).toBeLessThan(vorher);

    dialog().querySelector('[data-dlg=abbrechen]').click();
    await p;
  });

  it('beendet den Einstieg auch beim Abbrechen', async () => {
    const app = await starten();
    const p = app.actions['onboarding:start']();
    await ruhe();
    dialog().querySelector('[data-dlg=abbrechen]').click();
    await p; await ruhe();
    expect(gespeichert().onboarded).toBe(true);
    expect(banner()).not.toMatch(/Willkommen/);
  });

  it('laesst sich aus den Einstellungen wiederholen', async () => {
    const app = await starten();
    await app.actions['onboarding:skip']();
    await ruhe();

    const p = app.actions['onboarding:again']();
    await ruhe();
    expect(dialog()).not.toBeNull();
    expect(auswahl('push')).not.toBeNull();
    dialog().querySelector('[data-dlg=abbrechen]').click();
    await p;
  });
});

describe('Bestleistungen mit Masseinheit', () => {
  /* pike zaehlt bis Stufe 2 Sekunden und ab Stufe 3 Wiederholungen – eine
     der sieben Uebungen, deren Leiter die Masseinheit wechselt. */
  async function mitStand(prs, levels){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 10, onboarded: true, prs, levels }));
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    return app;
  }
  const prVon = id => (gespeichert().prs || {})[id];

  /* Der Fehler: "30 Sek" von Stufe 3 blockierte jede Wiederholungszahl unter
     30 – die Bestleistung stand fuer immer still. */
  it('laesst Wiederholungen eine aeltere Haltezeit abloesen', async () => {
    const app = await mitStand(
      { pike: { v: '30 Sek', n: 30, d: '2026-01-01', art: 'sek', lvl: 2 } },
      { pike: 3 });

    const feld = document.getElementById('rep-pike-0');
    expect(feld).not.toBeNull();
    feld.value = '8';
    feld.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('set-pike-0').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    expect(prVon('pike')).toMatchObject({ n: 8, art: 'reps', lvl: 3 });
  });

  it('laesst eine niedrigere Stufe die hoehere nicht ueberschreiben', async () => {
    const app = await mitStand(
      { pike: { v: '12 Wdh', n: 12, d: '2026-01-01', art: 'reps', lvl: 4 } },
      { pike: 0 });

    /* Stufe 0 ist eine Halteuebung: der Punkt startet einen Countdown. */
    document.getElementById('set-pike-0').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    expect(prVon('pike')).toMatchObject({ n: 12, art: 'reps' });
  });

  it('vergleicht innerhalb derselben Masseinheit weiter ueber die Zahl', async () => {
    const app = await mitStand(
      { pike: { v: '15 Wdh', n: 15, d: '2026-01-01', art: 'reps', lvl: 3 } },
      { pike: 3 });

    const feld = document.getElementById('rep-pike-0');
    feld.value = '9';
    feld.dispatchEvent(new window.Event('input', { bubbles: true }));
    document.getElementById('set-pike-0').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();

    expect(prVon('pike').n).toBe(15);
  });

  /* Eine Handeingabe ohne Stufe wuerde vom naechsten automatischen Eintrag
     mit anderer Masseinheit sofort ueberschrieben. */
  it('schreibt bei der Handeingabe Masseinheit und Stufe mit', async () => {
    const app = await mitStand({}, { pike: 2 });
    app.actions['tab:show']({ tab: 'library' });
    await ruhe();
    document.getElementById('pr-pike').value = '25 Sek';
    await app.actions['pr:save']({ ex: 'pike' });
    await ruhe();
    expect(prVon('pike')).toMatchObject({ art: 'sek', lvl: 2, n: 25 });
  });
});

describe('Ziele: erkannte Meilensteine und Bestleistungen', () => {
  const zeile = id => document.querySelector('#msList [data-id="' + id + '"]')?.closest('.ms-row');
  const chip = id => zeile(id)?.querySelector('.cat-chip');
  const knopf = id => zeile(id)?.querySelector('[data-action="milestone:accept"]');
  const kasten = id => document.querySelector('#msList [data-id="' + id + '"]');

  async function mitStand(zusatz = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 10, onboarded: true,
      levels: { pullup: 3 },
      prs: { pullup: { v: '5 Wdh', n: 5, d: '2026-07-01', art: 'reps', lvl: 3 } },
      ...zusatz
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'milestones' });
    await ruhe();
    return app;
  }

  it('markiert einen erkannten Meilenstein, hakt ihn aber nicht ab', async () => {
    await mitStand();
    expect(chip('pullup1').textContent).toMatch(/geschafft/);
    expect(kasten('pullup1').checked).toBe(false);
    expect((gespeichert().milestones || {}).pullup1).toBeUndefined();
  });

  it('traegt ihn auf Knopfdruck ein', async () => {
    const app = await mitStand();
    await app.actions['milestone:accept']({ id: 'pullup1' });
    await ruhe();
    expect(gespeichert().milestones.pullup1).toBeTruthy();
    expect(kasten('pullup1').checked).toBe(true);
    expect(chip('pullup1')).toBeNull();
  });

  /* Ein Button IM Label loest aus UND schaltet das Kontrollkaestchen um –
     der Meilenstein waere danach wieder offen. Deshalb steht er daneben. */
  it('haelt beim echten Klick auf den Knopf, statt zurueckzuspringen', async () => {
    await mitStand();
    knopf('pullup1').click();
    await ruhe();
    expect(gespeichert().milestones.pullup1).toBeTruthy();
    expect(kasten('pullup1').checked).toBe(true);
  });

  it('nennt bei einem offenen Meilenstein, was ihm fehlt', async () => {
    await mitStand();
    /* pushup5 braucht Stufe 4 und 5 Wdh – beides fehlt. */
    const text = zeile('pushup5').querySelector('.ms-need').textContent;
    expect(text).toMatch(/Stufe 4/);
    expect(text).toMatch(/5 Wdh/);
  });

  it('nennt nur den fehlenden Teil, wenn die Stufe schon reicht', async () => {
    await mitStand({ levels: { pullup: 3, pushup: 5 } });
    const text = zeile('pushup5').querySelector('.ms-need').textContent;
    expect(text).not.toMatch(/Stufe/);
    expect(text).toMatch(/5 Wdh/);
  });

  it('zeigt die Bestleistungen an einer Stelle, neueste zuerst', async () => {
    await mitStand({ prs: {
      pullup: { v: '5 Wdh', n: 5, d: '2026-07-01', art: 'reps', lvl: 3 },
      squat: { v: '30 Wdh', n: 30, d: '2026-08-01', art: 'reps', lvl: 1 },
      gibtsnicht: { v: '9', n: 9, d: '2026-09-01' }
    }});
    const zeilen = [...document.querySelectorAll('#bestsList .log-item')];
    expect(zeilen).toHaveLength(2);
    expect(zeilen[0].textContent).toMatch(/30 Wdh/);
    expect(zeilen[1].textContent).toMatch(/5 Wdh/);
  });

  it('sagt es, wenn es noch keine Bestleistung gibt', async () => {
    await mitStand({ prs: {} });
    expect(document.querySelectorAll('#bestsList .log-item')).toHaveLength(0);
    expect(document.getElementById('bestsList').textContent).toMatch(/Noch keine/);
  });
});

describe('Pluralform in der Verlaufszeile', () => {
  async function mitLog(sets){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 10, onboarded: true, workouts: 1,
      log: [{ d: '2026-05-04', day: 'A', ex: ['pushup'], sets, tops: 0, ups: [], reps: {}, dauer: 0 }]
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    return app;
  }

  it('sagt bei einem Satz "1 Satz"', async () => {
    await mitLog(1);
    const zeile = document.querySelector('#logList .log-item').textContent;
    expect(zeile).toContain('1 Satz');
    expect(zeile).not.toContain('1 Sätze');
  });

  it('sagt bei mehreren "Sätze"', async () => {
    await mitLog(12);
    expect(document.querySelector('#logList .log-item').textContent).toContain('12 Sätze');
  });
});

describe('Verteilung je Trainingstag', () => {
  const koepfe = () => [...document.querySelectorAll('#planEditor .plan-day-title')]
    .map(e => e.textContent.trim());
  const zaehler = () => [...document.querySelectorAll('#planEditor .plan-day-count')]
    .map(e => ({ text: e.textContent, warn: e.classList.contains('warn') }));

  function log(proTag){
    const out = [];
    let tag = 0;
    Object.entries(proTag).forEach(([day, n]) => {
      for(let i = 0; i < n; i++){
        out.push({ d: '2026-01-' + String(++tag).padStart(2, '0'),
          day, ex: ['pushup'], sets: 4, tops: 0, ups: [], reps: {}, dauer: 0 });
      }
    });
    return out.sort((a, b) => a.d.localeCompare(b.d));
  }

  async function mitLog(proTag){
    const l = log(proTag);
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 11, onboarded: true, workouts: l.length, log: l
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    return app;
  }

  it('nennt je Trainingstag, wie oft er dran war', async () => {
    await mitLog({ A: 12, B: 3 });
    expect(koepfe()[0]).toMatch(/12×/);
    expect(koepfe()[1]).toMatch(/3×/);
  });

  /* Eine schiefe Rotation heisst, dass ein Tag regelmaessig ausfaellt – das
     sieht man sonst nirgends. */
  it('hebt einen deutlichen Rueckstand hervor', async () => {
    await mitLog({ A: 12, B: 3 });
    const z = zaehler();
    expect(z[0].warn).toBe(false);
    expect(z[1].warn).toBe(true);
  });

  it('schweigt bei ausgeglichener Verteilung', async () => {
    await mitLog({ A: 6, B: 5 });
    expect(zaehler().every(z => !z.warn)).toBe(true);
  });

  /* Sonst haengt der zweite Tag hinterher, bevor er ueberhaupt dran war. */
  it('zeigt vor der zweiten Einheit gar keine Zahlen', async () => {
    await mitLog({ A: 1 });
    expect(zaehler()).toHaveLength(0);
  });

  /* Der Kern der Umstellung: die Zahl haengt am Log und nicht an einem
     Zaehler daneben, der davon abweichen kann.

     Geloescht wird ueber die Aktion und nicht ueber einen echten Klick auf
     den Knopf: an diesem Dokument haengt je vorherigem Test ein weiterer
     Delegations-Zuhoerer, und der Klick liefe dann durch mehrere
     Modulinstanzen mit je eigenem Zustand. In der laufenden App gibt es
     genau eine. */
  it('geht beim Loeschen eines Eintrags sofort mit', async () => {
    const app = await mitLog({ A: 12, B: 3 });
    const letzter = gespeichert().log.length - 1;
    expect(gespeichert().log[letzter].day).toBe('B');

    const fertig = app.actions['log:remove']({ i: String(letzter) });
    await ruhe();
    document.querySelector('.overlay.open [data-dlg=ok]').click();
    await fertig; await ruhe();

    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    expect(koepfe()[0]).toMatch(/12×/);
    expect(koepfe()[1]).toMatch(/2×/);
    expect(gespeichert().byDay).toBeUndefined();
  });
});

describe('Wochenrhythmus', () => {
  const hinweis = () => document.getElementById('heuteHinweis');
  const abzeichen = () => document.querySelector('.day-btn .badge')?.closest('.day-btn')?.dataset.key;
  const auswahl = wd => document.getElementById('wp-' + wd);

  /* Der Wochentag von heute nach Date.getDay(). */
  const heuteWd = () => new Date().getDay();
  const morgenWd = () => (heuteWd() + 1) % 7;

  async function mitPlan(wochenplan){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 11, onboarded: true, wochenplan }));
    const app = await starten();
    await ruhe();
    return app;
  }

  it('sagt nichts, solange kein Rhythmus eingerichtet ist', async () => {
    await mitPlan({});
    expect(hinweis().hidden).toBe(true);
  });

  it('nennt den Tag von heute und schlaegt ihn vor', async () => {
    await mitPlan({ [heuteWd()]: 'B' });
    expect(hinweis().hidden).toBe(false);
    expect(hinweis().textContent).toMatch(/^Heute: B/);
    expect(abzeichen()).toBe('B');
  });

  /* Nie eine Sperre: am Ruhetag laesst sich trotzdem trainieren. */
  it('meldet einen Ruhetag, ohne etwas zu verbieten', async () => {
    await mitPlan({ [morgenWd()]: 'A' });
    expect(hinweis().textContent).toMatch(/Ruhetag/);
    document.querySelector('.day-btn').click();
    await ruhe();
    expect(document.querySelectorAll('.set-dot').length).toBeGreaterThan(0);
  });

  /* Ohne Rhythmus bleibt die Rotation zustaendig – das bisherige Verhalten. */
  it('faellt ohne Zuordnung auf die Rotation zurueck', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 11, onboarded: true, wochenplan: {},
      log: [{ d: '2026-01-01', day: 'A', ex: ['pushup'], sets: 4, tops: 0, ups: [], reps: {}, dauer: 0 }]
    }));
    await starten();
    expect(abzeichen()).toBe('B');
  });

  it('laesst sich im Plan-Tab setzen und wieder loeschen', async () => {
    const app = await mitPlan({});
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    expect(auswahl(1)).not.toBeNull();

    await app.actions['weekplan:set']({ wd: '1' }, null, { value: 'B' });
    await ruhe();
    expect(gespeichert().wochenplan).toEqual({ 1: 'B' });

    await app.actions['weekplan:set']({ wd: '1' }, null, { value: '' });
    await ruhe();
    expect(gespeichert().wochenplan).toEqual({});
  });

  it('nimmt keinen Tag an, den der Plan nicht kennt', async () => {
    const app = await mitPlan({});
    await app.actions['weekplan:set']({ wd: '1' }, null, { value: 'Z' });
    await ruhe();
    expect(gespeichert().wochenplan).toEqual({});

    /* Auch ein Wochentag ausserhalb von 0–6 aendert nichts. */
    await app.actions['weekplan:set']({ wd: '9' }, null, { value: 'A' });
    await ruhe();
    expect(gespeichert().wochenplan).toEqual({});
  });

  it('markiert kommende Trainingstage im Kalender', async () => {
    const app = await mitPlan({ 0: 'A', 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A' });
    /* Der Kalender braucht mindestens einen Log-Eintrag, sonst bleibt er leer. */
    const s = gespeichert() || { v: 11, onboarded: true, wochenplan: {} };
    s.log = [{ d: heuteLokal(), day: 'A', ex: ['pushup'],
      sets: 4, tops: 0, ups: [], reps: {}, dauer: 0 }];
    s.wochenplan = { 0: 'A', 1: 'A', 2: 'A', 3: 'A', 4: 'A', 5: 'A', 6: 'A' };
    localStorage.setItem(SPEICHER, JSON.stringify(s));
    vi.resetModules();
    document.body.innerHTML = KOERPER;
    const app2 = await starten();
    app2.actions['tab:show']({ tab: 'history' });
    await ruhe();

    const geplant = document.querySelectorAll('#calendarView .cal-day.geplant');
    expect(geplant.length).toBeGreaterThan(0);
    /* Der heutige Tag ist trainiert und deshalb nicht zusaetzlich geplant. */
    const heute = document.querySelector('#calendarView .cal-day.workout');
    expect(heute.classList.contains('geplant')).toBe(false);
    expect(app).toBeTruthy();
  });
});

describe('Backup teilen', () => {
  const knopf = () => document.getElementById('shareBtn');

  /* Das Ergebnis wird erst im Aufruf erzeugt. Ein vorab abgelehntes Promise
     gilt bis zum ersten await als unbehandelt und laesst den Lauf mit einem
     Fehler enden, obwohl der Test durchgeht. */
  function teilenErlauben(ergebnis){
    navigator.canShare = () => true;
    navigator.share = vi.fn(() => ergebnis());
    return navigator.share;
  }
  function teilenAbschalten(){
    delete navigator.canShare;
    delete navigator.share;
  }

  async function mitBackupStand(){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 11, onboarded: true, workouts: 20, lastBackup: null,
      log: [{ d: '2026-01-01', day: 'A', ex: ['pushup'], sets: 4, tops: 0, ups: [], reps: {}, dauer: 0 }]
    }));
    const app = await starten();
    app.actions['settings:open']();
    await ruhe();
    return app;
  }

  afterEach(() => teilenAbschalten());

  /* Desktop-Browser kennen share() haeufig, canShare({files}) aber nicht –
     ein Knopf, der dort ins Leere liefe, waere schlimmer als keiner. */
  it('bleibt verborgen, wo das Geraet nicht teilen kann', async () => {
    teilenAbschalten();
    await mitBackupStand();
    expect(knopf().hidden).toBe(true);
  });

  it('erscheint, wo es geht', async () => {
    teilenErlauben(() => Promise.resolve());
    await mitBackupStand();
    expect(knopf().hidden).toBe(false);
  });

  it('teilt die Sicherung und bucht sie', async () => {
    const share = teilenErlauben(() => Promise.resolve());
    const app = await mitBackupStand();
    await app.actions['backup:shareJSON']();
    await ruhe();

    expect(share).toHaveBeenCalled();
    const datei = share.mock.calls[0][0].files[0];
    expect(datei.name).toMatch(/^progression-backup-\d{4}-\d{2}-\d{2}\.json$/);
    expect(gespeichert().lastBackup).toBe(heuteLokal());
    expect(gespeichert().backupWorkouts).toBe(20);
  });

  /* Ein abgebrochenes Teilen ist keine Sicherung – sonst verstummt die
     Erinnerung fuer ein Backup, das es nicht gibt. */
  it('bucht nichts, wenn der Nutzer abbricht', async () => {
    const fehler = new Error('abgebrochen');
    fehler.name = 'AbortError';
    teilenErlauben(() => Promise.reject(fehler));
    const app = await mitBackupStand();
    await app.actions['backup:shareJSON']();
    await ruhe();

    const s = gespeichert();
    expect(s === null || s.lastBackup === null).toBe(true);
    expect(document.getElementById('banners').textContent).toMatch(/Sicherung|backup/i);
  });

  it('meldet einen echten Fehler, bucht aber ebenfalls nicht', async () => {
    teilenErlauben(() => Promise.reject(new Error('kaputt')));
    const app = await mitBackupStand();
    await app.actions['backup:shareJSON']();
    await ruhe();
    const s = gespeichert();
    expect(s === null || s.lastBackup === null).toBe(true);
  });
});

/* Beide Felder wurden geschrieben, standen aber nicht im Schema – und
   migrateState() kopiert nur, was in DEFAULT_STATE steht. Was hier auffaellt,
   faellt in der App auf: nach dem naechsten Start war es weg. */
describe('Eigene Ziele und weggeklickte Hinweise ueberdauern einen Neustart', () => {
  it('haelt einen selbst gesetzten Meilenstein', async () => {
    const app = await starten();
    app.actions['tab:show']({ tab: 'milestones' });
    await ruhe();

    app.actions['milestone:add']();
    await ruhe();
    const eingabe = document.querySelector('.overlay.open #dlg-input');
    expect(eingabe).not.toBeNull();
    eingabe.value = 'Muscle-up';
    document.querySelector('.overlay.open [data-dlg=ok]').click();
    await ruhe();

    expect(gespeichert().customMilestones.map(m => m.name)).toEqual(['Muscle-up']);

    /* Neu laden – genau hier verschwand das Ziel. */
    vi.resetModules();
    document.body.innerHTML = KOERPER;
    const zweit = await starten();
    zweit.actions['tab:show']({ tab: 'milestones' });
    await ruhe();
    expect(document.getElementById('msList').textContent).toContain('Muscle-up');
  });

  it('haelt ein weggeklicktes Plateau-Banner', async () => {
    const app = await starten();
    app.actions['deload:plateauDismiss']();
    await ruhe();
    expect(gespeichert().deloadPlateauDismissed).toBe(true);

    /* Neu laden – und danach etwas schreiben. Ein blosser Neustart
       ueberschreibt den Speicher nicht; der Verlust faellt erst beim
       naechsten Speichern auf, und dann ist er endgueltig. */
    vi.resetModules();
    document.body.innerHTML = KOERPER;
    const zweit = await starten();
    zweit.actions['theme:toggle']();
    await ruhe();
    expect(gespeichert().deloadPlateauDismissed).toBe(true);
  });
});

/* Sie feuerte aus start(): App an einem Trainingstag oeffnen, und das
   System meldete, man solle heute trainieren – waehrend man auf die App
   schaute, und bei jedem Neuladen erneut. */
describe('Trainingserinnerung', () => {
  const heuteWd = () => new Date().getDay();
  let gesendet;

  function sichtbarkeit(wert){
    Object.defineProperty(document, 'visibilityState', { value: wert, configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
  }

  beforeEach(() => {
    gesendet = [];
    class FakeNotification {
      constructor(titel, opt){ gesendet.push({ titel, body: opt && opt.body }); }
      static permission = 'granted';
      static requestPermission(){ return Promise.resolve('granted'); }
    }
    window.Notification = FakeNotification;
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.Notification;
    sichtbarkeit('visible');
  });

  async function anTrainingstag(over = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 13, onboarded: true, wochenplan: { [heuteWd()]: 'A' },
      settings: { reminder: true }, ...over
    }));
    const app = await starten();
    await ruhe();
    return app;
  }

  it('meldet sich nicht, waehrend man auf die App schaut', async () => {
    await anTrainingstag();
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(gesendet).toHaveLength(0);
  });

  /* Gezaehlt wird nicht auf eine feste Zahl: jedes starten() in dieser Datei
     laesst einen weiteren visibilitychange-Listener am document zurueck, und
     alle feuern mit. Die laufende App hat genau eine Instanz. */
  it('meldet sich, nachdem die App in den Hintergrund gegangen ist', async () => {
    await anTrainingstag();
    sichtbarkeit('hidden');
    vi.advanceTimersByTime(10 * 60 * 1000);
    await ruhe();
    expect(gesendet.length).toBeGreaterThan(0);
    expect(gesendet[0].body).toContain('A');
  });

  it('faellt aus, wenn man vorher zurueckkommt', async () => {
    await anTrainingstag();
    sichtbarkeit('hidden');
    vi.advanceTimersByTime(30 * 1000);
    sichtbarkeit('visible');
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(gesendet).toHaveLength(0);
  });

  it('kommt hoechstens einmal am Tag', async () => {
    await anTrainingstag();
    sichtbarkeit('hidden');
    vi.advanceTimersByTime(10 * 60 * 1000);
    await ruhe();
    const nachDemErsten = gesendet.length;
    expect(nachDemErsten).toBeGreaterThan(0);
    expect(gespeichert().erinnertAm).toBe(heuteLokal());

    /* Zweite Runde: App wieder oeffnen, wieder verlassen. */
    sichtbarkeit('visible');
    sichtbarkeit('hidden');
    vi.advanceTimersByTime(10 * 60 * 1000);
    await ruhe();
    expect(gesendet).toHaveLength(nachDemErsten);
  });

  it('schweigt an einem Ruhetag', async () => {
    await anTrainingstag({ wochenplan: { [(heuteWd() + 1) % 7]: 'A' } });
    sichtbarkeit('hidden');
    vi.advanceTimersByTime(10 * 60 * 1000);
    await ruhe();
    expect(gesendet).toHaveLength(0);
  });
});

/* Die App-eigene Erinnerung greift nur, solange die Seite lebt. Der
   Kalender des Geraets braucht sie nicht – deshalb dieser Export. */
describe('Wochenrhythmus in den Kalender', () => {
  const heuteWd = () => new Date().getDay();
  const meldung = () => document.getElementById('toast')?.textContent || '';

  async function mitRhythmus(wochenplan){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 13, onboarded: true, wochenplan }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    return app;
  }

  function zeitAntworten(wert){
    const eingabe = document.querySelector('.overlay.open #dlg-input');
    if(!eingabe) return false;
    eingabe.value = wert;
    document.querySelector('.overlay.open [data-dlg=ok]').click();
    return true;
  }

  afterEach(() => { delete navigator.canShare; delete navigator.share; });

  it('sagt Bescheid, wenn es nichts zu exportieren gibt', async () => {
    const app = await mitRhythmus({});
    await app.actions['plan:ics']();
    await ruhe();
    expect(meldung()).toMatch(/Kein Wochenrhythmus/);
    /* Ohne Rhythmus wird gar nicht erst nach einer Uhrzeit gefragt. */
    expect(document.querySelector('.overlay.open #dlg-input')).toBeNull();
  });

  it('teilt die Kalenderdatei, wo das Geraet es kann', async () => {
    let geteilt = null;
    navigator.canShare = () => true;
    navigator.share = vi.fn(d => { geteilt = d; return Promise.resolve(); });

    const app = await mitRhythmus({ [heuteWd()]: 'A' });
    const lauf = app.actions['plan:ics']();
    await ruhe();
    expect(zeitAntworten('07:15')).toBe(true);
    await lauf;
    await ruhe();

    expect(navigator.share).toHaveBeenCalled();
    expect(geteilt.files[0].name).toBe('progression-trainingstage.ics');
    const text = await geteilt.files[0].text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).toContain('T071500');
    expect(text).toContain('RRULE:FREQ=WEEKLY;BYDAY=');
  });

  it('meldet eine unbrauchbare Uhrzeit, statt eine leere Datei zu bauen', async () => {
    navigator.canShare = () => true;
    navigator.share = vi.fn(() => Promise.resolve());

    const app = await mitRhythmus({ [heuteWd()]: 'A' });
    const lauf = app.actions['plan:ics']();
    await ruhe();
    expect(zeitAntworten('abends')).toBe(true);
    await lauf;
    await ruhe();

    expect(navigator.share).not.toHaveBeenCalled();
    expect(meldung()).toMatch(/keine Uhrzeit/);
  });
});

/* Trainings, Level-Ups und Wiederholungen waren auf das Jahr gefiltert, die
   Meilensteine nicht – am 1. Januar stand im Rueckblick auf ein Jahr mit
   null Erfolgen die Gesamtzahl. */
describe('Jahresrueckblick', () => {
  const heute = new Date();
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');
  const HEUTE = iso(heute);
  const VORJAHR = (heute.getFullYear() - 1) + '-06-15';
  const rueckblick = () => document.getElementById('yearReview').textContent;

  async function mitStand(over){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 13, onboarded: true, workouts: 1,
      log: [{ d: HEUTE, day: 'A', ex: ['pushup'], sets: 4, tops: 1, ups: ['pushup'], reps: { 'pushup-0': 10 }, dauer: 0 }],
      ...over
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    return app;
  }

  it('zaehlt nur die Meilensteine dieses Jahres', async () => {
    await mitStand({ milestones: { pullup1: HEUTE, dip1: VORJAHR, hs1: VORJAHR } });
    expect(rueckblick()).toContain('Meilensteine: 1');
  });

  it('zaehlt gar keine, wenn alle aus dem Vorjahr sind', async () => {
    await mitStand({ milestones: { dip1: VORJAHR } });
    expect(rueckblick()).toContain('Meilensteine: 0');
  });

  /* "1 Trainings" stand da, weil die Texte feste Pluralformen trugen. */
  it('kommt bei genau einer Einheit ohne falschen Plural aus', async () => {
    await mitStand({});
    const t = rueckblick();
    expect(t).toContain('Trainings: 1');
    expect(t).toContain('Wiederholungen: 10');
    expect(t).not.toMatch(/1 Trainings|1 Meilensteine|1 Level-Ups/);
  });

  /* Die Ueberschrift steht im Markup; eine zweite kam aus dem Renderer. */
  it('setzt keine zweite Ueberschrift in die Karte', async () => {
    await mitStand({});
    expect(document.querySelectorAll('#yearReview .section-title')).toHaveLength(0);
  });
});

/* Nach zwei Wochen Pause faellt jede Stufe um eins. Das galt auch fuer
   Mobility – nach einem Urlaub war die Handgelenks-Routine zurueckgestuft,
   ausgerechnet die Aufwaermroutine. */
describe('Rueckstufung nach einer Pause', () => {
  const vorTagen = n => {
    const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  };

  async function nachPause(tage){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 13, onboarded: true, workouts: 5, lastDate: vorTagen(tage),
      settings: { regress: true },
      levels: { pushup: 3, pullup: 2, wrist_prep: 2, pike_stretch: 3, wall_hs: 2 }
    }));
    await starten();
    await ruhe();
    return gespeichert().levels;
  }

  it('nimmt Kraft und Skills zurueck, Mobility nicht', async () => {
    const lv = await nachPause(20);
    expect(lv.pushup).toBe(2);
    expect(lv.pullup).toBe(1);
    /* Ein Skill faellt mit – ein Schritt zurueck ist dort Vorsicht. */
    expect(lv.wall_hs).toBe(1);
    /* Mobility bleibt stehen. */
    expect(lv.wrist_prep).toBe(2);
    expect(lv.pike_stretch).toBe(3);
  });

  it('ruehrt innerhalb der Frist gar nichts an', async () => {
    const lv = await nachPause(5);
    expect(lv).toEqual({ pushup: 3, pullup: 2, wrist_prep: 2, pike_stretch: 3, wall_hs: 2 });
  });
});

/* Der Log-Eintrag hielt seine Aufstiege als uebersetzten Anzeigetext fest
   ("Liegestuetze → Diamant-Liegestuetze"). Angezeigt wurde der nie – gezaehlt
   wurde immer nur seine Laenge –, aber er machte den Eintrag unauswertbar
   und fror die Sprache ein. */
describe('Aufstiege im Log', () => {
  async function mitAufstieg(){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 14, onboarded: true, equipment: ['chair', 'parallettes'],
      levels: { dips: 1 }, streaks: { dips: 1 }, settings: { streak: 2 }
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    app.actions['set:top']({ ex: 'dips' }, null, { checked: true });
    document.querySelector('.ex[data-exid="dips"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    return gespeichert();
  }

  it('haelt die Kennung fest, nicht den Anzeigetext', async () => {
    const s = await mitAufstieg();
    expect(s.levels.dips).toBe(2);
    expect(s.log[0].ups).toEqual(['dips']);
    expect(s.log[0].dl).toBe(false);
    /* Kein Pfeil, kein uebersetzter Name – sonst waere der Eintrag wieder
       an die Sprache gebunden, in der er entstanden ist. */
    expect(s.log[0].ups.join('')).not.toContain('→');
  });

  it('meldet den Aufstieg trotzdem im Klartext', async () => {
    await mitAufstieg();
    expect(document.getElementById('toast').textContent).toContain('→');
  });
});

/* Ab 1040px steht die Tableiste als Schiene links. Das ARIA-Tabs-Muster
   verlangt dann ↑/↓ statt ←/→ – eine senkrechte Leiste, die auf waagerechte
   Pfeile hoert, ist mit der Tastatur schlicht nicht bedienbar.

   matchMedia wird hier gezielt beantwortet: die Breite steht in jsdom nicht
   zur Verfuegung, die Abfrage ist also die einzige Stelle, an der sich die
   Ausrichtung ueberhaupt festmachen laesst. */
describe('Tableiste als senkrechte Schiene', () => {
  function breiteVortaeuschen(breit){
    window.matchMedia = q => ({
      matches: q.includes('1040px') ? breit : false,
      addEventListener(){}, removeEventListener(){}
    });
  }

  /* Die Taste kommt vom AKTIVEN Tab, nicht von einem festen: so bewegt sich
     auch der Fokus des Nutzers – er wandert mit dem Tab weiter. Ein fester
     Ausgangspunkt liesse ↑ nach einem ↓ vom ersten Tab ans Ende springen. */
  const pfeil = key => document.querySelector('.tab.active')
    .dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  /* location.hash ueberlebt zwischen den Tests, und die App stellt beim Start
     den Tab daraus wieder her. Ohne das begaenne ein Test dort, wo der
     vorige aufgehoert hat. */
  beforeEach(() => { history.replaceState(null, '', location.pathname); });

  it('meldet die Ausrichtung an Hilfsmittel', async () => {
    breiteVortaeuschen(true);
    await starten();
    expect(document.querySelector('.tabs').getAttribute('aria-orientation')).toBe('vertical');
  });

  it('setzt waagerecht kein Attribut – das ist die Vorgabe des Musters', async () => {
    breiteVortaeuschen(false);
    await starten();
    expect(document.querySelector('.tabs').hasAttribute('aria-orientation')).toBe(false);
  });

  it('navigiert in der Schiene mit hoch und runter', async () => {
    breiteVortaeuschen(true);
    await starten();
    pfeil('ArrowDown');
    expect(document.getElementById('view-history').hidden).toBe(false);
    pfeil('ArrowUp');
    expect(document.getElementById('view-train').hidden).toBe(false);
  });

  it('laesst die waagerechten Pfeile in der Schiene unbeachtet', async () => {
    breiteVortaeuschen(true);
    await starten();
    pfeil('ArrowRight');
    expect(document.getElementById('view-train').hidden).toBe(false);
  });

  it('navigiert in der waagerechten Leiste weiterhin mit links und rechts', async () => {
    breiteVortaeuschen(false);
    await starten();
    pfeil('ArrowRight');
    expect(document.getElementById('view-history').hidden).toBe(false);
  });

  /* Der Sprung zwischen Uebungskarten hoert ebenfalls auf ↑/↓. Solange der
     Fokus in der Leiste steht, darf er nicht zusaetzlich feuern – dafuer
     sorgt preventDefault in der Leiste und die defaultPrevented-Abfrage im
     globalen Zuhoerer. */
  it('loest in der Schiene nicht zusaetzlich den Uebungssprung aus', async () => {
    breiteVortaeuschen(true);
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    app.actions['tab:show']({ tab: 'train' });
    document.getElementById('tab-train').focus();
    pfeil('ArrowDown');
    /* Die Leiste hat gewechselt; der Fokus sitzt danach auf dem neuen Tab
       und nicht in einer Uebungskarte. */
    expect(document.activeElement.closest('.ex')).toBeNull();
  });
});

/* Beim Sprachwechsel baute updateSetting() ausdruecklich "alle Ansichten neu,
   nicht nur die sichtbare" – und liess dabei genau die laufende Einheit aus.
   Wer mitten im Training umstellte, behielt Namen, Zielangaben und Knoepfe
   der Uebungskarten in der alten Sprache, bis die Einheit vorbei war. */
describe('Sprachwechsel waehrend einer Einheit', () => {
  async function laufendeEinheit(){
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    return app;
  }
  const aufEnglisch = app =>
    app.actions['setting:update']({ key: 'lang' }, null, { type: 'select-one', value: 'en' });

  it('uebersetzt auch die Karten der laufenden Einheit', async () => {
    const app = await laufendeEinheit();
    const vorher = document.querySelector('[data-exid="pushup"] .ex-name').textContent;
    aufEnglisch(app);
    await ruhe();
    const nachher = document.querySelector('[data-exid="pushup"] .ex-name').textContent;
    expect(nachher).not.toBe(vorher);
    /* Die Einheit der Halteuebung kommt seit der Umstellung auf Daten aus
       der Uebersetzung und nicht mehr aus einer Textersetzung. */
    /* Wand-Handstand statt Stuetzhalte: die steht seit der Satzgrenze nicht
       mehr in Tag A. */
    expect(document.querySelector('[data-exid="wall_hs"] .ex-target').textContent).toMatch(/sec$/);
  });

  /* Die Karten werden dafuer neu aufgebaut. Das darf nichts kosten, was
     schon eingetragen ist – sonst waere die Korrektur schlimmer als der
     Fehler. */
  it('behaelt dabei, was schon eingetragen ist', async () => {
    const app = await laufendeEinheit();
    const feld = document.getElementById('rep-pushup-0');
    feld.value = '9';
    app.actions['set:reps']({ key: 'pushup-0' }, null, feld);
    await ruhe();
    aufEnglisch(app);
    await ruhe();
    expect(document.getElementById('rep-pushup-0').value).toBe('9');
  });
});

/* Der Aufstieg hing allein am Haekchen "Oberes Limit in allen Saetzen
   geschafft", waehrend die Wiederholungen daneben standen und nur fuer
   Bestleistungen und Volumen zaehlten. Jetzt entscheiden die Zahlen, wo sie
   fuer jeden Satz vorliegen. */
describe('Oberes Limit aus den Wiederholungen', () => {
  async function einheit(){
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  /* Wie ein Mensch tippt: Feld fuellen, dann die Aktion des Feldes. */
  function tippe(app, id, werte){
    werte.forEach((w, s) => {
      const f = document.getElementById('rep-' + id + '-' + s);
      f.value = w == null ? '' : String(w);
      app.actions['set:reps']({ key: id + '-' + s }, null, f);
    });
  }
  const saetze = id => document.querySelectorAll('[data-exid="' + id + '"] .rep-input').length;
  /* Die Obergrenze aus dem Ziel der Karte ('4 × 6–10'); der Platzhalter
     nennt seit dem Tagesziel die Vorgabe des Satzes, nicht mehr die Spanne. */
  const oben = id => Number(document.querySelector('[data-exid="' + id + '"] .ex-target').textContent.split('–')[1]);
  const label = id => document.getElementById('top-' + id);
  const alle = (id, n) => Array(saetze(id)).fill(n);

  it('setzt das Haekchen selbst, wenn jeder Satz oben ist', async () => {
    const app = await einheit();
    tippe(app, 'pushup', alle('pushup', oben('pushup')));
    expect(label('pushup').classList.contains('abgeleitet')).toBe(true);
    expect(label('pushup').classList.contains('checked')).toBe(true);
    const box = label('pushup').querySelector('input');
    expect(box.checked).toBe(true);
    /* Eine Anzeige, keine Eingabe: gegen die Zahlen laesst es sich nicht
       setzen oder wegnehmen. */
    expect(box.disabled).toBe(true);
    expect(label('pushup').querySelector('.toplimit-grund').textContent).toContain(String(oben('pushup')));
  });

  it('nimmt es zurueck, sobald ein Satz darunter bleibt', async () => {
    const app = await einheit();
    const werte = alle('pushup', oben('pushup'));
    werte[werte.length - 1] = oben('pushup') - 1;
    tippe(app, 'pushup', werte);
    expect(label('pushup').classList.contains('abgeleitet')).toBe(true);
    expect(label('pushup').querySelector('input').checked).toBe(false);
  });

  it('bleibt Handeingabe, solange ein Satz ohne Zahl ist – und sagt es', async () => {
    const app = await einheit();
    const werte = alle('pushup', oben('pushup'));
    werte[0] = null;
    tippe(app, 'pushup', werte);
    expect(label('pushup').classList.contains('abgeleitet')).toBe(false);
    expect(label('pushup').querySelector('input').disabled).toBe(false);
    expect(label('pushup').querySelector('.toplimit-grund')).not.toBeNull();
  });

  it('schweigt vor dem ersten eingetragenen Satz', async () => {
    await einheit();
    expect(label('pushup').querySelector('.toplimit-grund')).toBeNull();
  });

  it('laesst Halteuebungen bei der Handeingabe', async () => {
    await einheit();
    expect(label('wall_hs').classList.contains('abgeleitet')).toBe(false);
    expect(label('wall_hs').querySelector('.toplimit-grund')).toBeNull();
  });

  it('zaehlt beim Abschluss ohne Haekchen, wenn die Zahlen stimmen', async () => {
    const app = await einheit();
    tippe(app, 'pushup', alle('pushup', oben('pushup')));
    document.querySelector('.ex[data-exid="pushup"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    expect(gespeichert().streaks.pushup).toBe(1);
  });

  /* Der Fall, den das Haekchen frueher durchliess: als geschafft markiert,
     die Zahlen aber zu niedrig. Die Zahlen gewinnen. */
  it('laesst die Zahlen ueber ein gesetztes Haekchen entscheiden', async () => {
    const app = await einheit();
    app.actions['set:top']({ ex: 'pushup' }, null, { checked: true });
    tippe(app, 'pushup', alle('pushup', 1));
    document.querySelector('.ex[data-exid="pushup"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    expect(gespeichert().streaks.pushup).toBe(0);
  });

  /* Beim Wiederherstellen wurde das Haekchen blind aus session.top gesetzt.
     Ein frueher gesetztes, von den Zahlen ueberholtes Haekchen stuende nach
     dem Neuladen wieder da. */
  it('rechnet nach dem Neuladen nach, statt das alte Haekchen zu zeigen', async () => {
    let app = await einheit();
    app.actions['set:top']({ ex: 'pushup' }, null, { checked: true });
    tippe(app, 'pushup', alle('pushup', 1));
    app.actions['set:tap']({ ex: 'pushup', set: '0' });
    await ruhe();
    await new Promise(r => setTimeout(r, 700));   /* entprelltes Sichern */

    vi.resetModules();
    document.body.innerHTML = KOERPER;
    app = await starten();
    await ruhe();
    expect(label('pushup').classList.contains('abgeleitet')).toBe(true);
    expect(label('pushup').querySelector('input').checked).toBe(false);
  });
});

/* Die Karte nannte in jeder Einheit dieselbe Spanne, obwohl die App wusste,
   was letztes Mal ging. Jetzt steht darunter, was heute ansteht – aber nur,
   wenn die letzte Einheit auf derselben Stufe lag. */
describe('Tagesziel auf der Karte', () => {
  async function mitLetzter(eintrag, levels = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 15, onboarded: true, levels,
      log: [{ d: '2026-01-10', day: 'A', ex: ['pushup'], sets: 4, ...eintrag }]
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const karte = () => document.querySelector('[data-exid="pushup"]');
  const heute = () => karte().querySelector('.last-reps.heute');
  const reps = (...n) => Object.fromEntries(n.map((w, i) => ['pushup-' + i, w]));

  /* Die Zahlen stehen seit der Satzspalte unter jedem Satz, nicht mehr in
     einer eigenen Zeile. */
  it('nennt je Satz eine Wiederholung mehr', async () => {
    await mitLetzter({ reps: reps(8, 8, 7, 7), lv: { pushup: 0 } });
    const ziele = [...karte().querySelectorAll('.satz-ziel')].map(z => z.textContent);
    expect(ziele).toEqual(['Ziel 9', 'Ziel 9', 'Ziel 8', 'Ziel 8']);
    expect(heute()).toBeNull();
  });

  it('haengt jede Vorgabe an ihr Eingabefeld', async () => {
    await mitLetzter({ reps: reps(8, 8, 7, 7), lv: { pushup: 0 } });
    const feld = document.getElementById('rep-pushup-2');
    expect(document.getElementById(feld.getAttribute('aria-describedby')).textContent).toBe('Ziel 8');
    /* Punkt, Feld und Vorgabe stehen in derselben Spalte. */
    expect(feld.closest('.satz').querySelector('.set-dot').id).toBe('set-pushup-2');
  });

  it('sagt bei allen Saetzen oben, dass es noch einmal gilt', async () => {
    await mitLetzter({ reps: reps(10, 10, 10, 10), lv: { pushup: 0 } });
    expect(heute().textContent).not.toMatch(/\d · \d/);
    expect(heute().textContent.length).toBeGreaterThan(0);
  });

  /* Der Fall, um den es geht: nach einem Aufstieg stammen die Zahlen von der
     leichteren Variante. Als Vorgabe fuer die neue waeren sie falscher Rat -
     statt "11 · 11 · 11 · 11" steht dort die Untergrenze der neuen Stufe. */
  it('nennt nach einem Stufenwechsel die Untergrenze als Einstieg', async () => {
    await mitLetzter({ reps: reps(10, 10, 10, 10), lv: { pushup: 0 } }, { pushup: 1 });
    /* Stufe 1 der Liegestuetze: 4 x 6-10. */
    expect(heute().textContent).toContain('6 · 6 · 6 · 6');
    expect(heute().textContent).toContain('Einstieg');
  });

  it('nennt den Einstieg auch fuer eine Uebung ohne Vorgeschichte', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    expect(karte().querySelector('.last-reps:not(.heute)')).toBeNull();
    expect(heute().textContent).toContain('Einstieg');
  });

  /* 18 Stufen heissen wie ihre Nachbarin. Liegestuetze 3 und 4 sind beide
     "Volle Liegestuetze", erst 5-10, dann 10-15. */
  it('macht gleichnamige Stufen an Nummer und Ziel unterscheidbar', async () => {
    await mitLetzter({ reps: reps(10, 10, 10, 10), lv: { pushup: 3 } }, { pushup: 4 });
    const zeile = karte().querySelector('.last-reps').textContent;
    expect(zeile).toContain('Stufe 4');
    expect(zeile).toContain('5–10');
  });

  it('nennt dann die Stufe, von der die Zahlen stammen', async () => {
    await mitLetzter({ reps: reps(10, 10, 10, 10), lv: { pushup: 0 } }, { pushup: 1 });
    const zeile = karte().querySelector('.last-reps').textContent;
    expect(zeile).toContain('Erhöht (Tisch)');
    expect(zeile).toContain('10 · 10 · 10 · 10');
  });

  /* Ohne Stufe laesst sich nicht sagen, ob die Zahlen passen – vor v15, aus
     einer CSV oder nachgetragen. Die Zeile bleibt, das Ziel nicht. */
  it('gibt ohne bekannte Stufe kein Tagesziel aus', async () => {
    await mitLetzter({ reps: reps(8, 8, 7, 7) });
    expect(karte().querySelector('.last-reps')).not.toBeNull();
    expect(heute()).toBeNull();
  });

  it('haelt beim Abschluss die Stufe VOR einem Aufstieg fest', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 15, onboarded: true, equipment: ['chair', 'parallettes'],
      levels: { dips: 1 }, streaks: { dips: 1 }, settings: { streak: 2 }
    }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    app.actions['set:top']({ ex: 'dips' }, null, { checked: true });
    document.querySelector('.ex[data-exid="dips"] .set-dot').click();
    await ruhe();
    await app.actions['workout:finish']();
    await ruhe();
    const s = gespeichert();
    expect(s.levels.dips).toBe(2);
    /* Die Zahlen dieser Einheit entstanden auf Stufe 1, nicht auf 2. */
    expect(s.log[0].lv.dips).toBe(1);
  });
});

/* Die alte Regel meldete eine Uebung nach vier Einheiten ohne Aufstieg -
   bei 6-10 und einer Wiederholung mehr je Einheit ist das der Normalfall.
   Hier nur, dass die App die Regel aus js/domain/plateau.js mit echten
   Zielangaben speist; die Regel selbst prueft test/plateau.test.js. */
describe('Stagnation im Banner', () => {
  async function mitFolge(folge){
    const log = folge.map((r, i) => ({
      d: '2026-01-' + String(i + 1).padStart(2, '0'), day: 'A', ex: ['pushup'], sets: 4,
      lv: { pushup: 0 }, reps: Object.fromEntries([0, 1, 2, 3].map(n => ['pushup-' + n, r]))
    }));
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, log }));
    await starten();
    await ruhe();
    return document.getElementById('banners').textContent;
  }

  it('schweigt bei stetigem Fortschritt', async () => {
    expect(await mitFolge([6, 7, 8, 9])).not.toContain('Stagnation');
  });

  it('meldet drei Einheiten ohne mehr Wiederholungen', async () => {
    expect(await mitFolge([8, 8, 8, 8])).toContain('Stagnation');
  });

  it('schweigt, wenn alle Saetze oben sind und nur die Serie fehlt', async () => {
    /* Liegestuetze Stufe 0: 4 x 6-10. */
    expect(await mitFolge([10, 10, 10, 10])).not.toContain('Stagnation');
  });
});

/* Das Gegenstueck zum abgeleiteten Aufstieg: zweimal in jedem Satz unter
   der Untergrenze, und die Karte schlaegt eine leichtere Stufe vor. */
describe('Vorschlag bei einer zu schweren Stufe', () => {
  async function mitZweien(reps, levels = { pushup: 2 }, lv = 2){
    const log = [1, 2].map(i => ({
      d: '2026-01-0' + i, day: 'A', ex: ['pushup'], sets: 4, lv: { pushup: lv },
      reps: Object.fromEntries(reps.map((r, s) => ['pushup-' + s, r]))
    }));
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, levels, log }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const hinweis = () => document.querySelector('[data-exid="pushup"] .zu-schwer');

  it('erscheint nach zwei Einheiten unter der Untergrenze', async () => {
    /* Stufe 2 der Liegestuetze: Knie-Liegestuetze, 4 x 8-12. */
    await mitZweien([7, 6, 6, 5]);
    expect(hinweis().textContent).toContain('8');
  });

  /* Der Knopf wird ueber seine Aktion ausgeloest, nicht per Klick – siehe
     "Gehaltene Sekunden". Geprueft wird, dass er die richtige Aktion mit
     den richtigen Daten traegt, und dass die das Richtige tut. */
  it('stuft ueber den Knopf eine Stufe ab', async () => {
    const app = await mitZweien([7, 6, 6, 5]);
    const knopf = hinweis().querySelector('button');
    expect(knopf.dataset).toMatchObject({ action: 'level:adjust', ex: 'pushup', delta: '-1' });
    await app.actions[knopf.dataset.action](knopf.dataset);
    await ruhe();
    expect(gespeichert().levels.pushup).toBe(1);
  });

  it('schweigt, wenn ein Satz die Untergrenze erreicht', async () => {
    await mitZweien([8, 6, 6, 5]);
    expect(hinweis()).toBeNull();
  });

  it('schweigt auf der leichtesten Stufe', async () => {
    await mitZweien([3, 3, 3, 3], {}, 0);
    expect(hinweis()).toBeNull();
  });
});

/* Bis v16 lief der Countdown immer auf die Obergrenze, ein vorzeitiger Tipp
   verwarf den Satz, und die Bestleistung war die Zielzeit. Stuetzhalte
   Stufe 0: 4 x 10-20 Sek, ein Fuenftel der Spanne sind 2 Sekunden. */
describe('Gehaltene Sekunden', () => {
  let jetzt;
  beforeEach(() => {
    jetzt = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => jetzt);
  });
  afterEach(() => vi.restoreAllMocks());

  /* Getippt wird ueber die Aktion, nicht ueber einen DOM-Klick. start()
     haengt die Delegation an document, und die App-Instanzen frueherer Tests
     hoeren dort weiter mit – mit ihrer eigenen Einheit, die keine Sekunden
     kennt, und in denselben Speicherschluessel. Ein echter Klick erreichte
     alle, und welche zuletzt schrieb, hing vom Timing ab: lokal gruen, in
     CI rot. */
  let app;
  /* Ein eigener Plan mit der Stuetzhalte: die Zahlen hier haengen an ihrer
     Spanne 4 x 10-20 Sek, und die Vorlagen duerfen sich aendern, ohne dass
     diese Tests es merken. */
  const MIT_STUETZE = { planId: 'custom', customPlan: { name: 'Test', days: [
    { key: 'A', title: 'A', sub: '', ex: ['support', 'pushup'] }
  ]}};
  async function einheit(stand = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, ...MIT_STUETZE, ...stand }));
    app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const tippe = s => app.actions['set:tap']({ ex: 'support', set: String(s) });
  const punkt = s => document.getElementById('set-support-' + s);
  const feld = s => document.getElementById('sek-support-' + s);
  const halte = (s, sek) => {
    tippe(s);
    jetzt += sek * 1000;
    tippe(s);
  };

  it('beginnt eine Stufe an der Untergrenze', async () => {
    await einheit();
    expect(feld(0).placeholder).toBe('10');
    tippe(0);
    expect(punkt(0).textContent).toBe('10');
  });

  it('beendet den Satz beim zweiten Tipp mit der gehaltenen Zeit', async () => {
    await einheit();
    halte(0, 7);
    await ruhe();
    expect(punkt(0).classList.contains('done')).toBe(true);
    expect(feld(0).value).toBe('7');
    expect(gespeichert().activeSession.sek['support-0']).toBe(7);
  });

  it('verwirft einen versehentlichen Doppeltipp', async () => {
    await einheit();
    halte(0, 0);
    expect(punkt(0).classList.contains('done')).toBe(false);
    expect(feld(0).value).toBe('');
  });

  it('traegt nach Ablauf die Vorgabe ein', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try{
      await einheit();
      tippe(0);
      jetzt += 10_500;
      vi.advanceTimersByTime(1000);
      expect(feld(0).value).toBe('10');
      expect(punkt(0).classList.contains('done')).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('nimmt die Zeit mit, wenn der Satz zurueckgenommen wird', async () => {
    await einheit();
    halte(0, 7);
    tippe(0);
    expect(punkt(0).classList.contains('done')).toBe(false);
    expect(feld(0).value).toBe('');
  });

  it('rechnet die naechste Vorgabe aus der gehaltenen Zeit', async () => {
    await einheit({ log: [{
      d: '2026-01-01', day: 'A', ex: ['support'], sets: 4, lv: { support: 0 },
      sek: { 'support-0': 12, 'support-1': 12, 'support-2': 11, 'support-3': 9 }
    }]});
    expect([0, 1, 2, 3].map(s => feld(s).placeholder)).toEqual(['14', '14', '13', '11']);
    const ziele = [...document.querySelectorAll('[data-exid="support"] .satz-ziel')].map(z => z.textContent);
    expect(ziele).toEqual(['Ziel 14 Sek', 'Ziel 14 Sek', 'Ziel 13 Sek', 'Ziel 11 Sek']);
  });

  it('leitet das obere Limit aus den Sekunden ab', async () => {
    await einheit();
    [0, 1, 2, 3].forEach(s => {
      feld(s).value = '20';
      app.actions['set:sek']({ key: 'support-' + s }, null, feld(s));
    });
    const label = document.getElementById('top-support');
    expect(label.classList.contains('abgeleitet')).toBe(true);
    expect(label.classList.contains('checked')).toBe(true);
  });

  it('schreibt die laengste gehaltene Zeit als Bestleistung, nicht die Zielzeit', async () => {
    await einheit();
    halte(0, 13);
    halte(1, 8);
    await app.actions['workout:finish']();
    await ruhe();
    const s = gespeichert();
    expect(s.prs.support).toMatchObject({ n: 13, art: 'sek' });
    expect(s.log[0].sek).toEqual({ 'support-0': 13, 'support-1': 8 });
  });
});

/* Als meistgeuebte Uebung stand dort die Handgelenks-Routine – das
   Aufwaermen, das an jedem Drucktag dabei ist. */
describe('Jahresrueckblick ohne Aufwaermen', () => {
  it('nennt keine Mobility als meistgeuebte Uebung und zaehlt die Haltezeit', async () => {
    const jahr = heuteLokal().slice(0, 4);
    const e = (tag, ex) => ({ d: jahr + '-01-0' + tag, day: 'A', sets: 4, ex,
      reps: { 'pushup-0': 10 }, sek: { 'support-0': 90, 'support-1': 90 } });
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, log: [
      e(1, ['wrist_prep', 'pushup']), e(2, ['wrist_prep', 'pushup']), e(3, ['wrist_prep', 'support'])
    ]}));
    const app = await starten();
    app.actions['tab:show']({ tab: 'history' });
    await ruhe();
    const text = document.getElementById('yearReview').textContent;
    expect(text).toContain('Liegestütze');
    expect(text).not.toContain('Handgelenk');
    /* 3 × 180 Sekunden = 9 Minuten. */
    expect(text).toContain('9 Min');
  });
});

/* Ein Tipp hiess bisher nur "erledigt"; die Zahl musste man zusaetzlich
   eintippen. Jetzt traegt er in einen leeren Satz die heutige Vorgabe ein. */
describe('Tipp traegt die Vorgabe ein', () => {
  const reps = (...n) => Object.fromEntries(n.map((w, i) => ['pushup-' + i, w]));
  /* Ueber die Aktion statt per Klick – siehe "Gehaltene Sekunden". */
  let app;
  async function einheit(log = []){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, log }));
    app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const feld = s => document.getElementById('rep-pushup-' + s);
  const punkt = s => document.getElementById('set-pushup-' + s);
  const tippe = s => app.actions['set:tap']({ ex: 'pushup', set: String(s) });
  const letzte = (werte, lv) => [{ d: '2026-01-10', day: 'A', ex: ['pushup'], sets: 4, reps: reps(...werte), lv }];

  it('zeigt die Vorgabe als Platzhalter', async () => {
    await einheit(letzte([8, 8, 7, 7], { pushup: 0 }));
    expect([0, 1, 2, 3].map(s => feld(s).placeholder)).toEqual(['9', '9', '8', '8']);
  });

  it('traegt sie beim Abhaken eines leeren Satzes ein', async () => {
    await einheit(letzte([8, 8, 7, 7], { pushup: 0 }));
    tippe(2);
    await ruhe();
    expect(feld(2).value).toBe('8');
    expect(gespeichert().activeSession.reps['pushup-2']).toBe(8);
  });

  it('nimmt ohne Vorgeschichte die Untergrenze', async () => {
    await einheit();
    tippe(0);
    /* Liegestuetze Stufe 0: 4 x 6-10. */
    expect(feld(0).value).toBe('6');
  });

  it('laesst eine eingetippte Zahl stehen', async () => {
    await einheit(letzte([8, 8, 7, 7], { pushup: 0 }));
    feld(0).value = '12';
    app.actions['set:reps']({ key: 'pushup-0' }, null, feld(0));
    tippe(0);
    expect(feld(0).value).toBe('12');
  });

  it('traegt nichts ein, wenn die letzte Einheit ihre Stufe nicht kennt', async () => {
    await einheit(letzte([8, 8, 7, 7]));
    tippe(0);
    expect(feld(0).value).toBe('');
    expect(punkt(0).classList.contains('done')).toBe(true);
  });

  it('macht das obere Limit damit ableitbar', async () => {
    await einheit(letzte([10, 10, 10, 10], { pushup: 0 }));
    [0, 1, 2, 3].forEach(s => tippe(s));
    const label = document.getElementById('top-pushup');
    expect(label.classList.contains('abgeleitet')).toBe(true);
    expect(label.classList.contains('checked')).toBe(true);
  });
});

/* Die Karte hatte 17 Zeilen. Was man nicht in jedem Satz braucht, steht
   jetzt hinter "Mehr". */
describe('Bereich Mehr auf der Karte', () => {
  async function einheit(stand = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, ...stand }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const mehr = () => document.querySelector('[data-exid="pushup"] details.ex-mehr');

  it('ist zu und enthaelt Notiz, Tipps, Ersetzen, Auslassen und Verlauf', async () => {
    await einheit();
    expect(mehr().open).toBe(false);
    for(const sel of ['.note-input', '[data-action="tips:toggle"]', '[data-action="exercise:substitute"]',
      '[data-action="exercise:skip"]', '[data-action="exercise:history"]']){
      expect(mehr().querySelector(sel), sel).not.toBeNull();
    }
  });

  it('laesst die Saetze und das obere Limit draussen', async () => {
    await einheit();
    expect(mehr().querySelector('.sets, .toplimit')).toBeNull();
  });

  it('steht offen, solange eine Notiz darin steht', async () => {
    const app = await einheit();
    const feld = document.getElementById('note-pushup');
    feld.value = 'Ellbogen enger';
    app.actions['note:set']({ ex: 'pushup' }, null, feld);
    app.actions['level:adjust']({ ex: 'pushup', delta: '1' });
    await ruhe();
    expect(mehr().open).toBe(true);
  });

  it('bleibt nach einem Neuzeichnen offen, wenn man ihn geoeffnet hat', async () => {
    const app = await einheit();
    mehr().open = true;
    mehr().dispatchEvent(new window.Event('toggle'));
    app.actions['level:adjust']({ ex: 'pushup', delta: '1' });
    await ruhe();
    expect(mehr().open).toBe(true);
  });
});

/* Vorlagen passen sich der Ausruestung an, statt Nichtmachbares zu zeigen. */
describe('Vorlage fuer die eigene Ausruestung', () => {
  it('ersetzt ohne Geraet die Dips in Tag A', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, equipment: [] }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    const karten = [...document.querySelectorAll('#content .ex')].map(k => k.dataset.exid);
    expect(karten).not.toContain('dips');
    expect(karten).toContain('diamond');
  });

  it('laesst die Vorlage mit voller Ausruestung unveraendert', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    const karten = [...document.querySelectorAll('#content .ex')].map(k => k.dataset.exid);
    expect(karten).toContain('dips');
  });
});

describe('Wochenbilanz im Plan-Tab', () => {
  const zeilen = () => [...document.querySelectorAll('#planBilanz .bil-row')];
  const warnungen = () => [...document.querySelectorAll('#planBilanz .bil-warn li')].map(li => li.textContent);

  it('zeigt Saetze und Tage je Muskelgruppe und warnt bei Luecken', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 16, onboarded: true, planId: 'custom',
      customPlan: { name: 'Nur Druecken', desc: '', days: [
        { key: 'A', title: 'A', sub: '', ex: ['pushup', 'dips'] },
        { key: 'B', title: 'B', sub: '', ex: ['pushup', 'squat'] }] }
    }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    expect(zeilen().length).toBe(4);
    expect(zeilen()[0].textContent).toMatch(/Drücken.*Sätze · 4×/);
    expect(warnungen().join(' ')).toMatch(/Ziehen fehlt ganz/);
    expect(warnungen().join(' ')).toMatch(/Hüftbeuge/);
    expect(zeilen()[1].classList.contains('warn')).toBe(true);
  });

  it('richtet sich nach dem Wochenrhythmus, sobald es einen gibt', async () => {
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true }));
    const app = await starten();
    app.actions['tab:show']({ tab: 'plan' });
    await ruhe();
    expect(document.querySelector('#planBilanz .bil-kopf').textContent).toMatch(/4× Training.*Wochenziel/);
    await app.actions['weekplan:set']({ wd: '1' }, null, { value: 'A' });
    await ruhe();
    expect(document.querySelector('#planBilanz .bil-kopf').textContent).toMatch(/1× Training.*Wochenrhythmus/);
  });
});

describe('Plan-Check nach Fortschritt', () => {
  let OBEN = 0;
  beforeEach(async () => {
    const { EX_BY_ID } = await import('../js/exercises.js');
    OBEN = EX_BY_ID.pushup.levels.length - 1;
  });
  const banner = () => [...document.querySelectorAll('#banners .banner')].find(b => /Plan-Vorschlag/.test(b.textContent));
  async function mitStand(extra = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 16, onboarded: true, planId: 'ab4', levels: { pushup: OBEN }, ...extra }));
    return starten();
  }

  it('bietet fuer ausgereizte Liegestuetze die Archer-Liegestuetze an', async () => {
    await mitStand();
    expect(banner().textContent).toMatch(/Ausgereizt: Liegestütze.*Nächste Stufe: Archer/);
  });

  it('ersetzt die Uebung im Plan und macht daraus einen eigenen', async () => {
    const app = await mitStand();
    await app.actions['planCheck:apply']({ alt: 'pushup', neu: 'archer_push' });
    await ruhe();
    const s = gespeichert();
    expect(s.customPlan.days[0].ex).toContain('archer_push');
    expect(s.customPlan.days[0].ex).not.toContain('pushup');
    expect(banner()?.textContent || '').not.toMatch(/Archer/);
  });

  it('merkt sich ein Beibehalten ueber das Neuladen hinaus', async () => {
    const app = await mitStand();
    await app.actions['planCheck:dismiss']({ alt: 'pushup', neu: 'archer_push' });
    await ruhe();
    expect(gespeichert().planHinweiseAus).toEqual(['pushup>archer_push']);
    expect(gespeichert().customPlan).toBeFalsy();
    await starten();
    expect(banner()?.textContent || '').not.toMatch(/Archer/);
  });

  it('nimmt keinen Tausch an, den der Check nicht vorschlaegt', async () => {
    const app = await mitStand();
    await app.actions['planCheck:apply']({ alt: 'pushup', neu: 'planche' });
    await app.actions['planCheck:dismiss']({ alt: 'gibtsnicht', neu: 'archer_push' });
    await ruhe();
    expect(gespeichert().customPlan).toBeFalsy();
    expect(gespeichert().planHinweiseAus || []).toEqual([]);
  });

  it('schweigt waehrend einer laufenden Einheit', async () => {
    await mitStand();
    document.querySelector('.day-btn').click();
    await ruhe();
    expect(banner()).toBeUndefined();
  });
});

describe('Anstrengung erfassen', () => {
  async function einheit(extra = {}){
    localStorage.setItem(SPEICHER, JSON.stringify({ v: 17, onboarded: true, ...extra }));
    const app = await starten();
    app.actions['day:select']({ key: 'A' });
    await ruhe();
    return app;
  }
  const knopf = (id, v) => document.querySelector('.effort-btn[data-ex="' + id + '"][data-v="' + v + '"]');
  function tippe(app, id, werte){
    werte.forEach((w, s) => {
      const f = document.getElementById('rep-' + id + '-' + s);
      f.value = String(w);
      app.actions['set:reps']({ key: id + '-' + s }, null, f);
    });
  }
  const saetze = id => document.querySelectorAll('[data-exid="' + id + '"] .rep-input').length;
  const oben = id => Number(document.querySelector('[data-exid="' + id + '"] .ex-target').textContent.split('–')[1]);

  it('merkt sich die Angabe in der laufenden Einheit und nimmt sie beim zweiten Tipp zurueck', async () => {
    const app = await einheit();
    expect(knopf('pushup', 'l').getAttribute('aria-pressed')).toBe('false');
    app.actions['effort:set']({ ex: 'pushup', v: 'l' });
    await ruhe();
    expect(knopf('pushup', 'l').getAttribute('aria-pressed')).toBe('true');
    expect(gespeichert().activeSession.an).toEqual({ pushup: 'l' });
    app.actions['effort:set']({ ex: 'pushup', v: 'l' });
    await ruhe();
    expect(gespeichert().activeSession.an).toEqual({});
    /* Unbekannte Werte und Uebungen aendern nichts. */
    app.actions['effort:set']({ ex: 'pushup', v: 'x' });
    app.actions['effort:set']({ ex: 'gibtsnicht', v: 'l' });
    expect(gespeichert().activeSession.an).toEqual({});
  });

  it('schreibt sie ins Log', async () => {
    const app = await einheit();
    tippe(app, 'pushup', Array(saetze('pushup')).fill(5));
    app.actions['effort:set']({ ex: 'pushup', v: 'h' });
    await app.actions['workout:finish']();
    await ruhe();
    expect(gespeichert().log[0].an).toEqual({ pushup: 'h' });
  });

  it('laesst die Vorgabe nach "leicht" doppelt steigen und sagt warum', async () => {
    await einheit({
      levels: { pushup: 3 },
      log: [{ d: '2026-01-01', day: 'A', ex: ['pushup'], sets: 3, tops: 0, ups: [], reps: { 'pushup-0': 6, 'pushup-1': 6, 'pushup-2': 6 }, lv: { pushup: 3 }, an: { pushup: 'l' } }]
    });
    expect(document.getElementById('rep-pushup-0').placeholder).toBe('8');
    expect(document.querySelector('[data-exid="pushup"] .heute').textContent).toMatch(/leicht/);
  });

  it('steigt oben und leicht sofort auf, ohne die zweite Einheit abzuwarten', async () => {
    const app = await einheit();
    const vorher = gespeichert() ? (gespeichert().levels || {}).pushup || 0 : 0;
    tippe(app, 'pushup', Array(saetze('pushup')).fill(oben('pushup')));
    app.actions['effort:set']({ ex: 'pushup', v: 'l' });
    await app.actions['workout:finish']();
    await ruhe();
    expect(gespeichert().levels.pushup).toBe(vorher + 1);
    expect(gespeichert().log[0].ups).toContain('pushup');
  });

  it('wartet oben ohne Angabe weiter auf die Serie', async () => {
    const app = await einheit();
    tippe(app, 'pushup', Array(saetze('pushup')).fill(oben('pushup')));
    await app.actions['workout:finish']();
    await ruhe();
    expect(gespeichert().log[0].ups).not.toContain('pushup');
    expect(gespeichert().streaks.pushup).toBe(1);
  });
});

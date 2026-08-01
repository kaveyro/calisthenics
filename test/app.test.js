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
    expect(s.v).toBe(8);
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
      dayKey: 'A', d: new Date().toISOString().slice(0, 10), tab: 'anderes',
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
  const HIER = { d: '2026-07-30', day: 'A', sets: 12, tops: 1, ups: [], ex: ['pushup'], reps: {} };
  const DORT = { d: '2026-07-20', day: 'A', sets: 8, tops: 0, ups: [], ex: ['pushup'], reps: {} };

  async function importieren(wahl){
    localStorage.setItem(SPEICHER, JSON.stringify({
      v: 7, workouts: 1, lastDate: '2026-07-30', log: [HIER], levels: { pushup: 5 }
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
    expect(s.log.map(l => l.d)).toEqual(['2026-07-20', '2026-07-30']);
    /* Die weitere Stufe gewinnt – sonst kostet ein altes Backup Fortschritt. */
    expect(s.levels.pushup).toBe(5);
  });

  it('ersetzt weiterhin, wenn man es verlangt', async () => {
    const s = await importieren('Ersetzen');
    expect(s.log.map(l => l.d)).toEqual(['2026-07-20']);
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

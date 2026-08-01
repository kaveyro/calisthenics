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
    expect(s.v).toBe(9);
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
    const d = new Date(); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
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

  async function tagUndAufwaermen(){
    const app = await starten();
    document.querySelector('.day-btn').click();
    await ruhe();
    return app;
  }

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
    const app = await tagUndAufwaermen();
    /* Alles ausser dem Pflichtpunkt (Index 3). */
    punkte().forEach((p, i) => { if(i !== 3) p.click(); });
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
    const app = await tagUndAufwaermen();
    punkte().forEach((p, i) => { if(i !== 3) p.click(); });
    wiederholungsPunkte()[0].click();
    await ruhe();

    const fertig = app.actions['workout:finish']();
    await ruhe();
    document.querySelector('.overlay.open [data-dlg=ok]').click();
    await fertig;
    await ruhe();
    expect(gespeichert().log).toHaveLength(1);
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
    const heute = new Date().toISOString().slice(0, 10);
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

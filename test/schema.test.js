import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_STATE, SETTINGS_DEFAULTS } from '../js/domain/state.js';

/* Die Falle, die viermal zugeschnappt ist.

   migrateState() kopiert ausschliesslich die Felder aus DEFAULT_STATE, und
   die Einstellungen ausschliesslich die aus SETTINGS_DEFAULTS. Das ist die
   Regel, mit der v5 tote Felder losgeworden ist – sie wirft aber genauso
   unbekannte weg. Wer ein Feld schreibt, ohne es dort einzutragen, verliert
   es beim naechsten Laden, und zwar still: kein Fehler, keine Warnung, der
   Wert ist einfach nicht mehr da.

   So verschwanden customMilestones (ein selbst gesetztes Ziel),
   deloadPlateauDismissed (ein weggeklicktes Banner) und settings.reminder
   (die Trainingserinnerung, die deshalb nie ueber eine Sitzung hinaus
   funktioniert hat).

   Dieser Test liest den Quelltext statt den Ablauf: jeder Zugriff auf
   state.X in app.js und jede Einstellung, die die App liest oder das Markup
   schreibt, muss in der jeweiligen Vorgabe stehen. Grob, aber es haette alle
   drei vorher gefunden.

   Bewusst nur diese Richtung: ein Feld zu finden, das NIEMAND mehr liest
   (wie byDay bis v11), braeuchte eine Suche ueber beliebige
   Variablennamen – out.x, a.x, b.x in den Domain-Modulen – und die liefert
   zu viele falsche Treffer, um als Zusicherung zu taugen. */

const ROOT = join(process.cwd(), '.');
/* Kommentare raus: sie nennen Felder, die es nicht (mehr) gibt, und genau
   das sollen sie duerfen. */
const ohneKommentare = t => t.replace(/\/\*[\s\S]*?\*\//g, '');
const APP = ohneKommentare(readFileSync(join(ROOT, 'js/app.js'), 'utf8'));
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

const treffer = (text, muster) => new Set([...text.matchAll(muster)].map(m => m[1]));

describe('Jedes geschriebene Feld steht im Schema', () => {
  it('kennt jedes state.X, das app.js anfasst', () => {
    /* Nicht nach '.' oder '/': e.state.tab ist der History-Zustand des
       Browsers und './domain/state.js' ein Pfad, keiner von beiden ein Feld. */
    const benutzt = treffer(APP, /(?<![\w./'"-])state\.([A-Za-z_]\w*)/g);
    const bekannt = new Set(Object.keys(DEFAULT_STATE()));
    const fehlend = [...benutzt].filter(f => !bekannt.has(f)).sort();
    expect(fehlend).toEqual([]);
    /* Sicherung gegen einen Ausdruck, der nichts mehr findet und deshalb
       immer gruen ist. */
    expect(benutzt.size).toBeGreaterThan(20);
  });

  it('kennt jede Einstellung, die gelesen oder geschaltet wird', () => {
    const benutzt = new Set([
      ...treffer(APP, /(?<![\w.])cfg\('([A-Za-z_]\w*)'\)/g),
      ...treffer(APP, /state\.settings\.([A-Za-z_]\w*)/g),
      /* Der Schalter im Markup schreibt ueber data-key in die Einstellungen. */
      ...treffer(HTML, /data-key="([A-Za-z_]\w*)"/g)
    ]);
    const bekannt = new Set(Object.keys(SETTINGS_DEFAULTS));
    const fehlend = [...benutzt].filter(k => !bekannt.has(k)).sort();
    expect(fehlend).toEqual([]);
    expect(benutzt.size).toBeGreaterThan(8);
  });

  it('haelt jeden Schalter im Markup und jede Vorgabe deckungsgleich', () => {
    /* Andere Richtung, hier tragfaehig: eine Einstellung, die es in der
       Vorgabe gibt, aber nirgends zu schalten, waere tote Einrichtung. */
    const imMarkup = treffer(HTML, /data-key="([A-Za-z_]\w*)"/g);
    const ohneSchalter = Object.keys(SETTINGS_DEFAULTS).filter(k => !imMarkup.has(k)).sort();
    expect(ohneSchalter).toEqual([]);
  });
});

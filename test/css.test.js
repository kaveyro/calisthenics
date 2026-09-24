import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(process.cwd(), 'css/style.css'), 'utf8');
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');

describe('CSS-Konsistenz', () => {
  it('definiert .btn global (nicht nur in .data-btns)', () => {
    // Der Bug: .btn war nur als .data-btns .btn definiert.
    // Jetzt muss .btn allein (ohne Parent-Selektor) existieren.
    expect(css).toMatch(/^\.btn\s*\{/m);
    expect(css).not.toMatch(/^\.data-btns\s+\.btn\s*\{/m);
  });

  it('definiert .btn--standalone fuer alleinstehende Buttons', () => {
    expect(css).toMatch(/^\.btn--standalone\s*\{/m);
  });

  it('definiert .icon-btn mit 44px (WCAG 2.5.8)', () => {
    expect(css).toMatch(/\.icon-btn\s*\{[^}]*width:44px/);
    expect(css).toMatch(/\.icon-btn\s*\{[^}]*height:44px/);
  });

  it('definiert CSS-Variablen fuer Volumen-Segmentfarben', () => {
    expect(css).toMatch(/--vol-core:/);
    expect(css).toMatch(/--vol-skill:/);
    expect(css).toMatch(/--vol-mobility:/);
  });

  it('nutzt die Variablen in den .vol-* Klassen', () => {
    expect(css).toMatch(/\.vol-core\s*\{background:var\(--vol-core\)/);
    expect(css).toMatch(/\.vol-skill\s*\{background:var\(--vol-skill\)/);
    expect(css).toMatch(/\.vol-mobility\s*\{background:var\(--vol-mobility\)/);
  });

  it('hat vereinheitlichte Fokus-Ringe (3px solid var(--accent))', () => {
    // Frueher waren es 2px und 3px gemischt – jetzt einheitlich 3px.
    const twoPx = (css.match(/outline:2px solid var\(--accent\)/g) || []).length;
    const threePx = (css.match(/outline:3px solid var\(--accent\)/g) || []).length;
    expect(threePx).toBeGreaterThan(twoPx);
  });

  it('definiert .modal--narrow (ersetzt Inline-Style)', () => {
    expect(css).toMatch(/\.modal--narrow\s*\{/m);
  });

  it('definiert .roadmap-item und .roadmap-head (ersetzt Inline-Styles)', () => {
    expect(css).toMatch(/\.roadmap-item\s*\{/m);
    expect(css).toMatch(/\.roadmap-head\s*\{/m);
  });

  it('definiert .meas-col und .meas-input (ersetzt Inline-Styles)', () => {
    expect(css).toMatch(/\.meas-col\s*\{/m);
    expect(css).toMatch(/\.meas-input\s*\{/m);
  });

  it('definiert .clickable (ersetzt style="cursor:pointer")', () => {
    expect(css).toMatch(/\.clickable\s*\{cursor:pointer\}/m);
  });

  it('definiert .tips--inline (ersetzt Inline-Style)', () => {
    expect(css).toMatch(/\.tips--inline\s*\{/m);
  });

  it('definiert .empty-hint--full (ersetzt Inline-Style)', () => {
    expect(css).toMatch(/\.empty-hint--full\s*\{/m);
  });

  it('laesst das <select> in .inline-row schrumpfen', () => {
    // Ohne min-width:0 ist ein <select> als Flex-Kind so breit wie seine
    // laengste Option. Im Plan-Editor hat das die Zeile ueber die Karte
    // hinausgeschoben – der Hinzufuegen-Knopf lag auf dem Handy neben dem
    // Bildschirm. Der Knopf selbst bleibt flex:none, damit er nicht
    // stattdessen schrumpft.
    expect(css).toMatch(/^\.inline-row select\{[^}]*min-width:0/m);
    expect(css).toMatch(/^\.inline-row button\{[^}]*flex:none/m);
  });

  it('laesst .inline-row umbrechen statt ueberlaufen', () => {
    // Die Messwert-Zeile traegt vier Zahlenfelder und einen Knopf. Auf 375px
    // blieben den Feldern 31, 31, 24 und 82 Pixel, und der Knopf stand ueber
    // dem Rand der Karte. Mit Umbruch bleiben die Felder brauchbar breit.
    expect(css).toMatch(/^\.inline-row\{[^}]*flex-wrap:wrap/m);
    expect(css).toMatch(/^\.meas-col\{flex:1 1 70px\}/m);
  });

  it('hat --ink-soft mit verbessertem Kontrast (dunkler als #5A6068)', () => {
    // #4A5058 ist dunkler als #5A6068 → besserer Kontrast auf --bg
    expect(css).toMatch(/--ink-soft:#4A5058/);
  });
});

describe('HTML-Konsistenz', () => {
  it('bindet theme-init.js vor dem Stylesheet ein', () => {
    const scriptPos = html.indexOf('js/theme-init.js');
    const cssPos = html.indexOf('css/style.css');
    expect(scriptPos).toBeGreaterThan(0);
    expect(cssPos).toBeGreaterThan(0);
    expect(scriptPos).toBeLessThan(cssPos);
  });

  it('verwendet btn--standalone fuer alleinstehende Buttons', () => {
    expect(html).toContain('btn--standalone');
  });

  it('hat einen Jahresrueckblick-Container', () => {
    expect(html).toContain('id="yearReview"');
  });

  it('hat einen Eigener-Meilenstein-Button', () => {
    expect(html).toContain('data-action="milestone:add"');
  });

  it('hat eine Reminder-Checkbox in den Einstellungen', () => {
    expect(html).toContain('id="cfg-reminder"');
    expect(html).toContain('data-key="reminder"');
  });
});

/* Der Befund, der diese Runde ausgeloest hat: bei 1600px Fensterbreite nutzte
   die App 660 Pixel – 41 % – und liess links und rechts je 470 leer. Es gab
   keinen einzigen min-width-Breakpoint; es war kein zu schmales
   Desktop-Layout, sondern gar keines. Diese Tests halten fest, dass die
   Breiten an EINER Stelle stehen und der Breakpoint existiert. */
describe('Layout auf breiten Schirmen', () => {
  it('haelt die Inhaltsbreite als Variable, nicht als Zahl an zwei Stellen', () => {
    expect(css).toMatch(/--inhalt-max:\s*660px/);
    expect(css).toMatch(/\.wrap\{[^}]*max-width:var\(--inhalt-max\)/);
    /* Die Abschlussleiste musste frueher von Hand auf demselben Wert
       gehalten werden – dort standen die 660 ein zweites Mal. */
    expect(css).toMatch(/\.finish-bar \.inner\{[^}]*max-width:var\(--inhalt-max\)/);
    /* Und nirgends sonst mehr als rohe Zahl. */
    expect(css).not.toMatch(/max-width:660px/);
  });

  it('hat einen Breakpoint nach oben, nicht nur nach unten', () => {
    expect(css).toMatch(/@media\(min-width:1040px\)/);
  });

  it('macht .wrap ab 1040px zum Raster mit Schiene und Inhalt', () => {
    const block = css.split('@media(min-width:1040px){')[1];
    expect(block).toBeTruthy();
    expect(block).toContain('grid-template-columns:var(--schiene) minmax(0,1fr)');
    /* minmax(0,1fr) statt 1fr: sonst setzt der min-content-Wert der
       Inhaltsspalte die Untergrenze und drueckt die Schiene zusammen. */
    expect(block).not.toMatch(/grid-template-columns:var\(--schiene\) 1fr/);
    expect(block).toContain('--schiene:232px');
  });

  it('laesst die Schiene auf schmalen Schirmen breitenlos', () => {
    /* 0px heisst: alle Rechnungen damit ergeben unveraendert den alten
       Zustand, ohne dass irgendwo eine Fallunterscheidung noetig waere. */
    expect(css).toMatch(/--schiene:0px/);
  });

  it('klammert Kennzahlen und Navigation im Markup zusammen', () => {
    expect(html).toContain('<div class="schiene">');
    const schiene = html.split('<div class="schiene">')[1].split('</nav>')[0];
    expect(schiene).toContain('id="stats"');
    expect(schiene).toContain('class="tabs"');
  });
});
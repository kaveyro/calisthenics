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
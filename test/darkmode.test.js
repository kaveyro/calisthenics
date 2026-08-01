import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
const css = readFileSync(join(process.cwd(), 'css/style.css'), 'utf8');

/* Dark-Mode-Smoke-Test: prueft, dass das Dark-Theme alle noetigen Variablen
   ueberschreibt und keine hartkodierten Farben uebrig bleiben, die im Dark
   Mode unlesbar waeren. */

describe('Dark-Mode-Smoke-Test', () => {
  it('definiert html[data-theme="dark"] mit allen Farbvariablen', () => {
    expect(css).toMatch(/html\[data-theme="dark"\]/);
    expect(css).toMatch(/--bg:#14161A/);
    expect(css).toMatch(/--card:#1E2126/);
    expect(css).toMatch(/--ink:#ECEDEA/);
    expect(css).toMatch(/--accent:#8FA3FF/);
  });

  it('hat keine hartkodierte helle Hintergrundfarbe ohne Dark-Override', () => {
    // .btn muss var(--accent) als Hintergrund nutzen, nicht #2547D0 direkt
    const btnMatch = css.match(/^\.btn\s*\{([^}]+)\}/m);
    expect(btnMatch).toBeTruthy();
    expect(btnMatch[1]).toContain('var(--accent)');
    expect(btnMatch[1]).not.toContain('#2547D0');
  });

  it('nutzt CSS-Variablen statt hartkodierter Farben in .vol-* Klassen', () => {
    // Frueher: .vol-core{background:#7A5CC4} – jetzt: var(--vol-core)
    expect(css).toMatch(/\.vol-core\s*\{background:var\(--vol-core\)\}/);
    expect(css).not.toMatch(/\.vol-core\s*\{background:#7A5CC4\}/);
  });

  it('hat theme-init.js fuer flackerfreien Dark-Mode-Start', () => {
    expect(html).toContain('js/theme-init.js');
    // Muss vor dem Stylesheet stehen
    const scriptPos = html.indexOf('js/theme-init.js');
    const cssPos = html.indexOf('css/style.css');
    expect(scriptPos).toBeLessThan(cssPos);
  });

  it('hat <html data-theme="light"> als Vorgabe (wird von theme-init.js ersetzt)', () => {
    expect(html).toMatch(/<html[^>]*data-theme="light"/);
  });

  it('ueberschreibt --vol-* im Dark Theme', () => {
    const darkBlock = css.match(/html\[data-theme="dark"\]\s*\{([^}]+)\}/);
    expect(darkBlock).toBeTruthy();
    expect(darkBlock[1]).toContain('--vol-core');
    expect(darkBlock[1]).toContain('--vol-skill');
    expect(darkBlock[1]).toContain('--vol-mobility');
  });

  it('hat .btn--standalone damit alleinstehende Buttons nicht zu breit werden', () => {
    expect(css).toMatch(/\.btn--standalone\s*\{[^}]*max-width:280px/);
  });

  it('definiert .btn.secondary mit Theme-Variablen (nicht hartkodiert)', () => {
    const secMatch = css.match(/\.btn\.secondary\s*\{([^}]+)\}/);
    expect(secMatch).toBeTruthy();
    expect(secMatch[1]).toContain('var(--bg)');
    expect(secMatch[1]).toContain('var(--ink)');
    expect(secMatch[1]).toContain('var(--line)');
  });
});
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
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
    expect(css).toMatch(/\.finish-bar \.inner\{[^}]*max-width:calc\(var\(--inhalt-max\) - 2 \* var\(--abstand-4\)\)/);
    /* Und .wrap zieht denselben Innenabstand ab – sonst stuenden die beiden
       wieder um 16px auseinander. */
    expect(css).toMatch(/\.wrap\{[^}]*padding:0 var\(--abstand-4\)/);
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

  /* Die mehrspaltigen Regeln duerfen nur auf breiten Schirmen greifen. Ein
     .raster ausserhalb des Blocks machte das Handy-Layout zweispaltig. */
  it('schaltet das Raster nur ab 1040px ein', () => {
    const ausserhalb = css.split('@media(min-width:1040px){')[0];
    expect(ausserhalb).not.toMatch(/\.raster\{/);
    expect(css).toMatch(/\.raster\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(var\(--spalte\),1fr\)\)/);
  });

  /* Der Kniff gegen die Luecke: der Ueberhang eines spannenden Panels
     fliesst in die flexible letzte Zeile. Mit auto-Zeilen stuende er als
     Luecke zwischen den gestapelten Panels. */
  it('laesst den Ueberhang langer Panels in die letzte Zeile fliessen', () => {
    expect(css).toMatch(/\.panel--lang\{grid-row:span 2\}/);
    expect(css).toMatch(/\.raster--verlauf\{grid-template-rows:auto auto auto 1fr\}/);
    expect(css).toMatch(/\.raster--ziele\{grid-template-rows:auto 1fr\}/);
  });

  /* Die Suche blendet Bibliothekseintraege ueber das hidden-Attribut aus.
     Ein display in der Kachelregel wuerde es aushebeln, und die Suche
     faende scheinbar nichts mehr. */
  it('ruehrt an den Bibliothekskacheln kein display an', () => {
    const regel = css.match(/\.raster > \.lib-item,[^{]*\{[^}]*\}/);
    expect(regel).toBeTruthy();
    expect(regel[0]).not.toMatch(/display:/);
  });

  it('haengt die Rasterklasse an alle mehrspaltigen Bereiche', () => {
    expect(html).toMatch(/id="content" class="raster"/);
    expect(html).toMatch(/id="planEditor" class="raster"/);
    expect(html).toMatch(/class="card raster" id="libList"/);
    expect(html).toContain('class="raster raster--verlauf"');
    expect(html).toContain('class="raster raster--ziele"');
  });

  /* Die Zeilenvorlage des Verlaufs haengt an der Zahl der Panels vor der
     Trainingsliste. Bei zwei Spalten muss sie UNGERADE sein, sonst begaenne
     die Liste links in einer neuen Zeile statt rechts neben dem letzten
     kurzen Panel. Und die Vorlage braucht so viele auto-Zeilen, wie die
     Panels davor belegen, gefolgt von der flexiblen.

     Hergeleitet statt als feste Zahl: kommt ein Panel dazu, sagt der Test
     genau, welche Vorlage jetzt stimmen wuerde. */
  it('haelt die Zeilenvorlage des Verlaufs mit dem Markup deckungsgleich', () => {
    const verlauf = html.split('class="raster raster--verlauf"')[1].split('</section>')[0];
    const davor = verlauf.split('panel--lang')[0].match(/class="panel"/g).length;
    expect(davor % 2).toBe(1);
    const erwartet = 'auto '.repeat(Math.ceil(davor / 2)) + '1fr';
    expect(css).toContain('.raster--verlauf{grid-template-rows:' + erwartet + '}');
  });

  it('stellt in den Zielen das lange Panel an den Anfang', () => {
    const ziele = html.split('class="raster raster--ziele"')[1];
    expect(ziele.indexOf('class="panel panel--lang"')).toBeLessThan(ziele.indexOf('class="panel"'));
  });

  it('klammert Kennzahlen und Navigation im Markup zusammen', () => {
    expect(html).toContain('<div class="schiene">');
    const schiene = html.split('<div class="schiene">')[1].split('</nav>')[0];
    expect(schiene).toContain('id="stats"');
    expect(schiene).toContain('class="tabs"');
  });
});
/* Vorher standen 17 verschiedene Schriftgroessen zwischen 9 und 20px im
   Regelwerk, viele einen halben Pixel auseinander. Die Skala hat sechs
   Stufen; eine neue Regel mit roher Pixelgroesse waere der erste Schritt
   zurueck. Die zwei Ausnahmen sind benannt und begruendet. */
/* Bei 320px ragte die Kopfzeile 16px ueber den Rand: Wortmarke (212px bei
   26px Schrift), Abstand (12px) und zwei Knoepfe (96px) in 288px. Gemessen
   im Browser; hier steht, was die Messung traegt. */
describe('Kopfzeile auf schmalen Schirmen', () => {
  const block = css.match(/@media\(max-width:351px\)\{([\s\S]*?)\n\}/);

  it('verkleinert unter 352px die Wortmarke', () => {
    expect(block).not.toBeNull();
    const fs = block[1].match(/h1\s*\{[^}]*font-size:([0-9.]+)vw/);
    expect(fs).not.toBeNull();
    /* 320px Viewport: die Wortmarke braucht je Pixel Schrift rund 8.15px
       Breite und hat 180px. */
    const px = 320 * Number(fs[1]) / 100;
    expect(px * 8.15).toBeLessThanOrEqual(180);
  });

  it('laesst die Knoepfe in Ruhe – sie sind Touch-Ziele', () => {
    expect(block[1]).not.toMatch(/icon-btn/);
  });
});

/* Punkte und Felder standen abwechselnd in einer umbrechenden Reihe; bei
   vier Saetzen stand "3" am Zeilenende und sein Feld darunter. */
/* Symbole kommen aus einem Sprite in index.html (ikon() in app.js). Ein
   Tippfehler im Namen ergaebe ein leeres Kaestchen und keinen Fehler. */
/* Die Kategorie-Farben tragen den 11-px-Text im Chip, also gilt 4,5:1
   (WCAG 1.4.3) gegen die Kartenflaeche – in beiden Themen. */
describe('Kategorie-Farben', () => {
  const lum = hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const kontrast = (a, b) => { const [h, d] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (d + 0.05); };
  const block = sel => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)));
  const wert = (b, name) => (b.match(new RegExp('--' + name + ':(#[0-9A-Fa-f]{6})')) || [])[1];

  /* Text auf Akzent- und Warnflaechen. Im Dunkeln stand dort Weiss auf
     dem hellen Akzent #8FA3FF – 2,4:1. */
  for(const [thema, sel] of [['hell', ':root{'], ['dunkel', 'html[data-theme="dark"]{']]){
    it('Text auf Akzent und Warnung haelt 4,5:1 (' + thema + ')', () => {
      const b = block(sel);
      for(const flaeche of ['accent', 'warn']){
        expect(kontrast(wert(b, 'on-accent'), wert(b, flaeche)), thema + ' ' + flaeche).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('setzt keinen festen weissen Text mehr auf farbige Flaechen', () => {
    expect(css).not.toMatch(/color:#fff(?![0-9a-f])/i);
  });

  for(const [thema, sel] of [['hell', ':root{'], ['dunkel', 'html[data-theme="dark"]{']]){
    it('halten 4,5:1 gegen die Karte (' + thema + ')', () => {
      const b = block(sel);
      const karte = wert(b, 'card');
      expect(karte).toBeTruthy();
      for(const kat of ['push', 'pull', 'legs', 'core', 'skill', 'mobility']){
        const farbe = wert(b, 'vol-' + kat);
        expect(farbe, kat).toBeTruthy();
        expect(kontrast(farbe, karte), thema + ' ' + kat).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

/* Unter 1040px steht die Tableiste unten in der Daumenzone. */
describe('Navigation unten', () => {
  const block = css.match(/@media\(max-width:1039px\)\{([\s\S]*?)\n\}/);

  it('heftet die Tableiste unter 1040px unten an', () => {
    expect(block).not.toBeNull();
    expect(block[1]).toMatch(/\.tabs\{position:fixed;[^}]*bottom:0/);
    expect(block[1]).toMatch(/safe-area-inset-bottom/);
  });

  it('stellt Abschlussleiste und Pausen-Chip darueber', () => {
    expect(block[1]).toMatch(/\.finish-bar\{bottom:var\(--leiste-h\)/);
    expect(block[1]).toMatch(/\.rest-chip\{bottom:calc\(var\(--leiste-h\)/);
  });

  it('laesst die Schiene ab 1040px unberuehrt', () => {
    expect(block[1]).not.toMatch(/schiene/);
  });
});

describe('Symbolsatz', () => {
  /* app.js und die Module, in die es aufgeteilt ist. */
  const app = ['js/app.js', ...['core', 'ui', 'features'].flatMap(d =>
    readdirSync(join(process.cwd(), 'js', d)).filter(f => f.endsWith('.js')).map(f => 'js/' + d + '/' + f))]
    .map(f => readFileSync(join(process.cwd(), f), 'utf8')).join('\n');
  const vorhanden = new Set([...html.matchAll(/<symbol id="i-([a-z]+)"/g)].map(m => m[1]));
  const benutzt = new Set([
    ...[...app.matchAll(/ikon\('([a-z]+)'\)/g)].map(m => m[1]),
    ...[...html.matchAll(/href="#i-([a-z]+)"/g)].map(m => m[1]),
    ...[...app.matchAll(/(?:null|light|dark): '([a-z]+)'/g)].map(m => m[1])
  ]);

  it('kennt jedes verwendete Symbol', () => {
    expect(benutzt.size).toBeGreaterThan(15);
    expect([...benutzt].filter(n => !vorhanden.has(n))).toEqual([]);
  });

  it('hat keine toten Symbole', () => {
    expect([...vorhanden].filter(n => !benutzt.has(n))).toEqual([]);
  });

  /* Die Emoji und Unicode-Zeichen, die der Symbolsatz abgeloest hat. In
     Knoepfen sahen sie je nach System anders aus. */
  it('verwendet in Knoepfen keine Emoji oder Pfeilzeichen mehr', () => {
    const knoepfe = [...(html + app).matchAll(/<button[^>]*>([^<]*)/g)].map(m => m[1]);
    const alt = /[✕✎⠿↻⤳↩📊⚙☾☀◐▲]/u;
    expect(knoepfe.filter(t => alt.test(t))).toEqual([]);
  });
});

describe('Satzspalten', () => {
  it('stellt je Satz eine Spalte', () => {
    expect(css).toMatch(/\.sets\{display:grid;grid-template-columns:repeat\(var\(--saetze,4\),minmax\(0,1fr\)\)/);
  });

  /* Gemessen bei 320px: "Ziel 20 Sek" ist 73px breit, eine Spalte bei
     fuenf Saetzen gut 40px. Mit nowrap lagen die Ziele uebereinander. */
  it('laesst das Ziel in seiner Spalte umbrechen', () => {
    const regel = css.match(/\.satz-ziel\{[^}]*\}/)[0];
    expect(regel).not.toMatch(/nowrap/);
    expect(regel).toMatch(/max-width:100%/);
  });
});

describe('Gestaltungsstufen', () => {
  const stufen = ['xs', 'sm', 'md', 'base', 'lg', 'xl'];

  it('definiert sechs Schriftstufen', () => {
    stufen.forEach(s => expect(css).toMatch(new RegExp('--text-' + s + ':[0-9]')));
  });

  it('laesst keine rohe Schriftgroesse ausser den zwei begruendeten zu', () => {
    const roh = [...css.matchAll(/([^{};]*)\{[^}]*font-size:(\d+(?:\.\d+)?)px/g)]
      .map(m => m[1].trim().split('\n').pop().trim() + ' ' + m[2]);
    expect(roh.sort()).toEqual([
      /* Keine Schrift, sondern die Groesse eines Symbols im runden Knopf.
         Die zweite Ausnahme – 13px fuer die Handy-Tableiste oben – ist mit
         der Leiste unten entfallen. */
      '.icon-btn 18'
    ].sort());
  });

  it('verweist nur auf Stufen, die es gibt', () => {
    const benutzt = new Set([...css.matchAll(/var\(--text-([a-z]+)\)/g)].map(m => m[1]));
    [...benutzt].forEach(s => expect(stufen).toContain(s));
    expect(benutzt.size).toBe(stufen.length);
  });

  it('mischt die Hoehenstufen fuer den dunklen Grund eigens', () => {
    const dunkel = css.match(/html\[data-theme="dark"\]\s*\{([^}]+)\}/)[1];
    expect(dunkel).toContain('--schatten-1');
    expect(dunkel).toContain('--schatten-2');
  });

  it('setzt die tragenden Flaechen auf die Stufen', () => {
    expect(css).toMatch(/^\.card\{[^}]*padding:var\(--abstand-4\)[^}]*box-shadow:var\(--schatten-1\)/m);
    expect(css).toMatch(/^\.ex\{[^}]*padding:var\(--abstand-4\)/m);
    expect(css).toMatch(/^\.section-title\{[^}]*margin:var\(--abstand-6\) 0 var\(--abstand-3\)/m);
    expect(css).toMatch(/^\.modal\{[^}]*box-shadow:var\(--schatten-2\)/m);
  });
});

/* iOS zoomt bei einem Eingabefeld unter 16 px die ganze Seite heran. */
describe('Eingabefelder auf dem Touchgeraet', () => {
  it('setzt alle Felder unter pointer:coarse auf mindestens 16 px', () => {
    const block = css.match(/@media \(pointer:coarse\)\{\s*:is\(input:not\(\[type=checkbox\]\)[^{]*select,textarea\)\{font-size:var\(--text-(\w+)\)\}/);
    expect(block).toBeTruthy();
    const px = Number(css.match(new RegExp('--text-' + block[1] + ':([0-9.]+)px'))[1]);
    expect(px).toBeGreaterThanOrEqual(16);
    /* Am Ende der Datei, sonst schlagen spaetere Feldregeln sie. */
    expect(css.lastIndexOf('@media (pointer:coarse)')).toBe(css.indexOf(block[0]));
  });
});

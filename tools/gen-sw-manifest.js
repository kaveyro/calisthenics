/* Erzeugt sw-manifest.js: die Liste der zu cachenden Dateien und eine aus
   deren Inhalt abgeleitete Cache-Version.

   Warum generiert statt von Hand gepflegt: cache.addAll() schlaegt ATOMAR
   fehl, wenn auch nur ein Eintrag 404 liefert – und sw.js verschluckt das.
   Ein vergessener Dateiname deaktiviert damit den Offline-Betrieb komplett,
   ohne jede Fehlermeldung. Eine inhaltsabgeleitete Version kann ausserdem
   nicht vergessen werden.

   Der Hash MUSS plattformunabhaengig sein. Zwei Fallen, die beide schon
   zugeschnappt sind und die CI rot gemacht haben:

     1. relative() liefert unter Windows 'js\\app.js', unter Linux 'js/app.js'.
     2. Die Arbeitskopie enthaelt bei core.autocrlf=true CRLF, der Blob und
        jeder Linux-Checkout dagegen LF.

   Beide flossen ungefiltert in den Hash. Dadurch war die Version nicht
   reproduzierbar: zwei Rechner erzeugten aus identischem Quellstand
   verschiedene Manifeste, und schon ein Checkout oder Merge, der Dateien
   zurueckschreibt, aenderte sie – ohne jede inhaltliche Aenderung.

   Deshalb wird vor dem Hashen der Pfad auf Schraegstriche und der Inhalt
   von Textdateien auf LF normalisiert. Bitte nicht "vereinfachen".

   Aufruf:
     node tools/gen-sw-manifest.js           schreibt sw-manifest.js
     node tools/gen-sw-manifest.js --check   prueft nur, Exit 1 bei Abweichung
*/

import { createHash } from 'node:crypto';
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'sw-manifest.js');

/* Nur Verzeichnisse, die zur laufenden App gehoeren. */
const INCLUDE_DIRS = ['css', 'js', 'icons', 'fonts'];
const ROOT_FILES = ['index.html', 'manifest.json'];
/* sw.js und sw-manifest.js gehoeren bewusst NICHT hinein: der Service Worker
   darf sich nicht selbst aus dem Cache ausliefern. */
const SKIP = new Set(['node_modules', '.git', 'test', 'tools', 'coverage', '.claude']);

/* Endungsliste statt Inhaltsraten: bei einer Binaerdatei waere eine
   CRLF-Ersetzung sinnlos und bei falscher Erkennung irrefuehrend. */
const TEXT = /\.(js|mjs|css|html|json|txt|svg|webmanifest|md)$/i;

/* Bytes einer Datei so, wie sie auf jeder Plattform gleich aussehen. */
function normalisierterInhalt(pfad){
  const buf = readFileSync(pfad);
  if(!TEXT.test(pfad)) return buf;
  return Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
}

function walk(dir, acc = []){
  if(!existsSync(dir)) return acc;
  for(const name of readdirSync(dir).sort()){
    if(SKIP.has(name) || name.startsWith('.')) continue;
    const full = join(dir, name);
    if(statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const files = [
  ...ROOT_FILES.map(f => join(ROOT, f)).filter(existsSync),
  ...INCLUDE_DIRS.flatMap(d => walk(join(ROOT, d)))
];

/* Pfade relativ und mit Schraegstrich – auch unter Windows. Derselbe Wert
   geht in die Asset-Liste UND in den Hash; frueher normalisierte nur die
   Liste, wodurch der Hash den Backslash mitzaehlte. */
const relPfade = files.map(f => relative(ROOT, f).split(sep).join('/'));
const assets = relPfade.map(p => './' + p);

const hash = createHash('sha256');
files.forEach((f, i) => {
  hash.update(relPfade[i]);
  hash.update(normalisierterInhalt(f));
});
const version = 'progression-' + hash.digest('hex').slice(0, 8);

const content =
`/* AUTOMATISCH ERZEUGT von tools/gen-sw-manifest.js – nicht von Hand ändern.
   Neu erzeugen mit:  npm run sw:manifest  */
self.__SW_VERSION = '${version}';
self.__SW_ASSETS = [
  './',
${assets.map(a => `  '${a}'`).join(',\n')}
];
`;

if(process.argv.includes('--check')){
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  /* Zeilenenden auch hier angleichen: sw-manifest.js selbst wird bei einem
     Checkout unter Windows zu CRLF, waehrend der Generator mit \n schreibt.
     Ohne diese Normalisierung schluege der Check nach einem frischen Clone
     auch lokal fehl – und zwar mit einer irrefuehrenden Meldung. */
  const lf = s => s.replace(/\r\n/g, '\n');
  if(lf(current) !== lf(content)){
    console.error('sw-manifest.js ist nicht aktuell. Bitte "npm run sw:manifest" ausführen.');
    process.exit(1);
  }
  console.log(`sw-manifest.js aktuell (${assets.length + 1} Einträge, ${version}).`);
} else {
  writeFileSync(OUT, content);
  console.log(`sw-manifest.js geschrieben: ${assets.length + 1} Einträge, ${version}.`);
}

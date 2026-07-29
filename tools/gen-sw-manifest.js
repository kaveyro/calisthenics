/* Erzeugt sw-manifest.js: die Liste der zu cachenden Dateien und eine aus
   deren Inhalt abgeleitete Cache-Version.

   Warum generiert statt von Hand gepflegt: cache.addAll() schlaegt ATOMAR
   fehl, wenn auch nur ein Eintrag 404 liefert – und sw.js verschluckt das.
   Ein vergessener Dateiname deaktiviert damit den Offline-Betrieb komplett,
   ohne jede Fehlermeldung. Eine inhaltsabgeleitete Version kann ausserdem
   nicht vergessen werden.

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

/* Pfade relativ und mit Schraegstrich – auch unter Windows. */
const assets = files.map(f => './' + relative(ROOT, f).split(sep).join('/'));

const hash = createHash('sha256');
for(const f of files){ hash.update(relative(ROOT, f)); hash.update(readFileSync(f)); }
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
  if(current !== content){
    console.error('sw-manifest.js ist nicht aktuell. Bitte "npm run sw:manifest" ausführen.');
    process.exit(1);
  }
  console.log(`sw-manifest.js aktuell (${assets.length + 1} Einträge, ${version}).`);
} else {
  writeFileSync(OUT, content);
  console.log(`sw-manifest.js geschrieben: ${assets.length + 1} Einträge, ${version}.`);
}

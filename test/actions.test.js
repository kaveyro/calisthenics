import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* Diese Datei prüft die Verdrahtung zwischen Markup und Aktionstabelle.
   Der häufigste Fehler beim Umbau ist ein Tippfehler im Aktionsnamen, und
   das Fehlerbild – "Button tut nichts" – ist von Hand mühsam zu finden.

   js/app.js wird als TEXT gelesen, nicht importiert – und das bleibt auch so,
   seit start() exportiert wird und das Modul sich laden lässt (siehe
   test/app.test.js). Gesucht sind hier nämlich die Namen im QUELLTEXT: die
   Aktionstabelle und die in den HTML-Strings verwendeten Namen. Ein Import
   liefert nur die Tabelle, also genau eine der beiden Seiten des Vergleichs. */

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function alleQuellen(dir, acc = []){
  for(const name of readdirSync(dir)){
    const full = join(dir, name);
    if(statSync(full).isDirectory()) alleQuellen(full, acc);
    else if(name.endsWith('.js')) acc.push(full);
  }
  return acc;
}

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const jsQuellen = alleQuellen(join(ROOT, 'js'));
const appQuelltext = readFileSync(join(ROOT, 'js', 'app.js'), 'utf8');

/* Namen aus der actions-Tabelle ziehen: alle Schlüssel bis zur schließenden
   Klammer des Objektliterals. */
const tabelle = appQuelltext.slice(appQuelltext.indexOf('export const actions = {'));
const registriert = new Set([...tabelle.matchAll(/^\s{2}'([a-zA-Z:]+)':/gm)].map(m => m[1]));

/* Alle im Markup verwendeten Namen – aus index.html und aus den in app.js
   erzeugten HTML-Strings. Zusätzlich per dataset gesetzte Namen, etwa beim
   dynamisch erzeugten Undo-Button, und als Option übergebene Namen wie bei
   der Schaltfläche im Update-Hinweis: toast(text, big, { action: '…' }).

   Die dritte Form ist bewusst eng gefasst. Sie erkennt eine weitere Art, wie
   ein Aktionsname an ein Element gelangt – die Prüfung bleibt in beide
   Richtungen scharf: ein Tippfehler dort schlägt als "verwendet, aber nicht
   registriert" auf. */
function verwendeteNamen(text){
  return [
    ...[...text.matchAll(/data-action(?:-change|-input)?="([a-zA-Z:]+)"/g)].map(m => m[1]),
    ...[...text.matchAll(/dataset\.action(?:Change|Input)?\s*=\s*'([a-zA-Z:]+)'/g)].map(m => m[1]),
    ...[...text.matchAll(/\baction:\s*'([a-zA-Z]+:[a-zA-Z]+)'/g)].map(m => m[1])
  ];
}
const verwendet = new Set([...verwendeteNamen(html), ...verwendeteNamen(appQuelltext)]);

describe('Aktionstabelle', () => {
  it('enthält überhaupt Einträge', () => {
    expect(registriert.size).toBeGreaterThan(30);
    expect(verwendet.size).toBeGreaterThan(30);
  });

  it('kennt jede im Markup verwendete Aktion', () => {
    const unbekannt = [...verwendet].filter(n => !registriert.has(n));
    expect(unbekannt, 'Im Markup verwendet, aber nicht registriert').toEqual([]);
  });

  it('hat keine toten Einträge', () => {
    const ungenutzt = [...registriert].filter(n => !verwendet.has(n));
    expect(ungenutzt, 'Registriert, aber nirgends verwendet').toEqual([]);
  });
});

describe('Keine Inline-Event-Handler', () => {
  /* Sie machen eine CSP ohne 'unsafe-inline' unmöglich – die wirksamste
     Maßnahme gegen eingeschleusten Code. Dieser Test verhindert den
     Rückfall. */
  const inline = /\son[a-z]+\s*=\s*["']/g;

  it('in index.html', () => {
    expect(html.match(inline) || []).toEqual([]);
  });

  it('in den generierten HTML-Strings unter js/', () => {
    const treffer = [];
    for(const datei of jsQuellen){
      /* Blockkommentare entfernen: mehrere davon zitieren absichtlich
         onclick="fn('…')", um zu erklären, warum diese Form gefährlich ist. */
      const text = readFileSync(datei, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for(const m of text.matchAll(/\son[a-z]+="/g)){
        const name = m[0].trim().slice(0, -2);
        if(/^on(click|change|input|submit|load|error|drag|drop|key|focus|blur|mouse|touch)/.test(name)){
          treffer.push(datei.replace(ROOT, '') + ': ' + m[0].trim());
        }
      }
    }
    expect(treffer).toEqual([]);
  });
});

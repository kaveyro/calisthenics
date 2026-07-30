# Progression – Calisthenics Tracker

Eine offline-fähige Web-App (PWA), die deinen Calisthenics-Fortschritt trackt und die Übungsvorgaben automatisch anpasst. Kein Backend, keine Anmeldung, keine Abhängigkeiten zur Laufzeit – alle Daten bleiben auf deinem Gerät, und es geht keine einzige Anfrage an einen fremden Server. Auch die Schriften liegen lokal (`fonts/`, SIL OFL 1.1).

**Funktionen:** automatische Progression über Stufen · Halte- und Pausen-Timer mit Signal · 36 Übungen mit 141 Progressionsstufen · vier Plan-Vorlagen plus eigener Plan-Editor · Verlauf mit Diagrammen · Gewichts-Tracking · Notizen und Bestleistungen pro Übung · 16 Meilensteine · Skill-Fahrplan · Deload-Erinnerung · Dark Mode · Backup als JSON/CSV.

---

## 1. Lokal ausprobieren

Die App braucht einen lokalen Server. Ein direkter Doppelklick auf `index.html` reicht nicht: ES-Module werden über `file://` von den Browsern blockiert, und der Service Worker (Offline-Cache) braucht ohnehin `http(s)`.

```bash
npm start
```

Alternativ ohne Node:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` aufrufen.

### Entwicklung

Zum *Ausführen* und *Veröffentlichen* der App wird nichts installiert – sie besteht aus statischen Dateien ohne Build-Schritt. Die folgenden Werkzeuge sind reine Entwicklungshilfen; `node_modules/` kann jederzeit gelöscht werden, ohne dass sich an der App etwas ändert.

```bash
npm install        # einmalig, nur für die Werkzeuge
npm run check      # Linting, Tests und Prüfung des Offline-Manifests
```

| Befehl | Zweck |
| --- | --- |
| `npm test` | Unit-Tests der reinen Logik in `js/domain/` |
| `npm run lint` | ESLint, inklusive der Schichtgrenzen |
| `npm run sw:manifest` | Offline-Dateiliste neu erzeugen (siehe Abschnitt 7) |

---

## 2. Auf GitHub Pages veröffentlichen

1. Auf GitHub ein neues Repository anlegen, z. B. `progression`.
2. Dateien hochladen – entweder per Weboberfläche („Add file → Upload files", den ganzen Ordnerinhalt reinziehen) oder per Kommandozeile:

```bash
git init
git add .
git commit -m "Progression Tracker"
git branch -M main
git remote add origin https://github.com/DEIN-NAME/progression.git
git push -u origin main
```

3. Im Repository auf **Settings → Pages** gehen.
4. Unter „Build and deployment" bei *Source* **Deploy from a branch** wählen, Branch `main`, Ordner `/ (root)`, dann **Save**.
5. Nach ein bis zwei Minuten ist die App erreichbar unter:
   `https://DEIN-NAME.github.io/progression/`

Bei kostenlosen Accounts muss das Repository öffentlich sein. Dein Code ist dann sichtbar – deine Trainingsdaten nicht, die liegen ausschließlich im Browser deines Geräts.

---

## 3. Als App installieren

**Windows (Chrome/Edge):** Seite öffnen → in der Adressleiste auf das Installations-Symbol klicken (oder Menü → „Apps → Diese Seite als App installieren"). Die App landet im Startmenü und öffnet sich in einem eigenen Fenster ohne Adressleiste.

**Android (Chrome):** Menü → „App installieren" bzw. „Zum Startbildschirm hinzufügen".

**iPhone/iPad (Safari):** Teilen-Symbol → „Zum Home-Bildschirm".

Nach der Installation funktioniert die App auch ohne Internet.

---

## 4. Wichtig zum Speichern

Die Daten liegen im `localStorage` des Browsers, gebunden an die Adresse (Origin) der App.

- **Feste HTTPS-Adresse verwenden** (GitHub Pages). Bei lokal geöffneten Dateien hängen die Daten am Dateipfad und gehen beim Verschieben verloren.
- **Kein Inkognito-Modus** – dort wird der Speicher beim Schließen geleert.
- Handy und PC teilen den Fortschritt **nicht** automatisch. Zum Umziehen: Einstellungen → *Backup herunterladen*, auf dem anderen Gerät → *Backup importieren*.
- Vor größeren Änderungen am Code: einmal Backup ziehen.

---

## 5. Projektstruktur

```
progression/
├── index.html          Struktur & alle Ansichten (ohne Inline-Handler)
├── manifest.json       PWA-Metadaten (Name, Icons, Farben)
├── sw.js               Service Worker (Offline-Cache)
├── sw-manifest.js      GENERIERT – Dateiliste & Cache-Version
├── css/
│   └── style.css       Alles Visuelle, @font-face, Themes über CSS-Variablen
├── js/
│   ├── exercises.js    ► ÜBUNGSDATEN & PLAN-VORLAGEN (hier erweitern)
│   ├── storage.js      Speicher-Adapter (localStorage, Altschlüssel)
│   ├── app.js          Logik, Rendering, Timer, Backup, Migration, Aktionen
│   ├── domain/         Reine Logik ohne DOM – hier liegen die Tests an
│   │                   dates · escape · target · csv · plateau · state
│   ├── i18n/           strings.js (Oberfläche de/en) · index.js (Zugriff)
│   ├── data/
│   │   └── content.en.js  Englische Übungsinhalte
│   └── ui/
│       └── delegate.js Event-Delegation (data-action)
├── fonts/              Selbst gehostete woff2 + SIL-OFL-Lizenz
├── test/               Unit-Tests (vitest)
├── tools/              gen-sw-manifest.js
└── icons/              App-Icons (192, 512, maskable)
```

**Schichten.** `js/domain/` ist rein: kein DOM, kein Zustand, keine Importe nach außen. ESLint gibt diesem Verzeichnis leere Globals, sodass ein Zugriff auf `document` dort als Fehler auffällt – die Reinheit ist erzwungen, nicht nur vereinbart. Genau diese Schicht ist getestet.

**Keine Inline-Event-Handler.** Markup und Logik hängen ausschließlich über `data-action` zusammen, aufgelöst durch eine Tabelle in `app.js`. Das ist die Voraussetzung für die Content-Security-Policy ohne `'unsafe-inline'` und verhindert zugleich, dass Werte in JavaScript-Strings innerhalb von Attributen landen. Ein Test prüft, dass jede verwendete Aktion existiert und keine Handler zurückkehren.

**Zweisprachig (Deutsch/Englisch).** Umschaltbar in den Einstellungen, übersetzt sind Oberfläche *und* Inhalte – Übungsnamen, alle 141 Stufen, Ausführungshinweise, Meilensteine und Plan-Vorlagen.

- Oberflächentexte: `js/i18n/strings.js`. Platzhalter in geschweiften Klammern (`'{n} Sätze'`) statt zusammengesetzter Strings – die Wortstellung unterscheidet sich zwischen Sprachen.
- Statisches Markup: `data-i18n="schlüssel"` am Element, `data-i18n-placeholder` / `-aria-label` / `-title` für Attribute.
- Übungsinhalte: `js/data/content.en.js`, zugeordnet über die IDs. `js/exercises.js` bleibt die deutsche Quelle und die Rückfallsprache.
- Eigene Einträge des Nutzers (angepasster Plan, eigene Warm-up-Punkte, Notizen) werden nie übersetzt.

Vier Tests halten das dicht: gleiche Schlüssel und gleiche Platzhalter in beiden Sprachen, eine Entsprechung für jede Übung, Stufe, Tipp, Meilenstein und Planvorlage, kein sichtbarer deutscher Text ohne `data-i18n`, und kein deutscher Rest im englischen Block. **Eine neue Übung braucht daher immer beide Sprachen** – sonst schlägt `npm test` fehl.

---

## 6. Übungen hinzufügen

Alles Inhaltliche steckt in `js/exercises.js` – die Logik musst du nicht anfassen. Neuen Block in `EXERCISES` ergänzen:

```js
{
  id: 'ring_row',                    // eindeutig, NIEMALS nachträglich ändern
  name: 'Ringrudern',
  cat: 'pull',                       // push | pull | legs | core | skill | mobility
  equip: ['bar'],                    // none | parallettes | bar | chair
  rest: 90,                          // empfohlene Satzpause in Sekunden
  levels: [                          // von leicht nach schwer
    { stage: 'Füße am Boden', target: '3 × 8–12' },
    { stage: 'Füße erhöht',   target: '3 × 8–12' },
    { stage: 'Einarmig',      target: '3 × 5–8'  }
  ],
  tips: [
    'Schulterblätter zuerst zusammenziehen.',
    'Körper bleibt in einer Linie.'
  ]
}
```

**Format von `target`:** `"<Sätze> × <Wiederholungen>"`, z. B. `"4 × 6–10"`.
Endet die Angabe auf `Sek`, erkennt die App eine Halteübung und stellt automatisch einen Countdown auf den **oberen** Wert bereit: `"4 × 10–20 Sek"` → 20-Sekunden-Timer.

Neue Übung in einen Trainingstag bringen: entweder direkt in `PLAN_TEMPLATES` bei `ex: [...]` eintragen, oder einfach in der App im Tab **Plan** hinzufügen.

> Fünf Übungen sind bewusst in keiner Vorlage enthalten und nur über den Plan-Editor oder die Bibliothek erreichbar: `archer_push`, `dragon_flag`, `lsit_hs`, `bridge` und `hip_mob`. Sie sind entweder sehr fortgeschritten oder als Ergänzung nach Bedarf gedacht.

Eigene Plan-Vorlage anlegen:

```js
meinplan: {
  name: 'Mein Split · 5× pro Woche',
  desc: 'Kurzbeschreibung',
  days: [
    { key: 'A', title: 'Oberkörper', sub: 'Push & Pull', ex: ['pushup','pullup','dips'] }
  ]
}
```

Meilensteine erweitern: Eintrag in `MILESTONES` ergänzen (`{ id: 'muscleup1', name: 'Erster Muscle-up' }`).

### Zwei Regeln, damit kein Fortschritt verloren geht

1. **IDs nie umbenennen oder löschen** – der gespeicherte Fortschritt (`state.levels`) referenziert sie. Entfernst du eine Übung aus einem Plan, bleibt ihr Stufenstand erhalten und ist in der Bibliothek weiter sichtbar.
2. **Beim Ändern der Datenstruktur** die Konstante `STATE_VERSION` in `js/domain/state.js` hochzählen und in `migrateState()` einen Schritt ergänzen. `migrateState()` ist eine reine Funktion (`Rohwert → Stand`) und übernimmt Deep-Merge der Defaults sowie Typprüfung; `clampBackup()` daneben beschneidet importierte Backups, und der Import läuft durch beide. `LEGACY_KEYS` in `storage.js` zeigt, wie ältere Speicherschlüssel gelesen werden. Nach erfolgreicher Übernahme entfernt die App die Altschlüssel selbst.

---

## 7. Nach Änderungen: Cache aktualisieren

Dateiliste und Cache-Version stehen in `sw-manifest.js` und werden erzeugt, nicht von Hand gepflegt:

```bash
npm run sw:manifest
```

Die Version leitet sich aus dem Inhalt aller Dateien ab – sie kann also nicht vergessen werden, und jede Änderung erzeugt automatisch einen neuen Cache. `npm run sw:check` schlägt fehl, wenn das Manifest veraltet ist; das gehört vor jeden Deploy.

Der Grund für die Automatik: `cache.add()` schlägt pro Datei fehl, und die frühere `addAll()`-Variante brach **atomar** ab, sobald ein einziger Eintrag fehlte. Ein vergessener Dateiname legte damit den kompletten Offline-Betrieb still – ohne jede Fehlermeldung.

---

## 8. Wie die Progression funktioniert

Jede Übung hat Stufen. Angezeigt wird immer die aktuelle. Hakst du nach dem Training *„Oberes Limit in allen Sätzen geschafft"* ab, zählt das als erfolgreiche Einheit. Nach der eingestellten Anzahl solcher Einheiten in Folge (Standard: 2) steigt die Übung automatisch eine Stufe. Ein Aussetzer setzt den Zähler zurück – die Stufe bleibt.

Über die kleinen `−`/`+` Buttons an jeder Übung kannst du die Stufe jederzeit manuell korrigieren, etwa nach einer Pause oder wenn eine Variante nicht passt.

**Satz-Modi** (Einstellungen): *Einsteiger* deckelt alles auf 3 Sätze, *Standard* nutzt die Vorgaben (3–4), *Fortgeschritten* gibt überall einen Satz dazu.

---

## 9. Später eine echte Desktop-App?

Der Code läuft unverändert in [Tauri](https://tauri.app/): ein neues Tauri-Projekt anlegen, den Ordnerinhalt als Frontend eintragen, fertig ist eine kleine `.exe` (wenige MB, im Gegensatz zu Electron). Sinnvoll wird das erst, wenn du Dinge brauchst, die der Browser nicht kann – etwa Systembenachrichtigungen für Trainingserinnerungen oder Autostart. Für den normalen Gebrauch reicht die installierte PWA.

---

## 10. Trainingshinweise

- **Handgelenke vor jeder Push-Einheit aufwärmen.** Handgelenksbeschwerden sind der häufigste Grund für Trainingspausen bei Handstand- und Planche-Zielen.
- **Qualität vor Menge.** Eine saubere Wiederholung bringt mehr als drei verrissene. Lieber eine Stufe zurück als schlechte Technik einschleifen.
- **Schmerz ist kein Muskelbrennen.** Stechen in Gelenken oder Sehnen heißt: abbrechen, Variante erleichtern.
- **Deload nutzen.** Wenn die App dazu auffordert: eine Woche halbes Volumen. Sehnen brauchen deutlich länger zur Anpassung als Muskeln – gerade bei Stützarbeit.
- **Skills sind Technik.** Handstand profitiert von täglich 5–10 Minuten mehr als von einer langen Einheit pro Woche.
- Die App ist ein Trainingstagebuch, kein Arzt oder Trainer. Bei Vorerkrankungen, anhaltenden Schmerzen oder Unsicherheit bei der Ausführung hol dir fachliche Begleitung.

---

Viel Erfolg – und Geduld bei der Planche. Die kommt zuletzt.

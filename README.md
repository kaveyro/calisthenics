# Progression – Calisthenics Tracker

Eine offline-fähige Web-App (PWA), die deinen Calisthenics-Fortschritt trackt und die Übungsvorgaben automatisch anpasst. Kein Backend, keine Anmeldung, keine Abhängigkeiten zur Laufzeit – alle Daten bleiben auf deinem Gerät, und es geht keine einzige Anfrage an einen fremden Server. Auch die Schriften liegen lokal (`fonts/`, SIL OFL 1.1).

**Funktionen:** Einstieg mit Selbsteinschätzung · automatische Progression über Stufen · Halte- und Pausen-Timer mit Signal · 42 Übungen mit 166 Progressionsstufen · Geräteauswahl mit Plangenerator · vier Plan-Vorlagen plus eigener Plan-Editor · Verlauf mit Diagrammen, Trainingsdauer und frei wählbarem Zeitraum · Gewichts-Tracking · Notizen und Bestleistungen pro Übung · 18 Meilensteine · Skill-Fahrplan · Entlastungswoche · Dark Mode · Backup als JSON/CSV.

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
| `npm test` | Tests: reine Logik in `js/domain/` plus `js/app.js` in jsdom |
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

Nach der Installation funktioniert die App auch ohne Internet. Wo der Browser die Installation selbst anbietet (Chrome, Edge), steht dafür zusätzlich eine Schaltfläche in den Einstellungen.

**Installieren ist nicht nur Bequemlichkeit.** Eine nicht installierte Seite gilt dem Browser als flüchtig: iOS löscht ihre Daten nach sieben Tagen ohne Nutzung, und unter Speicherdruck darf jeder Browser aufräumen. Siehe den nächsten Abschnitt.

Jeder Tab liegt in der Browser-History: die Zurück-Geste geht einen Tab zurück, statt die App zu schließen, und `…/#library` öffnet direkt die Übungsbibliothek. Darauf zeigen auch die Verknüpfungen im Manifest – langes Drücken auf das App-Symbol führt direkt ins Training oder in den Verlauf. Dialoge bleiben bewusst außen vor; sie schließen über Escape und ✕.

---

## 4. Wichtig zum Speichern

Die Daten liegen im `localStorage` des Browsers, gebunden an die Adresse (Origin) der App.

- **Feste HTTPS-Adresse verwenden** (GitHub Pages). Bei lokal geöffneten Dateien hängen die Daten am Dateipfad und gehen beim Verschieben verloren.
- **Kein Inkognito-Modus** – dort wird der Speicher beim Schließen geleert.
- Handy und PC teilen den Fortschritt **nicht** automatisch. Zum Umziehen: Einstellungen → *Backup herunterladen*, auf dem anderen Gerät → *Backup importieren*. Dort fragt die App, ob sie **zusammenführen** oder **ersetzen** soll. Zusammenführen ist die verlustfreie Wahl: Verlauf, Stufen, Bestleistungen und Meilensteine kommen aus beiden Ständen, die Einrichtung dieses Geräts (Einstellungen, Plan, Warm-up) bleibt. Dieselbe Datei zweimal einzuspielen ändert beim zweiten Mal nichts.
- Vor größeren Änderungen am Code: einmal Backup ziehen.

Die App fordert beim Start `navigator.storage.persist()` an – die Zusage des Browsers, den Speicher nicht von sich aus zu räumen. Ob sie erteilt wurde, steht in den Einstellungen unter *Daten & Backup*, zusammen mit dem belegten Platz. Chrome entscheidet anhand von Installation und Nutzung selbst, Firefox fragt nach. Steht dort **„Nicht dauerhaft"**, ist ein regelmäßiges Backup keine Vorsichtsmaßnahme, sondern notwendig.

Deshalb erinnert ein Banner daran: nach zehn Einheiten ohne Sicherung, oder nach 30 Tagen, sofern seither trainiert wurde. Gezählt werden Einheiten statt Tage – wer pausiert, erzeugt keine neuen Daten und braucht keine Erinnerung.

**Zwei offene Fenster** derselben App sind kein Problem mehr. Der gesamte Zustand hängt an einem einzigen Schlüssel, es gibt keine Teilschreibvorgänge – ein Fenster von gestern Abend, das noch offenlag, machte beim nächsten Tipp den ganzen heutigen Verlauf zunichte. Jeder Schreibvorgang zählt jetzt `state.rev` hoch; das `storage`-Ereignis meldet dem anderen Fenster den neuen Stand, und es übernimmt ihn, sobald der Zähler höher ist als sein eigener. Eine dort laufende Einheit bleibt dabei erhalten und wird wieder mitgeschrieben – sie ist das Einzige, was ein Fenster exklusiv hat.

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
│   ├── storage.js      Speicher-Adapter (localStorage, Dauerhaftigkeit)
│   ├── main.js         Einstiegspunkt – ruft start() aus app.js
│   ├── app.js          Logik, Rendering, Timer, Backup, Migration, Aktionen
│   ├── domain/         Reine Logik ohne DOM – hier liegen die Tests an
│   │                   dates · escape · target · csv · plateau · state
│   │                   log · backup · merge · equipment · planbuilder
│   │                   volume · einstieg
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

**Schichten.** `js/domain/` ist rein: kein DOM, kein Zustand, keine Importe nach außen. ESLint gibt diesem Verzeichnis leere Globals, sodass ein Zugriff auf `document` dort als Fehler auffällt – die Reinheit ist erzwungen, nicht nur vereinbart.

**`app.js` startet sich nicht selbst.** Der Einstieg läuft über `js/main.js`, das `start()` aufruft; auch die Listener an `window` und `document` hängt erst `start()` an. Der bloße Import hat damit keine Nebenwirkung – die Voraussetzung dafür, dass `test/app.test.js` die Datei in jsdom laden und die App durch echte Klicks auf das Markup aus `index.html` fahren kann. Vorher lag der weitaus größte Teil des Codes außerhalb jeder Prüfung. **Bitte nichts wieder in den Modulrumpf legen**, was beim Laden ausgeführt werden soll.

**Keine Inline-Event-Handler.** Markup und Logik hängen ausschließlich über `data-action` zusammen, aufgelöst durch eine Tabelle in `app.js`. Das ist die Voraussetzung für die Content-Security-Policy ohne `'unsafe-inline'` und verhindert zugleich, dass Werte in JavaScript-Strings innerhalb von Attributen landen. Ein Test prüft, dass jede verwendete Aktion existiert und keine Handler zurückkehren.

**Zweisprachig (Deutsch/Englisch).** Umschaltbar in den Einstellungen, übersetzt sind Oberfläche *und* Inhalte – Übungsnamen, alle 166 Stufen, Ausführungshinweise, Meilensteine und Plan-Vorlagen.

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
  equip: ['bar', 'rings'],           // none | chair | bar | parallettes | rings | band
  prio: 2,                           // 1 Grundübung · 2 Ergänzung · 3 fortgeschritten
  rest: 90,                          // empfohlene Satzpause in Sekunden
  levels: [                          // von leicht nach schwer
    { stage: 'Füße am Boden', target: '3 × 8–12' },
    { stage: 'Füße erhöht',   target: '3 × 8–12' },
    // Eine Stufe darf ein eigenes equip tragen und überschreibt die Übung:
    { stage: 'Einarmig',      target: '3 × 5–8', equip: ['rings'] }
  ],
  tips: [
    'Schulterblätter zuerst zusammenziehen.',
    'Körper bleibt in einer Linie.'
  ]
}
```

**Format von `target`:** `"<Sätze> × <Wiederholungen>"`, z. B. `"4 × 6–10"`.
Endet die Angabe auf `Sek`, erkennt die App eine Halteübung und stellt automatisch einen Countdown auf den **oberen** Wert bereit: `"4 × 10–20 Sek"` → 20-Sekunden-Timer.

Neue Übung in einen Trainingstag bringen: entweder direkt in `PLAN_TEMPLATES` bei `ex: [...]` eintragen, oder einfach in der App im Tab **Plan** hinzufügen. Die vier Vorlagen bleiben bewusst geräte-arm; für Ringe und Bänder ist der Plangenerator der Weg (Abschnitt 8a).

> In keiner Vorlage enthalten und nur über Plangenerator, Plan-Editor oder Bibliothek erreichbar: `archer_push`, `dragon_flag`, `lsit_hs`, `bridge`, `hip_mob` – sehr fortgeschritten oder als Ergänzung nach Bedarf gedacht – sowie die sechs Übungen für Ringe und Bänder (`ring_pushup`, `ring_dip`, `ring_row`, `band_pullup`, `face_pull`, `band_pullapart`), weil die Vorlagen ohne Zusatzgerät auskommen sollen.

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
2. **Beim Ändern der Datenstruktur** die Konstante `STATE_VERSION` in `js/domain/state.js` hochzählen und in `migrateState()` einen Schritt ergänzen. Zuletzt geschah das für v9: `onboarded` (ob der Einstieg durchlaufen wurde) und `log[].dauer` (die Trainingsdauer in Sekunden; `0` heißt „nicht gemessen“ und gilt für jeden Eintrag von vor v9, für CSV-Importe und für nachgetragene Einheiten). Ob ein bestehender Stand als eingerichtet gilt, entscheidet die Migration am Verlauf und nicht am Vorgabewert – wer schon trainiert hat, wird nicht nach seinen Startstufen gefragt. Davor v8, mit zwei Feldern in einem Schritt: `equipment` (die vorhandenen Geräte, Vorgabe „alles" – ein bestehender Stand verhält sich damit unverändert; ein *leeres* Array bleibt leer, denn „ich habe gar nichts" ist eine gültige Antwort) und `deload` (`{ bis: 'YYYY-MM-DD' }` oder `null`). Beide gehören zur Einrichtung dieses Geräts und werden beim Zusammenführen zweier Stände nicht gemischt. Davor v7: der Stand führt seither in `rev` einen Revisionszähler mit, an dem zwei offene Fenster erkennen, wessen Stand der neuere ist (siehe Abschnitt 4). Davor v6: ein Log-Eintrag führt seither in `ex` die tatsächlich trainierten Übungen mit. Vorher wurden sie im *heutigen* Plan nachgeschlagen, was nach jeder Ersetzung, jedem Plan-Reset und jedem CSV-Import falsch war; für Altbestände fällt `js/domain/log.js` weiterhin auf Plan und Wiederholungsschlüssel zurück. `migrateState()` ist eine reine Funktion (`Rohwert → Stand`) und übernimmt Deep-Merge der Defaults sowie Typprüfung; `clampBackup()` daneben beschneidet importierte Backups, und der Import läuft durch beide. `LEGACY_KEYS` in `storage.js` zeigt, wie ältere Speicherschlüssel gelesen werden. Nach erfolgreicher Übernahme entfernt die App die Altschlüssel selbst.

---

## 7. Nach Änderungen: Cache aktualisieren

Dateiliste und Cache-Version stehen in `sw-manifest.js` und werden erzeugt, nicht von Hand gepflegt:

```bash
npm run sw:manifest
```

Die Version leitet sich aus dem Inhalt aller Dateien ab – sie kann also nicht vergessen werden, und jede Änderung erzeugt automatisch einen neuen Cache. `npm run sw:check` schlägt fehl, wenn das Manifest veraltet ist; das gehört vor jeden Deploy.

Der Grund für die Automatik: `cache.add()` schlägt pro Datei fehl, und die frühere `addAll()`-Variante brach **atomar** ab, sobald ein einziger Eintrag fehlte. Ein vergessener Dateiname legte damit den kompletten Offline-Betrieb still – ohne jede Fehlermeldung.

**Wie ein Deploy beim Nutzer ankommt.** Die neue Version installiert sich im Hintergrund und *wartet*. Die App meldet „Neue Version verfügbar" mit einer Schaltfläche; erst der Klick übergibt ihr die Kontrolle und lädt die Seite einmal neu. Vorher übernahm sie sofort – ab dem Wechsel lieferte der neue Cache die Dateien, während im Dokument noch das alte `app.js` lief. Deshalb werden auch Navigationen aus dem Cache bedient: ein frisches `index.html` vom Netz hätte weiterhin auf die alten, nicht gehashten Dateinamen verwiesen.

---

## 8. Wie die Progression funktioniert

Jede Übung hat Stufen. Angezeigt wird immer die aktuelle. Hakst du nach dem Training *„Oberes Limit in allen Sätzen geschafft"* ab, zählt das als erfolgreiche Einheit. Nach der eingestellten Anzahl solcher Einheiten in Folge (Standard: 2) steigt die Übung automatisch eine Stufe. Ein Aussetzer setzt den Zähler zurück – die Stufe bleibt.

Über die kleinen `−`/`+` Buttons an jeder Übung kannst du die Stufe jederzeit manuell korrigieren, etwa nach einer Pause oder wenn eine Variante nicht passt.

**Wenn heute etwas nicht geht:** ↻ ersetzt die Übung durch eine andere derselben Kategorie und fragt dabei, ob das *nur heute* gelten soll oder dauerhaft in den Plan wandert. „Heute auslassen" lässt sie stehen, aber ohne Sätze – zurückholen geht in derselben Einheit. Beides steht in der laufenden Einheit und übersteht ein Neuladen, ohne den Plan anzufassen.

**Aufwärmen.** Die Liste über der Tagesauswahl lässt sich abhaken; die Haken gehören zur laufenden Einheit, überstehen ein Neuladen und sind bei der nächsten wieder leer. Der Pflichtpunkt (Handgelenke) fragt beim Abschließen nach, wenn er offen blieb – aber nur, wenn überhaupt etwas abgehakt wurde. Wer die Liste gar nicht benutzt, wird nicht ermahnt; die App weiß nichts darüber, ob er sich aufgewärmt hat.

**Trainingsdauer.** Gemessen wird vom ersten Haken bis zu „Fertig" – nicht ab der Tagesauswahl, denn dazwischen liegen Umziehen und Aufwärmen. Bei Halteübungen zählt der Beginn des Haltens. Über vier Stunden gilt die Einheit als nicht gemessen: wer die App offen liegen lässt, hat keine Vierstunden-Einheit trainiert, und eine erfundene Zahl wäre schlechter als gar keine. Der Verlauf zeigt die Dauer je Einheit und einen Durchschnitt, der nur über gemessene Einheiten mittelt.

**Satz-Modi** (Einstellungen): *Einsteiger* deckelt alles auf 3 Sätze, *Standard* nutzt die Vorgaben (3–4), *Fortgeschritten* gibt überall einen Satz dazu.

**Entlastungswoche.** Nach der eingestellten Anzahl Einheiten erinnert ein Banner daran; ein Klick startet sie für sieben Tage. Solange sie läuft, sind alle Sätze halbiert – Wiederholungen und Haltezeiten bleiben, denn im Deload sinkt das Volumen, nicht die Intensität. Stufen steigen in dieser Woche nicht: das obere Limit bezieht sich auf halbierte Sätze und ist nicht dasselbe wie sonst. Der Streak bleibt dabei stehen, wird also weder erhöht noch zurückgesetzt.

---

## 8a. Geräte und Plangenerator

Jede Übung nennt in `equip`, was sie braucht. Die Liste ist ein **ODER** (`['chair','bar']` = Tischkante *oder* Stange); ein Eintrag darf mit `+` eine Kombination ausdrücken (`'bar+band'` = Stange *und* Band). Eine einzelne Progressionsstufe darf ein eigenes `equip` tragen und überschreibt damit die Übung – nötig, weil Progressionen unterwegs das Gerät wechseln: Dips fangen an der Bank an und enden auf den Parallettes.

Markiert wird nur eigens angeschafftes Gerät. Eine erhöhte Fläche, eine Wand, ein Türrahmen oder eine Treppenstufe gilt als `none` – wer die nicht hat, dem hilft ein Filter auch nicht weiter.

Was der Nutzer in den Einstellungen anhakt, steht in `state.equipment` und wirkt an fünf Stellen: die Bibliothek kennzeichnet Nichtmachbares (und blendet es auf Wunsch aus), der Plan-Editor sperrt es im Dropdown, der Ersetzen-Dialog bietet nur Machbares an, das Training weist auf fehlendes Gerät der aktuellen Stufe hin – und die automatische Progression steigt nicht in eine Stufe auf, deren Gerät fehlt. Der Streak wird dort gedeckelt statt genullt, damit die Stufe sofort steigt, sobald das Gerät dazukommt.

**Plan aus meiner Ausrüstung** (Tab *Plan*) baut daraus einen Plan: Tage pro Woche und Schwerpunkt wählen, Vorschau ansehen, übernehmen. `js/domain/planbuilder.js` ist rein und deterministisch – gleiche Eingabe, gleicher Plan. Sortiert wird nach dem Feld `prio` in `js/exercises.js` (1 = Grundübung, 2 = Ergänzung, 3 = fortgeschritten; Vorgabe 2). Ist eine Kategorie mit der vorhandenen Ausrüstung gar nicht möglich – ohne Gerät gilt das für „Ziehen" –, wird der Tag aus allem Machbaren gefüllt und heißt danach „Ganzkörper" statt „Ziehen".

---

## 8b. Einstieg, Verlauf und Bibliothek

**Einstieg.** Beim ersten Start lädt ein Banner über der Tagesauswahl dazu ein (bewusst kein Dialog – eine App, die einen begrüßt, bevor man sie gesehen hat, wird weggeklickt). Zwei Fragen: welche Geräte da sind, und je Kategorie, welche **Stufe** man sauber schafft.

Gefragt wird ausdrücklich nicht nach Wiederholungen. Die Leitern steigen über den Hebel, nicht über die Zahl – bei den Liegestützen steht in fast jeder Stufe „4 × 6–10", vom Tisch bis zum einarmigen. Aus „20 Liegestütze" ließe sich die Stufe gar nicht ableiten. Stattdessen zeigt der Dialog die Leiter mit Namen und Ziel zur Auswahl; das ist genau statt geschätzt und erklärt nebenbei das Grundprinzip. Die Fragen richten sich nach der Ausrüstung: ohne Stange steht beim Ziehen das Rudern statt des Klimmzugs, und Stufen mit fehlendem Gerät stehen gar nicht erst zur Wahl.

Auf die übrigen Übungen derselben Kategorie wird nur zur **Hälfte** übertragen (`js/domain/einstieg.js`). Zu niedrig kostet eine Einheit mit zu leichtem Ziel; zu hoch bedeutet eine Übung, die sich nicht sauber ausführen lässt. Skills bleiben ganz außen vor – dazu zählen auch Wand-Handstand, Planche Lean und Front Lever, die in `exercises.js` unter *Drücken* bzw. *Ziehen* stehen. Ein bestehender Stand gilt als eingerichtet; wer den Einstieg übersprungen hat, findet ihn in den Einstellungen.

**Verlauf.** Der Zeitraum oben (8 Wochen, 26 Wochen, 12 Monate, alles) gilt für Diagramme **und** Liste. Ab einem Jahr wird nach Monaten gruppiert, sonst wären drei Jahre über 150 Balken; das Wochenziel wird dabei hochgerechnet, damit die Farbe etwas aussagt. Bei vielen Spalten scrollt das Diagramm waagerecht. Die Liste zeigt höchstens 100 Einträge und sagt darunter, wie viele der Zeitraum insgesamt hat.

**Training nachtragen.** Datum, Trainingstag und Satzzahl – für Einheiten ohne Handy. Die Satzzahl ist mit dem vorbelegt, was der Plan für den Tag vorsieht, die Übungsliste kommt aus dem Plan, und die Dauer bleibt leer. Stufen, Serien und Bestleistungen bleiben unberührt: aus einer nachgetragenen Satzzahl lässt sich nicht ablesen, was an dem Tag am oberen Limit lag.

**Bibliothek.** Jeder Eintrag nennt, wann die Übung zuletzt dran war; ab zwei Wochen steht ein Hinweis daneben. Sortieren lässt sich nach Kategorie (Vorgabe), „am längsten nicht trainiert" (nie Trainiertes zuerst) oder Fortschritt.

---

## 9. Bekannte Einschränkungen

Bewusste Entscheidungen, keine offenen Aufgaben – damit niemand danach sucht:

- **Der Pausenton erreicht keinen gesperrten Bildschirm.** Beide Timer hängen an einem absoluten Zielzeitpunkt und gehen deshalb nicht nach; der Ton kommt aber erst, wenn die Seite wieder sichtbar ist. Dafür bräuchte es Systembenachrichtigungen – siehe Abschnitt 10.
- **Kein Zusatzgewicht.** Das Modell ist stufen-, nicht lastbasiert, und `parseTarget()` liest die Zielangaben als Text. Ein Gewichtsfeld je Satz würde beides aufbrechen. Das Freitextfeld der Bestleistung trägt „+10 kg" heute schon.
- **Die Abdeckung misst nur `js/domain/**`** (90 % Zeilen und Funktionen, 80 % Zweige, `vitest.config.js`). `js/app.js` wird von `test/app.test.js` durch echte Klicks gefahren, taucht in der Messung aber nicht auf – es gibt also keine Zahl dafür, wie viel davon läuft.
- **`js/app.js` bleibt eine Datei.** Der ursprüngliche Grund für eine Aufteilung war die Testbarkeit; die ist mit `js/main.js` und `test/app.test.js` erledigt. Übrig bliebe die Größe – kein Nutzen für den Anwender bei spürbarem Regressionsrisiko.
- **Halteübungen zählen nicht ins Volumendiagramm.** Sie haben keine Wiederholungen; ihre Zeit unter Spannung ließe sich nur aus der Zielangabe schätzen, und eine geschätzte Zahl neben gezählten wäre irreführend. Über die Satzzahl zählen sie weiter mit.
- **Der CSV-Export enthält kein Volumen.** Eine zusätzliche Spalte wäre eine Formatänderung mit Rückwirkung auf den Import.
- **Gewichts- und Messreihen sind bei 1000 Einträgen gekappt** (`MAX_SERIES_ENTRIES`), das Trainingslog bei 2000. Bei täglichem Wiegen ist die erste Grenze nach knapp drei Jahren erreicht, die zweite bei vier Einheiten pro Woche nach gut neun. Gekappt wird beim Laden und bei jedem Import, und zwar am älteren Ende ohne Hinweis.
- **Die Startstufen des Einstiegs sind für die Ankerübung genau und für alles andere geschätzt.** Die Übertragung auf die übrige Kategorie ist bewusst gedämpft und bleibt eine Vermutung – jede Stufe lässt sich in der Bibliothek mit ± nachziehen.
- **Geräte markieren nur Angeschafftes.** Wand, Türrahmen, Treppenstufe und erhöhte Flächen gelten als „kein Gerät"; ein Filter darauf wäre Schikane statt Hilfe.

---

## 10. Später eine echte Desktop-App?

Der Code läuft unverändert in [Tauri](https://tauri.app/): ein neues Tauri-Projekt anlegen, den Ordnerinhalt als Frontend eintragen, fertig ist eine kleine `.exe` (wenige MB, im Gegensatz zu Electron). Sinnvoll wird das erst, wenn du Dinge brauchst, die der Browser nicht kann – etwa Systembenachrichtigungen für Trainingserinnerungen, den Pausenton bei gesperrtem Bildschirm oder Autostart. Für den normalen Gebrauch reicht die installierte PWA.

---

## 11. Trainingshinweise

- **Handgelenke vor jeder Push-Einheit aufwärmen.** Handgelenksbeschwerden sind der häufigste Grund für Trainingspausen bei Handstand- und Planche-Zielen.
- **Qualität vor Menge.** Eine saubere Wiederholung bringt mehr als drei verrissene. Lieber eine Stufe zurück als schlechte Technik einschleifen.
- **Schmerz ist kein Muskelbrennen.** Stechen in Gelenken oder Sehnen heißt: abbrechen, Variante erleichtern.
- **Deload nutzen.** Wenn die App dazu auffordert: eine Woche starten und halbe Sätze machen lassen. Sehnen brauchen deutlich länger zur Anpassung als Muskeln – gerade bei Stützarbeit.
- **Skills sind Technik.** Handstand profitiert von täglich 5–10 Minuten mehr als von einer langen Einheit pro Woche.
- Die App ist ein Trainingstagebuch, kein Arzt oder Trainer. Bei Vorerkrankungen, anhaltenden Schmerzen oder Unsicherheit bei der Ausführung hol dir fachliche Begleitung.

---

Viel Erfolg – und Geduld bei der Planche. Die kommt zuletzt.

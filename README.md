# Progression – Calisthenics Tracker

Eine offline-fähige Web-App (PWA), die deinen Calisthenics-Fortschritt trackt und die Übungsvorgaben automatisch anpasst. Kein Backend, keine Anmeldung, keine Abhängigkeiten zur Laufzeit – alle Daten bleiben auf deinem Gerät, und es geht keine einzige Anfrage an einen fremden Server. Auch die Schriften liegen lokal (`fonts/`, SIL OFL 1.1).

**Funktionen:** Einstieg mit Selbsteinschätzung · automatische Progression über Stufen, entschieden aus den eingetragenen Wiederholungen und gehaltenen Sekunden · Tagesziel je Übung aus der letzten Einheit · Stagnations- und Überforderungshinweis · Halte- und Pausen-Timer mit Signal · 55 Übungen mit 211 Progressionsstufen, Ziehen auch ohne Gerät · Geräteauswahl mit Plangenerator · vier Plan-Vorlagen plus eigener Plan-Editor mit Wochenrhythmus · Verlauf mit Diagrammen, Trainingsdauer und frei wählbarem Zeitraum · Gewichts-Tracking · Notizen und Bestleistungen pro Übung · 20 Meilensteine, die sich selbst erkennen · Skill-Fahrplan · Entlastungswoche · Dark Mode · auf dem Handy Navigation unten in der Daumenzone, auf breiten Schirmen eine Navigationsschiene und zweispaltiger Inhalt · eigener Symbolsatz und Farben je Kategorie · Backup als JSON/CSV.

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

**Backup teilen.** Wo das Gerät Dateien teilen kann (Handy), steht neben „Backup herunterladen" ein zweiter Knopf, der das Systemblatt öffnet — von dort geht die Datei in einem Schritt in die Cloud oder in einen Chat, statt im Download-Ordner zu landen. Auf dem Rechner bleibt der Knopf verborgen; dort ist der Download der bessere Weg. Gebucht wird die Sicherung nur, wenn das Teilen wirklich durchlief: ein abgebrochenes Systemblatt ist keine Sicherung, und die Erinnerung bleibt dann stehen.

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
│   │                   volume · einstieg · milestones · plan · ics
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

**Breite Schirme.** Bis 1039 px ist die App ein Handy-Layout, darüber wird `.wrap` zum Raster: Tableiste und Kennzahlen bilden links eine Schiene, der Inhalt bekommt den Rest und wird zweispaltig. Vorher stand sie auf einem Monitor als 660 px breite Säule in der Mitte — bei 1600 px Fensterbreite 41 % der Fläche. Die Breiten stehen als Variablen an einer Stelle (`--inhalt-max`, `--schiene`, `--spalte`); auf schmalen Schirmen ist die Schiene 0 px breit, sodass alle Rechnungen damit unverändert den Handy-Zustand ergeben. Mehrspaltig macht eine einzige Klasse `.raster`, angewandt auf Übungskarten, Plantage, Bibliothek, Verlauf und Ziele. Wo eine Überschrift und ihre Karte als Geschwister stehen, hält eine `.panel`-Klammer sie zusammen. In Verlauf und Ziele belegt das lange Panel (Trainingsliste bzw. Meilensteine) zwei Zeilen, und die letzte Zeile ist `1fr` — sonst stünde sein Überhang als Lücke zwischen den gestapelten Panels daneben statt darunter. Die DOM-Reihenfolge ist dieselbe wie auf dem Handy, die Fokusreihenfolge also auch. Eine senkrechte Tableiste navigiert nach dem ARIA-Muster mit ↑/↓ und meldet `aria-orientation="vertical"`; beides hängt an einer `matchMedia`-Abfrage in `app.js`, weil ein Stylesheet es nicht setzen kann.

**Die Übungskarte.** Je Satz eine Spalte: Punkt, Eingabefeld und darunter das Ziel dieses Satzes („Ziel 9"). Vorher standen Punkte und Felder abwechselnd in einer Reihe, die bei vier Sätzen auf dem Handy umbrach, sodass „3" am Zeilenende stand und sein Feld darunter. Die Spalten schrumpfen bis zu sechs Sätzen (Fortgeschritten auf einer 5-Satz-Stufe); bei sechs Sätzen unter etwa 360 px sind die Punkte schmaler als 44 px. Was man nicht in jedem Satz braucht – Bestleistung, Notiz, Tipps, Ersetzen, Auslassen, Verlauf je Übung – steht hinter „Notiz, Tipps und mehr" und bleibt offen, solange eine Notiz darin steht. Die Karte Liegestütze ist damit von 528 auf 419 px geschrumpft.

**Hinweise.** Entlastungswoche, Sicherung, Stagnation und Einstieg stehen über der Tagesauswahl als schmale Hinweise: ein farbiger Randstreifen statt einer vollen Fläche, die Knöpfe neben dem Text, wo Platz ist. Gebaut werden alle mit `hinweis()` und `knopf()` in `app.js`; `test/actions.test.js` erkennt `knopf('aktion', …)` als Verwendung eines Aktionsnamens.

**Navigation unten.** Unter 1040 px ist die Tableiste eine feste Leiste am unteren Rand, in der Daumenzone, mit Symbol über der Beschriftung. Während einer Einheit sitzt die Abschlussleiste darauf und der Pausen-Chip darüber; die Höhe steht einmal in `--leiste-h`, den Abstand zum iPhone-Balken trägt `env(safe-area-inset-bottom)`. Die Tabs bleiben eine waagerechte Tabliste mit ←/→.

**Symbole.** 19 eigene Strichzeichnungen als SVG-Sprite in `index.html`, eingesetzt über `ikon()` in `app.js`, immer `aria-hidden`, Farbe aus `currentColor`. Sie ersetzen Emoji und Unicode-Zeichen, die je nach System anders aussahen. `test/css.test.js` prüft, dass jedes verwendete Symbol im Sprite steht und keines ungenutzt ist.

**Farben je Kategorie.** `--vol-push` … `--vol-mobility` färben den Streifen oben auf der Übungskarte, den Kategorie-Chip, die Stufenleiter, erledigte Satzpunkte, den Randstreifen in der Bibliothek und den Punkt im Plan-Editor – und den Verteilungsbalken. Jede hält 4,5:1 gegen die Kartenfläche in beiden Themen, weil sie auch 11-px-Text trägt; der Test rechnet es nach. Text auf Akzent-, Warn- und Erfolgsflächen nimmt `--on-accent`: hell Weiß, dunkel die Hintergrundfarbe. Bis hierher stand im dunklen Thema Weiß auf dem hellen Akzent, das sind 2,4:1.

**Gestaltungsstufen.** Neben den Farben stehen auch Schriftgrößen (`--text-xs` … `--text-xl`, sechs Stufen nach Rolle), Abstände (`--abstand-1` … `--abstand-6`) und Höhen (`--schatten-1`, `--schatten-2`) als Variablen in `:root`. Vorher standen 17 verschiedene Schriftgrößen im Regelwerk, viele einen halben Pixel auseinander. Eine Größe bleibt bewusst außerhalb der Skala, und `test/css.test.js` nennt genau diese: das Symbol im runden Knopf. Die zweite – 13 px für die Handy-Tableiste oben – ist mit der Navigation unten entfallen. Die Wortmarke unter 352 px folgt der Fensterbreite (`6.5vw`) und steht damit gar nicht in Pixeln. **Eine neue Regel nimmt eine Stufe**, keine rohe Pixelzahl — sonst schlägt der Test fehl.

**Zweisprachig (Deutsch/Englisch).** Umschaltbar in den Einstellungen, übersetzt sind Oberfläche *und* Inhalte – Übungsnamen, alle 211 Stufen, Ausführungshinweise, Meilensteine und Plan-Vorlagen.

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
    { stage: 'Füße am Boden', saetze: 3, wdh: [8, 12] },
    { stage: 'Füße erhöht',   saetze: 3, wdh: [8, 12] },
    // Eine Stufe darf ein eigenes equip tragen und überschreibt die Übung:
    { stage: 'Einarmig',      saetze: 3, wdh: [5, 8], equip: ['rings'] }
  ],
  tips: [
    'Schulterblätter zuerst zusammenziehen.',
    'Körper bleibt in einer Linie.'
  ]
}
```

**Format des Ziels:** `saetze` und genau eines von `wdh` (Wiederholungen) oder `sek` (Halteübung), jeweils als `[min, max]`; ein fester Wert steht als `[n, n]`. Für Balanceübungen gibt es `art: 'versuche'` an Wiederholungen. Bei einer Halteübung zählt der Countdown den **oberen** Wert herunter: `sek: [10, 20]` → 20-Sekunden-Timer.

Bis zur Umstellung war das Ziel ein Text wie `'4 × 6–10'`, den drei reguläre Ausdrücke zerlegten; ein Tippfehler ergab still „3 Sätze, keine Wiederholungen". Jetzt prüft `test/target.test.js` jede Stufe des Katalogs mit `stufeGueltig()` — eine Stufe ohne Satzzahl, mit beiden oder keiner Angabe, oder mit einer absteigenden Spanne fällt beim Testlauf auf.

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
2. **Beim Ändern der Datenstruktur** die Konstante `STATE_VERSION` in `js/domain/state.js` hochzählen und in `migrateState()` einen Schritt ergänzen. Zuletzt geschah das für v16, mit zwei Feldern am Log-Eintrag: `sek` hält die **gehaltenen Sekunden** je Satz einer Halteübung fest, im selben Schlüsselformat wie `reps` (`'support-0'`), aber getrennt davon – sonst zählten Volumendiagramm, CSV-Spalte `Wdh` und alles andere, was Wiederholungen zählt, Sekunden mit. `dl` sagt, dass die Einheit in einer Entlastungswoche lag; ihre Sätze sind dort absichtlich halbiert, und ohne die Angabe hielte die Stagnationserkennung (Abschnitt 8) jede Deload-Woche für Stillstand. Davor v15: ein Log-Eintrag trägt in `lv` die **Stufe je Übung**, auf der seine Zahlen entstanden sind — erfasst vor einem Aufstieg in derselben Einheit. Ohne sie hielt das Tagesziel (Abschnitt 8) nach einem Aufstieg die Zahlen der leichteren Variante für die der neuen: „10 · 10 · 10 · 10" von den Knie-Liegestützen als Vorgabe für volle. Log-Einträge werden in `migrateState()` Feld für Feld neu aufgebaut; ein Feld, das dort fehlt, wäre beim nächsten Laden still verschwunden. Einträge ohne Stufe — vor v15, aus einer CSV oder nachgetragen — bekommen kein Tagesziel. Davor v14: `log[].ups` hält die **Kennungen** der aufgestiegenen Übungen fest statt des übersetzten Anzeigetexts („Liegestütze → Diamant-Liegestütze"). Angezeigt wurde der Text nie – jede der sieben Fundstellen zählt nur seine Länge –, aber er machte den Eintrag unauswertbar, fror die Sprache des Verlaufs ein und kostete rund 40 Byte je Aufstieg. Die CSV-Spalte `LevelUps` führt seither Kennungen wie die Spalte `Uebungen` daneben und bleibt damit roundtrip-fest. Ein Eintrag von vor v14 zählt weiter mit, lässt sich aber keiner Übung zuordnen; die Stagnationserkennung ist auf altem Bestand deshalb eher zu laut als zu leise. Davor v13, und der Anlass war ein Versehen in beide Richtungen: `customMilestones` (eigene Ziele), `deloadPlateauDismissed` (ein weggeklickter Plateau-Hinweis), `erinnertAm` (Datum der letzten Trainingserinnerung) und `settings.reminder` (der Schalter dazu) wurden geschrieben, standen aber nicht in `DEFAULT_STATE` bzw. `SETTINGS_DEFAULTS`. Genau die Regel, die tote Felder loswird, wirft auch unbekannte weg: ein selbst gesetztes Ziel war nach dem nächsten Laden verschwunden, das Banner kam zurück, und die Erinnerung war wieder aus. **Wer ein Feld schreibt, trägt es hier ein** – sonst gibt es es beim nächsten Start nicht mehr. Eigene Ziele werden beim Zusammenführen über ihre Kennung vereinigt, denn das Abhaken steht in `milestones` und wandert ohnehin mit; ohne die Definition bliebe davon ein Datum ohne Namen. Davor v11, mit einer Entfernung und einer Ergänzung: `byDay` fällt weg, `wochenplan` kommt dazu (feste Trainingstage je Wochentag, Vorgabe leer – ein alter Stand rotiert damit weiter wie bisher). `byDay` zählte die Einheiten je Trainingstag mit, wurde aber nie gelesen und konnte auch nicht stimmen: `mergeStates` nahm das Maximum beider Geräte, ein CSV-Import zählte nicht mit. Gezählt wird jetzt im Log selbst (`zaehleJeTag` in `js/domain/log.js`) — dieselbe Entscheidung wie in v5 bei `streakDays`, `lastWeek` und `pauseHistory`. Entfernen genügt in der Vorgabe: `migrateState()` läuft über deren Schlüssel und lässt alles Unbekannte fallen, `clampBackup()` benutzt dieselbe Liste. Davor v10: eine Bestleistung trägt jetzt `art` (`'sek'` oder `'reps'`) und `lvl`. Ohne beides verglich `besserePR()` Sekunden mit Wiederholungen — siehe Abschnitt 8. Für Altbestände wird die Maßeinheit aus dem Text erschlossen (`'30 Sek'` → `sek`); die Stufe bleibt offen statt geraten zu werden und zählt im Vergleich als 0. Davor v9: `onboarded` (ob der Einstieg durchlaufen wurde) und `log[].dauer` (die Trainingsdauer in Sekunden; `0` heißt „nicht gemessen“ und gilt für jeden Eintrag von vor v9, für CSV-Importe und für nachgetragene Einheiten). Ob ein bestehender Stand als eingerichtet gilt, entscheidet die Migration am Verlauf und nicht am Vorgabewert – wer schon trainiert hat, wird nicht nach seinen Startstufen gefragt. Davor v8, mit zwei Feldern in einem Schritt: `equipment` (die vorhandenen Geräte, Vorgabe „alles" – ein bestehender Stand verhält sich damit unverändert; ein *leeres* Array bleibt leer, denn „ich habe gar nichts" ist eine gültige Antwort) und `deload` (`{ bis: 'YYYY-MM-DD' }` oder `null`). Beide gehören zur Einrichtung dieses Geräts und werden beim Zusammenführen zweier Stände nicht gemischt. Davor v7: der Stand führt seither in `rev` einen Revisionszähler mit, an dem zwei offene Fenster erkennen, wessen Stand der neuere ist (siehe Abschnitt 4). Davor v6: ein Log-Eintrag führt seither in `ex` die tatsächlich trainierten Übungen mit. Vorher wurden sie im *heutigen* Plan nachgeschlagen, was nach jeder Ersetzung, jedem Plan-Reset und jedem CSV-Import falsch war; für Altbestände fällt `js/domain/log.js` weiterhin auf Plan und Wiederholungsschlüssel zurück. `migrateState()` ist eine reine Funktion (`Rohwert → Stand`) und übernimmt Deep-Merge der Defaults sowie Typprüfung; `clampBackup()` daneben beschneidet importierte Backups, und der Import läuft durch beide. `LEGACY_KEYS` in `storage.js` zeigt, wie ältere Speicherschlüssel gelesen werden. Nach erfolgreicher Übernahme entfernt die App die Altschlüssel selbst.

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

Jede Übung hat Stufen. Angezeigt wird immer die aktuelle. Eine Einheit zählt als erfolgreich, wenn **jeder Satz die Obergrenze der Spanne erreicht** hat. Nach der eingestellten Anzahl solcher Einheiten in Folge (Standard: 2) steigt die Übung automatisch eine Stufe. Ein Aussetzer setzt den Zähler zurück – die Stufe bleibt.

**Wer das entscheidet.** Sind für jeden Satz Wiederholungen eingetragen, entscheiden die Zahlen: das Häkchen *„Oberes Limit in allen Sätzen geschafft"* ist dann eine Anzeige, springt bei jeder eingetippten Zahl um und nennt darunter, woraus es sich ergibt. Bei Halteübungen sind die Zahlen die gehaltenen Sekunden (siehe unten). Fehlt eine Zahl, bleibt es eine Handeingabe wie vorher. Bis hierher entschied allein das Häkchen, während die Wiederholungen daneben standen und nur für Bestleistungen und das Volumen zählten — man konnte 4 × 12 in einer 6–10-Spanne eintragen und stieg nicht auf, oder 4 × 4 eintragen, das Häkchen setzen und stieg auf. `limitErreicht()` in `js/domain/target.js` antwortet deshalb dreifach: ja, nein oder „lässt sich nicht entscheiden". Die App behauptet nichts, was sie nicht weiß.

**Tagesziel.** Unter jedem Satz steht, was heute ansteht: je Satz eine Wiederholung mehr als beim letzten Mal, gedeckelt auf die Obergrenze — die Doppelprogression, die im Modell steckt, ausgesprochen. Dieselbe Zahl steht als Platzhalter im Feld, und **ein Tipp auf einen leeren Satz trägt sie ein**: ein Tipp je Satz genügt, getippt wird nur eine Abweichung, und das obere Limit bekommt fast immer vollständige Zahlen. Eine schon eingetragene Zahl bleibt stehen. Zeile „Heute", Platzhalter, Countdown und das Eintragen per Tipp rechnen an einer Stelle (`heuteVorgabe()` in `app.js`). Standen alle Sätze schon oben, heißt das nicht, dass die Stufe ansteht, sondern „noch einmal alle Sätze oben", denn aufgestiegen wird erst nach der eingestellten Zahl Einheiten in Folge. Das Ziel erscheint **nur, wenn die letzte Einheit auf derselben Stufe lag.** Nach einem Aufstieg, einer Rückstufung oder einer Änderung von Hand stammen die Zahlen von einer anderen Variante; dann nennt die Zeile diese Variante mit Nummer, Namen und Ziel, statt ihre Zahlen als Vorgabe auszugeben – die Nummer, weil 18 Stufen heißen wie ihre Nachbarin (Liegestütze 4 und 5 sind beide „Volle Liegestütze", erst 5–10, dann 10–15). Als Vorgabe steht dann die **Untergrenze als Einstieg** in die neue Stufe, ebenso für eine Übung, die noch nie mit Zahlen trainiert wurde: wer nach dem Aufstieg gleich die Obergrenze versucht, verreißt die Form in der Variante, die er gerade erst lernt.

**Halteübungen.** Der Countdown läuft auf die heutige Vorgabe je Satz: auf einer neuen Stufe die Untergrenze, danach die zuletzt gehaltene Zeit plus ein Fünftel der Spanne (mindestens eine Sekunde), höchstens die Obergrenze – bei 10–20 Sek also zwei Sekunden je Einheit, etwa so viele Einheiten wie bei einer Wiederholungsspanne. Ein zweiter Tipp während des Countdowns beendet den Satz mit der bis dahin gehaltenen Zeit; unter einer Sekunde gilt er als versehentlicher Doppeltipp und bricht ab. Die Zeit steht im Feld neben dem Satz und lässt sich dort von Hand korrigieren, etwa nach einer anderen Uhr. Vorher lief der Countdown immer auf die Obergrenze, ein vorzeitiger Tipp verwarf den Satz, und die Untergrenze wurde in 52 Stufen nirgends gelesen.

**Wenn die Stufe zu schwer ist.** Lagen die letzten zwei Einheiten mit Zahlen beide auf der aktuellen Stufe und in **jedem** Satz unter der Untergrenze, schlägt die Karte eine leichtere Stufe vor, mit einem Knopf daneben. Automatisch geschieht nichts. Nicht auf der leichtesten Stufe, nicht bei Halteübungen und nicht bei Versuchen – ein Handstand, der fünfmal nicht stand, ist Übung und keine Überforderung.

Über die kleinen `−`/`+` Buttons an jeder Übung kannst du die Stufe jederzeit manuell korrigieren, etwa nach einer Pause oder wenn eine Variante nicht passt.

**Wenn heute etwas nicht geht:** ↻ ersetzt die Übung durch eine andere derselben Kategorie und fragt dabei, ob das *nur heute* gelten soll oder dauerhaft in den Plan wandert. „Heute auslassen" lässt sie stehen, aber ohne Sätze – zurückholen geht in derselben Einheit. Beides steht in der laufenden Einheit und übersteht ein Neuladen, ohne den Plan anzufassen.

**Aufwärmen.** Die Liste über der Tagesauswahl lässt sich abhaken; die Haken gehören zur laufenden Einheit, überstehen ein Neuladen und sind bei der nächsten wieder leer. Der Pflichtpunkt (Handgelenke) fragt beim Abschließen nach, wenn er offen blieb – aber nur, wenn überhaupt etwas abgehakt wurde. Wer die Liste gar nicht benutzt, wird nicht ermahnt; die App weiß nichts darüber, ob er sich aufgewärmt hat.

**Trainingsdauer.** Gemessen wird vom ersten Haken bis zu „Fertig" – nicht ab der Tagesauswahl, denn dazwischen liegen Umziehen und Aufwärmen. Bei Halteübungen zählt der Beginn des Haltens. Über vier Stunden gilt die Einheit als nicht gemessen: wer die App offen liegen lässt, hat keine Vierstunden-Einheit trainiert, und eine erfundene Zahl wäre schlechter als gar keine. Der Verlauf zeigt die Dauer je Einheit und einen Durchschnitt, der nur über gemessene Einheiten mittelt.

**Bestleistungen** entstehen von selbst: die höchste Wiederholungszahl und die längste **tatsächlich gehaltene** Zeit je Übung (bis v16 stand dort die Zielzeit der Stufe, sobald ein Satz abgehakt war). Sie tragen ihre **Maßeinheit** mit, denn sieben Leitern wechseln unterwegs von Sekunden auf Wiederholungen oder zurück (`handstand`, `planche`, `ring_dip`, `pike`, `hollow`, `pancake`, `hip_mob`). Bei gleicher Maßeinheit gewinnt die größere Zahl; wechselt sie, gewinnt der Eintrag von der höheren Stufe — die alte Zahl misst dann etwas anderes und ist für das, was jetzt trainiert wird, kein Rekord mehr. Alle zusammen stehen im Tab *Ziele*.

**Satz-Modi** (Einstellungen): *Einsteiger* deckelt alles auf 3 Sätze, *Standard* nutzt die Vorgaben (3–4), *Fortgeschritten* gibt überall einen Satz dazu.

**Stagnation.** Gezählt werden die Einheiten auf der **aktuellen Stufe** seit dem letzten Wechsel. Festgefahren ist eine Übung, wenn davon mindestens vier vorliegen und die letzten drei nicht über der besten Satzsumme davor liegen – bei Halteübungen in Sekunden. Eine Einheit mit allen Sätzen an der Obergrenze zählt als Fortschritt, denn dort wartet die Stufe nur noch auf die Serie. Einheiten einer Entlastungswoche zählen nicht mit, Übungen auf der höchsten Stufe sind ausgenommen. Bis v16 hieß die Regel „in vier der letzten fünf Einheiten nicht aufgestiegen". Das maß den Aufstieg, nicht den Fortschritt, und der dauert länger: eine Spanne 6–10 mit einer Wiederholung mehr je Einheit und einer Serie von 2 braucht mindestens sechs Einheiten (6 · 7 · 8 · 9 · 10 · 10). Für 70 von 102 Wiederholungsstufen hieß es damit „festgefahren", während man alles richtig machte, und ab zwei solchen Übungen kam der Vorschlag einer Entlastungswoche dazu. Welche Übungen zu einer Einheit gehörten, kommt dabei aus dem Eintrag selbst und nicht aus dem heutigen Plan – sonst bekäme eine gestern hinzugefügte Übung fünf alte Einheiten angerechnet, in denen sie nie vorkam.

**Entlastungswoche.** Nach der eingestellten Anzahl Einheiten erinnert ein Banner daran; ein Klick startet sie für sieben Tage. Solange sie läuft, sind alle Sätze halbiert – Wiederholungen und Haltezeiten bleiben, denn im Deload sinkt das Volumen, nicht die Intensität. Stufen steigen in dieser Woche nicht: das obere Limit bezieht sich auf halbierte Sätze und ist nicht dasselbe wie sonst. Der Streak bleibt dabei stehen, wird also weder erhöht noch zurückgesetzt.

---

## 8a. Geräte und Plangenerator

Jede Übung nennt in `equip`, was sie braucht. Die Liste ist ein **ODER** (`['chair','bar']` = Tischkante *oder* Stange); ein Eintrag darf mit `+` eine Kombination ausdrücken (`'bar+band'` = Stange *und* Band). Eine einzelne Progressionsstufe darf ein eigenes `equip` tragen und überschreibt damit die Übung – nötig, weil Progressionen unterwegs das Gerät wechseln: Dips fangen an der Bank an und enden auf den Parallettes. Umgekehrt steht bei Planche Lean, Stützhalte und Tuck L-Sit kein Gerät als Pflicht, das nur bequemer ist: der Lean geht am Boden, die Stütze und der Tuck L-Sit zwischen zwei Stühlen.

Markiert wird nur eigens angeschafftes Gerät. Eine erhöhte Fläche, eine Wand, ein Türrahmen oder eine Treppenstufe gilt als `none` – wer die nicht hat, dem hilft ein Filter auch nicht weiter.

Was der Nutzer in den Einstellungen anhakt, steht in `state.equipment` und wirkt an fünf Stellen: die Bibliothek kennzeichnet Nichtmachbares (und blendet es auf Wunsch aus), der Plan-Editor sperrt es im Dropdown, der Ersetzen-Dialog bietet nur Machbares an, das Training weist auf fehlendes Gerät der aktuellen Stufe hin – und die automatische Progression steigt nicht in eine Stufe auf, deren Gerät fehlt. Der Streak wird dort gedeckelt statt genullt, damit die Stufe sofort steigt, sobald das Gerät dazukommt.

**Plan aus meiner Ausrüstung** (Tab *Plan*) baut daraus einen Plan: Tage pro Woche und Schwerpunkt wählen, Vorschau ansehen, übernehmen. `js/domain/planbuilder.js` ist rein und deterministisch – gleiche Eingabe, gleicher Plan. Sortiert wird nach dem Feld `prio` in `js/exercises.js` (1 = Grundübung, 2 = Ergänzung, 3 = fortgeschritten; Vorgabe 2). Ist eine Kategorie mit der vorhandenen Ausrüstung gar nicht möglich – ohne Gerät gilt das für „Ziehen" –, wird der Tag aus allem Machbaren gefüllt und heißt danach „Ganzkörper" statt „Ziehen".

---

## 8b. Einstieg, Verlauf und Bibliothek

**Einstieg.** Beim ersten Start lädt ein Banner über der Tagesauswahl dazu ein (bewusst kein Dialog – eine App, die einen begrüßt, bevor man sie gesehen hat, wird weggeklickt). Zwei Fragen: welche Geräte da sind, und je Kategorie, welche **Stufe** man sauber schafft.

Gefragt wird ausdrücklich nicht nach Wiederholungen. Die Leitern steigen über den Hebel, nicht über die Zahl – bei den Liegestützen steht in fast jeder Stufe „4 × 6–10", vom Tisch bis zum einarmigen. Aus „20 Liegestütze" ließe sich die Stufe gar nicht ableiten. Stattdessen zeigt der Dialog die Leiter mit Namen und Ziel zur Auswahl; das ist genau statt geschätzt und erklärt nebenbei das Grundprinzip. Die Fragen richten sich nach der Ausrüstung: ohne Stange steht beim Ziehen das Rudern am Tisch statt des Klimmzugs, ohne Tisch das Rudern an der offenen Tür, und Stufen mit fehlendem Gerät stehen gar nicht erst zur Wahl.

Auf die übrigen Übungen derselben Kategorie wird nur zur **Hälfte** übertragen (`js/domain/einstieg.js`). Zu niedrig kostet eine Einheit mit zu leichtem Ziel; zu hoch bedeutet eine Übung, die sich nicht sauber ausführen lässt. Skills bleiben ganz außen vor – dazu zählen auch Wand-Handstand, Planche Lean und Front Lever, die in `exercises.js` unter *Drücken* bzw. *Ziehen* stehen. Ein bestehender Stand gilt als eingerichtet; wer den Einstieg übersprungen hat, findet ihn in den Einstellungen.

**Verlauf.** Der Zeitraum oben (8 Wochen, 26 Wochen, 12 Monate, alles) gilt für Diagramme **und** Liste. Ab einem Jahr wird nach Monaten gruppiert, sonst wären drei Jahre über 150 Balken; das Wochenziel wird dabei hochgerechnet, damit die Farbe etwas aussagt. Bei vielen Spalten scrollt das Diagramm waagerecht. Die Liste zeigt höchstens 100 Einträge und sagt darunter, wie viele der Zeitraum insgesamt hat.

Unter dem Wiederholungsdiagramm steht die **Verteilung nach Sätzen** je Bereich, Wiederholungs- und Haltesätze zusammen. Vorher zählte sie Wiederholungen: „Drücken 48, Ziehen 138" las sich wie ein Ungleichgewicht, lag aber daran, dass der Drücktag vor allem aus Halteübungen besteht, die dort nicht vorkamen.

**Verlauf je Übung** (📊 auf der Karte): Datum, Stufe, Ergebnis mit Maßeinheit und ob genau diese Übung aufgestiegen ist. Vorher standen dort Sätze, Top und Level-Ups der ganzen Einheit. Die Kurve darüber zeigt den besten Satz je Einheit nur seit dem letzten Stufenwechsel – über mehrere Stufen gezogen fiel sie nach jedem Aufstieg ab und sah genau dann nach Rückschritt aus, wenn es voranging.

**Training nachtragen.** Datum, Trainingstag und Satzzahl – für Einheiten ohne Handy. Die Satzzahl ist mit dem vorbelegt, was der Plan für den Tag vorsieht, die Übungsliste kommt aus dem Plan, und die Dauer bleibt leer. Stufen, Serien und Bestleistungen bleiben unberührt: aus einer nachgetragenen Satzzahl lässt sich nicht ablesen, was an dem Tag am oberen Limit lag.

**Meilensteine erkennen sich selbst.** Jeder trägt in `js/exercises.js` ein `when` aus Übung, Mindeststufe und Mindestwert. Beides zusammen, weil keines allein trägt: auf der Stufe angekommen zu sein heißt nicht, die Zahl zu schaffen, und 15 Wiederholungen auf Knie-Liegestützen sind keine 15 vollen. Ist die Bedingung erfüllt, trägt der Meilenstein einen Hinweis und einen Knopf — **abgehakt wird nichts von selbst.** „Sauber geschafft" ist eine Aussage über die Ausführung, und die folgt aus keiner Zahl. Offene Meilensteine nennen umgekehrt, was ihnen noch fehlt.

Wer eine Leiter umbaut, muss die Stufenindizes dort nachziehen. `test/milestones.test.js` prüft gegen die echten Daten, dass jede genannte Übung existiert, jeder Index in der Leiter liegt und die geforderte Zahl dort überhaupt erreichbar ist.

**Wochenrhythmus.** Im Tab *Plan*, unter dem Editor: je Wochentag ein Trainingstag oder nichts. Leer heißt „kein fester Rhythmus" — dann ergibt sich der nächste Tag wie bisher aus der Reihenfolge. Ist etwas eingetragen, nennt eine Zeile über der Tagesauswahl, was heute ansteht, das „dran"-Abzeichen folgt dem Wochentag statt der Rotation, und der Kalender zeigt die kommenden geplanten Tage gestrichelt. **Eine Sperre ist das nie:** am Ruhetag lässt sich jeder Tag antippen und abschließen, und der Satz sagt das auch.

Ein Tagesschlüssel, den der Plan nicht mehr kennt, bleibt in der Zuordnung stehen — der Plan darf wechseln, ohne die Einrichtung still zu löschen; gelesen wird sie ohnehin nur, wenn es den Tag gibt.

**Verteilung je Trainingstag.** Der Plan-Tab nennt hinter jedem Tagestitel, wie oft er dran war, und färbt einen deutlichen Rückstand. Eine schiefe Rotation — „A 30×, B 12×" — heißt, dass die Zugtage regelmäßig ausfallen, und das sieht man sonst nirgends. Gezählt wird im Log und nicht in einem Zähler daneben, deshalb geht die Zahl beim Löschen eines Eintrags sofort mit.

**In den Kalender.** Unter dem Wochenrhythmus steht ein Export als `.ics`: je belegtem Wochentag ein wöchentlich wiederkehrender Termin mit Vorwarnung, Startzeit frei wählbar. Das ist der ehrliche Weg zur Erinnerung — eine PWA kann nur benachrichtigen, solange ihre Seite lebt, der Kalender des Geräts braucht sie überhaupt nicht. Wo das Gerät Dateien teilen kann, geht die Datei über das Systemblatt direkt in den Kalender statt in den Download-Ordner.

`js/domain/ics.js` ist rein wie der Rest der Schicht (Datum, Zeitstempel und die Beschriftung der Plan-Tage kommen herein). Drei Dinge, die eine selbstgebaute `.ics` üblicherweise falsch macht, sind dort richtig: Komma, Semikolon und Backslash im Titel sind maskiert (sonst wäre „B · Pull, Beine & Core" ein zweiter Feldwert), Zeilen sind auf 75 **Oktette** gefaltet und nicht auf 75 Zeichen, und die Uhrzeit steht ohne Zeitzone da (RFC 5545 3.3.5) — 18 Uhr heißt 18 Uhr, wo immer man ist. Die Kennung je Wochentag ist fest, damit ein zweiter Import die Termine aktualisiert statt zu verdoppeln.

**Trainingserinnerung.** Optional in den Einstellungen, und mit Absicht schwach: angesetzt wird sie, wenn die App in den Hintergrund geht, und sie fällt aus, sobald man zurückkommt oder die Einheit abgeschlossen ist — höchstens einmal am Tag. Eine Meldung, die kommt, während man auf die App schaut, ist keine Erinnerung; genau das tat sie vorher bei jedem Start. Verlässlich wird es erst über den Kalender-Export.

**Jahresrückblick.** Unten im Verlauf: Trainings, Level-Ups, Meilensteine, Wiederholungen, gehaltene Zeit und die meistgeübte Übung des laufenden Jahres – ohne Mobility, sonst stand dort die Handgelenks-Routine, also das Aufwärmen. Alles aus dem Log gerechnet und alles auf das Jahr gefiltert — auch die Meilensteine, deren gespeicherter Wert das Datum des ersten Mals ist.

**Eigene Meilensteine.** Neben den 20 festen lassen sich eigene Ziele anlegen. Sie tragen keine Bedingung und erkennen sich deshalb nicht selbst; abgehakt werden sie wie alle anderen von Hand.

**Bibliothek.** Jeder Eintrag nennt, wann die Übung zuletzt dran war; ab zwei Wochen steht ein Hinweis daneben. Sortieren lässt sich nach Kategorie (Vorgabe), „am längsten nicht trainiert" (nie Trainiertes zuerst) oder Fortschritt.

---

## 9. Bekannte Einschränkungen

Bewusste Entscheidungen, keine offenen Aufgaben – damit niemand danach sucht:

- **Der Pausenton erreicht keinen gesperrten Bildschirm.** Beide Timer hängen an einem absoluten Zielzeitpunkt und gehen deshalb nicht nach; der Ton kommt aber erst, wenn die Seite wieder sichtbar ist. Dafür bräuchte es Systembenachrichtigungen – siehe Abschnitt 10.
- **Kein Zusatzgewicht.** Das Modell ist stufen-, nicht lastbasiert: ein Ziel kennt Sätze und Wiederholungen oder Sekunden, aber keine Last. Ein Gewichtsfeld je Satz bräche Aufstiegsregel und Tagesziel auf, die beide an der Wiederholungszahl hängen. Das Freitextfeld der Bestleistung trägt „+10 kg" heute schon.
- **Der Countdown läuft durch, auch wenn man absetzt.** Die App erkennt nicht, wann ein Halten endet; das sagt ihr der zweite Tipp. Wer ihn vergisst, bekommt die volle Vorgabe eingetragen und kann sie im Feld daneben korrigieren.
- **Die Abdeckung misst nur `js/domain/**`** (90 % Zeilen und Funktionen, 80 % Zweige, `vitest.config.js`). `js/app.js` wird von `test/app.test.js` durch echte Klicks gefahren, taucht in der Messung aber nicht auf – es gibt also keine Zahl dafür, wie viel davon läuft.
- **`js/app.js` ist noch eine Datei** (gut 4000 Zeilen). Der ursprüngliche Grund für eine Aufteilung war die Testbarkeit; die ist mit `js/main.js` und `test/app.test.js` erledigt. Übrig ist die Größe, und die Aufteilung in ES-Module ist als eigene Runde vorgesehen — getrennt von Verhaltensänderungen, damit ein Umbau ohne sichtbare Wirkung nicht im selben Diff liegt wie einer mit.
- **Halteübungen zählen nicht ins Volumendiagramm.** Sie haben keine Wiederholungen; ihre Zeit unter Spannung ließe sich nur aus der Zielangabe schätzen, und eine geschätzte Zahl neben gezählten wäre irreführend. Über die Satzzahl zählen sie weiter mit.
- **Der CSV-Export enthält keine Trainingsdauer und keine Haltezeiten.** Die Wiederholungen sind seit Längerem drin (Spalten `Uebungen` und `Wdh`, siehe `js/domain/csv.js`) und überstehen einen Roundtrip; die Dauer nicht. Eine weitere Spalte wäre eine Formatänderung mit Rückwirkung auf den Import. Der CSV ist der Verlaufs-Export — das vollständige Abbild ist das JSON-Backup.
- **Gewichts- und Messreihen sind bei 1000 Einträgen gekappt** (`MAX_SERIES_ENTRIES`), das Trainingslog bei 2000. Bei täglichem Wiegen ist die erste Grenze nach knapp drei Jahren erreicht, die zweite bei vier Einheiten pro Woche nach gut neun. Gekappt wird beim Laden und bei jedem Import, und zwar am älteren Ende ohne Hinweis.
- **Die Startstufen des Einstiegs sind für die Ankerübung genau und für alles andere geschätzt.** Die Übertragung auf die übrige Kategorie ist bewusst gedämpft und bleibt eine Vermutung – jede Stufe lässt sich in der Bibliothek mit ± nachziehen.
- **Die Meilenstein-Erkennung ist ein Vorschlag, kein Urteil.** Sie liest Stufe und Bestleistung, sieht aber keine Ausführung. Ein Meilenstein ohne `when` bliebe stumm statt als „nicht geschafft" zu gelten — derzeit tragen alle 20 eine Bedingung.
- **Die Trainingserinnerung der App erreicht keine geschlossene App.** Ohne Server kann eine PWA nur benachrichtigen, solange ihre Seite lebt; wird sie vom System eingefroren oder geschlossen, fällt die Erinnerung aus. Deshalb bleibt sie eine schwache Zusatzfunktion und der Kalender-Export der eigentliche Weg (Abschnitt 8b).
- **Geräte markieren nur Angeschafftes.** Wand, Türrahmen, Treppenstufe und erhöhte Flächen gelten als „kein Gerät"; ein Filter darauf wäre Schikane statt Hilfe.

---

## 10. Später eine echte Desktop-App?

Der Code läuft unverändert in [Tauri](https://tauri.app/): ein neues Tauri-Projekt anlegen, den Ordnerinhalt als Frontend eintragen, fertig ist eine kleine `.exe` (wenige MB, im Gegensatz zu Electron). Sinnvoll wird das erst, wenn du Dinge brauchst, die der Browser nicht kann – etwa eine Erinnerung, die auch bei geschlossener App kommt, den Pausenton bei gesperrtem Bildschirm oder Autostart. Für die Erinnerung gibt es inzwischen einen Weg ohne Umzug: der Kalender-Export im Tab *Plan* (Abschnitt 8b) übergibt die Trainingstage an den Kalender des Geräts, und der erinnert ohne die App. Für den normalen Gebrauch reicht die installierte PWA.

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

/* =========================================================
   ÜBUNGSDATENBANK
   ---------------------------------------------------------
   Neue Übung hinzufügen: einfach einen Block in EXERCISES
   ergänzen. Wichtig: die "id" NIE nachträglich ändern –
   daran hängt der gespeicherte Fortschritt!

   Felder:
     id        eindeutiger Schlüssel (klein, ohne Leerzeichen)
     name      Anzeigename
     cat       push | pull | legs | core | skill | mobility
     equip     Array: none | chair | bar | parallettes | rings | band
               ODER-Liste; ein Eintrag darf mit "+" eine Kombination
               ausdrücken ("bar+band" = Stange UND Band). Die Auswertung
               steht in js/domain/equipment.js.
     muster    Bewegungsmuster: h_druecken, dip, v_druecken, v_ziehen,
               h_ziehen, schulter, kniebeuge, huefte, wade, rumpf_vorn,
               rumpf_seite, mobility – oder bei Skills die Linie (handstand,
               planche, front_lever, back_lever, muscle_up, lsit, elbow_lever).
               Daran füllt der Plangenerator seine Plätze, und eine Vorlage
               ersetzt eine nicht machbare Übung durch eine mit demselben
               Muster (js/domain/planbuilder.js).
     prio      1 = Grundübung, 2 = Ergänzung, 3 = fortgeschritten.
               Vorgabe 2. Danach sortiert der Plangenerator
               (js/domain/planbuilder.js), sonst wird das Feld nicht gelesen.
     rest      empfohlene Satzpause in Sekunden (optional)
     levels    Progressionsstufen, von leicht nach schwer
               { stage: Variantenname, saetze: 4, wdh: [6, 10] }
               Halteübungen:   { ..., saetze: 4, sek: [10, 20] }
               Versuche:       { ..., saetze: 4, wdh: [5, 8], art: 'versuche' }
               Ein fester Wert steht als [n, n]. Bis hierher war das ein Text
               wie '4 × 6–10', den drei reguläre Ausdrücke zerlegten – ein
               Tippfehler ergab dort still „3 Sätze, keine Wiederholungen".
               test/target.test.js prüft jetzt jede Stufe.
               Eine Stufe darf ein eigenes "equip" tragen und überschreibt
               damit die Angabe der Übung – nötig, weil Progressionen
               unterwegs das Gerät wechseln (Dips: Bank → Parallettes).
     tips      Array mit Ausführungshinweisen

   Zur Geräteangabe: markiert wird nur eigens angeschafftes Gerät. Eine
   erhöhte Fläche, eine Wand, ein Türrahmen oder eine Treppenstufe gilt als
   "none" – wer die nicht hat, dem hilft ein Filter auch nicht weiter.
   ========================================================= */

export const CATS = {
  push:     { name: 'Drücken',   icon: '↑' },
  pull:     { name: 'Ziehen',    icon: '↓' },
  legs:     { name: 'Beine',     icon: '⌃' },
  core:     { name: 'Rumpf',     icon: '◆' },
  skill:    { name: 'Skills',    icon: '★' },
  mobility: { name: 'Mobility',  icon: '~' }
};

export const EXERCISES = [

  /* ================= DRÜCKEN ================= */
  {
    id: 'pushup', name: 'Liegestütze', cat: 'push', muster: 'h_druecken', equip: ['none'], prio: 1, rest: 90,
    levels: [
      { stage: 'Erhöht (Tisch)', saetze: 4, wdh: [6, 10] },
      { stage: 'Erhöht (Bank/Stufe)', saetze: 4, wdh: [6, 10] },
      { stage: 'Knie-Liegestütze', saetze: 4, wdh: [8, 12] },
      { stage: 'Volle Liegestütze', saetze: 4, wdh: [5, 10] },
      { stage: 'Volle Liegestütze', saetze: 4, wdh: [10, 15] },
      { stage: 'Auf Parallettes (tiefer)', saetze: 4, wdh: [8, 12], equip: ['parallettes'] },
      { stage: 'Pseudo-Planche Liegestütze', saetze: 4, wdh: [4, 8] }
    ],
    tips: [
      'Körper als Brett: Bauch und Po fest anspannen, Rippen nach unten.',
      'Ellbogen ca. 45° am Körper – nicht seitlich abspreizen.',
      'Volle Bewegungsamplitude: Brust bis Richtung Kante/Boden.'
    ]
  },
  {
    id: 'diamond', name: 'Diamant-Liegestütze', cat: 'push', muster: 'h_druecken', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Erhöht', saetze: 3, wdh: [6, 10] },
      { stage: 'Auf Knien', saetze: 3, wdh: [8, 12] },
      { stage: 'Voll', saetze: 3, wdh: [6, 10] }
    ],
    tips: [
      'Hände bilden ein Dreieck unter der Brust – Daumen und Zeigefinger berühren sich.',
      'Trizeps-Betonung: Ellbogen bleiben eng am Körper.',
      'Gut als Ergänzung, wenn Dips noch zu schwer sind.'
    ]
  },
  {
    id: 'archer_push', name: 'Archer-Liegestütze', cat: 'push', muster: 'h_druecken', equip: ['none'], prio: 3, rest: 120,
    levels: [
      { stage: 'Erhöht, leichte Verlagerung', saetze: 3, wdh: [5, 8] },
      { stage: 'Voll, halbe Verlagerung', saetze: 3, wdh: [5, 8] },
      { stage: 'Voll, Arm fast gestreckt', saetze: 3, wdh: [4, 6] }
    ],
    tips: [
      'Angaben gelten je Seite. Ein Arm beugt, der andere streckt sich seitlich.',
      'Der Weg zum einarmigen Liegestütz – erst wenn 15 volle Liegestütze sitzen.',
      'Hüfte bleibt parallel zum Boden, kein Verdrehen.'
    ]
  },
  {
    id: 'one_arm_push', name: 'Einarmiger Liegestütz', cat: 'push', muster: 'h_druecken', equip: ['none'], prio: 3, rest: 120,
    levels: [
      { stage: 'Einarmig erhöht (Tisch)', saetze: 3, wdh: [5, 8] },
      { stage: 'Einarmig erhöht (Bank/Stufe)', saetze: 3, wdh: [4, 8] },
      { stage: 'Einarmig am Boden, Negativ', saetze: 3, wdh: [3, 5] },
      { stage: 'Einarmiger Liegestütz', saetze: 3, wdh: [1, 5] }
    ],
    tips: [
      'Angaben gelten je Seite. Füße weit auseinander, der freie Arm liegt auf dem Rücken.',
      'Hüfte und Schultern bleiben parallel zum Boden – das Verdrehen ist der typische Ausweg.',
      'Erst wenn Archer-Liegestütze mit fast gestrecktem Arm sauber sitzen.'
    ]
  },
  {
    id: 'support', name: 'Stützhalte', cat: 'push', muster: 'dip', equip: ['parallettes', 'chair'], rest: 60,
    levels: [
      { stage: 'Support Hold', saetze: 4, sek: [10, 20] },
      { stage: 'Support Hold', saetze: 4, sek: [20, 30] },
      { stage: 'Support Hold', saetze: 4, sek: [30, 45] },
      { stage: 'Support + leichter Lean', saetze: 4, sek: [15, 25] }
    ],
    tips: [
      'Arme komplett gestreckt, Ellbogen "einrasten".',
      'Schultern aktiv nach unten drücken – weg von den Ohren (Depression).',
      'Basis für L-Sit, Dips und später die Planche.',
      'Ohne Parallettes: zwischen zwei stabilen Stühlen, Lehnen nach außen.'
    ]
  },
  {
    id: 'dips', name: 'Dips', cat: 'push', muster: 'dip', equip: ['chair', 'parallettes', 'rings'], prio: 1, rest: 120,
    levels: [
      { stage: 'Bank-Dips (Füße am Boden)', saetze: 3, wdh: [8, 12], equip: ['chair'] },
      { stage: 'Stuhl-Dips mit Fußunterstützung', saetze: 3, wdh: [6, 10], equip: ['chair'] },
      { stage: 'Negativ-Dips (Parallettes)', saetze: 3, wdh: [4, 6], equip: ['parallettes', 'rings'] },
      { stage: 'Dips auf Parallettes', saetze: 3, wdh: [5, 8], equip: ['parallettes', 'rings'] },
      { stage: 'Dips auf Parallettes', saetze: 3, wdh: [8, 12], equip: ['parallettes', 'rings'] }
    ],
    tips: [
      'Schultern unten halten, nicht zu den Ohren ziehen.',
      'Kontrolliert ablassen, bis der Oberarm etwa parallel ist.',
      'Bei Schmerz vorn in der Schulter: Bewegungsumfang verkleinern.',
      'Stuhl-Dips: zwei Stühle nebeneinander, Füße vorn am Boden und nur so viel Gewicht darauf wie nötig.'
    ]
  },
  {
    id: 'ring_pushup', name: 'Ring-Liegestütze', cat: 'push', muster: 'h_druecken', equip: ['rings'], rest: 90,
    levels: [
      { stage: 'Ringe hoch, Körper steil', saetze: 4, wdh: [8, 12] },
      { stage: 'Ringe tief, Körper flacher', saetze: 4, wdh: [6, 10] },
      { stage: 'Ringe knapp über dem Boden', saetze: 3, wdh: [6, 10] },
      { stage: 'Füße erhöht', saetze: 3, wdh: [5, 8] },
      { stage: 'Mit Auswärtsdrehung (RTO)', saetze: 3, wdh: [5, 8] }
    ],
    tips: [
      'Die Ringe wackeln – genau das ist der Reiz. Schultern und Rumpf halten dagegen.',
      'Die Last stellst du über die Höhe ein, nicht über die Wiederholungen: je tiefer die Ringe, desto schwerer.',
      'RTO heißt, oben die Handflächen nach außen zu drehen. Erst wenn die Grundform ruhig steht.'
    ]
  },
  {
    id: 'ring_dip', name: 'Ring-Dips', cat: 'push', muster: 'dip', equip: ['rings'], rest: 150,
    levels: [
      { stage: 'Stützhalte an den Ringen', saetze: 4, sek: [10, 20] },
      { stage: 'Stützhalte mit Auswärtsdrehung', saetze: 4, sek: [15, 25] },
      { stage: 'Negativ, 5 Sek ablassen', saetze: 3, wdh: [3, 5] },
      { stage: 'Ring-Dips', saetze: 3, wdh: [4, 8] },
      { stage: 'Ring-Dips mit RTO oben', saetze: 3, wdh: [5, 8] }
    ],
    tips: [
      'Deutlich schwerer als Dips auf Parallettes: die Ringe wollen zusätzlich stabilisiert werden.',
      'Ringe eng am Körper führen, Handgelenke neutral – nicht nach außen kippen lassen.',
      'Erst angehen, wenn die Stützhalte 30 Sekunden ruhig steht.'
    ]
  },
  {
    id: 'pike', name: 'Pike-Progression', cat: 'push', muster: 'v_druecken', equip: ['none'], prio: 1, rest: 90,
    levels: [
      { stage: 'Pike-Halte', saetze: 3, sek: [15, 20] },
      { stage: 'Pike-Halte', saetze: 3, sek: [25, 35] },
      { stage: 'Pike, Füße erhöht (Halte)', saetze: 3, sek: [15, 25] },
      { stage: 'Pike Push-ups', saetze: 3, wdh: [5, 10] }
    ],
    tips: [
      'Po so hoch wie möglich, Gewicht auf die Schultern schieben.',
      'Blick zwischen die Hände, Nacken lang.',
      'Direkter Kraftaufbau für den späteren Handstand-Push-up.'
    ]
  },
  {
    id: 'planche_lean', name: 'Planche Lean', cat: 'push', muster: 'planche', equip: ['none'], prio: 3, rest: 90,
    levels: [
      { stage: 'Leichter Lean', saetze: 3, sek: [10, 15] },
      { stage: 'Mittlerer Lean', saetze: 3, sek: [15, 20] },
      { stage: 'Deutlicher Lean', saetze: 3, sek: [20, 30] },
      { stage: 'Max Lean (Füße auf Zehenspitzen)', saetze: 4, sek: [15, 25] }
    ],
    tips: [
      'Liegestützposition am Boden, Schultern vor die Hände lehnen. Parallettes entlasten die Handgelenke, sind aber nicht nötig.',
      'Nur so weit, wie Ellbogen gestreckt und Schulterblätter geschoben bleiben.',
      'Handgelenke vorher gründlich aufwärmen – hier liegt viel Last darauf.'
    ]
  },
  {
    id: 'wall_hs', name: 'Wand-Handstand', cat: 'push', muster: 'handstand', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Wand-Plank, flacher Winkel', saetze: 3, sek: [20, 30] },
      { stage: 'Wand-Plank, steiler', saetze: 3, sek: [30, 45] },
      { stage: 'Brust zur Wand Handstand', saetze: 3, sek: [15, 25] },
      { stage: 'Brust zur Wand Handstand', saetze: 3, sek: [30, 45] },
      { stage: 'Wand-Handstand + Wandläufe', saetze: 4, sek: [20, 30] }
    ],
    tips: [
      'Aktiv aus den Schultern herausdrücken – so lang wie möglich machen.',
      'Bauch fest, Rippen nach unten, kein Hohlkreuz.',
      '"Brust zur Wand" ist die bessere Variante: sie erzwingt die gerade Linie.'
    ]
  },

  /* ================= ZIEHEN ================= */
  {
    id: 'hang', name: 'Dead Hang', cat: 'pull', muster: 'schulter', equip: ['bar', 'rings'], prio: 1, rest: 60,
    levels: [
      { stage: 'Passiv hängen', saetze: 4, sek: [15, 30] },
      { stage: 'Passiv hängen', saetze: 4, sek: [30, 45] },
      { stage: 'Passiv hängen', saetze: 4, sek: [45, 60] },
      { stage: 'Aktiv hängen (Schultern unten)', saetze: 4, sek: [20, 40] },
      { stage: 'Einarmig unterstützt', saetze: 4, sek: [15, 25] }
    ],
    tips: [
      'Griff etwas breiter als schulterbreit, Daumen umgreifen die Stange.',
      'Ruhig weiteratmen, Schultern dürfen anfangs passiv hängen.',
      'Baut Griffkraft – das Fundament für alles an der Stange.'
    ]
  },
  {
    id: 'scap', name: 'Scapula Pull-ups', cat: 'pull', muster: 'schulter', equip: ['bar', 'rings'], prio: 2, rest: 60,
    levels: [
      { stage: 'Scapula Pull-ups', saetze: 3, wdh: [5, 8] },
      { stage: 'Scapula Pull-ups', saetze: 3, wdh: [8, 12] },
      { stage: 'Mit 2 Sek Pause oben', saetze: 3, wdh: [6, 10] }
    ],
    tips: [
      'Arme bleiben komplett gestreckt – nur die Schulterblätter ziehen dich hoch.',
      'Stell dir vor, du schiebst die Stange nach unten.',
      'Der Schlüsselbaustein für den ersten Klimmzug.'
    ]
  },
  {
    id: 'pullup', name: 'Klimmzug-Progression', cat: 'pull', muster: 'v_ziehen', equip: ['bar', 'rings'], prio: 1, rest: 150,
    levels: [
      { stage: 'Negativ, 3 Sek ablassen', saetze: 4, wdh: [3, 5] },
      { stage: 'Negativ, 5–8 Sek ablassen', saetze: 4, wdh: [3, 5] },
      { stage: 'Erster Klimmzug + Negativs', saetze: 5, wdh: [1, 1] },
      { stage: 'Klimmzüge', saetze: 4, wdh: [1, 3] },
      { stage: 'Klimmzüge', saetze: 4, wdh: [3, 5] },
      { stage: 'Klimmzüge', saetze: 4, wdh: [6, 10] }
    ],
    tips: [
      'Mit Sprung oder Stuhl nach oben, Kinn über die Stange, dann langsam ablassen.',
      'Die letzten Zentimeter nicht fallen lassen – dort passiert der Kraftaufbau.',
      '2–3 Minuten Pause zwischen den Sätzen, das ist schwere Kraftarbeit.'
    ]
  },
  {
    id: 'row', name: 'Rudern (horizontal)', cat: 'pull', muster: 'h_ziehen', equip: ['chair', 'bar', 'rings'], prio: 1, rest: 90,
    levels: [
      { stage: 'Tisch-Rudern, Knie gebeugt', saetze: 4, wdh: [8, 12], equip: ['chair'] },
      { stage: 'Tisch-Rudern, Beine gestreckt', saetze: 4, wdh: [8, 12], equip: ['chair'] },
      { stage: 'Australian Pull-ups (tiefe Stange)', saetze: 4, wdh: [8, 12], equip: ['bar', 'rings'] },
      { stage: 'Australian, Füße erhöht', saetze: 4, wdh: [8, 12], equip: ['bar', 'rings'] }
    ],
    tips: [
      'Unter einem stabilen Tisch oder einer tiefen Stange: Brust zur Kante ziehen.',
      'Schulterblätter zuerst zusammenziehen, dann die Arme beugen.',
      'Die unterschätzte Übung für den ersten Klimmzug – trainiert dieselbe Zugrichtung mit weniger Last.'
    ]
  },
  {
    id: 'ring_row', name: 'Ring-Rows', cat: 'pull', muster: 'h_ziehen', equip: ['rings'], prio: 1, rest: 90,
    levels: [
      { stage: 'Körper steil, Füße unter den Ringen', saetze: 4, wdh: [8, 12] },
      { stage: 'Körper flacher', saetze: 4, wdh: [8, 12] },
      { stage: 'Waagerecht, Fersen am Boden', saetze: 4, wdh: [8, 12] },
      { stage: 'Waagerecht, Füße erhöht', saetze: 4, wdh: [8, 12] },
      { stage: 'Einarmig unterstützt', saetze: 3, wdh: [5, 8] }
    ],
    tips: [
      'Der Winkel bestimmt die Last – ein Schritt nach vorn oder zurück verstellt sie feiner als jede Gewichtsscheibe.',
      'Schulterblätter zuerst zusammenziehen, dann die Arme beugen.',
      'Der Körper bleibt ein Brett: Hüfte nicht durchhängen lassen.'
    ]
  },
  {
    id: 'band_pullup', name: 'Klimmzug mit Band', cat: 'pull', muster: 'v_ziehen', equip: ['bar+band', 'rings+band'], rest: 150,
    levels: [
      { stage: 'Dickes Band, viel Unterstützung', saetze: 4, wdh: [5, 8] },
      { stage: 'Mittleres Band', saetze: 4, wdh: [5, 8] },
      { stage: 'Dünnes Band', saetze: 4, wdh: [4, 6] },
      { stage: 'Dünnes Band, nur die letzten Wiederholungen', saetze: 4, wdh: [3, 5] }
    ],
    tips: [
      'Band über die Stange schlingen und Knie oder Fuß hineinstellen. Unten hilft es am meisten, oben kaum.',
      'Der zweite Weg zum ersten Klimmzug neben den Negativen – hier bleibt die volle Bewegung erhalten.',
      'Sobald ein dünnes Band 6 saubere Wiederholungen trägt: den ersten freien Klimmzug versuchen.'
    ]
  },
  {
    id: 'chinup', name: 'Chin-ups (Kammgriff)', cat: 'pull', muster: 'v_ziehen', equip: ['bar', 'rings'], rest: 150,
    levels: [
      { stage: 'Negativ, 3–5 Sek', saetze: 3, wdh: [3, 5] },
      { stage: 'Chin-ups', saetze: 3, wdh: [1, 3] },
      { stage: 'Chin-ups', saetze: 3, wdh: [4, 8] }
    ],
    tips: [
      'Handflächen zeigen zu dir – dadurch hilft der Bizeps stärker mit.',
      'Meist gelingt der erste Chin-up vor dem ersten Klimmzug.',
      'Ellbogen aktiv nach unten Richtung Hüfte ziehen.'
    ]
  },
  {
    id: 'front_lever', name: 'Front Lever', cat: 'pull', muster: 'front_lever', equip: ['bar', 'rings'], prio: 3, rest: 120,
    levels: [
      { stage: 'Tuck Hang (Knie an Brust)', saetze: 4, sek: [10, 15] },
      { stage: 'Tuck Front Lever', saetze: 4, sek: [8, 15] },
      { stage: 'Advanced Tuck', saetze: 4, sek: [8, 12] },
      { stage: 'One-Leg Front Lever', saetze: 4, sek: [6, 10] }
    ],
    tips: [
      'Arme gestreckt, Schultern nach unten und hinten ziehen.',
      'Rücken rund halten (Hollow) – kein Hohlkreuz.',
      'Erst sinnvoll, wenn du 5+ saubere Klimmzüge schaffst.'
    ]
  },

  {
    id: 'face_pull', name: 'Face Pulls mit Band', cat: 'pull', muster: 'schulter', equip: ['band'], rest: 60,
    levels: [
      { stage: 'Face Pulls im Stehen', saetze: 3, wdh: [12, 15] },
      { stage: 'Mit 2 Sek Halten hinten', saetze: 3, wdh: [10, 12] },
      { stage: 'Mit Außenrotation am Ende', saetze: 3, wdh: [10, 12] }
    ],
    tips: [
      'Band auf Gesichtshöhe befestigen und zu den Ohren ziehen – die Ellbogen bleiben oben.',
      'Der Gegenspieler zu allem Drücken. Hält die Schultern gesund, wenn viel Liegestütz und Dip im Plan steht.',
      'Leichtes Band, saubere Ausführung. Hier zählt die Bewegung, nicht der Widerstand.'
    ]
  },
  /* Ziehen ohne Gerät. Bis hierher war keine einzige Zugübung ohne Stange,
     Ringe oder Band möglich – der Plangenerator machte den Zugtag dann zu
     "Ganzkörper", und wer zu Hause trainierte, drückte nur. prio 2, damit
     beide bei vorhandenem Gerät nicht die Klimmzüge verdrängen. */
  {
    id: 'towel_row', name: 'Türrahmen-Rudern', cat: 'pull', muster: 'h_ziehen', equip: ['none'], prio: 2, rest: 90,
    levels: [
      { stage: 'An der offenen Tür, Körper steil', saetze: 4, wdh: [8, 12] },
      { stage: 'Füße näher an der Tür, Körper flacher', saetze: 4, wdh: [8, 12] },
      { stage: 'Handtuch über die Türklinken, Körper flach', saetze: 4, wdh: [8, 12] },
      { stage: 'Einarmig, Körper steil', saetze: 3, wdh: [5, 8] }
    ],
    tips: [
      'Tür weit öffnen, beide Klinken greifen, Füße links und rechts der Türkante. Vorher prüfen, dass Klinken und Scharniere fest sitzen.',
      'Erst die Schulterblätter zurückziehen, dann die Ellbogen eng am Körper nach hinten.',
      'Je näher die Füße an der Tür, desto flacher der Körper und desto schwerer die Wiederholung.'
    ]
  },
  {
    id: 'floor_pull', name: 'Boden-Latzug', cat: 'pull', muster: 'v_ziehen', equip: ['none'], prio: 2, rest: 60,
    levels: [
      { stage: 'Auf dem Handtuch, halbe Strecke', saetze: 4, wdh: [8, 12] },
      { stage: 'Auf dem Handtuch, volle Strecke', saetze: 4, wdh: [8, 12] },
      { stage: 'Volle Strecke, 2 Sek Halten am Ende', saetze: 4, wdh: [8, 12] },
      { stage: 'Einarmig im Wechsel', saetze: 3, wdh: [5, 8] }
    ],
    tips: [
      'Bauchlage auf glattem Boden, ein Handtuch unter Brust und Hüfte. Die Arme liegen gestreckt vor dem Kopf, die Handflächen flach am Boden.',
      'Hände fest in den Boden drücken und den Körper nach vorn ziehen, bis die Hände neben den Schultern liegen – die Ellbogen gehen dabei Richtung Hüfte.',
      'Arbeitet den breiten Rückenmuskel wie ein Klimmzug, nur flach. Auf Teppich fehlt das Gleiten; dort lieber Fliesen oder Parkett.'
    ]
  },
  {
    id: 'prone_ytw', name: 'Y-T-W liegend', cat: 'pull', muster: 'schulter', equip: ['none'], prio: 2, rest: 45,
    levels: [
      { stage: 'Y, T und W je einmal = eine Wiederholung', saetze: 3, wdh: [6, 10] },
      { stage: 'Mit 2 Sek Halten in jeder Position', saetze: 3, wdh: [6, 10] },
      { stage: 'Reverse Snow Angels', saetze: 3, wdh: [10, 12] }
    ],
    tips: [
      'Bauchlage, Stirn auf einem Handtuch, Daumen zeigen nach oben.',
      'Die Arme heben die Schulterblätter an, nicht der untere Rücken – Bauch bleibt am Boden.',
      'Stärkt die Muskeln zwischen den Schulterblättern, die bei viel Drücken zu kurz kommen.'
    ]
  },

  /* ================= BEINE ================= */
  {
    id: 'squat', name: 'Kniebeugen', cat: 'legs', muster: 'kniebeuge', equip: ['none'], prio: 1, rest: 90,
    levels: [
      { stage: 'Kniebeugen', saetze: 4, wdh: [12, 15] },
      { stage: 'Tiefe Kniebeugen', saetze: 4, wdh: [15, 20] },
      { stage: 'Tempo-Kniebeugen (3 Sek runter)', saetze: 4, wdh: [12, 15] },
      { stage: 'Bulgarian Split Squats', saetze: 3, wdh: [8, 12] },
      { stage: 'Bulgarian Split Squats, 2 Sek Pause unten', saetze: 3, wdh: [8, 12] }
    ],
    tips: [
      'Fersen bleiben am Boden, Knie folgen der Fußrichtung.',
      'So tief wie sauber möglich – Rücken bleibt neutral.',
      'Tempo: 2 Sekunden runter, kontrolliert hoch.'
    ]
  },
  {
    id: 'lunge', name: 'Ausfallschritte', cat: 'legs', muster: 'kniebeuge', equip: ['none'], prio: 1, rest: 90,
    levels: [
      { stage: 'Ausfallschritte', saetze: 3, wdh: [8, 10] },
      { stage: 'Ausfallschritte', saetze: 3, wdh: [12, 15] },
      { stage: 'Rückwärts mit Defizit', saetze: 3, wdh: [8, 12] }
    ],
    tips: [
      'Angaben gelten je Bein.',
      'Oberkörper aufrecht, hinteres Knie Richtung Boden.',
      'Über die vordere Ferse hochdrücken.'
    ]
  },
  {
    id: 'pistol', name: 'Einbeinige Kniebeuge', cat: 'legs', muster: 'kniebeuge', equip: ['chair'], prio: 3, rest: 120,
    levels: [
      { stage: 'Assisted (an Türrahmen)', saetze: 3, wdh: [5, 8], equip: ['none'] },
      { stage: 'Box Squat einbeinig (hoch)', saetze: 3, wdh: [5, 8], equip: ['chair'] },
      { stage: 'Box Squat einbeinig (tief)', saetze: 3, wdh: [5, 8], equip: ['chair'] },
      { stage: 'Pistol Squat', saetze: 3, wdh: [3, 6], equip: ['none'] }
    ],
    tips: [
      'Angaben gelten je Bein.',
      'Freies Bein nach vorn strecken, Arme als Gegengewicht.',
      'Braucht Balance und Knöchel-Beweglichkeit – Geduld haben.'
    ]
  },
  {
    id: 'glute_bridge', name: 'Glute Bridge', cat: 'legs', muster: 'huefte', equip: ['none'], prio: 1, rest: 60,
    levels: [
      { stage: 'Beidbeinig', saetze: 3, wdh: [15, 20] },
      { stage: 'Beidbeinig, Füße erhöht', saetze: 3, wdh: [12, 15] },
      { stage: 'Einbeinig', saetze: 3, wdh: [10, 12] }
    ],
    tips: [
      'Po oben 1–2 Sekunden fest zusammendrücken.',
      'Wichtig als Gegenspieler zum vielen Sitzen – gute Hüftstreckung hilft auch im Handstand.',
      'Rippen nach unten, kein Überstrecken im unteren Rücken.'
    ]
  },
  {
    id: 'calf', name: 'Wadenheben', cat: 'legs', muster: 'wade', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Beidbeinig', saetze: 3, wdh: [15, 20] },
      { stage: 'Beidbeinig an Stufe (volle Amplitude)', saetze: 3, wdh: [15, 20] },
      { stage: 'Einbeinig an Stufe', saetze: 3, wdh: [10, 15] }
    ],
    tips: [
      'Langsam ablassen, unten kurz dehnen.',
      'Oben 1 Sekunde halten.',
      'Stärkt Sprunggelenke – hilft bei Sprüngen in den Handstand.'
    ]
  },
  {
    id: 'nordic', name: 'Beinbeuger (Nordic-Progression)', cat: 'legs', muster: 'huefte', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Kniebeugen mit gestreckten Beinen (Good Morning)', saetze: 3, wdh: [12, 15] },
      { stage: 'Nordic Negativ (kurzer Weg)', saetze: 3, wdh: [5, 8] },
      { stage: 'Nordic Negativ (weiter Weg)', saetze: 3, wdh: [4, 6] }
    ],
    tips: [
      'Füße unter etwas Schweres klemmen oder von jemandem halten lassen.',
      'So langsam wie möglich nach vorn ablassen, dann mit den Händen abfangen.',
      'Schützt die hinteren Oberschenkel und Knie – oft vernachlässigt.'
    ]
  },
  /* Die Hüftbeugung fehlte als Grundmuster ganz: die Beine bestanden aus
     Kniebeuge, Ausfallschritt und Brücke. prio 1, damit ein generierter
     Beintag sie enthält. */
  {
    id: 'sl_rdl', name: 'Einbeinige Hüftbeuge', cat: 'legs', muster: 'huefte', equip: ['none'], prio: 1, rest: 60,
    levels: [
      { stage: 'Mit einer Hand an der Wand', saetze: 3, wdh: [8, 12] },
      { stage: 'Frei', saetze: 3, wdh: [8, 12] },
      { stage: 'Frei, 2 Sek Pause unten', saetze: 3, wdh: [8, 12] }
    ],
    tips: [
      'Angaben gelten je Seite. Das Standbein ist leicht gebeugt, die Hüfte schiebt nach hinten.',
      'Rücken bleibt lang, das hintere Bein bildet mit dem Oberkörper eine Linie.',
      'Die Hüfte bleibt waagerecht – das hintere Becken dreht gern nach oben auf.'
    ]
  },
  {
    id: 'step_up', name: 'Step-ups', cat: 'legs', muster: 'kniebeuge', equip: ['chair'], rest: 60,
    levels: [
      { stage: 'Niedrige Stufe (Treppe)', saetze: 3, wdh: [10, 15] },
      { stage: 'Stuhlhöhe', saetze: 3, wdh: [8, 12] },
      { stage: 'Stuhlhöhe, mit Knieheben oben', saetze: 3, wdh: [8, 12] }
    ],
    tips: [
      'Angaben gelten je Seite. Nur ein stabiler Stuhl, der nicht kippen oder rutschen kann.',
      'Das obere Bein arbeitet – nicht vom unteren abstoßen.',
      'Langsam wieder absteigen, die Bewegung nach unten zählt mit.'
    ]
  },
  {
    id: 'cossack', name: 'Cossack Squats', cat: 'legs', muster: 'kniebeuge', equip: ['none'], rest: 60,
    levels: [
      { stage: 'Mit Halt an einem Türrahmen', saetze: 3, wdh: [6, 10] },
      { stage: 'Frei, so tief wie sauber', saetze: 3, wdh: [6, 10] },
      { stage: 'Tief, Arme vorn gestreckt', saetze: 3, wdh: [8, 12] }
    ],
    tips: [
      'Angaben gelten je Seite. Breiter Stand, ein Bein beugt, das andere bleibt gestreckt mit Zehen nach oben.',
      'Die Ferse des gebeugten Beins bleibt am Boden.',
      'Kraft und Beweglichkeit zugleich: Adduktoren und Hüfte.'
    ]
  },
  {
    id: 'shrimp_squat', name: 'Shrimp Squat', cat: 'legs', muster: 'kniebeuge', equip: ['none'], prio: 3, rest: 90,
    levels: [
      { stage: 'Mit Halt, Knie auf ein Kissen', saetze: 3, wdh: [5, 8] },
      { stage: 'Frei, Knie auf ein Kissen', saetze: 3, wdh: [4, 8] },
      { stage: 'Frei, bis das Knie den Boden berührt', saetze: 3, wdh: [3, 6] }
    ],
    tips: [
      'Angaben gelten je Seite. Das hintere Bein hält man am Fuß fest, das Knie sinkt nach unten.',
      'Eine Alternative zur Pistol Squat für alle, deren Sprunggelenk nicht tief genug beugt.',
      'Oberkörper darf sich neigen, das vordere Knie folgt der Fußrichtung.'
    ]
  },

  /* ================= RUMPF ================= */
  {
    id: 'hollow', name: 'Hollow Body Hold', cat: 'core', muster: 'rumpf_vorn', equip: ['none'], prio: 1, rest: 60,
    levels: [
      { stage: 'Knie angewinkelt', saetze: 3, sek: [15, 25] },
      { stage: 'Beine gestreckt', saetze: 3, sek: [25, 40] },
      { stage: 'Arme über Kopf', saetze: 3, sek: [25, 40] },
      { stage: 'Hollow Rocks', saetze: 3, wdh: [12, 20] }
    ],
    tips: [
      'Unteren Rücken fest in den Boden pressen – keine Lücke!',
      'Arme neben dem Körper erleichtern, über Kopf erschweren.',
      'Die wichtigste Körperspannungsübung für Handstand und Planche.'
    ]
  },
  {
    id: 'knee_raise', name: 'Hängendes Beinheben', cat: 'core', muster: 'rumpf_vorn', equip: ['bar', 'rings'], rest: 60,
    levels: [
      { stage: 'Knieheben', saetze: 3, wdh: [6, 10] },
      { stage: 'Knieheben', saetze: 3, wdh: [10, 15] },
      { stage: 'Leg Raises (gestreckt)', saetze: 3, wdh: [6, 10] },
      { stage: 'Toes to Bar', saetze: 3, wdh: [5, 10] }
    ],
    tips: [
      'Ohne Schwung – langsam hoch, langsam runter.',
      'Becken am Ende leicht einrollen für maximale Bauchspannung.',
      'Direkter Übertrag auf den L-Sit.'
    ]
  },
  {
    id: 'plank', name: 'Plank', cat: 'core', muster: 'rumpf_vorn', equip: ['none'], prio: 1, rest: 45,
    levels: [
      { stage: 'Plank', saetze: 3, sek: [20, 40] },
      { stage: 'Plank', saetze: 3, sek: [45, 60] },
      { stage: 'Plank, Arme vorgestreckt', saetze: 3, sek: [20, 40] },
      { stage: 'RKC Plank (max. Spannung)', saetze: 3, sek: [15, 25] }
    ],
    tips: [
      'Ellbogen unter den Schultern, Po nicht durchhängen lassen.',
      'Beim RKC Plank alles gleichzeitig anspannen – 20 Sekunden reichen dann völlig.',
      'Wenn 60 Sekunden leicht sind: schwerere Variante statt längere Zeit.'
    ]
  },
  {
    id: 'side_plank', name: 'Seitstütz', cat: 'core', muster: 'rumpf_seite', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Auf Knien', saetze: 3, sek: [20, 30] },
      { stage: 'Gestreckt', saetze: 3, sek: [25, 40] },
      { stage: 'Mit angehobenem Bein', saetze: 3, sek: [20, 30] }
    ],
    tips: [
      'Angaben gelten je Seite.',
      'Hüfte aktiv nach oben schieben, Körper in einer Linie.',
      'Kräftigt die seitliche Rumpfkette – wichtig für saubere Balance im Handstand.'
    ]
  },
  {
    id: 'dragon_flag', name: 'Dragon Flag', cat: 'core', muster: 'rumpf_vorn', equip: ['none'], prio: 3, rest: 120,
    levels: [
      { stage: 'Tuck Negativ', saetze: 3, wdh: [5, 8] },
      { stage: 'One-Leg Negativ', saetze: 3, wdh: [5, 8] },
      { stage: 'Gestreckt Negativ', saetze: 3, wdh: [4, 6] }
    ],
    tips: [
      'An etwas Festem hinter dem Kopf festhalten, nur Schulterblätter am Boden.',
      'Körper wie ein Brett langsam ablassen – kein Einknicken in der Hüfte.',
      'Sehr anspruchsvoll: erst wenn Hollow Hold 40 Sekunden sitzt.'
    ]
  },
  /* Bis hierher arbeitete der Rumpf nur gegen die Streckung (Hollow, Plank)
     und in der Beugung (Leg Raises). Es fehlten der Rückenstrecker als
     Gegenspieler, ein leichter Einstieg und die Adduktoren. */
  {
    id: 'arch_hold', name: 'Arch Hold', cat: 'core', muster: 'rumpf_seite', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Superman, Knie am Boden', saetze: 3, sek: [15, 25] },
      { stage: 'Arch Hold', saetze: 3, sek: [20, 40] },
      { stage: 'Arch Rocks', saetze: 3, wdh: [12, 20] }
    ],
    tips: [
      'Bauchlage, Arme und Beine gestreckt anheben, Po fest.',
      'Der Gegenspieler zum Hollow Body – beide zusammen machen den Rumpf stabil.',
      'Blick zum Boden, der Nacken bleibt lang.'
    ]
  },
  {
    id: 'dead_bug', name: 'Dead Bug', cat: 'core', muster: 'rumpf_vorn', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Beine gebeugt', saetze: 3, wdh: [8, 12] },
      { stage: 'Beine gestreckt', saetze: 3, wdh: [8, 12] },
      { stage: 'Gestreckt, 3 Sek Halten', saetze: 3, wdh: [6, 10] }
    ],
    tips: [
      'Angaben gelten je Seite. Unterer Rücken bleibt die ganze Zeit am Boden.',
      'Gegengleich: rechter Arm und linkes Bein strecken, dann wechseln.',
      'Der leichteste Einstieg in die Rumpfspannung, auf der Hollow aufbaut.'
    ]
  },
  {
    id: 'copenhagen', name: 'Copenhagen Plank', cat: 'core', muster: 'rumpf_seite', equip: ['chair'], rest: 45,
    levels: [
      { stage: 'Knie auf dem Stuhl', saetze: 3, sek: [15, 25] },
      { stage: 'Fuß auf dem Stuhl', saetze: 3, sek: [15, 30] },
      { stage: 'Fuß auf dem Stuhl, unteres Bein angehoben', saetze: 3, sek: [15, 30] }
    ],
    tips: [
      'Angaben gelten je Seite. Seitstütz, das obere Bein liegt auf dem Stuhl und trägt mit.',
      'Stärkt die Adduktoren, die bei fast allen Beinübungen zu kurz kommen.',
      'Hüfte oben halten, nicht nach hinten ausweichen.'
    ]
  },

  /* ================= SKILLS ================= */
  {
    id: 'lsit', name: 'L-Sit', cat: 'skill', muster: 'lsit', equip: ['parallettes', 'rings'], rest: 90,
    levels: [
      { stage: 'Tuck L-Sit', saetze: 4, sek: [5, 10], equip: ['parallettes', 'rings', 'chair'] },
      { stage: 'Tuck L-Sit', saetze: 4, sek: [10, 15], equip: ['parallettes', 'rings', 'chair'] },
      { stage: 'One-Leg L-Sit', saetze: 4, sek: [8, 12] },
      { stage: 'L-Sit', saetze: 4, sek: [5, 10] },
      { stage: 'L-Sit', saetze: 4, sek: [15, 20] }
    ],
    tips: [
      'Erst Stützhalte einnehmen, dann Knie zur Brust ziehen.',
      'Schultern nach unten drücken – der häufigste Fehler ist Einsinken.',
      'Lieber kurze, saubere Halten als lange mit rundem Rücken.'
    ]
  },
  {
    id: 'handstand', name: 'Freier Handstand', cat: 'skill', muster: 'handstand', equip: ['none'], prio: 3, rest: 90,
    levels: [
      { stage: 'Wandläufe / Kick-up-Übungen', saetze: 4, wdh: [5, 8], art: 'versuche' },
      { stage: 'Kick-up mit Balance-Versuch', saetze: 5, wdh: [3, 5], art: 'versuche' },
      { stage: 'Freistehend 3–5 Sek', saetze: 5, sek: [3, 5] },
      { stage: 'Freistehend 10–20 Sek', saetze: 5, sek: [10, 20] },
      { stage: 'Freistehend 30+ Sek', saetze: 5, sek: [25, 40] }
    ],
    tips: [
      'Balance kommt aus den Fingern: Kippen nach vorn mit den Fingerkuppen abbremsen.',
      'Immer einen Ausstieg üben (Rad zur Seite) – dann traust du dich mehr.',
      'Handstand ist Technik: täglich 5–10 Minuten bringen mehr als einmal pro Woche 30.'
    ]
  },
  {
    id: 'planche', name: 'Planche', cat: 'skill', muster: 'planche', equip: ['parallettes'], prio: 3, rest: 150,
    levels: [
      { stage: 'Frog Stand (Krähe)', saetze: 4, sek: [15, 30], equip: ['none'] },
      { stage: 'Tuck Planche', saetze: 4, sek: [8, 15] },
      { stage: 'Advanced Tuck Planche', saetze: 4, sek: [8, 12] },
      { stage: 'Straddle Planche Negativ', saetze: 4, wdh: [4, 6] },
      { stage: 'Straddle Planche', saetze: 4, sek: [5, 10] }
    ],
    tips: [
      'Ellbogen bleiben komplett gestreckt – sonst wird es ein Bent-Arm-Hold.',
      'Schultern deutlich vor die Hände, Schulterblätter nach vorn/unten schieben.',
      'Der langsamste Skill überhaupt: mehrere Jahre sind normal. Bau parallel Handgelenks- und Bizeps-Sehnenbelastbarkeit auf.'
    ]
  },
  {
    id: 'hspu', name: 'Handstand Push-up', cat: 'skill', muster: 'handstand', equip: ['none'], prio: 3, rest: 150,
    levels: [
      { stage: 'Pike Push-up, Füße erhöht', saetze: 4, wdh: [5, 8] },
      { stage: 'Box-Pike Push-up (Hüfte 90°)', saetze: 4, wdh: [4, 8] },
      { stage: 'Wand-HSPU Negativ', saetze: 4, wdh: [3, 5] },
      { stage: 'Wand-HSPU', saetze: 4, wdh: [2, 5] },
      { stage: 'Wand-HSPU', saetze: 4, wdh: [6, 10] }
    ],
    tips: [
      'Kopf bildet mit den Händen ein Dreieck am Boden.',
      'Erst wenn der Wand-Handstand 45 Sekunden sicher steht.',
      'Nackenmuskulatur vorher aufwärmen.',
      'Box-Pike: Füße auf einer Kiste oder einem Stuhl, Hüfte über den Schultern – der Schritt zwischen Pike und Wand.'
    ]
  },
  {
    id: 'lsit_hs', name: 'L-Sit zum Handstand', cat: 'skill', muster: 'lsit', equip: ['parallettes'], prio: 3, rest: 180,
    levels: [
      { stage: 'Tuck-Press Negativ (aus HS ablassen)', saetze: 4, wdh: [3, 5] },
      { stage: 'Press mit Absprunghilfe', saetze: 4, wdh: [3, 5] },
      { stage: 'Tuck Press to Handstand', saetze: 5, wdh: [2, 4] },
      { stage: 'Straddle Press to Handstand', saetze: 5, wdh: [2, 4] },
      { stage: 'L-Sit to Handstand', saetze: 5, wdh: [1, 3] }
    ],
    tips: [
      'Voraussetzungen: sicherer L-Sit, 30 Sek freier Handstand, viel Pike-Beweglichkeit.',
      'Der Schlüssel ist die Gewichtsverlagerung nach vorn über die Hände, nicht Schwung.',
      'Negativs (aus dem Handstand langsam in den L-Sit) bauen genau die richtige Kraft.'
    ]
  },
  {
    id: 'muscle_up', name: 'Muscle-up', cat: 'skill', muster: 'muscle_up', equip: ['bar', 'rings'], prio: 3, rest: 180,
    levels: [
      { stage: 'Explosive Klimmzüge, Brust zur Stange', saetze: 4, wdh: [3, 5] },
      { stage: 'Übergang an tiefer Stange, Füße am Boden', saetze: 4, wdh: [3, 5] },
      { stage: 'Muscle-up Negativ, langsam ablassen', saetze: 4, wdh: [2, 4] },
      { stage: 'Erster Muscle-up + Negativs', saetze: 5, wdh: [1, 1] },
      { stage: 'Muscle-ups', saetze: 4, wdh: [2, 5] }
    ],
    tips: [
      'Voraussetzung: 8–10 saubere Klimmzüge und 10 Dips. Ohne diese Basis wird der Übergang zum Schwung-Gezappel.',
      'Die Stange zieht zur Hüfte, nicht zum Kinn – der Oberkörper kippt dabei über die Stange.',
      'An der Stange mit falschem Griff (Handgelenk über der Stange) wird der Übergang deutlich kürzer.'
    ]
  },
  {
    id: 'back_lever', name: 'Back Lever', cat: 'skill', muster: 'back_lever', equip: ['bar', 'rings'], prio: 3, rest: 120,
    levels: [
      { stage: 'German Hang', saetze: 3, sek: [10, 20] },
      { stage: 'Tuck Back Lever', saetze: 4, sek: [8, 15] },
      { stage: 'Advanced Tuck Back Lever', saetze: 4, sek: [8, 12] },
      { stage: 'Straddle oder One-Leg Back Lever', saetze: 4, sek: [6, 10] }
    ],
    tips: [
      'Erst wenn Skin the Cat langsam und schmerzfrei geht – die Schulter steht hier in voller Streckung.',
      'Arme bleiben gestreckt, der Zug geht über die Bizepssehne. Neue Stufen langsam angehen.',
      'Becken nach hinten kippen (Po anspannen), sonst hängt die Hüfte durch.'
    ]
  },
  {
    id: 'elbow_lever', name: 'Elbow Lever', cat: 'skill', muster: 'elbow_lever', equip: ['none'], prio: 3, rest: 90,
    levels: [
      { stage: 'Mit beiden Füßen am Boden', saetze: 3, sek: [10, 20] },
      { stage: 'Ein Fuß am Boden', saetze: 3, sek: [8, 15] },
      { stage: 'Frei', saetze: 4, sek: [5, 15] }
    ],
    tips: [
      'Ellbogen eng in die Hüfte, Finger zeigen nach hinten oder zur Seite.',
      'Das Gewicht nach vorn verlagern, bis die Füße von selbst leicht werden.',
      'Der erste Balance-Skill ohne Gerät – gut für Handgelenke, die sich an Last gewöhnen.'
    ]
  },

  /* ================= MOBILITY ================= */
  {
    id: 'wrist_prep', name: 'Handgelenks-Routine', cat: 'mobility', muster: 'mobility', equip: ['none'], prio: 1, rest: 30,
    levels: [
      { stage: 'Basis-Routine', saetze: 2, sek: [60, 60] },
      { stage: 'Mit Gewichtsverlagerung', saetze: 3, sek: [60, 60] },
      { stage: 'Mit Fingerliegestützen', saetze: 3, sek: [45, 45] }
    ],
    tips: [
      'Handflächen am Boden, Finger nach vorn / zur Seite / nach hinten – je 20–30 Sek.',
      'Handrücken am Boden, sanft Gewicht verlagern.',
      'Pflichtprogramm vor jeder Push-Einheit. Handgelenksschmerzen sind der häufigste Grund für Trainingspausen bei Handstand-Zielen.'
    ]
  },
  {
    id: 'shoulder_mob', name: 'Schulter-Mobility', cat: 'mobility', muster: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Handtuch-Dislocates + Armkreisen', saetze: 2, wdh: [10, 12] },
      { stage: 'Dislocates enger + Wand-Slides', saetze: 3, wdh: [10, 12] },
      { stage: 'Skin the Cat (an der Stange)', saetze: 3, wdh: [4, 6], equip: ['bar', 'rings'] }
    ],
    tips: [
      'Handtuch weit greifen, langsam über den Kopf nach hinten führen.',
      'Nur so weit, wie es ohne Schmerz und ohne Ausweichen im Rücken geht.',
      'Gute Schulterüberkopf-Beweglichkeit ist die Voraussetzung für einen geraden Handstand.'
    ]
  },
  {
    id: 'band_pullapart', name: 'Band-Auseinanderziehen', cat: 'mobility', muster: 'mobility', equip: ['band'], rest: 30,
    levels: [
      { stage: 'Vor der Brust, Arme gestreckt', saetze: 2, wdh: [12, 15] },
      { stage: 'Über Kopf und zurück', saetze: 3, wdh: [10, 12] },
      { stage: 'Dislocates mit dem Band', saetze: 3, wdh: [8, 10] }
    ],
    tips: [
      'Arme bleiben gestreckt – die Bewegung kommt aus den Schulterblättern.',
      'Der bequemere Ersatz für die Handtuch-Dislocates: das Band gibt nach und lässt mehr Weg zu.',
      'Passt in jedes Warm-up vor einer Push-Einheit.'
    ]
  },
  {
    id: 'pike_stretch', name: 'Pike / Vorbeuge', cat: 'mobility', muster: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Sitzende Vorbeuge', saetze: 3, sek: [45, 45] },
      { stage: 'Vorbeuge mit aktivem Ziehen', saetze: 3, sek: [60, 60] },
      { stage: 'Erhöhte Pike-Kompression', saetze: 3, sek: [45, 45] }
    ],
    tips: [
      'Aktiv arbeiten: Bauch anspannen und sich selbst näher ziehen, nicht nur hängen.',
      'Kompression (Beine aktiv Richtung Brust) ist der Schlüssel für L-Sit und Press to Handstand.',
      'Nach dem Training dehnen, nicht davor.'
    ]
  },
  {
    id: 'pancake', name: 'Pancake / Grätsche', cat: 'mobility', muster: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Grätsche sitzend', saetze: 3, sek: [45, 45] },
      { stage: 'Pancake mit Vorbeuge', saetze: 3, sek: [60, 60] },
      { stage: 'Aktive Pancake-Lifts', saetze: 3, wdh: [8, 10] }
    ],
    tips: [
      'Knie zeigen nach oben, nicht nach vorn kippen lassen.',
      'Wichtig für Straddle Planche und Straddle Press.',
      'Fortschritt braucht Wochen – dranbleiben und regelmäßig, nicht lange.'
    ]
  },
  {
    id: 'bridge', name: 'Brücke', cat: 'mobility', muster: 'mobility', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Schulterbrücke', saetze: 3, sek: [20, 30] },
      { stage: 'Kopfbrücke', saetze: 3, sek: [15, 25] },
      { stage: 'Volle Brücke', saetze: 3, sek: [20, 30] }
    ],
    tips: [
      'Öffnet Brust und Schultern – guter Gegenspieler zu vielen Liegestützen.',
      'Bewegung aus Brustwirbelsäule und Hüfte holen, nicht nur aus dem unteren Rücken.',
      'Schultern über die Hände schieben.'
    ]
  },
  {
    id: 'hip_mob', name: 'Hüft-Mobility', cat: 'mobility', muster: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Hüftbeuger-Dehnung + 90/90', saetze: 2, sek: [45, 45] },
      { stage: 'Couch Stretch + Frosch', saetze: 3, sek: [45, 45] },
      { stage: 'Aktive 90/90-Wechsel', saetze: 3, wdh: [8, 10] }
    ],
    tips: [
      'Angaben gelten je Seite.',
      'Po anspannen, um die Dehnung im Hüftbeuger richtig zu spüren.',
      'Verkürzte Hüftbeuger machen die Hollow-Position und den Handstand schwerer.'
    ]
  }
];

/* =========================================================
   PLAN-VORLAGEN
   Jede Vorlage besteht aus Trainingstagen mit Übungs-IDs.
   ========================================================= */
/* Die Vorlagen sind an ihrer Wochenbilanz gemessen (js/domain/bilanz.js,
   test/bilanz.test.js): jede Muskelgruppe mindestens zweimal pro Woche,
   Beine mit Hüftbeuge, nicht deutlich mehr Drücken als Ziehen – bei der
   Häufigkeit, die im Namen steht. Vorher kam der A/B-Split auf acht Sätze
   Beine pro Woche ohne Hüftbeuge, Ganzkörper C hatte keine Kraftübung zum
   Drücken, und der Skill-Fokus zog nur an einem von vier Tagen. */
export const PLAN_TEMPLATES = {
  ab4: {
    name: 'A/B Split · 4× pro Woche',
    desc: 'Der empfohlene Einstieg: Mo/Di/Do/Fr im Wechsel A–B–A–B.',
    days: [
      { key: 'A', title: 'Push & Beine', sub: 'Drücken · Handstand-Basics · Kniebeuge',
        ex: ['wrist_prep', 'pushup', 'pike', 'wall_hs', 'dips', 'squat', 'glute_bridge'] },
      { key: 'B', title: 'Pull, Beine & Core', sub: 'Ziehen · Ausfallschritt · L-Sit',
        ex: ['hang', 'pullup', 'row', 'lunge', 'lsit', 'hollow', 'knee_raise'] }
    ]
  },
  full3: {
    name: 'Ganzkörper · 3× pro Woche',
    desc: 'Wenig Zeit oder in der Deload-Woche: alles Wichtige in einer Einheit.',
    days: [
      { key: '1', title: 'Ganzkörper A', sub: 'Grundübungen',
        ex: ['wrist_prep', 'pushup', 'row', 'squat', 'support', 'hollow'] },
      { key: '2', title: 'Ganzkörper B', sub: 'Zug- & Skill-Fokus',
        ex: ['wrist_prep', 'hang', 'pullup', 'dips', 'lunge', 'lsit', 'knee_raise'] },
      { key: '3', title: 'Ganzkörper C', sub: 'Skills & Mobility',
        ex: ['wrist_prep', 'wall_hs', 'planche_lean', 'pike', 'scap', 'glute_bridge', 'plank', 'pike_stretch'] }
    ]
  },
  ppl: {
    name: 'Push / Pull / Legs · 6× pro Woche',
    desc: 'Klassischer 3er-Split, jeder Tag zweimal pro Woche. Bei nur drei Tagen kommt jede Muskelgruppe einmal dran – dann lieber Ganzkörper.',
    days: [
      { key: 'P', title: 'Push', sub: 'Drücken',
        ex: ['wrist_prep', 'pushup', 'dips', 'pike', 'planche_lean'] },
      { key: 'Z', title: 'Pull', sub: 'Ziehen',
        ex: ['pullup', 'row', 'prone_ytw', 'knee_raise'] },
      { key: 'L', title: 'Legs & Core', sub: 'Beine & Rumpf',
        ex: ['squat', 'lunge', 'nordic', 'hollow', 'side_plank'] }
    ]
  },
  skill: {
    name: 'Skill-Fokus · 4× pro Woche',
    desc: 'Für später: Skills zuerst im frischen Zustand, dann Kraft.',
    days: [
      { key: 'A', title: 'Handstand & Push', sub: 'Skill zuerst',
        ex: ['wrist_prep', 'handstand', 'hspu', 'pushup', 'dips', 'plank'] },
      { key: 'B', title: 'L-Sit & Pull', sub: 'Skill zuerst',
        ex: ['hang', 'lsit', 'front_lever', 'pullup', 'row', 'sl_rdl'] },
      { key: 'C', title: 'Planche & Push', sub: 'Skill zuerst',
        ex: ['wrist_prep', 'planche', 'planche_lean', 'support', 'pushup', 'pike', 'hollow'] },
      { key: 'D', title: 'Beine, Zug & Mobility', sub: 'Ausgleich',
        ex: ['squat', 'pistol', 'nordic', 'chinup', 'side_plank', 'pike_stretch', 'pancake'] }
    ]
  }
};

/* Meilensteine

   `when` beschreibt, woran die App erkennt, dass ein Meilenstein erreicht
   sein dürfte:

     ex    die Übung
     lvl   der Mindest-Stufenindex (0-basiert, wie state.levels)
     reps  ODER sek: der Mindestwert der Bestleistung

   Beides zusammen, weil keines allein trägt. Die Stufe allein nicht: „5
   volle Liegestütze" heißt nicht „auf der Stufe angekommen". Der Wert allein
   auch nicht: 15 Wiederholungen auf Knie-Liegestützen sind keine 15 vollen.

   Daraus folgt eine Pflege-Regel: Wer eine Leiter umbaut, muss die Indizes
   hier nachziehen. Ein Test in test/milestones.test.js prüft gegen die echten
   Daten, dass jede genannte Übung existiert und jeder Index innerhalb ihrer
   Leiter liegt – eine gekürzte Leiter fällt damit sofort auf.

   Erkannt heißt NICHT abgehakt: die App schlägt vor, eingetragen wird von
   Hand. „Sauber geschafft" ist eine Aussage über die Ausführung, und die
   folgt aus keiner Zahl. */
export const MILESTONES = [
  { id: 'pushup5', name: '5 volle Liegestütze am Stück', when: { ex: 'pushup', lvl: 3, reps: 5 } },
  { id: 'pushup15', name: '15 volle Liegestütze am Stück', when: { ex: 'pushup', lvl: 3, reps: 15 } },
  { id: 'hang60', name: '60 Sekunden Dead Hang', when: { ex: 'hang', lvl: 2, sek: 60 } },
  { id: 'row10', name: '10 Australian Pull-ups', when: { ex: 'row', lvl: 2, reps: 10 } },
  { id: 'ringrow10', name: '10 waagerechte Ring-Rows', when: { ex: 'ring_row', lvl: 2, reps: 10 } },
  { id: 'chinup1', name: 'Erster Chin-up', when: { ex: 'chinup', lvl: 1, reps: 1 } },
  { id: 'pullup1', name: 'Erster echter Klimmzug', when: { ex: 'pullup', lvl: 2, reps: 1 } },
  { id: 'pullup5', name: '5 Klimmzüge am Stück', when: { ex: 'pullup', lvl: 3, reps: 5 } },
  { id: 'dip1', name: 'Erster Dip auf den Parallettes', when: { ex: 'dips', lvl: 3, reps: 1 } },
  { id: 'ringdip1', name: 'Erster Ring-Dip', when: { ex: 'ring_dip', lvl: 3, reps: 1 } },
  { id: 'tuck15', name: '15 Sekunden Tuck L-Sit', when: { ex: 'lsit', lvl: 1, sek: 15 } },
  { id: 'lsit10', name: 'Voller L-Sit, 10 Sekunden', when: { ex: 'lsit', lvl: 3, sek: 10 } },
  { id: 'wall30', name: '30 Sek Wand-Handstand (Brust zur Wand)', when: { ex: 'wall_hs', lvl: 2, sek: 30 } },
  { id: 'hs5', name: 'Erster freier Handstand (5 Sekunden)', when: { ex: 'handstand', lvl: 2, sek: 5 } },
  { id: 'hs30', name: 'Freier Handstand, 30 Sekunden', when: { ex: 'handstand', lvl: 4, sek: 30 } },
  { id: 'lean20', name: '20 Sek Planche Lean mit deutlicher Vorlage', when: { ex: 'planche_lean', lvl: 2, sek: 20 } },
  { id: 'tuckplanche', name: 'Tuck Planche, 10 Sekunden', when: { ex: 'planche', lvl: 1, sek: 10 } },
  { id: 'lsit_hs1', name: 'L-Sit zum Handstand – erste Wiederholung', when: { ex: 'lsit_hs', lvl: 4, reps: 1 } },
  { id: 'muscleup1', name: 'Erster Muscle-up', when: { ex: 'muscle_up', lvl: 3, reps: 1 } },
  { id: 'backlever_tuck', name: 'Tuck Back Lever, 10 Sekunden', when: { ex: 'back_lever', lvl: 1, sek: 10 } }
];

/* Warm-up-Bausteine (fest, vor jeder Einheit) */
export const WARMUP = [
  '2–3 Min lockeres Aufwärmen (Hampelmänner, Marschieren, Seilspringen)',
  'Armkreisen vor- und rückwärts – je 10×',
  'Scapula Push-ups – 2 × 8',
  'Handgelenke: kreisen + Dehnung in alle Richtungen, je 20–30 Sek — Pflicht!',
  'Cat-Cow & Schulteröffner an der Wand – 1 Min',
  '10–15 Sek locker an der Stange hängen',
  'Hüftkreisen und Beinpendeln – je 10× pro Seite',
  '10 langsame Kniebeugen, unten kurz halten'
];

/* Wann ein Punkt drankommt, je Index wie WARMUP_PFLICHT – Bedeutung siehe
   js/domain/warmup.js. Die Handgelenke stehen nur an Tagen ohne die
   Handgelenks-Routine: mit ihr wären sie doppelt. Beim Ergänzen der Liste
   mitpflegen; test/warmup.test.js prüft die Länge. */
export const WARMUP_WANN = ['immer', 'oben', 'druck', 'handgelenk', 'immer', 'haengen', 'beine', 'beine'];

/* Welche Warm-up-Punkte nicht optional sind – als Index, nicht als Textsuche.
   Die Oberfläche prüfte bisher w.includes('Pflicht') und hob im englischen
   Warm-up folglich nichts mehr hervor. Beim Ergänzen der Liste mitpflegen. */
export const WARMUP_PFLICHT = new Set([3]);

/* Nachschlagewerk: Übung per ID finden */
export const EX_BY_ID = {};
EXERCISES.forEach(e => { EX_BY_ID[e.id] = e; });

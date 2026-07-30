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
     equip     Array: none | parallettes | bar | chair
     rest      empfohlene Satzpause in Sekunden (optional)
     levels    Progressionsstufen, von leicht nach schwer
               { stage: Variantenname, target: "4 × 6–10" }
               Halteübungen: "4 × 10–20 Sek"
     tips      Array mit Ausführungshinweisen
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
    id: 'pushup', name: 'Liegestütze', cat: 'push', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Erhöht (Tisch)', target: '4 × 6–10' },
      { stage: 'Erhöht (Bank/Stufe)', target: '4 × 6–10' },
      { stage: 'Knie-Liegestütze', target: '4 × 8–12' },
      { stage: 'Volle Liegestütze', target: '4 × 5–10' },
      { stage: 'Volle Liegestütze', target: '4 × 10–15' },
      { stage: 'Auf Parallettes (tiefer)', target: '4 × 8–12' },
      { stage: 'Pseudo-Planche Liegestütze', target: '4 × 4–8' }
    ],
    tips: [
      'Körper als Brett: Bauch und Po fest anspannen, Rippen nach unten.',
      'Ellbogen ca. 45° am Körper – nicht seitlich abspreizen.',
      'Volle Bewegungsamplitude: Brust bis Richtung Kante/Boden.'
    ]
  },
  {
    id: 'diamond', name: 'Diamant-Liegestütze', cat: 'push', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Erhöht', target: '3 × 6–10' },
      { stage: 'Auf Knien', target: '3 × 8–12' },
      { stage: 'Voll', target: '3 × 6–10' }
    ],
    tips: [
      'Hände bilden ein Dreieck unter der Brust – Daumen und Zeigefinger berühren sich.',
      'Trizeps-Betonung: Ellbogen bleiben eng am Körper.',
      'Gut als Ergänzung, wenn Dips noch zu schwer sind.'
    ]
  },
  {
    id: 'archer_push', name: 'Archer-Liegestütze', cat: 'push', equip: ['none'], rest: 120,
    levels: [
      { stage: 'Erhöht, leichte Verlagerung', target: '3 × 5–8' },
      { stage: 'Voll, halbe Verlagerung', target: '3 × 5–8' },
      { stage: 'Voll, Arm fast gestreckt', target: '3 × 4–6' }
    ],
    tips: [
      'Angaben gelten je Seite. Ein Arm beugt, der andere streckt sich seitlich.',
      'Der Weg zum einarmigen Liegestütz – erst wenn 15 volle Liegestütze sitzen.',
      'Hüfte bleibt parallel zum Boden, kein Verdrehen.'
    ]
  },
  {
    id: 'support', name: 'Stützhalte', cat: 'push', equip: ['parallettes'], rest: 60,
    levels: [
      { stage: 'Support Hold', target: '4 × 10–20 Sek' },
      { stage: 'Support Hold', target: '4 × 20–30 Sek' },
      { stage: 'Support Hold', target: '4 × 30–45 Sek' },
      { stage: 'Support + leichter Lean', target: '4 × 15–25 Sek' }
    ],
    tips: [
      'Arme komplett gestreckt, Ellbogen "einrasten".',
      'Schultern aktiv nach unten drücken – weg von den Ohren (Depression).',
      'Basis für L-Sit, Dips und später die Planche.'
    ]
  },
  {
    id: 'dips', name: 'Dips', cat: 'push', equip: ['chair', 'parallettes'], rest: 120,
    levels: [
      { stage: 'Bank-Dips (Füße am Boden)', target: '3 × 8–12' },
      { stage: 'Bank-Dips, Füße erhöht', target: '3 × 8–12' },
      { stage: 'Negativ-Dips (Parallettes)', target: '3 × 4–6' },
      { stage: 'Dips auf Parallettes', target: '3 × 5–8' },
      { stage: 'Dips auf Parallettes', target: '3 × 8–12' }
    ],
    tips: [
      'Schultern unten halten, nicht zu den Ohren ziehen.',
      'Kontrolliert ablassen, bis der Oberarm etwa parallel ist.',
      'Bei Schmerz vorn in der Schulter: Bewegungsumfang verkleinern.'
    ]
  },
  {
    id: 'pike', name: 'Pike-Progression', cat: 'push', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Pike-Halte', target: '3 × 15–20 Sek' },
      { stage: 'Pike-Halte', target: '3 × 25–35 Sek' },
      { stage: 'Pike, Füße erhöht (Halte)', target: '3 × 15–25 Sek' },
      { stage: 'Pike Push-ups', target: '3 × 5–8' },
      { stage: 'Pike Push-ups, Füße erhöht', target: '3 × 5–8' }
    ],
    tips: [
      'Po so hoch wie möglich, Gewicht auf die Schultern schieben.',
      'Blick zwischen die Hände, Nacken lang.',
      'Direkter Kraftaufbau für den späteren Handstand-Push-up.'
    ]
  },
  {
    id: 'planche_lean', name: 'Planche Lean', cat: 'push', equip: ['parallettes'], rest: 90,
    levels: [
      { stage: 'Leichter Lean', target: '3 × 10–15 Sek' },
      { stage: 'Mittlerer Lean', target: '3 × 15–20 Sek' },
      { stage: 'Deutlicher Lean', target: '3 × 20–30 Sek' },
      { stage: 'Max Lean (Füße auf Zehenspitzen)', target: '4 × 15–25 Sek' }
    ],
    tips: [
      'Liegestützposition auf den Parallettes, Schultern vor die Hände lehnen.',
      'Nur so weit, wie Ellbogen gestreckt und Schulterblätter geschoben bleiben.',
      'Handgelenke vorher gründlich aufwärmen – hier liegt viel Last darauf.'
    ]
  },
  {
    id: 'wall_hs', name: 'Wand-Handstand', cat: 'push', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Wand-Plank, flacher Winkel', target: '3 × 20–30 Sek' },
      { stage: 'Wand-Plank, steiler', target: '3 × 30–45 Sek' },
      { stage: 'Brust zur Wand Handstand', target: '3 × 15–25 Sek' },
      { stage: 'Brust zur Wand Handstand', target: '3 × 30–45 Sek' },
      { stage: 'Wand-Handstand + Wandläufe', target: '4 × 20–30 Sek' }
    ],
    tips: [
      'Aktiv aus den Schultern herausdrücken – so lang wie möglich machen.',
      'Bauch fest, Rippen nach unten, kein Hohlkreuz.',
      '"Brust zur Wand" ist die bessere Variante: sie erzwingt die gerade Linie.'
    ]
  },

  /* ================= ZIEHEN ================= */
  {
    id: 'hang', name: 'Dead Hang', cat: 'pull', equip: ['bar'], rest: 60,
    levels: [
      { stage: 'Passiv hängen', target: '4 × 15–30 Sek' },
      { stage: 'Passiv hängen', target: '4 × 30–45 Sek' },
      { stage: 'Passiv hängen', target: '4 × 45–60 Sek' },
      { stage: 'Aktiv hängen (Schultern unten)', target: '4 × 20–40 Sek' },
      { stage: 'Einarmig unterstützt', target: '4 × 15–25 Sek' }
    ],
    tips: [
      'Griff etwas breiter als schulterbreit, Daumen umgreifen die Stange.',
      'Ruhig weiteratmen, Schultern dürfen anfangs passiv hängen.',
      'Baut Griffkraft – das Fundament für alles an der Stange.'
    ]
  },
  {
    id: 'scap', name: 'Scapula Pull-ups', cat: 'pull', equip: ['bar'], rest: 60,
    levels: [
      { stage: 'Scapula Pull-ups', target: '3 × 5–8' },
      { stage: 'Scapula Pull-ups', target: '3 × 8–12' },
      { stage: 'Mit 2 Sek Pause oben', target: '3 × 6–10' }
    ],
    tips: [
      'Arme bleiben komplett gestreckt – nur die Schulterblätter ziehen dich hoch.',
      'Stell dir vor, du schiebst die Stange nach unten.',
      'Der Schlüsselbaustein für den ersten Klimmzug.'
    ]
  },
  {
    id: 'row', name: 'Rudern (horizontal)', cat: 'pull', equip: ['chair', 'bar'], rest: 90,
    levels: [
      { stage: 'Tisch-Rudern, Knie gebeugt', target: '4 × 8–12' },
      { stage: 'Tisch-Rudern, Beine gestreckt', target: '4 × 8–12' },
      { stage: 'Australian Pull-ups (tiefe Stange)', target: '4 × 8–12' },
      { stage: 'Australian, Füße erhöht', target: '4 × 8–12' }
    ],
    tips: [
      'Unter einem stabilen Tisch oder einer tiefen Stange: Brust zur Kante ziehen.',
      'Schulterblätter zuerst zusammenziehen, dann die Arme beugen.',
      'Die unterschätzte Übung für den ersten Klimmzug – trainiert dieselbe Zugrichtung mit weniger Last.'
    ]
  },
  {
    id: 'pullup', name: 'Klimmzug-Progression', cat: 'pull', equip: ['bar'], rest: 150,
    levels: [
      { stage: 'Negativ, 3 Sek ablassen', target: '4 × 3–5' },
      { stage: 'Negativ, 5–8 Sek ablassen', target: '4 × 3–5' },
      { stage: 'Erster Klimmzug + Negativs', target: '5 × 1' },
      { stage: 'Klimmzüge', target: '4 × 1–3' },
      { stage: 'Klimmzüge', target: '4 × 3–5' },
      { stage: 'Klimmzüge', target: '4 × 6–10' }
    ],
    tips: [
      'Mit Sprung oder Stuhl nach oben, Kinn über die Stange, dann langsam ablassen.',
      'Die letzten Zentimeter nicht fallen lassen – dort passiert der Kraftaufbau.',
      '2–3 Minuten Pause zwischen den Sätzen, das ist schwere Kraftarbeit.'
    ]
  },
  {
    id: 'chinup', name: 'Chin-ups (Kammgriff)', cat: 'pull', equip: ['bar'], rest: 150,
    levels: [
      { stage: 'Negativ, 3–5 Sek', target: '3 × 3–5' },
      { stage: 'Chin-ups', target: '3 × 1–3' },
      { stage: 'Chin-ups', target: '3 × 4–8' }
    ],
    tips: [
      'Handflächen zeigen zu dir – dadurch hilft der Bizeps stärker mit.',
      'Meist gelingt der erste Chin-up vor dem ersten Klimmzug.',
      'Ellbogen aktiv nach unten Richtung Hüfte ziehen.'
    ]
  },
  {
    id: 'front_lever', name: 'Front Lever', cat: 'pull', equip: ['bar'], rest: 120,
    levels: [
      { stage: 'Tuck Hang (Knie an Brust)', target: '4 × 10–15 Sek' },
      { stage: 'Tuck Front Lever', target: '4 × 8–15 Sek' },
      { stage: 'Advanced Tuck', target: '4 × 8–12 Sek' },
      { stage: 'One-Leg Front Lever', target: '4 × 6–10 Sek' }
    ],
    tips: [
      'Arme gestreckt, Schultern nach unten und hinten ziehen.',
      'Rücken rund halten (Hollow) – kein Hohlkreuz.',
      'Erst sinnvoll, wenn du 5+ saubere Klimmzüge schaffst.'
    ]
  },

  /* ================= BEINE ================= */
  {
    id: 'squat', name: 'Kniebeugen', cat: 'legs', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Kniebeugen', target: '4 × 12–15' },
      { stage: 'Tiefe Kniebeugen', target: '4 × 15–20' },
      { stage: 'Tempo-Kniebeugen (3 Sek runter)', target: '4 × 12–15' },
      { stage: 'Bulgarian Split Squats', target: '3 × 8–12' }
    ],
    tips: [
      'Fersen bleiben am Boden, Knie folgen der Fußrichtung.',
      'So tief wie sauber möglich – Rücken bleibt neutral.',
      'Tempo: 2 Sekunden runter, kontrolliert hoch.'
    ]
  },
  {
    id: 'lunge', name: 'Ausfallschritte', cat: 'legs', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Ausfallschritte', target: '3 × 8–10' },
      { stage: 'Ausfallschritte', target: '3 × 12–15' },
      { stage: 'Rückwärts mit Defizit', target: '3 × 8–12' }
    ],
    tips: [
      'Angaben gelten je Bein.',
      'Oberkörper aufrecht, hinteres Knie Richtung Boden.',
      'Über die vordere Ferse hochdrücken.'
    ]
  },
  {
    id: 'pistol', name: 'Einbeinige Kniebeuge', cat: 'legs', equip: ['chair'], rest: 120,
    levels: [
      { stage: 'Assisted (an Türrahmen)', target: '3 × 5–8' },
      { stage: 'Box Squat einbeinig (hoch)', target: '3 × 5–8' },
      { stage: 'Box Squat einbeinig (tief)', target: '3 × 5–8' },
      { stage: 'Pistol Squat', target: '3 × 3–6' }
    ],
    tips: [
      'Angaben gelten je Bein.',
      'Freies Bein nach vorn strecken, Arme als Gegengewicht.',
      'Braucht Balance und Knöchel-Beweglichkeit – Geduld haben.'
    ]
  },
  {
    id: 'glute_bridge', name: 'Glute Bridge', cat: 'legs', equip: ['none'], rest: 60,
    levels: [
      { stage: 'Beidbeinig', target: '3 × 15–20' },
      { stage: 'Beidbeinig, Füße erhöht', target: '3 × 12–15' },
      { stage: 'Einbeinig', target: '3 × 10–12' }
    ],
    tips: [
      'Po oben 1–2 Sekunden fest zusammendrücken.',
      'Wichtig als Gegenspieler zum vielen Sitzen – gute Hüftstreckung hilft auch im Handstand.',
      'Rippen nach unten, kein Überstrecken im unteren Rücken.'
    ]
  },
  {
    id: 'calf', name: 'Wadenheben', cat: 'legs', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Beidbeinig', target: '3 × 15–20' },
      { stage: 'Beidbeinig an Stufe (volle Amplitude)', target: '3 × 15–20' },
      { stage: 'Einbeinig an Stufe', target: '3 × 10–15' }
    ],
    tips: [
      'Langsam ablassen, unten kurz dehnen.',
      'Oben 1 Sekunde halten.',
      'Stärkt Sprunggelenke – hilft bei Sprüngen in den Handstand.'
    ]
  },
  {
    id: 'nordic', name: 'Beinbeuger (Nordic-Progression)', cat: 'legs', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Kniebeugen mit gestreckten Beinen (Good Morning)', target: '3 × 12–15' },
      { stage: 'Nordic Negativ (kurzer Weg)', target: '3 × 5–8' },
      { stage: 'Nordic Negativ (weiter Weg)', target: '3 × 4–6' }
    ],
    tips: [
      'Füße unter etwas Schweres klemmen oder von jemandem halten lassen.',
      'So langsam wie möglich nach vorn ablassen, dann mit den Händen abfangen.',
      'Schützt die hinteren Oberschenkel und Knie – oft vernachlässigt.'
    ]
  },

  /* ================= RUMPF ================= */
  {
    id: 'hollow', name: 'Hollow Body Hold', cat: 'core', equip: ['none'], rest: 60,
    levels: [
      { stage: 'Knie angewinkelt', target: '3 × 15–25 Sek' },
      { stage: 'Beine gestreckt', target: '3 × 25–40 Sek' },
      { stage: 'Arme über Kopf', target: '3 × 25–40 Sek' },
      { stage: 'Hollow Rocks', target: '3 × 12–20' }
    ],
    tips: [
      'Unteren Rücken fest in den Boden pressen – keine Lücke!',
      'Arme neben dem Körper erleichtern, über Kopf erschweren.',
      'Die wichtigste Körperspannungsübung für Handstand und Planche.'
    ]
  },
  {
    id: 'knee_raise', name: 'Hängendes Beinheben', cat: 'core', equip: ['bar'], rest: 60,
    levels: [
      { stage: 'Knieheben', target: '3 × 6–10' },
      { stage: 'Knieheben', target: '3 × 10–15' },
      { stage: 'Leg Raises (gestreckt)', target: '3 × 6–10' },
      { stage: 'Toes to Bar', target: '3 × 5–10' }
    ],
    tips: [
      'Ohne Schwung – langsam hoch, langsam runter.',
      'Becken am Ende leicht einrollen für maximale Bauchspannung.',
      'Direkter Übertrag auf den L-Sit.'
    ]
  },
  {
    id: 'plank', name: 'Plank', cat: 'core', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Plank', target: '3 × 20–40 Sek' },
      { stage: 'Plank', target: '3 × 45–60 Sek' },
      { stage: 'Plank, Arme vorgestreckt', target: '3 × 20–40 Sek' },
      { stage: 'RKC Plank (max. Spannung)', target: '3 × 15–25 Sek' }
    ],
    tips: [
      'Ellbogen unter den Schultern, Po nicht durchhängen lassen.',
      'Beim RKC Plank alles gleichzeitig anspannen – 20 Sekunden reichen dann völlig.',
      'Wenn 60 Sekunden leicht sind: schwerere Variante statt längere Zeit.'
    ]
  },
  {
    id: 'side_plank', name: 'Seitstütz', cat: 'core', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Auf Knien', target: '3 × 20–30 Sek' },
      { stage: 'Gestreckt', target: '3 × 25–40 Sek' },
      { stage: 'Mit angehobenem Bein', target: '3 × 20–30 Sek' }
    ],
    tips: [
      'Angaben gelten je Seite.',
      'Hüfte aktiv nach oben schieben, Körper in einer Linie.',
      'Kräftigt die seitliche Rumpfkette – wichtig für saubere Balance im Handstand.'
    ]
  },
  {
    id: 'dragon_flag', name: 'Dragon Flag', cat: 'core', equip: ['none'], rest: 120,
    levels: [
      { stage: 'Tuck Negativ', target: '3 × 5–8' },
      { stage: 'One-Leg Negativ', target: '3 × 5–8' },
      { stage: 'Gestreckt Negativ', target: '3 × 4–6' }
    ],
    tips: [
      'An etwas Festem hinter dem Kopf festhalten, nur Schulterblätter am Boden.',
      'Körper wie ein Brett langsam ablassen – kein Einknicken in der Hüfte.',
      'Sehr anspruchsvoll: erst wenn Hollow Hold 40 Sekunden sitzt.'
    ]
  },

  /* ================= SKILLS ================= */
  {
    id: 'lsit', name: 'L-Sit', cat: 'skill', equip: ['parallettes'], rest: 90,
    levels: [
      { stage: 'Tuck L-Sit', target: '4 × 5–10 Sek' },
      { stage: 'Tuck L-Sit', target: '4 × 10–15 Sek' },
      { stage: 'One-Leg L-Sit', target: '4 × 8–12 Sek' },
      { stage: 'L-Sit', target: '4 × 5–10 Sek' },
      { stage: 'L-Sit', target: '4 × 15–20 Sek' }
    ],
    tips: [
      'Erst Stützhalte einnehmen, dann Knie zur Brust ziehen.',
      'Schultern nach unten drücken – der häufigste Fehler ist Einsinken.',
      'Lieber kurze, saubere Halten als lange mit rundem Rücken.'
    ]
  },
  {
    id: 'handstand', name: 'Freier Handstand', cat: 'skill', equip: ['none'], rest: 90,
    levels: [
      { stage: 'Wandläufe / Kick-up-Übungen', target: '4 × 5–8 Versuche' },
      { stage: 'Kick-up mit Balance-Versuch', target: '5 × 3–5 Versuche' },
      { stage: 'Freistehend 3–5 Sek', target: '5 × 3–5 Sek' },
      { stage: 'Freistehend 10–20 Sek', target: '5 × 10–20 Sek' },
      { stage: 'Freistehend 30+ Sek', target: '5 × 25–40 Sek' }
    ],
    tips: [
      'Balance kommt aus den Fingern: Kippen nach vorn mit den Fingerkuppen abbremsen.',
      'Immer einen Ausstieg üben (Rad zur Seite) – dann traust du dich mehr.',
      'Handstand ist Technik: täglich 5–10 Minuten bringen mehr als einmal pro Woche 30.'
    ]
  },
  {
    id: 'planche', name: 'Planche', cat: 'skill', equip: ['parallettes'], rest: 150,
    levels: [
      { stage: 'Frog Stand (Krähe)', target: '4 × 15–30 Sek' },
      { stage: 'Tuck Planche', target: '4 × 8–15 Sek' },
      { stage: 'Advanced Tuck Planche', target: '4 × 8–12 Sek' },
      { stage: 'Straddle Planche Negativ', target: '4 × 4–6' },
      { stage: 'Straddle Planche', target: '4 × 5–10 Sek' }
    ],
    tips: [
      'Ellbogen bleiben komplett gestreckt – sonst wird es ein Bent-Arm-Hold.',
      'Schultern deutlich vor die Hände, Schulterblätter nach vorn/unten schieben.',
      'Der langsamste Skill überhaupt: mehrere Jahre sind normal. Bau parallel Handgelenks- und Bizeps-Sehnenbelastbarkeit auf.'
    ]
  },
  {
    id: 'hspu', name: 'Handstand Push-up', cat: 'skill', equip: ['none'], rest: 150,
    levels: [
      { stage: 'Pike Push-up, Füße erhöht', target: '4 × 5–8' },
      { stage: 'Wand-HSPU Negativ', target: '4 × 3–5' },
      { stage: 'Wand-HSPU', target: '4 × 2–5' },
      { stage: 'Wand-HSPU', target: '4 × 6–10' }
    ],
    tips: [
      'Kopf bildet mit den Händen ein Dreieck am Boden.',
      'Erst wenn der Wand-Handstand 45 Sekunden sicher steht.',
      'Nackenmuskulatur vorher aufwärmen.'
    ]
  },
  {
    id: 'lsit_hs', name: 'L-Sit zum Handstand', cat: 'skill', equip: ['parallettes'], rest: 180,
    levels: [
      { stage: 'Tuck-Press Negativ (aus HS ablassen)', target: '4 × 3–5' },
      { stage: 'Press mit Absprunghilfe', target: '4 × 3–5' },
      { stage: 'Tuck Press to Handstand', target: '5 × 2–4' },
      { stage: 'Straddle Press to Handstand', target: '5 × 2–4' },
      { stage: 'L-Sit to Handstand', target: '5 × 1–3' }
    ],
    tips: [
      'Voraussetzungen: sicherer L-Sit, 30 Sek freier Handstand, viel Pike-Beweglichkeit.',
      'Der Schlüssel ist die Gewichtsverlagerung nach vorn über die Hände, nicht Schwung.',
      'Negativs (aus dem Handstand langsam in den L-Sit) bauen genau die richtige Kraft.'
    ]
  },

  /* ================= MOBILITY ================= */
  {
    id: 'wrist_prep', name: 'Handgelenks-Routine', cat: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Basis-Routine', target: '2 × 60 Sek' },
      { stage: 'Mit Gewichtsverlagerung', target: '3 × 60 Sek' },
      { stage: 'Mit Fingerliegestützen', target: '3 × 45 Sek' }
    ],
    tips: [
      'Handflächen am Boden, Finger nach vorn / zur Seite / nach hinten – je 20–30 Sek.',
      'Handrücken am Boden, sanft Gewicht verlagern.',
      'Pflichtprogramm vor jeder Push-Einheit. Handgelenksschmerzen sind der häufigste Grund für Trainingspausen bei Handstand-Zielen.'
    ]
  },
  {
    id: 'shoulder_mob', name: 'Schulter-Mobility', cat: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Handtuch-Dislocates + Armkreisen', target: '2 × 10–12' },
      { stage: 'Dislocates enger + Wand-Slides', target: '3 × 10–12' },
      { stage: 'Skin the Cat (an der Stange)', target: '3 × 4–6' }
    ],
    tips: [
      'Handtuch weit greifen, langsam über den Kopf nach hinten führen.',
      'Nur so weit, wie es ohne Schmerz und ohne Ausweichen im Rücken geht.',
      'Gute Schulterüberkopf-Beweglichkeit ist die Voraussetzung für einen geraden Handstand.'
    ]
  },
  {
    id: 'pike_stretch', name: 'Pike / Vorbeuge', cat: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Sitzende Vorbeuge', target: '3 × 45 Sek' },
      { stage: 'Vorbeuge mit aktivem Ziehen', target: '3 × 60 Sek' },
      { stage: 'Erhöhte Pike-Kompression', target: '3 × 45 Sek' }
    ],
    tips: [
      'Aktiv arbeiten: Bauch anspannen und sich selbst näher ziehen, nicht nur hängen.',
      'Kompression (Beine aktiv Richtung Brust) ist der Schlüssel für L-Sit und Press to Handstand.',
      'Nach dem Training dehnen, nicht davor.'
    ]
  },
  {
    id: 'pancake', name: 'Pancake / Grätsche', cat: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Grätsche sitzend', target: '3 × 45 Sek' },
      { stage: 'Pancake mit Vorbeuge', target: '3 × 60 Sek' },
      { stage: 'Aktive Pancake-Lifts', target: '3 × 8–10' }
    ],
    tips: [
      'Knie zeigen nach oben, nicht nach vorn kippen lassen.',
      'Wichtig für Straddle Planche und Straddle Press.',
      'Fortschritt braucht Wochen – dranbleiben und regelmäßig, nicht lange.'
    ]
  },
  {
    id: 'bridge', name: 'Brücke', cat: 'mobility', equip: ['none'], rest: 45,
    levels: [
      { stage: 'Schulterbrücke', target: '3 × 20–30 Sek' },
      { stage: 'Kopfbrücke', target: '3 × 15–25 Sek' },
      { stage: 'Volle Brücke', target: '3 × 20–30 Sek' }
    ],
    tips: [
      'Öffnet Brust und Schultern – guter Gegenspieler zu vielen Liegestützen.',
      'Bewegung aus Brustwirbelsäule und Hüfte holen, nicht nur aus dem unteren Rücken.',
      'Schultern über die Hände schieben.'
    ]
  },
  {
    id: 'hip_mob', name: 'Hüft-Mobility', cat: 'mobility', equip: ['none'], rest: 30,
    levels: [
      { stage: 'Hüftbeuger-Dehnung + 90/90', target: '2 × 45 Sek' },
      { stage: 'Couch Stretch + Frosch', target: '3 × 45 Sek' },
      { stage: 'Aktive 90/90-Wechsel', target: '3 × 8–10' }
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
export const PLAN_TEMPLATES = {
  ab4: {
    name: 'A/B Split · 4× pro Woche',
    desc: 'Der empfohlene Einstieg: Mo/Di/Do/Fr im Wechsel A–B–A–B.',
    days: [
      { key: 'A', title: 'Push & Stütz', sub: 'Drücken · Handstand-Basics',
        ex: ['wrist_prep', 'pushup', 'support', 'pike', 'wall_hs', 'planche_lean', 'dips'] },
      { key: 'B', title: 'Pull, Beine & Core', sub: 'Ziehen · Beine · L-Sit',
        ex: ['hang', 'scap', 'pullup', 'row', 'squat', 'lsit', 'hollow', 'knee_raise'] }
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
        ex: ['wrist_prep', 'shoulder_mob', 'wall_hs', 'planche_lean', 'scap', 'glute_bridge', 'plank', 'pike_stretch'] }
    ]
  },
  ppl: {
    name: 'Push / Pull / Legs',
    desc: 'Klassischer 3er-Split, 3–6× pro Woche wiederholbar.',
    days: [
      { key: 'P', title: 'Push', sub: 'Drücken',
        ex: ['wrist_prep', 'pushup', 'dips', 'pike', 'support', 'planche_lean', 'diamond'] },
      { key: 'Z', title: 'Pull', sub: 'Ziehen',
        ex: ['hang', 'scap', 'pullup', 'row', 'chinup', 'knee_raise'] },
      { key: 'L', title: 'Legs & Core', sub: 'Beine & Rumpf',
        ex: ['squat', 'lunge', 'glute_bridge', 'calf', 'nordic', 'hollow', 'side_plank'] }
    ]
  },
  skill: {
    name: 'Skill-Fokus · 4× pro Woche',
    desc: 'Für später: Skills zuerst im frischen Zustand, dann Kraft.',
    days: [
      { key: 'A', title: 'Handstand & Push', sub: 'Skill zuerst',
        ex: ['wrist_prep', 'handstand', 'wall_hs', 'hspu', 'pushup', 'dips', 'plank'] },
      { key: 'B', title: 'L-Sit & Pull', sub: 'Skill zuerst',
        ex: ['hang', 'lsit', 'front_lever', 'pullup', 'row', 'knee_raise'] },
      { key: 'C', title: 'Planche & Push', sub: 'Skill zuerst',
        ex: ['wrist_prep', 'planche', 'planche_lean', 'support', 'pushup', 'pike', 'hollow'] },
      { key: 'D', title: 'Beine & Mobility', sub: 'Ausgleich',
        ex: ['squat', 'pistol', 'glute_bridge', 'nordic', 'pike_stretch', 'pancake', 'shoulder_mob'] }
    ]
  }
};

/* Meilensteine */
export const MILESTONES = [
  { id: 'pushup5', name: '5 volle Liegestütze am Stück' },
  { id: 'pushup15', name: '15 volle Liegestütze am Stück' },
  { id: 'hang60', name: '60 Sekunden Dead Hang' },
  { id: 'row10', name: '10 Australian Pull-ups' },
  { id: 'chinup1', name: 'Erster Chin-up' },
  { id: 'pullup1', name: 'Erster echter Klimmzug' },
  { id: 'pullup5', name: '5 Klimmzüge am Stück' },
  { id: 'dip1', name: 'Erster Dip auf den Parallettes' },
  { id: 'tuck15', name: '15 Sekunden Tuck L-Sit' },
  { id: 'lsit10', name: 'Voller L-Sit, 10 Sekunden' },
  { id: 'wall30', name: '30 Sek Wand-Handstand (Brust zur Wand)' },
  { id: 'hs5', name: 'Erster freier Handstand (5 Sekunden)' },
  { id: 'hs30', name: 'Freier Handstand, 30 Sekunden' },
  { id: 'lean20', name: '20 Sek Planche Lean mit deutlicher Vorlage' },
  { id: 'tuckplanche', name: 'Tuck Planche, 10 Sekunden' },
  { id: 'lsit_hs1', name: 'L-Sit zum Handstand – erste Wiederholung' }
];

/* Warm-up-Bausteine (fest, vor jeder Einheit) */
export const WARMUP = [
  '2–3 Min lockeres Aufwärmen (Hampelmänner, Marschieren, Seilspringen)',
  'Armkreisen vor- und rückwärts – je 10×',
  'Scapula Push-ups – 2 × 8',
  'Handgelenke: kreisen + Dehnung in alle Richtungen, je 20–30 Sek — Pflicht!',
  'Cat-Cow & Schulteröffner an der Wand – 1 Min',
  'Bei Pull-Tagen: 10–15 Sek locker an der Stange hängen'
];

/* Nachschlagewerk: Übung per ID finden */
export const EX_BY_ID = {};
EXERCISES.forEach(e => { EX_BY_ID[e.id] = e; });

/* Englische Übersetzung der Übungsinhalte aus js/exercises.js.

   Warum eine eigene Datei statt {de, en}-Objekte in exercises.js:
   die Struktur dort (36 Übungen, 141 Stufen) bleibt unangetastet und damit
   das Risiko gering. Zugeordnet wird über die IDs, die laut README ohnehin
   nie geändert werden dürfen. Ein Test prüft, dass jede Übung, jede Stufe
   und jeder Tipp eine Entsprechung hat – eine Lücke fällt sofort auf.

   Zu den Tipps: das sind Ausführungshinweise. Übersetzt wurde die
   Bewegungsanweisung, nicht Wort für Wort; wo es eine etablierte englische
   Fachbezeichnung gibt (hollow, scapular retraction, compression), steht sie
   dort, weil der Nutzer damit weitersuchen können soll.
*/

export const CONTENT_EN = {
  cats: {
    push: 'Push', pull: 'Pull', legs: 'Legs',
    core: 'Core', skill: 'Skills', mobility: 'Mobility'
  },

  exercises: {
    pushup: {
      name: 'Push-ups',
      levels: ['Elevated (table)', 'Elevated (bench/step)', 'Knee push-ups',
               'Full push-ups', 'Full push-ups', 'On parallettes (deeper)',
               'Pseudo-planche push-ups'],
      tips: ['Body like a plank: brace the abs and glutes, ribs pulled down.',
             'Elbows at roughly 45° to the body – do not flare them out sideways.',
             'Full range of motion: chest down towards the edge or floor.']
    },
    diamond: {
      name: 'Diamond push-ups',
      levels: ['Elevated', 'On knees', 'Full'],
      tips: ['Hands form a triangle under the chest – thumbs and index fingers touch.',
             'Triceps focus: keep the elbows close to the body.',
             'A good addition while dips are still too hard.']
    },
    archer_push: {
      name: 'Archer push-ups',
      levels: ['Elevated, slight shift', 'Full, half shift', 'Full, arm almost straight'],
      tips: ['Figures are per side. One arm bends while the other extends sideways.',
             'The road to the one-arm push-up – only once 15 full push-ups are solid.',
             'Keep the hips square to the floor, no twisting.']
    },
    support: {
      name: 'Support hold',
      levels: ['Support hold', 'Support hold', 'Support hold', 'Support + slight lean'],
      tips: ['Arms fully straight, elbows locked out.',
             'Actively push the shoulders down – away from the ears (depression).',
             'The base for the L-sit, dips and later the planche.']
    },
    dips: {
      name: 'Dips',
      levels: ['Bench dips (feet on the floor)', 'Bench dips, feet elevated',
               'Negative dips (parallettes)', 'Dips on parallettes', 'Dips on parallettes'],
      tips: ['Keep the shoulders down, do not let them ride up to the ears.',
             'Lower under control until the upper arm is roughly parallel.',
             'If the front of the shoulder hurts: reduce the range of motion.']
    },
    ring_pushup: {
      name: 'Ring push-ups',
      levels: ['Rings high, body steep', 'Rings low, body flatter', 'Rings just above the floor',
               'Feet elevated', 'With turned-out grip (RTO)'],
      tips: ['The rings wobble – that is exactly the point. Shoulders and core hold against it.',
             'Set the load through the height, not the reps: the lower the rings, the harder it gets.',
             'RTO means turning the palms outwards at the top. Only once the basic form is steady.']
    },
    ring_dip: {
      name: 'Ring dips',
      levels: ['Support hold on the rings', 'Support hold with turned-out grip',
               'Negative, 5-second lower', 'Ring dips', 'Ring dips with RTO at the top'],
      tips: ['Clearly harder than dips on parallettes: the rings also want to be stabilised.',
             'Guide the rings close to the body, wrists neutral – do not let them tip outwards.',
             'Only start once the support hold is steady for 30 seconds.']
    },
    pike: {
      name: 'Pike progression',
      levels: ['Pike hold', 'Pike hold', 'Pike, feet elevated (hold)',
               'Pike push-ups', 'Pike push-ups, feet elevated'],
      tips: ['Hips as high as possible, shift the weight over the shoulders.',
             'Look between your hands, keep the neck long.',
             'Direct strength work for the later handstand push-up.']
    },
    planche_lean: {
      name: 'Planche lean',
      levels: ['Slight lean', 'Moderate lean', 'Pronounced lean', 'Max lean (on the toes)'],
      tips: ['Push-up position on the parallettes, lean the shoulders past the hands.',
             'Only as far as you can keep the elbows locked and the scapulae protracted.',
             'Warm the wrists up thoroughly first – they take a lot of load here.']
    },
    wall_hs: {
      name: 'Wall handstand',
      levels: ['Wall plank, shallow angle', 'Wall plank, steeper',
               'Chest-to-wall handstand', 'Chest-to-wall handstand',
               'Wall handstand + wall walks'],
      tips: ['Push actively out of the shoulders – make yourself as tall as possible.',
             'Abs braced, ribs down, no arching of the lower back.',
             'Chest-to-wall is the better variation: it forces the straight line.']
    },
    hang: {
      name: 'Dead hang',
      levels: ['Passive hang', 'Passive hang', 'Passive hang',
               'Active hang (shoulders down)', 'One-arm assisted'],
      tips: ['Grip slightly wider than shoulder width, thumbs wrapped around the bar.',
             'Keep breathing calmly, the shoulders may hang passively at first.',
             'Builds grip strength – the foundation for everything on the bar.']
    },
    scap: {
      name: 'Scapular pull-ups',
      levels: ['Scapular pull-ups', 'Scapular pull-ups', 'With a 2-second pause at the top'],
      tips: ['Arms stay completely straight – only the shoulder blades pull you up.',
             'Imagine pushing the bar down towards the floor.',
             'The key building block for your first pull-up.']
    },
    row: {
      name: 'Rows (horizontal)',
      levels: ['Table rows, knees bent', 'Table rows, legs straight',
               'Australian pull-ups (low bar)', 'Australian, feet elevated'],
      tips: ['Under a sturdy table or a low bar: pull the chest to the edge.',
             'Retract the shoulder blades first, then bend the arms.',
             'The underrated exercise for a first pull-up – same pulling direction, less load.']
    },
    ring_row: {
      name: 'Ring rows',
      levels: ['Body steep, feet under the rings', 'Body flatter', 'Horizontal, heels on the floor',
               'Horizontal, feet elevated', 'One-arm assisted'],
      tips: ['The angle sets the load – a step forwards or back adjusts it more finely than any weight plate.',
             'Retract the shoulder blades first, then bend the arms.',
             'The body stays a plank: do not let the hips sag.']
    },
    band_pullup: {
      name: 'Band-assisted pull-up',
      levels: ['Thick band, lots of assistance', 'Medium band', 'Thin band',
               'Thin band, final reps only'],
      tips: ['Loop the band over the bar and step in with a knee or foot. It helps most at the bottom, barely at the top.',
             'The second route to a first pull-up alongside negatives – here the full range of motion is kept.',
             'Once a thin band carries 6 clean reps: try the first unassisted pull-up.']
    },
    pullup: {
      name: 'Pull-up progression',
      levels: ['Negative, 3-second lower', 'Negative, 5–8 second lower',
               'First pull-up + negatives', 'Pull-ups', 'Pull-ups', 'Pull-ups'],
      tips: ['Jump or step up, chin over the bar, then lower slowly.',
             'Do not drop through the last few centimetres – that is where strength is built.',
             'Rest 2–3 minutes between sets; this is heavy strength work.']
    },
    chinup: {
      name: 'Chin-ups (supinated grip)',
      levels: ['Negative, 3–5 sec', 'Chin-ups', 'Chin-ups'],
      tips: ['Palms face you – this lets the biceps contribute more.',
             'Most people get their first chin-up before their first pull-up.',
             'Actively pull the elbows down towards the hips.']
    },
    front_lever: {
      name: 'Front lever',
      levels: ['Tuck hang (knees to chest)', 'Tuck front lever',
               'Advanced tuck', 'One-leg front lever'],
      tips: ['Arms straight, pull the shoulders down and back.',
             'Keep the back rounded (hollow) – no arching.',
             'Only worth starting once you manage 5+ clean pull-ups.']
    },
    face_pull: {
      name: 'Band face pulls',
      levels: ['Face pulls standing', 'With a 2-second hold at the back', 'With external rotation at the end'],
      tips: ['Fix the band at face height and pull towards the ears – the elbows stay high.',
             'The counterpart to all the pushing. Keeps the shoulders healthy when the plan is full of push-ups and dips.',
             'Light band, clean execution. What counts here is the movement, not the resistance.']
    },
    squat: {
      name: 'Squats',
      levels: ['Squats', 'Deep squats', 'Tempo squats (3 seconds down)', 'Bulgarian split squats'],
      tips: ['Heels stay on the floor, knees track over the feet.',
             'As deep as you can keep it clean – the back stays neutral.',
             'Tempo: two seconds down, controlled on the way up.']
    },
    lunge: {
      name: 'Lunges',
      levels: ['Lunges', 'Lunges', 'Reverse with a deficit'],
      tips: ['Figures are per leg.',
             'Torso upright, rear knee towards the floor.',
             'Drive up through the front heel.']
    },
    pistol: {
      name: 'Single-leg squat',
      levels: ['Assisted (holding a door frame)', 'Single-leg box squat (high)',
               'Single-leg box squat (low)', 'Pistol squat'],
      tips: ['Figures are per leg.',
             'Extend the free leg forwards, arms as a counterweight.',
             'Needs balance and ankle mobility – be patient.']
    },
    glute_bridge: {
      name: 'Glute bridge',
      levels: ['Both legs', 'Both legs, feet elevated', 'Single leg'],
      tips: ['Squeeze the glutes hard for 1–2 seconds at the top.',
             'Important counterweight to a lot of sitting – good hip extension helps the handstand too.',
             'Ribs down, do not hyperextend the lower back.']
    },
    calf: {
      name: 'Calf raises',
      levels: ['Both legs', 'Both legs on a step (full range)', 'Single leg on a step'],
      tips: ['Lower slowly, pause briefly in the stretch at the bottom.',
             'Hold for one second at the top.',
             'Strengthens the ankles – helps when kicking up into a handstand.']
    },
    nordic: {
      name: 'Hamstrings (nordic progression)',
      levels: ['Straight-leg hinge (good morning)', 'Nordic negative (short range)',
               'Nordic negative (long range)'],
      tips: ['Hook the feet under something heavy or have someone hold them.',
             'Lower forwards as slowly as possible, then catch yourself with the hands.',
             'Protects the hamstrings and knees – often neglected.']
    },
    hollow: {
      name: 'Hollow body hold',
      levels: ['Knees bent', 'Legs straight', 'Arms overhead', 'Hollow rocks'],
      tips: ['Press the lower back firmly into the floor – no gap!',
             'Arms alongside the body make it easier, overhead makes it harder.',
             'The single most important body-tension drill for handstand and planche.']
    },
    knee_raise: {
      name: 'Hanging leg raises',
      levels: ['Knee raises', 'Knee raises', 'Leg raises (straight)', 'Toes to bar'],
      tips: ['No swinging – slow up, slow down.',
             'Tuck the pelvis slightly at the end for maximum abdominal tension.',
             'Transfers directly to the L-sit.']
    },
    plank: {
      name: 'Plank',
      levels: ['Plank', 'Plank', 'Plank, arms extended forwards', 'RKC plank (max tension)'],
      tips: ['Elbows under the shoulders, do not let the hips sag.',
             'For the RKC plank brace everything at once – 20 seconds is then plenty.',
             'If 60 seconds feels easy: pick a harder variation rather than more time.']
    },
    side_plank: {
      name: 'Side plank',
      levels: ['On the knees', 'Straight', 'With the top leg raised'],
      tips: ['Figures are per side.',
             'Actively push the hip up, body in one line.',
             'Strengthens the lateral core chain – important for clean handstand balance.']
    },
    dragon_flag: {
      name: 'Dragon flag',
      levels: ['Tuck negative', 'One-leg negative', 'Straight negative'],
      tips: ['Hold something solid behind your head, only the shoulder blades on the floor.',
             'Lower the body slowly like a plank – no folding at the hips.',
             'Very demanding: only once a 40-second hollow hold is solid.']
    },
    lsit: {
      name: 'L-sit',
      levels: ['Tuck L-sit', 'Tuck L-sit', 'One-leg L-sit', 'L-sit', 'L-sit'],
      tips: ['Take the support hold first, then pull the knees to the chest.',
             'Push the shoulders down – sinking into them is the most common mistake.',
             'Short clean holds beat long ones with a rounded back.']
    },
    handstand: {
      name: 'Free handstand',
      levels: ['Wall walks / kick-up drills', 'Kick-up with a balance attempt',
               'Freestanding 3–5 sec', 'Freestanding 10–20 sec', 'Freestanding 30+ sec'],
      tips: ['Balance comes from the fingers: catch a forward tip with the fingertips.',
             'Always practise a bail (cartwheel out) – you will dare more once you can.',
             'Handstand is a skill: 5–10 minutes daily beats 30 minutes once a week.']
    },
    planche: {
      name: 'Planche',
      levels: ['Frog stand (crow)', 'Tuck planche', 'Advanced tuck planche',
               'Straddle planche negative', 'Straddle planche'],
      tips: ['Elbows stay completely locked – otherwise it becomes a bent-arm hold.',
             'Shoulders clearly in front of the hands, scapulae pushed forwards and down.',
             'The slowest skill there is: several years is normal. Build wrist and biceps tendon tolerance alongside it.']
    },
    hspu: {
      name: 'Handstand push-up',
      levels: ['Pike push-up, feet elevated', 'Wall HSPU negative', 'Wall HSPU', 'Wall HSPU'],
      tips: ['The head forms a triangle with the hands on the floor.',
             'Only once the wall handstand holds solidly for 45 seconds.',
             'Warm up the neck muscles beforehand.']
    },
    lsit_hs: {
      name: 'L-sit to handstand',
      levels: ['Tuck press negative (lowering from the handstand)', 'Press with a jump assist',
               'Tuck press to handstand', 'Straddle press to handstand', 'L-sit to handstand'],
      tips: ['Prerequisites: a solid L-sit, a 30-second free handstand and plenty of pike mobility.',
             'The key is shifting your weight forwards over the hands, not momentum.',
             'Negatives (lowering slowly from the handstand into the L-sit) build exactly the right strength.']
    },
    wrist_prep: {
      name: 'Wrist routine',
      levels: ['Basic routine', 'With weight shifting', 'With fingertip push-ups'],
      tips: ['Palms on the floor, fingers forwards / sideways / backwards – 20–30 sec each.',
             'Backs of the hands on the floor, shift weight gently.',
             'Mandatory before every push session. Wrist pain is the most common reason people pause training towards handstand goals.']
    },
    shoulder_mob: {
      name: 'Shoulder mobility',
      levels: ['Towel dislocates + arm circles', 'Narrower dislocates + wall slides',
               'Skin the cat (on the bar)'],
      tips: ['Take a wide grip on the towel, guide it slowly overhead and behind you.',
             'Only as far as it goes without pain and without the back compensating.',
             'Good overhead shoulder mobility is the prerequisite for a straight handstand.']
    },
    band_pullapart: {
      name: 'Band pull-aparts',
      levels: ['In front of the chest, arms straight', 'Overhead and back', 'Dislocates with the band'],
      tips: ['The arms stay straight – the movement comes from the shoulder blades.',
             'The more comfortable stand-in for towel dislocates: the band gives way and allows more range.',
             'Fits into the warm-up of every push session.']
    },
    pike_stretch: {
      name: 'Pike / forward fold',
      levels: ['Seated forward fold', 'Forward fold with active pulling', 'Elevated pike compression'],
      tips: ['Work actively: brace the abs and pull yourself closer, do not just hang.',
             'Compression (pulling the legs actively towards the chest) is the key to the L-sit and press to handstand.',
             'Stretch after training, not before.']
    },
    pancake: {
      name: 'Pancake / straddle',
      levels: ['Seated straddle', 'Pancake with a forward fold', 'Active pancake lifts'],
      tips: ['Knees point up, do not let them roll forwards.',
             'Important for the straddle planche and straddle press.',
             'Progress takes weeks – be regular rather than long.']
    },
    bridge: {
      name: 'Bridge',
      levels: ['Shoulder bridge', 'Head bridge', 'Full bridge'],
      tips: ['Opens the chest and shoulders – a good counterweight to lots of push-ups.',
             'Take the movement from the thoracic spine and hips, not just the lower back.',
             'Push the shoulders out over the hands.']
    },
    hip_mob: {
      name: 'Hip mobility',
      levels: ['Hip flexor stretch + 90/90', 'Couch stretch + frog', 'Active 90/90 switches'],
      tips: ['Figures are per side.',
             'Squeeze the glutes to actually feel the stretch in the hip flexor.',
             'Tight hip flexors make the hollow position and the handstand harder.']
    }
  },

  milestones: {
    pushup5: '5 full push-ups in a row',
    pushup15: '15 full push-ups in a row',
    hang60: '60-second dead hang',
    row10: '10 Australian pull-ups',
    ringrow10: '10 horizontal ring rows',
    chinup1: 'First chin-up',
    pullup1: 'First real pull-up',
    pullup5: '5 pull-ups in a row',
    dip1: 'First dip on the parallettes',
    ringdip1: 'First ring dip',
    tuck15: '15-second tuck L-sit',
    lsit10: 'Full L-sit, 10 seconds',
    wall30: '30-second wall handstand (chest to wall)',
    hs5: 'First free handstand (5 seconds)',
    hs30: 'Free handstand, 30 seconds',
    lean20: '20-second planche lean with a pronounced lean',
    tuckplanche: 'Tuck planche, 10 seconds',
    lsit_hs1: 'L-sit to handstand – first repetition'
  },

  /* Gleiche Reihenfolge wie WARMUP in exercises.js. */
  warmup: [
    '2–3 min of easy warm-up (jumping jacks, marching, skipping rope)',
    'Arm circles forwards and backwards – 10× each',
    'Scapular push-ups – 2 × 8',
    'Wrists: circles + stretching in every direction, 20–30 sec each — mandatory!',
    'Cat-cow & shoulder openers at the wall – 1 min',
    'On pull days: hang loosely from the bar for 10–15 sec'
  ],

  plans: {
    ab4: {
      name: 'A/B split · 4× per week',
      desc: 'The recommended start: Mon/Tue/Thu/Fri alternating A–B–A–B.',
      days: {
        A: { title: 'Push & support', sub: 'Pushing · handstand basics' },
        B: { title: 'Pull, legs & core', sub: 'Pulling · legs · L-sit' }
      }
    },
    full3: {
      name: 'Full body · 3× per week',
      desc: 'Short on time or in a deload week: everything important in one session.',
      days: {
        1: { title: 'Full body A', sub: 'Fundamentals' },
        2: { title: 'Full body B', sub: 'Pulling & skill focus' },
        3: { title: 'Full body C', sub: 'Skills & mobility' }
      }
    },
    ppl: {
      name: 'Push / Pull / Legs',
      desc: 'The classic three-way split, repeatable 3–6× per week.',
      days: {
        P: { title: 'Push', sub: 'Pushing' },
        Z: { title: 'Pull', sub: 'Pulling' },
        L: { title: 'Legs & core', sub: 'Legs & core' }
      }
    },
    skill: {
      name: 'Skill focus · 4× per week',
      desc: 'For later on: skills first while fresh, then strength.',
      days: {
        A: { title: 'Handstand & push', sub: 'Skill first' },
        B: { title: 'L-sit & pull', sub: 'Skill first' },
        C: { title: 'Planche & push', sub: 'Skill first' },
        D: { title: 'Legs & mobility', sub: 'Balance work' }
      }
    }
  }
};

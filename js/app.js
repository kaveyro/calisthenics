/* =========================================================
   PROGRESSION – App-Logik
   ========================================================= */

const SETTINGS_DEFAULTS = {
  rest: 90, perExRest: true, autoRest: true, sound: true, vibrate: true,
  setsMode: 'standard', streak: 2, weekGoal: 4, deload: 24, lang: 'de'
};

const DEFAULT_STATE = () => ({
  v: 4, planId: 'ab4', customPlan: null,
  levels: {}, streaks: {}, prs: {}, notes: {}, milestones: {},
  weights: [], log: [], workouts: 0, byDay: {},
  lastDate: null, theme: null, settings: {}, deloadDismissed: 0,
  streakDays: 0, lastWeek: null, measurements: {},
  warmupCustom: null, pauseHistory: {}
});

let state = DEFAULT_STATE();
let session = { dayKey: null, sets: {}, top: {}, reps: {} };
let holdTimer = null, restTimer = null, wakeLock = null;
let libFilter = 'all', libOpen = {}, exHistoryOpen = null;
let storageOK = true, lastWorkoutSnapshot = null, undoTimeout = null;

const LANG = {
  de: {
    appName: 'Progression',
    trainings: 'Trainings', thisWeek: 'Diese Woche', levelUps: 'Level-Ups',
    goals: 'Ziele', warmup: 'Warm-up (8–10 Min) – vor jeder Einheit',
    selectDay: 'Wähle oben deinen Trainingstag', pause: 'Pause', tapEnd: 'Tippen beendet',
    settings: 'Einstellungen', close: 'Schließen', training: 'Training',
    history: 'Verlauf', exercises: 'Übungen', plan: 'Plan', milestones: 'Ziele',
    finishWorkout: 'Training abschließen', setsMode: 'Satz-Modus',
    restBasic: 'Satzpause', perExRest: 'Übungsspezifische Pausen',
    autoRest: 'Pausen-Timer automatisch', sound: 'Signaltöne',
    vibration: 'Vibration', levelUpAfter: 'Level-Up nach',
    weekGoal: 'Wochenziel', deloadRemind: 'Deload-Erinnerung',
    dataBackup: 'Daten & Backup', downloadBackup: 'Backup herunterladen',
    importBackup: 'Backup importieren', exportCSV: 'Verlauf als CSV',
    copyText: 'Als Text kopieren', resetAll: 'Alles zurücksetzen',
    light: 'Hell', dark: 'Dunkel', standard: 'Standard (3–4)',
    lightMode: 'Einsteiger (max. 3)', hard: 'Fortgeschritten (+1 Satz)',
    off: 'Aus', search: 'Übung suchen …', all: 'Alle',
    inPlan: 'im Plan', noExercises: 'Keine Übung gefunden.',
    noHistory: 'Noch keine Trainings', noLogs: 'Noch keine Einträge.',
    noPlanDays: 'Dein Plan hat keine Trainingstage',
    template: 'Vorlage', customPlan: 'Eigener Plan',
    addDay: 'Trainingstag hinzufügen', resetToTemplate: 'Auf Vorlage zurücksetzen',
    addExercise: 'Hinzufügen', rename: 'Umbenennen', remove: 'entfernen',
    moveUp: 'nach oben', moveDown: 'nach unten',
    topLimit: 'Oberes Limit in allen Sätzen geschafft',
    tips: 'Tipps zur Übung', notes: 'Notiz', best: 'Bestleistung',
    save: 'Speichern', cancel: 'Abbrechen', confirm: 'Bestätigen',
    level: 'Stufe', sets: 'Sätze', reps: 'Wdh', sec: 'Sek',
    kg: 'kg', bodyWeight: 'Körpergewicht', weightHint: 'Gewicht in kg',
    workoutLog: 'Letzte Trainings', perExercise: 'pro Übung',
    undo: 'Rückgängig', done: 'Erledigt', week: 'Woche',
    chartWorkouts: 'Trainings pro Woche', chartVolume: 'Sätze pro Woche',
    totalVolume: 'Gesamtvolumen', measurements: 'Körpermaße',
    chest: 'Brust', waist: 'Taille', arm: 'Arm', thigh: 'Oberschenkel',
    plateauDetected: 'Stagnation erkannt', plateauMsg: 'Diese Übung macht seit mehreren Einheiten keine Fortschritte. Vielleicht eine leichtere Variante versuchen oder die Form überprüfen.',
    regressAfterBreak: 'Nach der Pause eine Stufe zurückgestuft',
    globalStreak: 'Trainingsserie', days: 'Tage',
    calendar: 'Kalender', schedule: 'Planübersicht',
    substitute: 'Ersetzen', superset: 'Supersatz',
    warmupCustom: 'Warm-up anpassen', milestoneSearch: 'Meilenstein suchen',
    keyboardHints: 'Tastatur: Leertaste = Satz, R = Pause, 1-5 = Tag',
    undoWorkout: 'Training rückgängig gemacht',
    volumeProgress: 'Volumensteigerung',
    addMeasurement: 'Maß speichern', cm: 'cm'
  }
};

let T = LANG.de;
function setLang(l){ T = LANG[l] || LANG.de; }
function __(k){ return T[k] || k; }

function cfg(k){
  return (state.settings && state.settings[k] !== undefined) ? state.settings[k] : SETTINGS_DEFAULTS[k];
}

/* ================= Start ================= */
(async function boot(){
  const loaded = await store.load();
  if(loaded) state = Object.assign(DEFAULT_STATE(), loaded);
  setLang(cfg('lang'));
  applyTheme();
  renderWarmup();
  renderAll();
  registerSW();
  addKeyboardShortcuts();
})();

async function save(){
  try{
    const res = await store.save(state);
    if(!res) throw new Error('no result');
  }catch(e){
    if(storageOK){
      storageOK = false;
      toast('Speichern nicht möglich – Fortschritt gilt nur für diese Sitzung.');
    }
  }
}

function registerSW(){
  if('serviceWorker' in navigator && location.protocol.startsWith('http')){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
}

function renderAll(){
  renderStats(); renderPhase(); renderBanners(); renderDaySelect();
  document.getElementById('content').innerHTML =
    '<div class="empty-hint">' + __('selectDay') + '.<br><br>' +
    'Bei Halteübungen startet ein Tipp auf den Satz einen Countdown mit Signal.</div>';
}

/* ================= Theme ================= */
function applyTheme(){
  let t = state.theme;
  if(!t) t = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = t === 'dark' ? '☀' : '☾';
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.setAttribute('content', t === 'dark' ? '#14161A' : '#F3F4F1');
}
function toggleTheme(){
  state.theme = (document.documentElement.dataset.theme === 'dark') ? 'light' : 'dark';
  applyTheme(); save();
}

/* ================= Plan ================= */
function getPlan(){
  if(state.customPlan) return state.customPlan;
  return PLAN_TEMPLATES[state.planId] || PLAN_TEMPLATES.ab4;
}
function getDays(){ return getPlan().days || []; }
function getDay(key){ return getDays().find(d => d.key === key); }

function nextSuggestedKey(){
  const days = getDays();
  if(!days.length) return null;
  const last = (state.log || []).slice(-1)[0];
  if(!last) return days[0].key;
  const i = days.findIndex(d => d.key === last.day);
  return days[(i + 1) % days.length].key;
}

/* ================= Kopfbereich ================= */
function renderStats(){
  const ups = Object.values(state.levels).reduce((a, b) => a + b, 0);
  const ms = Object.keys(state.milestones || {}).length;
  const thisWeek = (state.log || []).filter(l => isoWeek(l.d) === isoWeek(today())).length;
  const streak = calcGlobalStreak();
  document.getElementById('stats').innerHTML =
    statBox(state.workouts || 0, __('trainings')) +
    statBox(thisWeek + ' / ' + cfg('weekGoal'), __('thisWeek')) +
    statBox(ups, __('levelUps')) +
    statBox(ms + ' / ' + MILESTONES.length, __('goals'));
  document.getElementById('planName').textContent = getPlan().name;
}
function statBox(n, l){
  return '<div class="stat"><div class="num">' + n + '</div><div class="lbl">' + l + '</div></div>';
}
function renderPhase(){
  const perWeek = Math.max(2, cfg('weekGoal'));
  const w = Math.min(8, Math.floor((state.workouts || 0) / perWeek) + 1);
  let phase = 'Technik & Gewöhnung';
  if(w >= 3) phase = 'Volumen steigern';
  if(w >= 5) phase = 'Übungen schwerer machen';
  if(w >= 7) phase = 'Meilensteine testen';
  let extra = '';
  const gs = calcGlobalStreak();
  if(gs >= 7) extra += ' · Serie: <b>' + gs + ' ' + __('days') + '</b>';
  document.getElementById('phaseLine').innerHTML =
    'Woche <b>' + w + '</b>/8 · <b>' + phase + '</b>' +
    (state.lastDate ? ' · zuletzt <b>' + fmtDate(state.lastDate) + '</b>' : '') + extra;
}

/* ================= Global Streak & Plateau Detection ================= */
function calcGlobalStreak(){
  if(!state.log || !state.log.length) return 0;
  let streak = 0;
  const dates = [...new Set(state.log.map(l => l.d))].sort().reverse();
  for(let i = 0; i < dates.length; i++){
    const expected = new Date();
    expected.setDate(expected.getDate() - i);
    const expectedStr = new Date(expected.getTime() - expected.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if(dates[i] === expectedStr) streak++;
    else break;
  }
  return streak;
}

function detectPlateaus(){
  const plateaus = [];
  getDays().forEach(d => {
    d.ex.forEach(id => {
      const ex = EX_BY_ID[id]; if(!ex) return;
      const recent = (state.log || []).filter(l => {
        const day = getDay(l.day);
        return day && day.ex.includes(id);
      }).slice(-5);
      if(recent.length >= 4 && !recent.some(l => l.ups && l.ups.length)){
        const lvl = state.levels[id] || 0;
        if(lvl < ex.levels.length - 1) plateaus.push(ex.name);
      }
    });
  });
  return plateaus;
}

function applyRegression(){
  if(!state.lastDate) return;
  const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
  if(days >= 14){
    let regressed = false;
    Object.keys(state.levels).forEach(id => {
      const ex = EX_BY_ID[id];
      if(!ex || !state.levels[id]) return;
      if(days >= 14 && state.levels[id] > 0){
        state.levels[id] = Math.max(0, state.levels[id] - 1);
        state.streaks[id] = 0;
        regressed = true;
      }
    });
    if(regressed) toast(__('regressAfterBreak'), true);
  }
}

function renderBanners(){
  const el = document.getElementById('banners');
  let html = '';
  const every = cfg('deload');
  if(every > 0){
    const due = Math.floor((state.workouts || 0) / every) * every;
    if(due > 0 && due > (state.deloadDismissed || 0)){
      html += '<div class="banner warn"><b>Deload-Woche empfohlen.</b> Du hast ' + state.workouts +
        ' Trainings absolviert. Mach diese Woche nur die Hälfte der Sätze mit leichteren Varianten – Sehnen und Gelenke brauchen das, besonders bei Stütz- und Zugarbeit.' +
        '<br><button onclick="dismissDeload(' + due + ')">Verstanden</button></div>';
    }
  }
  if(state.lastDate){
    const days = Math.round((new Date(today()) - new Date(state.lastDate)) / 864e5);
    if(days >= 7){
      html += '<div class="banner info">Letztes Training war vor ' + days +
        ' Tagen. Steig ruhig eine Stufe niedriger wieder ein – nach einer Pause ist das kein Rückschritt, sondern Verletzungsprophylaxe.</div>';
    }
  }
  const plateaus = detectPlateaus();
  if(plateaus.length){
    html += '<div class="banner warn">' + __('plateauDetected') + ': ' + plateaus.join(', ') +
      '.<br><small>' + __('plateauMsg') + '</small></div>';
  }
  el.innerHTML = html;
}
function dismissDeload(n){ state.deloadDismissed = n; save(); renderBanners(); }

function renderWarmup(){
  const items = state.warmupCustom || WARMUP;
  const el = document.getElementById('warmupList');
  el.innerHTML = items.map((w, i) =>
    '<li' + (w.includes('Pflicht') ? ' class="pflicht"' : '') + '>' +
    esc(w) + ' <button class="mini-btn" onclick="removeWarmupItem(' + i + ')" title="entfernen" style="font-size:10px;width:20px;height:20px;margin-left:6px">✕</button></li>'
  ).join('');
}
function removeWarmupItem(i){
  if(!state.warmupCustom) state.warmupCustom = [...WARMUP];
  state.warmupCustom.splice(i, 1);
  save(); renderWarmup();
}
function addWarmupItem(){
  const t = prompt('Neuen Warm-up-Eintrag:');
  if(!t) return;
  if(!state.warmupCustom) state.warmupCustom = [...WARMUP];
  state.warmupCustom.push(t);
  save(); renderWarmup();
}

/* ================= Tabs ================= */
const TABS = ['train', 'history', 'library', 'plan', 'milestones'];
function showTab(t){
  TABS.forEach(x => {
    document.getElementById('view-' + x).hidden = (x !== t);
    document.getElementById('tab-' + x).classList.toggle('active', x === t);
    document.getElementById('tab-' + x).ariaSelected = (x === t) ? 'true' : 'false';
  });
  document.getElementById('finishBar').style.display = (t === 'train' && session.dayKey) ? 'block' : 'none';
  if(t === 'history') renderHistory();
  if(t === 'library') { renderCatFilter(); renderLibrary(); }
  if(t === 'plan') renderPlanTab();
  if(t === 'milestones') { renderMilestones(); renderRoadmap(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ================= Tab Keyboard Navigation ================= */
function addKeyboardShortcuts(){
  document.addEventListener('keydown', e => {
    if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if(e.key === ' ' && session.dayKey){
      e.preventDefault();
      const active = document.activeElement;
      if(active && active.classList.contains('set-dot')){ active.click(); return; }
      const firstUndone = document.querySelector('.set-dot:not(.done)');
      if(firstUndone) firstUndone.click();
      return;
    }
    if(e.key === 'r' || e.key === 'R'){
      if(document.getElementById('restChip').style.display === 'block') stopRest();
      else if(session.dayKey){
        const defaultRest = cfg('rest');
        startRest(defaultRest);
        toast('Pause ' + defaultRest + ' Sek');
      }
      return;
    }
    if(e.key >= '1' && e.key <= '5'){
      const tabs = ['train', 'history', 'library', 'plan', 'milestones'];
      showTab(tabs[parseInt(e.key) - 1]);
    }
    if(e.key === 'Escape') closeSettings();
  });
}

/* ================= Trainingstag wählen ================= */
function renderDaySelect(){
  const sug = nextSuggestedKey();
  document.getElementById('daySelect').innerHTML = getDays().map(d =>
    '<button class="day-btn' + (session.dayKey === d.key ? ' active' : '') + '" onclick="selectDay(\'' + d.key + '\')">' +
    (d.key === sug && !session.dayKey ? '<span class="badge">dran</span>' : '') +
    '<div class="tag">' + esc(d.key) + ' · ' + esc(d.title) + '</div>' +
    '<div class="sub">' + esc(d.sub || (d.ex.length + ' Übungen')) + '</div></button>'
  ).join('') || '<div class="empty-hint">' + __('noPlanDays') + ' – lege im Tab „Plan" einen an.</div>';
}

/* ================= Sätze & Ziele berechnen ================= */
function parseTarget(target){
  const sm = target.match(/^(\d+)\s*×/);
  const hm = target.match(/(\d+)(?:–(\d+))?\s*Sek/);
  const rm = target.match(/(\d+)(?:–(\d+))?$/);
  let sets = sm ? parseInt(sm[1], 10) : 3;
  const mode = cfg('setsMode');
  if(mode === 'light') sets = Math.min(sets, 3);
  if(mode === 'hard') sets = sets + 1;
  let minReps = null, maxReps = null;
  if(rm && !hm){ minReps = parseInt(rm[1], 10); maxReps = rm[2] ? parseInt(rm[2], 10) : minReps; }
  return { sets, isHold: !!hm, holdSecs: hm ? parseInt(hm[2] || hm[1], 10) : 0, minReps, maxReps };
}
function lvlOf(ex){ return Math.min(state.levels[ex.id] || 0, ex.levels.length - 1); }
function restFor(ex){ return (cfg('perExRest') && ex.rest) ? ex.rest : cfg('rest'); }

/* ================= Workout rendern ================= */
function selectDay(key){
  cancelHold(); stopRest();
  session = { dayKey: key, sets: {}, top: {}, reps: {} };
  renderDaySelect(); renderWorkout(); requestWakeLock();
}

function renderWorkout(){
  const day = getDay(session.dayKey);
  if(!day) return;
  const need = cfg('streak');
  let html = '';

  day.ex.forEach(id => {
    const ex = EX_BY_ID[id];
    if(!ex) return;
    const lvl = lvlOf(ex), level = ex.levels[lvl], maxed = lvl >= ex.levels.length - 1;
    const t = parseTarget(level.target), streak = state.streaks[ex.id] || 0;

    let rungs = '';
    ex.levels.forEach((l, i) => {
      if(i > 0) rungs += '<div class="rung-line' + (i <= lvl ? ' done' : '') + '"></div>';
      rungs += '<div class="rung' + (i < lvl ? ' done' : (i === lvl ? ' current' : '')) + '" title="' + esc(l.stage) + '"></div>';
    });

    let dots = '';
    for(let s = 0; s < t.sets; s++){
      const repKey = ex.id + '-' + s;
      dots += '<button class="set-dot" id="set-' + repKey + '" onclick="tapSet(\'' + ex.id + '\',' + s + ')" aria-label="' + __('sets') + ' ' + (s + 1) + '">' + (s + 1) + '</button>';
      if(!t.isHold && t.maxReps){
        dots += '<input class="rep-input" id="rep-' + repKey + '" type="number" min="0" max="' + (t.maxReps + 10) + '" placeholder="' + (t.minReps + '-' + t.maxReps) + '" title="' + __('reps') + '" value="' + ((session.reps || {})[repKey] || '') + '" onchange="session.reps[\'' + repKey + '\']=parseInt(this.value)||null">';
      }
    }

    let hint;
    if(maxed && streak >= need) hint = '<span class="streak-hint hot">Höchste Stufe erreicht – stark!</span>';
    else if(streak === need - 1 && streak > 0) hint = '<span class="streak-hint hot">' + streak + '/' + need + ' – noch 1× oberes Limit bis zur nächsten Stufe!</span>';
    else hint = '<span class="streak-hint">' + streak + '/' + need + ' Einheiten am oberen Limit bis zum Aufstieg</span>';

    const note = (state.notes || {})[ex.id];
    const pr = (state.prs || {})[ex.id];

    html += '<div class="ex" data-exid="' + ex.id + '">' +
      '<div class="ex-top"><span class="rung-label">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length +
        ' <span class="cat-chip">' + CATS[ex.cat].name + '</span></span>' +
        '<span class="lvl-adjust"><button onclick="adjustLevel(\'' + ex.id + '\',-1)" title="Stufe verringern" aria-label="Stufe verringern">−</button>' +
        '<button onclick="adjustLevel(\'' + ex.id + '\',1)" title="Stufe erhöhen" aria-label="Stufe erhöhen">+</button></span></div>' +
      '<div class="rungs">' + rungs + '</div>' +
      '<div class="ex-head"><div class="ex-name">' + esc(ex.name) + '</div><div class="ex-target">' + esc(level.target) + '</div></div>' +
      '<div class="ex-stage">Aktuell: <b>' + esc(level.stage) + '</b></div>' +
      (pr ? '<div class="pr-line">' + __('best') + ': ' + esc(pr.v) + ' (' + fmtDate(pr.d) + ')</div>' : '') +
      (note ? '<div class="last-note">Letztes Mal (' + fmtDate(note.d) + '): „' + esc(note.t) + '"</div>' : '') +
      '<div class="sets">' + dots + '</div>' +
      (t.isHold ? '<span class="hold-hint">Tipp auf einen Satz startet den ' + t.holdSecs + '-Sek-Timer · Pause ' + restFor(ex) + ' Sek</span>'
                : '<span class="hold-hint">Pause ' + restFor(ex) + ' Sek</span>') +
      '<label class="toplimit" id="top-' + ex.id + '"><input type="checkbox" onchange="toggleTop(\'' + ex.id + '\',this.checked)"><span>' + __('topLimit') + '</span></label>' +
      hint +
      '<textarea class="note-input" id="note-' + ex.id + '" rows="1" placeholder="' + __('notes') + ' (z. B. „6 Sek Negativ geschafft") – optional"></textarea>' +
      '<button class="tip-btn" onclick="toggleTips(\'' + ex.id + '\')">' + __('tips') + '</button>' +
      '<ul class="tips" id="tips-' + ex.id + '">' + ex.tips.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      '<button class="sub-btn" onclick="substituteExercise(\'' + ex.id + '\')">↻ ' + __('substitute') + '</button>' +
      '<button class="tip-btn" onclick="showExHistory(\'' + ex.id + '\')">📊 ' + __('perExercise') + '</button>' +
      '</div>';
  });

  document.getElementById('content').innerHTML = html;
  document.getElementById('finishBar').style.display = 'block';
  updateFinish();
}

function snapshotNotes(){
  const n = {};
  const day = getDay(session.dayKey);
  if(day) day.ex.forEach(id => {
    const el = document.getElementById('note-' + id);
    if(el) n[id] = el.value;
  });
  return n;
}
function restoreSession(notes, reps){
  Object.keys(session.sets).forEach(k => {
    if(session.sets[k]){ const el = document.getElementById('set-' + k); if(el) el.classList.add('done'); }
  });
  Object.keys(session.top).forEach(id => {
    if(session.top[id]){
      const l = document.getElementById('top-' + id);
      if(l){ l.classList.add('checked'); l.querySelector('input').checked = true; }
    }
  });
  Object.keys(notes || {}).forEach(id => {
    const el = document.getElementById('note-' + id); if(el) el.value = notes[id];
  });
  Object.keys(reps || {}).forEach(k => {
    const el = document.getElementById('rep-' + k); if(el && reps[k]) el.value = reps[k];
  });
  updateFinish();
}

function adjustLevel(id, d){
  const ex = EX_BY_ID[id]; if(!ex) return;
  const cur = state.levels[id] || 0;
  const next = Math.max(0, Math.min(ex.levels.length - 1, cur + d));
  if(next === cur) return;
  state.levels[id] = next; state.streaks[id] = 0;
  save(); renderStats();
  if(session.dayKey){ const n = snapshotNotes(); const r = session.reps; renderWorkout(); restoreSession(n, r); }
  if(!document.getElementById('view-library').hidden) renderLibrary();
  toast(ex.name + ': Stufe "' + ex.levels[next].stage + '"');
}

/* ================= Substitute Exercise ================= */
function substituteExercise(id){
  const ex = EX_BY_ID[id]; if(!ex) return;
  const sameCat = EXERCISES.filter(e => e.cat === ex.cat && e.id !== id);
  if(!sameCat.length){ toast('Keine Alternative in dieser Kategorie gefunden.'); return; }
  const names = sameCat.map((e, i) => (i + 1) + '. ' + e.name).join('\n');
  const choice = prompt('Ersatz für "' + ex.name + '" wählen:\n\n' + names + '\n\nNummer eingeben:');
  if(!choice) return;
  const idx = parseInt(choice, 10) - 1;
  if(isNaN(idx) || idx < 0 || idx >= sameCat.length){ toast('Ungültige Auswahl.'); return; }
  const p = ensureCustom();
  const day = p.days.find(d => d.key === session.dayKey);
  if(!day) return;
  const ei = day.ex.indexOf(id);
  if(ei >= 0) day.ex[ei] = sameCat[idx].id;
  save();
  const n = snapshotNotes(); const r = session.reps;
  session.sets = {}; session.top = {};
  renderWorkout(); restoreSession(n, r);
  toast(sameCat[idx].name + ' als Ersatz eingetragen.');
}

/* ================= Per-Exercise History ================= */
function showExHistory(id){
  const ex = EX_BY_ID[id]; if(!ex) return;
  const logEntries = (state.log || []).filter(l => {
    const day = getDay(l.day);
    return day && day.ex.includes(id);
  }).slice(-15).reverse();
  let html = '<div class="modal" style="max-width:400px;padding:16px"><div class="modal-head">' +
    esc(ex.name) + ' · Verlauf<button onclick="closeExHistory()">✕</button></div>';
  if(!logEntries.length) html += '<div class="muted">Noch keine Einträge.</div>';
  else {
    html += '<table style="width:100%;font-size:13px"><tr><th>Datum</th><th>Sätze</th><th>Top</th><th>Level</th></tr>';
    logEntries.forEach(l => {
      const lvl = state.levels[id] || 0;
      html += '<tr><td>' + fmtDate(l.d) + '</td><td>' + l.sets + '</td><td>' + (l.tops ? '✓' : '') + '</td><td>' +
        (l.ups && l.ups.length ? '▲' + l.ups.length : '') + '</td></tr>';
    });
    html += '</table>';
  }
  html += '</div>';
  const overlay = document.getElementById('exHistoryOverlay') || (() => {
    const o = document.createElement('div'); o.id = 'exHistoryOverlay';
    o.className = 'overlay'; o.onclick = function(e){ if(e.target === this) closeExHistory(); };
    document.body.appendChild(o); return o;
  })();
  overlay.innerHTML = html;
  overlay.classList.add('open');
}
function closeExHistory(){ const o = document.getElementById('exHistoryOverlay'); if(o) o.classList.remove('open'); }

/* ================= Satz-Interaktion ================= */
function tapSet(id, s){
  const ex = EX_BY_ID[id];
  const t = parseTarget(ex.levels[lvlOf(ex)].target);
  const key = id + '-' + s;
  const el = document.getElementById('set-' + key);

  if(holdTimer && holdTimer.key === key){ cancelHold(); return; }

  if(session.sets[key]){
    session.sets[key] = false;
    el.classList.remove('done'); el.textContent = s + 1;
    updateFinish(); return;
  }

  if(t.isHold){
    cancelHold();
    let rem = t.holdSecs;
    el.classList.add('running'); el.textContent = rem;
    holdTimer = { key, el, id, s, interval: setInterval(() => {
      rem--;
      if(rem <= 0){
        clearInterval(holdTimer.interval); holdTimer = null;
        el.classList.remove('running');
        markDone(key, el, s, ex);
        signal(true);
      } else el.textContent = rem;
    }, 1000) };
  } else {
    markDone(key, el, s, ex);
  }
}
function markDone(key, el, s, ex){
  session.sets[key] = true;
  el.classList.add('done'); el.textContent = s + 1;
  updateFinish();
  if(cfg('autoRest')) startRest(restFor(ex));
}
function cancelHold(){
  if(!holdTimer) return;
  clearInterval(holdTimer.interval);
  holdTimer.el.classList.remove('running');
  holdTimer.el.textContent = holdTimer.s + 1;
  holdTimer = null;
}
function toggleTop(id, on){
  session.top[id] = on;
  document.getElementById('top-' + id).classList.toggle('checked', on);
}
function toggleTips(id){ document.getElementById('tips-' + id).classList.toggle('open'); }

function updateFinish(){
  const day = getDay(session.dayKey); if(!day) return;
  const done = Object.values(session.sets).filter(Boolean).length;
  const total = day.ex.reduce((a, id) => {
    const ex = EX_BY_ID[id];
    return ex ? a + parseTarget(ex.levels[lvlOf(ex)].target).sets : a;
  }, 0);
  document.getElementById('finishCount').textContent = done + '/' + total + ' ' + __('sets');
  document.getElementById('finishBtn').disabled = done === 0;
}

/* ================= Pausen-Timer ================= */
function startRest(secs){
  stopRest();
  let rem = secs || cfg('rest');
  const chip = document.getElementById('restChip'), out = document.getElementById('restTime');
  const f = n => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  out.textContent = f(rem); chip.style.display = 'block';
  restTimer = setInterval(() => {
    rem--;
    if(rem <= 0){ stopRest(); signal(false); toast('Pause vorbei – nächster Satz!'); }
    else out.textContent = f(rem);
  }, 1000);
}
function stopRest(){
  if(restTimer){ clearInterval(restTimer); restTimer = null; }
  document.getElementById('restChip').style.display = 'none';
}

/* ================= Signal (Ton + Vibration) ================= */
let audioCtx = null;
function signal(double){
  if(cfg('vibrate') && navigator.vibrate){
    try{ navigator.vibrate(double ? [120, 80, 120] : 150); }catch(e){}
  }
  if(!cfg('sound')) return;
  try{
    if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const play = (t, f) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(.001, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.25, audioCtx.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + t + .28);
      o.start(audioCtx.currentTime + t); o.stop(audioCtx.currentTime + t + .3);
    };
    play(0, 880); if(double) play(.35, 1174);
  }catch(e){}
}

/* ================= Bildschirm wach halten ================= */
async function requestWakeLock(){
  try{
    if('wakeLock' in navigator && !wakeLock){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  }catch(e){}
}
function releaseWakeLock(){ if(wakeLock){ try{ wakeLock.release(); }catch(e){} wakeLock = null; } }

/* ================= Training abschließen mit Undo ================= */
async function finishWorkout(){
  cancelHold(); stopRest(); releaseWakeLock();
  const day = getDay(session.dayKey);
  const need = cfg('streak');
  const ups = [];
  let tops = 0;

  day.ex.forEach(id => {
    const ex = EX_BY_ID[id]; if(!ex) return;
    const lvl = state.levels[id] || 0;
    const maxed = lvl >= ex.levels.length - 1;
    if(session.top[id]){
      tops++;
      state.streaks[id] = (state.streaks[id] || 0) + 1;
      if(!maxed && state.streaks[id] >= need){
        state.levels[id] = lvl + 1; state.streaks[id] = 0;
        ups.push(ex.name + ' → ' + ex.levels[lvl + 1].stage);
      }
    } else state.streaks[id] = 0;

    const nEl = document.getElementById('note-' + id);
    if(nEl && nEl.value.trim()){
      state.notes[id] = { t: nEl.value.trim().slice(0, 160), d: today() };
    }

    /* Per-set rep tracking */
    const t = parseTarget(ex.levels[lvl].target);
    if(!t.isHold && t.maxReps){
      for(let s = 0; s < t.sets; s++){
        const repEl = document.getElementById('rep-' + id + '-' + s);
        if(repEl && repEl.value){
          const v = parseInt(repEl.value, 10);
          if(v && (!state.prs[id] || v > parseInt(state.prs[id].v, 10))){
            state.prs[id] = { v: v + ' ' + __('reps'), d: today() };
          }
        }
      }
    }
  });

  const sets = Object.values(session.sets).filter(Boolean).length;
  const now = today();
  const entry = { d: now, day: session.dayKey, sets, tops, ups, reps: { ...session.reps } };

  lastWorkoutSnapshot = {
    levels: JSON.parse(JSON.stringify(state.levels)),
    streaks: JSON.parse(JSON.stringify(state.streaks)),
    prs: JSON.parse(JSON.stringify(state.prs)),
    notes: JSON.parse(JSON.stringify(state.notes)),
    session: JSON.parse(JSON.stringify(session)),
    entry
  };

  state.workouts = (state.workouts || 0) + 1;
  state.byDay[session.dayKey] = (state.byDay[session.dayKey] || 0) + 1;
  state.lastDate = now;

  /* Global streak */
  const gs = calcGlobalStreak();
  state.streakDays = gs + 1;

  state.log.push(entry);
  if(state.log.length > 500) state.log = state.log.slice(-500);
  await save();

  session = { dayKey: null, sets: {}, top: {}, reps: {} };
  document.getElementById('finishBar').style.display = 'none';
  renderAll();

  if(ups.length){ signal(true); toast('LEVEL-UP! ' + ups.join(' · '), true); }
  else toast('Training gespeichert – ' + state.workouts + ' Einheiten insgesamt.');

  /* Offer undo for 5 seconds */
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => { lastWorkoutSnapshot = null; }, 5000);
  const undoBtn = document.createElement('button');
  undoBtn.className = 'undo-btn';
  undoBtn.textContent = '↩ ' + __('undo');
  undoBtn.onclick = undoWorkout;
  document.getElementById('content').appendChild(undoBtn);
}

function undoWorkout(){
  if(!lastWorkoutSnapshot) return;
  state.levels = lastWorkoutSnapshot.levels;
  state.streaks = lastWorkoutSnapshot.streaks;
  state.prs = lastWorkoutSnapshot.prs;
  state.notes = lastWorkoutSnapshot.notes;
  state.workouts = Math.max(0, state.workouts - 1);
  const idx = state.log.findIndex(l =>
    l.d === lastWorkoutSnapshot.entry.d &&
    l.day === lastWorkoutSnapshot.entry.day
  );
  if(idx >= 0) state.log.splice(idx, 1);
  state.lastDate = state.log.length ? state.log[state.log.length - 1].d : null;
  save();
  clearTimeout(undoTimeout);
  lastWorkoutSnapshot = null;
  document.querySelector('.undo-btn')?.remove();
  session = { dayKey: null, sets: {}, top: {}, reps: {} };
  document.getElementById('finishBar').style.display = 'none';
  renderAll();
  toast(__('undoWorkout'));
}

/* ================= Verlauf ================= */
function isoWeek(iso){
  const d = new Date(iso + 'T12:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  return d.getFullYear() + '-KW' + String(1 + Math.round((d - firstThu) / 6048e5)).padStart(2, '0');
}
function weekLabel(w){ return w.split('-')[1]; }

function renderHistory(){
  /* Week chart */
  const byWeek = {}, volWeek = {};
  (state.log || []).forEach(l => {
    const w = isoWeek(l.d);
    byWeek[w] = (byWeek[w] || 0) + 1;
    volWeek[w] = (volWeek[w] || 0) + (l.sets || 0);
  });
  const weeks = Object.keys(byWeek).sort().slice(-8);
  const goal = cfg('weekGoal');

  const wc = document.getElementById('weekChart');
  if(!weeks.length){
    wc.innerHTML = '<div class="empty-hint" style="width:100%">' + __('noHistory') + ' – dein erstes abgeschlossenes Training erscheint hier.</div>';
    document.getElementById('weekLegend').textContent = '';
    document.getElementById('volChart').innerHTML = '';
  } else {
    const max = Math.max(goal, ...weeks.map(w => byWeek[w]));
    wc.innerHTML = weeks.map(w => {
      const n = byWeek[w];
      return '<div class="bar-col"><span class="bar-num">' + n + '</span>' +
        '<div class="bar' + (n >= goal ? ' goal-met' : '') + '" style="height:' + Math.round(n / max * 100) + '%"></div>' +
        '<span class="bar-lbl">' + weekLabel(w) + '</span></div>';
    }).join('');
    document.getElementById('weekLegend').textContent = 'Grün = Wochenziel von ' + goal + ' Trainings erreicht.';

    const vmax = Math.max(...weeks.map(w => volWeek[w]), 1);
    document.getElementById('volChart').innerHTML = weeks.map(w =>
      '<div class="bar-col"><span class="bar-num">' + volWeek[w] + '</span>' +
      '<div class="bar" style="height:' + Math.round(volWeek[w] / vmax * 100) + '%"></div>' +
      '<span class="bar-lbl">' + weekLabel(w) + '</span></div>').join('');
  }

  renderWeight();
  renderMeasurements();

  const list = document.getElementById('logList');
  const log = (state.log || []).slice(-25).reverse();
  list.innerHTML = log.length ? log.map(l => {
    const d = getDay(l.day);
    return '<div class="log-item"><span class="log-date">' + fmtDate(l.d) + '</span>' +
      '<span class="log-day">' + esc(l.day) + (d ? ' · ' + esc(d.title) : '') + '</span>' +
      '<span class="muted">' + l.sets + ' ' + __('sets') + ' · ' + l.tops + '× Top</span>' +
      '<span class="log-ups">' + (l.ups && l.ups.length ? '▲' + l.ups.length : '') + '</span></div>';
  }).join('') : '<div class="empty-hint">' + __('noLogs') + '</div>';

  /* Calendar view */
  renderCalendar();
}

function renderCalendar(){
  const cal = document.getElementById('calendarView') || (() => {
    const el = document.createElement('div');
    el.id = 'calendarView';
    document.getElementById('view-history').appendChild(el);
    return el;
  })();
  if(!state.log || !state.log.length){ cal.innerHTML = ''; return; }

  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const workoutDays = new Set(state.log.map(l => l.d));

  let html = '<div class="section-title">' + __('calendar') + ' ' + now.toLocaleDateString('de', { month: 'long', year: 'numeric' }) + '</div>' +
    '<div class="calendar-grid">';
  ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach(d => { html += '<div class="cal-header">' + d + '</div>'; });
  const offset = (first + 6) % 7;
  for(let i = 0; i < offset; i++) html += '<div class="cal-day empty"></div>';
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isWorkout = workoutDays.has(dateStr);
    const isToday = dateStr === today();
    html += '<div class="cal-day' + (isWorkout ? ' workout' : '') + (isToday ? ' today' : '') + '">' + d + '</div>';
  }
  html += '</div>';
  cal.innerHTML = html;
}

/* ================= Body Measurements ================= */
async function addMeasurement(){
  const parts = ['chest', 'waist', 'arm', 'thigh'];
  const m = state.measurements || {};
  if(!m._dates) m._dates = [];
  const entry = { d: today() };
  parts.forEach(p => {
    const el = document.getElementById('meas-' + p);
    const v = parseFloat(el?.value);
    if(v && v > 0 && v < 200) entry[p] = v;
  });
  if(Object.keys(entry).length < 2){ toast('Bitte mindestens ein Maß eingeben.'); return; }
  m._dates.push(entry);
  if(m._dates.length > 200) m._dates = m._dates.slice(-200);
  state.measurements = m;
  parts.forEach(p => { const el = document.getElementById('meas-' + p); if(el) el.value = ''; });
  await save(); renderMeasurements(); toast(__('addMeasurement') + '.');
}

function renderMeasurements(){
  const container = document.getElementById('measContainer') || (() => {
    const el = document.createElement('div');
    el.id = 'measContainer';
    const parent = document.getElementById('weightSpark')?.parentElement;
    if(parent) parent.after(el);
    return el;
  })();
  const m = state.measurements || {};
  const dates = m._dates || [];
  const parts = ['chest', 'waist', 'arm', 'thigh'];
  const labels = { chest: __('chest'), waist: __('waist'), arm: __('arm'), thigh: __('thigh') };

  let html = '<div class="section-title">' + __('measurements') + '</div><div class="card">';
  html += '<div class="inline-row">';
  parts.forEach(p => {
    const last = dates.length ? (dates[dates.length - 1][p] || '') : '';
    html += '<div style="flex:1"><small>' + esc(labels[p]) + '</small><input id="meas-' + p + '" type="number" step="0.5" min="0" max="200" placeholder="' + esc(last) + ' ' + __('cm') + '" style="width:100%;padding:5px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--ink)"></div>';
  });
  html += '<button onclick="addMeasurement()" style="align-self:flex-end">' + __('save') + '</button>';
  html += '</div>';

  if(dates.length){
    html += '<div style="margin-top:10px;font-size:12px;color:var(--ink-soft)">';
    const last = dates[dates.length - 1];
    parts.forEach(p => {
      if(last[p]) html += esc(labels[p]) + ': <b>' + last[p] + ' ' + __('cm') + '</b> · ';
    });
    html += fmtDate(last.d);
    html += '</div>';
    if(dates.length > 1){
      html += '<svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none">';
      parts.forEach((p, pi) => {
        const vals = dates.map(d => d[p]).filter(v => v);
        if(vals.length < 2) return;
        const min = Math.min(...vals) - 2, max = Math.max(...vals) + 2;
        const pts = vals.map((v, i) =>
          (i / (vals.length - 1) * 296 + 2).toFixed(1) + ',' + (66 - (v - min) / (max - min) * 62).toFixed(1)).join(' ');
        const colors = ['var(--accent)', 'var(--success)', 'var(--warn)', 'var(--ink-soft)'];
        html += '<polyline points="' + pts + '" fill="none" stroke="' + colors[pi % 4] + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>';
      });
      html += '</svg>';
    }
  }
  html += '</div>';
  container.innerHTML = html;
}

/* ================= Weight ================= */
async function addWeight(){
  const inp = document.getElementById('weightInput');
  const v = parseFloat(String(inp.value).replace(',', '.'));
  if(!v || v < 30 || v > 250){ toast('Bitte ein plausibles Gewicht in kg eingeben.'); return; }
  state.weights.push({ d: today(), kg: Math.round(v * 10) / 10 });
  if(state.weights.length > 200) state.weights = state.weights.slice(-200);
  inp.value = '';
  await save(); renderWeight(); toast('Gewicht gespeichert.');
}
function renderWeight(){
  const svg = document.getElementById('weightSpark'), meta = document.getElementById('weightMeta');
  const ws = state.weights || [];
  if(!ws.length){
    svg.innerHTML = '';
    meta.innerHTML = 'Noch kein Eintrag. Trag dein Gewicht etwa 1× pro Woche ein – bei Hebel-Skills wie der Planche entscheidet das Verhältnis von Kraft zu Körpergewicht.';
    return;
  }
  if(ws.length === 1){
    svg.innerHTML = '';
    meta.innerHTML = 'Start: <b>' + ws[0].kg + ' kg</b> (' + fmtDate(ws[0].d) + ') – ab dem zweiten Eintrag entsteht hier deine Kurve.';
    return;
  }
  const kgs = ws.map(w => w.kg);
  const min = Math.min(...kgs) - 1, max = Math.max(...kgs) + 1;
  const pts = ws.map((w, i) =>
    (i / (ws.length - 1) * 296 + 2).toFixed(1) + ',' + (66 - (w.kg - min) / (max - min) * 62).toFixed(1)).join(' ');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  svg.innerHTML = '<polyline points="' + pts + '" fill="none" stroke="' + accent + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  const delta = Math.round((kgs[kgs.length - 1] - kgs[0]) * 10) / 10;
  meta.innerHTML = 'Aktuell <b>' + kgs[kgs.length - 1] + ' kg</b> · seit Start <b>' + (delta > 0 ? '+' : '') + delta + ' kg</b> · ' + ws.length + ' Einträge';
}

/* ================= Bibliothek ================= */
function renderCatFilter(){
  const cats = ['all'].concat(Object.keys(CATS));
  document.getElementById('catFilter').innerHTML = cats.map(c =>
    '<button class="chip' + (libFilter === c ? ' active' : '') + '" onclick="setLibFilter(\'' + c + '\')">' +
    (c === 'all' ? __('all') : CATS[c].name) + '</button>').join('');
}
function setLibFilter(c){ libFilter = c; renderCatFilter(); renderLibrary(); }

function renderLibrary(){
  const q = (document.getElementById('libSearch').value || '').toLowerCase().trim();
  const list = EXERCISES.filter(e =>
    (libFilter === 'all' || e.cat === libFilter) &&
    (!q || e.name.toLowerCase().includes(q) || e.levels.some(l => l.stage.toLowerCase().includes(q))));

  const planIds = new Set(getDays().flatMap(d => d.ex));

  document.getElementById('libList').innerHTML = list.length ? list.map(ex => {
    const lvl = lvlOf(ex), open = libOpen[ex.id];
    const pr = (state.prs || {})[ex.id];
    return '<div class="lib-item">' +
      '<div class="lib-head" onclick="toggleLib(\'' + ex.id + '\')">' +
        '<span class="lib-name">' + esc(ex.name) + (planIds.has(ex.id) ? ' <span class="cat-chip">' + __('inPlan') + '</span>' : '') + '</span>' +
        '<span class="lib-meta">' + __('level') + ' ' + (lvl + 1) + '/' + ex.levels.length + ' ' + (open ? '−' : '+') + '</span>' +
      '</div>' +
      '<div class="lib-body' + (open ? ' open' : '') + '" id="libbody-' + ex.id + '">' +
        '<div class="muted">' + CATS[ex.cat].name + ' · Equipment: ' + ex.equip.map(eq => EQUIP_NAMES[eq] || eq).join(', ') +
          (ex.rest ? ' · Pause ' + ex.rest + ' Sek' : '') + '</div>' +
        '<ul class="lvl-list">' + ex.levels.map((l, i) =>
          '<li class="' + (i === lvl ? 'at' : (i < lvl ? 'passed' : '')) + '"><span>' + (i + 1) + '. ' + esc(l.stage) + '</span><span class="t">' + esc(l.target) + '</span></li>').join('') + '</ul>' +
        '<div class="inline-row"><button onclick="adjustLevel(\'' + ex.id + '\',-1)">− ' + __('level') + '</button>' +
          '<button onclick="adjustLevel(\'' + ex.id + '\',1)">+ ' + __('level') + '</button></div>' +
        '<div class="inline-row"><input id="pr-' + ex.id + '" placeholder="' + __('best') + ', z. B. 24 Sek oder 7 Wdh" value="' + (pr ? esc(pr.v) : '') + '">' +
          '<button onclick="savePR(\'' + ex.id + '\')">' + __('save') + '</button></div>' +
        (pr ? '<div class="pr-line">Zuletzt aktualisiert: ' + fmtDate(pr.d) + '</div>' : '') +
        '<ul class="tips open" style="margin-top:10px">' + ex.tips.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' +
        '<button class="tip-btn" onclick="showExHistory(\'' + ex.id + '\')">📊 ' + __('perExercise') + '</button>' +
      '</div></div>';
  }).join('') : '<div class="empty-hint">' + __('noExercises') + '</div>';
}
const EQUIP_NAMES = { none: 'kein Gerät', parallettes: 'Parallettes', bar: 'Klimmzugstange', chair: 'Stuhl/Tisch' };
function toggleLib(id){ libOpen[id] = !libOpen[id]; renderLibrary(); }
async function savePR(id){
  const v = (document.getElementById('pr-' + id).value || '').trim().slice(0, 40);
  if(!v){ delete state.prs[id]; } else { state.prs[id] = { v, d: today() }; }
  await save(); renderLibrary(); toast(v ? 'Bestleistung gespeichert.' : 'Bestleistung gelöscht.');
}

/* ================= Plan-Editor mit Drag & Drop ================= */
let dragSrcId = null, dragSrcIdx = null;

function renderPlanTab(){
  const sel = document.getElementById('planSelect');
  sel.innerHTML = Object.entries(PLAN_TEMPLATES).map(([k, v]) =>
    '<option value="' + k + '"' + (!state.customPlan && state.planId === k ? ' selected' : '') + '>' + esc(v.name) + '</option>').join('') +
    (state.customPlan ? '<option value="custom" selected>' + __('customPlan') + '</option>' : '');
  document.getElementById('planDesc').textContent = state.customPlan ? __('customPlan') : (PLAN_TEMPLATES[state.planId] || {}).desc || '';

  const days = getDays();
  document.getElementById('planEditor').innerHTML = days.map((d, di) =>
    '<div class="plan-day">' +
      '<div class="plan-day-head"><span class="plan-day-title">' + esc(d.key) + ' · ' + esc(d.title) + '</span>' +
        '<span><button class="mini-btn" onclick="renameDay(' + di + ')" title="' + __('rename') + '">✎</button> ' +
        '<button class="mini-btn danger" onclick="removeDay(' + di + ')" title="' + __('remove') + '">✕</button></span></div>' +
      d.ex.map((id, ei) => {
        const ex = EX_BY_ID[id];
        return '<div class="plan-ex" draggable="true" ondragstart="dragStart(' + di + ',' + ei + ')" ondragover="dragOver(event)" ondrop="dragDrop(' + di + ',' + ei + ')" ondragend="dragEnd()">' +
          '<span class="drag-handle">⠿</span>' +
          '<span class="nm">' + (ex ? esc(ex.name) : '<i>unbekannt: ' + esc(id) + '</i>') +
          '</span><button class="mini-btn" onclick="moveEx(' + di + ',' + ei + ',-1)" title="' + __('moveUp') + '">↑</button>' +
          '<button class="mini-btn" onclick="moveEx(' + di + ',' + ei + ',1)" title="' + __('moveDown') + '">↓</button>' +
          '<button class="mini-btn danger" onclick="removeEx(' + di + ',' + ei + ')" title="' + __('remove') + '">✕</button></div>';
      }).join('') +
      '<div class="inline-row"><select id="add-' + di + '">' +
        Object.keys(CATS).map(c => '<optgroup label="' + CATS[c].name + '">' +
          EXERCISES.filter(e => e.cat === c).map(e => '<option value="' + e.id + '">' + esc(e.name) + '</option>').join('') +
          '</optgroup>').join('') +
      '</select><button onclick="addEx(' + di + ')">' + __('addExercise') + '</button></div>' +
    '</div>').join('') || '<div class="empty-hint">' + __('noPlanDays') + '</div>';
}

function dragStart(di, ei){ dragSrcId = di; dragSrcIdx = ei; event.dataTransfer.effectAllowed = 'move'; }
function dragOver(e){ e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function dragDrop(di, ei){
  if(dragSrcId === null || dragSrcIdx === null) return;
  if(dragSrcId === di && dragSrcIdx === ei) return;
  const p = ensureCustom();
  const arr = p.days[dragSrcId].ex;
  const item = arr.splice(dragSrcIdx, 1)[0];
  if(dragSrcId === di && dragSrcIdx < ei) ei--;
  p.days[di].ex.splice(ei, 0, item);
  dragSrcId = null; dragSrcIdx = null;
  save(); renderPlanTab();
}
function dragEnd(){ dragSrcId = null; dragSrcIdx = null; }

function ensureCustom(){
  if(!state.customPlan){
    const base = PLAN_TEMPLATES[state.planId] || PLAN_TEMPLATES.ab4;
    state.customPlan = JSON.parse(JSON.stringify({ name: __('customPlan'), desc: 'Von dir angepasst', days: base.days }));
  }
  return state.customPlan;
}
function changePlan(v){
  if(v === 'custom'){ ensureCustom(); }
  else { state.customPlan = null; state.planId = v; }
  save(); renderPlanTab(); renderStats(); renderDaySelect();
  toast('Plan gewechselt: ' + getPlan().name);
}
function resetPlan(){
  if(!confirm('Plan auf die gewählte Vorlage zurücksetzen? Deine eigenen Änderungen am Plan gehen verloren (Fortschritt bleibt).')) return;
  state.customPlan = null; save(); renderPlanTab(); renderDaySelect(); toast('Plan zurückgesetzt.');
}
function addPlanDay(){
  const p = ensureCustom();
  const key = prompt('Kurzbezeichnung des Tages (z. B. C):', String.fromCharCode(65 + p.days.length));
  if(!key) return;
  const title = prompt('Titel des Tages:', __('addDay')) || __('addDay');
  p.days.push({ key: key.slice(0, 6), title: title.slice(0, 40), sub: '', ex: [] });
  save(); renderPlanTab(); renderDaySelect();
}
function renameDay(di){
  const p = ensureCustom(), d = p.days[di];
  const key = prompt('Kurzbezeichnung:', d.key); if(key === null) return;
  const title = prompt('Titel:', d.title); if(title === null) return;
  const sub = prompt('Untertitel (optional):', d.sub || '');
  d.key = key.slice(0, 6) || d.key; d.title = title.slice(0, 40) || d.title; d.sub = (sub || '').slice(0, 60);
  save(); renderPlanTab(); renderDaySelect();
}
function removeDay(di){
  const p = ensureCustom();
  if(!confirm('Trainingstag "' + p.days[di].title + '" entfernen?')) return;
  p.days.splice(di, 1); save(); renderPlanTab(); renderDaySelect();
}
function addEx(di){
  const p = ensureCustom();
  const id = document.getElementById('add-' + di).value;
  if(p.days[di].ex.includes(id)){ toast('Übung ist an diesem Tag schon enthalten.'); return; }
  p.days[di].ex.push(id); save(); renderPlanTab();
  toast(EX_BY_ID[id].name + ' hinzugefügt.');
}
function removeEx(di, ei){
  const p = ensureCustom(); p.days[di].ex.splice(ei, 1); save(); renderPlanTab();
}
function moveEx(di, ei, d){
  const p = ensureCustom(), arr = p.days[di].ex;
  const t = ei + d; if(t < 0 || t >= arr.length) return;
  [arr[ei], arr[t]] = [arr[t], arr[ei]];
  save(); renderPlanTab();
}

/* ================= Meilensteine & Fahrplan ================= */
function renderMilestones(){
  const search = (document.getElementById('msSearch')?.value || '').toLowerCase();
  let list = MILESTONES;
  if(search) list = list.filter(m => m.name.toLowerCase().includes(search));

  document.getElementById('msList').innerHTML = list.map(m => {
    const d = (state.milestones || {})[m.id];
    return '<label class="ms' + (d ? ' done' : '') + '"><input type="checkbox" ' + (d ? 'checked' : '') +
      ' onchange="toggleMilestone(\'' + m.id + '\',this.checked)"><span><span class="ms-name">' + esc(m.name) + '</span>' +
      (d ? '<br><span class="ms-date">geschafft am ' + fmtDate(d) + '</span>' : '') + '</span></label>';
  }).join('');
}
async function toggleMilestone(id, on){
  if(on){
    state.milestones[id] = today(); signal(true);
    toast('Meilenstein: ' + MILESTONES.find(m => m.id === id).name, true);
  } else delete state.milestones[id];
  await save(); renderStats(); renderMilestones();
}
function renderRoadmap(){
  const skills = EXERCISES.filter(e => e.cat === 'skill' || ['planche_lean', 'wall_hs', 'front_lever'].includes(e.id));
  document.getElementById('roadmap').innerHTML = skills.map(ex => {
    const lvl = lvlOf(ex);
    const pct = Math.round(lvl / (ex.levels.length - 1) * 100);
    return '<div style="padding:10px 0;border-bottom:1px solid var(--line)">' +
      '<div class="lib-head" style="cursor:default"><span class="lib-name">' + esc(ex.name) + '</span>' +
      '<span class="lib-meta">' + pct + '%</span></div>' +
      '<div class="muted">Aktuell: ' + esc(ex.levels[lvl].stage) + ' → nächste Stufe: ' +
      (lvl < ex.levels.length - 1 ? esc(ex.levels[lvl + 1].stage) : 'Ziel erreicht') + '</div></div>';
  }).join('');
}

/* ================= Einstellungen ================= */
function openSettings(){
  ['setsMode', 'rest', 'perExRest', 'autoRest', 'sound', 'vibrate', 'streak', 'weekGoal', 'deload'].forEach(k => {
    const el = document.getElementById('cfg-' + k); if(!el) return;
    if(el.type === 'checkbox') el.checked = !!cfg(k); else el.value = String(cfg(k));
  });
  document.getElementById('storageInfo').textContent = 'Speicherort: ' + store.mode + '.';
  document.getElementById('settingsOverlay').classList.add('open');
}
function closeSettings(){ document.getElementById('settingsOverlay').classList.remove('open'); }
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeSettings(); });

function updateSetting(k, v){
  state.settings[k] = v; save();
  if(k === 'lang'){ setLang(v); document.title = __('appName') + ' – Calisthenics Tracker'; }
  renderStats(); renderPhase(); renderBanners();
  if(session.dayKey && ['setsMode', 'streak', 'perExRest', 'rest'].includes(k)){
    if(k === 'setsMode'){
      Object.keys(session.sets).forEach(key => {
        const id = key.slice(0, key.lastIndexOf('-'));
        const ex = EX_BY_ID[id]; if(!ex) return;
        const max = parseTarget(ex.levels[lvlOf(ex)].target).sets;
        if(parseInt(key.split('-').pop(), 10) >= max) delete session.sets[key];
      });
    }
    const n = snapshotNotes(); renderWorkout(); restoreSession(n, session.reps);
  }
  renderAll();
}

/* ================= Backup ================= */
function download(name, content, type){
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportJSON(){
  try{
    download('progression-backup-' + today() + '.json', JSON.stringify(state, null, 2), 'application/json');
    toast('Backup heruntergeladen.');
  }catch(e){ toast('Export fehlgeschlagen.'); }
}
function exportCSV(){
  const rows = [['Datum', 'Tag', 'Saetze', 'TopSaetze', 'LevelUps']].concat(
    (state.log || []).map(l => [l.d, l.day, l.sets, l.tops, (l.ups || []).join(' | ')]));
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
  download('progression-verlauf-' + today() + '.csv', '\uFEFF' + csv, 'text/csv');
  toast('CSV heruntergeladen.');
}
function exportText(){
  const lines = ['PROGRESSION · Stand ' + fmtDate(today()),
    'Plan: ' + getPlan().name, 'Trainings: ' + (state.workouts || 0), '', '— Aktuelle Stufen —'];
  getDays().forEach(d => {
    lines.push('', '[' + d.key + '] ' + d.title);
    d.ex.forEach(id => {
      const ex = EX_BY_ID[id]; if(!ex) return;
      const l = lvlOf(ex);
      lines.push('  ' + ex.name + ': Stufe ' + (l + 1) + '/' + ex.levels.length + ' – ' + ex.levels[l].stage + ' (' + ex.levels[l].target + ')');
    });
  });
  const ms = Object.keys(state.milestones || {});
  if(ms.length){
    lines.push('', '— Meilensteine —');
    ms.forEach(id => { const m = MILESTONES.find(x => x.id === id); if(m) lines.push('  ✔ ' + m.name + ' (' + fmtDate(state.milestones[id]) + ')'); });
  }
  const ws = state.weights || [];
  if(ws.length) lines.push('', 'Gewicht: ' + ws[0].kg + ' kg → ' + ws[ws.length - 1].kg + ' kg');
  const text = lines.join('\n');
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(() => toast('In die Zwischenablage kopiert.'))
      .catch(() => prompt('Zum Kopieren markieren:', text));
  } else prompt('Zum Kopieren markieren:', text);
}
function importJSON(input){
  const file = input.files && input.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = async e => {
    try{
      const data = JSON.parse(e.target.result);
      if(!data || typeof data !== 'object' || (data.levels === undefined && data.workouts === undefined)) throw new Error('invalid');
      if(!confirm('Backup importieren? Der aktuelle Stand auf diesem Gerät wird überschrieben.')){ input.value = ''; return; }
      cancelHold(); stopRest();
      state = Object.assign(DEFAULT_STATE(), data);
      await save();
      session = { dayKey: null, sets: {}, top: {}, reps: {} };
      document.getElementById('finishBar').style.display = 'none';
      applyTheme(); closeSettings(); showTab('train'); renderAll();
      toast('Backup importiert – willkommen zurück!', true);
    }catch(err){ toast('Import fehlgeschlagen – keine gültige Backup-Datei.'); }
    input.value = '';
  };
  r.onerror = () => { toast('Datei konnte nicht gelesen werden.'); input.value = ''; };
  r.readAsText(file);
}

/* ================= CSV Import ================= */
function importCSV(input){
  const file = input.files && input.files[0]; if(!file) return;
  const r = new FileReader();
  r.onload = e => {
    try{
      const text = e.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      if(lines.length < 2) throw new Error('empty');
      const header = lines[0].split(';').map(h => h.replace(/"/g, '').trim());
      const dateIdx = header.indexOf('Datum'), dayIdx = header.indexOf('Tag');
      if(dateIdx < 0) throw new Error('missing date column');
      const imported = [];
      lines.slice(1).forEach(line => {
        const cols = line.split(';').map(c => c.replace(/"/g, '').trim());
        const entry = { d: cols[dateIdx] || today(), day: cols[dayIdx] || 'A', sets: parseInt(cols[2]) || 0, tops: parseInt(cols[3]) || 0, ups: [] };
        if(entry.d && entry.sets > 0){ imported.push(entry); }
      });
      if(!imported.length) throw new Error('no data');
      if(!confirm(imported.length + ' Einträge importieren? Doppelte werden übersprungen.')) return;
      const existing = new Set((state.log || []).map(l => l.d + '-' + l.day));
      imported.forEach(e => {
        const key = e.d + '-' + e.day;
        if(!existing.has(key)){ state.log.push(e); existing.add(key); }
      });
      state.log.sort((a, b) => a.d.localeCompare(b.d));
      if(state.log.length > 500) state.log = state.log.slice(-500);
      save(); renderHistory(); toast(imported.length + ' Einträge importiert.');
    }catch(err){ toast('CSV-Import fehlgeschlagen: ' + err.message); }
    input.value = '';
  };
  r.readAsText(file);
}

async function resetAll(){
  if(!confirm('Wirklich alles zurücksetzen? Stufen, Verlauf, Notizen, Bestleistungen, Meilensteine, Gewichtsdaten und Maße werden gelöscht. Einstellungen und Design bleiben.')) return;
  cancelHold(); stopRest();
  const keep = { theme: state.theme, settings: state.settings, planId: state.planId, customPlan: state.customPlan };
  await store.clear();
  state = Object.assign(DEFAULT_STATE(), keep);
  await save();
  session = { dayKey: null, sets: {}, top: {}, reps: {} };
  document.getElementById('finishBar').style.display = 'none';
  closeSettings(); showTab('train'); renderAll();
  toast('Fortschritt zurückgesetzt – neuer Zyklus!');
}

/* ================= Helfer ================= */
function today(){
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function fmtDate(iso){ if(!iso) return ''; const p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0].slice(2); }
function esc(s){ return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, '&#39;'); }

let toastTimer = null;
function toast(msg, big){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('levelup', !!big);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), big ? 5000 : 3200);
}

/* Ungespeichertes Training beim Verlassen abfangen */
window.addEventListener('beforeunload', e => {
  if(session.dayKey && Object.values(session.sets).some(Boolean)){
    e.preventDefault(); e.returnValue = '';
  }
});

/* ================= IndexedDB fallback & build hint ================= */
/* Die App nutzt localStorage, was für 500 Workouts ausreicht.
   Sollte der Speicher knapp werden, kann in storage.js auf IndexedDB
   umgestellt werden (siehe Kommentare dort). */

/* Unit tests: run via "npx vitest run" after installing vitest.
   Test config ist in package.json (muss erstellt werden).
   Oder öffne test.html im Browser für einfache Tests. */
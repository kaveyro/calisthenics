/* Tab Verlauf: Diagramme, Ist-Bilanz, Liste der Einheiten, Kalender,
   Nachtragen, Gewicht, Koerpermasse und Jahresrueckblick. */

import { istBilanz, istLuecken, wochenTage, wochenbilanz } from '../domain/bilanz.js';
import { isoWeek, today } from '../domain/dates.js';
import { esc } from '../domain/escape.js';
import { entryExercises, repsOf, sekOf } from '../domain/log.js';
import { naechsteTermine } from '../domain/plan.js';
import { MAX_LOG_ENTRIES, MAX_SERIES_ENTRIES } from '../domain/state.js';
import { volumenJeGruppe } from '../domain/volume.js';
import { CATS, EX_BY_ID } from '../exercises.js';
import { __, catName, exName, exStage, getLang } from '../i18n/index.js';
import { dauerText, dayTitleOf, fmtDate, getDay, getDays, lvlOf, renderAll, save, wochentage, zielVon } from '../app.js';
import { cfg, state } from '../core/kern.js';
import { BILANZ_KAT, bilanzGruppe } from './planeditor.js';
import { askConfirm, askDialog, dialogFuss, dialogKopf } from '../ui/dialoge.js';
import { ikon, toast } from '../ui/hinweise.js';

/* Wie sich die Saetze der letzten Woche auf die Kategorien verteilen –
   Saetze, nicht Wiederholungen, siehe js/domain/volume.js.

   Ein Streifen mit Zahlen daneben, kein reines Farbdiagramm: die Aufteilung
   ist die eigentliche Aussage ("zu viel Drücken, zu wenig Ziehen") und muss
   auch dann ankommen, wenn die Farben nicht unterscheidbar sind. */
function renderVolSplit(woche, monat = false){
  const el = document.getElementById('volSplit');
  if(!el) return;
  const jeKat = (woche && woche.jeKat) || {};
  const summe = Object.values(jeKat).reduce((a, b) => a + b, 0);
  if(!summe){ el.innerHTML = ''; return; }

  const teile = Object.keys(CATS).filter(k => jeKat[k] > 0);
  el.innerHTML = '<div class="vol-legend">' + esc(__(monat ? 'volumeSplitMonth' : 'volumeSplit')) + '</div>' +
    '<div class="vol-split" role="img" aria-label="' + esc(__('volumeSplitAria', {
      data: teile.map(k => catName(k, CATS[k].name) + ' ' + jeKat[k]).join(', ')
    })) + '">' +
    teile.map(k => '<span class="vol-part vol-' + k + '" style="flex:' + jeKat[k] + '"></span>').join('') +
    '</div>' +
    '<div class="vol-keys" aria-hidden="true">' + teile.map(k =>
      '<span><i class="vol-' + k + '"></i>' + esc(catName(k, CATS[k].name)) + ' ' + jeKat[k] + '</span>').join('') +
    '</div>';
}

/* Ist-Bilanz: gemachte Kraftsaetze je Gruppe in den letzten Wochen, daneben
   der Schnitt der abgeschlossenen und die Saetze, die der Plan vorsieht
   (dieselbe Woche wie in der Wochenbilanz im Plan-Tab). Fest vier volle
   Wochen plus die laufende, unabhaengig vom Zeitraum oben: die Frage ist,
   ob der Plan gerade so trainiert wird. */
const IST_WOCHEN = 5;
function renderIstBilanz(){
  const panel = document.getElementById('istPanel');
  const el = document.getElementById('istBilanz');
  if(!panel || !el) return;
  const ist = istBilanz(state.log, EX_BY_ID, { wochen: IST_WOCHEN, levels: state.levels, setsMode: cfg('setsMode') });
  if(!ist.wochen.length){ panel.hidden = true; el.innerHTML = ''; return; }
  panel.hidden = false;
  const woche = wochenTage(getDays(), state.wochenplan, cfg('weekGoal'));
  const soll = woche.length ? wochenbilanz(woche, EX_BY_ID, state.levels, cfg('setsMode')).gruppen : null;
  const luecken = new Set(istLuecken(ist.schnitt, soll));
  const laufend = ist.wochen.find(w => w.laufend);
  /* Nur die Wochennummer im Kopf, "KW" einmal vorn: mit "KW38" in jeder
     Spalte war die Tabelle auf dem Handy breiter als die Karte. */
  const kopf = '<tr><th scope="col" class="ist-kw"><span aria-hidden="true">' + esc(__('weekShort')) + '</span>' +
    '<span class="sr-only">' + esc(__('istGruppe')) + '</span></th>' +
    ist.wochen.map(w => '<th scope="col"' + (w.laufend ? ' class="ist-laufend"' : '') + ' aria-label="' + esc(weekLabel(w.key)) + '">' +
      esc(w.key.split('KW')[1]) + (w.laufend ? '*' : '') + '</th>').join('') +
    '<th scope="col">' + esc(__('istSchnitt')) + '</th><th scope="col">' + esc(__('istPlan')) + '</th></tr>';
  const zeilen = Object.keys(BILANZ_KAT).map(g =>
    '<tr' + (luecken.has(g) ? ' class="warn"' : '') + '><th scope="row"><i class="vol-' + BILANZ_KAT[g] + '" aria-hidden="true"></i>' +
      esc(bilanzGruppe(g)) + '</th>' +
      ist.wochen.map(w => '<td' + (w.laufend ? ' class="ist-laufend"' : '') + '>' + w.gruppen[g] + '</td>').join('') +
      '<td class="ist-schnitt">' + (ist.schnitt ? ist.schnitt[g] : '–') + '</td>' +
      '<td>' + (soll ? soll[g].saetze : '–') + '</td></tr>').join('');
  const hinweise = [];
  if(!ist.schnitt) hinweise.push('<p class="bil-kopf">' + esc(__('istErsteWoche')) + '</p>');
  else if(luecken.size){
    hinweise.push('<ul class="bil-warn">' + [...luecken].map(g => '<li>' + esc(__('istLuecke', {
      g: bilanzGruppe(g), n: ist.schnitt[g], soll: soll[g].saetze
    })) + '</li>').join('') + '</ul>');
  } else if(soll) hinweise.push('<p class="bil-ok">' + esc(__('istOk')) + '</p>');
  if(laufend) hinweise.push('<p class="bil-kopf">' + esc(__('istLaufend', { w: weekLabel(laufend.key) })) + '</p>');
  if(ist.geschaetzt) hinweise.push('<p class="bil-kopf">' + esc(__('istGeschaetzt')) + '</p>');
  el.innerHTML = '<p class="bil-kopf">' + esc(__('istKopf')) + '</p>' +
    '<div class="ist-scroll"><table class="ist-tab"><caption class="sr-only">' + esc(__('istAria')) + '</caption>' +
    '<thead>' + kopf + '</thead><tbody>' + zeilen + '</tbody></table></div>' + hinweise.join('');
}

/* ================= Verlauf ================= */
/* '2026-KW31' -> 'KW31' bzw. 'W31'. Der Schluessel bleibt deutsch, weil er
   in Diagrammen und CSV als Gruppierung dient; nur die Achse wird uebersetzt. */
function weekLabel(w){ return __('weekShort') + w.split('-')[1].replace('KW', ''); }

/* '2026-07-14' -> '2026-07'. Gegenstueck zu isoWeek() fuer lange Zeitraeume. */
const isoMonat = iso => /^\d{4}-\d{2}/.test(String(iso)) ? String(iso).slice(0, 7) : '';
function monatLabel(m){
  const [j, mo] = m.split('-').map(Number);
  return new Date(j, mo - 1, 1).toLocaleDateString(getLang(), { month: 'short', year: '2-digit' });
}
const spaltenLabel = k => k.includes('KW') ? weekLabel(k) : monatLabel(k);

/* Der gezeigte Zeitraum.

   Die Diagramme standen fest auf den letzten acht Wochen, die Liste auf den
   letzten 25 Eintraegen. Nach einem Jahr Training war damit genau die Sicht
   unerreichbar, fuer die man ein Jahr lang mitschreibt – die Daten lagen
   vollstaendig im Speicher und liessen sich nur nicht ansehen.

   Ab einem Jahr wird nach Monaten gruppiert: drei Jahre waeren sonst ueber
   150 Balken auf der Breite eines Handys. */
const HIST_RANGES = {
  '8w':  { spalten: 8,        monatlich: false },
  '26w': { spalten: 26,       monatlich: false },
  '12m': { spalten: 12,       monatlich: true },
  all:   { spalten: Infinity, monatlich: true }
};
/* Obergrenze der Liste. Anders als die frueheren 25 ist sie keine stille
   Kappung: wird sie erreicht, sagt eine Zeile darunter, wie viele Eintraege
   der Zeitraum insgesamt hat. */
const LOG_MAX_ZEILEN = 100;
let histRange = '8w';
const histBereich = () => HIST_RANGES[histRange] || HIST_RANGES['8w'];
const histMonatlich = () => histBereich().monatlich;
const histSpalten = () => histBereich().spalten;
export function setHistRange(v){
  histRange = HIST_RANGES[v] ? v : '8w';
  renderHistory();
}

export function renderHistory(){
  /* Week chart */
  const gruppe = histMonatlich() ? isoMonat : isoWeek;
  const byWeek = {};
  (state.log || []).forEach(l => {
    const k = gruppe(l.d);
    if(k) byWeek[k] = (byWeek[k] || 0) + 1;
  });
  /* Volumen sind jetzt die Wiederholungen, nicht die Haekchen: 4 × 5 und
     4 × 15 sahen im alten Diagramm gleich aus. */
  const volWeek = volumenJeGruppe(state.log || [], EX_BY_ID, gruppe);
  const weeks = Object.keys(byWeek).sort().slice(-histSpalten());
  const goal = histMonatlich() ? cfg('weekGoal') * 4 : cfg('weekGoal');

  const wc = document.getElementById('weekChart');
  const vcLeer = document.getElementById('volChart');
  wc.classList.toggle('leer', !weeks.length);
  vcLeer.classList.toggle('leer', !weeks.length);
  if(!weeks.length){
    /* Ohne Einheit gibt es nichts zu zeigen, aber etwas zu tun. Rolle und
       Beschriftung des Diagramms gehen mit weg – sonst sagte ein
       Screenreader nach dem Loeschen der letzten Einheit noch die alten
       Balken an. */
    [wc, vcLeer].forEach(el => { el.removeAttribute('role'); el.removeAttribute('aria-label'); });
    wc.innerHTML = leerHtml(ikon('train'), __('noHistory') + __('noHistoryHint'),
      { text: __('startFirst'), action: 'tab:show', tab: 'train' });
    document.getElementById('weekLegend').textContent = '';
    vcLeer.innerHTML = '<p class="leer-klein">' + esc(__('volumeEmpty')) + '</p>';
    renderVolSplit(null);
  } else {
    /* Die Diagramme sind div-Stapel ohne Textalternative: die Zielerreichung
       steckte allein in der Balkenfarbe. Jeder Balken bekommt daher ein
       sprechendes Label, das Diagramm selbst eine Rolle und Beschriftung. */
    const monat = histMonatlich();
    const max = Math.max(goal, ...weeks.map(w => byWeek[w]));
    wc.setAttribute('role', 'img');
    wc.setAttribute('aria-label', __('chartWorkoutsAria', {
      range: monat
        ? (weeks.length === 1 ? __('lastMonthSingular') : __('lastMonthsPlural', { n: weeks.length }))
        : (weeks.length === 1 ? __('lastWeekSingular') : __('lastWeeksPlural', { n: weeks.length })),
      data: weeks.map(w => spaltenLabel(w) + ' ' + byWeek[w] + (byWeek[w] >= goal ? __('goalMet') : '')).join(', ')
    }));
    wc.innerHTML = weeks.map(w => {
      const n = byWeek[w];
      return '<div class="bar-col" aria-hidden="true"><span class="bar-num">' + n + '</span>' +
        '<div class="bar' + (n >= goal ? ' goal-met' : '') + '" style="height:' + Math.round(n / max * 100) + '%"></div>' +
        '<span class="bar-lbl">' + esc(spaltenLabel(w)) + '</span></div>';
    }).join('');
    /* Bei Monaten ist das Wochenziel hochgerechnet – sonst waere jeder
       Balken gruen und die Farbe saegte nichts mehr aus. */
    document.getElementById('weekLegend').textContent =
      __(monat ? 'monthLegend' : 'weekLegend', { n: goal });

    const reps = w => (volWeek[w] || {}).reps || 0;
    const vmax = Math.max(...weeks.map(reps), 1);
    const vc = document.getElementById('volChart');
    vc.setAttribute('role', 'img');
    vc.setAttribute('aria-label', __('chartVolumeAria', {
      data: weeks.map(w => spaltenLabel(w) + ' ' + reps(w)).join(', ')
    }));
    vc.innerHTML = weeks.map(w =>
      '<div class="bar-col" aria-hidden="true"><span class="bar-num">' + reps(w) + '</span>' +
      '<div class="bar" style="height:' + Math.round(reps(w) / vmax * 100) + '%"></div>' +
      '<span class="bar-lbl">' + esc(spaltenLabel(w)) + '</span></div>').join('');

    renderVolSplit(volWeek[weeks[weeks.length - 1]], monat);
  }

  renderIstBilanz();
  renderWeight();
  renderMeasurements();
  renderYearReview();

  const list = document.getElementById('logList');
  /* Mit dem echten Index, nicht dem der Ansicht: geloescht wird in state.log,
     angezeigt wird eine gefilterte und umgekehrte Auswahl. */
  const abGruppe = weeks.length ? weeks[0] : null;
  const imZeitraum = (state.log || []).map((l, i) => ({ l, i }))
    /* Dieselbe Grenze wie im Diagramm: was oben zu sehen ist, steht auch
       unten. Frueher zeigte die Liste 25 Eintraege, egal welcher Zeitraum. */
    .filter(({ l }) => !abGruppe || gruppe(l.d) >= abGruppe);
  const log = imZeitraum.slice(-LOG_MAX_ZEILEN).reverse();
  list.innerHTML = log.length ? log.map(({ l, i }) => {
    const d = getDay(l.day);
    const offen = offeneEintraege.has(l);
    /* Die Zeile ist ein Knopf, der die Einheit aufklappt: welche Uebungen,
       auf welcher Stufe, mit welchen Zahlen. Bisher stand hier nur die
       Summe, und was in einer Einheit genau lief, war nirgends zu sehen. */
    return '<div class="log-item' + (offen ? ' offen' : '') + '">' +
      '<button type="button" class="log-auf" data-action="log:toggle" data-i="' + i + '" aria-expanded="' + offen + '"' +
        (offen ? ' aria-controls="log-det-' + i + '"' : '') + '>' +
      '<span class="log-date">' + fmtDate(l.d) + '</span>' +
      '<span class="log-day">' + esc(l.day) + (d ? ' · ' + esc(dayTitleOf(d)) : '') + '</span>' +
      /* Die Dauer nur, wenn sie gemessen wurde: Eintraege von vor v9, CSV-
         Importe und nachgetragene Einheiten haben keine, und "0 Min" waere
         eine Behauptung. */
      /* Nicht Zahl und Wort zusammenstueckeln: "1 Sätze" stand hier zwei
         Runden lang. */
      '<span class="muted">' + esc(__(l.sets === 1 ? 'setsCountOne' : 'setsCountMany', { n: l.sets })) +
        ' · ' + l.tops + '× Top' +
        (l.dauer ? ' · ' + esc(dauerText(l.dauer)) : '') + '</span>' +
      '<span class="log-ups">' + (l.ups && l.ups.length
        ? '<span class="aufstieg" title="' + esc(__('colLevelUp')) + '">' + ikon('levelup') + l.ups.length + '</span>' : '') + '</span>' +
      '</button>' +
      '<button class="mini-btn danger" data-action="log:remove" data-i="' + i + '"' +
      ' aria-label="' + esc(__('logRemoveAria', { date: fmtDate(l.d), day: l.day })) + '">' + ikon('close') + '</button>' +
      (offen ? eintragDetails(l, i, d) : '') + '</div>';
  }).join('') : '<div class="empty-hint">' + __('noLogs') + '</div>';

  renderLogSummary(imZeitraum.length, log.length);

  /* Calendar view */
  renderCalendar();
}

/* Aufgeklappte Eintraege. Die Eintraege selbst als Schluessel, nicht ihr
   Index: der verschiebt sich, sobald einer davor geloescht wird. */
const offeneEintraege = new Set();
export function logUmschalten(i){
  const l = (state.log || [])[i];
  if(!l) return;
  if(offeneEintraege.has(l)) offeneEintraege.delete(l); else offeneEintraege.add(l);
  renderHistory();
}

const ANSTRENGUNG = { l: 'effortEasy', p: 'effortOk', h: 'effortHard' };
function eintragDetails(l, i, tag){
  const ids = entryExercises(l, tag).filter(id => EX_BY_ID[id]);
  const ups = new Set(l.ups || []);
  const zeilen = ids.map(id => {
    const ex = EX_BY_ID[id];
    const reps = repsOf(l, id), sek = sekOf(l, id);
    const zahlen = reps.length ? reps.join(' · ') + ' ' + __('reps')
      : sek.length ? sek.join(' · ') + ' ' + __('secShort') : '–';
    const stufe = l.lv && Number.isInteger(l.lv[id]) ? exStage(ex, l.lv[id]) : '';
    return '<li><span class="ld-name">' + esc(exName(ex)) +
        (ups.has(id) ? ' <span class="aufstieg" title="' + esc(__('colLevelUp')) + '">' + ikon('levelup') + '</span>' : '') + '</span>' +
      '<span class="ld-zahlen">' + esc(zahlen) + '</span>' +
      (stufe || (l.an && l.an[id]) ? '<span class="ld-stufe">' + esc([stufe, l.an && ANSTRENGUNG[l.an[id]] ? __(ANSTRENGUNG[l.an[id]]) : ''].filter(Boolean).join(' · ')) + '</span>' : '') +
      '</li>';
  }).join('');
  return '<div class="log-details" id="log-det-' + i + '">' +
    (zeilen ? '<ul>' + zeilen + '</ul>' : '<p class="muted">' + esc(__('logNoDetails')) + '</p>') +
    (l.dl ? '<p class="muted">' + esc(__('logDeload')) + '</p>' : '') + '</div>';
}

/* Die durchschnittliche Trainingsdauer.

   Gemittelt wird nur ueber Einheiten, die eine Dauer tragen – die anderen
   sind nicht "0 Minuten lang", sondern ungemessen, und sie einzurechnen
   wuerde den Schnitt mit jedem alten Eintrag nach unten ziehen. Deshalb
   steht auch dabei, aus wie vielen Einheiten er stammt. */
function renderLogSummary(imZeitraum = 0, gezeigt = 0){
  const el = document.getElementById('logSummary');
  if(!el) return;
  const teile = [];
  const dauern = (state.log || []).map(l => l.dauer).filter(d => d > 0);
  if(dauern.length){
    const schnitt = Math.round(dauern.reduce((a, b) => a + b, 0) / dauern.length);
    teile.push(__('avgDuration', { v: dauerText(schnitt), n: dauern.length }));
  }
  /* Keine stille Kappung: wer 300 Einheiten im Zeitraum hat, soll nicht
     glauben, es waeren 100. */
  if(gezeigt < imZeitraum) teile.push(__('logShowing', { n: gezeigt, gesamt: imZeitraum }));
  el.textContent = teile.join(' ');
  el.hidden = !teile.length;
}

/* ================= Jahresrueckblick =================
   Alle Daten liegen im Log. Eine Zusammenfassung des laufenden Jahres ist
   reine Auswertung – motivierend, ohne dass irgendetwas neu erfasst wird. */
function renderYearReview(){
  const el = document.getElementById('yearReview');
  if(!el) return;
  const jahr = today().slice(0, 4);
  const log = (state.log || []).filter(l => l.d && l.d.slice(0, 4) === jahr);
  if(!log.length){ el.innerHTML = '<div class="muted">' + esc(__('yearReviewEmpty')) + '</div>'; return; }

  const workouts = log.length;
  const ups = log.reduce((a, l) => a + ((l.ups && l.ups.length) || 0), 0);
  /* Nur die Meilensteine DIESES Jahres. Gezaehlt wurden alle, die es je gab –
     am 1. Januar stand im Rueckblick auf ein Jahr mit null Erfolgen die
     Gesamtzahl, neben Werten, die sehr wohl auf das Jahr gefiltert waren.
     Der Wert je Meilenstein ist das Datum des ersten Mals. */
  const alleMs = state.milestones || {};
  const ms = Object.keys(alleMs)
    .filter(id => typeof alleMs[id] === 'string' && alleMs[id].slice(0, 4) === jahr).length;
  /* Wiederholungen: nur die, die wirklich trainiert wurden. Daneben die
     gehaltene Zeit, seit v16 erfasst – ein Jahr mit viel Handstand sah
     hier sonst nach wenig Arbeit aus. */
  let reps = 0, gehalten = 0;
  log.forEach(l => {
    Object.values(l.reps || {}).forEach(v => { if(v > 0) reps += v; });
    Object.values(l.sek || {}).forEach(v => { if(v > 0) gehalten += v; });
  });
  /* Meistgeuebte Uebung: aus den Log-Eintraegen, nicht aus dem Plan. Ohne
     Mobility – dort stand sonst die Handgelenks-Routine, also das
     Aufwaermen, das an jedem Drucktag dabei ist. */
  const zaehler = {};
  log.forEach(l => (l.ex || []).forEach(id => {
    const ex = EX_BY_ID[id];
    if(ex && ex.cat !== 'mobility') zaehler[id] = (zaehler[id] || 0) + 1;
  }));
  const topId = Object.keys(zaehler).sort((a, b) => zaehler[b] - zaehler[a])[0];
  const top = topId && EX_BY_ID[topId] ? exName(EX_BY_ID[topId]) : null;

  const teile = [
    __('yearReviewWorkouts', { n: workouts }),
    __('yearReviewLevelUps', { n: ups }),
    __('yearReviewMilestones', { n: ms }),
    __('yearReviewReps', { n: reps })
  ];
  if(gehalten) teile.push(__('yearReviewHold', { min: Math.round(gehalten / 60) }));
  if(top) teile.push(__('yearReviewTop', { name: top }));
  /* Die Ueberschrift steht schon im Markup – zwei gestapelte Titel waren
     einer zu viel, und der Inline-Stil, der den Abstand dazwischen
     wegrechnete, damit auch. */
  el.innerHTML = '<div class="muted">' + esc(teile.join(' · ')) + '</div>';
}

/* ================= Eine Einheit nachtragen =================
   Der Verlauf konnte Eintraege nur loeschen. Wer ohne Handy trainiert hat,
   bekam die Einheit nur ueber eine von Hand gebaute CSV wieder hinein, und
   ein falsches Datum liess sich gar nicht korrigieren – nur loeschen und
   neu anlegen, was ebenfalls nicht ging.

   Bewusst schmal: Datum, Trainingstag, Satzzahl. Stufen, Serien und
   Bestleistungen bleiben unberuehrt, wie schon beim Loeschen – aus einer
   nachgetragenen Satzzahl laesst sich nicht ableiten, was an dem Tag am
   oberen Limit lag. Der Dialog sagt das. */
function geplanteSaetze(key){
  const day = getDay(key);
  if(!day) return 0;
  return day.ex.reduce((summe, id) => {
    const ex = EX_BY_ID[id];
    return ex ? summe + zielVon(ex.levels[lvlOf(ex)]).sets : summe;
  }, 0);
}

function askLogEntry(){
  const tage = getDays();
  return askDialog((modal, finish) => {
    const titel = __('addLogEntry');
    modal.setAttribute('aria-label', titel);
    modal.innerHTML = dialogKopf(titel) +
      '<p class="dlg-text">' + esc(__('addLogEntryBody')) + '</p>' +
      '<div class="set-row"><span><label class="lbl2" for="le-datum">' + esc(__('logDate')) + '</label></span>' +
        '<input type="date" id="le-datum" max="' + today() + '" value="' + today() + '"></div>' +
      '<div class="set-row"><span><label class="lbl2" for="le-tag">' + esc(__('logDay')) + '</label></span>' +
        '<select id="le-tag">' + tage.map(d =>
          '<option value="' + esc(d.key) + '">' + esc(d.key + ' · ' + dayTitleOf(d)) + '</option>').join('') +
        '</select></div>' +
      '<div class="set-row"><span><label class="lbl2" for="le-saetze">' + esc(__('logSets')) + '</label></span>' +
        '<input type="number" id="le-saetze" min="1" max="99" inputmode="numeric"></div>' +
      dialogFuss(__('save'));

    const datum = modal.querySelector('#le-datum');
    const tag = modal.querySelector('#le-tag');
    const saetze = modal.querySelector('#le-saetze');
    /* Vorbelegt mit dem, was der Plan fuer diesen Tag vorsieht – in aller
       Regel ist genau das die Antwort, und der Rest ist ein Tippen. */
    const vorbelegen = () => { saetze.value = String(geplanteSaetze(tag.value) || 1); };
    tag.onchange = vorbelegen;
    vorbelegen();

    modal.querySelector('[data-dlg=ok]').onclick = () => finish({
      d: datum.value, day: tag.value, sets: parseInt(saetze.value, 10)
    });
    modal.querySelectorAll('[data-dlg=abbrechen]').forEach(b => { b.onclick = () => finish(null); });
  });
}

export async function addLogEntry(){
  if(!getDays().length){ toast(__('noPlanDays')); return; }
  const eingabe = await askLogEntry();
  if(!eingabe) return;

  /* Ein leeres Datumsfeld liefert '' – und ein Datum in der Zukunft laesst
     sich trotz max-Attribut eintippen. */
  if(!/^\d{4}-\d{2}-\d{2}$/.test(eingabe.d) || eingabe.d > today()){
    toast(__('logDateInvalid')); return;
  }
  const day = getDay(eingabe.day);
  if(!day) return;
  const sets = Math.min(99, Math.max(1, Number.isFinite(eingabe.sets) ? eingabe.sets : 1));

  const doppelt = (state.log || []).some(l => l.d === eingabe.d && l.day === eingabe.day);
  if(doppelt && !await askConfirm(__('logDuplicateTitle'),
    __('logDuplicateBody', { date: fmtDate(eingabe.d), day: eingabe.day }), __('save'))) return;

  /* ex aus dem Plan: eine Vermutung, aber die bestmoegliche. Ohne sie waere
     der Eintrag fuer "zuletzt trainiert" und die Uebungshistorie unsichtbar,
     und der Rueckfall in domain/log.js kaeme spaeter zum selben Ergebnis –
     nur dann anhand des DANN gueltigen Plans. Lieber jetzt festhalten.
     dauer bleibt 0: nachgetragen heisst nicht gemessen. */
  const entry = {
    d: eingabe.d, day: eingabe.day, ex: [...day.ex],
    sets, tops: 0, ups: [], reps: {}, dauer: 0
  };
  state.log.push(entry);
  /* Nach Datum einsortieren wie beim CSV-Import: der Verlauf zeigt die
     letzten Eintraege ueber die Position in der Liste. */
  state.log.sort((a, b) => a.d.localeCompare(b.d));
  if(state.log.length > MAX_LOG_ENTRIES) state.log = state.log.slice(-MAX_LOG_ENTRIES);

  state.workouts = (state.workouts || 0) + 1;
  /* Das groesste Datum, nicht das neueste Element – nachgetragen wird meist
     rueckwaerts. */
  state.lastDate = state.log.reduce((a, e) => (!a || e.d > a) ? e.d : a, null);

  await save();
  renderAll(); renderHistory();
  toast(__('logAdded', { date: fmtDate(eingabe.d) }));
}

/* Einen einzelnen Eintrag entfernen.

   Das Undo nach "Fertig" lebt fuenf Sekunden; danach war ein Fehleintrag nur
   noch ueber ein von Hand bearbeitetes JSON-Backup loszuwerden.

   Zurueckgerechnet werden Zaehler, Tagesstatistik und das Datum der letzten
   Einheit. Stufen, Serien und Bestleistungen bleiben, wie sie sind: aus einem
   Log-Eintrag laesst sich nicht ableiten, welcher Stand vor ihm galt. Der
   Toast sagt das ausdruecklich.

   Statt der Rueckfrage gibt es jetzt Rueckgaengig: eine Frage vor jedem
   Loeschen bremst den, der aufraeumt, und schuetzt trotzdem nicht vor dem
   falschen Eintrag. Der Toast holt ihn an seine alte Stelle zurueck. */
let geloescht = null, geloeschtTimeout = null;
export async function removeLogEntry(i){
  const l = (state.log || [])[i];
  if(!l) return;
  clearTimeout(geloeschtTimeout);
  geloescht = { l, i, workouts: state.workouts || 0, lastDate: state.lastDate };
  geloeschtTimeout = setTimeout(() => { geloescht = null; }, 12000);

  state.log.splice(i, 1);
  offeneEintraege.delete(l);
  state.workouts = Math.max(0, (state.workouts || 0) - 1);
  /* Das groesste verbliebene Datum, nicht das letzte Element: ein CSV-Import
     kann aeltere Eintraege hinten angehaengt haben. */
  state.lastDate = state.log.reduce((a, e) => (!a || e.d > a) ? e.d : a, null);

  await save();
  renderAll(); renderHistory();
  toast(__('logRemovedUndo', { date: fmtDate(l.d), day: l.day }), false, { text: __('undo'), action: 'log:restore' });
}
export async function logZurueckholen(){
  const g = geloescht;
  if(!g) return;
  clearTimeout(geloeschtTimeout);
  geloescht = null;
  state.log.splice(Math.min(g.i, state.log.length), 0, g.l);
  state.workouts = g.workouts;
  state.lastDate = g.lastDate;
  await save();
  renderAll(); renderHistory();
  toast(__('logRestored'));
}

/* Angezeigter Monat, relativ zum laufenden. 0 = dieser Monat. */
let kalenderVersatz = 0;

export function kalenderVerschieben(delta){
  kalenderVersatz += delta;
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

  /* Der Kalender stand fest auf new Date() – zurueckblaettern ging nicht,
     und ein mehrjaehriger Verlauf war damit im laufenden Monat eingesperrt. */
  const now = new Date();
  const gezeigt = new Date(now.getFullYear(), now.getMonth() + kalenderVersatz, 1);
  const year = gezeigt.getFullYear(), month = gezeigt.getMonth();
  const first = gezeigt.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const workoutDays = new Set(state.log.map(l => l.d));

  /* Vorwaerts endet die Reise im laufenden Monat, rueckwaerts beim ersten
     aufgezeichneten Training – dahinter gibt es nichts zu sehen. */
  const erster = state.log.reduce((a, e) => (!a || e.d < a) ? e.d : a, null) || '';
  const grenzeZurueck = erster.slice(0, 7) >= (year + '-' + String(month + 1).padStart(2, '0'));

  /* Monatsname und Wochentage aus Intl statt fest verdrahtet – sonst steht
     im englischen Kalender "Juli" und darueber "Mo Di Mi". */
  const monatsName = gezeigt.toLocaleDateString(getLang(), { month: 'long', year: 'numeric' });
  let html = '<div class="section-title cal-title"><span>' + esc(__('calendar')) + ' ' + esc(monatsName) + '</span>' +
    /* aria-disabled statt disabled: die Schaltflaeche wird an der Grenze
       unwirksam, aber genau dann liegt der Fokus auf ihr. Ein deaktiviertes
       Element kann keinen Fokus halten – er fiele auf <body>, und die
       Tastaturnavigation risse ab. Die Sperre prueft der Handler. */
    '<span class="cal-nav">' +
      '<button class="mini-btn" data-action="calendar:shift" data-delta="-1"' +
      (grenzeZurueck ? ' aria-disabled="true"' : '') +
      ' aria-label="' + esc(__('calPrev')) + '">‹</button> ' +
      '<button class="mini-btn" data-action="calendar:shift" data-delta="1"' +
      (kalenderVersatz >= 0 ? ' aria-disabled="true"' : '') +
      ' aria-label="' + esc(__('calNext')) + '">›</button>' +
    '</span></div>' +
    '<div class="calendar-grid" role="list" aria-label="' + esc(__('calendarAria', { month: monatsName })) + '">';
  wochentage().forEach(d => { html += '<div class="cal-header" aria-hidden="true">' + esc(d) + '</div>'; });
  /* Die geplanten Termine des gezeigten Monats, einmal fuer das ganze Gitter.
     Ab heute, denn vergangene Tage erzaehlt das Log selbst. 40 Tage reichen:
     vorwaerts endet die Reise im laufenden Monat, weiter als bis zu dessen
     Ende kann hier also nichts sichtbar werden. */
  const geplanteTage = new Map(
    naechsteTermine(state.wochenplan, today(), 40)
      .filter(t => t.d.slice(0, 7) === year + '-' + String(month + 1).padStart(2, '0'))
      .map(t => [t.d, t.key]));

  const offset = (first + 6) % 7;
  for(let i = 0; i < offset; i++) html += '<div class="cal-day empty" aria-hidden="true"></div>';
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const isWorkout = workoutDays.has(dateStr);
    const isToday = dateStr === today();
    /* Geplant, aber noch nicht gewesen: der Kalender zeigte bisher
       ausschliesslich Vergangenheit. Nur in der Zukunft und nur, wenn ein
       Rhythmus eingerichtet ist – sonst waere jeder leere Tag markiert. */
    const isGeplant = !isWorkout && dateStr >= today() && geplanteTage.has(dateStr);
    /* Trainingstage waren nur gruen eingefaerbt – ohne Datum, ohne Label.
       Jetzt tragen sie den vollen Tag samt Zustand als Textalternative. */
    const label = __('calendarDay', { d, month: monatsName }) +
      (isWorkout ? __('calendarTrained') : '') +
      (isGeplant ? __('calendarPlanned', { day: geplanteTage.get(dateStr) }) : '') +
      (isToday ? __('calendarToday') : '');
    html += '<div class="cal-day' + (isWorkout ? ' workout' : '') + (isGeplant ? ' geplant' : '') +
      (isToday ? ' today' : '') + '"' +
      ' role="listitem" aria-label="' + esc(label) + '"><span aria-hidden="true">' + d + '</span></div>';
  }
  html += '</div>';
  cal.innerHTML = html;
}

/* ================= Body Measurements ================= */
export async function addMeasurement(){
  const parts = ['chest', 'waist', 'arm', 'thigh'];
  const m = state.measurements || {};
  if(!m._dates) m._dates = [];
  const entry = { d: today() };
  parts.forEach(p => {
    const el = document.getElementById('meas-' + p);
    const v = parseFloat(el?.value);
    if(v && v > 0 && v < 200) entry[p] = v;
  });
  if(Object.keys(entry).length < 2){ toast(__('measurementEmpty')); return; }
  m._dates.push(entry);
  if(m._dates.length > MAX_SERIES_ENTRIES) m._dates = m._dates.slice(-MAX_SERIES_ENTRIES);
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
    /* <small> ist keine Beschriftung – ein Screenreader las hier bisher
       nur "Eingabefeld". */
    html += '<div class="meas-col"><label for="meas-' + p + '"><small>' + esc(labels[p]) + '</small></label>' +
      '<input id="meas-' + p + '" type="number" inputmode="decimal" step="0.5" min="0" max="200"' +
      ' placeholder="' + esc(last) + ' ' + esc(__('cm')) + '" class="meas-input"></div>';
  });
  html += '<button class="btn btn--standalone meas-save" data-action="measurement:add">' + __('save') + '</button>';
  html += '</div>';

  if(dates.length){
    html += '<div class="meas-meta">';
    const last = dates[dates.length - 1];
    parts.forEach(p => {
      if(last[p]) html += esc(labels[p]) + ': <b>' + last[p] + ' ' + __('cm') + '</b> · ';
    });
    html += fmtDate(last.d);
    html += '</div>';
    if(dates.length > 1){
      /* Die Zahlen stehen direkt darüber im Text – die Kurve ist reine
         Dekoration und wird deshalb ausgeblendet statt doppelt vorgelesen. */
      html += '<svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true" focusable="false">';
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
export async function addWeight(){
  const inp = document.getElementById('weightInput');
  const v = parseFloat(String(inp.value).replace(',', '.'));
  if(!v || v < 30 || v > 250){ toast(__('weightImplausible')); return; }
  state.weights.push({ d: today(), kg: Math.round(v * 10) / 10 });
  if(state.weights.length > MAX_SERIES_ENTRIES) state.weights = state.weights.slice(-MAX_SERIES_ENTRIES);
  inp.value = '';
  await save(); renderWeight(); toast(__('weightSaved'));
}
function renderWeight(){
  const svg = document.getElementById('weightSpark'), meta = document.getElementById('weightMeta');
  const ws = state.weights || [];
  /* Unter zwei Eintraegen gibt es keine Kurve; die 70 px dafuer standen
     bisher leer zwischen Eingabe und Text. */
  svg.classList.toggle('leer', ws.length < 2);
  if(!ws.length){
    svg.innerHTML = '';
    meta.textContent = __('weightEmpty');
    return;
  }
  if(ws.length === 1){
    svg.innerHTML = '';
    meta.innerHTML = __('weightFirst', { kg: ws[0].kg, date: fmtDate(ws[0].d) });
    return;
  }
  const kgs = ws.map(w => w.kg);
  const min = Math.min(...kgs) - 1, max = Math.max(...kgs) + 1;
  const pts = ws.map((w, i) =>
    (i / (ws.length - 1) * 296 + 2).toFixed(1) + ',' + (66 - (w.kg - min) / (max - min) * 62).toFixed(1)).join(' ');
  /* var(--accent) statt des aufgeloesten Wertes: sonst bleibt die Kurve nach
     einem Theme-Wechsel in der alten Farbe, bis zufaellig neu gerendert wird.
     Die Messwert-Kurve daneben macht es bereits so. */
  svg.innerHTML = '<polyline points="' + pts + '" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
  const delta = Math.round((kgs[kgs.length - 1] - kgs[0]) * 10) / 10;
  meta.innerHTML = __('weightMeta', { kg: kgs[kgs.length - 1], delta: (delta > 0 ? '+' : '') + delta, n: ws.length });
}

/* Leerer Zustand: ein Symbol, ein Satz, was als Naechstes kommt, und wo
   es einen gibt, der Knopf dorthin. Das Symbol kommt fertig herein –
   ikon('…') steht damit woertlich beim Aufrufer, wo der Test auf tote
   Symbole es findet. */
function leerHtml(symbol, text, knopf){
  return '<div class="leer-zustand">' + symbol + '<p>' + esc(text) + '</p>' +
    (knopf ? '<button class="leer-los" data-action="' + knopf.action + '"' +
      (knopf.tab ? ' data-tab="' + knopf.tab + '"' : '') + '>' + esc(knopf.text) + '</button>' : '') + '</div>';
}

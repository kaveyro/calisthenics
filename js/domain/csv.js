/* CSV-Serialisierung des Trainingslogs.
   Format: Semikolon-getrennt, alle Felder in Anfuehrungszeichen, "" als
   maskiertes Anfuehrungszeichen (Excel-kompatibel, deutsche Locale). */

export const CSV_HEADER = ['Datum', 'Tag', 'Saetze', 'TopSaetze', 'LevelUps', 'Uebungen', 'Wdh'];
export const UPS_SEPARATOR = ' | ';
/* Trennzeichen innerhalb der beiden neuen Spalten. Ohne Leerraum, damit sie
   sich vom UPS_SEPARATOR unterscheiden und beim Parsen nicht kollidieren. */
export const LIST_SEPARATOR = '|';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Wiederholungen als 'pushup:12,10,8|dips:8,7'.

   Die Spalten Uebungen und Wdh gab es nicht: der Export liess ausgerechnet
   die Wiederholungen weg, die jede Einheit mitschreibt, und war damit gegen
   die eigenen Daten verlustbehaftet. Ein Roundtrip Export -> Import verlor
   sie stillschweigend.

   Ein ausgelassener Satz wird zu einem leeren Feld ('12,,8'), damit die
   Satznummern erhalten bleiben – sie sind der Index im Schluessel. */
export function serializeReps(reps){
  if(!reps || typeof reps !== 'object') return '';
  const proEx = new Map();
  Object.keys(reps).forEach(k => {
    const i = k.lastIndexOf('-');
    if(i <= 0) return;
    const id = k.slice(0, i);
    const nr = parseInt(k.slice(i + 1), 10);
    const wert = reps[k];
    if(!Number.isFinite(nr) || nr < 0 || typeof wert !== 'number' || !Number.isFinite(wert)) return;
    if(!proEx.has(id)) proEx.set(id, []);
    proEx.get(id)[nr] = wert;
  });
  return [...proEx.entries()]
    .map(([id, werte]) => id + ':' + Array.from(werte, v => (v === undefined ? '' : v)).join(','))
    .join(LIST_SEPARATOR);
}

export function parseReps(text){
  const out = {};
  String(text || '').split(LIST_SEPARATOR).forEach(teil => {
    const i = teil.indexOf(':');
    if(i <= 0) return;
    const id = teil.slice(0, i).trim();
    if(!id) return;
    teil.slice(i + 1).split(',').forEach((s, nr) => {
      const t = s.trim();
      if(!t) return;
      const n = parseInt(t, 10);
      if(Number.isFinite(n)) out[id + '-' + nr] = n;
    });
  });
  return out;
}

export function serializeLog(log){
  const rows = [CSV_HEADER].concat((log || []).map(l => [
    l.d, l.day, l.sets, l.tops,
    (l.ups || []).join(UPS_SEPARATOR),
    (l.ex || []).join(LIST_SEPARATOR),
    serializeReps(l.reps)
  ]));
  return rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(';')).join('\n');
}

/* Echter Parser statt split(';') plus Quote-Strip: sonst zerfaellt jede
   Zeile falsch, sobald ein Feld selbst ein Semikolon enthaelt – der
   Roundtrip des eigenen Exports war damit nicht verlustfrei. */
export function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = String(text || '');
  const body = src.charCodeAt(0) === 0xFEFF ? src.slice(1) : src;   /* BOM */

  for(let i = 0; i < body.length; i++){
    const c = body[i];
    if(inQuotes){
      if(c === '"'){
        if(body[i + 1] === '"'){ field += '"'; i++; }               /* "" -> " */
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if(c === '"') inQuotes = true;
    else if(c === ';'){ row.push(field); field = ''; }
    else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
    else if(c !== '\r') field += c;
  }
  if(field !== '' || row.length){ row.push(field); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

/* Rohzeilen -> Log-Eintraege. Alle Spalten werden ueber den Kopf aufgeloest;
   frueher waren Saetze und TopSaetze fest auf Index 2 und 3 verdrahtet,
   sodass eine umsortierte Datei stillschweigend Unsinn ergab.
   Gibt { entries, skipped } zurueck; wirft bei fehlender Datumsspalte. */
export function parseLog(text, sanitizeDayKey = s => String(s || '').slice(0, 6)){
  const rows = parseCSV(text);
  if(rows.length < 2) throw new Error('Datei enthält keine Datenzeilen');

  const header = rows[0].map(h => h.trim());
  const col = name => header.indexOf(name);
  const iDate = col('Datum'), iDay = col('Tag');
  const iSets = col('Saetze'), iTops = col('TopSaetze'), iUps = col('LevelUps');
  /* Seit dem Zusatz der beiden Spalten. Aeltere Dateien haben sie nicht –
     col() liefert dann -1 und die Felder bleiben leer, statt den Import
     abzulehnen. */
  const iEx = col('Uebungen'), iReps = col('Wdh');
  if(iDate < 0) throw new Error('Spalte „Datum" fehlt');

  const entries = [];
  let skipped = 0;
  rows.slice(1).forEach(cols => {
    const d = (cols[iDate] || '').trim();
    /* Ohne diese Pruefung liefe ein Datum wie 01.02.2026 in isoWeek() und
       erzeugte einen NaN-KWNaN-Balken im Verlaufsdiagramm. */
    if(!ISO_DATE.test(d)){ skipped++; return; }
    const sets = iSets >= 0 ? parseInt(cols[iSets], 10) : 0;
    if(!(sets > 0)){ skipped++; return; }
    entries.push({
      d,
      day: sanitizeDayKey(iDay >= 0 ? cols[iDay] : '') || 'A',
      sets,
      tops: (iTops >= 0 ? parseInt(cols[iTops], 10) : 0) || 0,
      ups: iUps >= 0 && cols[iUps] ? cols[iUps].split(UPS_SEPARATOR).filter(Boolean) : [],
      ex: iEx >= 0 && cols[iEx]
        ? cols[iEx].split(LIST_SEPARATOR).map(s => s.trim()).filter(Boolean) : [],
      reps: iReps >= 0 ? parseReps(cols[iReps]) : {}
    });
  });
  return { entries, skipped };
}

/* Reine Datumslogik – kein DOM, kein Zustand.
   Alle Funktionen rechnen in der LOKALEN Zeitzone: toISOString() allein
   wuerde je nach Offset auf den Vor- oder Folgetag rutschen. */

/* Lokales Datum als ISO-Tag (YYYY-MM-DD), n Tage in der Vergangenheit. */
export function isoDaysAgo(n, now = new Date()){
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - n);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function today(now){ return isoDaysAgo(0, now); }

/* '2026-07-29' -> '29.07.26' */
export function fmtDate(iso){
  if(!iso) return '';
  const p = String(iso).split('-');
  if(p.length !== 3) return '';
  return p[2] + '.' + p[1] + '.' + p[0].slice(2);
}

/* ISO-8601-Kalenderwoche als '2026-KW31'.
   Die Woche gehoert zu dem Jahr, in dem ihr Donnerstag liegt. */
export function isoWeek(iso){
  const d = new Date(iso + 'T12:00:00');
  if(Number.isNaN(d.getTime())) return '';
  const day = (d.getDay() + 6) % 7;          /* Mo=0 … So=6 */
  d.setDate(d.getDate() - day + 3);          /* auf den Donnerstag */
  const firstThu = new Date(d.getFullYear(), 0, 4);
  return d.getFullYear() + '-KW' + String(1 + Math.round((d - firstThu) / 6048e5)).padStart(2, '0');
}

/* Laenge der laufenden Trainingsserie in Tagen.
   Anker ist heute ODER gestern – waere er fest auf heute gesetzt, fiele
   eine laufende Serie jeden Morgen auf 0, bis wieder trainiert wurde. */
export function calcGlobalStreak(log, now){
  if(!Array.isArray(log) || !log.length) return 0;
  const dates = [...new Set(log.map(l => l && l.d).filter(Boolean))].sort().reverse();
  if(!dates.length) return 0;

  let offset;
  if(dates[0] === isoDaysAgo(0, now)) offset = 0;
  else if(dates[0] === isoDaysAgo(1, now)) offset = 1;
  else return 0;

  let streak = 0;
  for(let i = 0; i < dates.length; i++){
    if(dates[i] === isoDaysAgo(i + offset, now)) streak++;
    else break;
  }
  return streak;
}

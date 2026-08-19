/* Wochenrhythmus als Kalenderdatei (RFC 5545).

   Eine PWA kann nur benachrichtigen, solange sie laeuft – eine
   geschlossene oder eingefrorene Seite erreicht niemanden. Der Kalender des
   Geraets kann es. Statt eine Erinnerung zu versprechen, die keine ist,
   gibt die App ihre Trainingstage als .ics heraus: einmal importiert,
   erinnert ab da das System, ganz ohne Server.

   Ein Termin je belegtem Wochentag, woechentlich wiederkehrend, mit einer
   Vorwarnung. Die Zeit steht ohne Zeitzone da ("floating time", RFC 5545
   3.3.5): 18 Uhr heisst 18 Uhr, egal wo man gerade ist. Das ist fuer einen
   Trainingsslot genau richtig und erspart eine VTIMEZONE-Komponente.

   Rein: kein DOM, kein Modulzustand, kein Zugriff nach draussen. Datum und
   Zeitstempel kommen herein, statt hier new Date() zu rufen – dieselbe
   Regel wie in dates.js und plan.js. */

import { naechsteTermine } from './plan.js';

/* Nach Date.getDay(): 0 = Sonntag. */
const WOCHENTAG = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/* Backslash, Semikolon, Komma und Zeilenumbruch sind in einem TEXT-Feld
   Steuerzeichen. "B · Pull, Beine & Core" waere ohne Maskierung ein
   zweiter Wert statt eines Titels. */
const escText = v => String(v == null ? '' : v)
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

/* Ein Zeichen in UTF-8. TextEncoder waere hier nicht erlaubt – die Schicht
   sieht keine Umgebung. */
const oktette = cp => cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;

/* Zeilen duerfen hoechstens 75 Oktette lang sein und werden sonst
   umgebrochen; die Fortsetzung beginnt mit einem Leerzeichen, das
   mitzaehlt. Gezaehlt wird in Bytes, nicht in Zeichen: ein Umlaut ist
   zwei, ein Emoji vier. */
function falten(zeile){
  const teile = [];
  let aktuell = '', laenge = 0, grenze = 75;
  for(const zeichen of String(zeile)){
    const n = oktette(zeichen.codePointAt(0));
    if(laenge + n > grenze){
      teile.push(aktuell);
      aktuell = ''; laenge = 1; grenze = 75;   /* das fuehrende Leerzeichen */
    }
    aktuell += zeichen; laenge += n;
  }
  teile.push(aktuell);
  return teile.join('\r\n ');
}

const zwei = n => String(n).padStart(2, '0');
const alsDatum = d => d.getFullYear() + zwei(d.getMonth() + 1) + zwei(d.getDate());
const alsZeit = d => 'T' + zwei(d.getHours()) + zwei(d.getMinutes()) + '00';

/* Der Wochenrhythmus als Inhalt einer .ics-Datei, oder '' wenn es nichts zu
   exportieren gibt (kein Rhythmus eingerichtet, unbrauchbare Uhrzeit).

   titelVon(key) liefert die Beschriftung des Plan-Tags. Hereingereicht statt
   importiert, wie exById und dayOf anderswo – die Uebungen kennt diese
   Schicht nicht.

   von      ISO-Datum, ab dem gesucht wird (der erste Termin je Wochentag
            liegt in den sieben Tagen danach)
   stempel  DTSTAMP in UTC, 'YYYYMMDDTHHMMSSZ'
   uhrzeit  'HH:MM', lokale Startzeit
   dauerMin Laenge des Termins
   vorlaufMin  wie lange vorher die Vorwarnung kommt; 0 schaltet sie ab */
export function wochenplanAlsIcs(wochenplan, titelVon = k => k, opt = {}){
  const { von, stempel, uhrzeit = '18:00', dauerMin = 60, vorlaufMin = 30 } = opt;
  const zeit = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(uhrzeit == null ? '' : uhrzeit));
  if(!zeit) return '';

  /* Sieben Tage ab `von` enthalten jeden Wochentag genau einmal – damit ist
     der erste Termin je belegtem Wochentag gefunden, ohne zweite Schleife. */
  const termine = naechsteTermine(wochenplan, von, 7);
  if(!termine.length) return '';

  const dauer = Math.max(5, Math.min(600, Math.round(Number(dauerMin)) || 0));
  const vorlauf = Math.max(0, Math.min(1440, Math.round(Number(vorlaufMin)) || 0));
  const marke = /^\d{8}T\d{6}Z$/.test(String(stempel))
    ? String(stempel)
    : String(von).replace(/-/g, '') + 'T000000Z';

  const zeilen = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Progression//Calisthenics Tracker//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  termine.forEach(({ d, key }) => {
    const start = new Date(d + 'T12:00:00');
    start.setHours(Number(zeit[1]), Number(zeit[2]), 0, 0);
    const ende = new Date(start.getTime() + dauer * 60000);
    const titel = titelVon(key) || key;

    zeilen.push('BEGIN:VEVENT');
    /* Feste Kennung statt Zufall: wer die Datei zweimal einspielt, bekommt
       denselben Termin aktualisiert statt einen zweiten daneben. */
    zeilen.push('UID:progression-' + start.getDay() + '-' +
      String(key).replace(/[^A-Za-z0-9_-]/g, '') + '@progression.local');
    zeilen.push('DTSTAMP:' + marke);
    zeilen.push('DTSTART:' + alsDatum(start) + alsZeit(start));
    zeilen.push('DTEND:' + alsDatum(ende) + alsZeit(ende));
    zeilen.push('RRULE:FREQ=WEEKLY;BYDAY=' + WOCHENTAG[start.getDay()]);
    zeilen.push('SUMMARY:' + escText(titel));
    if(vorlauf > 0){
      zeilen.push('BEGIN:VALARM');
      zeilen.push('TRIGGER:-PT' + vorlauf + 'M');
      zeilen.push('ACTION:DISPLAY');
      zeilen.push('DESCRIPTION:' + escText(titel));
      zeilen.push('END:VALARM');
    }
    zeilen.push('END:VEVENT');
  });

  zeilen.push('END:VCALENDAR');
  /* CRLF ist vorgeschrieben, auch am Ende. */
  return zeilen.map(falten).join('\r\n') + '\r\n';
}

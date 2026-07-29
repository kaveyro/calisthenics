/* Escaped Text fuer die Einbettung in HTML – auch in Attributwerte.

   Warnung: das schuetzt NICHT in einem JavaScript-Kontext. Steht der Wert in
   einem  onclick="fn('…')"  , wandelt der HTML-Parser &#39; zurueck in ein
   Apostroph, bevor JS den Ausdruck sieht. Solche Werte gehoeren in ein
   data-Attribut mit delegiertem Listener, nicht in einen Handler-String. */
export function esc(s){
  return String(s)
    .replace(/&/g, '&amp;')      /* & zuerst, sonst werden die folgenden */
    .replace(/</g, '&lt;')       /* Entities selbst nochmals escaped     */
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* Tag-Keys dienen als Bezeichner (Vergleiche, data-Attribute, Log-Eintraege)
   und stammen aus einer freien Nutzereingabe. Auf harmlose Zeichen begrenzen. */
export function sanitizeDayKey(s){
  return String(s == null ? '' : s).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 6);
}

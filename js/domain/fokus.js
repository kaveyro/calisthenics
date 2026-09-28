/* Fokus-Modus: welche Übung gerade dran ist.

   Im Fokus-Modus steht während einer Einheit nur eine Übung da – oder ein
   Supersatz, dessen beide Karten zusammengehören. Eine „Einheit“ ist hier
   also ein Schritt der Liste: eine Karte oder eine Klammer. Die App reicht
   für jeden Schritt nur herein, ob er fertig ist; welche Karten dazugehören,
   weiß sie selbst.

   Rein: kein DOM, kein Zustand. */

const fertig = s => !!(s && s.fertig);

/* Womit eine Einheit beginnt – oder nach dem Neuladen weitergeht: der erste
   Schritt, der noch nicht fertig ist. Sind alle fertig, der letzte; dort
   steht man, bevor man abschließt. */
export function fokusStart(schritte){
  const liste = Array.isArray(schritte) ? schritte : [];
  if(!liste.length) return 0;
  const i = liste.findIndex(s => !fertig(s));
  return i >= 0 ? i : liste.length - 1;
}

/* Wohin es nach einem Satz geht. Ist der aktuelle Schritt jetzt fertig,
   zum nächsten offenen dahinter; gibt es dahinter keinen, zum ersten
   offenen davor – eine übersprungene Übung wartet dann noch. Sonst bleibt
   es beim aktuellen. */
export function fokusNachSatz(schritte, aktuell){
  const liste = Array.isArray(schritte) ? schritte : [];
  if(!liste.length) return 0;
  const i = Number.isInteger(aktuell) ? Math.max(0, Math.min(aktuell, liste.length - 1)) : 0;
  if(!fertig(liste[i])) return i;
  const danach = liste.findIndex((s, k) => k > i && !fertig(s));
  if(danach >= 0) return danach;
  const davor = liste.findIndex(s => !fertig(s));
  return davor >= 0 ? davor : i;
}

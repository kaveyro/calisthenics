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

/* Die Reihenfolge der Einheit, wenn Übungen auf später verschoben wurden –
   etwa weil die Stange gerade belegt ist. Erst die übrigen in Planfolge,
   dann die verschobenen in der Folge, in der sie verschoben wurden.

   ids:      die Plan-Kennungen des Tages
   spaeter:  verschobene Plan-Kennungen, älteste zuerst
   paare:    Supersatz-Paare [a, b] aus gueltigePaare(); ein Paar bleibt
             beisammen, und wird ein Teil verschoben, wandert das ganze.

   Der Plan selbst bleibt unberührt – das gilt nur für heute. */
export function spaeterOrdnen(ids, spaeter, paare){
  const liste = Array.isArray(ids) ? ids : [];
  const zurueck = Array.isArray(spaeter) ? spaeter : [];
  const partner = new Map((Array.isArray(paare) ? paare : []).map(([a, b]) => [a, b]));
  const bloecke = [];
  for(let i = 0; i < liste.length; i++){
    const b = partner.get(liste[i]);
    if(b !== undefined && liste[i + 1] === b){ bloecke.push([liste[i], b]); i++; }
    else bloecke.push([liste[i]]);
  }
  const rang = blk => Math.min(...blk.map(id => { const r = zurueck.indexOf(id); return r < 0 ? Infinity : r; }));
  const vorn = bloecke.filter(blk => rang(blk) === Infinity);
  const hinten = bloecke.filter(blk => rang(blk) !== Infinity).sort((x, y) => rang(x) - rang(y));
  return [...vorn, ...hinten].flat();
}

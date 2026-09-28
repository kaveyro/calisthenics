/* Supersätze: zwei Übungen eines Tages im Wechsel, eine Pause nach beiden.

   Ein Satz Liegestütze, direkt danach ein Satz Rudern, dann die Pause –
   die Muskeln der einen Übung erholen sich, während die andere arbeitet.
   Das spart bei vier Sätzen drei Pausen, ohne dass eine Übung weniger
   Erholung bekommt.

   Gespeichert am Plan-Tag als  ss: [['pushup', 'row'], …]  – Kennungen,
   keine Positionen. Gültig ist ein Paar nur, wenn die zweite Übung direkt
   auf die erste folgt und keine der beiden schon in einem anderen Paar
   steht. Wer eine Übung aus dem Paar wegschiebt oder entfernt, löst es
   damit auf; die Aufrufer räumen ungültige Paare beim Speichern weg.

   Rein: kein DOM, kein Zustand. */

export const MAX_PAARE = 10;

/* Die gültigen Paare eines Tages, in der gespeicherten Reihenfolge. */
export function gueltigePaare(day){
  const ex = Array.isArray(day && day.ex) ? day.ex : [];
  const roh = Array.isArray(day && day.ss) ? day.ss : [];
  const vergeben = new Set();
  const out = [];
  for(const p of roh){
    if(out.length >= MAX_PAARE) break;
    if(!Array.isArray(p) || p.length !== 2) continue;
    const [a, b] = p;
    if(typeof a !== 'string' || typeof b !== 'string' || !a || a === b) continue;
    const i = ex.indexOf(a);
    if(i < 0 || ex[i + 1] !== b || vergeben.has(a) || vergeben.has(b)) continue;
    vergeben.add(a); vergeben.add(b);
    out.push([a, b]);
  }
  return out;
}

/* Der Partner einer Übung: { partner, erster } oder null. */
export function partnerVon(paare, id){
  for(const [a, b] of Array.isArray(paare) ? paare : []){
    if(a === id) return { partner: b, erster: true };
    if(b === id) return { partner: a, erster: false };
  }
  return null;
}

/* Paar an Position i schalten: steht die Übung in einem Paar, wird es
   gelöst, sonst mit der nächsten gebildet – wenn es eine gibt und sie frei
   ist. Zurück kommen die neuen Paare; der Tag selbst bleibt unverändert. */
export function paarUmschalten(day, i){
  const ex = Array.isArray(day && day.ex) ? day.ex : [];
  const paare = gueltigePaare(day);
  const id = ex[i];
  if(id === undefined) return paare;
  const drin = paare.findIndex(p => p.includes(id));
  if(drin >= 0) return paare.filter((_, k) => k !== drin);
  const b = ex[i + 1];
  if(b === undefined || paare.some(p => p.includes(b))) return paare;
  return [...paare, [id, b]];
}

/* Braucht es nach Satz s der Übung, die in diesem Paar steht, eine Pause?
   Nein, solange der Partner Satz s noch vor sich hat – dann geht es dort
   weiter. Sonst ist die Runde durch: Pause, und zwar die längere der
   beiden, weil sie für beide Übungen reichen muss.

   erledigt(id, s) sagt, ob Satz s von id abgehakt ist; saetze(id), wie
   viele Sätze id heute hat. */
export function pauseNachSatz(partner, s, erledigt, saetze){
  if(!partner) return { weiter: null, gemeinsam: false };
  if(s < saetze(partner) && !erledigt(partner, s)) return { weiter: partner, gemeinsam: false };
  return { weiter: null, gemeinsam: s < saetze(partner) };
}

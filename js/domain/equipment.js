/* Welche Uebung – genauer: welche STUFE – mit der vorhandenen Ausruestung
   machbar ist.

   Reine Logik: kein DOM, kein Modulzustand, keine Importe nach aussen. Das
   Vokabular wohnt hier und nicht in js/exercises.js, weil js/domain/state.js
   es zum Pruefen von state.equipment braucht und die Schicht nichts von
   ausserhalb importieren darf. exercises.js verweist im Kopfkommentar hierher.

   Zwei Regeln:

   1. Die Liste an einer Uebung oder Stufe ist ein ODER: ['chair','bar'] heisst
      "Tischkante ODER Stange". Ein Eintrag darf mit '+' eine Kombination
      ausdruecken: 'bar+band' heisst "Stange UND Band". Gebraucht wird das fuer
      den Klimmzug mit Band – ohne die Kombination liesse sich nicht sagen,
      dass beides noetig ist, und der Filter wuerde die Uebung jedem anbieten,
      der nur ein Band besitzt.

   2. 'none' ist immer vorhanden und steht nie in state.equipment. Was ohne
      Geraet geht, geht immer. */

export const EQUIP = ['none', 'chair', 'bar', 'parallettes', 'rings', 'band'];

/* Alles, was man besitzen kann – die Vorgabe fuer einen frischen Stand.
   'none' fehlt bewusst: es ist keine Anschaffung. */
export const EQUIP_ALL = EQUIP.filter(e => e !== 'none');

const liste = v => Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];

/* Die Geraete einer einzelnen Stufe. Die Stufe hat Vorrang, sonst gilt die
   Angabe der Uebung.

   Warum ueberhaupt je Stufe: die Progressionen wechseln unterwegs das Geraet.
   Dips fangen an der Bank an und enden auf Parallettes, Rows an der Tischkante
   und enden an der Stange. Eine Angabe nur auf Uebungsebene wuerde entweder
   die ersten Stufen unnoetig sperren oder die spaeteren faelschlich
   freigeben – beides waere schlechter als gar kein Filter. */
export function levelEquip(ex, i){
  const stufe = ex && Array.isArray(ex.levels) ? ex.levels[i] : null;
  if(stufe && Array.isArray(stufe.equip)) return liste(stufe.equip);
  return liste(ex && ex.equip);
}

/* Ist eine dieser Geraete-Angaben mit dem Vorhandenen zu erfuellen? */
export function moeglich(equipListe, vorhanden){
  const eintraege = liste(equipListe);
  if(!eintraege.length) return true;            /* keine Angabe = kein Geraet */
  const da = new Set(liste(vorhanden));
  da.add('none');
  return eintraege.some(e => e.split('+').every(teil => da.has(teil)));
}

export function levelMoeglich(ex, i, vorhanden){
  return moeglich(levelEquip(ex, i), vorhanden);
}

/* Machbar ist eine Uebung, sobald IRGENDEINE ihrer Stufen machbar ist – nicht
   erst, wenn alle es sind. Wer keine Parallettes hat, kann Bank-Dips trotzdem
   trainieren; erst der Aufstieg stockt (siehe hoechsteStufe). */
export function exMoeglich(ex, vorhanden){
  if(!ex || !Array.isArray(ex.levels) || !ex.levels.length) return false;
  return ex.levels.some((_, i) => levelMoeglich(ex, i, vorhanden));
}

/* Index der hoechsten machbaren Stufe, -1 wenn keine. Es wird bewusst nicht
   an der ersten Luecke abgebrochen: eine Leiter darf in der Mitte ein anderes
   Geraet verlangen und spaeter wieder ohne auskommen. */
export function hoechsteStufe(ex, vorhanden){
  if(!ex || !Array.isArray(ex.levels)) return -1;
  let hoechste = -1;
  ex.levels.forEach((_, i) => { if(levelMoeglich(ex, i, vorhanden)) hoechste = i; });
  return hoechste;
}

/* Was fehlt, um diese Stufe zu machen – fuer den Hinweis in der Oberflaeche.
   Zurueckgegeben wird die guenstigste Alternative, also die mit den wenigsten
   fehlenden Teilen; bei Gleichstand die zuerst genannte. Leer, wenn die Stufe
   machbar ist. */
export function fehlendeGeraete(ex, i, vorhanden){
  const eintraege = levelEquip(ex, i);
  if(moeglich(eintraege, vorhanden)) return [];
  const da = new Set(liste(vorhanden));
  da.add('none');
  let beste = null;
  eintraege.forEach(e => {
    const fehlt = e.split('+').filter(teil => !da.has(teil));
    if(!beste || fehlt.length < beste.length) beste = fehlt;
  });
  return beste || [];
}

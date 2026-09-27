/* Welche Uebungen Skills sind. Die Kategorie allein reicht dafuer nicht:
   Wand-Handstand und Planche Lean stehen unter 'push', der Front Lever
   unter 'pull'. Wer ordentlich Liegestuetze macht, hat deswegen keinen
   halben Handstand, und ein Satz Wand-Handstand ist Technikuebung, kein
   Kraftsatz fuer die Brust.

   Die Liste stand bisher zweimal im Code (Einstieg, Skill-Fahrplan). Jetzt
   gibt es sie einmal – der Plangenerator braucht sie als dritte Stelle. */

export const SKILL_IDS = new Set(['wall_hs', 'planche_lean', 'front_lever']);

export const istSkill = ex => !!ex && (ex.cat === 'skill' || SKILL_IDS.has(ex.id));

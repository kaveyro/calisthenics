/* Einstiegspunkt.

   Zwei Zeilen mit einem Zweck: js/app.js startete sich beim Import selbst
   (eine sofort ausgefuehrte async-Funktion am Modulende). Solange das so
   war, konnte kein Test die Datei laden – und damit lag der weitaus groesste
   Teil des Codes ausserhalb jeder Pruefung, waehrend js/domain/ vollstaendig
   abgedeckt war.

   Jetzt exportiert app.js start(), und nur diese Datei ruft es auf. Der
   Import allein hat keine Nebenwirkung mehr. */

import { start } from './app.js';

start();

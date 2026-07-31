import { describe, it, expect } from 'vitest';
import { backupFaellig, BACKUP_NACH_EINHEITEN, BACKUP_NACH_TAGEN } from '../js/domain/backup.js';

/* Der ganze Verlauf liegt unter einem localStorage-Schlüssel. Exportieren
   konnte man ihn immer – nur wusste niemand, wann das zuletzt geschah. */

const HEUTE = '2026-07-31';
const stand = (over = {}) => ({
  workouts: 0, lastBackup: null, backupWorkouts: 0, backupDismissed: 0, ...over
});

describe('backupFaellig – noch nie gesichert', () => {
  it('schweigt, solange nichts trainiert wurde', () => {
    expect(backupFaellig(stand(), HEUTE)).toBeNull();
  });

  it('schweigt unterhalb der Schwelle', () => {
    expect(backupFaellig(stand({ workouts: BACKUP_NACH_EINHEITEN - 1 }), HEUTE)).toBeNull();
  });

  it('meldet sich ab der Schwelle', () => {
    expect(backupFaellig(stand({ workouts: BACKUP_NACH_EINHEITEN }), HEUTE))
      .toEqual({ grund: 'nie', n: BACKUP_NACH_EINHEITEN });
  });
});

describe('backupFaellig – nach Einheiten', () => {
  it('zählt nur, was seit der letzten Sicherung dazukam', () => {
    const s = stand({ workouts: 50, lastBackup: HEUTE, backupWorkouts: 45 });
    expect(backupFaellig(s, HEUTE)).toBeNull();
  });

  it('meldet sich, sobald genug dazugekommen ist', () => {
    const s = stand({ workouts: 55, lastBackup: HEUTE, backupWorkouts: 45 });
    expect(backupFaellig(s, HEUTE)).toEqual({ grund: 'einheiten', n: 10 });
  });
});

describe('backupFaellig – nach Zeit', () => {
  const alt = { workouts: 50, lastBackup: '2026-01-01', backupWorkouts: 49 };

  it('meldet sich, wenn die Sicherung alt ist und seither trainiert wurde', () => {
    const treffer = backupFaellig(stand(alt), HEUTE);
    expect(treffer.grund).toBe('zeit');
    expect(treffer.n).toBeGreaterThanOrEqual(BACKUP_NACH_TAGEN);
  });

  /* Wer pausiert, erzeugt keine neuen Daten – eine Erinnerung wäre reines
     Genörgel. */
  it('schweigt, wenn seit der Sicherung nicht trainiert wurde', () => {
    expect(backupFaellig(stand({ ...alt, backupWorkouts: 50 }), HEUTE)).toBeNull();
  });

  it('schweigt innerhalb der Frist', () => {
    const s = stand({ workouts: 50, lastBackup: '2026-07-20', backupWorkouts: 49 });
    expect(backupFaellig(s, HEUTE)).toBeNull();
  });

  it('kommt ohne heutiges Datum aus, statt zu rechnen', () => {
    expect(backupFaellig(stand(alt), null)).toBeNull();
    expect(backupFaellig(stand(alt), 'kein Datum')).toBeNull();
  });
});

describe('backupFaellig – „Später"', () => {
  const faellig = { workouts: 20, lastBackup: null };

  it('verstummt für dieselbe Spanne wie eine echte Sicherung', () => {
    expect(backupFaellig(stand({ ...faellig, backupDismissed: 20 }), HEUTE)).toBeNull();
    expect(backupFaellig(stand({ ...faellig, backupDismissed: 12 }), HEUTE)).toBeNull();
  });

  it('meldet sich danach erneut', () => {
    const s = stand({ workouts: 30, lastBackup: null, backupDismissed: 20 });
    expect(backupFaellig(s, HEUTE)).toEqual({ grund: 'nie', n: 30 });
  });
});

describe('backupFaellig – unbrauchbare Eingaben', () => {
  it('liefert null statt zu werfen', () => {
    expect(backupFaellig(null, HEUTE)).toBeNull();
    expect(backupFaellig(undefined, HEUTE)).toBeNull();
    expect(backupFaellig('text', HEUTE)).toBeNull();
    expect(backupFaellig({}, HEUTE)).toBeNull();
  });

  it('behandelt ein kaputtes Sicherungsdatum wie „noch nie"', () => {
    /* migrateState() setzt es zwar auf null zurück, aber diese Funktion
       darf sich nicht darauf verlassen. */
    const s = stand({ workouts: 20, lastBackup: 12345 });
    expect(backupFaellig(s, HEUTE)).toEqual({ grund: 'nie', n: 20 });
  });

  it('verträgt nicht-numerische Zählerstände', () => {
    const s = stand({ workouts: 20, lastBackup: HEUTE, backupWorkouts: 'viele' });
    expect(backupFaellig(s, HEUTE)).toEqual({ grund: 'einheiten', n: 20 });
  });
});

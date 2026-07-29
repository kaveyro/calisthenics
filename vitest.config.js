import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /* node statt jsdom als Vorgabe: das ist kein Performance-Argument.
       Greift ein Modul in js/domain/ versehentlich auf document zu, fliegt
       der Test sofort mit "document is not defined" – die Reinheit der
       Schicht wird damit auch von den Tests erzwungen, nicht nur vom Linter. */
    environment: 'node',
    include: ['test/**/*.test.js'],
    globals: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['js/domain/**'],
      reporter: ['text', 'html'],
      thresholds: { lines: 90, functions: 90, branches: 80 }
    }
  }
});

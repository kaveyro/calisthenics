import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'sw-manifest.js', 'coverage/**'] },

  js.configs.recommended,

  /* Anwendungscode im Browser */
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-unused-vars': ['error', { args: 'after-used', varsIgnorePattern: '^_' }],
      /* Die App bleibt zur Laufzeit abhaengigkeitsfrei: nur relative
         Spezifizierer mit .js-Endung, damit der Browser sie direkt aufloest. */
      'no-restricted-syntax': ['error', {
        selector: 'ImportDeclaration[source.value=/^[^.]/]',
        message: 'Laufzeitcode bleibt abhängigkeitsfrei – nur relative Importe mit .js-Endung.'
      }]
    }
  },

  /* domain/ ist die reine Schicht: kein DOM, kein Zustand. Mit leeren Globals
     schlaegt jede Verwendung von document oder window hier als no-undef fehl –
     Reinheit wird damit erzwungen statt nur vereinbart. */
  {
    files: ['js/domain/**/*.js'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['**/core/**', '**/render/**', '**/ui/**', '**/features/**', '**/app.js', '**/storage.js'],
          message: 'domain/ muss rein bleiben.'
        }]
      }]
    }
  },

  /* Service Worker: eigener globaler Scope */
  {
    files: ['sw.js'],
    languageOptions: { sourceType: 'script', globals: globals.serviceworker }
  },

  /* Node-Werkzeuge und Konfigurationsdateien */
  {
    files: ['tools/**/*.js', '*.config.js'],
    languageOptions: { sourceType: 'module', globals: globals.node }
  },

  /* Tests */
  {
    files: ['test/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } }
  }
];

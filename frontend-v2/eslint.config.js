import js from '@eslint/js'
import react from 'eslint-plugin-react'
import hooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/* Análisis estático del frontend. Hasta ahora NO había ninguno: 22.000 líneas
   de JavaScript sin una sola máquina vigilando. Estas reglas cazan gratis lo
   que de otro modo solo se ve en producción.

   Criterio: solo se marca como ERROR lo que rompe de verdad. Lo que es olor a
   código pero no falla queda en aviso, para que el CI no se vuelva ruido que
   todo el mundo ignora. */
export default [
  { ignores: ['dist/**', 'dist-staging/**', 'node_modules/**', 'public/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.serviceworker },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,

      // ── Errores de verdad ─────────────────────────────────────────────
      'react-hooks/rules-of-hooks': 'error',   // hook dentro de un if = crash
      'no-undef': 'error',                     // variable inexistente
      'no-const-assign': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-cond-assign': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',  // "${x}" en comillas normales
      'require-atomic-updates': 'error',       // carreras en async
      'react/jsx-key': 'error',                // listas sin key: renders erróneos
      'react/no-direct-mutation-state': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/no-children-prop': 'error',

      // ── Avisos: mejorables, no rompen ─────────────────────────────────
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],

      // ── Apagadas a propósito ──────────────────────────────────────────
      'react/prop-types': 'off',        // no usamos PropTypes (ni TypeScript)
      'react/react-in-jsx-scope': 'off', // React 17+ no lo necesita
      'react/no-unescaped-entities': 'off', // comillas en español son legítimas
    },
  },
  {
    // React Three Fiber declara su propio JSX (<mesh position={…} args={…}>).
    // El plugin solo conoce las etiquetas de HTML, así que marcaba 47 falsos
    // positivos aquí. La regla se apaga SOLO en los ficheros 3D.
    files: ['**/twin3d/**', '**/Landing3D*.jsx'],
    rules: { 'react/no-unknown-property': 'off' },
  },
]

import js from '@eslint/js'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-config-prettier'

/**
 * Configuración de eslint, en formato plano.
 *
 * Estaba en `.eslintrc.json`, que es el formato viejo. ESLint 10 lo quitó del
 * todo, y también quitó la bandera `--ext` que usaba el workflow: mientras
 * siguiera así, cualquier actualización de eslint rompía el lint por dos sitios
 * a la vez, y el aviso de dependencias se quedaba abierto para siempre.
 *
 * Las reglas son EXACTAMENTE las mismas que había. La única que manda de verdad
 * es `react-hooks/rules-of-hooks` en `error`: es la que caza meter un hook por
 * debajo de un return temprano, que tira la aplicación con el error 310 y ya
 * llegó una vez a producción.
 *
 * Las demás siguen en `warn` a propósito. Hay 213 avisos vivos —98 de `any`, 79
 * de cosas sin usar, 33 de dependencias de efectos— y un lint que falla por 213
 * cosas se acaba desactivando. Prefiero uno que sólo salta por lo que tumba la
 * aplicación.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'public/**', '*.config.js'],
  },

  js.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],

  {
    files: ['**/*.{ts,tsx,js,jsx}'],

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },

    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
    },

    settings: {
      react: { version: 'detect' },
    },

    rules: {
      ...tsPlugin.configs.recommended.rules,

      'react/prop-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-empty': 'warn',
      'prefer-const': 'warn',

      // La única que puede tumbar el lint. Ver arriba.
      'react-hooks/rules-of-hooks': 'error',

      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',

      // `no-undef` no vale con TypeScript: los tipos no son variables y el
      // compilador ya comprueba lo que existe y lo que no.
      'no-undef': 'off',
    },
  },

  prettier,
]

import js from '@eslint/js'
import globals from 'globals'
import prettierConfig from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
  },
  prettierConfig,
  {
    // Vendored verbatim from node_modules/maplibre-gl/dist/ (see AGENT.md) —
    // must stay byte-identical to upstream, not linted or reformatted.
    ignores: ['dist/**', 'public/maplibre/**'],
  },
]

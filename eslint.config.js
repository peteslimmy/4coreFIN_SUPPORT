import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'server.cjs'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        {
          allowConstantExport: true,
          allowExportNames: [
            'AppContext', 'useApp',
            'ConfigContext', 'useConfigContext', 'useConfigDomain',
            'AdminContext', 'useAdminContext', 'useAdminDomain',
            'AppShellContext', 'useAppShell', 'useAppShellDomain', 'defaultUser',
            'TicketContext', 'useTicketContext', 'useTicketDomain',
            'ToastContext', 'useToast',
            'UiContext', 'useUi',
          ],
        },
      ],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      // Encourage use of design tokens over raw Tailwind color utilities.
      // Pattern matches: bg-{color}, text-{color}, border-{color} with a
      // named color (not a hex/arbitrary value).  This is a *warning* so CI
      // doesn't block, but developers see the feedback in their editor.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/\\b(bg|text|border|ring|outline|divide|shadow|accent|caret|decoration|fill|stroke)-(red|blue|green|yellow|orange|purple|pink|indigo|violet|teal|cyan|emerald|lime|amber|fuchsia|rose|sky|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\\b/]',
          message: 'Use design tokens (e.g., bg-primary, text-error, border-border) instead of raw color utilities.',
        },
        {
          selector: 'Literal[value=/\\b(bg|text|border|ring)-(black|white)\\b/]',
          message: 'Use design tokens (e.g., bg-surface, text-text-primary, border-border) instead of black/white utilities.',
        },
      ],
    },
  },
  prettierConfig,
);

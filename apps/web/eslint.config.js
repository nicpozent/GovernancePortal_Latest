// Flat ESLint config for the SPA (ESM — this package is "type":"module").
// Pragmatic like the API's: real bugs are errors, stylistic/opinionated rules
// are warnings so `lint` stays a signal, not noise, on a large existing file.
// React 18 automatic JSX runtime (no React import needed) + hooks rules.
import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/config.js'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021 },
    },
    settings: { react: { version: '18' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',    // React 18 / Vite automatic JSX runtime
      'react/prop-types': 'off',            // this SPA doesn't use PropTypes
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react/no-unescaped-entities': 'warn',
      // The two classic, high-value hooks rules. We intentionally do NOT enable
      // react-hooks v7's experimental react-compiler rule set — it false-positives
      // on valid ref mutation and forward const references in this codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['test/**/*.{js,jsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
  },
];

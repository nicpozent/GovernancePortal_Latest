// Flat ESLint config (ESLint 10). Pragmatic: catch real bugs (undefined vars,
// unreachable code, bad comparisons) as errors; keep stylistic noise as warnings.
const js = require('@eslint/js');

const nodeGlobals = {
  process: 'readonly', console: 'readonly', Buffer: 'readonly', module: 'writable',
  require: 'readonly', __dirname: 'readonly', __filename: 'readonly', exports: 'writable',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  URL: 'readonly', fetch: 'readonly', AbortController: 'readonly', crypto: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: nodeGlobals },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-constant-condition': ['warn', { checkLoops: false }],
    },
  },
];

// The ESLint configuration (D-74). Prettier sets the layout (see .prettierrc.json).
// ESLint finds code that is hard to read or that can be wrong.
import js from '@eslint/js';
import markdown from '@eslint/markdown';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';

// The repository contains only ES modules.
const JS_FILES = ['**/*.{js,mjs}'];
// Code that runs in Node: the scripts, the Node tests and the configuration files.
const NODE_FILES = [
  'scripts/**/*.{js,mjs}',
  'test/node/**/*.{js,mjs}',
  '*.config.{js,mjs}',
  'examples/*/*.config.{js,mjs}',
];

export default defineConfig([
  // ESLint ignores node_modules/ by default. These folders contain generated files.
  globalIgnores(['**/coverage/', '**/dist/', '**/.wrangler/', 'reports/', '.stryker-tmp/']),

  {
    name: 'zeg/javascript',
    files: JS_FILES,
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Braces for the body of each if, else, for, while and do statement
      curly: ['error', 'all'],
      // Readability
      'no-nested-ternary': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-lonely-if': 'error',
      'no-unneeded-ternary': 'error',
      'no-implicit-coercion': 'error',
      'no-multi-assign': 'error',
      'no-sequences': 'error',
      'no-param-reassign': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-template': 'error',
      'prefer-arrow-callback': 'error',
      'dot-notation': 'error',
      yoda: 'error',
      'max-params': ['error', 4],
      // Code that can be wrong
      eqeqeq: ['error', 'always'],
      'consistent-return': 'error',
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      'no-unused-expressions': 'error',
      'no-useless-return': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'no-undef-init': 'error',
      'no-lone-blocks': 'error',
      'prefer-object-has-own': 'error',
    },
  },

  // Code that runs in workerd: the library, the unit tests and the example Worker
  {
    name: 'zeg/globals-worker',
    files: JS_FILES,
    ignores: NODE_FILES,
    languageOptions: { globals: globals.serviceworker },
  },
  {
    name: 'zeg/globals-node',
    files: NODE_FILES,
    languageOptions: { globals: globals.nodeBuiltin },
  },

  // The library does not write to the console.
  { name: 'zeg/library', files: ['src/**/*.js'], rules: { 'no-console': 'error' } },

  // The JavaScript code blocks in the Markdown files. A code block often shows only a part of a file.
  // For this reason, the rules for unknown names, unused names and unused expressions are off.
  // ESLint does not check the blocks with the tag jsx. The first block of README.md has the tag jsx, because
  // it shows six files with five default exports, and ESLint cannot parse it as one module (D-74).
  {
    name: 'zeg/markdown',
    files: ['**/*.md'],
    plugins: { markdown },
    processor: 'markdown/markdown',
  },
  {
    name: 'zeg/markdown-code-blocks',
    files: ['**/*.md/**'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-unused-expressions': 'off',
      'no-unassigned-vars': 'off',
    },
  },
]);

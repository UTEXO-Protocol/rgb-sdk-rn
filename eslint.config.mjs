import js from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

// Globals provided by the React Native (Hermes) runtime and polyfills used in
// src/. Declared inline to avoid an extra `globals` dependency.
const runtimeGlobals = {
  console: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  queueMicrotask: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  AbortController: 'readonly',
  fetch: 'readonly',
  Buffer: 'readonly',
  globalThis: 'readonly',
};

// Node globals for scripts, tests and tool configs.
const nodeGlobals = {
  ...runtimeGlobals,
  process: 'readonly',
  setImmediate: 'readonly',
  clearImmediate: 'readonly',
  structuredClone: 'readonly',
};

const commonJsGlobals = {
  ...nodeGlobals,
  require: 'readonly',
  module: 'writable',
  exports: 'writable',
  __dirname: 'readonly',
  __filename: 'readonly',
};

export default [
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: runtimeGlobals,
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier,
    },
    rules: {
      ...js.configs.recommended.rules,
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs', '*.config.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: nodeGlobals,
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: commonJsGlobals,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Core ESLint rules treat typed signatures, parameter properties and
      // overloads as unused variables/redeclarations.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      // tsc already reports real redeclarations; the lint rule would flag the
      // intentional `type X = ...; const X = {...} as const` enum pattern.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'lib/', 'dist/', 'examples/'],
  },
];

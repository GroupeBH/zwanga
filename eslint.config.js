// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', '.expo/**', 'docs/backend-examples/**'],
  },
  {
    files: ['tests/**/*.{js,cjs}'],
    // The regression suite runs in Node, not in the React Native runtime.
    languageOptions: { globals: { Buffer: 'readonly', __dirname: 'readonly' } },
  },
]);

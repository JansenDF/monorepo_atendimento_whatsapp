import { defineConfig } from 'eslint/config';
import nextTypescript from 'eslint-config-next/typescript';
import nextVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';
import baseConfig from '../../eslint.config.mjs';

export default defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTypescript,
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      next: {
        rootDir: '.',
      },
    },
  },
  {
    files: ['**/*.spec.ts'],
    languageOptions: {
      globals: globals.jest,
    },
  },
]);

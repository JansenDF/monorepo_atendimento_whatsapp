import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    '**/.next/**',
    '**/coverage/**',
    '**/dist/**',
    '**/node_modules/**',
    '**/generated/prisma/**',
    '**/next-env.d.ts',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
]);

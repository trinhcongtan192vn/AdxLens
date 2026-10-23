import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'docs/**',
      '.specify/**',
      '.claude/**',
      'infra/supabase/.temp/**',
      'packages/db/migrations/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  {
    // Script dòng lệnh được in ra console.
    files: ['scripts/**', '**/scripts/**', '**/*.config.*'],
    rules: { 'no-console': 'off' },
  },
  {
    // packages/core là logic thuần: không phụ thuộc Next.js hay BullMQ (CLAUDE.md).
    files: ['packages/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*', 'react', 'react-dom'],
              message: 'core không import Next.js/React.',
            },
            {
              group: ['bullmq'],
              message: 'core không import BullMQ; enqueue qua cổng được truyền vào.',
            },
            { group: ['@adxlens/web', '@adxlens/worker'], message: 'core không import từ apps.' },
          ],
        },
      ],
    },
  },
);

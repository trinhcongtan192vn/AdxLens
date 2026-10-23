import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: 'server-only', replacement: r('./tests/empty-module.ts') },
      { find: /^@\//, replacement: `${r('./apps/web/src')}/` },
    ],
  },
  test: {
    include: ['{apps,packages,scripts,tests}/**/*.test.ts', '{apps,packages}/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**', '**/*.spec.ts'],
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    // Test tích hợp dùng chung một database test; chạy tuần tự để không giẫm dữ liệu.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['packages/core/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});

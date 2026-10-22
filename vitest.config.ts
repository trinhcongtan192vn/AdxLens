import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages,scripts}/**/*.test.ts', '{apps,packages}/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/e2e/**'],
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

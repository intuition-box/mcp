import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
      include: ['src/algorithms/**', 'src/indexer/**', 'src/graph/**'],
      exclude: ['src/index.ts'],
    },
    testTimeout: 10000,
  },
});

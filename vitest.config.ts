import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@abk/kernel': path.resolve(__dirname, 'packages/kernel/src/index.ts'),
      '@abk/bridge': path.resolve(__dirname, 'packages/bridge/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});

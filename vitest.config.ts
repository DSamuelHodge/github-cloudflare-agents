import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/dist/**', '**/*.spec.js', '**/*.test.js', 'dist/**'],
  },
});

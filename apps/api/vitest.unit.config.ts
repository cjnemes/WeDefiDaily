import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // No database setup for unit tests
    testTimeout: 10000,
    hookTimeout: 10000,
    include: [
      'src/**/*.{test,spec}.{js,ts}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'src/test/integration.test.ts' // Exclude integration tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: [
        'src/**/*.ts'
      ],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/test/**/*',
        'src/**/*.d.ts',
        'node_modules/**'
      ],
      thresholds: {
        global: {
          branches: 75,
          functions: 75,
          lines: 75,
          statements: 75
        }
      }
    },
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  esbuild: {
    target: 'node18'
  }
});
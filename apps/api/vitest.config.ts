import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // No global setup files - tests will import what they need
    testTimeout: 10000, // 10 second timeout for most tests
    hookTimeout: 15000, // 15 second timeout for setup/teardown hooks
    include: [
      'src/**/*.{test,spec}.{js,ts}'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      '.next/**'
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
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    // Separate test environments
    pool: 'forks', // Use forks for better isolation
    poolOptions: {
      forks: {
        singleFork: true // Use single fork for database tests to avoid conflicts
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
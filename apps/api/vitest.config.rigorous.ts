import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    env: {
      // Core requirements for live integration tests
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://wedefi:replace-with-strong-password@localhost:5432/wedefidaily_test',

      // Minimal Alchemy config for Base chain tests
      ALCHEMY_BASE_RPC_URL: process.env.ALCHEMY_BASE_RPC_URL || 'https://base-mainnet.g.alchemy.com/v2/demo',
      ALCHEMY_API_KEY: process.env.ALCHEMY_API_KEY || 'demo-key',

      // Optional environment variables with fallbacks
      SUPPORTED_CHAIN_IDS: '8453',
      ALCHEMY_TIER: 'free',
      ALCHEMY_MAX_REQUESTS_PER_SECOND: '25',
      ALCHEMY_MAX_COMPUTE_UNITS_PER_SECOND: '100',
      ENABLE_FALLBACK_PROVIDERS: 'false',

      // CoinGecko defaults
      COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',

      // Disable other integrations not needed for rigorous tests
      AERODROME_SUBGRAPH_URL: 'https://api.studio.thegraph.com/query/52327/aerodrome-v2/version/latest',
      THENA_SUBGRAPH_URL: 'https://api.thegraph.com/subgraphs/name/thena/bsc-v1',

      // Enable live API tests specifically
      RUN_LIVE_API_TESTS: 'true',
    },
    include: [
      'src/test/live-integration-validation.test.ts',
      'src/test/data-source-authentication.test.ts',
      'src/test/mock-detection-validation.test.ts'
    ],
    testTimeout: 60000, // Extended timeout for blockchain calls
    threads: false, // Disable threading for consistent environment
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
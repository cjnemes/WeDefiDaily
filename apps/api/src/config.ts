import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
      message: 'DATABASE_URL must be a Postgres connection string.',
    }),

  // API Configuration
  NEXT_PUBLIC_API_URL: z.string().optional(),

  // Alchemy Configuration (Enhanced)
  ALCHEMY_BASE_RPC_URL: z.string().url().optional(),
  ALCHEMY_ETH_RPC_URL: z.string().url().optional(),
  ALCHEMY_BSC_RPC_URL: z.string().url().optional(),
  ALCHEMY_TIER: z.enum(['free', 'growth', 'scale']).default('free'),
  ALCHEMY_MAX_REQUESTS_PER_SECOND: z.coerce.number().positive().default(25),
  ALCHEMY_MAX_COMPUTE_UNITS_PER_SECOND: z.coerce.number().positive().default(100),

  // Fallback RPC URLs
  FALLBACK_ETH_RPC_URLS: z.string().optional().transform(str =>
    str ? str.split(',').map(url => url.trim()).filter(Boolean) : []
  ),
  FALLBACK_BASE_RPC_URLS: z.string().optional().transform(str =>
    str ? str.split(',').map(url => url.trim()).filter(Boolean) : []
  ),
  FALLBACK_BSC_RPC_URLS: z.string().optional().transform(str =>
    str ? str.split(',').map(url => url.trim()).filter(Boolean) : []
  ),

  // Pricing APIs
  COINMARKETCAP_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  COINGECKO_API_URL: z.string().url().default('https://api.coingecko.com/api/v3'),

  // Block Explorers
  ETHERSCAN_API_KEY: z.string().optional(),
  BASESCAN_API_KEY: z.string().optional(),
  BSCSCAN_API_KEY: z.string().optional(),

  // Protocol APIs
  AERODROME_API_URL: z.string().optional(),
  AERODROME_SUBGRAPH_URL: z.string().url().default('https://api.studio.thegraph.com/query/52327/aerodrome-v2/version/latest'),
  THENA_API_URL: z.string().optional(),
  THENA_SUBGRAPH_URL: z.string().url().default('https://api.thegraph.com/subgraphs/name/thena/bsc-v1'),
  GAMMASWAP_API_URL: z.string().optional(),
  THE_GRAPH_API_KEY: z.string().optional(),

  // Operational Configuration
  GOVERNANCE_REFRESH_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
  BALANCE_SYNC_INTERVAL_MINUTES: z.coerce.number().int().positive().default(5),
  PRICE_REFRESH_INTERVAL_MINUTES: z.coerce.number().int().positive().default(1),

  // Cache Configuration
  ENABLE_MEMORY_CACHE: z.coerce.boolean().default(true),
  CACHE_TOKEN_METADATA_TTL_HOURS: z.coerce.number().positive().default(24),
  CACHE_BALANCE_TTL_MINUTES: z.coerce.number().positive().default(5),
  CACHE_PRICE_TTL_MINUTES: z.coerce.number().positive().default(1),

  // Monitoring & Alerting
  ALERT_CHANNEL_FILTER: z.string().optional(),
  ENABLE_HEALTH_CHECKS: z.coerce.boolean().default(true),
  HEALTH_CHECK_INTERVAL_SECONDS: z.coerce.number().positive().default(30),
  MONITORING_RETENTION_DAYS: z.coerce.number().positive().default(30),

  // Error Handling & Retry Configuration
  MAX_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().positive().default(1000),
  RETRY_MAX_DELAY_MS: z.coerce.number().positive().default(30000),
  REQUEST_TIMEOUT_MS: z.coerce.number().positive().default(30000),

  // Data Storage
  DIGEST_OUTPUT_DIR: z.string().default('storage/digests'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Security
  API_RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().positive().default(100),
  ENABLE_API_KEY_ROTATION: z.coerce.boolean().default(false),
  API_KEY_ROTATION_DAYS: z.coerce.number().positive().default(30),

  // Feature Flags
  ENABLE_FALLBACK_PROVIDERS: z.coerce.boolean().default(true),
  ENABLE_BATCH_REQUESTS: z.coerce.boolean().default(true),
  ENABLE_REQUEST_CACHING: z.coerce.boolean().default(true),
  ENABLE_METRICS_COLLECTION: z.coerce.boolean().default(true),

  // Chain Configuration
  SUPPORTED_CHAIN_IDS: z.string().default('1,8453').transform(str =>
    str.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
  ),
})
.refine(data => {
  // Skip strict RPC URL validation in test environment
  if (data.NODE_ENV === 'test') {
    return true;
  }

  // Validate that we have RPC URLs for supported chains in non-test environments
  const missingUrls: string[] = [];

  if (data.SUPPORTED_CHAIN_IDS.includes(1) && !data.ALCHEMY_ETH_RPC_URL) {
    missingUrls.push('ALCHEMY_ETH_RPC_URL for Ethereum');
  }

  if (data.SUPPORTED_CHAIN_IDS.includes(8453) && !data.ALCHEMY_BASE_RPC_URL) {
    missingUrls.push('ALCHEMY_BASE_RPC_URL for Base');
  }

  if (data.SUPPORTED_CHAIN_IDS.includes(56) && !data.ALCHEMY_BSC_RPC_URL) {
    missingUrls.push('ALCHEMY_BSC_RPC_URL for BSC');
  }

  return missingUrls.length === 0;
}, {
  message: 'Missing required RPC URLs for supported chains',
})
.refine(data => {
  // Warn if no pricing API keys are configured
  if (!data.COINGECKO_API_KEY && !data.COINMARKETCAP_API_KEY) {
    console.warn('No pricing API keys configured. Price data will be limited.');
  }
  return true;
});

export const env = envSchema.parse(process.env);

// Validate production-specific requirements
if (env.NODE_ENV === 'production') {
  const productionWarnings: string[] = [];

  if (env.ALCHEMY_TIER === 'free') {
    productionWarnings.push('Using free Alchemy tier in production may hit rate limits');
  }

  if (!env.COINGECKO_API_KEY && !env.COINMARKETCAP_API_KEY) {
    productionWarnings.push('No pricing API keys configured for production');
  }

  if (!env.ENABLE_FALLBACK_PROVIDERS) {
    productionWarnings.push('Fallback providers disabled in production');
  }

  if (productionWarnings.length > 0) {
    console.warn('Production configuration warnings:');
    productionWarnings.forEach(warning => console.warn(`  - ${warning}`));
  }
}

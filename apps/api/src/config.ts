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
  NEXT_PUBLIC_API_URL: z.string().optional(),
  ALCHEMY_BASE_RPC_URL: z.string().optional(),
  ALCHEMY_ETH_RPC_URL: z.string().optional(),
  COINMARKETCAP_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  ETHERSCAN_API_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

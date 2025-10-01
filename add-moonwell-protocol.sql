-- Add Moonwell protocol to the database
-- This can be run manually or via prisma migrate

-- Ensure Base chain exists
INSERT INTO "Chain" (id, name, "shortName", "nativeCurrencySymbol", "explorerUrl", "createdAt", "updatedAt")
VALUES (8453, 'Base', 'base', 'ETH', 'https://basescan.org', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Add Moonwell protocol
INSERT INTO "Protocol" (id, slug, name, "chainId", website, metadata, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'moonwell',
  'Moonwell',
  8453,
  'https://moonwell.fi',
  '{"type": "lending", "governance": "stkWELL", "contracts": {"well": "0xA88594D404727625A9437C3f886C7643872296AE", "stkWELL": "0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17"}}'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  website = EXCLUDED.website,
  metadata = EXCLUDED.metadata,
  "updatedAt" = NOW();

-- Add WELL token
INSERT INTO "Token" (id, "chainId", address, symbol, name, decimals, "isNative", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  8453,
  '0xa88594d404727625a9437c3f886c7643872296ae',
  'WELL',
  'Moonwell',
  18,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("chainId", address) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  name = EXCLUDED.name,
  "updatedAt" = NOW();

-- Add stkWELL token (staked WELL)
INSERT INTO "Token" (id, "chainId", address, symbol, name, decimals, "isNative", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  8453,
  '0xe66e3a37c3274ac24fe8590f7d84a2427194dc17',
  'stkWELL',
  'Staked Moonwell',
  18,
  false,
  NOW(),
  NOW()
)
ON CONFLICT ("chainId", address) DO UPDATE SET
  symbol = EXCLUDED.symbol,
  name = EXCLUDED.name,
  "updatedAt" = NOW();

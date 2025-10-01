import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding Moonwell protocol to database...');

  // Ensure Base chain exists
  await prisma.chain.upsert({
    where: { id: 8453 },
    update: {},
    create: {
      id: 8453,
      name: 'Base',
      shortName: 'base',
      nativeCurrencySymbol: 'ETH',
      explorerUrl: 'https://basescan.org',
    },
  });
  console.log('✓ Base chain ensured');

  // Add Moonwell protocol
  const protocol = await prisma.protocol.upsert({
    where: { slug: 'moonwell' },
    update: {
      name: 'Moonwell',
      website: 'https://moonwell.fi',
      metadata: {
        type: 'lending',
        governance: 'stkWELL',
        contracts: {
          well: '0xA88594D404727625A9437C3f886C7643872296AE',
          stkWELL: '0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17',
          temporalGovernor: '0x8b621804a7637b781e2BbD58e256a591F2dF7d51',
          comptroller: '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C',
        },
      },
    },
    create: {
      slug: 'moonwell',
      name: 'Moonwell',
      chainId: 8453,
      website: 'https://moonwell.fi',
      metadata: {
        type: 'lending',
        governance: 'stkWELL',
        contracts: {
          well: '0xA88594D404727625A9437C3f886C7643872296AE',
          stkWELL: '0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17',
          temporalGovernor: '0x8b621804a7637b781e2BbD58e256a591F2dF7d51',
          comptroller: '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C',
        },
      },
    },
  });
  console.log(`✓ Moonwell protocol created/updated: ${protocol.id}`);

  // Add WELL token
  const wellToken = await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId: 8453,
        address: '0xa88594d404727625a9437c3f886c7643872296ae',
      },
    },
    update: {
      symbol: 'WELL',
      name: 'Moonwell',
    },
    create: {
      chainId: 8453,
      address: '0xa88594d404727625a9437c3f886c7643872296ae',
      symbol: 'WELL',
      name: 'Moonwell',
      decimals: 18,
      isNative: false,
    },
  });
  console.log(`✓ WELL token created/updated: ${wellToken.id}`);

  // Add stkWELL token (staked WELL)
  const stkWellToken = await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId: 8453,
        address: '0xe66e3a37c3274ac24fe8590f7d84a2427194dc17',
      },
    },
    update: {
      symbol: 'stkWELL',
      name: 'Staked Moonwell',
    },
    create: {
      chainId: 8453,
      address: '0xe66e3a37c3274ac24fe8590f7d84a2427194dc17',
      symbol: 'stkWELL',
      name: 'Staked Moonwell',
      decimals: 18,
      isNative: false,
    },
  });
  console.log(`✓ stkWELL token created/updated: ${stkWellToken.id}`);

  console.log('\n✅ Moonwell protocol successfully added to database!');
}

main()
  .catch((error) => {
    console.error('Error adding Moonwell protocol:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

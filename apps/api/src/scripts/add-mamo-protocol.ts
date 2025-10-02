import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Adding MAMO protocol to database...');

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

  // Add MAMO protocol
  const protocol = await prisma.protocol.upsert({
    where: { slug: 'mamo' },
    update: {
      name: 'MAMO',
      website: 'https://mamo.bot',
      metadata: {
        type: 'yield-aggregator',
        governance: 'MAMO',
        contracts: {
          mamoToken: '0x7300B37DfdfAb110d83290A29DfB31B1740219fE',
          registry: '0x46a5624C2ba92c08aBA4B206297052EDf14baa92',
          mamoStakingFactory: '0xd034Bf87003A216F9A451A55A2f4f7176AAE23C8',
          usdcStrategyFactory: '0x1Eeb3FD8C8302dAf6BC265a6B8a5C397d89DE286',
          cbBTCStrategyFactory: '0x20C444BEd40faFee49222eE9A480937b825282DC',
        },
      },
    },
    create: {
      slug: 'mamo',
      name: 'MAMO',
      chainId: 8453,
      website: 'https://mamo.bot',
      metadata: {
        type: 'yield-aggregator',
        governance: 'MAMO',
        contracts: {
          mamoToken: '0x7300B37DfdfAb110d83290A29DfB31B1740219fE',
          registry: '0x46a5624C2ba92c08aBA4B206297052EDf14baa92',
          mamoStakingFactory: '0xd034Bf87003A216F9A451A55A2f4f7176AAE23C8',
          usdcStrategyFactory: '0x1Eeb3FD8C8302dAf6BC265a6B8a5C397d89DE286',
          cbBTCStrategyFactory: '0x20C444BEd40faFee49222eE9A480937b825282DC',
        },
      },
    },
  });
  console.log(`✓ MAMO protocol created/updated: ${protocol.id}`);

  // Add MAMO token
  const mamoToken = await prisma.token.upsert({
    where: {
      chainId_address: {
        chainId: 8453,
        address: '0x7300b37dfdfab110d83290a29dfb31b1740219fe',
      },
    },
    update: {
      symbol: 'MAMO',
      name: 'MAMO',
    },
    create: {
      chainId: 8453,
      address: '0x7300b37dfdfab110d83290a29dfb31b1740219fe',
      symbol: 'MAMO',
      name: 'MAMO',
      decimals: 18,
      isNative: false,
    },
  });
  console.log(`✓ MAMO token created/updated: ${mamoToken.id}`);

  console.log('\n✅ MAMO protocol successfully added to database!');
}

main()
  .catch((error) => {
    console.error('Error adding MAMO protocol:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

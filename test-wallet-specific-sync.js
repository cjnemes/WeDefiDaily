const { PrismaClient } = require('@prisma/client');
const { getNormalizedBalances } = require('./apps/api/src/services/alchemy');
const { defaultPricingService } = require('./apps/api/src/services/pricing');

const prisma = new PrismaClient();

async function syncSingleWallet() {
  const walletAddress = '0x7fb6936e97054768073376c4a7a6b0676babb5a5';
  const rpcUrl = process.env.ALCHEMY_BASE_RPC_URL;

  const wallet = await prisma.wallet.findFirst({
    where: { address: walletAddress }
  });

  if (!wallet) {
    console.log('Wallet not found');
    return;
  }

  console.log(`Testing pricing for wallet ${walletAddress}`);

  // Get specific target tokens
  const targetSymbols = ['AERO', 'MORPHO', 'DRV'];
  const tokenBalances = await prisma.tokenBalance.findMany({
    where: {
      walletId: wallet.id,
      token: {
        symbol: {
          in: targetSymbols
        }
      }
    },
    include: { token: true }
  });

  console.log(`Found ${tokenBalances.length} target tokens in database`);

  // Create token identifiers for pricing
  const tokenIdentifiers = tokenBalances.map(balance => ({
    chainId: balance.token.chainId,
    address: balance.token.address,
    symbol: balance.token.symbol,
    tokenId: balance.tokenId,
    isNative: balance.token.isNative
  }));

  console.log('\nTesting pricing service with tokens:');
  tokenIdentifiers.forEach(token => {
    console.log(`  ${token.symbol} (${token.address.slice(0,10)}...)`);
  });

  try {
    console.log('\n=== Calling Pricing Service ===');
    const priceMap = await defaultPricingService.fetchTokenPrices(tokenIdentifiers);

    console.log(`\n✅ Got ${priceMap.size} prices:`);
    for (const [key, price] of priceMap) {
      console.log(`  ${key}: $${price.toString()}`);
    }

    if (priceMap.size === 0) {
      console.log('\n❌ No prices returned from pricing service');
    }

  } catch (error) {
    console.error('Pricing test failed:', error);
  }
}

syncSingleWallet()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
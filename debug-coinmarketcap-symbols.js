const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function debugSymbols() {
  console.log('=== DEBUG: CoinMarketCap Symbol Matching ===\n');

  // Get the main wallet
  const wallet = await prisma.wallet.findFirst({
    where: {
      address: '0x7fb6936e97054768073376c4a7a6b0676babb5a5'
    }
  });

  if (!wallet) {
    console.log('Main wallet not found');
    return;
  }

  // Get all tokens for this wallet
  const tokens = await prisma.tokenBalance.findMany({
    where: {
      walletId: wallet.id
    },
    include: {
      token: true
    }
  });

  console.log(`Total tokens in wallet: ${tokens.length}\n`);

  // Filter tokens the same way CoinMarketCap service does
  const contractTokens = tokens.filter(balance => !balance.token.isNative);
  console.log(`Contract tokens (non-native): ${contractTokens.length}\n`);

  // Check the symbol filter logic from CoinMarketCap service
  const majorTokenSymbols = ['USDC', 'USDT', 'WETH', 'DAI', 'LINK', 'UNI', 'AAVE', 'COMP', 'MKR', 'SNX', 'CRV', 'SUSHI', 'YFI', 'BASED', 'VIRTUAL', 'AERO', 'MORPHO', 'DRV'];

  const tokensWithSymbols = contractTokens.filter(balance =>
    balance.token.symbol && majorTokenSymbols.includes(balance.token.symbol.toUpperCase())
  );

  console.log(`Tokens that should be sent to CoinMarketCap: ${tokensWithSymbols.length}`);
  console.log('Symbols being sent to CoinMarketCap:');
  tokensWithSymbols.forEach(balance => {
    console.log(`  - ${balance.token.symbol} (${balance.token.address})`);
  });

  console.log('\n=== Target tokens check ===');
  const targetTokens = ['AERO', 'MORPHO', 'DRV'];
  for (const symbol of targetTokens) {
    const found = tokens.find(balance =>
      balance.token.symbol?.toUpperCase() === symbol
    );

    if (found) {
      console.log(`✅ ${symbol}: Found with symbol "${found.token.symbol}" (${found.token.address})`);
      console.log(`   Quantity: ${found.quantity}, USD Value: ${found.usdValue || 'NULL'}`);
    } else {
      console.log(`❌ ${symbol}: Not found in wallet balances`);
    }
  }

  console.log('\n=== All tokens with matching symbols in major list ===');
  contractTokens.forEach(balance => {
    if (balance.token.symbol && majorTokenSymbols.includes(balance.token.symbol.toUpperCase())) {
      console.log(`  ${balance.token.symbol}: ${balance.quantity} (${balance.token.address.slice(0,10)}...)`);
    }
  });
}

debugSymbols()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
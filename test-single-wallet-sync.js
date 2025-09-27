const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testSingleWallet() {
  const wallet = await prisma.wallet.findFirst({
    where: {
      address: '0x7fb6936e97054768073376c4a7a6b0676babb5a5'
    },
    include: {
      balances: {
        include: {
          token: true
        }
      }
    }
  });

  if (!wallet) {
    console.log('Wallet not found');
    return;
  }

  console.log(`\nWallet: ${wallet.address}`);
  console.log(`Total balances: ${wallet.balances.length}`);

  // Check for our target tokens
  const targetTokens = ['AERO', 'MORPHO', 'DRV'];
  const foundTokens = wallet.balances.filter(balance =>
    targetTokens.includes(balance.token.symbol?.toUpperCase())
  );

  console.log(`\nTarget tokens found:`);
  foundTokens.forEach(balance => {
    console.log(`  ${balance.token.symbol}: ${balance.quantity} (USD: ${balance.usdValue || 'No USD value'})`);
  });

  // Show all tokens with symbols
  console.log(`\nAll tokens with symbols:`);
  wallet.balances
    .filter(b => b.token.symbol)
    .slice(0, 10)
    .forEach(balance => {
      console.log(`  ${balance.token.symbol}: ${balance.quantity} (USD: ${balance.usdValue || '$0.00'})`);
    });
}

testSingleWallet()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
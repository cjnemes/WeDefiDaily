const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const TARGET_TOKENS = {
  AERO: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
  MORPHO: '0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842',
  DRV_OLD: '0xb1d1eae60eea9525032a6dcb4c1ce336a1de71be',
  DRV_NEW: '0x9d0E8f5b25384C7310CB8C6aE32C8fbeb645d083'
};

const MAIN_WALLET = '0x7fb6936e97054768073376c4a7a6b0676babb5a5';
const CHAIN_ID = 8453;
const RPC_URL = process.env.ALCHEMY_BASE_RPC_URL;

async function checkDatabase() {
  console.log('=== DATABASE CHECK ===');

  // Check if tokens exist in database
  for (const [symbol, address] of Object.entries(TARGET_TOKENS)) {
    const token = await prisma.token.findUnique({
      where: {
        chainId_address: {
          chainId: CHAIN_ID,
          address: address.toLowerCase()
        }
      },
      include: {
        balances: {
          include: {
            wallet: true
          }
        }
      }
    });

    console.log(`\n${symbol} (${address}):`);
    if (!token) {
      console.log('  ❌ Not found in database');
    } else {
      console.log(`  ✅ Found in database: ${token.symbol} - ${token.name}`);
      if (token.balances.length === 0) {
        console.log('  📊 No balances recorded');
      } else {
        token.balances.forEach(balance => {
          console.log(`  📊 Balance: ${balance.quantity} in wallet ${balance.wallet.address.slice(0,8)}...`);
        });
      }
    }
  }
}

async function checkAlchemy() {
  console.log('\n=== ALCHEMY API CHECK ===');

  if (!RPC_URL) {
    console.log('❌ No Alchemy RPC URL configured');
    return;
  }

  try {
    console.log(`\nCalling Alchemy API directly for ${MAIN_WALLET}...`);

    // Direct Alchemy API call to check token balances
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 1,
        jsonrpc: '2.0',
        method: 'alchemy_getTokenBalances',
        params: [MAIN_WALLET, Object.values(TARGET_TOKENS)]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('❌ Alchemy API Error:', data.error);
      return;
    }

    console.log(`\nChecking specific token balances...`);

    // Check each target token
    for (let i = 0; i < Object.entries(TARGET_TOKENS).length; i++) {
      const [symbol, address] = Object.entries(TARGET_TOKENS)[i];
      const balance = data.result.tokenBalances[i];

      console.log(`\n${symbol} (${address}):`);

      if (!balance || balance.tokenBalance === '0x0' || balance.tokenBalance === null) {
        console.log('  ❌ Zero balance or not detected by Alchemy API');
      } else {
        const balanceValue = parseInt(balance.tokenBalance, 16);
        // Assume 18 decimals for calculation
        const humanReadable = (balanceValue / Math.pow(10, 18)).toFixed(6);
        console.log(`  ✅ Detected by Alchemy: ${balanceValue} raw units (≈${humanReadable} tokens)`);
      }
    }

  } catch (error) {
    console.error('❌ Alchemy API Error:', error.message);
  }
}

async function main() {
  try {
    await checkDatabase();
    await checkAlchemy();
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
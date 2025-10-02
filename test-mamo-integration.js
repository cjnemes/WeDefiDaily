/**
 * Integration test for MAMO staking detection
 * This script tests the actual smart contract integration
 */

import { config } from 'dotenv';
import { ethers } from 'ethers';
import Decimal from 'decimal.js';

config(); // Load .env file

const ALCHEMY_BASE_RPC_URL = process.env.ALCHEMY_BASE_RPC_URL;
const TEST_WALLET = '0x7fb6936e97054768073376c4a7a6b0676babb5a5'; // Your wallet

const MAMO_REGISTRY = '0x46a5624C2ba92c08aBA4B206297052EDf14baa92';
const MAMO_TOKEN = '0x7300B37DfdfAb110d83290A29DfB31B1740219fE';

async function testMamoIntegration() {
  console.log('🧪 Testing MAMO Integration\n');
  console.log(`Wallet: ${TEST_WALLET}`);
  console.log(`RPC: ${ALCHEMY_BASE_RPC_URL}\n`);

  const provider = new ethers.JsonRpcProvider(ALCHEMY_BASE_RPC_URL);

  // Step 1: Query MamoStrategyRegistry
  console.log('Step 1: Querying MamoStrategyRegistry...');
  const registryAbi = [
    'function getUserStrategies(address user) external view returns (address[])',
  ];
  const registry = new ethers.Contract(MAMO_REGISTRY, registryAbi, provider);

  const userStrategies = await registry.getUserStrategies(TEST_WALLET);
  console.log(`✓ Found ${userStrategies.length} strategy contract(s)`);

  if (userStrategies.length === 0) {
    console.log('✅ No MAMO positions detected (user has not staked)');
    return;
  }

  userStrategies.forEach((addr, i) => {
    console.log(`  [${i}] ${addr}`);
  });

  // Step 2: Check MAMO balance in each strategy
  console.log('\nStep 2: Checking MAMO token balances...');
  const erc20Abi = [
    'function balanceOf(address account) view returns (uint256)',
    'function asset() view returns (address)',
  ];
  const mamoToken = new ethers.Contract(MAMO_TOKEN, erc20Abi, provider);

  let totalStaked = new Decimal(0);

  for (let i = 0; i < userStrategies.length; i++) {
    const strategyAddress = userStrategies[i];
    const balance = await mamoToken.balanceOf(strategyAddress);
    const balanceDecimal = new Decimal(balance.toString()).div(new Decimal(10).pow(18));

    // Try to identify strategy type
    const strategy = new ethers.Contract(strategyAddress, erc20Abi, provider);
    let assetAddress = 'unknown';
    try {
      assetAddress = await strategy.asset();
    } catch (e) {
      // Strategy might not have asset() function
    }

    const assetType =
      assetAddress.toLowerCase() === MAMO_TOKEN.toLowerCase() ? 'MAMO Account' :
      assetAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 'USDC Account' :
      assetAddress.toLowerCase() === '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf' ? 'cbBTC Account' :
      'Unknown';

    console.log(`  Strategy ${i} (${assetType}): ${balanceDecimal.toString()} MAMO`);
    totalStaked = totalStaked.plus(balanceDecimal);
  }

  // Step 3: Results
  console.log('\n📊 Results:');
  console.log(`Total MAMO Staked: ${totalStaked.toString()}`);
  console.log(`Voting Power: ${totalStaked.toString()} (1:1 ratio)`);

  if (totalStaked.isZero()) {
    console.log('⚠️  Warning: Strategies exist but no MAMO balance detected');
  } else {
    console.log('✅ MAMO staking integration working correctly!');
  }
}

testMamoIntegration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Error:', error.message);
    process.exit(1);
  });

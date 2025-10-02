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

  // Step 2: Check vault share balances (user owns vault shares, not direct tokens)
  console.log('\nStep 2: Checking vault shares owned by user...');
  const vaultAbi = [
    'function balanceOf(address account) view returns (uint256)',
    'function asset() view returns (address)',
    'function totalAssets() view returns (uint256)',
    'function convertToAssets(uint256 shares) view returns (uint256)',
  ];

  let totalMamoStaked = new Decimal(0);

  for (let i = 0; i < userStrategies.length; i++) {
    const strategyAddress = userStrategies[i];

    // The strategy contract is an ERC-4626 vault
    // User's wallet owns SHARES of this vault
    const vault = new ethers.Contract(strategyAddress, vaultAbi, provider);

    // Check how many vault shares the user owns
    const userShares = await vault.balanceOf(TEST_WALLET);
    const userSharesDecimal = new Decimal(userShares.toString()).div(new Decimal(10).pow(18));

    let assetAddress = 'unknown';
    let userAssetValue = new Decimal(0);

    try {
      // Get the underlying asset this vault holds
      assetAddress = await vault.asset();

      // Convert user's shares to underlying asset amount
      const assetAmount = await vault.convertToAssets(userShares);
      userAssetValue = new Decimal(assetAmount.toString()).div(new Decimal(10).pow(18));
    } catch (e) {
      console.error(`    Error querying vault ${i}:`, e.message);
    }

    const assetType =
      assetAddress.toLowerCase() === MAMO_TOKEN.toLowerCase() ? 'MAMO Account' :
      assetAddress.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' ? 'USDC Account' :
      assetAddress.toLowerCase() === '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf' ? 'cbBTC Account' :
      'Unknown';

    console.log(`  Strategy ${i} (${assetType}):`);
    console.log(`    Vault Address: ${strategyAddress}`);
    console.log(`    Asset Address: ${assetAddress}`);
    console.log(`    User Vault Shares: ${userSharesDecimal.toString()}`);
    console.log(`    User Asset Value: ${userAssetValue.toString()}`);

    // For MAMO Account vaults, count the user's asset value as staked MAMO
    if (assetType === 'MAMO Account' && !userAssetValue.isZero()) {
      totalMamoStaked = totalMamoStaked.plus(userAssetValue);
      console.log(`    ✓ Counted as MAMO staking: ${userAssetValue.toString()}`);
    }

    console.log('');
  }

  // Step 3: Results
  console.log('📊 Results:');
  console.log(`Total MAMO Staked: ${totalMamoStaked.toString()}`);
  console.log(`Voting Power: ${totalMamoStaked.toString()} (1:1 ratio)`);

  if (totalMamoStaked.isZero()) {
    console.log('⚠️  No MAMO staking detected');
    console.log('    (USDC/cbBTC accounts exist but no MAMO Account with deposits)');
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

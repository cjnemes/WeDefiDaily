#!/usr/bin/env node

// Debug governance sync configuration
import { env } from './apps/api/src/config.js';
import { fetchThenaLockEnhanced } from './apps/api/src/services/governance.js';

async function debugGovernanceConfig() {
  console.log('🔍 Debugging Governance Configuration');
  console.log('====================================');

  console.log('Environment Variables:');
  console.log('- ALCHEMY_BSC_RPC_URL:', env.ALCHEMY_BSC_RPC_URL ? 'SET' : 'NOT SET');
  console.log('- BSC_RPC_URL:', env.BSC_RPC_URL ? 'SET' : 'NOT SET');
  console.log('- SUPPORTED_CHAIN_IDS:', env.SUPPORTED_CHAIN_IDS);
  console.log('');

  const testWallet = '0x7fb6936e97054768073376c4a7a6b0676babb5a5';
  const bscRpcUrl = env.ALCHEMY_BSC_RPC_URL || env.BSC_RPC_URL;

  console.log('Testing fetchThenaLockEnhanced directly:');
  console.log('- API URL: null (Thena has no REST API)');
  console.log('- BSC RPC URL:', bscRpcUrl ? 'Available' : 'Missing');
  console.log('- Test Wallet:', testWallet);
  console.log('');

  if (bscRpcUrl) {
    try {
      console.log('⚡ Calling fetchThenaLockEnhanced...');
      const result = await fetchThenaLockEnhanced('', bscRpcUrl, testWallet);

      if (result) {
        console.log('✅ Success! Got veTHE data:');
        console.log('- Lock Amount:', result.lockAmount.toString());
        console.log('- Voting Power:', result.votingPower.toString());
        console.log('- Lock Ends At:', result.lockEndsAt?.toISOString() || 'Unknown');
        console.log('- Protocol:', result.protocolSlug);
      } else {
        console.log('❌ fetchThenaLockEnhanced returned null - no locks found');
      }
    } catch (error) {
      console.log('❌ fetchThenaLockEnhanced failed:', error.message);
    }
  } else {
    console.log('❌ No BSC RPC URL configured');
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  debugGovernanceConfig().catch(console.error);
}
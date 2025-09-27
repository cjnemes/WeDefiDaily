#!/usr/bin/env node

const ALCHEMY_BASE_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/hEMngnziJrsomB43ecfsI';
const ALCHEMY_ETH_RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/hEMngnziJrsomB43ecfsI';

async function testAlchemyAPI() {
  console.log('=== Alchemy API Integration Assessment ===\n');

  // Test Base chain connectivity
  console.log('1. Testing Base Chain Connectivity...');
  try {
    const baseResponse = await fetch(ALCHEMY_BASE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: []
      })
    });

    if (baseResponse.ok) {
      const baseData = await baseResponse.json();
      console.log('✅ Base chain connectivity: WORKING');
      console.log(`   Current block: ${parseInt(baseData.result, 16)}`);
    } else {
      console.log('❌ Base chain connectivity: FAILED');
      console.log(`   HTTP Status: ${baseResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Base chain connectivity: ERROR');
    console.log(`   Error: ${error.message}`);
  }

  // Test Ethereum chain connectivity
  console.log('\n2. Testing Ethereum Chain Connectivity...');
  try {
    const ethResponse = await fetch(ALCHEMY_ETH_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: []
      })
    });

    if (ethResponse.ok) {
      const ethData = await ethResponse.json();
      console.log('✅ Ethereum chain connectivity: WORKING');
      console.log(`   Current block: ${parseInt(ethData.result, 16)}`);
    } else {
      console.log('❌ Ethereum chain connectivity: FAILED');
      console.log(`   HTTP Status: ${ethResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Ethereum chain connectivity: ERROR');
    console.log(`   Error: ${error.message}`);
  }

  // Test enhanced API on Base (alchemy_getTokenBalances)
  console.log('\n3. Testing Enhanced API - Token Balances...');
  const testAddress = '0x742d35cc6634c0532925a3b844bc9e7595f0beb2'; // Real address from sync job

  try {
    const tokenResponse = await fetch(ALCHEMY_BASE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [testAddress, 'erc20']
      })
    });

    if (tokenResponse.ok) {
      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        console.log('❌ Enhanced API: ERROR');
        console.log(`   RPC Error: ${tokenData.error.message}`);
      } else {
        console.log('✅ Enhanced API (alchemy_getTokenBalances): WORKING');
        console.log(`   Token count: ${tokenData.result.tokenBalances.length}`);
        const nonZeroBalances = tokenData.result.tokenBalances.filter(t => t.tokenBalance !== '0x0');
        console.log(`   Non-zero balances: ${nonZeroBalances.length}`);
      }
    } else {
      console.log('❌ Enhanced API: FAILED');
      console.log(`   HTTP Status: ${tokenResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Enhanced API: ERROR');
    console.log(`   Error: ${error.message}`);
  }

  // Test token metadata API
  console.log('\n4. Testing Enhanced API - Token Metadata...');
  const USDC_BASE = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; // USDC on Base

  try {
    const metadataResponse = await fetch(ALCHEMY_BASE_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenMetadata',
        params: [USDC_BASE]
      })
    });

    if (metadataResponse.ok) {
      const metadataData = await metadataResponse.json();
      if (metadataData.error) {
        console.log('❌ Token Metadata API: ERROR');
        console.log(`   RPC Error: ${metadataData.error.message}`);
      } else {
        console.log('✅ Enhanced API (alchemy_getTokenMetadata): WORKING');
        console.log(`   Symbol: ${metadataData.result.symbol}`);
        console.log(`   Name: ${metadataData.result.name}`);
        console.log(`   Decimals: ${metadataData.result.decimals}`);
      }
    } else {
      console.log('❌ Token Metadata API: FAILED');
      console.log(`   HTTP Status: ${metadataResponse.status}`);
    }
  } catch (error) {
    console.log('❌ Token Metadata API: ERROR');
    console.log(`   Error: ${error.message}`);
  }

  // Test rate limiting by making rapid requests
  console.log('\n5. Testing Rate Limiting Behavior...');
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < 30; i++) {
    promises.push(
      fetch(ALCHEMY_BASE_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: i,
          method: 'eth_blockNumber',
          params: []
        })
      })
    );
  }

  try {
    const results = await Promise.allSettled(promises);
    const endTime = Date.now();
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    const failed = results.length - successful;

    console.log(`✅ Rate limiting test completed`);
    console.log(`   Total requests: ${results.length}`);
    console.log(`   Successful: ${successful}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Duration: ${endTime - startTime}ms`);
    console.log(`   Avg response time: ${(endTime - startTime) / results.length}ms`);

    // Check if any rate limit errors occurred
    const rateLimitErrors = results.filter(r =>
      r.status === 'fulfilled' && !r.value.ok && r.value.status === 429
    ).length;

    if (rateLimitErrors > 0) {
      console.log(`   Rate limit hits: ${rateLimitErrors}`);
    }
  } catch (error) {
    console.log('❌ Rate limiting test: ERROR');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n=== Assessment Complete ===');
}

testAlchemyAPI().catch(console.error);
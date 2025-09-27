#!/usr/bin/env node

// Test script to evaluate the Alchemy integration without database dependencies
const { createAlchemyService } = require('./apps/api/dist/services/alchemy-enhanced.js');

const ALCHEMY_BASE_RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/hEMngnziJrsomB43ecfsI';
const ALCHEMY_ETH_RPC_URL = 'https://eth-mainnet.g.alchemy.com/v2/hEMngnziJrsomB43ecfsI';

async function testErrorHandling() {
  console.log('=== Error Handling & Fallback Assessment ===\n');

  const alchemyService = createAlchemyService(ALCHEMY_BASE_RPC_URL, 'free');

  // Test 1: Invalid address handling
  console.log('1. Testing invalid address handling...');
  try {
    await alchemyService.getWalletTokenBalances('invalid-address');
    console.log('❌ Should have thrown an error for invalid address');
  } catch (error) {
    console.log('✅ Properly handles invalid address');
    console.log(`   Error type: ${error.constructor.name}`);
    console.log(`   Error message: ${error.message.substring(0, 100)}...`);
  }

  // Test 2: Non-existent contract metadata
  console.log('\n2. Testing non-existent contract handling...');
  try {
    const metadata = await alchemyService.getTokenMetadata('0x0000000000000000000000000000000000000000');
    console.log('✅ Handles non-existent contract gracefully');
    console.log(`   Returned: ${JSON.stringify(metadata)}`);
  } catch (error) {
    console.log('⚠️  Throws error for non-existent contract');
    console.log(`   Error: ${error.message.substring(0, 100)}...`);
  }

  // Test 3: Rate limiting behavior with rapid requests
  console.log('\n3. Testing rate limiting with burst requests...');
  const startTime = Date.now();
  const rapidRequests = [];

  for (let i = 0; i < 50; i++) {
    rapidRequests.push(
      alchemyService.getWalletNativeBalance('0x742d35cc6634c0532925a3b844bc9e7595f0beb2')
        .catch(error => ({ error: error.message }))
    );
  }

  const results = await Promise.allSettled(rapidRequests);
  const endTime = Date.now();

  const successful = results.filter(r => r.status === 'fulfilled' && !r.value.error).length;
  const rateLimited = results.filter(r =>
    r.status === 'fulfilled' && r.value.error && r.value.error.includes('rate')
  ).length;
  const otherErrors = results.filter(r =>
    r.status === 'fulfilled' && r.value.error && !r.value.error.includes('rate')
  ).length;

  console.log(`✅ Rate limiting test completed`);
  console.log(`   Duration: ${endTime - startTime}ms`);
  console.log(`   Successful: ${successful}/${results.length}`);
  console.log(`   Rate limited: ${rateLimited}/${results.length}`);
  console.log(`   Other errors: ${otherErrors}/${results.length}`);

  // Test 4: Metrics tracking
  console.log('\n4. Testing metrics tracking...');
  const metrics = alchemyService.getMetrics();
  console.log(`✅ Metrics tracking working`);
  console.log(`   Total requests: ${metrics.totalRequests}`);
  console.log(`   Compute units used: ${metrics.computeUnitsUsed}`);
  console.log(`   Rate limit hits: ${metrics.rateLimitHits}`);

  // Test 5: Batch metadata fetching
  console.log('\n5. Testing batch metadata fetching...');
  try {
    const testTokens = [
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC
      '0x4ed4e862860bed51a9570b96d89af5e1b0efefed', // DEGEN
      '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', // DAI
    ];

    const batchStart = Date.now();
    const metadataMap = await alchemyService.getTokenMetadataBatch(testTokens);
    const batchEnd = Date.now();

    console.log(`✅ Batch metadata fetching working`);
    console.log(`   Fetched metadata for ${metadataMap.size}/${testTokens.length} tokens`);
    console.log(`   Duration: ${batchEnd - batchStart}ms`);

    for (const [address, metadata] of metadataMap) {
      console.log(`   ${metadata.symbol || 'UNKNOWN'}: ${metadata.name || 'Unknown'}`);
    }
  } catch (error) {
    console.log('❌ Batch metadata fetching failed');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n=== Error Handling Assessment Complete ===');
}

// Test multi-chain support
async function testMultiChain() {
  console.log('\n=== Multi-Chain Support Assessment ===\n');

  const testWallet = '0x742d35cc6634c0532925a3b844bc9e7595f0beb2';

  // Base chain test
  console.log('1. Testing Base chain integration...');
  try {
    const baseService = createAlchemyService(ALCHEMY_BASE_RPC_URL, 'free');
    const baseBalance = await baseService.getWalletNativeBalance(testWallet);
    const baseTokens = await baseService.getWalletTokenBalances(testWallet);

    console.log('✅ Base chain working');
    console.log(`   Native balance: ${baseBalance.toString()}`);
    console.log(`   Token count: ${baseTokens.length}`);
  } catch (error) {
    console.log('❌ Base chain failed');
    console.log(`   Error: ${error.message}`);
  }

  // Ethereum chain test
  console.log('\n2. Testing Ethereum chain integration...');
  try {
    const ethService = createAlchemyService(ALCHEMY_ETH_RPC_URL, 'free');
    const ethBalance = await ethService.getWalletNativeBalance(testWallet);
    const ethTokens = await ethService.getWalletTokenBalances(testWallet);

    console.log('✅ Ethereum chain working');
    console.log(`   Native balance: ${ethBalance.toString()}`);
    console.log(`   Token count: ${ethTokens.length}`);
  } catch (error) {
    console.log('❌ Ethereum chain failed');
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n=== Multi-Chain Assessment Complete ===');
}

async function main() {
  try {
    await testErrorHandling();
    await testMultiChain();
  } catch (error) {
    console.error('Test failed:', error);
  }
}

main().catch(console.error);
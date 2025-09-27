#!/usr/bin/env node

// Simple test script to verify veTHE contract integration
const VETHE_CONTRACT = '0xfbbf371c9b0b994eebfcc977cef603f7f31c070d';
const BSC_RPC_URL = 'https://bnb-mainnet.g.alchemy.com/v2/hEMngnziJrsomB43ecfsI';
const TEST_WALLET = '0x7fb6936e97054768073376c4a7a6b0676babb5a5';

async function makeRpcCall(method, params = []) {
  const response = await fetch(BSC_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`RPC Error ${result.error.code}: ${result.error.message}`);
  }

  return result.result;
}

async function testVeTHEContract() {
  console.log('🔍 Testing veTHE Contract Integration');
  console.log('=====================================');
  console.log(`Contract: ${VETHE_CONTRACT}`);
  console.log(`Wallet: ${TEST_WALLET}`);
  console.log(`RPC: ${BSC_RPC_URL.replace(/\/[^\/]+$/, '/***')}`);
  console.log('');

  try {
    // Test 1: Get current block number
    console.log('📦 Testing BSC connection...');
    const blockNumber = await makeRpcCall('eth_blockNumber');
    console.log(`✅ Connected to BSC, current block: ${parseInt(blockNumber, 16)}`);
    console.log('');

    // Test 2: Check if contract exists
    console.log('🔍 Testing contract existence...');
    const contractCode = await makeRpcCall('eth_getCode', [VETHE_CONTRACT, 'latest']);

    if (contractCode === '0x') {
      console.log('❌ veTHE contract not found or has no code');
      return;
    } else {
      console.log('✅ veTHE contract exists and has code');
      console.log(`   Code length: ${contractCode.length} characters`);
    }
    console.log('');

    // Test 3: Try balanceOf call
    console.log('📊 Testing balanceOf(address) call...');
    const balanceOfSelector = '0x70a08231'; // balanceOf(address)
    const encodedAddress = TEST_WALLET.slice(2).padStart(64, '0');

    try {
      const balanceResult = await makeRpcCall('eth_call', [
        {
          to: VETHE_CONTRACT,
          data: balanceOfSelector + encodedAddress
        },
        'latest'
      ]);

      const balance = parseInt(balanceResult, 16);
      console.log(`✅ balanceOf call successful!`);
      console.log(`   veTHE NFT balance: ${balance}`);

      if (balance > 0) {
        console.log(`🎉 Found ${balance} veTHE NFT(s) for this wallet!`);

        // Test 4: Try to get first token ID
        console.log('');
        console.log('🔢 Testing tokenOfOwnerByIndex(address, 0)...');
        const tokenByIndexSelector = '0x2f745c59'; // tokenOfOwnerByIndex(address,uint256)
        const encodedIndex = '0'.padStart(64, '0');

        const tokenIdResult = await makeRpcCall('eth_call', [
          {
            to: VETHE_CONTRACT,
            data: tokenByIndexSelector + encodedAddress + encodedIndex
          },
          'latest'
        ]);

        const tokenId = BigInt(tokenIdResult).toString();
        console.log(`✅ First token ID: ${tokenId}`);

        // Test 5: Try to get lock info for first token
        console.log('');
        console.log(`🔒 Testing locked(${tokenId})...`);
        const lockedSelector = '0x4a4fbeec'; // locked(uint256)
        const encodedTokenId = BigInt(tokenId).toString(16).padStart(64, '0');

        try {
          const lockedResult = await makeRpcCall('eth_call', [
            {
              to: VETHE_CONTRACT,
              data: lockedSelector + encodedTokenId
            },
            'latest'
          ]);

          console.log(`✅ locked() call successful!`);
          console.log(`   Raw result: ${lockedResult}`);

          // Parse the result
          const amountHex = lockedResult.slice(0, 66);
          const endHex = '0x' + lockedResult.slice(66, 130);

          let amount = BigInt(amountHex);
          // Handle signed int128
          if (amount > BigInt('0x7fffffffffffffffffffffffffffffff')) {
            amount = amount - BigInt('0x100000000000000000000000000000000');
          }

          const end = parseInt(endHex, 16);
          const endDate = new Date(end * 1000);
          const amountInTHE = Number(amount) / 1e18;

          console.log(`   Lock amount: ${amountInTHE.toFixed(4)} THE`);
          console.log(`   Lock ends: ${endDate.toISOString()} (${end})`);
          console.log(`   Currently: ${end > Date.now() / 1000 ? '🔒 LOCKED' : '🔓 EXPIRED'}`);

        } catch (error) {
          console.log(`❌ locked() call failed: ${error.message}`);
        }

      } else {
        console.log('ℹ️  No veTHE NFTs found for this wallet');
      }

    } catch (error) {
      console.log(`❌ balanceOf call failed: ${error.message}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testVeTHEContract().catch(console.error);
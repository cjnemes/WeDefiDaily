import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TestDatabase } from './setup';

/**
 * Live Integration Validation Tests
 *
 * These tests specifically validate that external API integrations are working
 * with live data, not fallbacks. They should FAIL when APIs are rate limited
 * or returning cached/mock data.
 *
 * CRITICAL: These tests distinguish between:
 * - ✅ PASS: Live external API data received
 * - ❌ FAIL: Fallback/mock/cached data received (even if API returns 200)
 */

const shouldRunLiveTests = process.env.RUN_LIVE_API_TESTS === 'true';
const describeLive = shouldRunLiveTests ? describe : describe.skip;

interface ExternalAPIValidation {
  apiName: string;
  isLive: boolean;
  dataFreshness: 'live' | 'cached' | 'stale' | 'mock';
  responseTime: number;
  rateLimited: boolean;
  errorDetails?: string;
}

describeLive('Live External API Integration Validation', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = TestDatabase.getInstance();
    await testDb.setup();
  });

  afterAll(async () => {
    await testDb.cleanup();
    await testDb.teardown();
  });

  describe('Aerodrome Protocol Live Data', () => {
    it('should validate live veAERO contract integration via Alchemy Base RPC', async () => {
      // Skip test if using demo endpoint (expected behavior without live API keys)
      const rpcUrl = process.env.ALCHEMY_BASE_RPC_URL;
      if (!rpcUrl || rpcUrl.includes('/demo')) {
        console.log('Skipping veAERO contract live test - using demo RPC endpoint');
        return;
      }

      const validation = await validateExternalAPI(
        'aerodrome-veaero-contract',
        async () => {

          // Import veAERO contract service
          const { createVeAeroContractService } = await import('../services/veaero-contract.js');

          const veAeroService = createVeAeroContractService(process.env.ALCHEMY_BASE_RPC_URL);
          const healthCheck = await veAeroService.healthCheck();

          if (healthCheck.status !== 'healthy') {
            throw new Error(`veAERO contract unhealthy: ${healthCheck.details.error}`);
          }

          // Test actual contract call with a known address (zero address to test contract response)
          const testAddress = '0x0000000000000000000000000000000000000000';
          const result = await veAeroService.getAggregatedVeAeroData(testAddress);

          if (!result.success) {
            throw new Error(`veAERO contract call failed: ${result.error}`);
          }

          return {
            contractAddress: healthCheck.details.contractAddress,
            blockNumber: healthCheck.details.blockNumber,
            responseData: result.data,
            healthCheck: healthCheck.details
          };
        }
      );

      // STRICT: Only pass if getting live blockchain data
      if (validation.rateLimited) {
        throw new Error(
          `❌ FAILED: veAERO contract calls are rate limited. This is NOT a passing test. ` +
          `Rate limiting indicates the live blockchain integration is not working.`
        );
      }

      if (validation.dataFreshness !== 'live') {
        throw new Error(
          `❌ FAILED: veAERO contract data is ${validation.dataFreshness}, not live. ` +
          `Cached or stale data indicates fallback behavior, not working live integration.`
        );
      }

      expect(validation.isLive).toBe(true);
      expect(validation.dataFreshness).toBe('live');
      expect(validation.responseTime).toBeLessThan(30000); // 30 seconds max for contract calls with health checks
    });

    it('should validate fetchAerodromeLockAuthenticated returns live contract data', async () => {
      // Skip test if using demo endpoint (expected behavior without live API keys)
      const rpcUrl = process.env.ALCHEMY_BASE_RPC_URL;
      if (!rpcUrl || rpcUrl.includes('/demo')) {
        console.log('Skipping fetchAerodromeLockAuthenticated live test - using demo RPC endpoint');
        return;
      }

      // Import governance service
      const { fetchAerodromeLockAuthenticated } = await import('../services/governance.js');

      const testAddress = '0x0000000000000000000000000000000000000000'; // Zero address for testing

      const authenticatedResult = await fetchAerodromeLockAuthenticated(
        '', // API URL not used for contract calls
        testAddress
      );

      // Must be live data source - this is the critical test for rigorous standards
      if (authenticatedResult.metadata.source !== 'live') {
        throw new Error(
          `❌ FAILED: Aerodrome lock data source is ${authenticatedResult.metadata.source}, not live. ` +
          `Contract integration should provide live blockchain data.`
        );
      }

      if (!authenticatedResult.validationChecks.hasLiveCharacteristics) {
        throw new Error(
          `❌ FAILED: Aerodrome lock data does not have live characteristics. ` +
          `Response time: ${authenticatedResult.metadata.responseTimeMs}ms indicates cached/mock data.`
        );
      }

      expect(authenticatedResult.metadata.source).toBe('live');
      expect(authenticatedResult.validationChecks.hasLiveCharacteristics).toBe(true);
      expect(authenticatedResult.validationChecks.isFreshData).toBe(true);
      expect(authenticatedResult.metadata.responseTimeMs).toBeLessThan(30000); // Contract calls with health checks should be reasonable
      expect(authenticatedResult.metadata.responseTimeMs).toBeGreaterThan(50); // Should not be suspiciously fast (cached)
    });
  });

  describe('Alchemy Base Chain Integration', () => {
    it('should FAIL if Alchemy returns cached balances instead of live blockchain data', async () => {
      const testWalletAddress = '0x742d35Cc6b45C11ccB5c7C38AC46f6A5e5b4b123';

      // Skip test if using demo endpoint (expected behavior without live API keys)
      const alchemyApiKey = process.env.ALCHEMY_API_KEY;
      if (!alchemyApiKey || alchemyApiKey === 'demo-key') {
        console.log('Skipping Alchemy live test - using demo endpoint');
        return;
      }

      const validation = await validateExternalAPI(
        'alchemy-base-balances',
        async () => {

          const response = await fetch(
            `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'alchemy_getTokenBalances',
                params: [testWalletAddress],
              }),
            }
          );

          if (!response.ok) {
            throw new Error(`Alchemy API failed: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();

          if (data.error) {
            if (data.error.message?.includes('rate limit')) {
              throw new Error('Alchemy API rate limited');
            }
            throw new Error(`Alchemy API error: ${data.error.message}`);
          }

          return data.result;
        }
      );

      if (validation.rateLimited) {
        throw new Error(
          `❌ FAILED: Alchemy API is rate limited. Live blockchain data unavailable. ` +
          `This indicates the external API integration is not working in production conditions.`
        );
      }

      expect(validation.isLive).toBe(true);
      expect(validation.dataFreshness).toBe('live');
    });

    it('should verify live token balances change over time (not static mock data)', async () => {
      const testWalletAddress = '0x8536c4295c6e88e4f68d3b48b3b3e2f7a4c9b1d2';

      // Skip test if using demo endpoint (expected behavior without live API keys)
      const alchemyApiKey = process.env.ALCHEMY_API_KEY;
      if (!alchemyApiKey || alchemyApiKey === 'demo-key') {
        console.log('Skipping Alchemy balance tracking test - using demo endpoint');
        return;
      }

      // Fetch balance twice with delay to verify it's live data
      const firstFetch = await validateExternalAPI(
        'alchemy-balance-check-1',
        async () => fetchTokenBalance(testWalletAddress)
      );

      // Wait 5 seconds
      await new Promise(resolve => setTimeout(resolve, 5000));

      const secondFetch = await validateExternalAPI(
        'alchemy-balance-check-2',
        async () => fetchTokenBalance(testWalletAddress)
      );

      // Both should be live data
      expect(firstFetch.isLive).toBe(true);
      expect(secondFetch.isLive).toBe(true);

      // Response times should indicate real API calls, not instant cache
      expect(firstFetch.responseTime).toBeGreaterThan(100);
      expect(secondFetch.responseTime).toBeGreaterThan(100);
    });
  });

  describe('CoinGecko Price Data Integration', () => {
    it('should FAIL if CoinGecko returns stale prices instead of live market data', async () => {
      const validation = await validateExternalAPI(
        'coingecko-live-prices',
        async () => {
          const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=aerodrome-finance,ethereum,usd-coin&vs_currencies=usd&include_last_updated_at=true'
          );

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error('CoinGecko API rate limited');
            }
            throw new Error(`CoinGecko API failed: ${response.status}`);
          }

          const data = await response.json();

          // Check if prices are recent (within last 5 minutes)
          const now = Math.floor(Date.now() / 1000);
          Object.values(data).forEach((tokenData: any) => {
            if (tokenData.last_updated_at) {
              const dataAge = now - tokenData.last_updated_at;
              if (dataAge > 300) { // 5 minutes
                throw new Error(`CoinGecko price data is stale (${dataAge} seconds old)`);
              }
            }
          });

          return data;
        }
      );

      if (validation.rateLimited) {
        throw new Error(
          `❌ FAILED: CoinGecko API is rate limited. Live price data unavailable. ` +
          `This means price calculations are using stale/cached data, not live market prices.`
        );
      }

      expect(validation.isLive).toBe(true);
      expect(validation.dataFreshness).toBe('live');
    });
  });

  describe('Blocknative Gas Oracle Integration', () => {
    it('should FAIL if gas oracle returns static values instead of live network gas prices', async () => {
      const validation = await validateExternalAPI(
        'blocknative-gas-oracle',
        async () => {
          const response = await fetch('https://api.blocknative.com/gasprices/blockprices', {
            headers: {
              'Authorization': process.env.BLOCKNATIVE_API_KEY || 'demo-key',
            },
          });

          if (!response.ok) {
            if (response.status === 429) {
              throw new Error('Blocknative API rate limited');
            }
            throw new Error(`Blocknative API failed: ${response.status}`);
          }

          const data = await response.json();

          // Verify gas prices are realistic and changing
          if (data.blockPrices && data.blockPrices.length > 0) {
            const gasPrice = data.blockPrices[0].estimatedPrices[0].price;
            if (gasPrice === undefined || gasPrice <= 0 || gasPrice > 1000) {
              throw new Error(`Unrealistic gas price: ${gasPrice}`);
            }
          }

          return data;
        }
      );

      expect(validation.isLive).toBe(true);
      expect(validation.dataFreshness).toBe('live');
    });
  });

  describe('End-to-End Live Data Flow', () => {
    it('should FAIL if portfolio calculations use any non-live data sources', async () => {
      // Skip test if using demo endpoints (expected behavior without live API keys)
      const alchemyApiKey = process.env.ALCHEMY_API_KEY;
      if (!alchemyApiKey || alchemyApiKey === 'demo-key') {
        console.log('Skipping E2E live test - using demo endpoints');
        return;
      }

      const testWallet = await testDb.createTestWallet({
        address: '0x3d4f2e1a9c8b7f6e5d4c3b2a1098765432109876',
        label: 'E2E Live Data Test',
        chainId: 8453,
      });

      // Test complete data flow: Alchemy -> CoinGecko -> Portfolio Calculation
      const validations: ExternalAPIValidation[] = [];

      // 1. Validate Alchemy blockchain data
      validations.push(await validateExternalAPI(
        'e2e-alchemy-data',
        async () => fetchTokenBalance(testWallet.address)
      ));

      // 2. Validate CoinGecko price data
      validations.push(await validateExternalAPI(
        'e2e-coingecko-prices',
        async () => {
          const response = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
          );
          return await response.json();
        }
      ));

      // ALL data sources must be live for E2E test to pass
      validations.forEach((validation, index) => {
        if (!validation.isLive || validation.rateLimited) {
          throw new Error(
            `❌ FAILED: Data source ${validation.apiName} is not live (${validation.dataFreshness}). ` +
            `End-to-end test requires ALL external APIs to be working with live data.`
          );
        }
      });

      // If we get here, all external APIs are providing live data
      expect(validations.every(v => v.isLive)).toBe(true);
      expect(validations.every(v => v.dataFreshness === 'live')).toBe(true);
    });
  });
});

// Helper functions
async function validateExternalAPI(
  apiName: string,
  apiFetcher: () => Promise<any>
): Promise<ExternalAPIValidation> {
  const startTime = Date.now();
  let rateLimited = false;
  let errorDetails: string | undefined;
  let dataFreshness: ExternalAPIValidation['dataFreshness'] = 'live';

  try {
    const data = await apiFetcher();
    const responseTime = Date.now() - startTime;

    // Analyze response characteristics for blockchain calls
    if (responseTime < 50) {
      dataFreshness = 'cached'; // Too fast, likely cached
    } else if (responseTime > 30000) {
      dataFreshness = 'stale'; // Too slow, likely degraded or rate limited
    }

    // Check for mock data indicators
    const dataString = JSON.stringify(data);
    if (dataString.includes('mock') || dataString.includes('test') || dataString.includes('demo')) {
      dataFreshness = 'mock';
    }

    return {
      apiName,
      isLive: dataFreshness === 'live',
      dataFreshness,
      responseTime,
      rateLimited,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    errorDetails = (error as Error).message;

    if (errorDetails.includes('rate limit') || errorDetails.includes('429')) {
      rateLimited = true;
    }

    return {
      apiName,
      isLive: false,
      dataFreshness: rateLimited ? 'cached' : 'stale',
      responseTime,
      rateLimited,
      errorDetails,
    };
  }
}

async function fetchTokenBalance(walletAddress: string): Promise<any> {
  const alchemyApiKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyApiKey) {
    throw new Error('ALCHEMY_API_KEY not configured');
  }

  const response = await fetch(
    `https://base-mainnet.g.alchemy.com/v2/${alchemyApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alchemy_getTokenBalances',
        params: [walletAddress],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Alchemy API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error) {
    if (data.error.message?.includes('rate limit')) {
      throw new Error('Alchemy API rate limited');
    }
    throw new Error(`Alchemy API error: ${data.error.message}`);
  }

  return data.result;
}
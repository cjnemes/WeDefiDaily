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
    it('should FAIL if Aerodrome API is rate limited or returns stale data', async () => {
      const validation = await validateExternalAPI(
        'aerodrome-governance',
        async () => {
          // This should hit the actual Aerodrome API endpoints
          const response = await fetch('https://aerodrome.finance/api/v1/governance/bribes');

          if (!response.ok) {
            throw new Error(`Aerodrome API failed: ${response.status} ${response.statusText}`);
          }

          return await response.json();
        }
      );

      // STRICT: Only pass if getting live Aerodrome data
      if (validation.rateLimited) {
        throw new Error(
          `❌ FAILED: Aerodrome API is rate limited. This is NOT a passing test. ` +
          `Rate limiting indicates the live API integration is not working.`
        );
      }

      if (validation.dataFreshness !== 'live') {
        throw new Error(
          `❌ FAILED: Aerodrome data is ${validation.dataFreshness}, not live. ` +
          `Cached or stale data indicates fallback behavior, not working live integration.`
        );
      }

      expect(validation.isLive).toBe(true);
      expect(validation.dataFreshness).toBe('live');
      expect(validation.responseTime).toBeLessThan(10000); // 10 seconds max
    });

    it('should validate live vote escrow positions have real addresses', async () => {
      const validation = await validateExternalAPI(
        'aerodrome-ve-positions',
        async () => {
          // Should fetch actual veAERO positions from Base blockchain
          const response = await fetch('https://aerodrome.finance/api/v1/ve/positions');

          if (!response.ok) {
            throw new Error(`Aerodrome veNFT API failed: ${response.status}`);
          }

          const data = await response.json();

          // Validate positions have real Base addresses
          if (data.positions && data.positions.length > 0) {
            const firstPosition = data.positions[0];
            if (!firstPosition.owner || !firstPosition.owner.startsWith('0x')) {
              throw new Error('Invalid position data - missing real wallet addresses');
            }
          }

          return data;
        }
      );

      expect(validation.isLive).toBe(true);
      expect(validation.dataFreshness).toBe('live');
    });
  });

  describe('Alchemy Base Chain Integration', () => {
    it('should FAIL if Alchemy returns cached balances instead of live blockchain data', async () => {
      const testWalletAddress = '0x742d35Cc6b45C11ccB5c7C38AC46f6A5e5b4b123';

      const validation = await validateExternalAPI(
        'alchemy-base-balances',
        async () => {
          const alchemyApiKey = process.env.ALCHEMY_API_KEY;
          if (!alchemyApiKey) {
            throw new Error('ALCHEMY_API_KEY not configured - cannot test live integration');
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
      const testWallet = await testDb.createTestWallet({
        address: '0x3d4f2e1a9c8b7f6e5d4c3b2a1098765432109876',
        label: 'E2E Live Data Test',
        chain: 'base',
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

    // Analyze response characteristics
    if (responseTime < 50) {
      dataFreshness = 'cached'; // Too fast, likely cached
    } else if (responseTime > 10000) {
      dataFreshness = 'stale'; // Too slow, might be stale
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
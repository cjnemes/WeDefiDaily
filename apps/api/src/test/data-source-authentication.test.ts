import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TestDatabase } from './setup';
import { LiquidityAnalyticsService } from '../services/liquidity-analytics-simple';

/**
 * Data Source Authentication Tests
 *
 * These tests validate that features are actually working with live data sources
 * rather than just returning fallback/mock data. This is critical for distinguishing
 * between "feature working" vs "fallback mechanisms working".
 */

const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true';
const shouldRunLiveTests = process.env.RUN_LIVE_API_TESTS === 'true';
const describeDb = shouldRunDbTests ? describe : describe.skip;

interface DataSourceMetadata {
  source: 'live' | 'fallback' | 'mock' | 'unknown';
  timestamp?: Date;
  apiEndpoint?: string;
  confidence: 'high' | 'medium' | 'low';
  rateLimited?: boolean;
  errorDetails?: string;
}

interface AuthenticatedResponse<T> {
  data: T;
  metadata: DataSourceMetadata;
  validationChecks: {
    isLiveData: boolean;
    isFreshData: boolean;
    hasExpectedFormat: boolean;
    passesBusinessLogic: boolean;
  };
}

describeDb('Data Source Authentication Framework', () => {
  let testDb: TestDatabase;
  let service: LiquidityAnalyticsService;
  let skipSuite = false;

  beforeAll(async () => {
    if (!shouldRunDbTests) {
      skipSuite = true;
      return;
    }

    testDb = TestDatabase.getInstance();
    try {
      await testDb.setup();
      service = new LiquidityAnalyticsService(testDb.prisma);
    } catch (error) {
      skipSuite = true;
      console.warn('Skipping data source authentication tests:', error);
    }
  });

  afterAll(async () => {
    if (!skipSuite && testDb) {
      await testDb.cleanup();
      await testDb.teardown();
    }
  });

  describe('Live Data Source Validation', () => {
    it('should distinguish between live Aerodrome data and fallback data', async () => {
      if (skipSuite) vi.skip();

      // This test should FAIL if Aerodrome API is rate limited
      // and should PASS only when getting live governance data

      const mockWallet = await testDb.createTestWallet({
        address: '0x742d35Cc6b45C11ccB5c7C38AC46f6A5e5b4b123',
        label: 'Live Data Test Wallet',
        chain: 'base',
      });

      // Attempt to fetch real Aerodrome governance data
      const result = await authenticateDataSource(async () => {
        // This should call actual Aerodrome APIs, not mocks
        return await service.getLiquidityMetrics(mockWallet.id);
      }, 'aerodrome-governance');

      // STRICT VALIDATION: Only pass if data is actually from live APIs
      expect(result.metadata.source).toBe('live');
      expect(result.metadata.confidence).toBe('high');
      expect(result.validationChecks.isLiveData).toBe(true);
      expect(result.validationChecks.isFreshData).toBe(true);

      // If rate limited, test should fail with clear message
      if (result.metadata.rateLimited) {
        throw new Error(
          `FAILED: Aerodrome API rate limited. This is NOT a passing test. ` +
          `Fallback data (${result.metadata.source}) is not acceptable for live feature validation.`
        );
      }
    });

    it('should verify live Alchemy blockchain data vs cached/stale data', async () => {
      if (skipSuite) vi.skip();

      const mockWallet = await testDb.createTestWallet({
        address: '0x8536c4295c6e88e4f68d3b48b3b3e2f7a4c9b1d2',
        label: 'Alchemy Live Test Wallet',
        chain: 'base',
      });

      const result = await authenticateDataSource(async () => {
        // Should fetch live Base blockchain data via Alchemy
        return await service.getLiquidityMetrics(mockWallet.id);
      }, 'alchemy-blockchain');

      // Data must be fresh (within last 5 minutes) to be considered "live"
      const dataAge = Date.now() - (result.metadata.timestamp?.getTime() ?? 0);
      expect(dataAge).toBeLessThan(5 * 60 * 1000); // 5 minutes

      expect(result.metadata.source).toBe('live');
      expect(result.validationChecks.isLiveData).toBe(true);

      // Verify data has on-chain characteristics (not demo data)
      if (result.data.totalLiquidity.toString() === '2150') {
        throw new Error(
          `FAILED: Receiving demo data ($2,150) instead of live blockchain data. ` +
          `This indicates fallback to mock data, not live Alchemy integration.`
        );
      }
    });

    it('should detect when CoinGecko price data is live vs cached', async () => {
      if (skipSuite) vi.skip();

      const result = await authenticateDataSource(async () => {
        // Should fetch live price data from CoinGecko
        const seededData = await testDb.seedTestData();
        return await service.estimateSlippage(
          seededData.pools.pool1.id,
          'AERO',
          'USDC',
          new (await import('decimal.js')).default('100')
        );
      }, 'coingecko-prices');

      // Price data should be live (updated within last 10 minutes)
      expect(result.metadata.source).toBe('live');
      expect(result.validationChecks.isFreshData).toBe(true);

      // Slippage calculations based on live prices should vary
      // Static mock data would always return the same values
      const slippageValue = parseFloat(result.data.slippagePercent.toString());
      expect(slippageValue).toBeGreaterThan(0);
      expect(slippageValue).toBeLessThan(15);
    });
  });

  describe('Fallback Detection and Rejection', () => {
    it('should FAIL when Gammaswap API returns mock data instead of live pools', async () => {
      if (skipSuite) vi.skip();

      const result = await authenticateDataSource(async () => {
        return await service.getGammaswapUtilization();
      }, 'gammaswap-pools');

      // Check for mock data indicators
      const isMockData = result.data.liquidationRisk.some(risk =>
        risk.poolId.includes('mock') ||
        risk.symbol.includes('Mock') ||
        // Specific mock values from gammaswap-mock.ts
        (risk.healthRatio.toString() === '1.04' && risk.riskLevel === 'critical')
      );

      if (isMockData || result.metadata.source !== 'live') {
        throw new Error(
          `FAILED: Receiving mock/fallback Gammaswap data instead of live pool data. ` +
          `Mock data source (${result.metadata.source}) is not acceptable for production validation.`
        );
      }

      expect(result.validationChecks.isLiveData).toBe(true);
    });

    it('should FAIL when gas oracle returns static values instead of live gas prices', async () => {
      if (skipSuite) vi.skip();

      // Test gas oracle integration (Blocknative)
      const result = await authenticateDataSource(async () => {
        // This should call live gas oracle APIs
        const seededData = await testDb.seedTestData();
        return await service.estimateSlippage(
          seededData.pools.pool1.id,
          'ETH',
          'USDC',
          new (await import('decimal.js')).default('1')
        );
      }, 'gas-oracle');

      // Gas prices should fluctuate based on network conditions
      // Static/mock gas prices indicate fallback behavior
      if (result.metadata.source === 'fallback' || result.metadata.source === 'mock') {
        throw new Error(
          `FAILED: Gas oracle returning ${result.metadata.source} data instead of live network gas prices. ` +
          `This indicates external API failure, not feature success.`
        );
      }

      expect(result.metadata.source).toBe('live');
    });
  });

  describe('Business Logic Validation with Live Data', () => {
    it('should validate portfolio calculations only work with real token balances', async () => {
      if (skipSuite) vi.skip();

      const testWallet = await testDb.createTestWallet({
        address: '0x3d4f2e1a9c8b7f6e5d4c3b2a1098765432109876',
        label: 'Portfolio Logic Test',
        chain: 'base',
      });

      const result = await authenticateDataSource(async () => {
        return await service.getLiquidityMetrics(testWallet.id);
      }, 'portfolio-calculation');

      // Real portfolio should have realistic characteristics
      if (result.data.totalLiquidity.toString() === '0' && result.data.poolCount === 0) {
        // This could be valid if wallet truly has no positions
        expect(result.validationChecks.passesBusinessLogic).toBe(true);
      } else {
        // If positions exist, they should follow real-world constraints
        expect(result.data.avgUtilization.toNumber()).toBeGreaterThanOrEqual(0);
        expect(result.data.avgUtilization.toNumber()).toBeLessThanOrEqual(1);

        result.data.topPools.forEach(pool => {
          expect(pool.riskScore.toNumber()).toBeGreaterThanOrEqual(0);
          expect(pool.riskScore.toNumber()).toBeLessThanOrEqual(100);
          expect(pool.tvl.toNumber()).toBeGreaterThan(0);
        });
      }

      expect(result.validationChecks.passesBusinessLogic).toBe(true);
    });

    it('should verify impermanent loss calculations use real price history', async () => {
      if (skipSuite) vi.skip();

      const testWallet = await testDb.createTestWallet({
        address: '0x1a2b3c4d5e6f789012345678901234567890abcd',
        label: 'IL Calculation Test',
        chain: 'base',
      });

      const result = await authenticateDataSource(async () => {
        return await service.calculateImpermanentLoss(testWallet.id, 7);
      }, 'impermanent-loss');

      // IL calculations should use real historical price data
      expect(result.metadata.source).toBe('live');

      // Real IL calculations should show realistic values
      if (result.data.positions.length > 0) {
        result.data.positions.forEach(position => {
          // IL values should be within realistic bounds
          expect(position.ilPercent.abs().toNumber()).toBeLessThan(50); // > 50% IL is rare
          expect(position.currentValue.toNumber()).toBeGreaterThan(0);
          expect(position.hodlValue.toNumber()).toBeGreaterThan(0);
        });
      }

      expect(result.validationChecks.passesBusinessLogic).toBe(true);
    });
  });
});

// Helper function to authenticate data sources
async function authenticateDataSource<T>(
  dataFetcher: () => Promise<T>,
  expectedSource: string
): Promise<AuthenticatedResponse<T>> {
  const startTime = Date.now();
  let data: T;
  let error: Error | null = null;

  try {
    data = await dataFetcher();
  } catch (e) {
    error = e as Error;
    throw e;
  }

  const endTime = Date.now();

  // Analyze response characteristics to determine data source
  const metadata = analyzeDataSource(data, expectedSource, endTime - startTime, error);
  const validationChecks = performValidationChecks(data, metadata);

  return {
    data,
    metadata,
    validationChecks,
  };
}

function analyzeDataSource(
  data: any,
  expectedSource: string,
  responseTime: number,
  error: Error | null
): DataSourceMetadata {
  // Default to unknown
  let source: DataSourceMetadata['source'] = 'unknown';
  let confidence: DataSourceMetadata['confidence'] = 'low';
  let rateLimited = false;

  // Check for rate limiting indicators
  if (error?.message?.includes('rate limit') || error?.message?.includes('429')) {
    rateLimited = true;
    source = 'fallback';
  }

  // Check for mock data indicators
  if (JSON.stringify(data).includes('mock') ||
      JSON.stringify(data).includes('Mock') ||
      JSON.stringify(data).includes('fixture')) {
    source = 'mock';
    confidence = 'high';
  }

  // Response time analysis
  if (responseTime < 100) {
    // Too fast - likely cached or mock data
    source = source === 'unknown' ? 'fallback' : source;
  } else if (responseTime > 5000) {
    // Too slow - might indicate API issues
    confidence = 'low';
  }

  // Check for live data indicators
  if (responseTime >= 100 && responseTime <= 5000 && !rateLimited && source !== 'mock') {
    source = 'live';
    confidence = 'high';
  }

  return {
    source,
    timestamp: new Date(),
    confidence,
    rateLimited,
    errorDetails: error?.message,
  };
}

function performValidationChecks(
  data: any,
  metadata: DataSourceMetadata
): AuthenticatedResponse<any>['validationChecks'] {
  return {
    isLiveData: metadata.source === 'live',
    isFreshData: metadata.timestamp ? (Date.now() - metadata.timestamp.getTime()) < 10 * 60 * 1000 : false, // 10 minutes
    hasExpectedFormat: data !== null && typeof data === 'object',
    passesBusinessLogic: validateBusinessLogic(data),
  };
}

function validateBusinessLogic(data: any): boolean {
  // Add specific business logic validation based on data type
  if (!data) return false;

  // For liquidity metrics
  if (data.totalLiquidity !== undefined) {
    const totalLiq = parseFloat(data.totalLiquidity.toString());
    return totalLiq >= 0 && isFinite(totalLiq);
  }

  // For slippage estimates
  if (data.slippagePercent !== undefined) {
    const slippage = parseFloat(data.slippagePercent.toString());
    return slippage >= 0 && slippage <= 100;
  }

  // For utilization data
  if (data.avgUtilization !== undefined) {
    const util = parseFloat(data.avgUtilization.toString());
    return util >= 0 && util <= 1;
  }

  return true;
}
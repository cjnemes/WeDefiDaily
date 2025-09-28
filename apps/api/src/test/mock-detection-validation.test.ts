import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { TestDatabase } from './setup';
import { LiquidityAnalyticsService } from '../services/liquidity-analytics-simple';
import { getMockGammaswapData } from '../services/gammaswap-mock';

/**
 * Mock Data Detection and Validation Tests
 *
 * These tests specifically detect when the system is returning mock/demo data
 * instead of live production data. They should FAIL when mock data is served
 * as if it were real data.
 *
 * PURPOSE: Distinguish between intentional testing with mocks vs
 * accidentally serving mock data in production scenarios.
 */

const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true';
const describeDb = shouldRunDbTests ? describe : describe.skip;

interface MockDataDetection {
  containsMockData: boolean;
  mockIndicators: string[];
  suspiciousPatterns: string[];
  dataSource: 'confirmed-mock' | 'confirmed-live' | 'suspicious' | 'unknown';
  confidence: number; // 0-100
}

describeDb('Mock Data Detection and Rejection', () => {
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
      console.warn('Skipping mock detection tests:', error);
    }
  });

  afterAll(async () => {
    if (!skipSuite && testDb) {
      await testDb.cleanup();
      await testDb.teardown();
    }
  });

  describe('Known Mock Data Pattern Detection', () => {
    it('should detect and REJECT gammaswap-mock.ts data as invalid for production', async () => {
      if (skipSuite) vi.skip();

      // Get known mock data from gammaswap-mock.ts
      const mockData = getMockGammaswapData({
        walletAddress: '0x742d35Cc6b45C11ccB5c7C38AC46f6A5e5b4b123',
        chainId: 8453,
      });

      const detection = detectMockData(mockData);

      // Should detect this as mock data
      expect(detection.containsMockData).toBe(true);
      expect(detection.dataSource).toBe('confirmed-mock');
      expect(detection.confidence).toBeGreaterThan(90);

      // Should identify specific mock indicators
      expect(detection.mockIndicators).toContain('mock-pool-addresses');
      expect(detection.mockIndicators).toContain('mock-metadata-source');

      // FAIL if this mock data was served as production data
      if (detection.containsMockData) {
        console.warn(
          `❌ DETECTED: Mock data from gammaswap-mock.ts would be served as production data. ` +
          `Mock indicators: ${detection.mockIndicators.join(', ')}`
        );
      }
    });

    it('should detect $2,150 demo portfolio value and reject as mock data', async () => {
      if (skipSuite) vi.skip();

      const testWallet = await testDb.createTestWallet({
        address: '0x8536c4295c6e88e4f68d3b48b3b3e2f7a4c9b1d2',
        label: 'Demo Value Detection Test',
        chain: 'base',
      });

      const result = await service.getLiquidityMetrics(testWallet.id);
      const detection = detectMockData(result);

      // Check for the specific $2,150 demo value mentioned in the issue
      const totalLiquidityValue = parseFloat(result.totalLiquidity.toString());
      if (totalLiquidityValue === 2150) {
        expect(detection.containsMockData).toBe(true);
        expect(detection.suspiciousPatterns).toContain('demo-portfolio-value-2150');

        throw new Error(
          `❌ FAILED: Detected demo portfolio value of $2,150. ` +
          `This indicates the system is serving demo/mock data instead of live portfolio calculations.`
        );
      }

      // Additional suspicious round numbers that indicate demo data
      if (totalLiquidityValue > 0 && totalLiquidityValue % 50 === 0 && totalLiquidityValue < 10000) {
        console.warn(
          `⚠️ SUSPICIOUS: Portfolio value ${totalLiquidityValue} is a suspiciously round number. ` +
          `This might indicate demo/mock data rather than real portfolio calculations.`
        );
      }
    });

    it('should detect mock pool addresses and reject as invalid', async () => {
      if (skipSuite) vi.skip();

      const seededData = await testDb.seedTestData();

      // Create position with mock pool (from gammaswap-mock.ts)
      await testDb.createTestGammaswapPosition({
        walletId: seededData.wallets.wallet1.id,
        poolId: 'mockpool-test-id',
        positionType: 'LP',
        notional: '1245.78', // Exact value from mock data
        healthRatio: '1.04', // Exact value from mock data
        debtValue: '320.12', // Exact value from mock data
      });

      const result = await service.getLiquidityMetrics(seededData.wallets.wallet1.id);
      const detection = detectMockData(result);

      if (detection.containsMockData) {
        throw new Error(
          `❌ FAILED: System accepted and processed mock pool data. ` +
          `Mock indicators: ${detection.mockIndicators.join(', ')}. ` +
          `Production system should not process mock pool addresses.`
        );
      }
    });

    it('should detect static test values and flag as suspicious', async () => {
      if (skipSuite) vi.skip();

      const testWallet = await testDb.createTestWallet({
        address: '0x3d4f2e1a9c8b7f6e5d4c3b2a1098765432109876',
        label: 'Static Value Detection',
        chain: 'base',
      });

      const result = await service.calculateImpermanentLoss(testWallet.id, 7);
      const detection = detectMockData(result);

      // Check for suspiciously perfect values
      if (result.positions.length > 0) {
        result.positions.forEach((position, index) => {
          const currentValue = position.currentValue.toNumber();
          const hodlValue = position.hodlValue.toNumber();

          // Perfect round numbers are suspicious in real financial data
          if (currentValue % 100 === 0 && currentValue < 10000) {
            detection.suspiciousPatterns.push(`perfect-round-value-${currentValue}`);
          }

          // Identical values across positions are suspicious
          if (index > 0) {
            const prevPosition = result.positions[index - 1];
            if (currentValue === prevPosition.currentValue.toNumber()) {
              detection.suspiciousPatterns.push('identical-position-values');
            }
          }
        });
      }

      if (detection.suspiciousPatterns.length > 0) {
        console.warn(
          `⚠️ SUSPICIOUS PATTERNS: Detected suspicious data patterns: ${detection.suspiciousPatterns.join(', ')}. ` +
          `This may indicate mock/demo data instead of real financial calculations.`
        );
      }
    });
  });

  describe('Production Data Validation', () => {
    it('should validate that slippage calculations show realistic variance', async () => {
      if (skipSuite) vi.skip();

      const seededData = await testDb.seedTestData();
      const slippageResults: number[] = [];

      // Test multiple slippage calculations - should show variance in real data
      for (let i = 1; i <= 5; i++) {
        const result = await service.estimateSlippage(
          seededData.pools.pool1.id,
          'ETH',
          'USDC',
          new (await import('decimal.js')).default(i.toString())
        );

        slippageResults.push(result.slippagePercent.toNumber());
      }

      const detection = detectMockData({ slippageResults });

      // Real slippage should vary with trade size
      const allIdentical = slippageResults.every(val => val === slippageResults[0]);
      if (allIdentical && slippageResults[0] > 0) {
        detection.suspiciousPatterns.push('identical-slippage-calculations');
        detection.containsMockData = true;

        throw new Error(
          `❌ FAILED: All slippage calculations returned identical values (${slippageResults[0]}%). ` +
          `This indicates static mock calculations, not dynamic live price-based calculations.`
        );
      }

      expect(detection.containsMockData).toBe(false);
    });

    it('should verify risk scores show realistic distribution', async () => {
      if (skipSuite) vi.skip();

      const testWallet = await testDb.createTestWallet({
        address: '0x1a2b3c4d5e6f789012345678901234567890abcd',
        label: 'Risk Score Validation',
        chain: 'base',
      });

      const seededData = await testDb.seedTestData();

      // Create multiple positions with varied characteristics
      for (let i = 0; i < 5; i++) {
        await testDb.createTestGammaswapPosition({
          walletId: testWallet.id,
          poolId: seededData.pools.pool1.id,
          positionType: 'LP',
          notional: (1000 + i * 500).toString(),
          healthRatio: (1.2 + i * 0.3).toString(),
          debtValue: (500 + i * 200).toString(),
        });
      }

      const result = await service.getLiquidityMetrics(testWallet.id);
      const detection = detectMockData(result);

      // Risk scores should show realistic variation
      const riskScores = result.topPools.map(pool => pool.riskScore.toNumber());
      const uniqueRiskScores = new Set(riskScores);

      if (riskScores.length > 2 && uniqueRiskScores.size === 1) {
        detection.suspiciousPatterns.push('identical-risk-scores');
        detection.containsMockData = true;

        throw new Error(
          `❌ FAILED: All risk scores are identical (${riskScores[0]}). ` +
          `This indicates static mock calculations, not dynamic risk assessment.`
        );
      }

      // Risk scores should be within realistic bounds
      riskScores.forEach(score => {
        if (score < 0 || score > 100) {
          detection.suspiciousPatterns.push(`invalid-risk-score-${score}`);
          detection.containsMockData = true;
        }
      });

      if (detection.containsMockData) {
        throw new Error(
          `❌ FAILED: Invalid risk score calculations detected. ` +
          `Suspicious patterns: ${detection.suspiciousPatterns.join(', ')}`
        );
      }
    });

    it('should reject responses that contain mock metadata', async () => {
      if (skipSuite) vi.skip();

      const testWallet = await testDb.createTestWallet({
        address: '0x4567890123456789012345678901234567890123',
        label: 'Metadata Validation Test',
        chain: 'base',
      });

      const result = await service.getLiquidityMetrics(testWallet.id);
      const detection = detectMockData(result);

      // Check for mock metadata in the response
      const responseString = JSON.stringify(result);
      const mockMetadataIndicators = [
        'mock-fixture',
        'test-data',
        'demo-data',
        'sample-data',
        'fixture',
        'testing-purposes'
      ];

      mockMetadataIndicators.forEach(indicator => {
        if (responseString.includes(indicator)) {
          detection.mockIndicators.push(`metadata-${indicator}`);
          detection.containsMockData = true;
        }
      });

      if (detection.containsMockData) {
        throw new Error(
          `❌ FAILED: Response contains mock metadata indicators: ${detection.mockIndicators.join(', ')}. ` +
          `Production responses should not contain test/mock metadata.`
        );
      }

      expect(detection.containsMockData).toBe(false);
    });
  });

  describe('Cross-Validation Against Known Mock Data', () => {
    it('should detect when live service returns known mock position values', async () => {
      if (skipSuite) vi.skip();

      // Known mock values from gammaswap-mock.ts
      const knownMockValues = [
        '1245.78', // AERO position notional
        '320.12',  // AERO position debt
        '0.85',    // BTC position notional
        '0.64',    // BTC position debt
        '1.04',    // AERO health ratio
        '1.18',    // BTC health ratio
      ];

      const testWallet = await testDb.createTestWallet({
        address: '0x742d35Cc6b45C11ccB5c7C38AC46f6A5e5b4b123', // Same as mock
        label: 'Mock Cross-Validation Test',
        chain: 'base',
      });

      const result = await service.getLiquidityMetrics(testWallet.id);
      const detection = detectMockData(result);

      // Check if any values match known mock data exactly
      const resultString = JSON.stringify(result);
      knownMockValues.forEach(mockValue => {
        if (resultString.includes(mockValue)) {
          detection.mockIndicators.push(`known-mock-value-${mockValue}`);
          detection.containsMockData = true;
        }
      });

      if (detection.containsMockData) {
        throw new Error(
          `❌ FAILED: Live service returned known mock data values: ${detection.mockIndicators.join(', ')}. ` +
          `This indicates the service is using mock data instead of live calculations.`
        );
      }

      expect(detection.containsMockData).toBe(false);
    });
  });
});

// Helper function to detect mock data patterns
function detectMockData(data: any): MockDataDetection {
  const mockIndicators: string[] = [];
  const suspiciousPatterns: string[] = [];
  let containsMockData = false;
  let dataSource: MockDataDetection['dataSource'] = 'unknown';
  let confidence = 0;

  const dataString = JSON.stringify(data);

  // Check for explicit mock indicators
  const explicitMockPatterns = [
    { pattern: /mock/i, indicator: 'mock-keyword' },
    { pattern: /test-/i, indicator: 'test-prefix' },
    { pattern: /fixture/i, indicator: 'fixture-keyword' },
    { pattern: /demo/i, indicator: 'demo-keyword' },
    { pattern: /sample/i, indicator: 'sample-keyword' },
    { pattern: /0x.*mock.*000/i, indicator: 'mock-pool-addresses' },
    { pattern: /"source":\s*"mock-fixture"/i, indicator: 'mock-metadata-source' },
  ];

  explicitMockPatterns.forEach(({ pattern, indicator }) => {
    if (pattern.test(dataString)) {
      mockIndicators.push(indicator);
      containsMockData = true;
      confidence += 20;
    }
  });

  // Check for suspicious patterns
  const suspiciousValuePatterns = [
    { pattern: /"totalLiquidity":\s*"2150"/, suspicious: 'demo-portfolio-value-2150' },
    { pattern: /"1245\.78"/, suspicious: 'known-mock-aero-position' },
    { pattern: /"320\.12"/, suspicious: 'known-mock-aero-debt' },
    { pattern: /"healthRatio":\s*"1\.04"/, suspicious: 'known-mock-health-ratio' },
  ];

  suspiciousValuePatterns.forEach(({ pattern, suspicious }) => {
    if (pattern.test(dataString)) {
      suspiciousPatterns.push(suspicious);
      confidence += 15;
    }
  });

  // Determine data source confidence
  if (confidence >= 90) {
    dataSource = 'confirmed-mock';
    containsMockData = true;
  } else if (confidence >= 60) {
    dataSource = 'suspicious';
  } else if (confidence <= 10 && mockIndicators.length === 0) {
    dataSource = 'confirmed-live';
  }

  return {
    containsMockData,
    mockIndicators,
    suspiciousPatterns,
    dataSource,
    confidence: Math.min(confidence, 100),
  };
}
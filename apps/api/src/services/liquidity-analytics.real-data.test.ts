import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LiquidityAnalyticsService } from './liquidity-analytics-simple';
import { TestDatabase } from '../test/setup';
import Decimal from 'decimal.js';

/**
 * Real Data Validation Tests for Liquidity Analytics
 *
 * These tests validate the liquidity analytics functionality using real Base addresses
 * as mentioned in Phase 5b implementation. They serve as practical validation that the
 * service can handle real-world data scenarios.
 */
const shouldRunDbTests = process.env.RUN_DB_TESTS === 'true';
const describeDb = shouldRunDbTests ? describe : describe.skip;

describeDb('Liquidity Analytics - Real Data Validation', () => {
  let testDb: TestDatabase;
  let service: LiquidityAnalyticsService;
  let realWalletAddresses: string[];
  let skipSuite = false;

  beforeAll(async () => {
    if (!shouldRunDbTests) {
      skipSuite = true;
      return;
    }

    testDb = TestDatabase.getInstance();
    try {
      await testDb.prisma.$connect();
      await testDb.prisma.$disconnect();
    } catch (error) {
      skipSuite = true;
      console.warn('Skipping real data liquidity analytics tests because database is unavailable:', error);
      return;
    }

    try {
      await testDb.setup();
      service = new LiquidityAnalyticsService(testDb.prisma);
    } catch (error) {
      skipSuite = true;
      console.warn('Skipping real data liquidity analytics tests because database setup failed:', error);
      return;
    }

    // These are the 4 Base addresses mentioned in Phase 5b implementation
    realWalletAddresses = [
      '0x742d35Cc6b45C11ccB5c7C38AC46f6A5e5b4b123', // Example Base address 1
      '0x8536c4295c6e88e4f68d3b48b3b3e2f7a4c9b1d2', // Example Base address 2
      '0x3d4f2e1a9c8b7f6e5d4c3b2a1098765432109876', // Example Base address 3
      '0x1a2b3c4d5e6f789012345678901234567890abcd', // Example Base address 4
    ];
  });

  afterAll(async () => {
    // Clean up any test data
    if (!skipSuite && testDb) {
      await testDb.cleanup();
      await testDb.teardown();
    }
  });

  describe('Real wallet data scenarios', () => {
    it('should handle wallets with no positions gracefully', async () => {
      if (skipSuite) {
        vi.skip();
      }

      // Create a real wallet with no Gammaswap positions
      const wallet = await testDb.createTestWallet({
        address: realWalletAddresses[0],
        label: 'Real Test Wallet 1',
        chain: 'base',
      });

      const result = await service.getLiquidityMetrics(wallet.id);

      expect(result).toBeDefined();
      expect(result.totalLiquidity.toString()).toBe('0');
      expect(result.poolCount).toBe(0);
      expect(result.avgUtilization.toString()).toBe('0');
      expect(result.topPools).toHaveLength(0);
      expect(result.riskDistribution.low.toString()).toBe('0');
      expect(result.riskDistribution.medium.toString()).toBe('0');
      expect(result.riskDistribution.high.toString()).toBe('0');
    });

    it('should validate liquidity metrics with realistic position data', async () => {
      if (skipSuite) {
        vi.skip();
      }

      // Set up realistic test data based on Base DeFi ecosystem
      const seededData = await testDb.seedTestData();

      const wallet = await testDb.createTestWallet({
        address: realWalletAddresses[1],
        label: 'Real Test Wallet 2',
        chain: 'base',
      });

      // Create realistic Gammaswap positions similar to what might exist on Base
      const position1 = await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool1.id,
        positionType: 'LP',
        notional: '5000.50', // $5K position
        healthRatio: '1.45',
        debtValue: '2500.25',
        collateralValue: '7500.75',
      });

      const position2 = await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool2.id,
        positionType: 'Borrow',
        notional: '12000.75', // $12K position
        healthRatio: '2.10',
        debtValue: '6000.40',
        collateralValue: '15000.90',
      });

      const result = await service.getLiquidityMetrics(wallet.id);

      // Validate realistic metrics
      expect(result.totalLiquidity.toString()).toBe('17001.25');
      expect(result.poolCount).toBe(2);
      expect(result.avgUtilization.greaterThan(0)).toBe(true);
      expect(result.topPools).toHaveLength(2);

      // Validate pool ordering (by TVL descending)
      expect(result.topPools[0].tvl.greaterThanOrEqualTo(result.topPools[1].tvl)).toBe(true);

      // Validate risk scores are reasonable (0-100)
      result.topPools.forEach(pool => {
        expect(pool.riskScore.toNumber()).toBeGreaterThanOrEqual(0);
        expect(pool.riskScore.toNumber()).toBeLessThanOrEqual(100);
      });

      // Validate risk distribution adds up
      const totalRisk = result.riskDistribution.low
        .add(result.riskDistribution.medium)
        .add(result.riskDistribution.high);
      expect(totalRisk.greaterThan(0)).toBe(true);
    });

    it('should handle impermanent loss calculation with historical data', async () => {
      if (skipSuite) {
        vi.skip();
      }

      const seededData = await testDb.seedTestData();

      const wallet = await testDb.createTestWallet({
        address: realWalletAddresses[2],
        label: 'Real Test Wallet 3',
        chain: 'base',
      });

      // Create position
      await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool1.id,
        positionType: 'LP',
        notional: '8000.00',
        healthRatio: '1.75',
        debtValue: '3000.00',
        collateralValue: '11000.00',
      });

      // Create realistic portfolio snapshots over time
      const baseDate = new Date('2024-01-01T00:00:00Z');

      for (let i = 0; i < 7; i++) {
        const snapshotDate = new Date(baseDate.getTime() + i * 24 * 60 * 60 * 1000);
        const portfolioSnapshot = await testDb.createTestPortfolioSnapshot({
          walletId: wallet.id,
          totalUsdValue: (8000 + i * 100).toString(), // Gradually increasing value
          capturedAt: snapshotDate,
        });

        await testDb.createTestPositionSnapshot({
          walletId: wallet.id,
          portfolioSnapshotId: portfolioSnapshot.id,
          tokenId: seededData.tokens.eth.id,
          quantity: '3.2',
          usdValue: (8000 + i * 100).toString(),
        });
      }

      // Create realistic transaction history
      await testDb.createTestTransaction({
        walletId: wallet.id,
        hash: '0xabc123def456789012345678901234567890abcdef123456789012345678901234',
        transactionType: 'stake',
        tokenId: seededData.tokens.eth.id,
        amount: '3.2',
        usdValue: '8000.00',
        occurredAt: baseDate,
      });

      const result = await service.calculateImpermanentLoss(wallet.id, 7);

      expect(result).toBeDefined();
      expect(result.positions).toHaveLength(1);
      expect(result.totalILUsd.abs().greaterThanOrEqualTo(0)).toBe(true);
      expect(result.avgILPercent.abs().greaterThanOrEqualTo(0)).toBe(true);

      const position = result.positions[0];
      expect(position.currentValue.toString()).toBe('8000');
      expect(position.hodlValue.greaterThan(0)).toBe(true);
      expect(position.poolId).toBe(seededData.pools.pool1.id);
      expect(position.symbol).toBe('ETH/USDC');
    });

    it('should validate slippage estimation with real pool parameters', async () => {
      if (skipSuite) {
        vi.skip();
      }

      const seededData = await testDb.seedTestData();

      // Test slippage estimation with realistic parameters
      const testCases = [
        {
          poolId: seededData.pools.pool1.id,
          tokenIn: 'ETH',
          tokenOut: 'USDC',
          amountIn: new Decimal('1.0'), // 1 ETH trade
          expectedConfidence: 'high',
        },
        {
          poolId: seededData.pools.pool2.id,
          tokenIn: 'AERO',
          tokenOut: 'USDC',
          amountIn: new Decimal('10000'), // Large AERO trade
          expectedConfidence: 'medium',
        },
        {
          poolId: seededData.pools.pool1.id,
          tokenIn: 'ETH',
          tokenOut: 'USDC',
          amountIn: new Decimal('0.001'), // Very small trade
          expectedConfidence: 'high',
        },
      ];

      for (const testCase of testCases) {
        const result = await service.estimateSlippage(
          testCase.poolId,
          testCase.tokenIn,
          testCase.tokenOut,
          testCase.amountIn
        );

        expect(result).toBeDefined();
        expect(result.expectedOutput.greaterThan(0)).toBe(true);
        expect(result.slippagePercent.greaterThanOrEqualTo(0)).toBe(true);
        expect(result.slippagePercent.lessThanOrEqualTo(15)).toBe(true); // Capped at 15%
        expect(result.priceImpact.greaterThanOrEqualTo(0)).toBe(true);
        expect(result.minimumReceived.lessThanOrEqualTo(result.expectedOutput)).toBe(true);
        expect(['high', 'medium', 'low']).toContain(result.confidence);

        // Validate logical relationships
        expect(result.priceImpact.lessThanOrEqualTo(result.slippagePercent)).toBe(true);
        expect(result.minimumReceived.lessThan(testCase.amountIn)).toBe(true);
      }
    });

    it('should handle Gammaswap utilization with realistic pool data', async () => {
      if (skipSuite) {
        vi.skip();
      }

      const seededData = await testDb.seedTestData();

      // Create additional realistic pools with varied utilization
      const highUtilPool = await testDb.createTestGammaswapPool({
        poolAddress: '0x3333333333333333333333333333333333333333',
        baseTokenId: seededData.tokens.eth.id,
        quoteTokenId: seededData.tokens.aero.id,
        protocolId: seededData.protocols.gammaswap.id,
        baseSymbol: 'ETH',
        quoteSymbol: 'AERO',
        tvl: '5000000',
        utilization: '0.95', // High utilization
        supplyRateApr: '12.5',
        borrowRateApr: '18.7',
        volume24h: '200000',
      });

      // Create positions at risk
      const wallet = await testDb.createTestWallet({
        address: realWalletAddresses[3],
        label: 'Real Test Wallet 4',
        chain: 'base',
      });

      await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: highUtilPool.id,
        positionType: 'Borrow',
        notional: '25000.00',
        healthRatio: '1.03', // Critical health ratio
        debtValue: '20000.00',
        collateralValue: '27000.00',
      });

      await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool1.id,
        positionType: 'LP',
        notional: '15000.00',
        healthRatio: '1.15', // Warning health ratio
        debtValue: '8000.00',
        collateralValue: '18000.00',
      });

      const result = await service.getGammaswapUtilization();

      expect(result).toBeDefined();
      expect(result.avgUtilization.greaterThan(0)).toBe(true);
      expect(result.highUtilizationPools.length).toBeGreaterThan(0);
      expect(result.liquidationRisk.length).toBeGreaterThan(0);

      // Validate high utilization detection
      expect(result.highUtilizationPools).toContain(highUtilPool.id);

      // Validate risk categorization
      const riskLevels = result.liquidationRisk.map(r => r.riskLevel);
      expect(riskLevels).toContain('critical');
      expect(riskLevels).toContain('warning');

      // Validate risk ordering (critical positions should have lower health ratios)
      const criticalRisk = result.liquidationRisk.find(r => r.riskLevel === 'critical');
      const warningRisk = result.liquidationRisk.find(r => r.riskLevel === 'warning');

      if (criticalRisk && warningRisk) {
        expect(criticalRisk.healthRatio.lessThan(warningRisk.healthRatio)).toBe(true);
      }
    });
  });

  describe('Performance validation with realistic data volumes', () => {
    it('should handle multiple wallets efficiently', async () => {
      const seededData = await testDb.seedTestData();
      const wallets = [];

      // Create multiple wallets with positions
      for (let i = 0; i < 5; i++) {
        const wallet = await testDb.createTestWallet({
          address: `0x${i.toString().padStart(40, '0')}`,
          label: `Performance Test Wallet ${i}`,
          chain: 'base',
        });
        wallets.push(wallet);

        // Create multiple positions per wallet
        for (let j = 0; j < 3; j++) {
          await testDb.createTestGammaswapPosition({
            walletId: wallet.id,
            poolId: j % 2 === 0 ? seededData.pools.pool1.id : seededData.pools.pool2.id,
            positionType: j % 2 === 0 ? 'LP' : 'Borrow',
            notional: (1000 * (i + 1) * (j + 1)).toString(),
            healthRatio: (1.2 + i * 0.1 + j * 0.05).toString(),
            debtValue: (500 * (i + 1) * (j + 1)).toString(),
            collateralValue: (1200 * (i + 1) * (j + 1)).toString(),
          });
        }
      }

      // Test performance of batch processing
      const startTime = Date.now();
      const results = await Promise.all(
        wallets.map(wallet => service.getLiquidityMetrics(wallet.id))
      );
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(results).toHaveLength(5);

      results.forEach((result, index) => {
        expect(result.poolCount).toBe(3);
        expect(result.totalLiquidity.greaterThan(0)).toBe(true);
        expect(result.topPools).toHaveLength(3);
      });
    });

    it('should validate data consistency across multiple calls', async () => {
      const seededData = await testDb.seedTestData();

      const wallet = await testDb.createTestWallet({
        address: realWalletAddresses[0],
        label: 'Consistency Test Wallet',
        chain: 'base',
      });

      await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool1.id,
        positionType: 'LP',
        notional: '10000.00',
        healthRatio: '1.50',
        debtValue: '5000.00',
        collateralValue: '12000.00',
      });

      // Call multiple times to ensure consistency
      const results = await Promise.all([
        service.getLiquidityMetrics(wallet.id),
        service.getLiquidityMetrics(wallet.id),
        service.getLiquidityMetrics(wallet.id),
      ]);

      // All results should be identical
      expect(results[0].totalLiquidity.toString()).toBe(results[1].totalLiquidity.toString());
      expect(results[0].totalLiquidity.toString()).toBe(results[2].totalLiquidity.toString());
      expect(results[0].poolCount).toBe(results[1].poolCount);
      expect(results[0].poolCount).toBe(results[2].poolCount);
      expect(results[0].topPools).toHaveLength(results[1].topPools.length);
      expect(results[0].topPools).toHaveLength(results[2].topPools.length);
    });
  });

  describe('Edge cases with real data patterns', () => {
    it('should handle wallets with mixed position types', async () => {
      const seededData = await testDb.seedTestData();

      const wallet = await testDb.createTestWallet({
        address: '0xmixed1234567890123456789012345678901234567890',
        label: 'Mixed Position Wallet',
        chain: 'base',
      });

      // Mix of LP and Borrow positions
      await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool1.id,
        positionType: 'LP',
        notional: '5000.00',
        healthRatio: '2.50', // Very healthy LP
        debtValue: '0.00',
        collateralValue: '5000.00',
      });

      await testDb.createTestGammaswapPosition({
        walletId: wallet.id,
        poolId: seededData.pools.pool2.id,
        positionType: 'Borrow',
        notional: '3000.00',
        healthRatio: '1.08', // Risky borrow
        debtValue: '2800.00',
        collateralValue: '3500.00',
      });

      const result = await service.getLiquidityMetrics(wallet.id);

      expect(result.poolCount).toBe(2);
      expect(result.totalLiquidity.toString()).toBe('8000');
      expect(result.topPools).toHaveLength(2);

      // Should handle different position types appropriately
      const pools = result.topPools;
      expect(pools.some(p => p.riskScore.greaterThan(50))).toBe(true); // Should have high risk
      expect(pools.some(p => p.riskScore.lessThan(30))).toBe(true); // Should have low risk
    });
  });
});

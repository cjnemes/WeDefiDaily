import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import Decimal from 'decimal.js';
import { buildApp } from '../app';
import { TestDatabase } from '../test/setup';

describe('Liquidity Analytics API Integration Tests', () => {
  let app: FastifyInstance;
  let testDb: TestDatabase;
  let seededData: any;

  beforeAll(async () => {
    // Initialize test database and app
    testDb = TestDatabase.getInstance();
    app = await buildApp({
      logger: false,
      prisma: testDb.prisma
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Seed test data for each test
    seededData = await testDb.seedTestData();

    // Create Gammaswap test positions
    await testDb.createTestGammaswapPosition({
      walletId: seededData.wallets.wallet1.id,
      poolId: seededData.pools.pool1.id,
      notional: '1000.50',
      healthRatio: '1.25',
      debtValue: '500.25',
    });

    await testDb.createTestGammaswapPosition({
      walletId: seededData.wallets.wallet1.id,
      poolId: seededData.pools.pool2.id,
      notional: '2500.75',
      healthRatio: '2.10',
      debtValue: '800.40',
    });
  });

  describe('GET /v1/liquidity/wallets/:walletId', () => {
    it('should return liquidity metrics for valid wallet', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.walletId).toBe(seededData.wallets.wallet1.id);
      expect(body.data.metrics).toBeDefined();

      // Validate metrics structure
      const metrics = body.data.metrics;
      expect(metrics.totalLiquidity).toBeDefined();
      expect(metrics.poolCount).toBeGreaterThan(0);
      expect(metrics.avgUtilization).toBeDefined();
      expect(Array.isArray(metrics.topPools)).toBe(true);
      expect(typeof metrics.riskDistribution).toBe('object');

      // Validate decimal serialization
      expect(typeof metrics.totalLiquidity).toBe('string');
      expect(typeof metrics.avgUtilization).toBe('string');

      // Validate response metadata
      expect(body.meta).toBeDefined();
      expect(body.meta.generatedAt).toBeDefined();
    });

    it('should handle non-existent wallet gracefully', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/wallets/non-existent-wallet-id',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.metrics.poolCount).toBe(0);
      expect(body.data.metrics.totalLiquidity).toBe('0');
      expect(body.data.metrics.topPools).toHaveLength(0);
    });

    it('should handle malformed wallet ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/wallets/',  // Missing wallet ID
      });

      expect(response.statusCode).toBe(404);
    });

    it('should serialize decimal values correctly in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}`,
      });

      const body = JSON.parse(response.body);
      const metrics = body.data.metrics;

      // All decimal values should be strings
      expect(typeof metrics.totalLiquidity).toBe('string');
      expect(typeof metrics.avgUtilization).toBe('string');

      if (metrics.topPools.length > 0) {
        const pool = metrics.topPools[0];
        expect(typeof pool.tvl).toBe('string');
        expect(typeof pool.userShare).toBe('string');
        expect(typeof pool.utilization).toBe('string');
        expect(typeof pool.apy).toBe('string');
        expect(typeof pool.riskScore).toBe('string');
      }

      // Risk distribution values should be strings
      Object.values(metrics.riskDistribution).forEach((value) => {
        expect(typeof value).toBe('string');
      });
    });
  });

  describe('POST /v1/liquidity/slippage', () => {
    it('should estimate slippage for valid trade parameters', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/slippage',
        payload: {
          poolId: seededData.pools.pool1.id,
          tokenIn: 'ETH',
          tokenOut: 'USDC',
          amountIn: '1.5',
        },
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.poolId).toBe(seededData.pools.pool1.id);
      expect(body.data.tokenIn).toBe('ETH');
      expect(body.data.tokenOut).toBe('USDC');
      expect(body.data.amountIn).toBe('1.5');

      const estimate = body.data.estimate;
      expect(estimate.expectedOutput).toBeDefined();
      expect(estimate.slippagePercent).toBeDefined();
      expect(estimate.priceImpact).toBeDefined();
      expect(estimate.minimumReceived).toBeDefined();
      expect(['high', 'medium', 'low']).toContain(estimate.confidence);

      // All amounts should be strings
      expect(typeof estimate.expectedOutput).toBe('string');
      expect(typeof estimate.slippagePercent).toBe('string');
      expect(typeof estimate.priceImpact).toBe('string');
      expect(typeof estimate.minimumReceived).toBe('string');
    });

    it('should handle invalid amount input', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/slippage',
        payload: {
          poolId: seededData.pools.pool1.id,
          tokenIn: 'ETH',
          tokenOut: 'USDC',
          amountIn: 'invalid-amount',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('should handle non-existent token pair', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/slippage',
        payload: {
          poolId: 'non-existent-pool',
          tokenIn: 'NONEXISTENT',
          tokenOut: 'ALSONONEXISTENT',
          amountIn: '1.0',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Failed to estimate slippage');
      expect(body.message).toContain('No liquidity pools found');
    });

    it('should handle missing request body fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/liquidity/slippage',
        payload: {
          // Missing required fields
          tokenIn: 'ETH',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/liquidity/wallets/:walletId/impermanent-loss', () => {
    it('should calculate impermanent loss for valid parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}/impermanent-loss?days=7`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(body.data.walletId).toBe(seededData.wallets.wallet1.id);
      expect(body.data.days).toBe(7);
      expect(body.data.poolId).toBe(null);

      const analysis = body.data.analysis;
      expect(analysis.totalILUsd).toBeDefined();
      expect(analysis.avgILPercent).toBeDefined();
      expect(Array.isArray(analysis.positions)).toBe(true);

      // Validate decimal serialization
      expect(typeof analysis.totalILUsd).toBe('string');
      expect(typeof analysis.avgILPercent).toBe('string');

      if (analysis.positions.length > 0) {
        const position = analysis.positions[0];
        expect(typeof position.currentValue).toBe('string');
        expect(typeof position.hodlValue).toBe('string');
        expect(typeof position.ilUsd).toBe('string');
        expect(typeof position.ilPercent).toBe('string');
        expect(typeof position.feesEarned).toBe('string');
        expect(typeof position.netPnl).toBe('string');
      }
    });

    it('should filter by specific pool when provided', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}/impermanent-loss?poolId=${seededData.pools.pool1.id}&days=14`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.poolId).toBe(seededData.pools.pool1.id);
      expect(body.data.days).toBe(14);
    });

    it('should handle invalid days parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}/impermanent-loss?days=invalid`,
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid days parameter');
    });

    it('should handle negative days parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}/impermanent-loss?days=-5`,
      });

      expect(response.statusCode).toBe(400);
    });

    it('should default to 7 days when not specified', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}/impermanent-loss`,
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.days).toBe(7);
    });
  });

  describe('GET /v1/liquidity/gammaswap/utilization', () => {
    it('should return utilization metrics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/gammaswap/utilization',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();

      const utilization = body.data.utilization;
      expect(utilization.avgUtilization).toBeDefined();
      expect(Array.isArray(utilization.highUtilizationPools)).toBe(true);
      expect(Array.isArray(utilization.liquidationRisk)).toBe(true);

      // Validate decimal serialization
      expect(typeof utilization.avgUtilization).toBe('string');

      if (utilization.liquidationRisk.length > 0) {
        const risk = utilization.liquidationRisk[0];
        expect(typeof risk.utilization).toBe('string');
        expect(typeof risk.healthRatio).toBe('string');
        expect(['critical', 'warning', 'healthy']).toContain(risk.riskLevel);
      }
    });

    it('should handle empty pool data gracefully', async () => {
      // Clear pool data for this test
      await testDb.prisma.gammaswapPosition.deleteMany();
      await testDb.prisma.gammaswapPool.deleteMany();

      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/gammaswap/utilization',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      const utilization = body.data.utilization;
      expect(utilization.avgUtilization).toBe('0');
      expect(utilization.highUtilizationPools).toHaveLength(0);
      expect(utilization.liquidationRisk).toHaveLength(0);
    });
  });

  describe('GET /v1/liquidity/pools/top', () => {
    it('should return top pools with default parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/pools/top',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data).toBeDefined();
      expect(Array.isArray(body.data.pools)).toBe(true);
      expect(body.data.sortBy).toBe('tvl'); // default
      expect(body.data.limit).toBe(10); // default

      expect(body.meta.count).toBeDefined();
      expect(body.meta.generatedAt).toBeDefined();

      if (body.data.pools.length > 0) {
        const pool = body.data.pools[0];
        expect(pool.id).toBeDefined();
        expect(pool.symbol).toBeDefined();
        expect(pool.protocol).toBeDefined();
        expect(pool.baseToken).toBeDefined();
        expect(pool.quoteToken).toBeDefined();

        // Validate decimal serialization
        expect(typeof pool.tvl).toBe('string');
        expect(typeof pool.utilization).toBe('string');
        expect(typeof pool.supplyApr).toBe('string');
        expect(typeof pool.borrowApr).toBe('string');
        expect(typeof pool.volume24h).toBe('string');
      }
    });

    it('should handle custom limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/pools/top?limit=5',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.limit).toBe(5);
      expect(body.data.pools.length).toBeLessThanOrEqual(5);
    });

    it('should handle custom sortBy parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/pools/top?sortBy=apy',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.data.sortBy).toBe('apy');
    });

    it('should validate limit parameter bounds', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/pools/top?limit=100', // > 50 max
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid limit parameter');
    });

    it('should handle invalid limit parameter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/liquidity/pools/top?limit=invalid',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle database connection errors gracefully', async () => {
      // Mock a database error by closing the connection
      await testDb.prisma.$disconnect();

      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}`,
      });

      expect(response.statusCode).toBe(500);

      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();

      // Reconnect for other tests
      await testDb.prisma.$connect();
    });

    it('should handle concurrent requests correctly', async () => {
      const requests = Array(5).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}`,
        })
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.body);
        expect(body.data.walletId).toBe(seededData.wallets.wallet1.id);
      });
    });

    it('should handle large dataset performance', async () => {
      // Create many positions for performance testing
      const positions = Array(50).fill(null).map((_, i) =>
        testDb.createTestGammaswapPosition({
          walletId: seededData.wallets.wallet1.id,
          poolId: seededData.pools.pool1.id,
          notional: (1000 + i * 100).toString(),
          healthRatio: (1.5 + i * 0.1).toString(),
          debtValue: (500 + i * 50).toString(),
        })
      );

      await Promise.all(positions);

      const startTime = Date.now();
      const response = await app.inject({
        method: 'GET',
        url: `/v1/liquidity/wallets/${seededData.wallets.wallet1.id}`,
      });
      const endTime = Date.now();

      expect(response.statusCode).toBe(200);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds

      const body = JSON.parse(response.body);
      expect(body.data.metrics.poolCount).toBeGreaterThan(50);
    });
  });
});
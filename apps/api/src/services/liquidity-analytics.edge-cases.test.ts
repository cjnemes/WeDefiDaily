import { describe, it, expect, beforeEach, vi } from 'vitest';
import Decimal from 'decimal.js';
import { LiquidityAnalyticsService } from './liquidity-analytics-simple';
import type { PrismaClient } from '@prisma/client';

// Mock Prisma client
const mockPrisma = vi.hoisted(() => ({
  gammaswapPosition: {
    findMany: vi.fn(),
  },
  gammaswapPool: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  positionSnapshot: {
    findMany: vi.fn(),
  },
  transaction: {
    findMany: vi.fn(),
  },
  tokenBalance: {
    findMany: vi.fn(),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

describe('LiquidityAnalyticsService - Edge Cases', () => {
  let service: LiquidityAnalyticsService;
  const walletId = 'test-wallet-id';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LiquidityAnalyticsService(mockPrisma as unknown as PrismaClient);
  });

  describe('Decimal precision and edge cases', () => {
    it('should handle very large decimal values correctly', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('999999999999999999999999.123456789'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('1000000000000000000000000'),
            utilization: new Decimal('0.999999999'),
            supplyRateApr: new Decimal('999.999999'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity.toString()).toBe('999999999999999999999999.123456789');
      expect(result.poolCount).toBe(1);
      expect(result.topPools[0].riskScore.toNumber()).toBeLessThanOrEqual(100);
    });

    it('should handle very small decimal values correctly', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('0.000000000000000001'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('0.000000001'),
            utilization: new Decimal('0.000000001'),
            supplyRateApr: new Decimal('0.000001'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity.toString()).toBe('0.000000000000000001');
      expect(result.poolCount).toBe(1);
    });

    it('should handle zero values gracefully', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('0'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('0'),
            utilization: new Decimal('0'),
            supplyRateApr: new Decimal('0'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity.toString()).toBe('0');
      expect(result.poolCount).toBe(1);
      expect(result.topPools[0].userShare.toString()).toBe('0');
      expect(result.topPools[0].riskScore.toNumber()).toBeGreaterThan(0); // Should still have some risk
    });

    it('should handle division by zero scenarios', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('0'), // Zero TVL should not cause division error
            utilization: new Decimal('0.5'),
            supplyRateApr: new Decimal('5'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity.toString()).toBe('1000');
      expect(result.topPools[0].userShare.toString()).toBe('0'); // Should handle gracefully
    });
  });

  describe('Error resilience', () => {
    it('should handle corrupted position data', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: 'invalid-decimal-string', // Corrupted data
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('100000'),
            utilization: new Decimal('0.5'),
            supplyRateApr: new Decimal('5'),
          },
        },
        {
          id: 'pos2',
          poolId: 'pool2',
          notional: new Decimal('2000'), // Valid position
          pool: {
            id: 'pool2',
            baseSymbol: 'BTC',
            quoteSymbol: 'USDC',
            tvl: new Decimal('200000'),
            utilization: new Decimal('0.6'),
            supplyRateApr: new Decimal('4'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      // Should skip corrupted position and process valid one
      expect(result.poolCount).toBe(1);
      expect(result.totalLiquidity.toString()).toBe('2000');
      expect(result.topPools).toHaveLength(1);
      expect(result.topPools[0].symbol).toBe('BTC/USDC');
    });

    it('should handle partially null pool data', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: null, // Null values
            utilization: null,
            supplyRateApr: null,
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.poolCount).toBe(1);
      expect(result.topPools[0].tvl.toString()).toBe('0');
      expect(result.topPools[0].utilization.toString()).toBe('0');
      expect(result.topPools[0].apy.toString()).toBe('0');
    });

    it('should handle database timeout gracefully', async () => {
      mockPrisma.tokenBalance.findMany.mockRejectedValue(new Error('Database timeout'));

      await expect(service.getLiquidityMetrics(walletId)).rejects.toThrow('Database timeout');
    });

    it('should handle memory pressure with large datasets', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      // Create a large number of positions to test memory handling
      const mockPositions = Array(10000).fill(null).map((_, i) => ({
        id: `pos${i}`,
        poolId: `pool${i % 100}`,
        notional: new Decimal((1000 + i).toString()),
        pool: {
          id: `pool${i % 100}`,
          baseSymbol: 'ETH',
          quoteSymbol: 'USDC',
          tvl: new Decimal((100000 + i * 1000).toString()),
          utilization: new Decimal((0.5 + (i % 50) / 100).toString()),
          supplyRateApr: new Decimal((5 + (i % 20)).toString()),
        },
      }));

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.poolCount).toBe(10000);
      expect(result.topPools.length).toBeGreaterThan(0);
      expect(result.totalLiquidity.greaterThan(0)).toBe(true);
    });
  });

  describe('Slippage edge cases', () => {
    it('should handle extreme slippage scenarios', async () => {
      const mockPool = {
        id: 'pool1',
        tvl: new Decimal('1'), // Extremely low TVL
        utilization: new Decimal('0.99'), // Very high utilization
        baseSymbol: 'ETH',
        quoteSymbol: 'USDC',
        volume24h: new Decimal('0.01'), // Almost no volume
      };

      mockPrisma.gammaswapPool.findMany.mockResolvedValue([mockPool]);

      const amountIn = new Decimal('1000000'); // Large trade relative to TVL
      const result = await service.estimateSlippage('pool1', 'ETH', 'USDC', amountIn);

      expect(result.slippagePercent.toString()).toBe('15'); // Should cap at 15%
      expect(result.confidence).toBe('low');
      expect(result.expectedOutput.lessThan(amountIn)).toBe(true);
    });

    it('should handle pools with zero volume', async () => {
      const mockPool = {
        id: 'pool1',
        tvl: new Decimal('1000000'),
        utilization: new Decimal('0.5'),
        baseSymbol: 'ETH',
        quoteSymbol: 'USDC',
        volume24h: new Decimal('0'), // Zero volume
      };

      mockPrisma.gammaswapPool.findMany.mockResolvedValue([mockPool]);

      const amountIn = new Decimal('1000');
      const result = await service.estimateSlippage('pool1', 'ETH', 'USDC', amountIn);

      expect(result.confidence).toBe('low');
      expect(result.slippagePercent.greaterThan(0)).toBe(true);
    });

    it('should handle invalid trade amounts', async () => {
      const mockPool = {
        id: 'pool1',
        tvl: new Decimal('1000000'),
        utilization: new Decimal('0.5'),
        baseSymbol: 'ETH',
        quoteSymbol: 'USDC',
        volume24h: new Decimal('50000'),
      };

      mockPrisma.gammaswapPool.findMany.mockResolvedValue([mockPool]);

      const amountIn = new Decimal('0'); // Zero amount
      const result = await service.estimateSlippage('pool1', 'ETH', 'USDC', amountIn);

      expect(result.expectedOutput.toString()).toBe('0');
      expect(result.minimumReceived.toString()).toBe('0');
    });
  });

  describe('Impermanent loss edge cases', () => {
    it('should handle positions with no historical data', async () => {
      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);
      mockPrisma.positionSnapshot.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.calculateImpermanentLoss(walletId, 7);

      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].ilUsd.toString()).toBe('0');
      expect(result.positions[0].ilPercent.toString()).toBe('0');
    });

    it('should handle corrupted snapshot data', async () => {
      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
          },
        },
      ];

      const mockSnapshots = [
        {
          usdValue: 'invalid-decimal', // Corrupted snapshot
          capturedAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);
      mockPrisma.positionSnapshot.findMany.mockResolvedValue(mockSnapshots);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.calculateImpermanentLoss(walletId, 7);

      // Should handle gracefully and default to current value
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].hodlValue.toString()).toBe('1000');
    });

    it('should handle extreme time ranges', async () => {
      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);
      mockPrisma.positionSnapshot.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      // Test with very large time range
      const result = await service.calculateImpermanentLoss(walletId, 36500); // 100 years

      expect(result.positions).toHaveLength(1);
      expect(result.totalILUsd.toString()).toBe('0');
    });
  });

  describe('Risk score edge cases', () => {
    it('should handle extreme TVL values for risk calculation', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('1'), // Extremely low TVL
            utilization: new Decimal('0.99'), // Very high utilization
            supplyRateApr: new Decimal('200'), // Extremely high APY
          },
        },
        {
          id: 'pos2',
          poolId: 'pool2',
          notional: new Decimal('1000'),
          pool: {
            id: 'pool2',
            baseSymbol: 'BTC',
            quoteSymbol: 'USDC',
            tvl: new Decimal('999999999999'), // Extremely high TVL
            utilization: new Decimal('0.01'), // Very low utilization
            supplyRateApr: new Decimal('0.01'), // Extremely low APY
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      const highRiskPool = result.topPools.find(p => p.tvl.toString() === '1');
      const lowRiskPool = result.topPools.find(p => p.tvl.toString() === '999999999999');

      expect(highRiskPool?.riskScore.toNumber()).toBeGreaterThan(lowRiskPool?.riskScore.toNumber() || 0);
      expect(highRiskPool?.riskScore.toNumber()).toBeLessThanOrEqual(100);
      expect(lowRiskPool?.riskScore.toNumber()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Utilization edge cases', () => {
    it('should handle positions with invalid health ratios', async () => {
      const mockPools = [
        {
          id: 'pool1',
          utilization: new Decimal('0.5'),
        },
      ];

      const mockPositions = [
        {
          poolId: 'pool1',
          healthRatio: null, // Invalid health ratio
          pool: {
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            utilization: new Decimal('0.5'),
          },
        },
        {
          poolId: 'pool1',
          healthRatio: new Decimal('-1'), // Negative health ratio
          pool: {
            baseSymbol: 'BTC',
            quoteSymbol: 'USDC',
            utilization: new Decimal('0.7'),
          },
        },
      ];

      mockPrisma.gammaswapPool.findMany.mockResolvedValue(mockPools);
      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getGammaswapUtilization();

      // Should handle gracefully and skip invalid positions
      expect(result.liquidationRisk).toHaveLength(0);
      expect(result.avgUtilization.toString()).toBe('0.5');
    });
  });
});
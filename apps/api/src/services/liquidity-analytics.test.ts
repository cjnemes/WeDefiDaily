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

describe('LiquidityAnalyticsService', () => {
  let service: LiquidityAnalyticsService;
  const walletId = 'test-wallet-id';
  const poolId = 'test-pool-id';

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LiquidityAnalyticsService(mockPrisma as unknown as PrismaClient);
  });

  describe('getLiquidityMetrics', () => {
    it('should return liquidity metrics for a wallet', async () => {
      // Mock LP token balances (empty for this test, focusing on Gammaswap positions)
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      // Mock Gammaswap positions
      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: new Decimal('1000'),
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('100000'),
            utilization: new Decimal('0.75'),
            supplyRateApr: new Decimal('5.5'),
          },
        },
        {
          id: 'pos2',
          poolId: 'pool2',
          notional: new Decimal('2000'),
          pool: {
            id: 'pool2',
            baseSymbol: 'BTC',
            quoteSymbol: 'USDC',
            tvl: new Decimal('200000'),
            utilization: new Decimal('0.60'),
            supplyRateApr: new Decimal('4.2'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity).toEqual(new Decimal('3000'));
      expect(result.poolCount).toBe(2);
      expect(result.avgUtilization.toNumber()).toBeCloseTo(0.675, 3);
      expect(result.topPools).toHaveLength(2);
      expect(result.topPools[0].symbol).toBe('BTC/USDC');
      expect(result.topPools[0].userShare.toNumber()).toBeCloseTo(0.01, 2);
    });

    it('should handle empty positions', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);
      mockPrisma.gammaswapPosition.findMany.mockResolvedValue([]);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity).toEqual(new Decimal('0'));
      expect(result.poolCount).toBe(0);
      expect(result.avgUtilization).toEqual(new Decimal('0'));
      expect(result.topPools).toHaveLength(0);
    });

    it('should handle missing pool data gracefully', async () => {
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
            tvl: null,
            utilization: null,
            supplyRateApr: null,
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getLiquidityMetrics(walletId);

      expect(result.totalLiquidity).toEqual(new Decimal('1000'));
      expect(result.poolCount).toBe(1);
      expect(result.topPools[0].tvl).toEqual(new Decimal('0'));
      expect(result.topPools[0].utilization).toEqual(new Decimal('0'));
      expect(result.topPools[0].apy).toEqual(new Decimal('0'));
    });
  });

  describe('estimateSlippage', () => {
    it('should estimate slippage for a trade', async () => {
      const mockPool = {
        id: poolId,
        tvl: new Decimal('1000000'),
        utilization: new Decimal('0.5'),
        baseSymbol: 'ETH',
        quoteSymbol: 'USDC',
        volume24h: new Decimal('50000'),
      };

      // Mock findMany to return pools for token pair lookup
      mockPrisma.gammaswapPool.findMany.mockResolvedValue([mockPool]);
      mockPrisma.gammaswapPool.findUnique.mockResolvedValue(mockPool);

      const amountIn = new Decimal('10000');
      const result = await service.estimateSlippage(poolId, 'ETH', 'USDC', amountIn);

      expect(result.expectedOutput.greaterThan(0)).toBe(true);
      expect(result.slippagePercent.greaterThan(0)).toBe(true);
      expect(result.priceImpact.greaterThan(0)).toBe(true);
      expect(result.minimumReceived.lessThan(result.expectedOutput)).toBe(true);
      expect(['high', 'medium', 'low']).toContain(result.confidence);
    });

    it('should throw error for invalid pool', async () => {
      mockPrisma.gammaswapPool.findMany.mockResolvedValue([]);
      mockPrisma.gammaswapPool.findUnique.mockResolvedValue(null);

      const amountIn = new Decimal('1000');
      await expect(
        service.estimateSlippage('invalid-pool', 'ETH', 'USDC', amountIn)
      ).rejects.toThrow('No liquidity pools found for this pair');
    });

    it('should handle high slippage scenarios', async () => {
      const mockPool = {
        id: poolId,
        tvl: new Decimal('10000'), // Small pool
        utilization: new Decimal('0.9'), // High utilization
        baseSymbol: 'ETH',
        quoteSymbol: 'USDC',
        volume24h: new Decimal('1000'), // Low volume
      };

      mockPrisma.gammaswapPool.findMany.mockResolvedValue([mockPool]);
      mockPrisma.gammaswapPool.findUnique.mockResolvedValue(mockPool);

      const amountIn = new Decimal('5000'); // Large trade relative to TVL
      const result = await service.estimateSlippage(poolId, 'ETH', 'USDC', amountIn);

      expect(result.slippagePercent.greaterThan(5)).toBe(true); // High slippage
      expect(result.confidence).toBe('low'); // Low confidence due to conditions
    });
  });

  describe('calculateImpermanentLoss', () => {
    it('should calculate impermanent loss for LP positions', async () => {
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
          usdValue: new Decimal('1000'),
          capturedAt: new Date('2024-01-01'),
        },
        {
          usdValue: new Decimal('1100'),
          capturedAt: new Date('2024-01-08'),
        },
      ];

      const mockTransactions = [
        {
          transactionType: 'stake',
          amount: new Decimal('0.5'),
          priceUsd: new Decimal('2000'),
          occurredAt: new Date('2024-01-01'),
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);
      mockPrisma.positionSnapshot.findMany.mockResolvedValue(mockSnapshots);
      mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);

      const result = await service.calculateImpermanentLoss(walletId, 7);

      expect(result).toBeDefined();
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].poolId).toBe('pool1');
      expect(result.positions[0].currentValue).toEqual(new Decimal('1000'));
      expect(result.positions[0].hodlValue).toEqual(new Decimal('1000'));
    });

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

      expect(result).toBeDefined();
      expect(result.positions).toHaveLength(1);
      expect(result.positions[0].currentValue).toEqual(new Decimal('1000'));
      expect(result.positions[0].hodlValue).toEqual(new Decimal('1000'));
      expect(result.positions[0].ilUsd).toEqual(new Decimal('0'));
    });

    it('should filter by specific pool when provided', async () => {
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

      await service.calculateImpermanentLoss(walletId, 7, 'pool1');

      expect(mockPrisma.gammaswapPosition.findMany).toHaveBeenCalledWith({
        where: {
          walletId,
          poolId: 'pool1',
        },
        include: {
          pool: {
            select: {
              baseSymbol: true,
              quoteSymbol: true,
            },
          },
        },
      });
    });
  });

  describe('getGammaswapUtilization', () => {
    it('should return utilization metrics', async () => {
      const mockPools = [
        {
          id: 'pool1',
          baseSymbol: 'ETH',
          quoteSymbol: 'USDC',
          utilization: new Decimal('0.95'), // High utilization
        },
        {
          id: 'pool2',
          baseSymbol: 'BTC',
          quoteSymbol: 'USDC',
          utilization: new Decimal('0.60'), // Normal utilization
        },
      ];

      const mockPositions = [
        {
          poolId: 'pool1',
          healthRatio: new Decimal('1.02'), // Critical < 1.05
          pool: {
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            utilization: new Decimal('0.95'),
          },
        },
        {
          poolId: 'pool2',
          healthRatio: new Decimal('1.8'), // Healthy
          pool: {
            baseSymbol: 'BTC',
            quoteSymbol: 'USDC',
            utilization: new Decimal('0.60'),
          },
        },
      ];

      mockPrisma.gammaswapPool.findMany.mockResolvedValue(mockPools);
      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getGammaswapUtilization();

      expect(result).toBeDefined();
      expect(result.avgUtilization.toNumber()).toBeCloseTo(0.775, 3);
      expect(result.highUtilizationPools).toHaveLength(1);
      expect(result.highUtilizationPools[0]).toBe('pool1');
      expect(result.liquidationRisk).toHaveLength(1);
      expect(result.liquidationRisk[0].riskLevel).toBe('critical');
    });

    it('should handle empty pools and positions', async () => {
      mockPrisma.gammaswapPool.findMany.mockResolvedValue([]);
      mockPrisma.gammaswapPosition.findMany.mockResolvedValue([]);

      const result = await service.getGammaswapUtilization();

      expect(result).toBeDefined();
      expect(result.avgUtilization).toEqual(new Decimal('0'));
      expect(result.highUtilizationPools).toHaveLength(0);
      expect(result.liquidationRisk).toHaveLength(0);
    });

    it('should categorize risk levels correctly', async () => {
      const mockPositions = [
        {
          poolId: 'pool1',
          healthRatio: new Decimal('1.02'), // Critical < 1.05
          pool: { baseSymbol: 'ETH', quoteSymbol: 'USDC', utilization: new Decimal('0.8') },
        },
        {
          poolId: 'pool2',
          healthRatio: new Decimal('1.15'), // Warning < 1.2
          pool: { baseSymbol: 'BTC', quoteSymbol: 'USDC', utilization: new Decimal('0.7') },
        },
        {
          poolId: 'pool3',
          healthRatio: new Decimal('2.5'), // Healthy >= 1.2
          pool: { baseSymbol: 'LINK', quoteSymbol: 'USDC', utilization: new Decimal('0.6') },
        },
      ];

      mockPrisma.gammaswapPool.findMany.mockResolvedValue([]);
      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      const result = await service.getGammaswapUtilization();

      expect(result).toBeDefined();
      expect(result.liquidationRisk).toBeDefined();
      const riskLevels = result.liquidationRisk.map(r => r.riskLevel);
      expect(riskLevels).toContain('critical');
      expect(riskLevels).toContain('warning');
      expect(riskLevels).not.toContain('healthy'); // Healthy positions are filtered out
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.tokenBalance.findMany.mockRejectedValue(new Error('Database error'));

      await expect(service.getLiquidityMetrics(walletId)).rejects.toThrow('Database error');
    });

    it('should handle invalid decimal values', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const mockPositions = [
        {
          id: 'pos1',
          poolId: 'pool1',
          notional: 'invalid-decimal',
          pool: {
            id: 'pool1',
            baseSymbol: 'ETH',
            quoteSymbol: 'USDC',
            tvl: new Decimal('100000'),
            utilization: new Decimal('0.75'),
            supplyRateApr: new Decimal('5.5'),
          },
        },
      ];

      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      // Should handle gracefully and skip invalid positions
      const result = await service.getLiquidityMetrics(walletId);
      expect(result.poolCount).toBe(0);
    });
  });

  describe('calculateRiskScore', () => {
    it('should calculate risk scores correctly', () => {
      // Test private method via the public interface
      const lowRiskPool = {
        id: 'pool1',
        tvl: new Decimal('1000000'),
        utilization: new Decimal('0.5'),
        supplyRateApr: new Decimal('3'),
      };

      const mediumRiskPool = {
        id: 'pool2',
        tvl: new Decimal('100000'),
        utilization: new Decimal('0.8'),
        supplyRateApr: new Decimal('8'),
      };

      const highRiskPool = {
        id: 'pool3',
        tvl: new Decimal('10000'),
        utilization: new Decimal('0.95'),
        supplyRateApr: new Decimal('15'),
      };

      // Access through getLiquidityMetrics to test risk scoring
      const mockPositions = [
        { id: 'pos1', poolId: 'pool1', notional: new Decimal('1000'), pool: lowRiskPool },
        { id: 'pos2', poolId: 'pool2', notional: new Decimal('1000'), pool: mediumRiskPool },
        { id: 'pos3', poolId: 'pool3', notional: new Decimal('1000'), pool: highRiskPool },
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);
      mockPrisma.gammaswapPosition.findMany.mockResolvedValue(mockPositions);

      return service.getLiquidityMetrics(walletId).then(result => {
        const riskScores = result.topPools.map(p => p.riskScore.toNumber());

        // Low risk should have lower score than high risk
        expect(riskScores[0]).toBeLessThan(riskScores[2]);

        // All risk scores should be between 0 and 100
        riskScores.forEach(score => {
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        });
      });
    });
  });
});
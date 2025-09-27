import { describe, it, expect, beforeEach, afterEach, vi, MockedFunction } from 'vitest';
import { PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  calculatePerformanceMetrics,
  getTokenPriceChanges,
  storePerformanceMetrics,
  getPortfolioHistory,
  calculateAllPerformanceMetrics,
  PerformanceData,
  PriceChange
} from './performance';

// Mock Prisma Client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn()
}));

const mockPrisma = {
  portfolioSnapshot: {
    findMany: vi.fn(),
  },
  transaction: {
    count: vi.fn(),
  },
  tokenBalance: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  priceSnapshot: {
    findFirst: vi.fn(),
  },
  performanceMetric: {
    upsert: vi.fn(),
  },
  wallet: {
    findMany: vi.fn(),
  },
};

// Mock the performance module with prisma instance
vi.mock('./performance', async () => {
  const actual = await vi.importActual('./performance');
  return {
    ...actual,
    prisma: vi.hoisted(() => ({
      portfolioSnapshot: {
        findMany: vi.fn(),
        create: vi.fn(),
      },
      positionSnapshot: {
        findMany: vi.fn(),
      },
      priceSnapshot: {
        findMany: vi.fn(),
      },
      performanceMetric: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      transaction: {
        findMany: vi.fn(),
      },
    })),
  };
});

describe('Performance Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculatePerformanceMetrics', () => {
    it('should return zero metrics when insufficient data', async () => {
      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result).toEqual({
        totalReturn: new Decimal(0),
        totalReturnPercent: new Decimal(0),
        unrealizedPnl: new Decimal(0),
        realizedPnl: new Decimal(0),
        maxDrawdown: new Decimal(0),
        sharpeRatio: new Decimal(0),
        volatility: new Decimal(0),
        winRate: new Decimal(0),
        tradesCount: 0,
      });
    });

    it('should calculate basic return metrics correctly', async () => {
      const snapshots = [
        {
          totalUsdValue: new Decimal(1000),
          capturedAt: new Date('2024-01-01T00:00:00Z'),
        },
        {
          totalUsdValue: new Decimal(1100),
          capturedAt: new Date('2024-01-02T00:00:00Z'),
        },
        {
          totalUsdValue: new Decimal(1200),
          capturedAt: new Date('2024-01-03T00:00:00Z'),
        },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(5);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.totalReturn).toEqual(new Decimal(200)); // 1200 - 1000
      expect(result.totalReturnPercent).toEqual(new Decimal(20)); // (200/1000) * 100
      expect(result.tradesCount).toBe(5);
    });

    it('should calculate volatility from daily returns', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(1100), capturedAt: new Date('2024-01-02') }, // +10%
        { totalUsdValue: new Decimal(990), capturedAt: new Date('2024-01-03') },  // -10%
        { totalUsdValue: new Decimal(1080), capturedAt: new Date('2024-01-04') }, // +9.09%
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.volatility.toNumber()).toBeGreaterThan(0);
      // Volatility should be annualized (multiplied by sqrt(365))
      expect(result.volatility.toNumber()).toBeGreaterThan(100); // Expect high volatility due to large swings
    });

    it('should calculate maximum drawdown correctly', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') }, // Start
        { totalUsdValue: new Decimal(1200), capturedAt: new Date('2024-01-02') }, // Peak
        { totalUsdValue: new Decimal(900), capturedAt: new Date('2024-01-03') },  // Drawdown: (1200-900)/1200 = 25%
        { totalUsdValue: new Decimal(1100), capturedAt: new Date('2024-01-04') }, // Recovery
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.maxDrawdown.toNumber()).toBeCloseTo(25, 1); // Should be ~25%
    });

    it('should calculate Sharpe ratio when volatility exists', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(1050), capturedAt: new Date('2024-01-02') },
        { totalUsdValue: new Decimal(1100), capturedAt: new Date('2024-01-03') },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.sharpeRatio.toNumber()).toBeGreaterThan(0);
      expect(result.totalReturnPercent.toNumber()).toBe(10); // 10% return
    });

    it('should handle zero starting value gracefully', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(0), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(100), capturedAt: new Date('2024-01-02') },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.totalReturnPercent).toEqual(new Decimal(0)); // Should handle division by zero
      expect(result.totalReturn).toEqual(new Decimal(100));
    });

    it('should calculate metrics for different timeframes', async () => {
      const baseDate = new Date('2024-01-01');
      mockPrisma.portfolioSnapshot.findMany.mockImplementation(({ where }) => {
        const startDate = where.capturedAt.gte;
        const daysDiff = Math.floor((baseDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        return Promise.resolve([
          { totalUsdValue: new Decimal(1000), capturedAt: startDate },
          { totalUsdValue: new Decimal(1100), capturedAt: baseDate },
        ]);
      });
      mockPrisma.transaction.count.mockResolvedValue(0);

      const timeframes = ['24h', '7d', '30d', '90d', '1y', 'all'] as const;

      for (const timeframe of timeframes) {
        const result = await calculatePerformanceMetrics('wallet1', timeframe);
        expect(result.totalReturn).toEqual(new Decimal(100));
        expect(result.totalReturnPercent).toEqual(new Decimal(10));
      }
    });

    it('should handle portfolio aggregate (null walletId)', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(1200), capturedAt: new Date('2024-01-02') },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(10);

      const result = await calculatePerformanceMetrics(null, '7d');

      expect(result.totalReturn).toEqual(new Decimal(200));
      expect(result.totalReturnPercent).toEqual(new Decimal(20));
      expect(result.tradesCount).toBe(10);
    });
  });

  describe('getTokenPriceChanges', () => {
    it('should calculate price changes correctly', async () => {
      const mockBalances = [
        {
          token: {
            id: 'token1',
            symbol: 'TEST1',
            priceSnapshots: [
              { priceUsd: new Decimal(100), recordedAt: new Date() }
            ]
          }
        },
        {
          token: {
            id: 'token2',
            symbol: 'TEST2',
            priceSnapshots: [
              { priceUsd: new Decimal(50), recordedAt: new Date() }
            ]
          }
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockBalances);

      // Mock historical prices
      mockPrisma.priceSnapshot.findFirst
        .mockResolvedValueOnce({ priceUsd: new Decimal(80), recordedAt: new Date() }) // token1: 80 -> 100 (+25%)
        .mockResolvedValueOnce({ priceUsd: new Decimal(60), recordedAt: new Date() }); // token2: 60 -> 50 (-16.67%)

      const result = await getTokenPriceChanges('wallet1', '24h');

      expect(result).toHaveLength(2);

      const token1Change = result.find(p => p.tokenId === 'token1');
      expect(token1Change?.changePercent.toNumber()).toBeCloseTo(25, 1);
      expect(token1Change?.changeUsd).toEqual(new Decimal(20));

      const token2Change = result.find(p => p.tokenId === 'token2');
      expect(token2Change?.changePercent.toNumber()).toBeCloseTo(-16.67, 1);
      expect(token2Change?.changeUsd).toEqual(new Decimal(-10));
    });

    it('should sort by change percentage descending', async () => {
      const mockBalances = [
        {
          token: {
            id: 'token1',
            symbol: 'LOW',
            priceSnapshots: [{ priceUsd: new Decimal(105), recordedAt: new Date() }]
          }
        },
        {
          token: {
            id: 'token2',
            symbol: 'HIGH',
            priceSnapshots: [{ priceUsd: new Decimal(120), recordedAt: new Date() }]
          }
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockBalances);
      mockPrisma.priceSnapshot.findFirst
        .mockResolvedValueOnce({ priceUsd: new Decimal(100), recordedAt: new Date() }) // +5%
        .mockResolvedValueOnce({ priceUsd: new Decimal(100), recordedAt: new Date() }); // +20%

      const result = await getTokenPriceChanges('wallet1', '24h');

      expect(result[0].symbol).toBe('HIGH'); // Higher percentage change first
      expect(result[1].symbol).toBe('LOW');
    });

    it('should handle missing historical data', async () => {
      const mockBalances = [
        {
          token: {
            id: 'token1',
            symbol: 'TEST',
            priceSnapshots: [{ priceUsd: new Decimal(100), recordedAt: new Date() }]
          }
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockBalances);
      mockPrisma.priceSnapshot.findFirst.mockResolvedValue(null); // No historical data

      const result = await getTokenPriceChanges('wallet1', '24h');

      expect(result).toHaveLength(0);
    });

    it('should handle missing current price', async () => {
      const mockBalances = [
        {
          token: {
            id: 'token1',
            symbol: 'TEST',
            priceSnapshots: [] // No current price
          }
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockBalances);

      const result = await getTokenPriceChanges('wallet1', '24h');

      expect(result).toHaveLength(0);
    });

    it('should handle zero previous price', async () => {
      const mockBalances = [
        {
          token: {
            id: 'token1',
            symbol: 'TEST',
            priceSnapshots: [{ priceUsd: new Decimal(100), recordedAt: new Date() }]
          }
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockBalances);
      mockPrisma.priceSnapshot.findFirst.mockResolvedValue({
        priceUsd: new Decimal(0),
        recordedAt: new Date()
      });

      const result = await getTokenPriceChanges('wallet1', '24h');

      expect(result).toHaveLength(1);
      expect(result[0].changePercent).toEqual(new Decimal(0));
    });

    it('should calculate changes for different timeframes', async () => {
      const mockBalances = [
        {
          token: {
            id: 'token1',
            symbol: 'TEST',
            priceSnapshots: [{ priceUsd: new Decimal(100), recordedAt: new Date() }]
          }
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockBalances);
      mockPrisma.priceSnapshot.findFirst.mockResolvedValue({
        priceUsd: new Decimal(80),
        recordedAt: new Date()
      });

      const timeframes = ['24h', '7d', '30d'] as const;

      for (const timeframe of timeframes) {
        const result = await getTokenPriceChanges('wallet1', timeframe);
        expect(result).toHaveLength(1);
        expect(result[0].changePercent.toNumber()).toBeCloseTo(25, 1);
      }
    });
  });

  describe('storePerformanceMetrics', () => {
    it('should upsert performance metrics correctly', async () => {
      const mockPerformance: PerformanceData = {
        totalReturn: new Decimal(100),
        totalReturnPercent: new Decimal(10),
        unrealizedPnl: new Decimal(50),
        realizedPnl: new Decimal(25),
        maxDrawdown: new Decimal(5),
        sharpeRatio: new Decimal(1.2),
        volatility: new Decimal(15),
        winRate: new Decimal(60),
        tradesCount: 10,
      };

      mockPrisma.performanceMetric.upsert.mockResolvedValue({});

      await storePerformanceMetrics('wallet1', '7d', mockPerformance);

      expect(mockPrisma.performanceMetric.upsert).toHaveBeenCalledWith({
        where: {
          walletId_timeframe: {
            walletId: 'wallet1',
            timeframe: '7d',
          },
        },
        update: expect.objectContaining({
          totalReturn: new Decimal(100),
          totalReturnPercent: new Decimal(10),
          tradesCount: 10,
        }),
        create: expect.objectContaining({
          walletId: 'wallet1',
          timeframe: '7d',
          totalReturn: new Decimal(100),
          totalReturnPercent: new Decimal(10),
          tradesCount: 10,
        }),
      });
    });

    it('should handle null walletId for aggregate metrics', async () => {
      const mockPerformance: PerformanceData = {
        totalReturn: new Decimal(500),
        totalReturnPercent: new Decimal(5),
        unrealizedPnl: new Decimal(100),
        realizedPnl: new Decimal(50),
        maxDrawdown: new Decimal(10),
        sharpeRatio: new Decimal(0.8),
        volatility: new Decimal(20),
        winRate: new Decimal(55),
        tradesCount: 25,
      };

      mockPrisma.performanceMetric.upsert.mockResolvedValue({});

      await storePerformanceMetrics(null, '30d', mockPerformance);

      expect(mockPrisma.performanceMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            walletId_timeframe: {
              walletId: null,
              timeframe: '30d',
            },
          },
          create: expect.objectContaining({
            walletId: null,
            timeframe: '30d',
          }),
        })
      );
    });
  });

  describe('getPortfolioHistory', () => {
    it('should return portfolio snapshots for timeframe', async () => {
      const mockSnapshots = [
        {
          capturedAt: new Date('2024-01-01'),
          totalUsdValue: new Decimal(1000),
        },
        {
          capturedAt: new Date('2024-01-02'),
          totalUsdValue: new Decimal(1100),
        },
        {
          capturedAt: new Date('2024-01-03'),
          totalUsdValue: new Decimal(1050),
        },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(mockSnapshots);

      const result = await getPortfolioHistory('wallet1', '7d');

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        date: new Date('2024-01-01'),
        value: new Decimal(1000),
      });
      expect(result[2]).toEqual({
        date: new Date('2024-01-03'),
        value: new Decimal(1050),
      });
    });

    it('should handle empty history', async () => {
      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue([]);

      const result = await getPortfolioHistory('wallet1', '24h');

      expect(result).toHaveLength(0);
    });

    it('should query with correct timeframe dates', async () => {
      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue([]);

      await getPortfolioHistory('wallet1', '30d');

      const call = mockPrisma.portfolioSnapshot.findMany.mock.calls[0][0];
      const startDate = call.where.capturedAt.gte;
      const now = new Date();
      const expectedStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(Math.abs(startDate.getTime() - expectedStartDate.getTime())).toBeLessThan(1000);
    });
  });

  describe('calculateAllPerformanceMetrics', () => {
    it('should calculate metrics for all wallets and timeframes', async () => {
      const mockWallets = [
        { id: 'wallet1', address: '0x123' },
        { id: 'wallet2', address: '0x456' },
      ];

      mockPrisma.wallet.findMany.mockResolvedValue(mockWallets);

      // Mock successful calculations
      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue([
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(1100), capturedAt: new Date('2024-01-02') },
      ]);
      mockPrisma.transaction.count.mockResolvedValue(0);
      mockPrisma.performanceMetric.upsert.mockResolvedValue({});

      // Mock console.log to avoid output during tests
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await calculateAllPerformanceMetrics();

      // Should call upsert for each wallet and timeframe combination
      // 2 wallets * 6 timeframes + 1 aggregate * 6 timeframes = 18 calls
      expect(mockPrisma.performanceMetric.upsert).toHaveBeenCalledTimes(18);

      consoleSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('should handle calculation errors gracefully', async () => {
      const mockWallets = [{ id: 'wallet1', address: '0x123' }];

      mockPrisma.wallet.findMany.mockResolvedValue(mockWallets);
      mockPrisma.portfolioSnapshot.findMany.mockRejectedValue(new Error('Database error'));

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await calculateAllPerformanceMetrics();

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
      logSpy.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle Decimal precision correctly', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal('1000.123456789'), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal('1100.987654321'), capturedAt: new Date('2024-01-02') },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.totalReturn.toFixed(9)).toBe('100.864197532');
      expect(result.totalReturnPercent.toFixed(6)).toBe('10.086173');
    });

    it('should handle very small portfolio values', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal('0.000001'), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal('0.000002'), capturedAt: new Date('2024-01-02') },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.totalReturn.toNumber()).toBeCloseTo(0.000001, 6);
      expect(result.totalReturnPercent.toNumber()).toBeCloseTo(100, 1);
    });

    it('should handle extreme volatility scenarios', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(10000), capturedAt: new Date('2024-01-02') }, // 10x gain
        { totalUsdValue: new Decimal(100), capturedAt: new Date('2024-01-03') },   // 99% loss
        { totalUsdValue: new Decimal(5000), capturedAt: new Date('2024-01-04') },  // 50x gain
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.volatility.toNumber()).toBeGreaterThan(1000); // Should be extremely high
      expect(result.maxDrawdown.toNumber()).toBeGreaterThan(90); // Should capture the 99% drawdown
    });

    it('should handle negative portfolio values gracefully', async () => {
      const snapshots = [
        { totalUsdValue: new Decimal(1000), capturedAt: new Date('2024-01-01') },
        { totalUsdValue: new Decimal(-500), capturedAt: new Date('2024-01-02') }, // Negative value
        { totalUsdValue: new Decimal(200), capturedAt: new Date('2024-01-03') },
      ];

      mockPrisma.portfolioSnapshot.findMany.mockResolvedValue(snapshots);
      mockPrisma.transaction.count.mockResolvedValue(0);

      const result = await calculatePerformanceMetrics('wallet1', '7d');

      expect(result.totalReturn.toNumber()).toBe(-800); // 200 - 1000
      expect(result.totalReturnPercent.toNumber()).toBe(-80); // -80%
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  calculateTokenCorrelation,
  calculatePortfolioCorrelationMatrix,
  calculateProtocolExposure,
  calculateVolatilityAnalysis,
  calculateAllRiskAnalytics,
  CorrelationMatrix,
  ProtocolExposureData,
  VolatilityAnalysis
} from './risk-analytics';

const mockPrisma = vi.hoisted(() => ({
  priceSnapshot: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  tokenBalance: {
    findMany: vi.fn(),
    aggregate: vi.fn(),
  },
  assetCorrelation: {
    upsert: vi.fn(),
  },
  protocolExposure: {
    upsert: vi.fn(),
  },
  $queryRaw: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
  Prisma: {
    sql: vi.fn((strings, ...values) => ({ strings, values })),
  },
}));

describe('Risk Analytics Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateTokenCorrelation', () => {
    it('should calculate positive correlation correctly', async () => {
      // Mock price data that moves in the same direction
      const token1Prices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') }, // +10%
        { priceUsd: new Decimal(120), recordedAt: new Date('2024-01-03') }, // +9.09%
        { priceUsd: new Decimal(130), recordedAt: new Date('2024-01-04') }, // +8.33%
      ];

      const token2Prices = [
        { priceUsd: new Decimal(50), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(55), recordedAt: new Date('2024-01-02') }, // +10%
        { priceUsd: new Decimal(60), recordedAt: new Date('2024-01-03') }, // +9.09%
        { priceUsd: new Decimal(65), recordedAt: new Date('2024-01-04') }, // +8.33%
      ];

      mockPrisma.priceSnapshot.findMany
        .mockResolvedValueOnce(token1Prices)
        .mockResolvedValueOnce(token2Prices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(result.correlation.toNumber()).toBeCloseTo(1, 1); // Perfect positive correlation
      expect(result.sampleSize).toBe(3); // 3 daily returns from 4 price points
      expect(result.pValue).toBeTruthy();
    });

    it('should calculate negative correlation correctly', async () => {
      // Mock price data that moves in opposite directions
      const token1Prices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') }, // +10%
        { priceUsd: new Decimal(120), recordedAt: new Date('2024-01-03') }, // +9.09%
        { priceUsd: new Decimal(130), recordedAt: new Date('2024-01-04') }, // +8.33%
      ];

      const token2Prices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(90), recordedAt: new Date('2024-01-02') }, // -10%
        { priceUsd: new Decimal(82), recordedAt: new Date('2024-01-03') }, // -8.89%
        { priceUsd: new Decimal(75), recordedAt: new Date('2024-01-04') }, // -8.54%
      ];

      mockPrisma.priceSnapshot.findMany
        .mockResolvedValueOnce(token1Prices)
        .mockResolvedValueOnce(token2Prices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(result.correlation.toNumber()).toBeLessThan(0); // Negative correlation
      expect(result.sampleSize).toBe(3);
    });

    it('should handle insufficient data', async () => {
      mockPrisma.priceSnapshot.findMany
        .mockResolvedValueOnce([{ priceUsd: new Decimal(100), recordedAt: new Date() }])
        .mockResolvedValueOnce([{ priceUsd: new Decimal(50), recordedAt: new Date() }]);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(result.correlation).toEqual(new Decimal(0));
      expect(result.pValue).toBeNull();
      expect(result.sampleSize).toBe(0);
    });

    it('should handle identical price series', async () => {
      const identicalPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-02') },
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-03') },
      ];

      mockPrisma.priceSnapshot.findMany
        .mockResolvedValue(identicalPrices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(result.correlation.toNumber()).toBe(0); // No correlation when no variance
      expect(result.sampleSize).toBe(2);
    });

    it('should calculate correlation for different timeframes', async () => {
      const baseDate = new Date('2024-01-01');
      const prices = [
        { priceUsd: new Decimal(100), recordedAt: new Date(baseDate.getTime()) },
        { priceUsd: new Decimal(110), recordedAt: new Date(baseDate.getTime() + 24 * 60 * 60 * 1000) },
        { priceUsd: new Decimal(120), recordedAt: new Date(baseDate.getTime() + 48 * 60 * 60 * 1000) },
      ];

      mockPrisma.priceSnapshot.findMany.mockResolvedValue(prices);

      const timeframes = ['7d', '30d', '90d', '1y'] as const;

      for (const timeframe of timeframes) {
        const result = await calculateTokenCorrelation('token1', 'token2', timeframe);
        expect(result.sampleSize).toBeGreaterThanOrEqual(0);

        // Verify correct date filtering
        const calls = mockPrisma.priceSnapshot.findMany.mock.calls;
        const lastCall = calls[calls.length - 1][0];
        expect(lastCall.where.recordedAt.gte).toBeInstanceOf(Date);
      }
    });

    it('should handle extreme price movements', async () => {
      const token1Prices = [
        { priceUsd: new Decimal(1), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(1000000), recordedAt: new Date('2024-01-02') }, // 100,000,000% gain
        { priceUsd: new Decimal(1), recordedAt: new Date('2024-01-03') }, // 99.9999% loss
      ];

      const token2Prices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') }, // 10% gain
        { priceUsd: new Decimal(120), recordedAt: new Date('2024-01-03') }, // 9.09% gain
      ];

      mockPrisma.priceSnapshot.findMany
        .mockResolvedValueOnce(token1Prices)
        .mockResolvedValueOnce(token2Prices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(result.correlation.abs().toNumber()).toBeLessThanOrEqual(1); // Should be valid correlation
      expect(result.sampleSize).toBe(2);
    });
  });

  describe('calculatePortfolioCorrelationMatrix', () => {
    it('should calculate correlation matrix for portfolio tokens', async () => {
      const mockTokenBalances = [
        {
          token: { id: 'token1', symbol: 'ETH' },
          usdValue: new Decimal(1000)
        },
        {
          token: { id: 'token2', symbol: 'BTC' },
          usdValue: new Decimal(800)
        },
        {
          token: { id: 'token3', symbol: 'USDC' },
          usdValue: new Decimal(500)
        }
      ];

      // Mock price data for correlations
      const mockPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') },
        { priceUsd: new Decimal(120), recordedAt: new Date('2024-01-03') },
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockResolvedValue(mockPrices);
      mockPrisma.assetCorrelation.upsert.mockResolvedValue({});

      const result = await calculatePortfolioCorrelationMatrix('wallet1', '30d');

      // Should have 3 pairs: ETH-BTC, ETH-USDC, BTC-USDC
      expect(result.tokenPairs).toHaveLength(3);
      expect(result.timeframe).toBe('30d');
      expect(result.computedAt).toBeInstanceOf(Date);

      // Verify correlations were stored
      expect(mockPrisma.assetCorrelation.upsert).toHaveBeenCalledTimes(3);
    });

    it('should handle single token portfolio', async () => {
      const mockTokenBalances = [
        {
          token: { id: 'token1', symbol: 'ETH' },
          usdValue: new Decimal(1000)
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);

      const result = await calculatePortfolioCorrelationMatrix('wallet1', '30d');

      expect(result.tokenPairs).toHaveLength(0); // No pairs possible with single token
    });

    it('should handle duplicate tokens correctly', async () => {
      // Mock scenario where same token appears multiple times (different balances)
      const mockTokenBalances = [
        {
          token: { id: 'token1', symbol: 'ETH' },
          usdValue: new Decimal(1000)
        },
        {
          token: { id: 'token1', symbol: 'ETH' }, // Same token
          usdValue: new Decimal(500)
        },
        {
          token: { id: 'token2', symbol: 'BTC' },
          usdValue: new Decimal(800)
        }
      ];

      const mockPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') },
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockResolvedValue(mockPrices);
      mockPrisma.assetCorrelation.upsert.mockResolvedValue({});

      const result = await calculatePortfolioCorrelationMatrix('wallet1', '30d');

      // Should only have 1 pair: ETH-BTC (duplicates removed)
      expect(result.tokenPairs).toHaveLength(1);
    });

    it('should handle correlation calculation failures gracefully', async () => {
      const mockTokenBalances = [
        { token: { id: 'token1', symbol: 'ETH' }, usdValue: new Decimal(1000) },
        { token: { id: 'token2', symbol: 'BTC' }, usdValue: new Decimal(800) }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockRejectedValue(new Error('Price data error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await calculatePortfolioCorrelationMatrix('wallet1', '30d');

      expect(result.tokenPairs).toHaveLength(0); // Should handle errors gracefully
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('calculateProtocolExposure', () => {
    it('should calculate protocol exposure correctly', async () => {
      const mockExposureData = [
        {
          protocol_id: 'protocol1',
          protocol_name: 'Uniswap',
          total_exposure: '1000',
        },
        {
          protocol_id: 'protocol2',
          protocol_name: 'Aave',
          total_exposure: '500',
        }
      ];

      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(2000) } // Total portfolio value
      });
      mockPrisma.$queryRaw.mockResolvedValue(mockExposureData);
      mockPrisma.protocolExposure.upsert.mockResolvedValue({});

      const result = await calculateProtocolExposure('wallet1');

      expect(result).toHaveLength(2);

      const uniswapExposure = result.find(p => p.protocolId === 'protocol1');
      expect(uniswapExposure?.exposurePercentage.toNumber()).toBeCloseTo(50, 1); // 1000/2000 * 100
      expect(uniswapExposure?.riskLevel).toBeDefined();

      const aaveExposure = result.find(p => p.protocolId === 'protocol2');
      expect(aaveExposure?.exposurePercentage.toNumber()).toBeCloseTo(25, 1); // 500/2000 * 100
    });

    it('should return empty array for zero portfolio value', async () => {
      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(0) }
      });

      const result = await calculateProtocolExposure('wallet1');

      expect(result).toHaveLength(0);
    });

    it('should calculate risk levels correctly', async () => {
      const mockExposureData = [
        {
          protocol_id: 'low_risk',
          protocol_name: 'Low Risk Protocol',
          total_exposure: '100', // 10% of 1000
        },
        {
          protocol_id: 'high_risk',
          protocol_name: 'High Risk Protocol',
          total_exposure: '600', // 60% of 1000
        }
      ];

      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(1000) }
      });
      mockPrisma.$queryRaw.mockResolvedValue(mockExposureData);
      mockPrisma.protocolExposure.upsert.mockResolvedValue({});

      const result = await calculateProtocolExposure('wallet1');

      const lowRisk = result.find(p => p.protocolId === 'low_risk');
      expect(lowRisk?.riskFactors.concentration).toBe('low'); // < 20%

      const highRisk = result.find(p => p.protocolId === 'high_risk');
      expect(highRisk?.riskFactors.concentration).toBe('critical'); // >= 60%
    });

    it('should handle aggregate portfolio (null walletId)', async () => {
      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(5000) }
      });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await calculateProtocolExposure(null);

      expect(result).toHaveLength(0);
      // Verify query was called with null wallet filter
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    it('should store exposure data in database', async () => {
      const mockExposureData = [
        {
          protocol_id: 'protocol1',
          protocol_name: 'Test Protocol',
          total_exposure: '1000',
        }
      ];

      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(2000) }
      });
      mockPrisma.$queryRaw.mockResolvedValue(mockExposureData);
      mockPrisma.protocolExposure.upsert.mockResolvedValue({});

      await calculateProtocolExposure('wallet1');

      expect(mockPrisma.protocolExposure.upsert).toHaveBeenCalledWith({
        where: {
          walletId_protocolId: {
            walletId: 'wallet1',
            protocolId: 'protocol1',
          },
        },
        update: expect.objectContaining({
          totalExposureUsd: new Decimal(1000),
          exposurePercentage: new Decimal(50),
        }),
        create: expect.objectContaining({
          walletId: 'wallet1',
          protocolId: 'protocol1',
        }),
      });
    });
  });

  describe('calculateVolatilityAnalysis', () => {
    it('should calculate volatility for portfolio tokens', async () => {
      const mockTokenBalances = [
        {
          token: { id: 'token1', symbol: 'ETH' }
        },
        {
          token: { id: 'token2', symbol: 'BTC' }
        }
      ];

      // Mock price data with varying volatility
      const ethPrices = [
        { priceUsd: new Decimal(1000), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(1100), recordedAt: new Date('2024-01-02') }, // +10%
        { priceUsd: new Decimal(990), recordedAt: new Date('2024-01-03') },  // -10%
        { priceUsd: new Decimal(1050), recordedAt: new Date('2024-01-04') }, // +6.06%
      ];

      const btcPrices = [
        { priceUsd: new Decimal(50000), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(51000), recordedAt: new Date('2024-01-02') }, // +2%
        { priceUsd: new Decimal(50500), recordedAt: new Date('2024-01-03') }, // -0.98%
        { priceUsd: new Decimal(50750), recordedAt: new Date('2024-01-04') }, // +0.495%
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany
        .mockResolvedValueOnce(ethPrices)
        .mockResolvedValueOnce(btcPrices);

      const result = await calculateVolatilityAnalysis('wallet1', '30d');

      expect(result).toHaveLength(2);

      const ethAnalysis = result.find(v => v.symbol === 'ETH');
      expect(ethAnalysis?.volatility.toNumber()).toBeGreaterThan(0);
      expect(ethAnalysis?.riskLevel).toBeDefined();

      const btcAnalysis = result.find(v => v.symbol === 'BTC');
      expect(btcAnalysis?.volatility.toNumber()).toBeGreaterThan(0);
      expect(btcAnalysis?.volatility.toNumber()).toBeLessThan(ethAnalysis?.volatility.toNumber() || 0); // BTC should be less volatile in this example
    });

    it('should handle tokens with insufficient price data', async () => {
      const mockTokenBalances = [
        { token: { id: 'token1', symbol: 'NEW' } }
      ];

      // Only one price point
      const newTokenPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockResolvedValue(newTokenPrices);

      const result = await calculateVolatilityAnalysis('wallet1', '30d');

      expect(result).toHaveLength(1);
      expect(result[0].volatility).toEqual(new Decimal(0));
      expect(result[0].upsideDeviation).toBeNull();
      expect(result[0].downsideDeviation).toBeNull();
    });

    it('should calculate upside and downside deviation', async () => {
      const mockTokenBalances = [
        { token: { id: 'token1', symbol: 'TEST' } }
      ];

      // Mix of positive and negative returns
      const testPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') }, // +10%
        { priceUsd: new Decimal(90), recordedAt: new Date('2024-01-03') },  // -18.18%
        { priceUsd: new Decimal(105), recordedAt: new Date('2024-01-04') }, // +16.67%
        { priceUsd: new Decimal(95), recordedAt: new Date('2024-01-05') },  // -9.52%
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockResolvedValue(testPrices);

      const result = await calculateVolatilityAnalysis('wallet1', '30d');

      expect(result).toHaveLength(1);
      expect(result[0].upsideDeviation?.toNumber()).toBeGreaterThan(0);
      expect(result[0].downsideDeviation?.toNumber()).toBeGreaterThan(0);
    });

    it('should categorize risk levels correctly', async () => {
      const mockTokenBalances = [
        { token: { id: 'stable', symbol: 'USDC' } },
        { token: { id: 'volatile', symbol: 'MEME' } }
      ];

      // Low volatility token (stablecoin-like)
      const stablePrices = [
        { priceUsd: new Decimal(1.00), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(1.01), recordedAt: new Date('2024-01-02') }, // +1%
        { priceUsd: new Decimal(0.99), recordedAt: new Date('2024-01-03') }, // -1.98%
      ];

      // High volatility token
      const volatilePrices = [
        { priceUsd: new Decimal(1), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(5), recordedAt: new Date('2024-01-02') }, // +400%
        { priceUsd: new Decimal(0.1), recordedAt: new Date('2024-01-03') }, // -98%
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany
        .mockResolvedValueOnce(stablePrices)
        .mockResolvedValueOnce(volatilePrices);

      const result = await calculateVolatilityAnalysis('wallet1', '30d');

      const stableAnalysis = result.find(v => v.symbol === 'USDC');
      const volatileAnalysis = result.find(v => v.symbol === 'MEME');

      expect(stableAnalysis?.riskLevel).toBe('low');
      expect(volatileAnalysis?.riskLevel).toBe('critical');
    });

    it('should handle different timeframes', async () => {
      const mockTokenBalances = [
        { token: { id: 'token1', symbol: 'ETH' } }
      ];

      const prices = Array.from({ length: 100 }, (_, i) => ({
        priceUsd: new Decimal(1000 + Math.random() * 100),
        recordedAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
      }));

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockResolvedValue(prices);

      const timeframes = ['7d', '30d', '90d', '1y'] as const;

      for (const timeframe of timeframes) {
        const result = await calculateVolatilityAnalysis('wallet1', timeframe);
        expect(result).toHaveLength(1);
        expect(result[0].volatility.toNumber()).toBeGreaterThan(0);
      }
    });
  });

  describe('calculateAllRiskAnalytics', () => {
    it('should calculate comprehensive risk analytics', async () => {
      // Mock correlation matrix data
      const mockTokenBalances = [
        { token: { id: 'token1', symbol: 'ETH' }, usdValue: new Decimal(1000) },
        { token: { id: 'token2', symbol: 'BTC' }, usdValue: new Decimal(800) }
      ];

      const mockPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(110), recordedAt: new Date('2024-01-02') },
      ];

      // Mock protocol exposure data
      const mockExposureData = [
        {
          protocol_id: 'protocol1',
          protocol_name: 'Test Protocol',
          total_exposure: '1000',
        }
      ];

      mockPrisma.tokenBalance.findMany.mockResolvedValue(mockTokenBalances);
      mockPrisma.priceSnapshot.findMany.mockResolvedValue(mockPrices);
      mockPrisma.assetCorrelation.upsert.mockResolvedValue({});
      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(2000) }
      });
      mockPrisma.$queryRaw.mockResolvedValue(mockExposureData);
      mockPrisma.protocolExposure.upsert.mockResolvedValue({});

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await calculateAllRiskAnalytics('wallet1');

      expect(result.correlationMatrix).toBeDefined();
      expect(result.correlationMatrix.tokenPairs).toHaveLength(1); // ETH-BTC pair

      expect(result.protocolExposures).toBeDefined();
      expect(result.protocolExposures).toHaveLength(1);

      expect(result.volatilityAnalysis).toBeDefined();
      expect(result.volatilityAnalysis).toHaveLength(2); // ETH and BTC

      consoleSpy.mockRestore();
    });

    it('should handle aggregate portfolio analytics', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);
      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(0) }
      });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await calculateAllRiskAnalytics(null);

      expect(result.correlationMatrix.tokenPairs).toHaveLength(0);
      expect(result.protocolExposures).toHaveLength(0);
      expect(result.volatilityAnalysis).toHaveLength(0);

      consoleSpy.mockRestore();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle extreme correlation values', async () => {
      // Perfect correlation scenario
      const perfectCorrelationPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(200), recordedAt: new Date('2024-01-02') }, // 2x
        { priceUsd: new Decimal(400), recordedAt: new Date('2024-01-03') }, // 2x
      ];

      mockPrisma.priceSnapshot.findMany.mockResolvedValue(perfectCorrelationPrices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(Math.abs(result.correlation.toNumber())).toBeLessThanOrEqual(1);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.tokenBalance.findMany.mockRejectedValue(new Error('Database error'));

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await calculatePortfolioCorrelationMatrix('wallet1', '30d');

      expect(result.tokenPairs).toHaveLength(0);

      errorSpy.mockRestore();
    });

    it('should handle very large numbers correctly', async () => {
      const largePrices = [
        { priceUsd: new Decimal('999999999999999999'), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal('1000000000000000000'), recordedAt: new Date('2024-01-02') },
      ];

      mockPrisma.priceSnapshot.findMany.mockResolvedValue(largePrices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(Number.isFinite(result.correlation.toNumber())).toBe(true);
    });

    it('should handle zero and negative prices', async () => {
      const problematicPrices = [
        { priceUsd: new Decimal(100), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal(0), recordedAt: new Date('2024-01-02') }, // Zero price
        { priceUsd: new Decimal(-50), recordedAt: new Date('2024-01-03') }, // Negative price
      ];

      mockPrisma.priceSnapshot.findMany.mockResolvedValue(problematicPrices);

      // Should not throw errors
      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(result).toBeDefined();
      expect(Number.isFinite(result.correlation.toNumber())).toBe(true);
    });

    it('should handle precision issues with Decimal calculations', async () => {
      const precisionPrices = [
        { priceUsd: new Decimal('1.123456789123456789'), recordedAt: new Date('2024-01-01') },
        { priceUsd: new Decimal('1.123456789123456790'), recordedAt: new Date('2024-01-02') },
        { priceUsd: new Decimal('1.123456789123456791'), recordedAt: new Date('2024-01-03') },
      ];

      mockPrisma.priceSnapshot.findMany.mockResolvedValue(precisionPrices);

      const result = await calculateTokenCorrelation('token1', 'token2', '7d');

      expect(Number.isFinite(result.correlation.toNumber())).toBe(true);
      expect(result.sampleSize).toBe(2);
    });

    it('should handle empty portfolio gracefully', async () => {
      mockPrisma.tokenBalance.findMany.mockResolvedValue([]);

      const result = await calculateVolatilityAnalysis('wallet1', '30d');

      expect(result).toHaveLength(0);
    });

    it('should handle missing protocol exposure data', async () => {
      mockPrisma.tokenBalance.aggregate.mockResolvedValue({
        _sum: { usdValue: new Decimal(1000) }
      });
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await calculateProtocolExposure('wallet1');

      expect(result).toHaveLength(0);
    });
  });
});

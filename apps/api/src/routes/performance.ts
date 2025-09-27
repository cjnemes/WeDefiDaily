import type { FastifyPluginCallback } from 'fastify';
import { z } from 'zod';
import {
  calculatePerformanceMetrics,
  getTokenPriceChanges,
  getPortfolioHistory,
} from '../services/performance';
import { PrismaClient } from '@prisma/client';

const querySchema = z.object({
  walletId: z.string().uuid().optional(),
  timeframe: z.enum(['24h', '7d', '30d', '90d', '1y', 'all']).optional().default('30d'),
});

const historyQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  timeframe: z.enum(['24h', '7d', '30d', '90d', '1y', 'all']).optional().default('30d'),
});

const priceChangesQuerySchema = z.object({
  walletId: z.string().uuid().optional(),
  timeframe: z.enum(['24h', '7d', '30d']).optional().default('24h'),
});

const prisma = new PrismaClient();

export const performanceRoutes: FastifyPluginCallback = (app, _opts, done) => {
  // Get performance metrics for portfolio or specific wallet
  app.get('/metrics', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const { walletId, timeframe } = parsed.data;

    try {
      // First check if we have cached metrics (only if walletId is provided)
      let cachedMetrics = null;
      if (walletId) {
        cachedMetrics = await prisma.performanceMetric.findUnique({
          where: {
            walletId_timeframe: {
              walletId,
              timeframe,
            },
          },
        });
      }

      if (cachedMetrics &&
          cachedMetrics.computedAt > new Date(Date.now() - 60 * 60 * 1000)) { // 1 hour cache
        return {
          data: {
            walletId: cachedMetrics.walletId || null,
            timeframe: cachedMetrics.timeframe,
            totalReturn: cachedMetrics.totalReturn?.toString(),
            totalReturnPercent: cachedMetrics.totalReturnPercent?.toString(),
            realizedPnl: cachedMetrics.realizedPnl?.toString(),
            unrealizedPnl: cachedMetrics.unrealizedPnl?.toString(),
            sharpeRatio: cachedMetrics.sharpeRatio?.toString(),
            maxDrawdown: cachedMetrics.maxDrawdown?.toString(),
            volatility: cachedMetrics.volatility?.toString(),
            winRate: cachedMetrics.winRate?.toString(),
            tradesCount: cachedMetrics.tradesCount,
            computedAt: cachedMetrics.computedAt,
          },
        };
      }

      // Calculate fresh metrics if not cached or stale
      const performance = await calculatePerformanceMetrics(walletId ?? null, timeframe);

      return {
        data: {
          walletId: walletId ?? null,
          timeframe,
          totalReturn: performance.totalReturn.toString(),
          totalReturnPercent: performance.totalReturnPercent.toString(),
          realizedPnl: performance.realizedPnl.toString(),
          unrealizedPnl: performance.unrealizedPnl.toString(),
          sharpeRatio: performance.sharpeRatio.toString(),
          maxDrawdown: performance.maxDrawdown.toString(),
          volatility: performance.volatility.toString(),
          winRate: performance.winRate.toString(),
          tradesCount: performance.tradesCount,
          computedAt: new Date(),
        },
      };
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return reply.status(500).send({
        error: 'Failed to calculate performance metrics',
      });
    }
  });

  // Get historical portfolio values for charting
  app.get('/history', async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const { walletId, timeframe } = parsed.data;

    try {
      const history = await getPortfolioHistory(walletId ?? null, timeframe);

      return {
        data: history.map(point => ({
          date: point.date,
          value: point.value.toString(),
        })),
        meta: {
          walletId: walletId ?? null,
          timeframe,
          pointsCount: history.length,
        },
      };
    } catch (error) {
      console.error('Failed to get portfolio history:', error);
      return reply.status(500).send({
        error: 'Failed to get portfolio history',
      });
    }
  });

  // Get token price changes
  app.get('/price-changes', async (request, reply) => {
    const parsed = priceChangesQuerySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const { walletId, timeframe } = parsed.data;

    try {
      const priceChanges = await getTokenPriceChanges(walletId ?? null, timeframe);

      return {
        data: priceChanges.map(change => ({
          tokenId: change.tokenId,
          symbol: change.symbol,
          currentPrice: change.currentPrice.toString(),
          previousPrice: change.previousPrice.toString(),
          changePercent: change.changePercent.toString(),
          changeUsd: change.changeUsd.toString(),
        })),
        meta: {
          walletId: walletId ?? null,
          timeframe,
          tokensCount: priceChanges.length,
        },
      };
    } catch (error) {
      console.error('Failed to get price changes:', error);
      return reply.status(500).send({
        error: 'Failed to get price changes',
      });
    }
  });

  // Get portfolio snapshots
  app.get('/snapshots', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid query parameters',
        details: parsed.error.flatten(),
      });
    }

    const { walletId, timeframe } = parsed.data;

    try {
      const now = new Date();
      let startDate: Date;

      switch (timeframe) {
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startDate = new Date(0);
          break;
      }

      const snapshots = await prisma.portfolioSnapshot.findMany({
        where: {
          walletId: walletId ?? null,
          capturedAt: {
            gte: startDate,
          },
        },
        orderBy: {
          capturedAt: 'desc',
        },
        include: {
          positionSnapshots: {
            include: {
              token: {
                select: {
                  symbol: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return {
        data: snapshots.map(snapshot => ({
          id: snapshot.id,
          walletId: snapshot.walletId,
          totalUsdValue: snapshot.totalUsdValue.toString(),
          totalUsdValueChange24h: snapshot.totalUsdValueChange24h?.toString(),
          totalUsdValueChange7d: snapshot.totalUsdValueChange7d?.toString(),
          totalUsdValueChange30d: snapshot.totalUsdValueChange30d?.toString(),
          tokensTracked: snapshot.tokensTracked,
          averageApr: snapshot.averageApr?.toString(),
          capturedAt: snapshot.capturedAt,
          positions: snapshot.positionSnapshots.map(position => ({
            tokenId: position.tokenId,
            tokenSymbol: position.token.symbol,
            tokenName: position.token.name,
            quantity: position.quantity.toString(),
            usdValue: position.usdValue.toString(),
            priceUsd: position.priceUsd.toString(),
            costBasisUsd: position.costBasisUsd?.toString(),
            unrealizedPnlUsd: position.unrealizedPnlUsd?.toString(),
            unrealizedPnlPercent: position.unrealizedPnlPercent?.toString(),
            positionType: position.positionType,
          })),
        })),
        meta: {
          walletId: walletId ?? null,
          timeframe,
          snapshotsCount: snapshots.length,
        },
      };
    } catch (error) {
      console.error('Failed to get portfolio snapshots:', error);
      return reply.status(500).send({
        error: 'Failed to get portfolio snapshots',
      });
    }
  });

  done();
};
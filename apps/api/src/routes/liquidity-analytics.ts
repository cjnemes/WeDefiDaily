import Decimal from 'decimal.js';
import type { FastifyPluginCallback } from 'fastify';
import { LiquidityAnalyticsService } from '../services/liquidity-analytics-simple';

export const liquidityAnalyticsRoutes: FastifyPluginCallback = (app, _opts, done) => {
  const liquidityService = new LiquidityAnalyticsService(app.prisma);

  // Get liquidity metrics for a specific wallet
  app.get<{
    Params: { walletId: string };
  }>('/wallets/:walletId', async (request, reply) => {
    const { walletId } = request.params;

    try {
      const metrics = await liquidityService.getLiquidityMetrics(walletId);

      return reply.send({
        data: {
          walletId,
          metrics: {
            totalLiquidity: metrics.totalLiquidity.toString(),
            poolCount: metrics.poolCount,
            avgUtilization: metrics.avgUtilization.toString(),
            topPools: metrics.topPools.map(pool => ({
              poolId: pool.poolId,
              symbol: pool.symbol,
              tvl: pool.tvl.toString(),
              userShare: pool.userShare.toString(),
              utilization: pool.utilization.toString(),
              apy: pool.apy.toString(),
              riskScore: pool.riskScore.toString()
            })),
            riskDistribution: Object.fromEntries(
              Object.entries(metrics.riskDistribution).map(([key, value]) => [key, value.toString()])
            )
          }
        },
        meta: {
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to fetch liquidity metrics',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get slippage estimates for a potential trade
  app.post<{
    Body: {
      poolId: string;
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
    };
  }>('/slippage', async (request, reply) => {
    const { poolId, tokenIn, tokenOut, amountIn } = request.body;

    try {
      const amountInDecimal = new Decimal(amountIn);
      const slippageEstimate = await liquidityService.estimateSlippage(
        poolId,
        tokenIn,
        tokenOut,
        amountInDecimal
      );

      return reply.send({
        data: {
          poolId,
          tokenIn,
          tokenOut,
          amountIn: amountInDecimal.toString(),
          estimate: {
            expectedOutput: slippageEstimate.expectedOutput.toString(),
            slippagePercent: slippageEstimate.slippagePercent.toString(),
            priceImpact: slippageEstimate.priceImpact.toString(),
            minimumReceived: slippageEstimate.minimumReceived.toString(),
            confidence: slippageEstimate.confidence
          }
        },
        meta: {
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      return reply.status(400).send({
        error: 'Failed to estimate slippage',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get impermanent loss analysis for LP positions
  app.get<{
    Params: { walletId: string };
    Querystring: {
      poolId?: string;
      days?: string;
    };
  }>('/wallets/:walletId/impermanent-loss', async (request, reply) => {
    const { walletId } = request.params;
    const { poolId, days = '7' } = request.query;

    try {
      const daysNum = parseInt(days, 10);
      if (isNaN(daysNum) || daysNum <= 0) {
        return reply.status(400).send({
          error: 'Invalid days parameter',
          message: 'Days must be a positive integer'
        });
      }

      const analysis = await liquidityService.calculateImpermanentLoss(
        walletId,
        daysNum,
        poolId
      );

      return reply.send({
        data: {
          walletId,
          poolId: poolId || null,
          days: daysNum,
          analysis: {
            totalILUsd: analysis.totalILUsd.toString(),
            avgILPercent: analysis.avgILPercent.toString(),
            positions: analysis.positions.map(pos => ({
              poolId: pos.poolId,
              symbol: pos.symbol,
              currentValue: pos.currentValue.toString(),
              hodlValue: pos.hodlValue.toString(),
              ilUsd: pos.ilUsd.toString(),
              ilPercent: pos.ilPercent.toString(),
              feesEarned: pos.feesEarned.toString(),
              netPnl: pos.netPnl.toString()
            }))
          }
        },
        meta: {
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to calculate impermanent loss',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get Gammaswap utilization metrics
  app.get('/gammaswap/utilization', async (_request, reply) => {
    try {
      const utilization = await liquidityService.getGammaswapUtilization();

      return reply.send({
        data: {
          utilization: {
            avgUtilization: utilization.avgUtilization.toString(),
            highUtilizationPools: utilization.highUtilizationPools,
            liquidationRisk: utilization.liquidationRisk.map(risk => ({
              poolId: risk.poolId,
              symbol: risk.symbol,
              utilization: risk.utilization.toString(),
              healthRatio: risk.healthRatio.toString(),
              riskLevel: risk.riskLevel
            }))
          }
        },
        meta: {
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to fetch Gammaswap utilization',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get top liquidity pools across protocols
  app.get('/pools/top', async (request, reply) => {
    const { limit = '10', sortBy = 'tvl' } = request.query as {
      limit?: string;
      sortBy?: 'tvl' | 'apy' | 'volume';
    };

    try {
      const limitNum = parseInt(limit, 10);
      if (isNaN(limitNum) || limitNum <= 0 || limitNum > 50) {
        return reply.status(400).send({
          error: 'Invalid limit parameter',
          message: 'Limit must be between 1 and 50'
        });
      }

      // Query top pools from database
      const pools = await app.prisma.gammaswapPool.findMany({
        include: {
          baseToken: true,
          quoteToken: true,
          protocol: true
        },
        orderBy: sortBy === 'tvl' ? { tvl: 'desc' } :
                 sortBy === 'apy' ? { supplyRateApr: 'desc' } :
                 { volume24h: 'desc' },
        take: limitNum
      });

      const topPools = pools.map(pool => ({
        id: pool.id,
        address: pool.poolAddress,
        protocol: {
          id: pool.protocol.id,
          name: pool.protocol.name,
          slug: pool.protocol.slug
        },
        symbol: `${pool.baseSymbol}/${pool.quoteSymbol}`,
        baseToken: {
          symbol: pool.baseToken.symbol,
          name: pool.baseToken.name
        },
        quoteToken: {
          symbol: pool.quoteToken.symbol,
          name: pool.quoteToken.name
        },
        tvl: pool.tvl?.toString() || '0',
        utilization: pool.utilization?.toString() || '0',
        supplyApr: pool.supplyRateApr?.toString() || '0',
        borrowApr: pool.borrowRateApr?.toString() || '0',
        volume24h: pool.volume24h?.toString() || '0',
        lastSyncAt: pool.lastSyncAt.toISOString()
      }));

      return reply.send({
        data: {
          pools: topPools,
          sortBy,
          limit: limitNum
        },
        meta: {
          count: topPools.length,
          generatedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      return reply.status(500).send({
        error: 'Failed to fetch top pools',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  done();
};
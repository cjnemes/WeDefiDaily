import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';

export interface LiquidityMetrics {
  totalLiquidity: Decimal;
  poolCount: number;
  avgUtilization: Decimal;
  topPools: {
    poolId: string;
    symbol: string;
    tvl: Decimal;
    userShare: Decimal;
    utilization: Decimal;
    apy: Decimal;
    riskScore: Decimal;
  }[];
  riskDistribution: {
    [key: string]: Decimal;
  };
}

export interface SlippageEstimate {
  expectedOutput: Decimal;
  slippagePercent: Decimal;
  priceImpact: Decimal;
  minimumReceived: Decimal;
  confidence: 'high' | 'medium' | 'low';
}

export interface ImpermanentLossAnalysis {
  totalILUsd: Decimal;
  avgILPercent: Decimal;
  positions: {
    poolId: string;
    symbol: string;
    currentValue: Decimal;
    hodlValue: Decimal;
    ilUsd: Decimal;
    ilPercent: Decimal;
    feesEarned: Decimal;
    netPnl: Decimal;
  }[];
}

export interface GammaswapUtilization {
  avgUtilization: Decimal;
  highUtilizationPools: string[];
  liquidationRisk: {
    poolId: string;
    symbol: string;
    utilization: Decimal;
    healthRatio: Decimal;
    riskLevel: 'critical' | 'warning' | 'healthy';
  }[];
}

export class LiquidityAnalyticsService {
  constructor(private prisma: PrismaClient) {}

  async getLiquidityMetrics(walletId: string): Promise<LiquidityMetrics> {
    try {
      const [lpPositions, gammaswapPositions] = await Promise.all([
        this.getUserLiquidityPositions(walletId),
        this.prisma.gammaswapPosition.findMany({
          where: { walletId },
          include: {
            pool: true,
          },
        })
      ]);

      // Pre-filter valid positions for accurate count
      const validPositions = gammaswapPositions.filter(pos => {
        try {
          new Decimal(pos.notional.toString());
          return true;
        } catch {
          return false;
        }
      });

      // Calculate total liquidity across all valid positions
      const totalLiquidity = validPositions.reduce(
        (sum, pos) => sum.add(new Decimal(pos.notional.toString())),
        new Decimal(0)
      );

      const poolCount = validPositions.length;

      // Calculate average utilization
      const avgUtilization = poolCount > 0
        ? validPositions.reduce(
            (sum, pos) => sum.add(pos.pool.utilization ? new Decimal(pos.pool.utilization.toString()) : new Decimal(0)),
            new Decimal(0)
          ).div(poolCount)
        : new Decimal(0);

      // Transform to top pools format
      const topPools = validPositions.map(pos => {
        try {
          const poolTvl = pos.pool.tvl ? new Decimal(pos.pool.tvl.toString()) : new Decimal(0);
          const userLiquidity = new Decimal(pos.notional.toString());
          const userShare = poolTvl.gt(0) ? userLiquidity.div(poolTvl) : new Decimal(0);
          const utilization = pos.pool.utilization ? new Decimal(pos.pool.utilization.toString()) : new Decimal(0);
          const apy = pos.pool.supplyRateApr ? new Decimal(pos.pool.supplyRateApr.toString()) : new Decimal(0);

          return {
            poolId: pos.poolId,
            symbol: `${pos.pool.baseSymbol}/${pos.pool.quoteSymbol}`,
            tvl: poolTvl,
            userShare,
            utilization,
            apy,
            riskScore: this.calculateRiskScore({
              tvl: poolTvl,
              utilization,
              apy,
            }),
          };
        } catch (error) {
          // Skip invalid positions
          return null;
        }
      }).filter(pool => pool !== null).sort((a, b) => b.tvl.comparedTo(a.tvl));

      // Calculate risk distribution
      const riskDistribution: { [key: string]: Decimal } = {
        low: new Decimal(0),
        medium: new Decimal(0),
        high: new Decimal(0),
      };

      topPools.forEach(pool => {
        const risk = pool.riskScore;
        if (risk.lessThan(30)) {
          riskDistribution.low = riskDistribution.low.add(pool.tvl);
        } else if (risk.lessThan(70)) {
          riskDistribution.medium = riskDistribution.medium.add(pool.tvl);
        } else {
          riskDistribution.high = riskDistribution.high.add(pool.tvl);
        }
      });

      return {
        totalLiquidity,
        poolCount,
        avgUtilization,
        topPools,
        riskDistribution,
      };
    } catch (error) {
      throw error;
    }
  }

  async estimateSlippage(
    poolId: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: Decimal
  ): Promise<SlippageEstimate> {
    // Find pools that match the token pair
    const pools = await this.prisma.gammaswapPool.findMany({
      where: {
        OR: [
          { baseSymbol: tokenIn, quoteSymbol: tokenOut },
          { baseSymbol: tokenOut, quoteSymbol: tokenIn },
        ],
      },
    });

    if (pools.length === 0) {
      throw new Error('No liquidity pools found for this pair');
    }

    // Use the first pool or find by poolId if specified
    const pool = poolId ? pools.find(p => p.id === poolId) || pools[0] : pools[0];
    const poolTvl = pool.tvl ? new Decimal(pool.tvl.toString()) : new Decimal(0);
    const poolUtilization = pool.utilization ? new Decimal(pool.utilization.toString()) : new Decimal(0);
    const poolVolume = pool.volume24h ? new Decimal(pool.volume24h.toString()) : new Decimal(0);

    // Calculate slippage based on trade size relative to pool liquidity
    const tradeRatio = poolTvl.gt(0) ? amountIn.div(poolTvl) : new Decimal(1);

    // Base slippage calculation
    let slippagePercent = tradeRatio.mul(100);

    // Adjust for pool utilization (higher utilization = more slippage)
    if (poolUtilization.gt(0.8)) {
      slippagePercent = slippagePercent.mul(2);
    } else if (poolUtilization.gt(0.6)) {
      slippagePercent = slippagePercent.mul(1.5);
    }

    // Adjust for volume (lower volume = higher slippage)
    const volumeRatio = poolTvl.gt(0) ? poolVolume.div(poolTvl) : new Decimal(0);
    if (volumeRatio.lt(0.1)) {
      slippagePercent = slippagePercent.mul(1.5);
    }

    // Cap slippage at reasonable levels
    slippagePercent = Decimal.min(slippagePercent, new Decimal(15));

    // Calculate outputs
    const expectedOutput = amountIn.mul(new Decimal(1).sub(slippagePercent.div(100)));
    const priceImpact = slippagePercent.mul(0.8); // Price impact is typically lower
    const minimumReceived = expectedOutput.mul(0.995); // 0.5% slippage tolerance

    // Determine confidence based on pool characteristics
    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (poolTvl.lt(100000) || poolUtilization.gt(0.9) || volumeRatio.lt(0.05)) {
      confidence = 'low';
    } else if (poolTvl.lt(500000) || poolUtilization.gt(0.7) || volumeRatio.lt(0.1)) {
      confidence = 'medium';
    }

    return {
      expectedOutput,
      slippagePercent,
      priceImpact,
      minimumReceived,
      confidence,
    };
  }

  async calculateImpermanentLoss(
    walletId: string,
    days: number,
    poolId?: string
  ): Promise<ImpermanentLossAnalysis> {
    const whereClause: any = { walletId };
    if (poolId) {
      whereClause.poolId = poolId;
    }

    const positions = await this.prisma.gammaswapPosition.findMany({
      where: whereClause,
      include: {
        pool: {
          select: {
            baseSymbol: true,
            quoteSymbol: true,
          },
        },
      },
    });

    const analysisPositions = await Promise.all(
      positions.map(async (position) => {
        const currentValue = new Decimal(position.notional.toString());

        // Get historical snapshots for IL calculation
        const snapshots = await this.prisma.positionSnapshot.findMany({
          where: {
            walletId,
            portfolioSnapshot: {
              capturedAt: {
                gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
              },
            },
          },
          orderBy: { portfolioSnapshot: { capturedAt: 'asc' } },
          take: 10,
        });

        // Get transaction history for cost basis
        const transactions = await this.prisma.transaction.findMany({
          where: {
            walletId,
            occurredAt: {
              gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { occurredAt: 'asc' },
        });

        // Calculate HODL value (what the position would be worth if held separately)
        let hodlValue = currentValue;
        if (snapshots.length > 0) {
          const initialSnapshot = snapshots[0];
          hodlValue = new Decimal(initialSnapshot.usdValue.toString());
        } else if (transactions.length > 0) {
          // Use first transaction as entry point
          const entryTx = transactions[0];
          hodlValue = new Decimal(entryTx.amount.toString()).mul(new Decimal(entryTx.priceUsd?.toString() || '0'));
        }

        const ilUsd = hodlValue.sub(currentValue);
        const ilPercent = hodlValue.gt(0) ? ilUsd.div(hodlValue).mul(100) : new Decimal(0);
        const feesEarned = new Decimal(0); // Would calculate from pool fees
        const netPnl = currentValue.sub(hodlValue).add(feesEarned);

        return {
          poolId: position.poolId,
          symbol: `${position.pool.baseSymbol}/${position.pool.quoteSymbol}`,
          currentValue,
          hodlValue,
          ilUsd,
          ilPercent,
          feesEarned,
          netPnl,
        };
      })
    );

    const totalILUsd = analysisPositions.reduce((sum, pos) => sum.add(pos.ilUsd), new Decimal(0));
    const avgILPercent = analysisPositions.length > 0
      ? analysisPositions.reduce((sum, pos) => sum.add(pos.ilPercent), new Decimal(0)).div(analysisPositions.length)
      : new Decimal(0);

    return {
      totalILUsd,
      avgILPercent,
      positions: analysisPositions,
    };
  }

  async getGammaswapUtilization(): Promise<GammaswapUtilization> {
    const [pools, positions] = await Promise.all([
      this.prisma.gammaswapPool.findMany(),
      this.prisma.gammaswapPosition.findMany({
        include: {
          pool: {
            select: {
              baseSymbol: true,
              quoteSymbol: true,
              utilization: true,
            },
          },
        },
      }),
    ]);

    // Calculate average utilization across all pools
    const avgUtilization = pools.length > 0
      ? pools.reduce(
          (sum, pool) => sum.add(pool.utilization ? new Decimal(pool.utilization.toString()) : new Decimal(0)),
          new Decimal(0)
        ).div(pools.length)
      : new Decimal(0);

    // Find high utilization pools (>80%)
    const highUtilizationPools = pools
      .filter(pool => pool.utilization && new Decimal(pool.utilization.toString()).gt(0.8))
      .map(pool => pool.id);

    // Calculate liquidation risk for positions
    const liquidationRisk = positions
      .filter(pos => pos.healthRatio && new Decimal(pos.healthRatio.toString()).lt(1.2))
      .map(pos => {
        const healthRatio = new Decimal(pos.healthRatio?.toString() || '0');
        const utilization = pos.pool.utilization ? new Decimal(pos.pool.utilization.toString()) : new Decimal(0);

        let riskLevel: 'critical' | 'warning' | 'healthy' = 'healthy';
        if (healthRatio.lt(1.05)) {
          riskLevel = 'critical';
        } else if (healthRatio.lt(1.2)) {
          riskLevel = 'warning';
        }

        return {
          poolId: pos.poolId,
          symbol: `${pos.pool.baseSymbol}/${pos.pool.quoteSymbol}`,
          utilization,
          healthRatio,
          riskLevel,
        };
      });

    return {
      avgUtilization,
      highUtilizationPools,
      liquidationRisk,
    };
  }

  private async getUserLiquidityPositions(walletId: string): Promise<any[]> {
    // Query user's LP token balances and calculate positions
    const lpTokenBalances = await this.prisma.tokenBalance.findMany({
      where: {
        walletId,
        quantity: { gt: 0 },
      },
      include: {
        token: true,
        wallet: true,
      },
    });

    // For now, return empty array since LP token analysis is complex
    return [];
  }

  private calculateRiskScore(params: {
    tvl: Decimal;
    utilization: Decimal;
    apy: Decimal;
  }): Decimal {
    const { tvl, utilization, apy } = params;

    let riskScore = new Decimal(0);

    // TVL risk (lower TVL = higher risk)
    if (tvl.lessThan(10000)) {
      riskScore = riskScore.add(40); // Very low TVL
    } else if (tvl.lessThan(100000)) {
      riskScore = riskScore.add(25); // Low TVL
    } else if (tvl.lessThan(1000000)) {
      riskScore = riskScore.add(10); // Medium TVL
    }
    // High TVL (>1M) adds no risk

    // Utilization risk (very high utilization = higher risk)
    if (utilization.greaterThan(0.9)) {
      riskScore = riskScore.add(30); // Very high utilization
    } else if (utilization.greaterThan(0.8)) {
      riskScore = riskScore.add(15); // High utilization
    } else if (utilization.greaterThan(0.7)) {
      riskScore = riskScore.add(5); // Medium-high utilization
    }

    // APY risk (extremely high APY often indicates higher risk)
    if (apy.greaterThan(50)) {
      riskScore = riskScore.add(25); // Very high APY
    } else if (apy.greaterThan(20)) {
      riskScore = riskScore.add(15); // High APY
    } else if (apy.greaterThan(10)) {
      riskScore = riskScore.add(5); // Medium APY
    }

    // Cap at 100
    return Decimal.min(riskScore, new Decimal(100));
  }
}
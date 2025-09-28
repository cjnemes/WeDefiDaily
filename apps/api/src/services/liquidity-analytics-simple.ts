import Decimal from 'decimal.js';
import { PrismaClient } from '@prisma/client';

Decimal.set({
  precision: 50,
  toExpNeg: -50,
  toExpPos: 50,
});

function toDecimal(value: unknown): Decimal | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Decimal) {
    return value;
  }

  try {
    if (typeof value === 'bigint') {
      return new Decimal(value.toString());
    }

    if (typeof value === 'number' || typeof value === 'string') {
      return new Decimal(value);
    }

    if (typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
      return new Decimal(value.toString());
    }
  } catch (error) {
    return null;
  }

  return null;
}

function ensureDecimal(value: unknown, fallback = new Decimal(0)): Decimal {
  const parsed = toDecimal(value);
  return parsed ?? fallback;
}

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
      const validPositions = gammaswapPositions.filter((pos) => toDecimal(pos.notional));

      // Calculate total liquidity across all valid positions
      const totalLiquidity = validPositions.reduce((sum, pos) => {
        const notional = toDecimal(pos.notional);
        return notional ? sum.add(notional) : sum;
      }, new Decimal(0));

      const poolCount = validPositions.length;

      // Calculate average utilization
      const avgUtilization = poolCount > 0
        ? validPositions.reduce((sum, pos) => {
            const utilization = toDecimal(pos.pool.utilization);
            return utilization ? sum.add(utilization) : sum;
          }, new Decimal(0)).div(poolCount)
        : new Decimal(0);

      // Transform to top pools format
      const topPools = validPositions
        .map((pos) => {
          const poolTvl = toDecimal(pos.pool.tvl) ?? new Decimal(0);
          const userLiquidity = toDecimal(pos.notional);
          const utilization = toDecimal(pos.pool.utilization) ?? new Decimal(0);
          const apy = toDecimal(pos.pool.supplyRateApr) ?? new Decimal(0);

          if (!userLiquidity) {
            return null;
          }

          const userShare = poolTvl.gt(0) ? userLiquidity.div(poolTvl) : new Decimal(0);

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
        })
        .filter((pool): pool is NonNullable<typeof pool> => pool !== null)
        .sort((a, b) => b.tvl.comparedTo(a.tvl));

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
        const currentValue = toDecimal(position.notional);

        if (!currentValue) {
          return null;
        }

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
        let hodlValue: Decimal | null = currentValue;
        if (snapshots.length > 0) {
          const initialSnapshot = snapshots[0];
          hodlValue = toDecimal(initialSnapshot.usdValue);
        } else if (transactions.length > 0) {
          // Use first transaction as entry point
          const entryTx = transactions[0];
          const amount = toDecimal(entryTx.amount);
          const price = toDecimal(entryTx.priceUsd ?? 0);
          hodlValue = amount && price ? amount.mul(price) : null;
        }

        hodlValue = hodlValue ?? currentValue;

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

    const validAnalysisPositions = analysisPositions.filter(
      (position): position is NonNullable<typeof position> => position !== null
    );

    if (validAnalysisPositions.length === 0) {
      return {
        totalILUsd: new Decimal(0),
        avgILPercent: new Decimal(0),
        positions: [],
      };
    }

    const totalILUsd = validAnalysisPositions.reduce((sum, pos) => sum.add(pos.ilUsd), new Decimal(0));
    const avgILPercent = validAnalysisPositions.length > 0
      ? validAnalysisPositions.reduce((sum, pos) => sum.add(pos.ilPercent), new Decimal(0)).div(validAnalysisPositions.length)
      : new Decimal(0);

    return {
      totalILUsd,
      avgILPercent,
      positions: validAnalysisPositions,
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
      ? pools.reduce((sum, pool) => {
          const utilization = toDecimal(pool.utilization);
          return utilization ? sum.add(utilization) : sum;
        }, new Decimal(0)).div(pools.length)
      : new Decimal(0);

    // Find high utilization pools (>80%)
    const highUtilizationPools = pools
      .filter((pool) => {
        const utilization = toDecimal(pool.utilization);
        return utilization ? utilization.gt(0.8) : false;
      })
      .map(pool => pool.id);

    // Calculate liquidation risk for positions
    const liquidationRisk = positions
      .map((pos) => {
        const healthRatio = toDecimal(pos.healthRatio);
        const utilization = toDecimal(pos.pool.utilization) ?? new Decimal(0);

        if (!healthRatio || !healthRatio.isFinite() || healthRatio.lte(0) || healthRatio.gte(1.2)) {
          return null;
        }

        let riskLevel: 'critical' | 'warning' | 'healthy' = 'warning';
        if (healthRatio.lt(1.05)) {
          riskLevel = 'critical';
        }

        return {
          poolId: pos.poolId,
          symbol: `${pos.pool.baseSymbol}/${pos.pool.quoteSymbol}`,
          utilization,
          healthRatio,
          riskLevel,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

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
